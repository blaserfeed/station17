import assert from 'node:assert/strict';
import * as THREE from '../static/vendor/three.module.js';
import {batchStaticMeshes} from '../static/batching.js';

const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0x888888});
for(let i=0;i<6;i++){
 const group=new THREE.Group();group.position.set(i*2,0,0);group.rotation.y=i*.1;root.add(group);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.position.y=.5;group.add(mesh);
}
const dynamic=new THREE.Group();root.add(dynamic);
const wheel=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);dynamic.add(wheel);
const hidden=new THREE.Group();hidden.visible=false;root.add(hidden);
const hiddenMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);hidden.add(hiddenMesh);
const before=new THREE.Box3().setFromObject(root,true);
assert.equal(batchStaticMeshes(root,[dynamic]),5);
assert.equal(wheel.parent,dynamic);assert.equal(hiddenMesh.parent,hidden);
const after=new THREE.Box3().setFromObject(root,true);
assert(before.min.distanceTo(after.min)<1e-5);assert(before.max.distanceTo(after.max)<1e-5);
assert(root.getObjectByName('station-static-batch'));
console.log('PASS batching preserves transforms, hidden props and moving parts');
