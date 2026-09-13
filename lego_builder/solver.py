"""Exact voxel covering with bounded, deterministic seam-retile attempts."""
import numpy as np
from .core import WEIGHTS, cells, new_model, validate, inventory, sequence


def fit(grid, catalog, mode=0):
    parts = {p["id"]:p for p in catalog["parts"]}
    remaining = grid.copy()
    tops, placements = {}, []
    nx,ny,nz = grid.shape
    shapes = []
    for part in catalog["parts"]:
        if mode==2 and part["height"]!=1:
            continue
        for yaw in (0,90) if part["width"]!=part["depth"] else (0,):
            w,d = (part["depth"],part["width"]) if yaw else (part["width"],part["depth"])
            shapes.append((part["id"],w,d,part["height"],yaw))
    for z in range(nz):
        candidates = []
        for x,y in np.argwhere(remaining[:,:,z]):
            x,y = int(x),int(y)
            for part_id,w,d,h,yaw in shapes:
                if x+w>nx or y+d>ny or z+h>nz or not remaining[x:x+w,y:y+d,z:z+h].all():
                    continue
                supports = {tops[(i,j,z)] for i in range(x,x+w) for j in range(y,y+d) if (i,j,z) in tops}
                if z and not supports:
                    continue
                # Favor bridges across previous part boundaries; every candidate stays inside target.
                unsupported = sum((i,j,z) not in tops for i in range(x,x+w) for j in range(y,y+d)) if z else 0
                score = w*d*h + WEIGHTS["joined_supports"]*max(0,len(supports)-1) + WEIGHTS["unsupported_target_cells"]*unsupported
                tie = (x,y) if mode==0 else (-y,-x)
                candidates.append((-score,-w*d*h,tie,part_id,yaw,x,y,w,d,h))
        candidates.sort()
        for _,__,___,part_id,yaw,x,y,w,d,h in candidates:
            if not remaining[x:x+w,y:y+d,z:z+h].all():
                continue
            p = {"id":f"p{len(placements)+1:06d}","part_id":part_id,"color":4,
                 "position":[x,y,z],"yaw":yaw}
            placements.append(p)
            remaining[x:x+w,y:y+d,z:z+h] = False
            for i in range(x,x+w):
                for j in range(y,y+d):
                    tops[(i,j,z+h)] = p["id"]
    return placements, int(remaining.sum())


def solve(grid,catalog,provenance):
    target = set(map(tuple,np.argwhere(grid).tolist()))
    attempts, best = [], None
    for mode in range(4):
        search_nodes = 0
        if mode==3:
            placements,uncovered,search_nodes = fit_plate_search(grid,catalog)
        else:
            placements,uncovered = fit(grid,catalog,mode)
        details = {**provenance,"objective_weights":WEIGHTS,"random_seed":0,"solver_attempt":mode,
                   "solver_strategy":["bridge-greedy","reverse-seam-retile","plate-seam-retile","bounded-plate-exact-cover"][mode],
                   "allowed_palette":[4],"search_limits":{"nodes":25000,"depth":250}}
        model = new_model(placements,catalog,details)
        report = validate(model,catalog,target,inventory(model),sequence(model))
        attempts.append({"strategy":details["solver_strategy"],"revision_id":model["revision_id"],
                         "part_count":len(placements),"uncovered_cells":uncovered,
                         "passed":report["passed"],"errors":report["errors"],"search_nodes":search_nodes,
                         "uncovered_cell_sample":sorted(target-{cell for p in placements for cell in cells(p,{q["id"]:q for q in catalog["parts"]})})[:20] if uncovered else []})
        if report["passed"]:
            best = (model,report)
            break
    if best is None:
        return None,{"passed":False,"stage":"fitting_validation","errors":["no_valid_assembly"],
                     "message":"All bounded tiling attempts failed. Try a different size or a simpler solid source; no support geometry was added.",
                     "provenance":provenance,"attempts":attempts}
    model,report = best
    report["attempts"] = attempts
    report["metrics"] = metrics(model,catalog,grid)
    return model,report


def metrics(model,catalog,grid):
    parts = {p["id"]:p for p in catalog["parts"]}
    tops, single_stud, overhang, repeated_seams = {},0,0,0
    per_layer = {}
    for p in model["placements"]:
        x,y,z=p["position"]
        from .core import footprint
        w,d,h=footprint(p,parts)
        support_cells = [(i,j) for i in range(x,x+w) for j in range(y,y+d) if (i,j,z) in tops]
        if z and len(support_cells)==1:
            single_stud+=1
        if z and len(support_cells)<w*d:
            overhang+=1
        for i in range(x,x+w):
            for j in range(y,y+d):
                tops[i,j,z+h]=p["id"]
        for i,j,k in cells(p,parts):
            per_layer[i,j,k]=p["id"]
    for i,j,k in per_layer:
        for di,dj in ((1,0),(0,1)):
            neighbor=(i+di,j+dj,k)
            if neighbor in per_layer and per_layer[neighbor]!=per_layer[i,j,k]:
                if k and (i,j,k-1) in per_layer and (i+di,j+dj,k-1) in per_layer and per_layer[i,j,k-1]!=per_layer[i+di,j+dj,k-1]:
                    repeated_seams+=1
    bom=inventory(model)
    return {"parts":len(model["placements"]),"unique_lots":len(bom["lots"]),
            "target_coverage":1.0,"voxel_iou":1.0,
            "silhouette_iou_to_voxel_target":{"xy":1.0,"xz":1.0,"yz":1.0},
            "resemblance_note":"Exact voxel target coverage, not a perceptual or continuous source resemblance score; inspect preview manually.",
            "single_stud_supported_parts":single_stud,"partially_supported_parts":overhang,
            "repeated_adjacent_layer_seam_edges":repeated_seams,
            "manual_repairs":0,"added_support_cells":0,
            "risk_note":"Single-stud support, overhangs, and repeated seams require manual structural review even when connectivity passes."}


def fit_plate_search(grid,catalog,node_limit=25000):
    """Bounded exact cover for unsupported cells; supported leftovers admit 1x1s.

    Every selected rectangle must connect to the previous plate layer. Branch on
    the most constrained unsupported cell; this repairs greedy choices without
    changing the target or relying on unbounded optimization.
    """
    placements,tops=[],{}
    nodes=0
    for z in range(grid.shape[2]):
        coords=[tuple(map(int,xy)) for xy in np.argwhere(grid[:,:,z])]
        index={xy:i for i,xy in enumerate(coords)}
        all_mask=(1<<len(coords))-1
        unsupported_mask=sum(1<<i for (x,y),i in index.items() if z and (x,y,z) not in tops)
        candidates=[]
        for x,y in coords:
            for part in catalog["parts"]:
                if part["height"]!=1:
                    continue
                for yaw in (0,90) if part["width"]!=part["depth"] else (0,):
                    w,d=(part["depth"],part["width"]) if yaw else (part["width"],part["depth"])
                    footprint_cells=[(i,j) for i in range(x,x+w) for j in range(y,y+d)]
                    if any(cell not in index for cell in footprint_cells):
                        continue
                    supports={tops[i,j,z] for i,j in footprint_cells if (i,j,z) in tops}
                    if z and not supports:
                        continue
                    mask=sum(1<<index[cell] for cell in footprint_cells)
                    score=(mask&unsupported_mask).bit_count()*WEIGHTS["unsupported_target_cells"]+max(0,len(supports)-1)*WEIGHTS["joined_supports"]+w*d
                    candidates.append((-score,part["id"],yaw,x,y,w,d,mask))
        candidates.sort()
        by_cell={i:[] for i in range(len(coords)) if unsupported_mask&(1<<i)}
        for ci,candidate in enumerate(candidates):
            bits=candidate[-1]&unsupported_mask
            while bits:
                bit=bits&-bits;by_cell[bit.bit_length()-1].append(ci);bits-=bit
        def search(used,uncovered,chosen):
            nonlocal nodes
            nodes+=1
            if nodes>node_limit or len(chosen)>250:
                return None
            if not uncovered:
                return used,chosen
            options=None
            bits=uncovered
            while bits:
                bit=bits&-bits
                available=[ci for ci in by_cell[bit.bit_length()-1] if not candidates[ci][-1]&used]
                if not available:
                    return None
                if options is None or len(available)<len(options):
                    options=available
                bits-=bit
            for ci in options:
                mask=candidates[ci][-1]
                result=search(used|mask,uncovered&~mask,chosen+[ci])
                if result is not None:
                    return result
            return None
        result=search(0,unsupported_mask,[])
        if result is None:
            occupied=sum(len(list(cells(p,{q["id"]:q for q in catalog["parts"]}))) for p in placements)
            return placements,int(grid.sum())-occupied,nodes
        used,chosen=result
        for ci,candidate in enumerate(candidates):
            mask=candidate[-1]
            if not mask&used:
                used|=mask;chosen.append(ci)
        if used!=all_mask:
            raise RuntimeError("Catalog plate 1x1 exact-cover invariant violated")
        for ci in chosen:
            _,part_id,yaw,x,y,w,d,_=candidates[ci]
            p={"id":f"p{len(placements)+1:06d}","part_id":part_id,"color":4,"position":[x,y,z],"yaw":yaw}
            placements.append(p)
            for i in range(x,x+w):
                for j in range(y,y+d):
                    tops[i,j,z+1]=p["id"]
    return placements,0,nodes
