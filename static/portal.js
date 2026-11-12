import * as THREE from './vendor/three.module.js';
import {casing, metal} from './industrial.js';

const colors = [0xffb468, 0x83b7ff, 0x5cf9e3];

export function buildPortal(level, state, sign) {
  const root = new THREE.Group();
  root.name = 'time-portal';
  root.position.set(state.position[0], 0, state.position[1]);
  level.add(root);

  const steel = metal(0x273f49);
  const trim = metal(0x72858a);
  const strips = new THREE.MeshStandardMaterial({color:0x778d8e, emissive:0xff713d});
  for (const side of [-1, 1]) {
    casing(root, [.46, 3.75, .75], [side*1.55, 1.875, 0], steel);
    casing(root, [.46, .18, .75], [side*1.55, .11, 0], trim);
    casing(root, [.08, 2.85, .045], [side*1.55, 1.95, .39], strips);
  }
  casing(root, [3.55, .45, .75], [0, 3.57, 0], steel);
  casing(root, [2.65, .03, .96], [0, .018, 0], trim);
  sign('ПОРТАЛ · КОНТУР 4', [0, 3.57, .4], 2.6, root);

  const panel = new THREE.Group();
  panel.name = 'portal-console';
  panel.position.set(state.console[0], 0, state.console[1]);
  level.add(panel);
  casing(panel, [.7, 1.12, .56], [0, .56, 0], steel);
  casing(panel, [.64, .18, .51], [0, 1.16, 0], trim).rotation.x = -.22;
  casing(panel, [.38, .10, .31], [0, 1.25, .02], strips).rotation.x = -.22;

  const material = new THREE.ShaderMaterial({
    uniforms:{time:{value:0}, tint:{value:new THREE.Color()}, opening:{value:0}},
    transparent:true,
    depthWrite:false,
    side:THREE.DoubleSide,
    vertexShader:`
      varying vec2 point;
      void main() {
        point = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:`
      varying vec2 point;
      uniform float time, opening;
      uniform vec3 tint;
      void main() {
        float radius = length(point);
        float edge = 1.0 - smoothstep(.91, 1.0, radius);
        float angle = atan(point.y, point.x);
        float wave = sin(radius * 28.0 - time * 3.5 + sin(angle * 4.0 + time) * 2.0);
        float shimmer = pow(.5 + .5 * wave, 5.0);
        float rim = smoothstep(.68, .98, radius);
        vec3 color = tint * (.20 + shimmer * .48 + rim * 1.3) + vec3(.018,.038,.055);
        gl_FragColor = vec4(color, edge * opening * (.79 + rim * .17));
      }`,
  });
  const aperture = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 3.28), material);
  aperture.name = 'portal-aperture';
  aperture.position.y = 1.7;
  aperture.visible = false;
  root.add(aperture);
  const light = new THREE.PointLight(0xffffff, 0, 8, 2);
  light.position.set(0, 1.8, .28);
  root.add(light);

  let opening = 0;
  return {
    setState(next) {
      this.state = next;
      const color = next.target != null ? colors[next.target] : next.repaired ? 0x72c3ae : 0xff713d;
      strips.emissive.setHex(color);
      if (next.target != null) material.uniforms.tint.value.setHex(color);
      light.color.setHex(color);
    },
    update(dt, motion) {
      const target = this.state?.target == null ? 0 : 1;
      opening = motion ? THREE.MathUtils.damp(opening, target, 7, dt) : target;
      aperture.visible = opening > .012;
      aperture.scale.set(Math.max(.01, opening), Math.max(.01, opening), 1);
      material.uniforms.opening.value = opening;
      if (motion) material.uniforms.time.value += dt;
      light.intensity = opening * 13;
    },
  };
}

export function portalCrossing(portal, fromX, fromZ, toX, toZ) {
  if (portal?.target == null) return null;
  const [x, z] = portal.position;
  const crosses = (fromZ > z && toZ <= z) || (fromZ < z && toZ >= z);
  if (!crosses) return null;
  const intersection = fromX + (toX - fromX) * (z - fromZ) / (toZ - fromZ);
  return Math.abs(intersection - x) <= .9 ? [intersection, z] : null;
}
