import * as THREE from './vendor/three.module.js';
import { surfaceMaterial } from './materials.js';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smooth(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function groundHeight(x, z) {
  const pad = Math.max(Math.abs(x) / 39, Math.abs(z) / 30);
  const wave = Math.sin(x * .034) * .7 + Math.cos(z * .029 + x * .012) * .55 + Math.sin((x + z) * .07) * .22;
  let height = wave * 1.8 * smooth(.85, 1.7, Math.hypot(x / 80, (z + 6) / 72));
  if (z < -48) height = Math.min(height, -smooth(-48, -64, z) * 1.7);
  if (pad < 1.05) height = Math.min(height, (pad - .2) * .35);
  return height - .78;
}

function place(mesh, count, write) {
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    write(dummy, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
}

export function buildGrounds(parent, stage, quality = 1) {
  const seg = [20, 40, 56][quality] ?? 40;
  const geo = new THREE.PlaneGeometry(260, 240, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const color = new Float32Array(pos.count * 3);
  const look = [
    {grass: [.46, .55, .30], soil: [.50, .40, .26], rock: [.58, .55, .48], mud: [.36, .34, .26]},
    {grass: [.34, .40, .30], soil: [.34, .32, .28], rock: [.45, .48, .50], mud: [.28, .32, .30]},
    {grass: [.50, .58, .48], soil: [.42, .46, .42], rock: [.55, .62, .60], mud: [.40, .48, .46]},
  ][stage];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const pad = Math.max(Math.abs(x) / 39, Math.abs(z) / 30);
    const height = groundHeight(x, z);
    pos.setY(i, height);
    const rock = smooth(1.2, 6, height);
    const shore = z < -44 ? smooth(-44, -60, z) : 0;
    const yard = pad < 1.2 ? 1 - smooth(1, 1.2, pad) : 0;
    const tint = yard ? look.soil : shore ? look.mud : look.grass;
    color[i * 3] = mix(tint[0], look.rock[0], rock);
    color[i * 3 + 1] = mix(tint[1], look.rock[1], rock);
    color[i * 3 + 2] = mix(tint[2], look.rock[2], rock);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.computeVertexNormals();
  if (quality > 0) geo.computeTangents();
  const earth = surfaceMaterial('earth', stage, [14, 12], quality);
  earth.vertexColors = true;
  const ground = new THREE.Mesh(geo, earth);
  ground.receiveShadow = true;
  ground.castShadow = false;
  parent.add(ground);

  const ridgeGeo = new THREE.PlaneGeometry(300, 78, Math.max(12, seg), 8);
  ridgeGeo.rotateX(-Math.PI / 2);
  const ridgePos = ridgeGeo.attributes.position;
  for (let i = 0; i < ridgePos.count; i++) {
    const x = ridgePos.getX(i);
    const z = ridgePos.getZ(i);
    const crest = Math.abs(Math.sin(x * .018)) * 16 + Math.cos(x * .041) * 6 + (1 - Math.abs(z) / 39) * 10;
    ridgePos.setY(i, Math.max(0, crest));
  }
  ridgeGeo.computeVertexNormals();
  const ridge = new THREE.Mesh(ridgeGeo, surfaceMaterial('earth', stage, [4, 1], 0));
  ridge.position.set(0, -1, -102);
  ridge.castShadow = false;
  ridge.receiveShadow = false;
  parent.add(ridge);

  const waterMat = surfaceMaterial('water', stage, [6, 2], quality);
  waterMat.transparent = true;
  waterMat.opacity = .9;
  waterMat.roughness = .18;
  waterMat.depthWrite = false;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(170, 46), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.35, -78);
  water.castShadow = false;
  water.receiveShadow = true;
  parent.add(water);

  const concrete = surfaceMaterial('floor', stage, [3, 1], quality);
  for (const [w, d, x, z] of [[78, 2.4, 0, 28.7], [78, 2.4, 0, -28.7], [2.2, 56, 37.5, 0], [2.2, 56, -37.5, 0]]) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w, .16, d), concrete);
    apron.position.set(x, -.16, z);
    apron.castShadow = false;
    apron.receiveShadow = true;
    parent.add(apron);
  }

  const pier = surfaceMaterial('plaster', stage, [1, 2], quality);
  for (const x of [-37.15, 37.15]) {
    for (let z = -24; z <= 24; z += 8) {
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(.7, 3.4, .62), pier);
      buttress.position.set(x > 0 ? 36.7 : -36.7, 1.5, z);
      buttress.castShadow = true;
      buttress.receiveShadow = true;
      parent.add(buttress);
    }
  }

  const trees = [14, 34, 48][quality] ?? 34;
  const foliageColors = [0x6f8f48, 0x667858, 0x7f9a78];
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.16, .26, 2.2, 6), surfaceMaterial('wood', stage, [1, 2], 0), trees);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.35, 2.6, 7), new THREE.MeshStandardMaterial({
    color: foliageColors[stage], roughness: .86,
  }), trees);
  const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(.85, 1.7, 7), new THREE.MeshStandardMaterial({
    color: stage === 1 ? 0x556848 : stage === 2 ? 0x6d8b72 : 0x5e7c3c, roughness: .84,
  }), trees);
  const next = rand(90 + stage * 13);
  place(trunks, trees, dummy => {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      x = (next() - .5) * 200;
      z = (next() - .5) * 150;
      const inside = Math.abs(x) < 42 && Math.abs(z) < 34;
      const waterlogged = z < -64;
      const inCamera = x > 18 && z > 36;
      if (!inside && !waterlogged && !inCamera) break;
    }
    const scale = .75 + next() * (stage === 2 ? .7 : 1.15);
    dummy.position.set(x, groundHeight(x, z) + scale * 1.05, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, next() * Math.PI, 0);
  });
  parent.add(trunks);

  const matrix = new THREE.Matrix4();
  const lifted = new THREE.Matrix4();
  const up = new THREE.Matrix4().makeTranslation(0, 2.15, 0);
  for (let i = 0; i < trees; i++) {
    trunks.getMatrixAt(i, matrix);
    lifted.multiplyMatrices(matrix, up);
    crowns.setMatrixAt(i, lifted);
  }
  crowns.instanceMatrix.needsUpdate = true;
  crowns.castShadow = false;
  parent.add(crowns);
  const higher = new THREE.Matrix4().makeTranslation(0, 3.15, 0);
  for (let i = 0; i < trees; i++) {
    trunks.getMatrixAt(i, matrix);
    lifted.multiplyMatrices(matrix, higher);
    tops.setMatrixAt(i, lifted);
  }
  tops.instanceMatrix.needsUpdate = true;
  tops.castShadow = false;
  parent.add(tops);

  const rockCount = [8, 18, 26][quality] ?? 18;
  const rocks = new THREE.InstancedMesh(
    new THREE.SphereGeometry(.7, 5, 4),
    surfaceMaterial('earth', stage, [1, 1], 0),
    rockCount,
  );
  const rockRand = rand(300 + stage);
  place(rocks, rockCount, dummy => {
    const side = rockRand() > .5 ? 1 : -1;
    const x = side * (46 + rockRand() * 50);
    const z = (rockRand() - .5) * 90;
    dummy.position.set(x, groundHeight(x, z) + .2, z);
    dummy.scale.set(1 + rockRand(), .45 + rockRand() * .4, 1 + rockRand());
    dummy.rotation.set(rockRand(), rockRand() * 3, rockRand());
  });
  parent.add(rocks);

  const shrubCount = stage === 2 ? 16 : stage === 0 ? 10 : 4;
  const shrubs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(.55, 7, 5),
    new THREE.MeshStandardMaterial({color: foliageColors[stage], roughness: .9}),
    shrubCount,
  );
  const shrubRand = rand(510 + stage);
  place(shrubs, shrubCount, dummy => {
    const side = shrubRand() > .5 ? 1 : -1;
    const x = side * (40 + shrubRand() * 4);
    const z = (shrubRand() - .5) * 48;
    dummy.position.set(x, groundHeight(x, z) + .2, z);
    dummy.scale.set(1.2, .7, 1.1);
  });
  parent.add(shrubs);

  return waterMat;
}
