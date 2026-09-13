"""Self-contained WebGL2 viewer of recursive official LDraw part geometry.

Instancing shares geometry across repeated part/color lots. Depth testing hides
internal surfaces; official type-2 edges use polygon offset to avoid face/line
z-fighting. Rendering is inspection evidence, never a physical connection check.
"""
from __future__ import annotations

import base64
from collections import defaultdict
import html
import json
from pathlib import Path
import zlib

import numpy as np

from .ldraw_library import LDrawError

RENDERER_VERSION = "ldraw-webgl-instanced-v2"


def _packed(values):
    return base64.b64encode(zlib.compress(np.asarray(values, dtype="<f4").tobytes(), 9)).decode("ascii")


def _rgba(library, code, inherited):
    if code == 16:
        code = inherited
    if code == 24:
        color = library.color(inherited)
        edge = color["edge"]
        if edge.startswith("#"):
            return [int(edge[n:n+2], 16)/255 for n in (1, 3, 5)] + [1.0]
        return library.color(int(edge))["rgb"] + [1.0]
    color = library.color(int(code))
    return color["rgb"] + [color["alpha"]]


def preview_data(model, library):
    if not isinstance(model, dict) or model.get("schema_version") != "lego-builder-ldraw-model-v1":
        raise LDrawError("Renderer requires schema lego-builder-ldraw-model-v1 canonical placements")
    placements = model.get("placements")
    if not isinstance(placements, list) or not 1 <= len(placements) <= 10000:
        raise LDrawError("Renderer expects between 1 and 10,000 placements")
    if not isinstance(model.get("revision_id"), str):
        raise LDrawError("Renderer requires a canonical revision ID")
    from .assembly import revision
    try:
        expected_revision = revision(model)
    except (TypeError, ValueError) as exc:
        raise LDrawError("Renderer cannot compute the canonical revision") from exc
    if model["revision_id"] != expected_revision:
        raise LDrawError("Renderer rejected a stale canonical revision")
    lots = defaultdict(list)
    ids = set()
    for placement in placements:
        if not isinstance(placement, dict) or not isinstance(placement.get("id"), str) or placement["id"] in ids:
            raise LDrawError("Renderer found a missing or duplicate placement ID")
        ids.add(placement["id"])
        try:
            position = np.asarray(placement["position_ldu"], dtype=float)
            rotation = np.asarray(placement["rotation"], dtype=float).reshape(3, 3)
            color = placement["color"]
            if type(color) is not int:
                raise ValueError("color must be an integer")
            part_id = str(placement["part_id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise LDrawError(f"Malformed renderer placement: {placement.get('id')}") from exc
        if position.shape != (3,) or not np.isfinite(position).all() or not np.isfinite(rotation).all():
            raise LDrawError("Renderer requires finite 3D transforms")
        if not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-5) or not np.isclose(np.linalg.det(rotation), 1, atol=1e-5):
            raise LDrawError("Canonical placement rotations must be proper rigid rotations")
        library.color(color)
        matrix = np.eye(4, dtype=np.float32)
        matrix[:3, :3] = rotation
        matrix[:3, 3] = position
        lots[part_id, color].append(matrix)
    groups, bounds = [], []
    expanded_triangles = 0
    unique_triangles = 0
    warnings = set()
    for (part_id, color), matrices in sorted(lots.items()):
        geometry = library.geometry(part_id)
        if not len(geometry.vertices):
            raise LDrawError(f"Part has no triangle geometry: {part_id}")
        triangles = geometry.vertices
        normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        lengths = np.linalg.norm(normals, axis=1)
        keep = lengths > 1e-8
        if not keep.all():
            warnings.add("Zero-area source triangles are omitted from rendering only; source provenance is preserved.")
        triangles, normals = triangles[keep], normals[keep] / lengths[keep, None]
        codes = geometry.colors[keep]
        # Exact coincident same-color triangles in a part can be duplicated by
        # aliases/subparts. Drawing one preserves the visible surface and avoids
        # duplicate depth fragments; no approximate exterior simplification occurs.
        order = np.lexsort((triangles[:, :, 2], triangles[:, :, 1], triangles[:, :, 0]), axis=1)
        ordered_vertices = np.take_along_axis(triangles, order[:, :, None], axis=1)
        keys = np.concatenate((ordered_vertices.reshape(-1, 9), codes[:, None]), axis=1)
        _, unique = np.unique(keys, axis=0, return_index=True)
        unique.sort()
        triangles, normals, codes = triangles[unique], normals[unique], codes[unique]
        face_colors = np.asarray([_rgba(library, int(code), color) for code in codes], dtype=np.float32)
        vertices = np.concatenate((triangles.reshape(-1, 3), np.repeat(normals, 3, axis=0), np.repeat(face_colors, 3, axis=0)), axis=1)
        line_colors = np.asarray([_rgba(library, int(code), color) for code in geometry.line_colors], dtype=np.float32).reshape(-1, 4)
        line_vertices = np.concatenate((geometry.lines.reshape(-1, 3), np.zeros((len(geometry.lines)*2, 3)), np.repeat(line_colors, 2, axis=0)), axis=1)
        matrices = np.asarray(matrices)
        bbox = geometry.bounds
        corners = np.asarray([[x, y, z] for x in bbox[:, 0] for y in bbox[:, 1] for z in bbox[:, 2]])
        world = np.einsum("nij,kj->nki", matrices[:, :3, :3], corners) + matrices[:, None, :3, 3]
        bounds.extend((world.min(axis=(0, 1)), world.max(axis=(0, 1))))
        groups.append({"part_id": part_id, "color": color, "name": library.part_info(part_id)["name"],
                       "vertices": _packed(vertices), "lines": _packed(line_vertices),
                       "matrices": _packed(matrices.transpose(0, 2, 1)),
                       "vertex_count": len(vertices), "line_vertex_count": len(line_vertices),
                       "instances": len(matrices), "transparent": bool(np.any(face_colors[:, 3] < .999))})
        unique_triangles += len(triangles)
        expanded_triangles += len(triangles) * len(matrices)
        warnings.update(geometry.warnings)
    bounds = np.asarray(bounds)
    colors = [{**library.color(code), "quantity": sum(len(lot) for (_, c), lot in lots.items() if c == code)} for code in sorted({c for _, c in lots})]
    return {"renderer_version": RENDERER_VERSION, "revision_id": model["revision_id"],
            "groups": groups, "colors": colors, "bounds": [bounds.min(axis=0).tolist(), bounds.max(axis=0).tolist()],
            "stats": {"instances": len(placements), "part_color_lots": len(lots), "unique_triangles": unique_triangles,
                      "instanced_triangles": expanded_triangles},
            "warnings": sorted(warnings),
            "limitations": ["No physical connector, collision, clutch, or stability claims arise from this renderer.",
                            "Texture images and conditional type-5 lines are not displayed; triangle geometry and explicit edges are retained.",
                            "Transparent parts use approximate group-order alpha blending; no optical refraction simulation."]}


def write_preview(model, library, output_path, title=None):
    data = preview_data(model, library)
    sources = library.manifest(p["part_id"] for p in model["placements"])
    sources.pop("library_root", None)
    authors = sorted({item["author"] for item in sources["sources"].values() if item.get("author")})
    licenses = sorted({item["license"] for item in sources["sources"].values() if item.get("license")})
    data["provenance"] = sources
    safe_json = json.dumps(data, separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")
    swatches = []
    for color in data["colors"]:
        rgb = ",".join(str(round(value * 255)) for value in color["rgb"])
        swatches.append(f"<li><span style='background:rgb({rgb})'></span>{html.escape(color['name'])}<b>{color['quantity']}</b></li>")
    palette = "".join(swatches)

    page = _HTML.replace("__TITLE__", html.escape(title or model.get("name", "LEGO exterior study"))).replace("__COUNT__", f"{data['stats']['instances']:,}").replace("__LOTS__", str(data["stats"]["part_color_lots"]))
    page = page.replace("__REVISION__", html.escape(model["revision_id"])).replace("__PALETTE__", palette)
    page = page.replace("__ATTRIBUTION__", html.escape("; ".join(authors) + ". " + "; ".join(licenses)))
    page = page.replace("__DATA__", safe_json)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(page)
    return {**data["stats"], "revision_id": model["revision_id"], "renderer_version": RENDERER_VERSION,
            "html_bytes": path.stat().st_size, "bounds_ldu": data["bounds"], "warnings": data["warnings"]}


_HTML = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title><style>
*{box-sizing:border-box}body{margin:0;color:#182431;background:#ecf0f3;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{position:absolute;z-index:2;top:30px;left:36px;pointer-events:none}small{font-size:11px;letter-spacing:2.5px;color:#577183;text-transform:uppercase}h1{margin:9px 0 10px;font-size:clamp(24px,3vw,42px);font-weight:600;letter-spacing:-1.5px}header p{color:#607380;margin:0}canvas{width:100vw;height:100vh;display:block;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}.panel{position:absolute;bottom:24px;left:32px;right:32px;display:flex;align-items:end;justify-content:space-between;gap:16px;pointer-events:none}.controls,.card{pointer-events:auto;background:#fffE;border:1px solid #cfd7dc;border-radius:12px;padding:12px;box-shadow:0 6px 24px #1b344a0d}button{background:#f2f5f7;border:1px solid #d0dbe3;color:#243c51;border-radius:7px;padding:9px 12px;cursor:pointer;font:inherit}button:hover{background:#e2eaf0}button:focus-visible{outline:3px solid #4682b4;outline-offset:2px}.controls{display:flex;gap:6px;flex-wrap:wrap}.card{max-width:265px;font-size:12px;color:#596b78}.card p{margin:7px 0}.card strong{color:#263e50}ul{list-style:none;margin:6px 0;padding:0}li{display:flex;align-items:center;gap:8px;margin:5px 0}li span{height:11px;width:11px;border:1px solid #0002;border-radius:3px}li b{margin-left:auto;color:#243b4d;font-weight:500}.status{position:absolute;top:35px;right:32px;max-width:300px;font-size:12px;color:#637786}details{max-height:110px;overflow:auto}a{color:#305a7b}code{font-size:9px;overflow-wrap:anywhere}#error{display:none;color:#a72428;background:#fff1f1;padding:16px;position:absolute;top:120px;left:32px;right:32px}#hint{margin:8px 0 0;font-size:11px;color:#657989}@media(max-width:680px){header{top:20px;left:20px}.panel{bottom:16px;left:16px;right:16px}.card{display:none}.status{top:100px;right:20px}button{padding:8px;font-size:12px}}
</style></head><body><header><small>Actual LDraw part geometry</small><h1>__TITLE__</h1><p>__COUNT__ pieces · __LOTS__ part/color lots</p></header><canvas id="view" aria-label="Interactive actual-part LEGO assembly. Drag to orbit, scroll to zoom." tabindex="0"></canvas><div id="error" role="alert"></div><div class="status" id="status">Loading official part geometry…</div>
<div class="panel"><div><div class="controls"><button id="reset">Three-quarter</button><button id="front">Front</button><button id="side">Side</button><button id="top">Top</button><button id="projection">Perspective</button><button id="edges">Edges on</button><button id="save">Save PNG</button></div><p id="hint">Drag to orbit · Shift-drag to pan · Scroll to zoom · R to reset</p></div><aside class="card"><strong>Canonical assembly palette</strong><ul>__PALETTE__</ul><p>Geometry study. Physical connections and assembly remain unverified.</p><p><a href="model.ldr">LDraw</a> · <a href="bom.csv">Parts</a> · <a href="model.json">Canonical model</a></p><details><summary>Revision and attribution</summary><p><code>__REVISION__</code></p><p>Official LDraw library contributors: __ATTRIBUTION__</p><p><a href="https://www.ldraw.org/article/218.html">LDraw format</a> · <a href="https://www.ldraw.org/article/227.html">LDraw licenses</a>. No endorsement implied. Source hashes are embedded in this file.</p></details></aside></div>
<script id="model-data" type="application/json">__DATA__</script><script>
(async()=>{'use strict';
const D=JSON.parse(document.getElementById('model-data').textContent),canvas=document.getElementById('view'),status=document.getElementById('status');
try{
const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('This actual-part preview needs a browser with WebGL2 enabled.');
const vs=`#version 300 es
precision highp float;
layout(location=0) in vec3 position;layout(location=1) in vec3 normal;layout(location=2) in vec4 color;
layout(location=3) in mat4 instanceMatrix;
uniform mat4 viewProjection;uniform bool edgePass;
out vec3 vNormal;out vec3 vWorld;out vec4 vColor;
void main(){vec4 world=instanceMatrix*vec4(position,1.0);vWorld=world.xyz;vNormal=mat3(instanceMatrix)*normal;vColor=color;gl_Position=viewProjection*world;}`;
const fs=`#version 300 es
precision highp float;in vec3 vNormal;in vec3 vWorld;in vec4 vColor;uniform bool edgePass;uniform vec3 eye;out vec4 outColor;
void main(){if(edgePass){outColor=vec4(vColor.rgb*.64,vColor.a*.30);return;}vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 light=normalize(vec3(-.5,-1.0,.65));float diffuse=max(dot(n,light),0.0);float fill=max(dot(n,normalize(vec3(.8,-.1,-.3))),0.0);float brightness=.74+.32*diffuse+.12*fill;vec3 viewDirection=normalize(eye-vWorld);vec3 halfVector=normalize(light+viewDirection);float spec=pow(max(dot(n,halfVector),0.0),70.0)*.12;vec3 rgb=vColor.rgb*brightness+vec3(spec);outColor=vec4(rgb,vColor.a);}`;
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const vpLoc=gl.getUniformLocation(program,'viewProjection'),edgeLoc=gl.getUniformLocation(program,'edgePass'),eyeLoc=gl.getUniformLocation(program,'eye');
async function unpack(text){const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));return new Float32Array(await new Response(stream).arrayBuffer());}
function vao(vertices,matrices){const vao=gl.createVertexArray();gl.bindVertexArray(vao);let buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);for(const [location,size,offset]of[[0,3,0],[1,3,12],[2,4,24]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);}buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,matrices,gl.STATIC_DRAW);for(let j=0;j<4;j++){gl.enableVertexAttribArray(3+j);gl.vertexAttribPointer(3+j,4,gl.FLOAT,false,64,j*16);gl.vertexAttribDivisor(3+j,1);}gl.bindVertexArray(null);return vao;}
const groups=[];for(const g of D.groups){const [v,l,m]=await Promise.all([unpack(g.vertices),unpack(g.lines),unpack(g.matrices)]);groups.push({...g,vao:vao(v,m),lineVao:vao(l,m)});}
const min=D.bounds[0],max=D.bounds[1],center=min.map((v,i)=>(v+max[i])/2),extent=max.map((v,i)=>v-min[i]);const radius=Math.hypot(...extent)/2;let yaw=.85,pitch=.34,distance=radius*3.2,pan=[0,0,0],perspective=false,edges=true,dirty=true;
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
const subtract=(a,b)=>a.map((v,i)=>v-b[i]),normalize=v=>{let l=Math.hypot(...v);return v.map(x=>x/l)},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function lookAt(eye,target){const z=normalize(subtract(eye,target)),x=normalize(cross([0,-1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function projection(aspect){const near=Math.max(.1,radius*.001),far=radius*30+distance;if(perspective){const f=1/Math.tan(.64/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}const h=distance*.34,w=h*aspect;return new Float32Array([1/w,0,0,0,0,1/h,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1]);}
function render(){const ratio=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}if(dirty){gl.viewport(0,0,w,h);gl.clearColor(.925,.945,.958,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);const target=center.map((v,i)=>v+pan[i]),eye=[target[0]+distance*Math.cos(pitch)*Math.cos(yaw),target[1]-distance*Math.sin(pitch),target[2]+distance*Math.cos(pitch)*Math.sin(yaw)];gl.uniformMatrix4fv(vpLoc,false,multiply(projection(w/h),lookAt(eye,target)));gl.uniform3fv(eyeLoc,eye);gl.uniform1i(edgeLoc,0);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);for(const transparent of[false,true]){if(transparent){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}else gl.disable(gl.BLEND);for(const group of groups){if(group.transparent!==transparent)continue;gl.bindVertexArray(group.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,group.vertex_count,group.instances);}}gl.disable(gl.POLYGON_OFFSET_FILL);if(edges){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1i(edgeLoc,1);for(const group of groups){gl.bindVertexArray(group.lineVao);gl.drawArraysInstanced(gl.LINES,0,group.line_vertex_count,group.instances);}}gl.bindVertexArray(null);gl.disable(gl.BLEND);dirty=false;}requestAnimationFrame(render);}
let pointer=null;canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===2};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(pointer.pan){const scale=distance/canvas.clientHeight*.65;pan[0]+=dx*Math.sin(yaw)*scale;pan[2]-=dx*Math.cos(yaw)*scale;pan[1]+=dy*scale;}else{yaw-=dx*.008;pitch=Math.max(-1.4,Math.min(1.5,pitch+dy*.006));}pointer.x=e.clientX;pointer.y=e.clientY;dirty=true;});canvas.addEventListener('pointerup',()=>pointer=null);canvas.addEventListener('pointercancel',()=>pointer=null);canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(radius*.5,Math.min(radius*15,distance*Math.exp(e.deltaY*.001)));dirty=true;},{passive:false});
const reset=()=>{yaw=.85;pitch=.34;distance=radius*3.2;pan=[0,0,0];dirty=true};document.getElementById('reset').onclick=reset;document.getElementById('front').onclick=()=>{yaw=Math.PI/2;pitch=.05;dirty=true};document.getElementById('side').onclick=()=>{yaw=0;pitch=.05;dirty=true};document.getElementById('top').onclick=()=>{yaw=Math.PI/2;pitch=1.5;dirty=true};document.getElementById('projection').onclick=e=>{perspective=!perspective;e.target.textContent=perspective?'Orthographic':'Perspective';dirty=true};document.getElementById('edges').onclick=e=>{edges=!edges;e.target.textContent=edges?'Edges on':'Edges off';dirty=true};document.getElementById('save').onclick=()=>{canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='lego-exterior.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});};canvas.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')reset();if(e.key==='ArrowLeft'){yaw-=.15;dirty=true;}if(e.key==='ArrowRight'){yaw+=.15;dirty=true;}if(e.key==='ArrowUp'){pitch=Math.min(1.5,pitch+.1);dirty=true;}if(e.key==='ArrowDown'){pitch=Math.max(-1.4,pitch-.1);dirty=true;}});window.addEventListener('resize',()=>dirty=true);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='Graphics context lost. Reload this preview.';});status.textContent=`${D.stats.instanced_triangles.toLocaleString()} actual part triangles · shared geometry`;window.legoPreview={revisionId:D.revision_id,stats:D.stats,reset,setView:(a,b)=>{yaw=a;pitch=b;dirty=true;},canvas};render();
}catch(error){document.getElementById('error').style.display='block';document.getElementById('error').textContent=error.message;status.textContent='Preview could not initialize';console.error(error);}
})();
</script></body></html>'''
