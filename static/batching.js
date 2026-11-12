import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Keep animated and hideable objects intact. Only opaque, stationary meshes
// sharing a material and vertex layout can share one draw call.
export function batchStaticMeshes(root, excluded = []) {
 const keep=new Set(excluded.filter(Boolean)),buckets=new Map();
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert();
 function visit(object) {
  if(keep.has(object)||!object.visible)return;
  if(object.isMesh&&!object.isInstancedMesh&&!object.isSkinnedMesh&&!object.name&&object.visible&&!Array.isArray(object.material)&&!object.material.transparent&&!Object.keys(object.geometry.morphAttributes).length) {
   const attributes=Object.entries(object.geometry.attributes).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join(',');
   const key=[object.material.uuid,object.castShadow,object.receiveShadow,!!object.geometry.index,attributes].join('|');
   if(!buckets.has(key))buckets.set(key,[]);
   buckets.get(key).push(object);
  }
  for(const child of object.children)visit(child);
 }
 visit(root);
 let removed=0;
 for(const objects of buckets.values()) {
  if(objects.length<4)continue;
  const geometries=objects.map(object=>object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld)));
  const geometry=mergeGeometries(geometries);
  geometries.forEach(g=>g.dispose());
  if(!geometry)continue;
  geometry.computeBoundingSphere();
  const merged=new THREE.Mesh(geometry,objects[0].material);
  merged.name='station-static-batch';merged.castShadow=objects[0].castShadow;merged.receiveShadow=objects[0].receiveShadow;
  const originals=new Set(objects.map(o=>o.geometry));
  objects.forEach(object=>object.removeFromParent());
  originals.forEach(g=>g.dispose());
  root.add(merged);removed+=objects.length-1;
 }
 return removed;
}
