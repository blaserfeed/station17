import {readFileSync,writeFileSync} from 'node:fs';
import {Object3D, Euler, MathUtils, Vector3} from '../static/vendor/three.module.js';

function readMotion(path) {
  const [hierarchy, motion] = readFileSync(path, 'utf8').split(/\r?\nMOTION\r?\n/);
  const lines = hierarchy.split(/\r?\n/).map(line => line.trim());
  const stack = [], bones = [];
  let bone = null, channel = 0;
  for (const line of lines) {
    const fields = line.split(/\s+/);
    if (fields[0] === 'ROOT' || fields[0] === 'JOINT') {
      bone = new Object3D();
      bone.name = fields[1];
      stack.at(-1)?.add(bone);
    } else if (line === 'End Site') {
      bone = null;
    } else if (line === '{') {
      stack.push(bone);
    } else if (line === '}') {
      stack.pop();
    } else if (fields[0] === 'OFFSET' && stack.at(-1)) {
      stack.at(-1).position.fromArray(fields.slice(1).map(Number));
    } else if (fields[0] === 'CHANNELS') {
      const node = stack.at(-1);
      bones.push({node, position: fields[1] === '6', rotation: channel + (fields[1] === '6' ? 3 : 0)});
      channel += Number(fields[1]);
    }
  }
  const frames = motion.trim().split(/\r?\n/).slice(2).map(line => line.trim().split(/\s+/).map(Number));
  const root = bones[0].node;
  const angles = new Euler(0,0,0,'YXZ');
  const position = name => root.getObjectByName(name).getWorldPosition(new Vector3());
  const result = frames.map(frame => {
    root.position.fromArray(frame);
    for (const {node, rotation} of bones) {
      const [y,x,z] = frame.slice(rotation,rotation + 3).map(MathUtils.degToRad);
      node.quaternion.setFromEuler(angles.set(x,y,z,'YXZ'));
    }
    root.updateMatrixWorld(true);
    // The horizontal direction of the pelvis follows the actor through the turns.
    const forward = new Vector3(0,0,1).applyQuaternion(root.quaternion);
    const yaw = Math.atan2(forward.x,forward.z);
    const align = vector => vector.applyAxisAngle(new Vector3(0,1,0),-yaw);
    const hip = root.position.clone();
    const chest = align(position('Chest4').sub(hip));
    const shoulderLine = align(position('LeftShoulder').sub(position('RightShoulder')));
    const gait = [hip.x,hip.z,hip.y,yaw,Math.atan2(chest.z,chest.y),Math.atan2(shoulderLine.z,shoulderLine.x)];
    for (const side of ['Left','Right']) {
      const thigh = position(side+'Hip');
      const foot = align(position(side+'Ankle').sub(thigh));
      const arm = align(position(side+'Elbow').sub(position(side+'Shoulder'))).normalize();
      const forearm = align(position(side+'Wrist').sub(position(side+'Elbow'))).normalize();
      gait.push(foot.z,foot.y,arm.x,arm.y,arm.z,forearm.x,forearm.y,forearm.z);
    }
    return gait;
  });
  return result;
}

const [walk,run,output] = process.argv.slice(2);
writeFileSync(output,JSON.stringify({walk:readMotion(walk),run:readMotion(run)}));
