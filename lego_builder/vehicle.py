"""Source-fitted Cybertruck panel assembly, explicitly a digital candidate.

Every visible panel is constructed from real part instances. Semantic topology is
vehicle-specific; dimensions, glazing outlines, wheel positions and slopes come
from the supplied OBJ, while seams, plate backing and frame are LEGO design.
"""
import math
import numpy as np
from .assembly import SCHEMA, revision
from .exterior import read_exterior, hull2, inside_polygon

TILES = {(1,1): "3070b", (1,2): "3069b", (1,3): "63864", (1,4): "2431", (1,6): "6636", (1,8): "4162", (2,2): "3068b", (2,3): "26603", (2,4): "87079"}
PLATES = {(1,1): "3024", (1,2): "3023", (1,3): "3623", (1,4): "3710", (1,6): "3666", (1,8): "3460", (2,2): "3022", (2,3): "3021", (2,4): "3020"}
I = np.eye(3)
YAW90 = np.array([[0,0,1],[0,1,0],[-1,0,0]])


class Builder:
    def __init__(self):
        self.placements = []
        self.panel_evidence = []

    def add(self, part, color, point, rotation=I, component="body"):
        self.placements.append({"id": f"p{len(self.placements)+1:05d}", "part_id": str(part), "color": int(color),
                                "position_ldu": np.round(point, 7).tolist(), "rotation": np.round(np.asarray(rotation).reshape(9), 9).tolist(), "component": component})

    def panel(self, name, origin, u, v, polygon, color=71, backing=True, mask=None, max_tile=4, strict_boundary=False):
        """Tile a convex polygon in stud cells; local tile +Y goes inside panel."""
        origin, u, v = np.array(origin, float), np.array(u, float), np.array(v, float)
        u /= np.linalg.norm(u); v /= np.linalg.norm(v)
        if abs(u @ v) > 1e-6:
            raise ValueError("Panel axes must be orthogonal")
        inward = np.cross(v, u)
        R = np.column_stack([u, inward, v])
        polygon = np.asarray(polygon, float)
        offset = polygon.min(0)
        polygon = polygon-offset
        origin = origin+u*offset[0]+v*offset[1]
        lower = np.zeros(2, dtype=int)
        upper = np.ceil(polygon.max(0)/20).astype(int)
        occupied = set()
        for a in range(lower[0], upper[0]):
            for b in range(lower[1], upper[1]):
                center = np.array([(a+.5)*20, (b+.5)*20])
                boundary_ok = inside_polygon(center, polygon)
                if strict_boundary:
                    corners = center+np.array([[-10,-10],[-10,10],[10,-10],[10,10]])
                    boundary_ok = bool(np.all(inside_polygon(corners, polygon)))
                if boundary_ok and (mask is None or mask(origin+u*center[0]+v*center[1])):
                    occupied.add((a,b))
        area = len(occupied)
        # 2x2 and 2x4 panels balance regular stainless seams with plate backing.
        choices = [(2,4),(2,3),(2,2),(1,4),(1,3),(1,2),(1,1)]
        choices = [s for s in choices if s[1] <= max_tile]
        count = 0
        while occupied:
            a,b = min(occupied)
            for w,d in choices:
                cells = {(a+i,b+j) for i in range(w) for j in range(d)}
                if cells <= occupied:
                    occupied -= cells
                    p = origin + u*((a+w/2)*20) + v*((b+d/2)*20)
                    part_R = R @ YAW90 if w != d else R
                    self.add(TILES[w,d], color, p, part_R, name)
                    if backing:
                        self.add(PLATES[w,d], 72 if color == 71 else 0, p+inward*8, part_R, name+" / backing")
                    count += 1
                    break
        self.panel_evidence.append({"name": name, "covered_stud_cells": area, "tile_count": count, "origin_ldu": origin.tolist(), "u": u.tolist(), "v": v.tolist()})

    def strip(self, name, start, end, outward, color=71, width=1):
        """Continuous fitted edge assembled from 1xN tiles, with backing."""
        start, end, outward = np.array(start,float), np.array(end,float), np.array(outward,float)
        v = end-start; length=np.linalg.norm(v); v/=length
        outward -= v*(outward@v); outward/=np.linalg.norm(outward)
        u = np.cross(v, outward); u/=np.linalg.norm(u)
        self.panel(name, start, u, v, [[-10*width,0],[10*width,0],[10*width,length],[-10*width,length]], color)


def fit_cybertruck(path, length_studs=60, tire_part="61480", side_tile_length=2):
    groups, provenance = read_exterior(path, length_studs)
    if side_tile_length not in (2,3,4):
        raise ValueError("Side tile length must be2,3or4 studs")
    provenance["design_parameters"] = {"length_studs": length_studs, "tire_part": tire_part, "side_tile_length_studs": side_tile_length}
    b = Builder()
    body = groups["Body_Shell_Cube.001"]
    xmin,xmax = body[:,0].min(),body[:,0].max()
    rear,front = body[:,2].min(),body[:,2].max()
    roof = groups["Sunroof_Cube.021"]
    wind = groups["Windscreen_Cube.020"]
    ridge_y = roof[:,1].min()
    wheels=[]
    for name, pts in groups.items():
        if name.startswith("Wheel"):
            lo,hi=pts.min(0),pts.max(0)
            wheels.append((lo+hi)/2)
    if len(wheels)!=4:
        raise ValueError("Cybertruck exterior requires exactly four named source wheels")
    wheel_y=float(np.mean([p[1] for p in wheels]))
    frontaxle=max(p[2] for p in wheels); rearaxle=min(p[2] for p in wheels)
    # Authentic catalog geometry, never scaled. Both tires have verified 56908 fits.
    radii = {"61480": 85.68374633789062, "45982": 102.31598663330078}
    if tire_part not in radii:
        raise ValueError("Exterior tire must be the reviewed 61480 or 45982")
    tire_radius=radii[tire_part]
    source_radius=float(np.mean([np.ptp(p[:,1])/2 for n,p in groups.items() if n.startswith("Wheel")]))
    # Preserve source wheel centers and ground real catalog tires by one global adjustment.
    ground_shift=-wheel_y-tire_radius
    floor_y=round((wheel_y-12)/8)*8
    bottom_y=float(body[:,1].max())
    side_x=round(max(abs(xmin),abs(xmax))/20)*20
    front_y=float(np.median(body[np.isclose(body[:,2],front,atol=5),1]))
    if not np.isfinite(front_y): front_y=-210
    belt_front=float(wind[:,1].max())
    wind_front=float(wind[:,2].max())
    wind_rear=float(wind[:,2].min())
    roof_front=float(roof[:,2].max()); roof_rear=float(roof[:,2].min())
    roof_back_y=float(roof[roof[:,2]<roof[:,2].mean(),1].mean())
    tail_y=float(np.median(groups["Taillight_Cube"][:,1]))
    belt_back=float(np.mean(groups["Rear_windscreen_Cube.008"][:,1]))+24
    # Main side body; the wheel cutout is angular, following source trim extents.
    def arch_distance(p):
        for axle in (frontaxle,rearaxle):
            dz=abs(p[2]-axle); dy=abs(p[1]-wheel_y)
            # Octagonal cutout removes side skin at actual wheel positions.
            if max(dz,dy)<tire_radius+17 and dz+dy < (tire_radius+17)*1.42:
                return False
        return True
    for sign in (-1,1):
        # local u longitudinal; v goes downward; select proper outward winding.
        u=np.array([0,0,-sign]); v=np.array([0,1,0]); origin=np.array([sign*side_x,0,0])
        outline=np.array([[rear,tail_y],[roof_rear,belt_back],[wind_front,belt_front+9],[front,front_y],[front,bottom_y-4],[rear,bottom_y-4]])
        polygon=hull2(np.column_stack([-sign*outline[:,0],outline[:,1]]))
        b.panel(f"{'right' if sign>0 else 'left'} stainless lower shell",origin,u,v,polygon,71,mask=arch_distance,max_tile=side_tile_length)
        # Narrow black rocker strips stop before the wheel wells.
        b.strip("rocker sill",[sign*(side_x+4),bottom_y,rearaxle+tire_radius+24], [sign*(side_x+4),bottom_y,frontaxle-tire_radius-24], [sign,0,0],0,1)
        # Continuous window band fitted to actual side glazing vertices in Y/Z.
        names=("LFWind_Cube.006","LB_Window_Cube.002","Small_win_L_Cube.007") if sign<0 else ("R_Main_Wind_Cube.018","RB_Wind_Cube.019","RS_wind_Small_Cube.017")
        pts=np.concatenate([groups[n] for n in names])
        # Fit x = a*y+b*z+c; retain the windshield-side inward cant.
        fit=np.linalg.lstsq(np.column_stack([pts[:,1],pts[:,2],np.ones(len(pts))]),pts[:,0],rcond=None)[0]
        u3=np.array([-sign*fit[1],0,-sign]);u3/=np.linalg.norm(u3)
        normal=np.array([sign,-sign*fit[0],-sign*fit[1]]);normal/=np.linalg.norm(normal)
        v3=np.cross(normal,u3);v3/=np.linalg.norm(v3)
        o=np.array([fit[2],0,0]); local=np.column_stack([(pts-o)@u3,(pts-o)@v3])
        b.panel("dark side glazing",o,u3,v3,hull2(local),0,max_tile=4)
        # Pillar and belt trim deliberately cap the stepped tile perimeter.
        for a,c in ((pts[np.argmax(pts[:,2])],pts[np.argmin(pts[:,1])]),(pts[np.argmin(pts[:,1])],pts[np.argmin(pts[:,2])])):
            b.strip("stainless window perimeter",a+normal*4,c+normal*4,normal,71,1)
        lower=pts[pts[:,1] >= np.quantile(pts[:,1],.50)]
        a=lower[np.argmax(lower[:,2])]; c=lower[np.argmin(lower[:,2])]
        b.strip("continuous belt trim",a+normal*10,c+normal*10,normal,71,1)
        # Source-derived rear sail panel continues from roof down to tail.
        sail=np.array([[roof_rear,roof_back_y],[rear,tail_y],[rear,tail_y+18],[roof_rear,belt_back+10]])
        b.panel("rear sail",origin,u,v,hull2(np.column_stack([-sign*sail[:,0],sail[:,1]])),71,strict_boundary=True)
        b.strip("smooth descending cargo rail",[sign*side_x,roof_back_y-4,roof_rear],[sign*side_x,tail_y-4,rear],[0,-1,0],71,2)
        # Faceted black wheel arches: straight top and 45 degree shoulders.
        r=tire_radius+20
        for axle in (frontaxle,rearaxle):
            contour=[[-r,18],[-r,-r*.42],[-r*.42,-r],[r*.42,-r],[r,-r*.42],[r,18]]
            for (za,ya),(zc,yc) in zip(contour,contour[1:]):
                b.strip("angular wheel arch",[sign*(side_x+13),wheel_y+ya,axle+za],[sign*(side_x+13),wheel_y+yc,axle+zc],[sign,0,0],0,1)
            # Wheel center from mesh, authentic tire and separate authentic rim.
            center=min(wheels,key=lambda p:abs(p[2]-axle)+abs(p[0]-sign*side_x))
            R=np.array([[0,0,sign],[0,1,0],[-sign,0,0]])
            b.add(tire_part,0,center,R,"wheels and hubs")
            b.add("56908",0,center,R,"wheels and hubs")
        # Door handle inserts sit just outboard of body, two useful small details.
        for fraction in (.37,.65):
            z=wind_front+(roof_rear-wind_front)*fraction
            y=belt_front+(belt_back-belt_front)*fraction+28
            b.add("3069b",72,[sign*(side_x+8),y,z],np.column_stack([u,np.cross(v,u),v]),"flush door handles")
    # Cross-car panels use a single real plane with steel seams and backed tiles.
    halfwidth=math.floor((side_x-16)/20)*20
    def across_panel(name,a,c,color,width=halfwidth):
        a,c=np.array(a,float),np.array(c,float)
        v=c-a; distance=np.linalg.norm(v);v/=distance
        # v points rearwards for upper panels to make outward normal point up.
        u=np.array([-1,0,0]) if v[2]<0 else np.array([1,0,0])
        start=a+np.array([width if u[0]<0 else -width,0,0])
        b.panel(name,start,u,v,[[0,0],[2*width,0],[2*width,distance],[0,distance]],color)
    hoodstart=[0,front_y-4,front-10]; hoodend=[0,belt_front,wind_front]
    across_panel("sloping stainless hood",hoodstart,hoodend,71)
    # True windshield least-squares plane from original glazing points.
    coeff=np.polyfit(wind[:,2],wind[:,1],1)
    across_panel("panoramic windshield",[0,np.polyval(coeff,wind_front),wind_front],[0,np.polyval(coeff,wind_rear),wind_rear],0,width=halfwidth-20)
    across_panel("ridge joining strip",[0,np.polyval(coeff,wind_rear),wind_rear],[0,ridge_y,roof_front],71,width=halfwidth-20)
    for sign in (-1,1):
        b.strip("faceted windshield pillar",[sign*(halfwidth-6),np.polyval(coeff,wind_front)-4,wind_front],[sign*(halfwidth-30),np.polyval(coeff,wind_rear)-4,wind_rear],[sign*.5,-1,0],71,2)
        b.strip("roof side cap",[sign*(halfwidth-20),ridge_y-4,roof_front],[sign*(halfwidth-20),roof_back_y-4,roof_rear],[sign*.4,-1,0],71,1)
    across_panel("stainless roof",[0,ridge_y,roof_front],[0,roof_back_y,roof_rear],71,width=halfwidth-20)
    # Full width rear glazing closes the cabin ahead of the visibly open bed.
    rearwindow=groups["Rear_windscreen_Cube.008"]
    across_panel("rear cabin glass",[0,rearwindow[:,1].min(),rearwindow[:,2].mean()],[0,rearwindow[:,1].max(),rearwindow[:,2].mean()+1],0,width=halfwidth-20)
    # The bed is an open inset tray, with a dark floor and useful underfloor backing.
    bedfront=float(rearwindow[:,2].min())-16
    across_panel("open cargo bed floor",[0,floor_y-24,bedfront],[0,floor_y-24,rear+24],72,width=halfwidth)
    # Dark bed side liners make an open cargo box, hiding the shell supports.
    for sign in (-1,1):
        u=np.array([0,0,sign]);v=np.array([0,1,0]);o=np.array([sign*(side_x-24),0,0])
        rail_at_bed_front = roof_back_y+(tail_y-roof_back_y)*(bedfront-roof_rear)/(rear-roof_rear)
        wall=[[sign*rear,tail_y+12],[sign*bedfront,rail_at_bed_front+12],[sign*bedfront,floor_y-16],[sign*rear,floor_y-16]]
        b.panel("cargo bed inner side",o,u,v,hull2(wall),72,max_tile=3,strict_boundary=True)
    # Flat front and tailgate, black bumpers, thin complete light bars.
    for z,y,sign,name in ((front,front_y,1,"front"),(rear,tail_y,-1,"rear")):
        u=np.array([sign,0,0]);v=np.array([0,1,0]);o=np.array([0,0,z])
        b.panel(name+" stainless fascia",o,u,v,[[-halfwidth,y+16],[halfwidth,y+16],[halfwidth,bottom_y-8],[-halfwidth,bottom_y-8]],71)
        b.panel(name+" black bumper",o+np.array([0,0,sign*10]),u,v,[[-side_x,bottom_y-8],[side_x,bottom_y-8],[side_x,bottom_y+12],[-side_x,bottom_y+12]],0)
        # One row of translucent 1x2 plates provides a restrained full-width bar.
        R=np.column_stack([u,np.cross(v,u),v])
        for x in np.arange(-halfwidth+10,halfwidth,20):
            b.add("3024",47 if sign>0 else 36,[x,y+4,z],I,name+" continuous light bar")
            b.add("3024",0,[x,y+12,z],I,name+" light bar lower frame")
    # Concealed useful ladder chassis: beams and crossmembers inside body envelope.
    for x in (-100,-60,60,100):
        for z in np.arange(rear+60,front-40,80):
            b.add("3010",0,[x,floor_y+8,z],YAW90,"concealed chassis rails")
            b.add("3710",0,[x,floor_y-16,z+20],YAW90,"concealed chassis rail ties")
    for z in np.arange(rear+50,front-30,80):
        for x in (-60,20,100):
            b.add("3020",72,[x,floor_y-24,z],I,"concealed crossmembers")
    # Useful vertical backing ribs under the skin, stopping below windows.
    for sign in (-1,1):
        for z in np.arange(rear+30,front-20,60):
            if min(abs(z-frontaxle),abs(z-rearaxle))<tire_radius+25: continue
            top=belt_front+(belt_back-belt_front)*np.clip((front-z)/(front-rear),0,1)+24
            for y in np.arange(floor_y-24,top,-24):
                b.add("3004",72,[sign*(side_x-32),y,z],I,"concealed shell ribs")
    # Side-stud brackets join each side's backed panels to the concealed ribs.
    for sign in (-1,1):
        ry=np.array([[0,0,-sign],[0,1,0],[sign,0,0]])
        for z in np.arange(rear+30,front-20,60):
            if min(abs(z-frontaxle),abs(z-rearaxle))<tire_radius+25: continue
            for y in (floor_y-24,belt_front+40):
                b.add("99781",72,[sign*(side_x-26),y,z],ry,"shell attachment brackets")
    # Curved lower bumper shoulders and wedge plates finish the functional corners.
    for z,sgn in ((front-12,1),(rear+12,-1)):
        ry=np.diag([sgn,1,sgn])
        for x in np.arange(-side_x+20,side_x,40):
            b.add("15068",0,[x,bottom_y+10,z],ry,"beveled bumper lower edge")
    for sign in (-1,1):
        # These wedge plates cap the tapered outer hood corners, beside the fitted hood.
        ry=np.diag([sign,1,sign])
        b.add("24299" if sign>0 else "24307",71,[sign*(halfwidth+10),belt_front+6,wind_front-20],ry,"hood wedge corners")
        for z in (rear+32,bedfront-24):
            b.add("3039",72,[sign*(side_x-45),floor_y-24,z],I,"cargo wheelhouse sloped ends")
    # All geometry shifts together; preserve unscaled rigid catalog parts.
    for p in b.placements:
        p["position_ldu"][1]=round(p["position_ldu"][1]+ground_shift,7)
    for evidence in b.panel_evidence:
        evidence["origin_ldu"][1] += ground_shift
    provenance["catalog_tire_fit"]={"tire_part":tire_part,"rim_part":"56908","source_radius_ldu":source_radius,"catalog_radius_ldu":tire_radius,"ground_translation_ldu":[0,ground_shift,0]}
    provenance["source_to_ldraw_matrix"][1][3]+=ground_shift
    provenance["fitted_parameters"]={"front_z":front,"rear_z":rear,"body_half_width_ldu":side_x,"front_axle_z":frontaxle,"rear_axle_z":rearaxle,"wheel_y":wheel_y+ground_shift,"roof_ridge_y":ridge_y+ground_shift,"windshield_z_range":[wind_rear,wind_front],"bed_front_z":bedfront}
    provenance["panel_fits"]=b.panel_evidence
    model={"schema_version":SCHEMA,"name":"Cybertruck exterior digital candidate","algorithm_version":"cybertruck-semantic-panels-v1","status":"digital_candidate","constraints":{"target_parts":2000,"target_band":[1800,2200],"target_tolerance":0.1,"max_output_parts":10000},"provenance":provenance,"placements":b.placements}
    model["revision_id"]=revision(model)
    return model
