import copy
import csv
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
import pytest
import trimesh

from lego_builder.core import digest,inventory,load_catalog,new_model,sequence,validate
from lego_builder.cli import convert
from lego_builder.export import ldraw,publish,validate_ldraw
from lego_builder.mesh import ConversionError,ingest,voxelize
from lego_builder.solver import solve

@pytest.fixture
def catalog():
    return load_catalog()


def placement(pid="p1",part="3001",position=None,yaw=0,color=4):
    return {"id":pid,"part_id":part,"position":position or [0,0,0],"yaw":yaw,"color":color}


def remint(model):
    model["revision_id"]=digest({k:v for k,v in model.items() if k!="revision_id"})
    return model


def test_catalog_provenance_and_known_color(catalog):
    assert 8<=len(catalog["parts"])<=12
    for part in catalog["parts"]:
        assert part["color_evidence"]["color_name"]=="Red"
        assert part["height"] in (1,3)
        assert part["width"]>0 and part["depth"]>0


def test_ldraw_top_origin_and_proper_rotated_footprint(catalog):
    model=new_model([placement(position=[2,3,4]),placement("p2",position=[7,8,9],yaw=90)],catalog,{})
    rows=[line.split() for line in ldraw(model,catalog).splitlines() if line.startswith("1 ")]
    assert rows[0][2:5]==["80","-56","80"]
    assert rows[1][2:5]==["160","-96","200"]
    assert list(map(int,rows[1][5:14]))==[0,0,1,0,1,0,-1,0,0]
    assert round(np.linalg.det(np.array(list(map(int,rows[1][5:14]))).reshape(3,3)))==1
    validate_ldraw(ldraw(model,catalog),model,catalog)
    with pytest.raises(ValueError):
        validate_ldraw(ldraw(model,catalog).replace("-56","-32"),model,catalog)


@pytest.mark.parametrize("change,error",[
    ({"part_id":"invented"},"unknown_part"),({"color":999},"invalid_color"),
    ({"yaw":45},"invalid_orientation"),({"position":[0.5,0,0]},"invalid_position"),
    ({"position":[0,0,-1]},"invalid_position"),({"position":[False,0,0]},"invalid_position")])
def test_invalid_placement_hard_fail(catalog,change,error):
    p=placement();p.update(change)
    report=validate(new_model([p],catalog,{}),catalog)
    assert not report["passed"]
    assert any(error in e for e in report["errors"])


def test_collisions_disconnection_and_floating_are_separate(catalog):
    overlapping=new_model([placement(),placement("p2")],catalog,{})
    assert any(e.startswith("collision") for e in validate(overlapping,catalog)["errors"])
    separated=new_model([placement(),placement("p2",position=[4,0,0])],catalog,{})
    assert "disconnected_assembly" in validate(separated,catalog)["errors"]
    floating=new_model([placement(),placement("p2",position=[4,0,3])],catalog,{})
    assert "unsupported_placement:p2" in validate(floating,catalog)["errors"]


def test_bases_can_be_connected_by_later_bridge(catalog):
    model=new_model([placement(part="3004"),placement("p2",part="3004",position=[2,0,0]),
                     placement("p3",part="3010",position=[0,0,3])],catalog,{})
    assert validate(model,catalog)["passed"]


def test_stud_on_side_is_not_a_connection(catalog):
    model=new_model([placement(part="3005"),placement("p2",part="3005",position=[1,0,1])],catalog,{})
    assert "unsupported_placement:p2" in validate(model,catalog)["errors"]


def test_reverse_steps_rejected(catalog):
    model=new_model([placement(position=[0,0,3]),placement("p2")],catalog,{})
    errors=validate(model,catalog)["errors"]
    assert "non_bottom_up_order:p2" in errors
    assert "blocked_insertion:p2" in errors


def test_revision_inventory_and_sequence_consistency(catalog):
    model=new_model([placement()],catalog,{})
    bom,plan=inventory(model),sequence(model)
    assert validate(model,catalog,bom=bom,plan=plan)["passed"]
    bom["lots"][0]["quantity"]+=1
    plan["steps"]=[]
    report=validate(model,catalog,bom=bom,plan=plan)
    assert {"bom_mismatch","sequence_mismatch"}<=set(report["errors"])
    model["placements"][0]["color"]=1
    assert "revision_checksum" in validate(model,catalog)["errors"]


def test_solver_staggers_and_covers_solid(catalog):
    grid=np.ones((8,4,9),dtype=bool)
    model,report=solve(grid,catalog,{})
    assert report["passed"],report
    assert report["metrics"]["voxel_iou"]==1
    assert len(model["placements"])<grid.sum()/3
    model2,report2=solve(grid,catalog,{})
    assert model==model2 and report==report2


def test_disjoint_target_and_floating_detail_fail(catalog):
    grid=np.zeros((5,1,4),dtype=bool);grid[0,0,:]=1;grid[4,0,3]=1
    model,report=solve(grid,catalog,{})
    assert model is None and not report["passed"]
    assert len(report["attempts"])==4
    assert all(a["uncovered_cells"] for a in report["attempts"])


def test_anisotropic_scale_transform_and_upright(tmp_path):
    path=tmp_path/"box.obj"
    trimesh.creation.box(extents=[4,8,4]).export(path)
    mesh,source=ingest(path)
    grid,metadata=voxelize(mesh,source,8,"y")
    assert grid.shape==(4,4,20)
    assert grid.all()
    matrix=np.array(metadata["source_to_grid_matrix"])
    assert np.linalg.det(matrix[:3,:3])>0


def test_obj_material_paths_not_opened(tmp_path):
    path=tmp_path/"safe.obj"
    path.write_text("mtllib /missing/secret.mtl\n"+trimesh.creation.box().export(file_type="obj"))
    mesh,_=ingest(path)
    assert mesh.is_watertight


def test_open_mesh_has_diagnostics_only(tmp_path):
    path=tmp_path/"open.obj"
    mesh=trimesh.creation.box();mesh.update_faces(np.arange(10));mesh.export(path)
    report=convert(path,tmp_path/"result",8)
    assert not report["passed"] and report["errors"]==["unsuitable_mesh"]
    assert sorted(p.name for p in (tmp_path/"result").iterdir())==["validation.json"]
    process=subprocess.run([sys.executable,"-m","lego_builder","convert",str(path),"--output",str(tmp_path/"cli-result")],capture_output=True,text=True)
    assert process.returncode==2


def test_invalid_and_empty_mesh_diagnostics(tmp_path):
    for index,content in enumerate(("", "v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")):
        path=tmp_path/f"bad{index}.obj";path.write_text(content)
        assert not convert(path,tmp_path/f"result{index}",8)["passed"]


def test_outputs_exact_and_existing_result_never_overwritten(tmp_path,catalog):
    path=tmp_path/"box.stl";trimesh.creation.box(extents=[8,4,3.6]).export(path)
    output=tmp_path/"result"
    report=convert(path,output,8)
    assert report["passed"],report
    model=json.loads((output/"model.json").read_text())
    assert json.loads((output/"bom.json").read_text())==inventory(model)
    assert json.loads((output/"sequence.json").read_text())==sequence(model)
    with (output/"bom.csv").open() as file:
        rows=list(csv.DictReader(file))
    assert sum(int(row["quantity"]) for row in rows)==len(model["placements"])
    assert all(row["revision_id"]==model["revision_id"] for row in rows)
    assert model["revision_id"] in (output/"preview.html").read_text()
    assert model["revision_id"] in (output/"model.ldr").read_text()
    with pytest.raises(FileExistsError):
        convert(path,output,8)
    process=subprocess.run([sys.executable,"-m","lego_builder","validate",str(output)],capture_output=True,text=True)
    assert process.returncode==0,process.stderr+process.stdout
    (output/"bom.csv").write_text((output/"bom.csv").read_text().replace(model["revision_id"],"wrong"))
    process=subprocess.run([sys.executable,"-m","lego_builder","validate",str(output)],capture_output=True,text=True)
    assert process.returncode==2


def test_invalid_model_cannot_publish_success(tmp_path,catalog):
    model=new_model([placement(color=999)],catalog,{})
    with pytest.raises(ValueError):
        publish(tmp_path/"result",model,{"passed":True},catalog)
    assert not (tmp_path/"result").exists()


def test_resource_limits(tmp_path):
    path=tmp_path/"cube.obj";trimesh.creation.box().export(path)
    mesh,source=ingest(path)
    with pytest.raises(ConversionError,match="180,000"):
        voxelize(mesh,source,48)
    assert not convert(path,tmp_path/"invalid-size",1)["passed"]


def test_conservative_surface_keeps_thin_feature_within_declared_grid(tmp_path):
    path=tmp_path/"thin.obj"
    trimesh.creation.box(extents=[8,.1,.1]).export(path)
    mesh,source=ingest(path)
    grid,metadata=voxelize(mesh,source,8)
    assert grid.shape==(8,1,1)
    assert grid.all()
    assert metadata["voxelizer"]=="triangle-box-sat-solid-fill-v1"
    assert "thicken" in metadata["warnings"][0]


def test_conservative_cube_does_not_add_exterior_cell_strip(tmp_path):
    path=tmp_path/"cube.obj"
    trimesh.creation.box(extents=[8,8,8]).export(path)
    mesh,source=ingest(path)
    grid,metadata=voxelize(mesh,source,8)
    assert grid.shape==(8,8,20)
    assert grid.all()
