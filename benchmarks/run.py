"""Reproducible ten-shape benchmark plus supplied-house STL parity check.

Run from repository root: .venv/bin/python -m benchmarks.run --output outputs/benchmark
Procedural meshes are explicitly labeled; they never substitute for supplied inputs.
"""
import argparse
import csv
import json
from pathlib import Path
import numpy as np
import trimesh
from lego_builder.cli import convert
from lego_builder.core import ALGORITHM,load_catalog,digest
from lego_builder.export import write_json


def voxel_surface(cells):
    cells=set(cells)
    vertices,faces=[],[]
    sides=[((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)]),
           ((-1,0,0),[(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),
           ((0,1,0),[(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),
           ((0,-1,0),[(0,0,0),(1,0,0),(1,0,1),(0,0,1)]),
           ((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)]),
           ((0,0,-1),[(0,0,0),(0,1,0),(1,1,0),(1,0,0)])]
    for x,y,z in sorted(cells):
        for (dx,dy,dz),corners in sides:
            if (x+dx,y+dy,z+dz) in cells:
                continue
            n=len(vertices)
            vertices.extend([(x+i,y+j,(z+k)*.4) for i,j,k in corners])
            faces.extend([(n,n+1,n+2),(n,n+2,n+3)])
    return trimesh.Trimesh(vertices=vertices,faces=faces,process=True)


def fixtures(folder):
    folder.mkdir(parents=True)
    shapes={"cube":trimesh.creation.box(extents=[8,8,8]),
            "tower":trimesh.creation.box(extents=[4,4,12]),
            "sphere":trimesh.creation.icosphere(subdivisions=2,radius=6),
            "cylinder":trimesh.creation.cylinder(radius=4,height=8,sections=32)}
    shapes["steps"]=voxel_surface((x,y,z) for x in range(12) for y in range(6) for z in range(3*(1+x//3)))
    shapes["arch"]=voxel_surface((x,y,z) for x in range(12) for y in range(4) for z in range(12) if x<3 or x>=9 or z>=9)
    shapes["pyramid"]=voxel_surface((x,y,z) for x in range(12) for y in range(12) for z in range(15) if min(x,y,11-x,11-y)>=z//3)
    results=[]
    for name,mesh in shapes.items():
        path=folder/f"procedural-{name}.obj"
        mesh.export(path)
        results.append((f"procedural-{name}",path,"z","procedural clean fixture"))
    return results


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--sizes",type=int,nargs="+",default=[8,12,16,24])
    args=parser.parse_args(argv)
    if args.output.exists():
        parser.error("Output already exists; choose a new directory")
    args.output.mkdir(parents=True)
    root=Path(__file__).resolve().parents[1]
    refs=root/"references/3d-objects"
    cases=[("supplied-cat",refs/"cat/12221_Cat_v1_l3.obj","z","founder-supplied OBJ"),
           ("supplied-airplane",refs/"airplane/11803_Airplane_v1_l1.obj","z","founder-supplied OBJ"),
           ("supplied-house",refs/"simple_house/house.obj","y","founder-supplied OBJ"),
           ("supplied-house-stl-parity",refs/"simple_house/house.stl","z","alternate encoding, not an independent shape")]
    cases.extend(fixtures(args.output/"procedural-inputs"))
    rows=[]
    for name,path,up,kind in cases:
        for size in args.sizes:
            destination=args.output/f"{name}-{size}"
            report=convert(path,destination,size,up)
            metric=report.get("metrics",{})
            metadata=report["run_metadata"]
            rows.append({"case":name,"kind":kind,"size":size,"passed":report["passed"],
                         "parts":metric.get("parts"),"unique_lots":metric.get("unique_lots"),
                         "runtime_seconds":report["runtime_seconds"],"errors":";".join(report["errors"]),
                         "voxel_iou":metric.get("voxel_iou"),"manual_repairs":metric.get("manual_repairs",0),
                         "revision_id":report.get("revision_id"),
                         "single_stud_supported_parts":metric.get("single_stud_supported_parts"),
                         "partially_supported_parts":metric.get("partially_supported_parts"),
                         "report":str(destination.relative_to(args.output)/"validation.json"),
                         "source_sha256":metadata["input_sha256"],"input_format":metadata["input_format"],
                         "catalog_version":metadata["catalog_version"],"catalog_sha256":metadata["catalog_sha256"],
                         "algorithm_version":metadata["algorithm_version"],"voxelizer":metadata["voxelizer"],
                         "allowed_palette":metadata["allowed_palette"],"source_to_grid_matrix":metadata["source_to_grid_matrix"],
                         "normalization_status":metadata["normalization_status"],"resemblance_review":metadata["resemblance_review"]})
            print(f"{name} size={size}: {'PASS' if report['passed'] else 'FAIL'} {rows[-1]['errors']}",flush=True)
            write_json(args.output/"summary.json",{"cases":rows,"complete":False})
    catalog=load_catalog()
    summary={"catalog_version":catalog["version"],"catalog_sha256":digest(catalog),"algorithm_version":ALGORITHM,"voxelizer":"triangle-box-sat-solid-fill-v1","cases":rows,"complete":True,"distinct_shapes":10,"alternate_format_cases":1,
             "total_candidates":len(rows),"passed_candidates":sum(r["passed"] for r in rows),
             "supplied_obj_success":any(r["passed"] and r["kind"]=="founder-supplied OBJ" for r in rows),
             "studio_import_verified":False,"physical_build_verified":False,
             "manual_resemblance_review":"pending; voxel IoU is not a source-shape resemblance score"}
    write_json(args.output/"summary.json",summary)
    with (args.output/"summary.csv").open("w",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    return 0 if summary["supplied_obj_success"] else 2

if __name__=="__main__":
    raise SystemExit(main())
