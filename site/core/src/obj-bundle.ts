import { validateGlbAndExportObj } from "./glb.ts";

type Json = Record<string, any>;
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function multiply(a: number[], b: number[]) {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, column = Math.floor(i / 4);
    return [0,1,2,3].reduce((sum,k) => sum + a[k*4+row]*b[column*4+k], 0);
  });
}
function matrix(node: Json) {
  if (node.matrix) return node.matrix;
  const [x,y,z,w] = node.rotation ?? [0,0,0,1], [sx,sy,sz] = node.scale ?? [1,1,1], [tx,ty,tz] = node.translation ?? [0,0,0];
  return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,
    (2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,
    (2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,tx,ty,tz,1];
}
const srgb = (value: number) => value <= .0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1/2.4) - .055;
const text = (value: string) => new TextEncoder().encode(value);
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit=0; bit<8; bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fixed-path, uncompressed ZIP. No user paths, remote files or archive input. */
export function zipFiles(files: Array<{ name: string; bytes: Uint8Array }>) {
  const entries = files.map(file => ({ ...file, nameBytes: text(file.name), crc: crc32(file.bytes) }));
  const bodySize = entries.reduce((size,file) => size+30+file.nameBytes.length+file.bytes.length,0);
  const directorySize = entries.reduce((size,file) => size+46+file.nameBytes.length,0);
  if (bodySize + directorySize + 22 > 40*1024*1024) throw Error("The textured OBJ export exceeds its size limit.");
  const out = new Uint8Array(bodySize+directorySize+22), view = new DataView(out.buffer);
  let offset=0, directory=bodySize;
  for (const file of entries) {
    view.setUint32(offset,0x04034b50,true); view.setUint16(offset+4,20,true);
    view.setUint32(offset+14,file.crc,true); view.setUint32(offset+18,file.bytes.length,true); view.setUint32(offset+22,file.bytes.length,true); view.setUint16(offset+26,file.nameBytes.length,true);
    out.set(file.nameBytes,offset+30); out.set(file.bytes,offset+30+file.nameBytes.length);
    view.setUint32(directory,0x02014b50,true); view.setUint16(directory+4,20,true); view.setUint16(directory+6,20,true);
    view.setUint32(directory+16,file.crc,true); view.setUint32(directory+20,file.bytes.length,true); view.setUint32(directory+24,file.bytes.length,true); view.setUint16(directory+28,file.nameBytes.length,true); view.setUint32(directory+42,offset,true);
    out.set(file.nameBytes,directory+46);
    offset+=30+file.nameBytes.length+file.bytes.length; directory+=46+file.nameBytes.length;
  }
  view.setUint32(directory,0x06054b50,true); view.setUint16(directory+8,entries.length,true); view.setUint16(directory+10,entries.length,true); view.setUint32(directory+12,directorySize,true); view.setUint32(directory+16,bodySize,true);
  return out;
}

/** Export base-color materials/UVs; GLB remains the full appearance reference. */
export function exportObjBundle(input: Uint8Array, sourceGlbSha256: string) {
  const prepared = validateGlbAndExportObj(input), glb = prepared.glb;
  const header = new DataView(glb.buffer,glb.byteOffset,glb.byteLength), jsonLength=header.getUint32(12,true);
  const json: Json = JSON.parse(new TextDecoder().decode(glb.subarray(20,20+jsonLength)));
  const bin = glb.subarray(28+jsonLength), data = new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  function accessor(id: number): number[][] {
    const a=json.accessors[id], b=json.bufferViews[a.bufferView];
    const count = ({SCALAR:1,VEC2:2,VEC3:3,VEC4:4} as Record<string,number>)[a.type];
    const size=a.componentType===5121?1:a.componentType===5123?2:4;
    return Array.from({length:a.count},(_,row)=>Array.from({length:count},(_,column)=>{
      const at=(b.byteOffset??0)+(a.byteOffset??0)+row*(b.byteStride??size*count)+column*size;
      const value=a.componentType===5126?data.getFloat32(at,true):a.componentType===5125?data.getUint32(at,true):a.componentType===5123?data.getUint16(at,true):data.getUint8(at);
      return a.normalized?value/(a.componentType===5121?255:65535):value;
    }));
  }
  const files: Array<{name:string;bytes:Uint8Array}> = [];
  const images=(json.images??[]).map((img: Json,index:number)=>{
    const name=`textures/${index}.${img.mimeType==="image/png"?"png":"jpg"}`, b=json.bufferViews[img.bufferView];
    files.push({name,bytes:bin.subarray(b.byteOffset??0,(b.byteOffset??0)+b.byteLength)}); return name;
  });
  const mtl=["# LEGO Builder base-color material export"];
  for (const [index,material] of (json.materials??[]).entries()) {
    const pbr=material.pbrMetallicRoughness??{}, factor=pbr.baseColorFactor??[1,1,1,1];
    mtl.push(`newmtl material_${index}`,`Kd ${factor.slice(0,3).map(srgb).join(" ")}`,"illum 1");
    if (material.alphaMode && material.alphaMode!=="OPAQUE") mtl.push(`d ${factor[3]}`);
    if(pbr.baseColorTexture) {
      const texture=json.textures[pbr.baseColorTexture.index], sampler=json.samplers?.[texture.sampler];
      mtl.push(`map_Kd ${sampler?.wrapS===33071&&sampler?.wrapT===33071?"-clamp on ":""}${images[texture.source]}`);
    }
    mtl.push("");
  }
  mtl.push("newmtl material_default","Kd 1 1 1","illum 1","");
  const obj=["# LEGO Builder textured OBJ", "# Keep this file with model.mtl and textures/", "mtllib model.mtl"];
  let base=0,uvBase=0,primitiveNumber=0;
  function visit(id:number,parent:number[]) {
    const node=json.nodes[id],world=multiply(parent,matrix(node));
    for(const primitive of json.meshes?.[node.mesh]?.primitives??[]) {
      const attrs=primitive.attributes,positions=accessor(attrs.POSITION),colors=attrs.COLOR_0===undefined?null:accessor(attrs.COLOR_0);
      const material=json.materials?.[primitive.material], uvSet=material?.pbrMetallicRoughness?.baseColorTexture?.texCoord??0;
      const uv=attrs[`TEXCOORD_${uvSet}`]===undefined?null:accessor(attrs[`TEXCOORD_${uvSet}`]);
      obj.push(`o mesh_${primitiveNumber++}`,`usemtl ${primitive.material===undefined?"material_default":`material_${primitive.material}`}`);
      for (let i=0;i<positions.length;i++) {
        const [x,y,z]=positions[i],point=[world[0]*x+world[4]*y+world[8]*z+world[12],world[1]*x+world[5]*y+world[9]*z+world[13],world[2]*x+world[6]*y+world[10]*z+world[14]];
        obj.push(`v ${point.join(" ")}${colors?` ${colors[i].slice(0,3).map(srgb).join(" ")}`:""}`);
      }
      if(uv) for(const [u,v] of uv) obj.push(`vt ${u} ${1-v}`);
      const indices=primitive.indices===undefined?positions.map((_,i)=>i):accessor(primitive.indices).map(v=>v[0]);
      const reflected=world[0]*(world[5]*world[10]-world[9]*world[6])-world[4]*(world[1]*world[10]-world[9]*world[2])+world[8]*(world[1]*world[6]-world[5]*world[2])<0;
      for(let i=0;i<indices.length;i+=3) {
        const face=[indices[i],indices[i+(reflected?2:1)],indices[i+(reflected?1:2)]];
        obj.push(`f ${face.map(index=>`${base+index+1}${uv?`/${uvBase+index+1}`:""}`).join(" ")}`);
      }
      base+=positions.length;if(uv)uvBase+=uv.length;
    }
    for(const child of node.children??[]) visit(child,world);
  }
  for(const root of json.scenes[json.scene??0].nodes) visit(root,identity);
  files.unshift({name:"model.obj",bytes:text(obj.join("\n")+"\n")},{name:"model.mtl",bytes:text(mtl.join("\n"))});
  files.push({name:"README.txt",bytes:text("Open model.obj with model.mtl and the textures folder together.\nThis bundle exports base-color textures, material colors and vertex RGB. Vertex RGB is an OBJ extension and requires a compatible viewer. PBR lighting, metallic/roughness, emissive appearance, transparency and unusual texture wrapping may differ in OBJ applications. Download GLB for the original retained appearance. LEGO conversion samples that GLB directly and maps to supported manufactured LEGO colors.\n")});
  files.push({name:"manifest.json",bytes:text(JSON.stringify({version:1,sourceGlbSha256,format:"obj-mtl-textures",vertexColorEncoding:"srgb-rgb-extension",fullAppearanceFormat:"glb",physicalScale:"unknown"},null,2))});
  return zipFiles(files);
}
