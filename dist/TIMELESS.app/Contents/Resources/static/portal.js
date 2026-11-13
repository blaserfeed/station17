import * as THREE from './vendor/three.module.js';
import {casing, cylinder, metal} from './industrial.js';

const colors = [0xffb468, 0x83b7ff, 0x5cf9e3];

export function buildPortal(level, state, sign) {
  const root = new THREE.Group();
  root.name = 'time-portal';
  root.position.set(state.position[0], 0, state.position[1]);
  level.add(root);

  const steel = metal(0x273f49);
  const trim = metal(0x72858a);
  const strips = new THREE.MeshStandardMaterial({
    color:0x778d8e, emissive:0xff713d, emissiveIntensity:1.8, roughness:.35, metalness:.2,
  });
  for (const side of [-1, 1]) {
    casing(root, [.46, 3.75, .75], [side*1.55, 1.875, 0], steel).name='portal-column';
    casing(root, [.46, .18, .75], [side*1.55, .11, 0], trim).name='portal-column';
    casing(root, [.08, 2.85, .045], [side*1.55, 1.95, .39], strips).name='portal-strip';
  }
  casing(root, [3.55, .45, .75], [0, 3.57, 0], steel).name='portal-lintel';
  casing(root, [2.65, .03, .96], [0, .018, 0], trim).name='portal-sill';
  sign('ПОРТАЛ · КОНТУР 4', [0, 3.57, .4], 2.6, root);

  const panel = new THREE.Group();
  panel.name = 'portal-console';
  panel.position.set(state.console[0], 0, state.console[1]);
  level.add(panel);
  casing(panel, [.7, 1.12, .56], [0, .56, 0], steel);
  casing(panel, [.64, .18, .51], [0, 1.16, 0], trim).rotation.x = -.22;
  const lamp=casing(panel, [.38, .10, .31], [0, 1.25, .02], strips);
  lamp.rotation.x = -.22;lamp.name='portal-strip';
  casing(panel, [.2, .035, .02], [-.16, .74, .29], metal(0x2c2622, .9), .008);
  casing(panel, [.07, .14, .02], [.18, .5, .29], metal(0x4a3b32, .75), .008);
  const brass = metal(0xb08958, .4);
  for (const [x, y] of [[-.14, .92], [.14, .92], [-.14, .68], [.14, .68]]) {
    cylinder(panel, .05, .03, [x, y, .27], brass, .05, 12).rotation.x = Math.PI / 2;
  }
  const plate = document.createElement('canvas');plate.width=512;plate.height=220;
  const ctx=plate.getContext('2d');ctx.fillStyle='#d8ccb0';ctx.fillRect(0,0,512,220);
  ctx.strokeStyle='#6d5a3a';ctx.strokeRect(10,10,492,200);
  ctx.fillStyle='#2c2622';ctx.font='600 28px system-ui';ctx.fillText('ЦЕПЬ КОНТУРА',28,52);
  ctx.font='22px Georgia';ctx.fillText('Жила не идёт напрямик.',28,100);
  ctx.fillText('С левой клеммы спустись,',28,138);
  ctx.fillText('обойди снизу, выйди справа.',28,176);
  const tex=new THREE.CanvasTexture(plate);tex.colorSpace=THREE.SRGBColorSpace;
  const hint=new THREE.Mesh(new THREE.PlaneGeometry(.58,.26),new THREE.MeshBasicMaterial({map:tex}));
  hint.position.set(0,.42,.29);hint.castShadow=false;panel.add(hint);

  const breaker = new THREE.Group();
  breaker.name = 'portal-breaker';
  breaker.position.set(.22, 1.23, .18);
  panel.add(breaker);
  casing(breaker, [.065,.24,.065], [0,.12,0], trim);
  casing(breaker, [.18,.085,.085], [0,.24,0], metal(0x9e493c));
  breaker.rotation.x = -.55;

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
  aperture.renderOrder = 2;
  root.add(aperture);
  const light = new THREE.PointLight(0xff713d, 3.2, 11, 2);
  light.position.set(0, 1.8, .28);
  light.name = 'portal-glow';
  root.add(light);

  let opening = .18;
  return {
    breakerPosition() { return breaker.localToWorld(new THREE.Vector3(0,.24,0)); },
    setBreaker(open) { breaker.rotation.x = open ? 1.0 : -.55; },
    setState(next) {
      this.state = next;
      const color = next.target != null ? colors[next.target] : next.repaired ? 0x72c3ae : 0xff713d;
      strips.emissive.setHex(color);
      strips.emissiveIntensity = next.target != null ? 2.6 : next.repaired ? 1.9 : 1.55;
      material.uniforms.tint.value.setHex(color);
      light.color.setHex(color);
    },
    update(dt, motion) {
      const open = this.state?.target != null;
      const goal = open ? 1 : this.state?.repaired ? .46 : .22;
      opening = motion ? THREE.MathUtils.damp(opening, goal, 7, dt) : goal;
      aperture.visible = opening > .02;
      const size = open ? Math.max(.2, opening) : .78 + opening * .22;
      aperture.scale.set(size, size, 1);
      material.uniforms.opening.value = opening;
      if (motion) material.uniforms.time.value += dt;
      light.intensity = open ? opening * 14 : opening * 7;
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
