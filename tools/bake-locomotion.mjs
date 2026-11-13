import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {AnimationMixer, Object3D, QuaternionKeyframeTrack, VectorKeyframeTrack,
  AnimationClip, Vector3, Quaternion} from '../static/vendor/three.module.js';

// Quaternius Universal Animation Library Standard, Godot GLTF export (CC0).
const [input, output] = process.argv.slice(2);
const gltf = JSON.parse(readFileSync(input, 'utf8'));
const binary = readFileSync(new URL(gltf.buffers[0].uri, pathToFileURL(input)));
const bones = gltf.nodes.map(node => {
  const bone = new Object3D();
  bone.name = node.name;
  if (node.translation) bone.position.fromArray(node.translation);
  if (node.rotation) bone.quaternion.fromArray(node.rotation);
  if (node.scale) bone.scale.fromArray(node.scale);
  return bone;
});
const character = new Object3D();
for (const [id, node] of gltf.nodes.entries()) {
  for (const child of node.children ?? []) bones[id].add(bones[child]);
}
for (const id of gltf.scenes[gltf.scene ?? 0].nodes) character.add(bones[id]);

function accessor(index) {
  const {bufferView, byteOffset = 0, componentType, count, type} = gltf.accessors[index];
  const view = gltf.bufferViews[bufferView];
  if (componentType !== 5126 || view.byteStride) throw Error('Expected packed float animation keys');
  const size = {SCALAR:1, VEC3:3, VEC4:4}[type];
  return new Float32Array(binary.buffer, binary.byteOffset + (view.byteOffset ?? 0) + byteOffset, size * count);
}

function bake(name) {
  const {channels, samplers} = gltf.animations.find(clip => clip.name === name);
  const tracks = channels.filter(({target}) => target.path !== 'scale').map(({sampler, target}) => {
    const {input, output, interpolation} = samplers[sampler];

    const rotation = target.path === 'rotation';
    const Track = rotation ? QuaternionKeyframeTrack : VectorKeyframeTrack;
    const times = accessor(input);
    const values = accessor(output);
    const size = rotation ? 4 : 3;
    // Remove the two tangent vectors per key. We resample the dense keys below.
    const keys = interpolation === 'CUBICSPLINE'
      ? Float32Array.from({length: times.length * size}, (_, i) =>
        values[Math.floor(i / size) * size * 3 + size + i % size])
      : values;
    return new Track(bones[target.node].name + (rotation ? '.quaternion' : '.position'), times, keys);
  });
  const clip = new AnimationClip(name, -1, tracks);
  const mixer = new AnimationMixer(character);
  mixer.clipAction(clip).play();
  const get = name => character.getObjectByName('DEF-' + name);
  const position = name => get(name).getWorldPosition(new Vector3());
  const angle = (a,b) => Math.atan2(b.y-a.y,b.z-a.z);
  const samples = [];
  for (let frame = 0; frame < 96; frame++) {
    mixer.setTime(clip.duration * frame / 96);
    character.updateMatrixWorld(true);
    const hips = position('hips');
    const torso = position('spine.003').sub(hips);
    const frameData = [hips.x, hips.y, hips.z, Math.atan2(torso.z, torso.y)];
    for (const side of ['L','R']) {
      const foot = position('foot.' + side);
      const toe = position('toe.' + side);
      const shoulder = position('upper_arm.' + side);
      const elbow = position('forearm.' + side);
      const hand = position('hand.' + side);
      const upper = Math.atan2(elbow.z-shoulder.z, shoulder.y-elbow.y);
      const lower = Math.atan2(hand.z-elbow.z, elbow.y-hand.y);
      frameData.push(foot.x,foot.y,foot.z,angle(foot,toe),upper,lower);
    }
    samples.push(frameData.map(x => +x.toFixed(5)));
  }
  mixer.uncacheRoot(character);
  return {duration:clip.duration,samples};
}
const data = JSON.stringify({walk:bake('Walk_Loop'), run:bake('Jog_Fwd_Loop')}).replaceAll('],[', '],\n[');
writeFileSync(output, '// Quaternius, Universal Animation Library Standard, CC0 1.0.\n' +
  '// Walk_Loop and Jog_Fwd_Loop sampled in world space. See tools/bake-locomotion.mjs.\n' +
  'export const gaitClips = ' + data + ';\n');
