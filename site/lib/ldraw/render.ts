import * as THREE from 'three';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import type { ImportedRevision } from './model';
export type LoadedLDraw={revision:ImportedRevision;group:THREE.Group};
export function disposeModel(group:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>();const materials=new Set<THREE.Material>();group.traverse(obj=>{const mesh=obj as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
export async function prepareLDraw(revision:ImportedRevision):Promise<LoadedLDraw>{
  const manager=new THREE.LoadingManager();let missing='';manager.setURLModifier(url=>{missing=url;throw Error('An unresolved dependency reached the renderer.');});
  const loader=new LDrawLoader(manager);loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);loader.smoothNormals=false;
  const group=await new Promise<THREE.Group>((resolve,reject)=>loader.parse(revision.packed,resolve,reject));
  try{if(missing)throw Error(`Unresolved part: ${missing}.`);if(group.children.length!==revision.placements.length)throw Error('Some part geometry could not be rendered. The previous model has been retained.');
    group.children.forEach((child,index)=>{const p=revision.placements[index];const [x,y,z,a,b,c,d,e,f,g,h,i]=p.transform;child.matrixAutoUpdate=false;child.matrix.set(a,b,c,x,d,e,f,y,g,h,i,z,0,0,0,1);child.userData.placementId=p.id;child.userData.step=p.step;let faces=0;child.traverse(obj=>{const mesh=obj as THREE.Mesh;const attr=mesh.geometry?.getAttribute('position');if(attr){for(let k=0;k<attr.count;k++)if(!Number.isFinite(attr.getX(k))||!Number.isFinite(attr.getY(k))||!Number.isFinite(attr.getZ(k)))throw Error(`Invalid geometry in ${p.part}.`);if(mesh.isMesh)faces+=attr.count;}});if(!faces)throw Error(`Part ${p.part} contains no visible surfaces.`);});
    group.updateMatrixWorld(true);return {revision,group};
  }catch(error){disposeModel(group);throw error;}
}
