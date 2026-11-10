import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const loader = new GLTFLoader();
const groundedBlend = 14;
export const JUMP = {takeoff: .15, land: .66, end: .90};
export const WALK_SPEED = 1.35;
export const RUN_SPEED = 4.2;

function jumpClipTime(t) {
  // Calibrate the captured crouch, flight and recovery to the physics step.
  if (t < JUMP.takeoff) return t * .3 / JUMP.takeoff;
  if (t < JUMP.land) return .3 + (t - JUMP.takeoff) * .50 / (JUMP.land - JUMP.takeoff);
  return .80 + (t - JUMP.land) * .283 / (JUMP.end - JUMP.land);
}

function makeCurve(milestones) {
  return function(t) {
    if (t <= milestones[0][0]) return milestones[0][1];
    if (t >= milestones[milestones.length - 1][0]) return milestones[milestones.length - 1][1];
    for (let i = 0; i < milestones.length - 1; i++) {
      const [t0, v0] = milestones[i];
      const [t1, v1] = milestones[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        const smooth = 0.5 - 0.5 * Math.cos(f * Math.PI);
        return v0 + (v1 - v0) * smooth;
      }
    }
    return 0;
  };
}

function trackQuats(track) {
  const times = track.times;
  const values = track.values;
  const stride = values.length / times.length;
  const cubic = stride === 12;
  const quats = [];
  for (let i = 0; i < times.length; i++) {
    const o = i * stride + (cubic ? 4 : 0);
    const x = values[o], y = values[o + 1], z = values[o + 2], w = values[o + 3];
    const len = Math.hypot(x, y, z, w) || 1;
    quats.push([x / len, y / len, z / len, w / len]);
  }
  return quats;
}

function thighPitch(q) {
  return 2 * Math.atan2(q[0], q[3]);
}

function feetFrozen(track) {
  if (!track || track.times.length < 3) return true;
  const quats = trackQuats(track);
  const a = quats[0];
  let drift = 0;
  for (const q of quats) {
    drift = Math.max(drift, 1 - Math.abs(a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + a[3] * q[3]));
  }
  return drift < .025;
}

// Walk clips keep the legs moving but ship with locked ankles, so the shoes skate.
// Jog already has a planted foot. Copy that pose onto the walk, matched by thigh angle.
function graftFeet(target, source) {
  for (const side of ['l', 'r']) {
    const footName = `foot_${side}.quaternion`;
    const thighName = `thigh_${side}.quaternion`;
    const targetFoot = target.tracks.find(t => t.name === footName);
    const targetThigh = target.tracks.find(t => t.name === thighName);
    const sourceFoot = source.tracks.find(t => t.name === footName);
    const sourceThigh = source.tracks.find(t => t.name === thighName);
    if (!targetThigh || !sourceFoot || !sourceThigh || (targetFoot && !feetFrozen(targetFoot))) continue;
    const srcFoot = trackQuats(sourceFoot);
    const srcPitch = trackQuats(sourceThigh).map(thighPitch);
    const dstPitch = trackQuats(targetThigh);
    const srcTimes = sourceThigh.times;
    const dstTimes = targetThigh.times;
    const srcDur = source.duration || srcTimes[srcTimes.length - 1] || 1;
    const dstDur = target.duration || dstTimes[dstTimes.length - 1] || 1;
    const values = new Float32Array(dstTimes.length * 4);
    for (let i = 0; i < dstTimes.length; i++) {
      const ang = thighPitch(dstPitch[i]);
      const phaseHint = dstTimes[i] / dstDur;
      let best = 0, bestD = Infinity;
      for (let j = 0; j < srcTimes.length; j++) {
        let dp = Math.abs(srcTimes[j] / srcDur - phaseHint);
        dp = Math.min(dp, 1 - dp);
        let da = Math.abs(srcPitch[j] - ang);
        da = Math.min(da, Math.PI * 2 - da);
        const d = da + dp * .5;
        if (d < bestD) { bestD = d; best = j; }
      }
      values.set(srcFoot[best], i * 4);
    }
    const repaired = new THREE.QuaternionKeyframeTrack(footName, dstTimes.slice(), values);
    const index = target.tracks.findIndex(t => t.name === footName);
    if (index >= 0) target.tracks[index] = repaired;
    else target.tracks.push(repaired);
  }
}

function leadShift(walk, run) {
  const a = walk?.tracks.find(t => t.name === 'thigh_l.quaternion');
  const b = run?.tracks.find(t => t.name === 'thigh_l.quaternion');
  if (!a || !b) return 0;
  const sample = track => {
    const quats = trackQuats(track);
    const dur = track.times[track.times.length - 1] || 1;
    const angles = [];
    for (let i = 0; i < 48; i++) {
      const u = i / 48;
      let best = 0, bestD = Infinity;
      for (let k = 0; k < track.times.length; k++) {
        let d = Math.abs(track.times[k] / dur - u);
        d = Math.min(d, 1 - d);
        if (d < bestD) { bestD = d; best = k; }
      }
      angles.push(thighPitch(quats[best]));
    }
    return angles;
  };
  const A = sample(a), B = sample(b);
  let best = 0, bestDot = -Infinity;
  for (let shift = 0; shift < 48; shift++) {
    let dot = 0;
    for (let i = 0; i < 48; i++) dot += A[i] * B[(i + shift) % 48];
    if (dot > bestDot) { bestDot = dot; best = shift; }
  }
  return best / 48;
}

const _sceneQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _aimed = new THREE.Quaternion();
const _boneY = new THREE.Vector3();
const _boneZ = new THREE.Vector3();
const _boneX = new THREE.Vector3();
const _twist = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _spineYaw = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _hip = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _span = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _poleDir = new THREE.Vector3();
const _standDir = new THREE.Vector3();
const _want = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _standWorld = new THREE.Quaternion();
const _newWorld = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const STANCE = 0.62;

// Bone local +Y runs to the child. Point it along dirWorld and keep local +Z near twistWorld,
// so the arm can swing without inheriting the clip's phone-grip twist.
function aimLimb(bone, dirWorld, twistWorld, influence) {
  if (!bone || influence < 0.02) return;
  const parent = bone.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_parentQ);
  _boneY.copy(dirWorld).normalize().applyQuaternion(_parentQ.invert());
  _twist.copy(twistWorld).applyQuaternion(_parentQ);
  _boneZ.copy(_twist).addScaledVector(_boneY, -_twist.dot(_boneY));
  if (_boneZ.lengthSq() < 1e-8) _boneZ.set(0, 0, 1);
  _boneZ.normalize();
  _boneX.crossVectors(_boneY, _boneZ).normalize();
  _basis.makeBasis(_boneX, _boneY, _boneZ);
  _aimed.setFromRotationMatrix(_basis);
  bone.quaternion.slerp(_aimed, influence);
  bone.updateMatrixWorld(true);
}

function toWorld(sceneQ, x, y, z, out) {
  return out.set(x, y, z).normalize().applyQuaternion(sceneQ);
}

// Hang the arms, then swing them opposite the leading foot.
// The forearm lags the shoulder, so the elbow leads and the hand stays relaxed.
function naturalArms(scene, upperSwing, foreSwing, influence, rest) {
  if (influence < 0.02) return;
  scene.updateWorldMatrix(true, true);
  scene.getWorldQuaternion(_sceneQ);
  const spine = scene.getObjectByName('spine_01');
  if (spine) {
    _spineYaw.setFromAxisAngle(_up, -upperSwing * 0.18);
    spine.quaternion.multiply(_spineYaw);
    spine.updateMatrixWorld(true);
  }
  const dir = new THREE.Vector3();
  const twist = new THREE.Vector3();
  const pose = (bone, dx, dy, dz, tx, ty, tz) => {
    toWorld(_sceneQ, dx, dy, dz, dir);
    toWorld(_sceneQ, tx, ty, tz, twist);
    aimLimb(bone, dir, twist, influence);
  };
  pose(scene.getObjectByName('upperarm_l'), 0.16, -1, upperSwing * 0.72, 0, 0.2, 1);
  pose(scene.getObjectByName('upperarm_r'), -0.16, -1, -upperSwing * 0.72, 0, 0.2, 1);
  pose(scene.getObjectByName('lowerarm_l'), 0.05, -1, foreSwing * 0.2, 0, 0.15, 1);
  pose(scene.getObjectByName('lowerarm_r'), -0.05, -1, -foreSwing * 0.2, 0, 0.15, 1);
  pose(scene.getObjectByName('hand_l'), 0.02, -1, foreSwing * 0.12, -1, 0.05, 0.15);
  pose(scene.getObjectByName('hand_r'), -0.02, -1, -foreSwing * 0.12, 1, 0.05, 0.15);
  if (!rest) return;
  scene.traverse(bone => {
    if (!bone.isBone || !/index|middle|thumb|ring|pinky/i.test(bone.name)) return;
    const bind = rest.get(bone.name);
    if (bind) bone.quaternion.slerp(bind, influence);
  });
}

// One foot's path through a full cycle. t=0 is heel strike, then flat, toe-off, swing.
function footStep(t, travel, lift) {
  t = ((t % 1) + 1) % 1;
  const front = travel * 0.42;
  const back = -travel * 0.58;
  if (t < STANCE) {
    const u = t / STANCE;
    const z = front + (back - front) * u;
    let y = 0;
    if (u > 0.78) y = ((u - 0.78) / 0.22) * lift * 0.4;
    let pitch = 0.45 * (1 - Math.min(1, u / 0.14));
    if (u > 0.7) pitch = -0.8 * ((u - 0.7) / 0.3);
    return {z, y, pitch};
  }
  const u = (t - STANCE) / (1 - STANCE);
  const s = u * u * (3 - 2 * u);
  const z = back + (front - back) * s;
  const y = Math.sin(u * Math.PI) * lift;
  const pitch = THREE.MathUtils.lerp(-0.65, 0.48, s);
  return {z, y, pitch};
}

function solveKnee(hip, ankle, upper, lower, pole, out) {
  _span.subVectors(ankle, hip);
  let dist = _span.length() || 0.001;
  const max = upper + lower - 1e-4;
  const min = Math.abs(upper - lower) + 1e-4;
  dist = Math.min(max, Math.max(min, dist));
  const cosA = THREE.MathUtils.clamp((upper * upper + dist * dist - lower * lower) / (2 * upper * dist), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _dir.copy(_span).multiplyScalar(1 / _span.length());
  _poleDir.subVectors(pole, hip).addScaledVector(_dir, -_poleDir.dot(_dir));
  if (_poleDir.lengthSq() < 1e-8) _poleDir.set(0, 1, 0);
  _poleDir.normalize();
  return out.copy(hip).addScaledVector(_dir, cosA * upper).addScaledVector(_poleDir, sinA * upper);
}

// Rotate a stand-pose bone onto a new direction without rolling the limb.
function aimFromStand(bone, captured, standDir, wantWorld, sceneQ, influence) {
  if (!bone || !captured || influence < 0.02) return;
  _standDir.copy(standDir).applyQuaternion(sceneQ);
  if (_standDir.lengthSq() < 1e-8 || wantWorld.lengthSq() < 1e-8) return;
  _standDir.normalize();
  _want.copy(wantWorld).normalize();
  _delta.setFromUnitVectors(_standDir, _want);
  _standWorld.copy(sceneQ).multiply(captured.world);
  _newWorld.copy(_delta).multiply(_standWorld);
  bone.parent.getWorldQuaternion(_parentQ);
  _aimed.copy(_parentQ.invert()).multiply(_newWorld);
  bone.quaternion.slerp(_aimed, influence);
  bone.updateMatrixWorld(true);
}

function pitchFoot(bone, captured, pitch, sceneQ, influence) {
  if (!bone || !captured || influence < 0.02) return;
  _axis.set(1, 0, 0).applyQuaternion(sceneQ);
  _delta.setFromAxisAngle(_axis, pitch);
  _standWorld.copy(sceneQ).multiply(captured.world);
  _newWorld.copy(_delta).multiply(_standWorld);
  bone.parent.getWorldQuaternion(_parentQ);
  _aimed.copy(_parentQ.invert()).multiply(_newWorld);
  bone.quaternion.slerp(_aimed, influence);
  bone.updateMatrixWorld(true);
}

function placeLeg(scene, side, step, influence, stand, sceneQ) {
  const spec = stand.legs[side];
  const thigh = scene.getObjectByName(`thigh_${side}`);
  const calf = scene.getObjectByName(`calf_${side}`);
  const foot = scene.getObjectByName(`foot_${side}`);
  if (!spec || !thigh || !calf || !foot) return;
  thigh.getWorldPosition(_hip);
  _ankle.set(spec.footX, spec.footY + step.y, step.z);
  scene.localToWorld(_ankle);
  _pole.set(side === 'l' ? 0.25 : -0.25, 0.2, 1).applyQuaternion(sceneQ).add(_hip);
  solveKnee(_hip, _ankle, spec.upper, spec.lower, _pole, _knee);
  aimFromStand(thigh, stand.bones[`thigh_${side}`], spec.thighDir, _want.subVectors(_knee, _hip), sceneQ, influence);
  calf.getWorldPosition(_knee);
  aimFromStand(calf, stand.bones[`calf_${side}`], spec.calfDir, _want.subVectors(_ankle, _knee), sceneQ, influence);
  // The shoe is not parented to the calf; its translation is what plants it.
  if (foot.parent) {
    foot.parent.worldToLocal(_ankle);
    foot.position.lerp(_ankle, influence);
    foot.updateMatrixWorld(true);
  }
  pitchFoot(foot, stand.bones[`foot_${side}`], step.pitch, sceneQ, influence);
}

// The captured walk is a crouch with locked ankles. Build a heel-toe gait from the standing pose.
function humanGait(scene, cycle, influence, stand, travel, lift) {
  if (!stand || influence < 0.02) return;
  const pelvis = scene.getObjectByName('pelvis');
  if (pelvis && stand.pelvis) {
    const bob = 0.016 * Math.abs(Math.sin(cycle * Math.PI * 2));
    const sway = Math.sin(cycle * Math.PI * 2) * 0.02;
    pelvis.position.z = THREE.MathUtils.lerp(pelvis.position.z, stand.pelvis.z - bob, influence);
    pelvis.position.x = THREE.MathUtils.lerp(pelvis.position.x, stand.pelvis.x + sway, influence);
  }
  for (const name of ['spine_01', 'spine_02', 'neck_01', 'head']) {
    const bone = scene.getObjectByName(name);
    const captured = stand.bones[name];
    if (bone && captured) bone.quaternion.slerp(captured.local, influence * 0.9);
  }
  scene.updateWorldMatrix(true, true);
  const stanceTravel = travel * STANCE;
  let drop = 0;
  for (const [side, t] of [['l', cycle], ['r', cycle + 0.5]]) {
    const spec = stand.legs[side];
    const thigh = scene.getObjectByName(`thigh_${side}`);
    if (!spec || !thigh) continue;
    const step = footStep(t, stanceTravel, lift);
    thigh.getWorldPosition(_hip);
    _ankle.set(spec.footX, spec.footY + step.y, step.z);
    scene.localToWorld(_ankle);
    const horiz = Math.hypot(_ankle.x - _hip.x, _ankle.z - _hip.z);
    const reach = (spec.upper + spec.lower) * 0.98;
    const vertical = Math.sqrt(Math.max(0, reach * reach - horiz * horiz));
    drop = Math.max(drop, _hip.y - (_ankle.y + vertical));
  }
  drop = Math.min(drop, 0.06);
  if (pelvis && drop > 0) {
    pelvis.parent.getWorldScale(_span);
    pelvis.position.z -= drop / (_span.x || 1);
    pelvis.updateMatrixWorld(true);
  }
  scene.updateWorldMatrix(true, true);
  scene.getWorldQuaternion(_sceneQ);
  placeLeg(scene, 'l', footStep(cycle, stanceTravel, lift), influence, stand, _sceneQ);
  placeLeg(scene, 'r', footStep(cycle + 0.5, stanceTravel, lift), influence, stand, _sceneQ);
}

function captureStand(scene) {
  scene.updateMatrixWorld(true);
  const bones = {};
  const worldQ = new THREE.Quaternion();
  for (const name of ['spine_01', 'spine_02', 'neck_01', 'head', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']) {
    const bone = scene.getObjectByName(name);
    if (!bone) continue;
    bone.getWorldQuaternion(worldQ);
    bones[name] = {local: bone.quaternion.clone(), world: worldQ.clone()};
  }
  const legs = {};
  const hip = new THREE.Vector3();
  const knee = new THREE.Vector3();
  const ankle = new THREE.Vector3();
  for (const side of ['l', 'r']) {
    const thigh = scene.getObjectByName(`thigh_${side}`);
    const calf = scene.getObjectByName(`calf_${side}`);
    const foot = scene.getObjectByName(`foot_${side}`);
    if (!thigh || !calf || !foot) continue;
    thigh.getWorldPosition(hip);
    calf.getWorldPosition(knee);
    foot.getWorldPosition(ankle);
    const local = scene.worldToLocal(ankle.clone());
    legs[side] = {
      upper: hip.distanceTo(knee),
      lower: knee.distanceTo(ankle),
      footX: local.x,
      footY: local.y,
      thighDir: knee.clone().sub(hip).normalize(),
      calfDir: ankle.clone().sub(knee).normalize(),
    };
  }
  const pelvis = scene.getObjectByName('pelvis');
  return {bones, legs, pelvis: pelvis ? pelvis.position.clone() : null};
}

export function makeJumpClip(scene) {
  const duration = 1.083;
  const numFrames = 28;
  const times = Array.from({length: numFrames}, (_, i) => +(i * duration / (numFrames - 1)).toFixed(4));
  const tracks = [];
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  // Eased curves across jump phases: crouch (0.15), takeoff (0.30), apex (0.55), touchdown (0.80), cushion (0.94), rest (1.083)
  const curves = {
    pelvisY: makeCurve([[0, 0], [0.15, -0.09], [0.30, 0.02], [0.55, 0.05], [0.80, -0.02], [0.94, -0.08], [1.083, 0]]),
    pelvisRot: makeCurve([[0, 0], [0.15, 0.08], [0.30, 0.02], [0.55, 0.0], [0.80, 0.02], [0.94, 0.07], [1.083, 0]]),
    spine1: makeCurve([[0, 0], [0.15, 0.12], [0.30, 0.04], [0.55, 0.0], [0.80, 0.04], [0.94, 0.10], [1.083, 0]]),
    spine2: makeCurve([[0, 0], [0.15, 0.08], [0.30, 0.03], [0.55, 0.0], [0.80, 0.03], [0.94, 0.06], [1.083, 0]]),
    neck: makeCurve([[0, 0], [0.15, -0.06], [0.30, -0.02], [0.55, 0.0], [0.80, -0.02], [0.94, -0.05], [1.083, 0]]),
    head: makeCurve([[0, 0], [0.15, -0.06], [0.30, -0.02], [0.55, 0.0], [0.80, 0.0], [0.94, -0.04], [1.083, 0]]),
    clavL: makeCurve([[0, 0], [0.15, 0.04], [0.30, -0.06], [0.55, -0.05], [0.80, -0.02], [0.94, 0.02], [1.083, 0]]),
    clavR: makeCurve([[0, 0], [0.15, -0.04], [0.30, 0.06], [0.55, 0.05], [0.80, 0.02], [0.94, -0.02], [1.083, 0]]),
    thigh: makeCurve([[0, 0], [0.15, -0.32], [0.30, -0.08], [0.55, -0.38], [0.80, -0.12], [0.94, -0.30], [1.083, 0]]),
    calf: makeCurve([[0, 0], [0.15, 0.60], [0.30, 0.14], [0.55, 0.55], [0.80, 0.18], [0.94, 0.58], [1.083, 0]]),
    foot: makeCurve([[0, 0], [0.15, -0.25], [0.30, 0.22], [0.55, 0.10], [0.80, 0.05], [0.94, -0.24], [1.083, 0]]),
    arm: makeCurve([[0, 0], [0.15, -0.35], [0.30, 0.38], [0.55, 0.32], [0.80, 0.18], [0.94, 0.15], [1.083, 0]]),
    forearm: makeCurve([[0, 0], [0.15, 0.30], [0.30, 0.40], [0.55, 0.35], [0.80, 0.20], [0.94, 0.18], [1.083, 0]]),
  };

  function addQuatCurve(name, curveFunc, axis = axisX) {
    const obj = scene.getObjectByName(name);
    if (!obj) return;
    const base = obj.quaternion.clone();
    const values = [];
    for (let i = 0; i < times.length; i++) {
      const a = curveFunc(times[i]);
      const dq = new THREE.Quaternion().setFromAxisAngle(axis, a);
      const q = base.clone().multiply(dq).normalize();
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  }

  function addPelvisPos() {
    const obj = scene.getObjectByName('pelvis');
    if (!obj) return;
    const base = obj.position.clone();
    const values = [];
    for (let i = 0; i < times.length; i++) {
      const dy = curves.pelvisY(times[i]);
      values.push(base.x, base.y + dy, base.z);
    }
    const track = new THREE.VectorKeyframeTrack('pelvis.position', times, values);
    track.setInterpolation(THREE.InterpolateSmooth);
    tracks.push(track);
  }

  addPelvisPos();
  addQuatCurve('pelvis', curves.pelvisRot);
  addQuatCurve('spine_01', curves.spine1);
  addQuatCurve('spine_02', curves.spine2);
  addQuatCurve('neck_01', curves.neck);
  addQuatCurve('head', curves.head);
  addQuatCurve('clavicle_l', curves.clavL, axisZ);
  addQuatCurve('clavicle_r', curves.clavR, axisZ);
  addQuatCurve('thigh_l', curves.thigh);
  addQuatCurve('thigh_r', curves.thigh);
  addQuatCurve('calf_l', curves.calf);
  addQuatCurve('calf_r', curves.calf);
  addQuatCurve('foot_l', curves.foot);
  addQuatCurve('foot_r', curves.foot);
  addQuatCurve('upperarm_l', curves.arm);
  addQuatCurve('upperarm_r', curves.arm);
  addQuatCurve('lowerarm_l', curves.forearm);
  addQuatCurve('lowerarm_r', curves.forearm);

  return new THREE.AnimationClip('Jump', duration, tracks);
}

export function person(name) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.ready = loader.loadAsync(new URL(`./assets/${name}.glb`, import.meta.url).href)
    .then(({scene, animations}) => {
      scene.traverse(part => {
        if (/phone|accessory|held/i.test(part.name)) part.visible = false;
        if (!part.isMesh) return;
        part.castShadow = true;
        part.receiveShadow = true;
        // Animation changes the silhouette beyond a mesh's static bounding box.
        if (part.isSkinnedMesh) part.frustumCulled = false;
      });
      if (!animations.some(clip => clip.name === 'Walk')) {
        const walkSource = animations.find(c => c.name === 'Walk_Brisk' || c.name === 'Jog');
        if (walkSource) {
          const walkClip = walkSource.clone();
          walkClip.name = 'Walk';
          animations.push(walkClip);
        }
      }
      if (!animations.some(clip => clip.name === 'Jump')) {
        animations.push(makeJumpClip(scene));
      }
      const donor = animations.find(c => c.name === 'Jog') || animations.find(c => c.name === 'Run');
      if (donor) {
        for (const clip of animations) {
          if (clip.name === 'Walk' || clip.name === 'Walk_Brisk') graftFeet(clip, donor);
        }
      }
      const mixer = new THREE.AnimationMixer(scene);
      const rest = new Map();
      scene.traverse(obj => {
        if (obj.isBone) rest.set(obj.name, obj.quaternion.clone());
      });
      const actions = new Map(animations.map(clip => [clip.name, mixer.clipAction(clip)]));
      for (const [name, action] of actions) {
        action.setEffectiveWeight(name === 'Idle_Standing' ? 1 : 0).play();
        if (name !== 'Idle_Standing') action.paused = true;
      }
      const walkClip = actions.get('Walk')?.getClip();
      const runClip = actions.get('Run')?.getClip();
      root.userData.rig = {scene, mixer, actions, rest, phase: 0, movement: 0, running: 0, jumping: 0, smoothedSpeed: 0, runLead: leadShift(walkClip, runClip)};
      mixer.update(0);
      scene.updateMatrixWorld(true);
      root.userData.rig.stand = captureStand(scene);
      const feet = new THREE.Box3().setFromObject(scene, true).min.y;
      root.userData.rig.idleOffset = Math.abs(feet) < .18 ? .02 - feet : 0;
      scene.position.y = root.userData.rig.idleOffset;
      root.add(scene);
      return root;
    })
    .catch(error => console.error(`Не удалось загрузить модель ${name}`, error));
  return root;
}

export function animatePerson(root, dt, distance = 0, jumpAge = null) {
  const rig = root.userData.rig;
  if (!rig) return;
  const idle = rig.actions.get('Idle_Standing');
  const walk = rig.actions.get('Walk');
  if (!walk) {
    rig.mixer.update(dt);
    naturalArms(rig.scene, 0, 0, 1, rig.rest);
    return;
  }
  const run = rig.actions.get('Run'), jump = rig.actions.get('Jump');
  
  // Smooth speed filtering to eliminate micro-jitter
  const instantSpeed = distance / Math.max(.001, dt);
  rig.smoothedSpeed = THREE.MathUtils.damp(rig.smoothedSpeed || 0, instantSpeed, 14, dt);
  
  const moving = THREE.MathUtils.smoothstep(rig.smoothedSpeed, 0.08, 0.80);
  rig.movement = THREE.MathUtils.damp(rig.movement, moving, groundedBlend, dt);
  
  // Run speed sits above the walk; the band matches WALK_SPEED and RUN_SPEED.
  const runTarget = THREE.MathUtils.smoothstep(rig.smoothedSpeed, 2.0, 3.2);
  rig.running = THREE.MathUtils.damp(rig.running, runTarget, 10, dt);
  rig.jumping = THREE.MathUtils.damp(rig.jumping, jumpAge === null ? 0 : 1, 21, dt);

  // One phase is two steps. The distance matches the planted foot so it does not skate.
  const cycleLen = THREE.MathUtils.lerp(1.12, 1.9, rig.running);
  if (distance > 0.0005) {
    rig.phase = (rig.phase + distance / cycleLen) % 1;
  } else if (rig.movement > 0.06) {
    const stepDecel = rig.movement * 1.15;
    rig.phase = (rig.phase + (stepDecel * dt) / cycleLen) % 1;
  }

  const grounded = 1 - rig.jumping;
  const walkPhase = rig.phase;
  const runPhase = (rig.phase + (rig.runLead || 0)) % 1;
  
  walk.time = walkPhase * walk.getClip().duration;
  run.time = runPhase * run.getClip().duration;
  
  walk.setEffectiveWeight(grounded * rig.movement * (1 - rig.running));
  run.setEffectiveWeight(grounded * rig.movement * rig.running);
  
  const idleWeight = grounded * (1 - rig.movement);
  idle.setEffectiveWeight(idleWeight);
  
  // Seamless jump animation recovery without freeze-pop
  if (jump) {
    if (jumpAge !== null) {
      jump.time = Math.min(jumpClipTime(jumpAge), jump.getClip().duration - 0.001);
    } else if (rig.jumping > 0.01) {
      jump.time = Math.min(jump.getClip().duration - 0.001, jump.time + dt * 1.2);
    }
    jump.setEffectiveWeight(rig.jumping);
  }
  
  rig.scene.position.y = THREE.MathUtils.damp(rig.scene.position.y, rig.idleOffset, 12, dt);
  rig.mixer.update(dt);
  const gait = rig.movement * (1 - rig.jumping);
  const lift = THREE.MathUtils.lerp(0.09, 0.18, rig.running);
  humanGait(rig.scene, rig.phase, gait, rig.stand, cycleLen, lift);
  // Left heel strikes at phase 0, so the left arm is back. The forearm lags.
  const armPhase = rig.phase * Math.PI * 2;
  const amp = THREE.MathUtils.lerp(1, 1.25, rig.running) * rig.movement;
  const upperSwing = -Math.cos(armPhase) * amp;
  const foreSwing = -Math.cos(armPhase - 0.5) * amp;
  naturalArms(rig.scene, upperSwing, foreSwing, 1 - rig.jumping * 0.85, rig.rest);
}

let shadowMaterial;
export function footShadow() {
  if (!shadowMaterial) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(18,30,27,.44)');
    gradient.addColorStop(.55, 'rgba(18,30,27,.18)');
    gradient.addColorStop(1, 'rgba(18,30,27,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    shadowMaterial = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
    });
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.91, .8), shadowMaterial.clone());
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

export function placeFootShadow(shadow, person) {
  shadow.visible = person.visible && Boolean(person.userData.rig);
  shadow.position.set(person.position.x, .026, person.position.z);
  const height = person.position.y;
  shadow.material.opacity = 1 / (1 + 3 * height);
  shadow.scale.setScalar(1 + .45 * height);
}
