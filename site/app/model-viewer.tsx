"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

export default function ModelViewer({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<{ reset: () => void; rotate: () => void; zoom: (factor: number) => void } | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const element = host.current!;
    const abort = new AbortController();
    let dispose = () => {};
    let stopped = false;
    setError(""); setLoaded(false);
    async function start() {
      try {
        const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
          import("three"), import("three/addons/controls/OrbitControls.js"), import("three/addons/loaders/GLTFLoader.js"),
        ]);
        const response = await fetch(`/api/jobs/${id}/files/glb`, { signal: abort.signal });
        if (!response.ok) throw new Error("Model download failed.");
        const bytes = await response.arrayBuffer();
        if (stopped) return;
        // Saved exports are self-contained. The loader creates blob URLs for
        // embedded images; no external buffer or texture request is permitted.
        let textureFailure = false;
        const manager = new THREE.LoadingManager();
        manager.setURLModifier(url => {
          if (!url.startsWith("blob:")) throw new Error("The model requested an external resource.");
          return url;
        });
        manager.onError = () => { textureFailure = true; };
        const gltf = await new GLTFLoader(manager).parseAsync(bytes, "");
        let renderer: import("three").WebGLRenderer | undefined;
        let controls: InstanceType<typeof OrbitControls> | undefined;
        let observer: ResizeObserver | undefined;
        const extraMaterials = new Set<import("three").Material>();
        const removeListeners: Array<() => void> = [];
        let disposed = false;
        dispose = () => {
          if (disposed) return;
          disposed = true;
          observer?.disconnect(); removeListeners.forEach(remove => remove()); controls?.dispose();
          const geometries = new Set<import("three").BufferGeometry>();
          const materials = new Set(extraMaterials);
          const textures = new Set<import("three").Texture>();
          const bitmaps = new Set<{ close?: () => void }>();
          gltf.scene.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            geometries.add(child.geometry);
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
          });
          for (const material of materials) for (const value of Object.values(material)) {
            if (!(value instanceof THREE.Texture)) continue;
            textures.add(value);
            if (value.image && typeof value.image === "object") bitmaps.add(value.image as { close?: () => void });
          }
          textures.forEach(texture => texture.dispose()); bitmaps.forEach(bitmap => bitmap.close?.());
          materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
          renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); actions.current = null;
        };
        if (stopped) { dispose(); return; }
        // GLTFLoader can resolve with a missing map after image decoding fails.
        if (textureFailure) throw new Error("A model texture could not be decoded.");
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#f1f5fb");
        const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute("aria-label", "Generated 3D model. Use the buttons to rotate, zoom, or reset the view.");
        element.appendChild(renderer.domElement);
        let fallback: import("three").MeshStandardMaterial | undefined;
        gltf.scene.traverse(child => {
          if (child instanceof THREE.Mesh) {
            if (!child.geometry.getAttribute("normal")) child.geometry.computeVertexNormals();
            const link = gltf.parser.associations.get(child) as { meshes?: number; primitives?: number } | undefined;
            const primitive = link?.meshes === undefined || link.primitives === undefined
              ? undefined : gltf.parser.json.meshes?.[link.meshes]?.primitives?.[link.primitives];
            // Explicit white materials and vertex colors are authored appearance.
            // Only geometry-only primitives receive the existing neutral fallback.
            if (primitive && primitive.material === undefined && primitive.attributes?.COLOR_0 === undefined) {
              fallback ??= new THREE.MeshStandardMaterial({ color: "#bacbe3", roughness: 0.78, metalness: 0.04, side: THREE.DoubleSide });
              for (const old of Array.isArray(child.material) ? child.material : [child.material]) extraMaterials.add(old);
              child.material = fallback;
            }
          }
        });
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(largest) || largest <= 0) throw new Error("Model bounds are invalid.");
        // Center and scale the view only; downloadable geometry keeps its original coordinates.
        gltf.scene.position.sub(center);
        const group = new THREE.Group(); group.add(gltf.scene); group.scale.setScalar(2 / largest); scene.add(group);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x637394, 2.8));
        const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(3, 5, 4); scene.add(key);
        const fill = new THREE.DirectionalLight(0xa9c9ff, 1.6); fill.position.set(-4, 0, -2); scene.add(fill);
        controls = new OrbitControls(camera, renderer.domElement);
        controls!.minDistance = 1.3; controls!.maxDistance = 15; controls!.enablePan = true;
        const render = () => { if (!stopped && !disposed) renderer!.render(scene, camera); };
        const reset = () => { controls!.target.set(0, 0, 0); camera.position.set(3, 2, 4).normalize().multiplyScalar(camera.aspect < 1 ? 5.5 : 4.5); controls!.update(); render(); };
        const resize = () => { const width = element.clientWidth, height = element.clientHeight; renderer!.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); render(); };
        controls!.addEventListener("change", render);
        const keyboard = (event: KeyboardEvent) => {
          const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
          if (!direction) return;
          event.preventDefault();
          const step = camera.position.distanceTo(controls!.target) * 0.06;
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
          const delta = right.multiplyScalar(direction[0] * step).add(up.multiplyScalar(direction[1] * step));
          camera.position.add(delta); controls!.target.add(delta); controls!.update(); render();
        };
        renderer.domElement.addEventListener("keydown", keyboard);
        removeListeners.push(() => renderer!.domElement.removeEventListener("keydown", keyboard));
        observer = new ResizeObserver(resize); observer.observe(element);
        const lost = (event: Event) => { event.preventDefault(); setError("The 3D display was interrupted. Reload this page, or download your model below."); };
        renderer.domElement.addEventListener("webglcontextlost", lost);
        removeListeners.push(() => renderer!.domElement.removeEventListener("webglcontextlost", lost));
        actions.current = {
          reset,
          rotate: () => { camera.position.sub(controls!.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6).add(controls!.target); controls!.update(); render(); },
          zoom: factor => { const offset = camera.position.clone().sub(controls!.target); offset.setLength(Math.min(15, Math.max(1.3, offset.length() * factor))); camera.position.copy(controls!.target).add(offset); controls!.update(); render(); },
        };
        resize(); reset(); setLoaded(true);
      } catch { dispose(); if (!stopped) setError("The 3D preview could not open on this device. Your model is saved; you can still download it below."); }
    }
    void start();
    return () => { stopped = true; abort.abort(); dispose(); };
  }, [id]);
  return <div className="model-stage">
    <div ref={host} className="three-host"/>
    {!loaded && !error && <p className="canvas-notice" role="status">Opening your model…</p>}
    {error && <p className="canvas-notice error-note" role="alert">{error}</p>}
    {loaded && !error && <div className="model-controls" aria-label="3D view controls">
      <Button variant="outline" size="icon" onClick={() => actions.current?.rotate()} aria-label="Rotate model"><RotateCcw/></Button>
      <Button variant="outline" size="icon" onClick={() => actions.current?.zoom(0.8)} aria-label="Zoom in"><ZoomIn/></Button>
      <Button variant="outline" size="icon" onClick={() => actions.current?.zoom(1.25)} aria-label="Zoom out"><ZoomOut/></Button>
      <Button variant="outline" size="icon" onClick={() => actions.current?.reset()} aria-label="Fit model to view"><Maximize/></Button>
    </div>}
  </div>;
}
