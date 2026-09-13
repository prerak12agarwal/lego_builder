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
    parser=argparse.ArgumentParser(description="Local OBJ exterior to real LEGO parts and LDraw. Digital candidates require mechanical review.")
    sub=parser.add_subparsers(dest="command",required=True)
    command=sub.add_parser("convert",help="Legacy closed OBJ/STL converter with rectangular connection checks")
    command.add_argument("input",type=Path)
    command.add_argument("--output",type=Path,required=True,help="New directory; existing results are never overwritten")
    command.add_argument("--size",type=int,default=24,help="Longest physical source dimension in studs, 4–48 (default:24)")
    command.add_argument("--up",choices=("x","y","z"),default="z",help="Source upright axis (default:z)")
    command=sub.add_parser("convert-obj",help="Convert arbitrary OBJ exterior geometry to a real-part digital candidate")
    command.add_argument("input",type=Path)
    command.add_argument("--output",type=Path,required=True)
    command.add_argument("--library",type=Path,default=Path(__file__).parent/"data"/"parts-library",help="Official LDraw root; defaults to bundled reviewed subset")
    command.add_argument("--target-parts",type=int,default=2000,help="Useful-part target, 100–10000 (default: 2000)")
    command.add_argument("--up",choices=("x","y","z"),default="y",help="Source upright axis (default: y)")
    command.add_argument("--closing-cells",type=int,choices=(0,1),default=1,help="Maximum source repair radius in grid cells; default1")
    command=sub.add_parser("convert-exterior",help="Fit the named Cybertruck OBJ exterior to real LDraw parts; mechanical checks remain unverified")
    command.add_argument("input",type=Path)
    command.add_argument("--output",type=Path,required=True)
    command.add_argument("--library",type=Path,default=Path(__file__).parent/"data"/"parts-library",help="Official LDraw root; defaults to bundled reviewed subset")
    command.add_argument("--length",type=int,default=60,help="Body length in studs,40–90 (default60)")
    command.add_argument("--tire",choices=("61480","45982"),default="61480",help="Reviewed real tire:61480 (68.7mm) or45982 (81.6mm)")
    command.add_argument("--side-tile-length",type=int,choices=(2,3,4),default=2,help="Maximum side panel tile length in studs")
    command=sub.add_parser("validate",help="Recheck a result's canonical revision, BOM, sequence and LDraw")
    command.add_argument("output",type=Path)
    command.add_argument("--library",type=Path,default=Path(__file__).parent/"data"/"parts-library",help="Official LDraw root; defaults to bundled reviewed subset")
    args=parser.parse_args(argv)
    try:
        if args.command=="convert":
            report=convert(args.input,args.output,args.size,args.up)
        elif args.command=="convert-obj":
            from .generic import convert_obj
            report=convert_obj(args.input,args.output,args.library,args.target_parts,args.up,args.closing_cells)
            print(json.dumps(report,indent=2,sort_keys=True))
            return 0 if report["artifact_checks_passed"] else 2
        elif args.command=="convert-exterior":
            from .vehicle import fit_cybertruck
            from .assembly import publish_candidate
            from .ldraw_library import LDrawLibrary
            from .render import write_preview
            library=LDrawLibrary(args.library)
            model=fit_cybertruck(args.input,args.length,args.tire,args.side_tile_length)
            model,report=publish_candidate(args.output,model,library,preview_writer=write_preview)
            print(json.dumps(report,indent=2,sort_keys=True))
            return 0 if report["artifact_checks_passed"] else 2
        else:
            model=json.loads((args.output/"model.json").read_text())
            if model.get("schema_version")=="lego-builder-ldraw-model-v1":
                from .assembly import validate_candidate,catalog_for_model,validate_csv,validate_component_index
                from .ldraw_library import LDrawLibrary
                if args.library is None:
                    raise ValueError("--library is required to recheck an exterior candidate")
                report=validate_candidate(model,(args.output/"model.ldr").read_text(),json.loads((args.output/"bom.json").read_text()))
                validate_csv((args.output/"bom.csv").read_text(),model)
                validate_component_index(json.loads((args.output/"sequence.json").read_text()),model)
                if model.get("catalog")!=catalog_for_model(model,LDrawLibrary(args.library)):
                    report["errors"].append("catalog_geometry_mismatch")
                    report["artifact_checks_passed"]=False
                print(json.dumps(report,indent=2,sort_keys=True))
                return 0 if report["artifact_checks_passed"] else 2
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
