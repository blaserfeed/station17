import * as THREE from './vendor/three.module.js';
import { skyTexture } from './materials.js';

const ERAS = [
  {fog: 0xe6d2ae, near: 70, far: 250, sun: 0xffe2b8, sunI: 1.7, sky: 0xfff1d2, ground: 0x8a704f, fill: 0xffe0b4, exposure: .98, dust: 0xf3e2c4},
  {fog: 0xb7c8d2, near: 52, far: 220, sun: 0xd7e6f0, sunI: 1.35, sky: 0xd5e3ee, ground: 0x5c6c76, fill: 0xb7c5d0, exposure: 0.92, dust: 0xd5dde2},
  {fog: 0xc7e6e0, near: 64, far: 240, sun: 0xd9f6f1, sunI: 1.45, sky: 0xe2f3ef, ground: 0x688e8b, fill: 0xa4ddd6, exposure: .96, dust: 0xd7f3ef},
];

export function attachAtmosphere(scene, renderer) {
  const dustCount = 140;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = [];
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - .5) * 58;
    dustPos[i * 3 + 1] = Math.random() * 7.2;
    dustPos[i * 3 + 2] = (Math.random() - .5) * 46;
    dustSeed.push(Math.random() * 8);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xf4e6cc, size: .05, transparent: true, opacity: .32, depthWrite: false, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  const sparkCount = 28;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffb15a, size: .07, transparent: true, opacity: .0, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);

  const steamMat = new THREE.MeshBasicMaterial({color: 0xe7e2d6, transparent: true, opacity: .16, depthWrite: false});
  const steam = new THREE.Group();
  for (const [x, z] of [[-8, -12], [8, 6], [-8, 14], [22, -18]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 6), steamMat.clone());
    puff.position.set(x, 3.3, z);
    puff.userData.base = puff.position.clone();
    steam.add(puff);
  }
  scene.add(steam);

  const alarm = new THREE.PointLight(0xd24b3c, 0, 16, 2);
  alarm.position.set(2, 4.4, 10);
  scene.add(alarm);

  let era = 1;
  let reduced = false;
  let memory = 0;
  let quality = 1;

  function apply(world, stage) {
    era = stage;
    const look = ERAS[stage] || ERAS[1];
    if (!memory) {
      if (world.sky) {
        world.scene.background = null;
        world.sky.material.map = skyTexture(stage);
      } else world.scene.background.setHex(look.fog);
      world.scene.fog.color.setHex(look.fog);
      world.scene.fog.near = look.near;
      world.scene.fog.far = look.far;
      world.sun.color.setHex(look.sun);
      world.sun.intensity = look.sunI;
      if (world.hemi) {
        world.hemi.color.setHex(look.sky);
        world.hemi.groundColor.setHex(look.ground);
      }
      if (world.fill) world.fill.color.setHex(look.fill);
      renderer.toneMappingExposure = look.exposure;
    }
    dust.material.color.setHex(look.dust);
    dust.material.opacity = quality === 0 ? .12 : stage === 1 ? .4 : .28;
    sparks.material.opacity = quality === 0 ? 0 : stage === 1 ? .75 : stage === 0 ? .2 : 0;
    steam.visible = quality !== 0 && stage !== 2;
    alarm.intensity = 0;
  }

  function update(world, dt, t) {
    if (era === 1) {
      const pressure = world.pressure || 0;
      const flicker = reduced ? 1 : .92 + Math.sin(t * 2.1) * .08;
      alarm.intensity = [0, 26, 65][pressure] * flicker;
      world.sun.intensity = ERAS[1].sunI * [1, .82, .55][pressure];
    }
    if (reduced) return;
    const pos = dust.geometry.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      let y = pos.getY(i) + dt * (.12 + (i % 5) * .02);
      if (y > 7.4) y = .2;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t * .3 + dustSeed[i]) * dt * .08);
    }
    pos.needsUpdate = true;
    const sp = sparkGeo.attributes.position;
    if (era === 1 || era === 0) {
      for (let i = 0; i < sparkCount; i++) {
        const life = (t * 1.4 + i * .37) % 1;
        const ox = era === 1 ? -3 : 24;
        const oz = era === 1 ? 1 : -18;
        sp.setXYZ(i, ox + Math.sin(i) * life * 1.4, 1.1 + life * 1.6, oz + Math.cos(i * 1.7) * life);
      }
      sp.needsUpdate = true;
    }
    steam.children.forEach((puff, i) => {
      const k = (t * .25 + i * .2) % 1;
      puff.position.set(puff.userData.base.x, puff.userData.base.y + k * 1.4, puff.userData.base.z);
      puff.scale.setScalar(.6 + k);
      puff.material.opacity = (1 - k) * .18;
    });
    if (era !== 1) alarm.intensity = 0;
    if (memory > 0) {
      const blend = (Math.sin(t * .7) + 1) / 2;
      const a = ERAS[Math.floor(blend * 2.99)];
      const b = ERAS[(Math.floor(blend * 2.99) + 1) % 3];
      const f = (blend * 2.99) % 1;
      world.sun.color.setHex(a.sun).lerp(new THREE.Color(b.sun), f);
      world.scene.fog.color.setHex(a.fog).lerp(new THREE.Color(b.fog), f);
      if (world.sky) world.sky.visible = false;
      if (!world.scene.background?.isColor) world.scene.background = new THREE.Color();
      world.scene.background.copy(world.scene.fog.color);
    } else if (world.sky && !world.sky.visible) {
      world.sky.visible = true;
      world.scene.background = null;
    }
  }

  return {
    apply, update,
    setReduced(v) {
      reduced = !!v;
      if (reduced || quality === 0) { dust.material.opacity = .12; sparks.material.opacity = 0; steam.visible = false; alarm.intensity = 0; }
      else { steam.visible = era !== 2; sparks.material.opacity = era === 1 ? .75 : era === 0 ? .2 : 0; }
    },
    setMemory(v) { memory = v ? 1 : 0; },
    setQuality(level) {
      quality = level === 0 ? 0 : level === 2 ? 2 : 1;
      dust.material.size = quality === 0 ? .03 : .05;
      if (quality === 0) { sparks.material.opacity = 0; steam.visible = false; alarm.intensity = 0; }
    },
  };
}
