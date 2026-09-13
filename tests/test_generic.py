"""Behavioral regressions for generic source geometry, never named templates."""
from pathlib import Path
import json
import numpy as np
import pytest
import trimesh
from lego_builder.generic import read_obj,envelope,generate_obj,fit_shell,convert_obj
from lego_builder.mesh import ConversionError


def write_mesh(path,mesh,group='arbitrary object'):
    text=trimesh.exchange.obj.export_obj(mesh,include_normals=False,include_color=False,include_texture=False)
    path.write_text('mtllib ../../do-not-read.mtl\no '+group+'\n'+text)
    return path


def test_name_groups_and_materials_do_not_select_geometry(tmp_path):
    mesh=trimesh.creation.icosphere(subdivisions=1);mesh.apply_scale([1,1.6,.8])
    a=write_mesh(tmp_path/'animal.obj',mesh,'Cat')
    b=write_mesh(tmp_path/'truck.obj',mesh,'Body_Shell_Cube.001')
    ma=generate_obj(a,300,'z',max_trials=3);mb=generate_obj(b,300,'z',max_trials=3)
    assert ma['placements']==mb['placements']
    assert ma['provenance']['source']['sha256']!=mb['provenance']['source']['sha256']
    assert ma['provenance']['exterior_extraction']['semantic_templates_used'] is False
    assert ma['constraints']['target_parts']==300


def test_closed_internal_cube_does_not_change_exterior_or_parts(tmp_path):
    outer=trimesh.creation.box(extents=[4,5,6]);inner=trimesh.creation.box(extents=[1,2,3])
    a=write_mesh(tmp_path/'plain.obj',outer)
    b=write_mesh(tmp_path/'interior-added.obj',trimesh.util.concatenate([outer,inner]))
    ma=generate_obj(a,300,'z',max_trials=3);mb=generate_obj(b,300,'z',max_trials=3)
    assert ma['placements']==mb['placements']
    assert ma['provenance']['source']['triangles']!=mb['provenance']['source']['triangles']


def test_bottle_and_curved_shape_produce_different_actual_geometry(tmp_path):
    profile=np.array([[0,0],[1,0],[1,3],[.4,3.7],[.4,4.5],[0,4.5]])
    bottle=trimesh.creation.revolve(profile,sections=16)
    sphere=trimesh.creation.icosphere(subdivisions=1)
    a=generate_obj(write_mesh(tmp_path/'one.obj',bottle),300,'z',max_trials=3)
    b=generate_obj(write_mesh(tmp_path/'two.obj',sphere),300,'z',max_trials=3)
    assert a['placements']!=b['placements']
    assert a['provenance']['grid_dimensions']!=b['provenance']['grid_dimensions']
    assert len(a['placements'])>100 and len(b['placements'])>100
    assert a['provenance']['fitting']['added_support_or_padding_cells']==0
    for model in (a,b):
        assert 'smooth exposed top tiles' in {p['component'] for p in model['placements']}
        r=np.array(model['provenance']['source_to_ldraw_matrix'])[:3,:3]
        assert np.linalg.det(r)>0


def test_open_source_and_degenerate_faces_are_cleaned_not_rejected(tmp_path):
    mesh=trimesh.creation.box();mesh.update_faces(np.arange(len(mesh.faces)-2))
    path=write_mesh(tmp_path/'open.obj',mesh)
    with path.open('a') as handle:handle.write('f 1 1 1\n')
    read,source=read_obj(path)
    assert source['watertight'] is False
    assert source['repairs']['degenerate_triangles_removed']==1
    model=generate_obj(path,200,'z',max_trials=2)
    assert model['placements']
    assert model['provenance']['exterior_extraction']['closing_radius_cells']==1


@pytest.mark.parametrize('vertex',['nan 0 0','0 inf 0','0 0'])
def test_nonfinite_or_incomplete_obj_is_not_a_substitute_model(tmp_path,vertex):
    path=tmp_path/'bad.obj';path.write_text('v '+vertex+'\nf 1 1 1\n')
    with pytest.raises(ConversionError,match='parse OBJ'):generate_obj(path)


def test_genuine_slope_origin_covers_reserved_2_by_2_footprint():
    solid=np.zeros((4,5,4),dtype=bool);solid[1:3,1:4,:3]=True;solid[1:3,0,:1]=True
    placements,_=fit_shell(solid.copy(),solid,{})
    slope=next(p for p in placements if p['part_id']=='3039')
    matrix=np.array(slope['rotation']).reshape(3,3)
    assert np.linalg.det(matrix)==pytest.approx(1)
    # Official 3039 has asymmetric Z bounds -30..10, corrected by its root origin.
    corners=np.array([[x,0,z] for x in (-20,20) for z in (-30,10)])@matrix.T+np.array(slope['position_ldu'])
    assert np.ptp(corners[:,0])==pytest.approx(40)
    assert np.ptp(corners[:,2])==pytest.approx(40)
    assert np.allclose((corners.min(0)[[0,2]]+np.array([40,50]))%20,0)


def test_resource_limit_remains_bounded(tmp_path):
    path=write_mesh(tmp_path/'shape.obj',trimesh.creation.box())
    mesh,source=read_obj(path)
    with pytest.raises(ConversionError,match='grid exceeds'):envelope(mesh,source,1000)
    with pytest.raises(ConversionError,match='Target parts'):generate_obj(path,10001)


def test_maximum_requested_target_clamps_band_and_rejects_oversize_trials(tmp_path,monkeypatch):
    import lego_builder.generic as generic
    from lego_builder.assembly import validate_candidate
    source=write_mesh(tmp_path/'small.obj',trimesh.creation.box())
    grid=np.ones((2,2,2),dtype=bool)
    def fake_envelope(*args,**kwargs):
        return grid.copy(),grid.copy(),grid.copy(),{'fitting':{'slope_count':0}}
    counts=iter([10500,9800])
    def fake_fit(shell,inferred,metadata):
        count=next(counts)
        placements=[{'id':f'p{i}','part_id':'3024','color':71,'position_ldu':[i*20,0,0],
                     'rotation':[1,0,0,0,1,0,0,0,1],'component':'test'} for i in range(count)]
        return placements,grid.copy()
    monkeypatch.setattr(generic,'envelope',fake_envelope)
    monkeypatch.setattr(generic,'fit_shell',fake_fit)
    monkeypatch.setattr(generic,'continuous_source_distance',lambda *args:{'test_stub':True})
    model=generic.generate_obj(source,10000,'z',max_trials=2)
    assert len(model['placements'])==9800
    assert model['constraints']['target_band']==[9000,10000]
    assert model['constraints']['max_output_parts']==10000
    assert model['provenance']['count_search']['trials'][0]['within_output_cap'] is False
    report=validate_candidate(model)
    assert report['artifact_checks_passed'] and report['target_band_met']
    assert report['max_output_parts']==10000


def test_shared_validator_enforces_hard_output_cap():
    from lego_builder.assembly import SCHEMA,revision,validate_candidate
    placements=[{'id':f'p{i}','part_id':'3024','color':71,'position_ldu':[i*20,0,0],
                 'rotation':[1,0,0,0,1,0,0,0,1]} for i in range(101)]
    model={'schema_version':SCHEMA,'constraints':{'target_parts':100,'target_band':[90,100],
           'target_tolerance':.1,'max_output_parts':100},'placements':placements}
    model['revision_id']=revision(model)
    report=validate_candidate(model)
    assert 'hard_output_piece_limit_exceeded' in report['errors']
    assert 'invalid_or_missing_piece_target_constraints' not in report['errors']
