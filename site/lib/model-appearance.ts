import { Material, MeshBasicMaterial, MeshStandardMaterial } from "three";

/** A color inspection copy. Maps stay shared; the original GLB is untouched. */
export function baseColorMaterial(source: Material): Material {
  if (!(source instanceof MeshStandardMaterial || source instanceof MeshBasicMaterial)) return source.clone();
  return new MeshBasicMaterial({
    color: source.color.clone(), map: source.map, vertexColors: source.vertexColors,
    opacity: source.opacity, transparent: source.transparent, alphaTest: source.alphaTest,
    alphaMap: source.alphaMap, side: source.side, depthWrite: source.depthWrite,
    toneMapped: false,
  });
}
