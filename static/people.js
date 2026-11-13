import * as THREE from './vendor/three.module.js';
import {upperBodyClips} from './100style-upper-body.js';
import {gaitClips} from './quaternius-gait.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import {WALK_SPEED,RUN_SPEED,gaitAdvance,CLIP_FOOTFALLS,WALK_CYCLE_SECONDS,RUN_CYCLE_SECONDS} from './locomotion.js';
export {WALK_SPEED,RUN_SPEED} from './locomotion.js';

const loader = new GLTFLoader();
const groundedBlend = 14;
export const JUMP = {takeoff: .15, land: .66, end: .90};

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
// Elbows flex forward in the arm swing plane; wrists retain the captured pose.
function naturalArms(scene, upperSwing, influence, rest, running = 0, stand = null) {
  if (influence < 0.02) return;
  scene.updateWorldMatrix(true, true);
  scene.getWorldQuaternion(_sceneQ);
  const dir = new THREE.Vector3(),twist = new THREE.Vector3();
  const pose = (name, x, y, z) => {
    const bone=scene.getObjectByName(name);
    toWorld(_sceneQ,x,y,z,dir);
    if(stand?.bones[name]&&stand?.arms){
      const side=name.endsWith('_l')?'l':'r',part=name.startsWith('upperarm')?'upperDir':'lowerDir';
      aimFromStand(bone,stand.bones[name],stand.arms[side][part],dir,_sceneQ,influence);
    }else{
      toWorld(_sceneQ,0,0,1,twist);aimLimb(bone,dir,twist,influence);
    }
  };
  const amplitude=THREE.MathUtils.lerp(.52,.69,running);
  const flex=THREE.MathUtils.lerp(.23,.76,running);
  for(const [side,sign] of [['l',1],['r',-1]]){
    const shoulder=upperSwing*amplitude*sign;
    const elbow=shoulder+flex;
    pose('upperarm_'+side,sign*.10,-Math.cos(shoulder),Math.sin(shoulder));
    pose('lowerarm_'+side,sign*.025,-Math.cos(elbow),Math.sin(elbow));
    // Keep the wrist aligned with its forearm instead of aiming the hand in
    // world space, which used to twist it as the elbow moved.
    const hand=scene.getObjectByName('hand_'+side),neutral=rest?.get('hand_'+side);
    if(hand&&neutral){const angle=hand.quaternion.angleTo(neutral),limit=.18;if(angle>limit)hand.quaternion.slerp(neutral,(1-limit/angle)*influence);}
  }
  // Finger motion stays in the captured clip; restoring the bind pose here
  // used to flatten the fingers into a rigid, open hand.
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

function stance(spec) {
  // Anna's shoes reach farther inward, so her ankles stay a little wider and her toes turn in less.
  return Math.abs(spec.footX) > 0.19 ? {x: 0.062, yaw: 0.14} : {x: 0.1, yaw: 0.1};
}

// Swing the toe sideways around the model's up axis. Left and right use opposite signs.
function yawToes(foot, side, sceneQ, influence, amount) {
  if (!foot || !foot.parent || influence < 0.02) return;
  const yaw = (side === 'l' ? -1 : 1) * amount;
  _axis.set(0, 0, 1).applyQuaternion(sceneQ);
  _delta.setFromAxisAngle(_axis, yaw);
  foot.getWorldQuaternion(_standWorld);
  _newWorld.copy(_delta).multiply(_standWorld);
  foot.parent.getWorldQuaternion(_parentQ);
  _aimed.copy(_parentQ.invert()).multiply(_newWorld);
  foot.quaternion.slerp(_aimed, influence);
  foot.updateMatrixWorld(true);
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
  const place = stance(spec);
  const sign = side === 'l' ? 1 : -1;
  _ankle.set(step.x ?? sign * place.x, spec.footY + step.y, step.z);
  scene.localToWorld(_ankle);
  _span.subVectors(_ankle, _hip).clampLength(0, spec.upper + spec.lower - .001);
  _ankle.copy(_hip).add(_span);
  _pole.set(sign * .02, 0, 1).applyQuaternion(sceneQ).add(_hip);
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
  yawToes(foot, side, sceneQ, influence, step.yaw ?? place.yaw);
}

function closedStance(scene, stand) {
  if (!stand) return;
  scene.updateWorldMatrix(true, true);
  scene.getWorldQuaternion(_sceneQ);
  placeLeg(scene, 'l', {z: 0, y: 0, pitch: 0.08}, 1, stand, _sceneQ);
  placeLeg(scene, 'r', {z: 0, y: 0, pitch: 0.08}, 1, stand, _sceneQ);
}

function attachFeet(scene, stand) {
  if(!stand)return;
  scene.updateWorldMatrix(true,true);
  for(const side of ['l','r']){
    const calf=scene.getObjectByName('calf_'+side),foot=scene.getObjectByName('foot_'+side);
    const offset=stand.legs[side]?.ankleFromCalf;
    if(!calf||!foot?.parent||!offset)continue;
    // The imported foot is parented to the rig root, not to the calf.
    // Follow the actual calf endpoint after every blended pose, including jump.
    _ankle.copy(offset);calf.localToWorld(_ankle);
    foot.parent.worldToLocal(_ankle);foot.position.copy(_ankle);foot.updateMatrixWorld(true);
  }
}

function captureStand(scene) {
  scene.updateMatrixWorld(true);
  const bones = {};
  const worldQ = new THREE.Quaternion();
  for (const name of ['pelvis', 'spine_01', 'spine_02', 'neck_01', 'head', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r']) {
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
      ankleFromCalf: calf.worldToLocal(ankle.clone()),
      footX: local.x,
      footZ: local.z,
      hip: scene.worldToLocal(hip.clone()),
      footY: local.y,
      thighDir: knee.clone().sub(hip).normalize(),
      calfDir: ankle.clone().sub(knee).normalize(),
    };
  }
  const arms={};
  for(const side of ['l','r']){
    const shoulder=scene.getObjectByName('upperarm_'+side),elbow=scene.getObjectByName('lowerarm_'+side),wrist=scene.getObjectByName('hand_'+side);
    shoulder.getWorldPosition(hip);elbow.getWorldPosition(knee);wrist.getWorldPosition(ankle);
    arms[side]={upperDir:knee.clone().sub(hip).normalize(),lowerDir:ankle.clone().sub(knee).normalize()};
  }
  const pelvis = scene.getObjectByName('pelvis');
  const pelvisCenter = scene.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
  for (const leg of Object.values(legs)) leg.hip.sub(pelvisCenter);
  return {bones, legs, arms, pelvisCenter};
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
      // This imported rig uses local Z as its vertical axis.
      values.push(base.x, base.y, base.z + dy);
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

function groomSkin(texture, soften) {
  if (!texture || texture.userData.groomed || !texture.image) return;
  const img = texture.image;
  const w = img.width, h = img.height;
  if (!w || !h) return;
  texture.userData.groomed = true;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const blur = document.createElement('canvas');
  blur.width = w;
  blur.height = h;
  const bctx = blur.getContext('2d');
  bctx.filter = 'blur(2.5px)';
  bctx.drawImage(img, 0, 0);
  const soft = bctx.getImageData(0, 0, w, h);
  const d = src.data, s = soft.data;
  const bg = [d[0], d[1], d[2]];
  const face = (i, x) => x > w * 0.58 && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 26;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = Math.floor(w * 0.58); x < w; x++) {
      const i = (y * w + x) * 4;
      if (!face(i, x)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const fw = Math.max(1, maxX - minX), fh = Math.max(1, maxY - minY);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 16) continue;
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const hair = lum < 145 && d[i] > d[i + 2] + 12;
      if (hair) continue;
      let r = d[i] * 1.03 + 4, g = d[i + 1] * 1.01 + 1, b = d[i + 2] * 0.99;
      if (face(i, x) && maxX > minX && lum > 120) {
        const u = (x - minX) / fw, v = (y - minY) / fh;
        const edge = u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92;
        const mix = edge ? 0 : soften * 0.55;
        r = r * (1 - mix) + s[i] * mix;
        g = g * (1 - mix) + s[i + 1] * mix;
        b = b * (1 - mix) + s[i + 2] * mix;
        const redness = d[i] - (d[i + 1] + d[i + 2]) * 0.5;
        if (v > 0.4 && v < 0.75 && redness > 8 && redness < 48) { r += 12; g += 2; }
      }
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
  ctx.putImageData(src, 0, 0);
  texture.image = canvas;
  texture.needsUpdate = true;
}

function polishLook(scene, name) {
  const soften = name === 'sergey' ? 0.22 : 0.4;
  scene.traverse(part => {
    if (!part.isMesh) return;
    const list = Array.isArray(part.material) ? part.material : [part.material];
    for (const m of list) {
      if (!m) continue;
      const label = `${m.name || ''} ${part.name || ''}`;
      if (/anatomical body\.body/i.test(label)) {
        groomSkin(m.map, soften);
        m.color.setHex(0xfff1e8);
        m.roughness = 0.48;
        m.envMapIntensity = 0.22;
      } else if (/teeth/i.test(label)) {
        m.color.setHex(0xfff7f1);
        m.roughness = 0.32;
      } else if (/ponytail|hair/i.test(label)) {
        m.roughness = 0.52;
      } else if (/shirt|cotton/i.test(label)) {
        m.color.setHex(0x2c6c76);
        m.roughness = 0.66;
      } else if (/trouser/i.test(label)) {
        m.color.setHex(0x2a3138);
        m.roughness = 0.7;
      } else if (/original top/i.test(label)) {
        m.color.setHex(name === 'oleg' ? 0x8f7757 : 0x2e4252);
        m.roughness = 0.58;
      } else if (/original bottom/i.test(label)) {
        m.color.setHex(name === 'oleg' ? 0x575044 : 0x1b2836);
        m.roughness = 0.64;
      }
      if(name==='oleg'&&/body\.short01|hair roots/i.test(label)){
        m.color.setHex(0xb3b0a7);
        m.roughness=.7;
      }
      if (/eye/i.test(label)) { m.roughness = 0.16; m.envMapIntensity = 0.55; }
      else if (m.envMapIntensity === undefined || m.envMapIntensity === 1) m.envMapIntensity = 0.4;
    }
  });
}

export function person(name) {
  const root = new THREE.Group();
  root.name = name;
  const asset=name==='oleg'?'sergey':name;
  if(name==='oleg')root.scale.setScalar(1.045);
  root.userData.ready = loader.loadAsync(new URL(`./assets/${asset}.glb`, import.meta.url).href)
    .then(({scene, animations}) => {
      scene.traverse(part => {
        if (/phone|accessory|held/i.test(part.name)) part.visible = false;
        if (!part.isMesh) return;
        part.castShadow = true;
        part.receiveShadow = true;
        // Animation changes the silhouette beyond a mesh's static bounding box.
        if (part.isSkinnedMesh) part.frustumCulled = false;
      });
      polishLook(scene, name);
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
      if (name === 'anna') {
        Object.assign(root.userData.rig, {
          walkPose: [], runPose: [], walkUpper: [], runUpper: [], footPose: {l:{yaw:.022},r:{yaw:.022}},
        });
      }
      root.add(scene);
      return root;
    })
    .catch(error => console.error(`Не удалось загрузить модель ${name}`, error));
  return root;
}

export function reachForSwitch(root, target, amount) {
  const rig=root.userData.rig;
  if(!rig||amount<=0)return;
  const upper=rig.scene.getObjectByName('upperarm_r');
  const lower=rig.scene.getObjectByName('lowerarm_r');
  if(!upper||!lower)return;
  const bend=new THREE.Vector3(0,1,0);
  const shoulder=upper.getWorldPosition(new THREE.Vector3());
  const direction=target.clone().sub(shoulder);
  direction.y-=.12;
  aimLimb(upper,direction,bend,amount);
  const elbow=lower.getWorldPosition(new THREE.Vector3());
  aimLimb(lower,target.clone().sub(elbow),bend,amount);
}

export function animateArrival(root,dt,progress) {
  animatePerson(root,dt);
  const rig=root.userData.rig;
  if(!rig||progress<=0||progress>=1)return;
  const phase=progress*2;
  const strength=Math.sin(progress*Math.PI);
  const swing=Math.sin(phase*Math.PI*2)*strength;
  const scene=rig.scene;
  scene.getWorldQuaternion(_sceneQ);
  placeLeg(scene,'l',{z:swing*.21,y:Math.max(0,-swing)*.1,pitch:.08},1,rig.stand,_sceneQ);
  placeLeg(scene,'r',{z:-swing*.21,y:Math.max(0,swing)*.1,pitch:.08},1,rig.stand,_sceneQ);
  attachFeet(scene,rig.stand);
  naturalArms(scene,-swing*.45,1,rig.rest,0,rig.stand);
}

function sampleGait(frames, phase, out) {
  const index = phase * frames.length;
  const frame = Math.floor(index);
  const from = frames[frame % frames.length];
  const to = frames[(frame + 1) % frames.length];
  for (let i = 0; i < from.length; i++) out[i] = THREE.MathUtils.lerp(from[i], to[i], index - frame);
}

function retargetAnna(rig, grounded) {
  if (grounded < .02) return;
  const {scene, stand, running, movement} = rig;
  const blend = THREE.MathUtils.lerp;
  const phase = (rig.phase * 2) % 1;
  const walk = rig.walkPose, run = rig.runPose;
  sampleGait(gaitClips.walk.samples, phase, walk);
  sampleGait(gaitClips.run.samples, phase, run);
  const {walkUpper, runUpper} = rig;
  sampleGait(upperBodyClips.walk, phase, walkUpper);
  sampleGait(upperBodyClips.run, phase, runUpper);
  scene.updateWorldMatrix(true, true);
  scene.getWorldQuaternion(_sceneQ);
  const pelvis = scene.getObjectByName('pelvis');
  const sway = blend(walk[0] - .004, run[0], running) * .55 * movement;
  const pelvisZ = stand.pelvisCenter.z;
  let pelvisY = stand.pelvisCenter.y + blend((walk[1] - .915) * .85, (run[1] - .93) * .43, running) * movement;
  const feet = rig.footPose;
  for (const [side, index] of [['l', 4], ['r', 10]]) {
    const spec = stand.legs[side];
    const foot = feet[side];
    const sign = side === 'l' ? 1 : -1;
    foot.x = blend(sign * .095, blend(walk[index], run[index], running), movement);
    foot.z = spec.footZ + blend((walk[index + 2] + .075) * 1.14, (run[index + 2] + .110) * .72, running) * movement;
    const shoePitch = blend(walk[index + 3] + .54, run[index + 3] + .54, running);
    foot.pitch = -THREE.MathUtils.clamp(shoePitch * .64, -.68, .38) * movement;
    foot.y = blend(Math.max(0, walk[index + 1] - .103) * .48, Math.max(0, run[index + 1] - .14) * .55, running) * movement;
    foot.y += Math.max(0, .095 * Math.sin(foot.pitch)) * movement;
    const dx = foot.x - sway - spec.hip.x;
    const dz = foot.z - pelvisZ - spec.hip.z;
    const reach = spec.upper + spec.lower - .018;
    const limit = spec.footY + foot.y - spec.hip.y +
      Math.sqrt(Math.max(.08, reach ** 2 - dx ** 2 - dz ** 2));
    const near = Math.max(.038 - Math.abs(pelvisY - limit), 0) / .038;
    pelvisY = Math.min(pelvisY, limit) - near ** 2 * .0095;
  }
  _hip.set(sway, pelvisY, pelvisZ);
  scene.localToWorld(_hip);
  pelvis.parent.worldToLocal(_hip);
  pelvis.position.lerp(_hip, grounded);
  pelvis.quaternion.slerp(stand.bones.pelvis.local, grounded);
  pelvis.updateMatrixWorld(true);
  for (const [side, foot] of Object.entries(feet)) {
    placeLeg(scene, side, foot, grounded, stand, _sceneQ);
  }
  // Add the captured shoulder turn and forward lean above the planted legs.
  const chest = scene.getObjectByName('spine_02');
  chest.getWorldQuaternion(_standWorld);
  const turn = blend(walkUpper[1], runUpper[1], running) * .63 * movement;
  const lean = blend(walkUpper[0] * .55, runUpper[0] * .47, running) * movement;
  _axis.set(0,1,0).applyQuaternion(_sceneQ);
  _delta.setFromAxisAngle(_axis, turn);
  _newWorld.copy(_delta).multiply(_standWorld);
  _axis.set(1,0,0).applyQuaternion(_sceneQ);
  _delta.setFromAxisAngle(_axis, lean);
  _newWorld.premultiply(_delta);
  chest.parent.getWorldQuaternion(_parentQ);
  chest.quaternion.slerp(_parentQ.invert().multiply(_newWorld), grounded);
  chest.updateMatrixWorld(true);

  const lead = feet.r.z - feet.l.z;
  for (const [side, index] of [['l', 2], ['r', 8]]) {
    const outward = side === 'l' ? 1 : -1;
    const swing = (from,to,axis) => blend(Math.atan2(from[axis+2],-from[axis+1]),
      Math.atan2(to[axis+2],-to[axis+1]), running);
    const measuredSwing = swing(walkUpper,runUpper,index);
    const measuredElbow = swing(walkUpper,runUpper,index + 3) - measuredSwing;
    const arm = outward * lead * blend(.47, .57, running) +
      (measuredSwing + blend(0,.40,running)) * .28 * movement;
    const bend = .12 + THREE.MathUtils.clamp(measuredElbow,.08,.95) * movement * blend(.74,.83,running);
    const clearance = blend(.20,.25,running) +
      Math.abs(blend(walkUpper[index],runUpper[index],running)) * .15 * movement;
    for (const [joint, direction, angle, x] of [
      ['upperarm', 'upperDir', arm, outward * clearance],
      ['lowerarm', 'lowerDir', arm + bend, outward * .105],
    ]) {
      const name = joint + '_' + side;
      const bone = scene.getObjectByName(name);
      toWorld(_sceneQ, x, -Math.cos(angle), Math.sin(angle), _dir);
      aimFromStand(bone, stand.bones[name], stand.arms[side][direction], _dir, _sceneQ, grounded);
    }
    const hand = scene.getObjectByName('hand_' + side);
    hand.quaternion.slerp(rig.rest.get(hand.name), grounded);
  }
}

export function animatePerson(root, dt, distance = 0, jumpAge = null) {
  const rig = root.userData.rig;
  if (!rig) return;
  const idle = rig.actions.get('Idle_Standing');
  const walk = rig.actions.get('Walk');
  if (!walk) {
    rig.mixer.update(dt);
    naturalArms(rig.scene, 0, 1, rig.rest, 0, rig.stand);
    closedStance(rig.scene, rig.stand);
    attachFeet(rig.scene, rig.stand);
    if (rig.idleOffset != null) rig.scene.position.y = rig.idleOffset + Math.sin(performance.now() * 0.0016) * 0.006;
    return;
  }
  const run = rig.actions.get('Run'), jump = rig.actions.get('Jump');
  
  // Smooth speed filtering to eliminate micro-jitter
  const instantSpeed = distance / Math.max(.001, dt);
  rig.smoothedSpeed = THREE.MathUtils.damp(rig.smoothedSpeed || 0, instantSpeed, 14, dt);
  
  const moving = THREE.MathUtils.smoothstep(rig.smoothedSpeed, 0.08, 0.80);
  rig.movement = THREE.MathUtils.damp(rig.movement, moving, groundedBlend, dt);
  
  // Run speed sits above the walk; the band matches WALK_SPEED and RUN_SPEED.
  const runTarget = THREE.MathUtils.smoothstep(rig.smoothedSpeed, WALK_SPEED+.35, RUN_SPEED-.6);
  rig.running = THREE.MathUtils.damp(rig.running, runTarget, 10, dt);
  rig.jumping = THREE.MathUtils.damp(rig.jumping, jumpAge === null ? 0 : 1, 21, dt);

  // Phase spans the entire source clip: four footfalls, not a single stride.
  const advance=gaitAdvance(dt,distance,rig.running);
  rig.footfalls=jumpAge===null&&rig.jumping<.1
    ?Math.floor((rig.phase+advance)*CLIP_FOOTFALLS)-Math.floor(rig.phase*CLIP_FOOTFALLS):0;
  rig.phase=(rig.phase+advance)%1;

  const grounded = 1 - rig.jumping;
  if (!rig.footPose) {
    walk.time = rig.phase * walk.getClip().duration;
    run.time = ((rig.phase + (rig.runLead || 0)) % 1) * run.getClip().duration;
  }
  walk.setEffectiveWeight(rig.footPose ? 0 : grounded * rig.movement * (1 - rig.running));
  run.setEffectiveWeight(rig.footPose ? 0 : grounded * rig.movement * rig.running);

  const idleWeight = rig.footPose ? grounded : grounded * (1 - rig.movement);
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
  if (rig.footPose) retargetAnna(rig, grounded);
  attachFeet(rig.scene,rig.stand);
  if (!rig.footPose) naturalArms(rig.scene, 0, grounded, rig.rest, rig.running, rig.stand);
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
