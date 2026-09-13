"""CLI definitions are the source of truth for supported local operations."""
import argparse
import json
from pathlib import Path
import sys
import time
from .core import load_catalog,validate,digest,ALGORITHM,WEIGHTS,SCHEMA
from .export import publish,validate_ldraw,validate_bom_csv
from .mesh import ConversionError,ingest,voxelize
from .solver import solve


def convert(input_path,output,size=24,up="z"):
    output=Path(output)
    if output.exists():
        raise FileExistsError(f"Output already exists; choose a new directory: {output}")
    start=time.perf_counter()
    catalog=load_catalog()
    source={}
    try:
        mesh,source=ingest(input_path)
        grid,provenance=voxelize(mesh,source,size,up)
        model,report=solve(grid,catalog,provenance)
    except ConversionError as exc:
        model=None
        report={"passed":False,"stage":"mesh_ingestion_or_voxelization","errors":[exc.code],
                "message":str(exc),"details":exc.details,
                "request":{"input":str(input_path),"size":size,"up_axis":up}}
    provenance=model["provenance"] if model is not None else report.get("provenance",{})
    details=report.get("details",{})
    source=provenance.get("source") or source or details.get("source") or details
    report["run_metadata"]={"schema_version":SCHEMA,"catalog_version":catalog["version"],
        "catalog_sha256":digest(catalog),"algorithm_version":ALGORITHM,"voxelizer":"triangle-box-sat-solid-fill-v1",
        "input_format":Path(input_path).suffix.lower().lstrip("."),"input_sha256":source.get("sha256"),
        "allowed_palette":[4],"random_seed":0,"objective_weights":WEIGHTS,
        "search_limits":{"nodes":25000,"depth":250},
        "request":{"size":size,"up_axis":up,"input_name":Path(input_path).name},
        "source_to_grid_matrix":provenance.get("source_to_grid_matrix"),
        "grid_dimensions":provenance.get("grid_dimensions"),
        "normalization_status":"completed" if provenance.get("source_to_grid_matrix") else "not_reached",
        "resemblance_review":"pending_manual_review" if model is not None else "not_reached_no_valid_assembly"}
    report["runtime_seconds"]=round(time.perf_counter()-start,4)
    publish(output,model,report,catalog)
    return report


def main(argv=None):
    parser=argparse.ArgumentParser(description="Local OBJ/STL to validated rectangular LEGO candidate. No physical-build guarantee.")
    sub=parser.add_subparsers(dest="command",required=True)
    command=sub.add_parser("convert",help="Convert geometry and publish a new result directory")
    command.add_argument("input",type=Path)
    command.add_argument("--output",type=Path,required=True,help="New directory; existing results are never overwritten")
    command.add_argument("--size",type=int,default=24,help="Longest physical source dimension in studs, 4–48 (default:24)")
    command.add_argument("--up",choices=("x","y","z"),default="z",help="Source upright axis (default:z)")
    command=sub.add_parser("validate",help="Recheck a result's canonical revision, BOM, sequence and LDraw")
    command.add_argument("output",type=Path)
    args=parser.parse_args(argv)
    try:
        if args.command=="convert":
            report=convert(args.input,args.output,args.size,args.up)
        else:
            model=json.loads((args.output/"model.json").read_text())
            catalog=load_catalog()
            report=validate(model,catalog,bom=json.loads((args.output/"bom.json").read_text()),plan=json.loads((args.output/"sequence.json").read_text()))
            if not report["passed"]:
                print(json.dumps(report,indent=2,sort_keys=True))
                return 2
            for filename,check_name,check in (("model.ldr","ldraw_roundtrip",validate_ldraw), ("bom.csv","csv_inventory",validate_bom_csv)):
                report["checks"].append(check_name)
                try:
                    check((args.output/filename).read_text(),model,catalog)
                except ValueError as exc:
                    report["errors"].append(str(exc))
                    report["passed"]=False
        print(json.dumps(report,indent=2,sort_keys=True))
        return 0 if report["passed"] else 2
    except (OSError,ValueError,KeyError,TypeError) as exc:
        print(f"lego-builder: {exc}",file=sys.stderr)
        return 2
