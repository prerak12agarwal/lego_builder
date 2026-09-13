'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RotateCcw,ZoomIn,ZoomOut} from 'lucide-react';
import type {LoadedLDraw} from '@/lib/ldraw/render';
export function LDrawViewer({loaded,step=null}:{loaded:LoadedLDraw;step?:number|null}){
  const updateStep=useRef<(value:number|null)=>void>(()=>{});const liveStep=useRef(step);
  const host=useRef<HTMLDivElement>(null);const reset=useRef(()=>{});const zoom=useRef<(value:number)=>void>(()=>{});const [error,setError]=useState('');
  useEffect(()=>{liveStep.current=step;},[step]);
  // This effect synchronizes React's fallback with an imperative WebGL lifecycle.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(()=>{const element=host.current;if(!element)return;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError('3D rendering is unavailable in this browser. Parts and instruction lists are still available.');return;}
    setError('');renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xf0f3f8,1);element.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive imported LDraw model. Drag to rotate, scroll to zoom, right-drag to pan. Arrow keys rotate, plus/minus zoom, zero resets.');renderer.domElement.setAttribute('role','img');
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x7c899b,3));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-150,400,250);scene.add(sun);
    const model=loaded.group.clone(true);const ownMaterials:THREE.Material[]=[];model.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.material){const duplicate=(m:THREE.Material)=>{const copy=m.clone();ownMaterials.push(copy);return copy;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(duplicate):duplicate(mesh.material);}});
    const pivot=new THREE.Group();pivot.rotation.x=Math.PI;pivot.add(model);scene.add(pivot);pivot.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(pivot);const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());const radius=Math.max(size.length()/2,1);
    const camera=new THREE.PerspectiveCamera(35,1,Math.max(radius/10000,.001),radius*100);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=radius*.1;controls.maxDistance=radius*20;
    const grid=new THREE.GridHelper(radius*3,20,0xc7cfdb,0xe0e5ed);grid.position.set(center.x,box.min.y-.3,center.z);scene.add(grid);
    const highlights:THREE.BoxHelper[]=[];
    updateStep.current=(selected)=>{for(const h of highlights){scene.remove(h);h.geometry.dispose();(h.material as THREE.Material).dispose();}highlights.length=0;model.children.forEach((child,index)=>{const p=loaded.revision.placements[index];child.visible=selected===null||p.step<=selected;if(selected!==null&&p.step===selected){const helper=new THREE.BoxHelper(child,0x245bd6);scene.add(helper);highlights.push(helper);}});draw();};
    function draw(){renderer.render(scene,camera);}
    const fit=()=>{const aspect=element!.clientWidth/Math.max(element!.clientHeight,1);const distance=radius/Math.sin(THREE.MathUtils.degToRad(35/2))*Math.max(1,1/aspect)*1.12;camera.position.copy(center).add(new THREE.Vector3(1,.75,1.1).normalize().multiplyScalar(distance));controls.target.copy(center);controls.update();draw();};
    reset.current=fit;zoom.current=factor=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();draw();};
    const resize=()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();draw();};const observer=new ResizeObserver(resize);observer.observe(element);controls.addEventListener('change',draw);resize();fit();updateStep.current(liveStep.current);
    renderer.domElement.tabIndex=0;const keyboard=(event:KeyboardEvent)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(event.key))return;event.preventDefault();if(event.key==='0'){fit();return;}if(['+','=','-'].includes(event.key)){zoom.current(event.key==='-'?1.25:.8);return;}const offset=camera.position.clone().sub(controls.target);const spherical=new THREE.Spherical().setFromVector3(offset);if(event.key==='ArrowLeft')spherical.theta-=.15;if(event.key==='ArrowRight')spherical.theta+=.15;if(event.key==='ArrowUp')spherical.phi-=.15;if(event.key==='ArrowDown')spherical.phi+=.15;spherical.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();draw();};renderer.domElement.addEventListener('keydown',keyboard);
    const lost=(event:Event)=>{event.preventDefault();setError('The 3D session was interrupted. Switch views to reopen the model.');};renderer.domElement.addEventListener('webglcontextlost',lost);
    return()=>{updateStep.current=()=>{};renderer.domElement.removeEventListener('keydown',keyboard);observer.disconnect();controls.dispose();ownMaterials.forEach(m=>m.dispose());highlights.forEach(h=>{h.geometry.dispose();(h.material as THREE.Material).dispose();});grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[loaded]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(()=>{updateStep.current(step);},[step]);
  return <div className="ldr-viewer"><div ref={host} className="ldr-canvas"/>{error&&<p role="alert" className="ldr-render-error">{error}</p>}<div className="ldr-viewer-tools"><button aria-label="Zoom in" onClick={()=>zoom.current(.8)}><ZoomIn size={18}/></button><button aria-label="Zoom out" onClick={()=>zoom.current(1.25)}><ZoomOut size={18}/></button><button aria-label="Reset model view" onClick={()=>reset.current()}><RotateCcw size={18}/></button></div><div className="ldr-viewer-caption">{step===null?'Full model':'Blue outlines mark pieces added in this step'}<span>Drag to rotate · Scroll to zoom</span></div></div>;
}
