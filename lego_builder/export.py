"""Derive every published artifact from one validated canonical revision."""
import csv
import html
import io
import json
import math
import os
from pathlib import Path
import tempfile
from .core import footprint, inventory, sequence, validate


def ldraw(model,catalog):
    parts={p["id"]:p for p in catalog["parts"]}
    lines=["0 LEGO Builder local research candidate",f"0 Revision {model['revision_id']}",
           "0 Units 20 LDU per stud; 8 LDU per plate. Physical build not verified."]
    for p in model["placements"]:
        x,y,z=p["position"]
        w,d,h=footprint(p,parts)
        tx,ty,tz=20*(x+w/2),-8*(z+h),20*(y+d/2)
        matrix="1 0 0 0 1 0 0 0 1" if p["yaw"]==0 else "0 0 1 0 1 0 -1 0 0"
        lines.append(f"1 {p['color']} {tx:g} {ty:g} {tz:g} {matrix} {parts[p['part_id']]['ldraw_file']}")
        lines.append("0 STEP")
    return "\n".join(lines)+"\n"


def validate_ldraw(text,model,catalog):
    # Independent parse of exported type-1 values, identities, transforms and count.
    parts={p["id"]:p for p in catalog["parts"]}
    lines=text.splitlines()
    if [line for line in lines if line.startswith("0 Revision ")] != [f"0 Revision {model['revision_id']}"]:
        raise ValueError("LDraw revision mismatch")
    if [line for line in lines if line.startswith("0 Units ")] != ["0 Units 20 LDU per stud; 8 LDU per plate. Physical build not verified."]:
        raise ValueError("LDraw units mismatch")
    steps=[line for line in lines if line.startswith("1 ") or line=="0 STEP"]
    if len(steps)!=2*len(model["placements"]) or any(steps[i]!="0 STEP" for i in range(1,len(steps),2)) or any(not steps[i].startswith("1 ") for i in range(0,len(steps),2)):
        raise ValueError("LDraw sequence STEP mismatch")
    if any(line and line.split()[0] not in ("0","1") for line in lines):
        raise ValueError("LDraw unexpected geometry")
    rows=[line.split() for line in text.splitlines() if line.startswith("1 ")]
    if len(rows)!=len(model["placements"]):
        raise ValueError("LDraw placement count mismatch")
    for row,p in zip(rows,model["placements"]):
        if len(row)!=15 or row[14]!=parts[p["part_id"]]["ldraw_file"] or int(row[1])!=p["color"]:
            raise ValueError("LDraw part/color mismatch")
        numbers=list(map(float,row[2:14]))
        if not all(map(math.isfinite,numbers)):
            raise ValueError("LDraw nonfinite transform")
        w,d,h=footprint(p,parts)
        x,y,z=p["position"]
        expected=[20*x+10*w,-8*z-8*h,20*y+10*d]+([1,0,0,0,1,0,0,0,1] if p["yaw"]==0 else [0,0,1,0,1,0,-1,0,0])
        if numbers!=expected:
            raise ValueError("LDraw transform mismatch")



def validate_bom_csv(text,model,catalog):
    parts={p["id"]:p for p in catalog["parts"]}
    expected=[["revision_id","part_id","ldraw_file","color_id","quantity"]]
    for lot in inventory(model)["lots"]:
        expected.append([model["revision_id"],lot["part_id"],parts[lot["part_id"]]["ldraw_file"],str(lot["color"]),str(lot["quantity"])])
    if list(csv.reader(io.StringIO(text)))!=expected:
        raise ValueError("CSV inventory mismatch")

def preview(model,catalog):
    parts={p["id"]:p for p in catalog["parts"]}
    from .core import cells
    occupied={cell:p["id"] for p in model["placements"] for cell in cells(p,parts)}
    all_points=[]
    faces=[]
    def project(x,y,z):
        return ((x-y)*12,(x+y)*6-z*4.8)
    # Render only external unit patches. Internal bodies/covered studs cannot
    # masquerade as holes or protrusions when different-height parts overlap.
    directions=[((0,1,0),[(0,1,0),(1,1,0),(1,1,1),(0,1,1)],"#8f1924"),
                ((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)],"#b71c2c"),
                ((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)],"#d43340")]
    for p in model["placements"]:
        px,py,pz=p["position"]
        w,d,h=footprint(p,parts)
        for x,y,z in cells(p,parts):
            for (dx,dy,dz),corners,color in directions:
                if (x+dx,y+dy,z+dz) in occupied:
                    continue
                world=[(x+i,y+j,z+k) for i,j,k in corners]
                points=[project(*v) for v in world]
                all_points.extend(points)
                coords=" ".join(f"{a:.2f},{b:.2f}" for a,b in points)
                # Preserve actual part outlines; do not invent a brick per voxel.
                edges=[]
                for a,b in zip(world,world[1:]+world[:1]):
                    if dx:
                        boundary=(a[1]==b[1] and a[1] in (py,py+d)) or (a[2]==b[2] and a[2] in (pz,pz+h))
                    elif dy:
                        boundary=(a[0]==b[0] and a[0] in (px,px+w)) or (a[2]==b[2] and a[2] in (pz,pz+h))
                    else:
                        boundary=(a[0]==b[0] and a[0] in (px,px+w)) or (a[1]==b[1] and a[1] in (py,py+d))
                    if boundary:
                        ax,ay=project(*a);bx,by=project(*b)
                        edges.append(f'<line x1="{ax:.2f}" y1="{ay:.2f}" x2="{bx:.2f}" y2="{by:.2f}" stroke="#501722" stroke-width=".5"/>')
                markup=f'<polygon points="{coords}" fill="{color}" stroke="{color}" stroke-width=".08"><title>{html.escape(p["id"]+" · "+p["part_id"])}</title></polygon>'+''.join(edges)
                if dz:
                    a,b=project(x+.5,y+.5,z+1)
                    markup+=f'<ellipse cx="{a:.2f}" cy="{b-1:.2f}" rx="3.5" ry="1.8" fill="#e64550" stroke="#961d2c" stroke-width=".45"/>'
                depth=sum(a+b+c*.4 for a,b,c in world)/4
                faces.append((depth,markup))
    polygons=[markup for _,markup in sorted(faces,key=lambda item:item[0])]
    xs,ys=zip(*all_points)
    view=f"{min(xs)-20:.2f} {min(ys)-20:.2f} {max(xs)-min(xs)+40:.2f} {max(ys)-min(ys)+40:.2f}"
    rows="".join(f"<tr><td>{html.escape(l['part_id'])}</td><td>Red (4)</td><td>{l['quantity']}</td></tr>" for l in inventory(model)["lots"])
    return f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LEGO Builder candidate</title><style>body{{font:16px system-ui;margin:2rem;color:#142440;background:#f4f6fa}}main{{max-width:1100px;margin:auto}}svg{{width:100%;height:65vh;background:white;border-radius:20px}}code{{overflow-wrap:anywhere}}td,th{{text-align:left;padding:.5rem 2rem .5rem 0}}.note{{max-width:80ch;color:#45536b}}a{{color:#174bb7}}</style><main><h1>Mesh → brick candidate</h1><p>{len(model['placements'])} red parts · analytic isometric inspection</p><svg role="img" aria-label="Canonical brick assembly, analytic rectangular bodies and studs" viewBox="{view}">{''.join(polygons)}</svg><p class="note">Automated geometry and connector checks passed. Studio import, physical strength, and real assembly remain unverified. Hover a body for its placement and part ID. This local preview uses simplified geometry.</p><p>Revision <code>{model['revision_id']}</code></p><p><a href="model.ldr">LDraw model</a> · <a href="bom.csv">Parts CSV</a> · <a href="sequence.json">Bottom-up placement sequence</a> · <a href="validation.json">Validation and structural risk metrics</a></p><table><thead><tr><th>Part</th><th>Color</th><th>Quantity</th></tr></thead><tbody>{rows}</tbody></table></main></html>'''


def write_json(path,value):
    path.write_text(json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+"\n")


def publish(output,model,report,catalog):
    output=Path(output)
    if output.exists():
        raise FileExistsError(f"Output already exists; choose a new directory: {output}")
    output.parent.mkdir(parents=True,exist_ok=True)
    # Stage sibling directory, validate serialized output, then atomically publish.
    with tempfile.TemporaryDirectory(prefix=".lego-stage-",dir=output.parent) as temp:
        stage=Path(temp)/"result"
        stage.mkdir()
        if model is not None:
            bom,plan=inventory(model),sequence(model)
            checks=validate(model,catalog,bom=bom,plan=plan)
            if not checks["passed"] or not report["passed"]:
                raise ValueError("Refusing successful artifacts for invalid model")
            ldr=ldraw(model,catalog)
            validate_ldraw(ldr,model,catalog)
            report["checks"].append("ldraw_roundtrip")
            write_json(stage/"model.json",model)
            write_json(stage/"bom.json",bom)
            write_json(stage/"sequence.json",plan)
            with (stage/"bom.csv").open("w",newline="") as f:
                writer=csv.writer(f)
                writer.writerow(["revision_id","part_id","ldraw_file","color_id","quantity"])
                parts={p["id"]:p for p in catalog["parts"]}
                for lot in bom["lots"]:
                    writer.writerow([model["revision_id"],lot["part_id"],parts[lot["part_id"]]["ldraw_file"],lot["color"],lot["quantity"]])
            validate_bom_csv((stage/"bom.csv").read_text(),model,catalog)
            report["checks"].append("csv_inventory")
            (stage/"model.ldr").write_text(ldr)
            (stage/"preview.html").write_text(preview(model,catalog))
        write_json(stage/"validation.json",report)
        os.rename(stage,output)
