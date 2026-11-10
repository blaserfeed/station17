import * as THREE from './vendor/three.module.js';

export function metal(color, roughness = .48) {
  return new THREE.MeshStandardMaterial({color, roughness, metalness: .25});
}

function add(parent, geometry, material, position) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  part.receiveShadow = true;
  part.castShadow = true;
  parent.add(part);
  return part;
}

// A straight-sided sheet-metal housing with a rolled edge.
export function casing(parent, [width, height, depth], pos, material, edge = .06) {
  const r = Math.min(edge, width * .2, height * .2, depth * .45);
  const x = width / 2 - r, y = height / 2 - r;
  const profile = new THREE.Shape();
  profile.moveTo(-x, -y);
  profile.lineTo(x, -y);
  profile.lineTo(x, y);
  profile.lineTo(-x, y);
  profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: depth - 2 * r, bevelEnabled: true, bevelSize: r,
    bevelThickness: r, bevelSegments: 3, steps: 1,
  });
  geometry.translate(0, 0, r - depth / 2);
  return add(parent, geometry, material, pos);
}

export function cylinder(parent, r, height, pos, material, lower = r, sides = 24) {
  return add(parent, new THREE.CylinderGeometry(r, lower, height, sides), material, pos);
}

function groupAt(parent, pos) {
  const root = new THREE.Group();
  root.position.set(...pos);
  parent.add(root);
  return root;
}

export function pipe(parent, points, radius, material, bend = .48) {
  const path = new THREE.CurvePath();
  let tail = new THREE.Vector3(...points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const corner = new THREE.Vector3(...points[i]);
    const before = new THREE.Vector3(...points[i - 1]).sub(corner);
    const after = new THREE.Vector3(...points[i + 1]).sub(corner);
    const offset = Math.min(bend, before.length() * .45, after.length() * .45);
    const entry = corner.clone().add(before.setLength(offset));
    const exit = corner.clone().add(after.setLength(offset));
    path.add(new THREE.LineCurve3(tail, entry));
    path.add(new THREE.QuadraticBezierCurve3(entry, corner, exit));
    tail = exit;
  }
  path.add(new THREE.LineCurve3(tail, new THREE.Vector3(...points.at(-1))));
  return add(parent, new THREE.TubeGeometry(path, Math.max(4, points.length * 6), radius, 10), material, [0, 0, 0]);
}

function gauge(parent, [x, y, z], r, ring) {
  const dial = cylinder(parent, r, .055, [x, y, z], ring);
  dial.rotation.x = Math.PI / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8e5d4';
  ctx.fillRect(0, 0, 96, 96);
  ctx.strokeStyle = '#343b39';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (.75 + i * .15);
    ctx.beginPath();
    ctx.moveTo(48 + 31 * Math.cos(a), 48 + 31 * Math.sin(a));
    ctx.lineTo(48 + 39 * Math.cos(a), 48 + 39 * Math.sin(a));
    ctx.stroke();
  }
  ctx.strokeStyle = '#a04933';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 48);
  ctx.lineTo(66, 23);
  ctx.stroke();
  ctx.fillStyle = '#343b39';
  ctx.beginPath();
  ctx.arc(48, 48, 4, 0, Math.PI * 2);
  ctx.fill();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return add(parent, new THREE.CircleGeometry(r * .86, 24),
    new THREE.MeshBasicMaterial({map}), [x, y, z + .03]);
}

export function generator(parent, x, z, era, frame, trim) {
  const p = groupAt(parent, [x, 0, z]);
  const iron = metal(era === 0 ? 0x536c60 : 0x566c72);
  const rust = metal(0x8a6446, .67);
  const dark = metal(0x354541);
  cylinder(p, 2.37, .25, [0, .29, 0], trim, 2.48, 48);
  cylinder(p, 1.86, .25, [0, .52, 0], dark, 2.12, 48);
  cylinder(p, 1.76, 2.32, [0, 1.77, 0], iron, 1.94, 48);
  cylinder(p, 1.68, .37, [0, 3.10, 0], iron, 1.82, 48);
  cylinder(p, .95, .37, [0, 3.43, 0], iron, 1.63, 48);
  cylinder(p, .72, .21, [0, 3.71, 0], trim, .95, 32);
  cylinder(p, .59, 3.26, [0, 5.42, 0], trim);
  for (const y of [.65, 1.07, 2.71, 3.0]) cylinder(p, 1.94, .09, [0, y, 0], trim, 1.96, 48);
  for (const y of [4.24, 6.65, 7.03]) cylinder(p, .7, .11, [0, y, 0], dark, .7);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = Math.sin(a), z = Math.cos(a);
    cylinder(p, .062, .1, [x * 2.15, .46, z * 2.15], dark, .062, 6);
    const rib = casing(p, [.12, 1.58, .2], [x * 1.91, 1.82, z * 1.91], iron, .027);
    rib.rotation.y = a;
  }
  for (const side of [-1, 1]) {
    pipe(p, [[side * 1.2, .75, 1.12], [side * 1.65, .75, 1.49],
      [side * 1.65, 2.78, 1.49], [side * 1.27, 2.78, 1.09]], .112, rust, .32);
    cylinder(p, .19, .13, [side * 1.65, 1.31, 1.49], trim);
  }
  casing(p, [1.18, .57, .26], [0, 1.21, 1.93], frame);
  gauge(p, [-.25, 1.22, 2.09], .153, dark);
  gauge(p, [.25, 1.22, 2.09], .153, dark);
}

export function vessel(parent, x, z, frame, trim, future) {
  const p = groupAt(parent, [x, 0, z]);
  cylinder(p, .83, 2.16, [0, 1.62, 0], frame, .83, 32);
  for (const y of [.54, 2.7]) {
    const end = add(p, new THREE.SphereGeometry(.83, 24, 12), frame, [0, y, 0]);
    end.scale.y = .43;
  }
  for (const y of [.8, 2.5]) cylinder(p, .86, .065, [0, y, 0], trim);
  for (const side of [-1, 1]) {
    pipe(p, [[side * .63, 0, -.44], [side * .63, .62, -.44]], .07, trim);
    pipe(p, [[side * .63, 0, .44], [side * .63, .62, .44]], .07, trim);
  }
  pipe(p, [[0, 2.93, 0], [0, 3.48, 0], [0, 3.48, 3.3],
    [0, 1.2, 3.3]], .13, trim, .37);
  cylinder(p, .2, .11, [0, 3.13, 0], trim);
  if (!future) gauge(p, [0, 2.12, .84], .19, trim);
}

export function bench(parent, x, z, era, surface, frame, dark) {
  const p = groupAt(parent, [x, 0, z]);
  casing(p, [3, .11, 1.42], [0, .92, 0], surface, .05);
  for (const dx of [-1.25, 1.25]) {
    pipe(p, [[dx, .015, -.53], [dx, .79, -.53], [dx, .79, .53],
      [dx, .015, .53]], .05, frame, .16);
  }
  pipe(p, [[-1.25, .27, -.52], [1.25, .27, -.52]], .04, frame);
  casing(p, [.78, .17, .83], [.65, .78, -.03], frame);
  pipe(p, [[.51, .8, .395], [.51, .8, .45], [.79, .8, .45], [.79, .8, .395]], .023, dark, .045);
  if (era > 0) {
    casing(p, [.86, .51, era === 2 ? .09 : .21], [.86, 1.32, -.27], dark);
    casing(p, [.77, .425, .024], [.86, 1.32, era === 2 ? -.212 : -.152],
      metal(era === 2 ? 0x5f9ba2 : 0x304a4b, .26), .012);
    pipe(p, [[.86, .98, -.31], [.86, 1.25, -.35]], .045, frame);
    casing(p, [.48, .027, .26], [.86, .985, -.31], dark, .01);
  } else {
    const cup = cylinder(p, .082, .135, [.86, 1.046, .31], metal(0xc3b6a0), .078);
    cylinder(p, .066, .008, [cup.position.x, 1.112, cup.position.z], metal(0x695143));
  }
  casing(p, [.56, .035, .43], [-.22, .997, .25], metal(0x9c8060, .85), .017);
  casing(p, [.52, .019, .41], [-.225, 1.016, .25], metal(0xe7ddc5, .95), .008);
}

export function chair(parent, x, z, era, frame, facing) {
  const p = groupAt(parent, [x, 0, z]);
  p.rotation.y = facing;
  const upholstery = metal([0x80725a, 0x526461, 0x8aacb0][era], .92);
  for (const s of [-1, 1]) {
    pipe(p, [[s * .235, .02, -.27], [s * .235, .51, -.2], [s * .235, .51, .23],
      [s * .235, .02, .29]], .027, frame, .085);
    pipe(p, [[s * .21, .45, .2], [s * .21, .95, .28]], .027, frame);
  }
  casing(p, [.55, .1, .56], [0, .535, 0], upholstery, .043);
  const back = casing(p, [.52, .31, .095], [0, .88, .27], upholstery, .042);
  back.rotation.x = .11;
}

export function deskLamp(parent, x, z, era, frame) {
  const p = groupAt(parent, [x, .97, z]);
  const hood = metal(era === 0 ? 0x597368 : 0x8ea0a1);
  cylinder(p, .15, .035, [0, .016, 0], hood);
  pipe(p, [[0, .03, 0], [0, .4, -.08], [.22, .62, -.1]], .022, frame, .065);
  const shade = add(p, new THREE.SphereGeometry(.177, 24, 12, 0, Math.PI * 2, 0, Math.PI * .56),
    hood, [.23, .58, -.1]);
  shade.scale.y = .65;
  cylinder(p, .112, .015, [.23, .555, -.1],
    new THREE.MeshStandardMaterial({color: 0xf1e8c9, emissive: 0xffdea3, emissiveIntensity: .28}));
}

export function plant(parent, x, z, index) {
  const p = groupAt(parent, [x, 0, z]);
  cylinder(p, .48, .58, [0, .29, 0], metal(0x9fb7b2, .55), .37);
  cylinder(p, .47, .045, [0, .563, 0], metal(0x63786c, .89));
  const greens = [metal(0x456c53, .78), metal(0x729267, .73), metal(0x567c58, .82)];
  for (let i = 0; i < 10; i++) {
    const angle = i * 2.4 + index, len = .5 + (i * 7 % 9) * .058;
    const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, .57, 0),
      new THREE.Vector3(Math.cos(angle) * len * .35, 1.04 + len * .45, Math.sin(angle) * len * .35),
      new THREE.Vector3(Math.cos(angle) * len, .66 + len * .43, Math.sin(angle) * len));
    const vertices = [], indices = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12, v = path.getPoint(t), w = .12 * Math.sin(t * Math.PI);
      vertices.push(v.x - Math.sin(angle) * w, v.y - .025, v.z + Math.cos(angle) * w,
        v.x, v.y, v.z, v.x + Math.sin(angle) * w, v.y - .025, v.z - Math.cos(angle) * w);
      if (j > 0) for (const k of [0, 1]) {
        const b = (j - 1) * 3 + k;
        indices.push(b, b + 1, b + 3, b + 1, b + 4, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const material = greens[i % greens.length];
    material.side = THREE.DoubleSide;
    add(p, geo, material, [0, 0, 0]);
  }
}

export function valveBank(parent, pos, era, repaired) {
  const p = groupAt(parent, pos);
  p.name = 'valve-bank';
  const enamel = metal(era === 2 ? 0x789ca4 : 0x4d6f67, .57);
  const iron = metal(0x61756e);
  const flow = metal(repaired ? 0x46806c : 0x8b6049, .63);
  casing(p, [2.72, .18, .8], [0, .1, -.09], iron);
  pipe(p, [[-1.26, .46, .02], [1.26, .46, .02]], .147, iron);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .79;
    const body = cylinder(p, .24, .21, [x, 1.16, .09], repaired && i === 1 ? flow : enamel);
    body.rotation.x = Math.PI / 2;
    pipe(p, [[x, .43, .02], [x, 2.29, .02], [x, 2.29, -.53]], .126, i === 1 ? flow : iron, .26);
    for (const y of [.69, 1.46, 2.03]) cylinder(p, .188, .075, [x, y, .02], iron);
    const wheel = groupAt(p, [x, 1.16, .28]);
    wheel.rotation.z = repaired && i === 1 ? Math.PI / 4 : 0;
    if (i === 1) p.userData.reserveWheel = wheel;
    add(wheel, new THREE.TorusGeometry(.207, .031, 9, 32), flow, [0, 0, 0]);
    for (let spoke = 0; spoke < 3; spoke++) {
      const a = spoke * Math.PI * 2 / 3;
      pipe(wheel, [[0, 0, 0], [Math.cos(a) * .2, Math.sin(a) * .2, 0]], .021, flow);
    }
    gauge(p, [x, 1.78, .16], .128, enamel);
  }
  return p;
}

export function emergencyConsole(parent, pos, future, ready) {
  const p = groupAt(parent, pos);
  p.name = 'emergency-console';
  const enamel = metal(future ? 0xc4d6d3 : 0x647d77, .58);
  const steel = metal(0x405653, .46);
  const copper = metal(0x9f7953, .5);
  casing(p, [1.5, .16, .82], [0, .12, 0], steel);
  casing(p, [1.18, .82, .62], [0, .55, 0], enamel);
  const rack = groupAt(p, [0, 1.04, -.11]);
  rack.rotation.x = -.24;
  casing(rack, [1.56, .34, .72], [0, 0, 0], enamel);
  casing(rack, [1.42, .025, .62], [0, .177, 0], steel, .015);
  for (const x of [-.48, .48]) {
    cylinder(rack, .104, .05, [x, .2, .15], copper);
    cylinder(rack, .081, .036, [x, .234, .15], metal(0x383f35));
  }
  const indicator = new THREE.MeshStandardMaterial({color: ready ? 0x8bd8ad : 0xe0a359,
    emissive: ready ? 0x60b68a : 0xbf7132, emissiveIntensity: .6});
  cylinder(rack, .076, .024, [.19, .2, .14], indicator);
  for (let i = 0; i < 5; i++) casing(rack, [.056, .02, .08], [-.18 + i * .083, .2, -.15], copper, .01);
  pipe(p, [[.35, .12, -.18], [.53, .05, -.58], [1.32, .035, -.67]], .036, steel, .23);
  return p;
}

export function reel(parent, pos, dark = metal(0x384442), tape = metal(0x97654b)) {
  const p = groupAt(parent, pos);
  p.name = 'tape-reel';
  for (const y of [-.035, .035]) {
    const rim = add(p, new THREE.TorusGeometry(.16, .017, 9, 32), dark, [0, y, 0]);
    rim.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const spoke = casing(p, [.034, .018, .14],
        [Math.sin(a) * .085, y, Math.cos(a) * .085], dark, .007);
      spoke.rotation.y = a;
    }
  }
  cylinder(p, .113, .068, [0, 0, 0], tape);
  cylinder(p, .045, .09, [0, 0, 0], dark);
  return p;
}

export function rotorBlade(parent, angle, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-.19, .49);
  shape.quadraticCurveTo(-.43, 1.25, -.24, 1.84);
  shape.quadraticCurveTo(.04, 2.01, .32, 1.81);
  shape.quadraticCurveTo(.19, 1.24, .15, .57);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: .065, bevelThickness: .032,
    bevelSize: .03, bevelSegments: 3, steps: 1, curveSegments: 12});
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(angle);
  return add(parent, geometry, material, [0, 0, 0]);
}

export function dressing(parent, era) {
  const steel = metal(0x8a9692, .4);
  const wood = metal(era === 0 ? 0x8b6842 : era === 2 ? 0x6a7c78 : 0x746456, .7);
  const cream = metal(0xe7d7b0, .62);
  const shade = metal(era === 2 ? 0xb7ddd8 : 0xd9c7a4, .55);
  const extinguisher = (x, z, yaw) => {
    const p = groupAt(parent, [x, 0, z]);
    p.rotation.y = yaw;
    cylinder(p, .11, .62, [0, .48, 0], metal(0x9c4034, .48), .11, 12);
    cylinder(p, .13, .06, [0, .16, 0], steel, .13, 12);
    cylinder(p, .045, .08, [0, .82, 0], steel, .05, 10);
    pipe(p, [[0, .84, 0], [.12, .92, 0], [.12, .98, .02]], .02, steel, .04);
  };
  for (const spot of [[-10.15, -23.4, .35], [10.15, 23.3, 2.7], [-10.2, 5.6, -.15], [10.15, -7.4, 2.9]]) extinguisher(...spot);
  const crates = (x, z, yaw) => {
    const p = groupAt(parent, [x, 0, z]);
    p.rotation.y = yaw;
    casing(p, [.72, .48, .56], [0, .24, 0], wood, .03);
    casing(p, [.48, .34, .4], [.06, .64, .02], wood, .02);
  };
  crates(9.2, 15.4, .35);
  crates(-9.1, -16.6, -.25);
  crates(8.7, -19.6, .2);
  for (const [x, z] of [[20, -21.15], [26.2, -21.15], [-16.4, 16.2]]) {
    const p = groupAt(parent, [x, 0, z]);
    cylinder(p, .32, .68, [0, .34, 0], steel, .32, 16);
    cylinder(p, .345, .045, [0, .18, 0], metal(0x5c6c66, .46), .345, 16);
    cylinder(p, .345, .045, [0, .52, 0], metal(0x5c6c66, .46), .345, 16);
  }
  reel(parent, [-33.5, .4, 15.4], steel, metal(0x3c4a46));
  reel(parent, [33.2, .4, -6.2], steel, metal(0x6a5340));
  for (const [x, z, yaw] of [[6.5, 8.4, .45], [-6.3, -8.6, -.35]]) {
    const p = groupAt(parent, [x, 0, z]);
    p.rotation.y = yaw;
    casing(p, [.42, .58, .035], [0, .4, 0], metal(0xd08a32, .58), .012);
    cylinder(p, .022, .62, [-.14, .32, .06], steel, .022, 6);
    cylinder(p, .022, .62, [.14, .32, -.06], steel, .022, 6);
  }
  for (const z of [-18, -6, 6, 18]) {
    const p = groupAt(parent, [0, 0, z]);
    cylinder(p, .028, .85, [0, 7.2, 0], steel, .028, 8);
    cylinder(p, .26, .09, [0, 6.7, 0], shade, .32, 16);
    const bulb = add(p, new THREE.SphereGeometry(.075, 12, 8), metal(0xfff1cf, .3), [0, 6.58, 0]);
    bulb.material.emissive = new THREE.Color(era === 2 ? 0x9ad8d0 : 0xffd9a2);
    bulb.material.emissiveIntensity = .5;
    const lamp = new THREE.PointLight(era === 2 ? 0xd7fff6 : 0xffe2bf, 2.4, 8, 2);
    lamp.position.set(0, 6.45, 0);
    p.add(lamp);
  }
  const clock = groupAt(parent, [6.4, 3.25, 26.68]);
  cylinder(clock, .38, .07, [0, 0, 0], steel, .38, 20);
  cylinder(clock, .3, .035, [0, 0, .04], cream, .3, 20);
  pipe(clock, [[0, 0, .07], [0, .16, .07]], .012, metal(0x243038, .4), .01);
  pipe(parent, [[-8, 3.2, -21], [-8, 3.2, 21]], .032, steel, .25);
  pipe(parent, [[8, 3.2, -21], [8, 3.2, 21]], .032, steel, .25);
  if (era !== 2) {
    plant(parent, 33.1, 20.2, era + 2);
    plant(parent, -33.2, -23.4, era + 4);
  }
}

export function roof(parent, era, steel, glass) {
  const concrete = metal([0xa79e88, 0xa9b1a8, 0xbacbcb][era], .83);
  const rib = metal(era === 2 ? 0x7b9c9f : 0x6f7e78, .6);
  // Broad opaque shoulders frame the central overhead skylight.
  for (const x of [-7.65, 7.65]) {
    casing(parent, [7.5, .17, 54], [x, 8.51, 0], concrete);
    casing(parent, [.18, .35, 54], [x > 0 ? 3.9 : -3.9, 8.36, 0], steel);
  }
  for (let z = -24; z <= 24; z += 8) {
    casing(parent, [7.72, .10, .125], [0, 8.59, z], rib);
  }
  for (const z of [-26.95, 26.95]) {
    const bay = groupAt(parent, [0, 0, z]);
    for (let x = -32; x <= 32; x += 8) {
      casing(bay, [7.62, 3.49, .034], [x, 3.74, 0], glass).castShadow = false;
      for (const y of [2.1, 3.65, 5.36]) casing(bay, [7.73, .077, .2], [x, y, 0], rib);
      for (const dx of [-1.26, 1.26]) casing(bay, [.075, 3.22, .16], [x + dx, 3.74, 0], rib);
    }
  }
  for (const x of [-35.96, 35.96]) {
    const bay = groupAt(parent, [x, 0, 0]);
    bay.rotation.y = Math.PI / 2;
    for (let z = -20; z <= 20; z += 8) {
      casing(bay, [7.66, 3.49, .034], [z, 3.74, 0], glass).castShadow = false;
      for (const y of [2.1, 3.65, 5.36]) casing(bay, [7.7, .077, .2], [z, y, 0], rib);
      for (const dz of [-1.26, 1.26]) casing(bay, [.075, 3.22, .16], [z + dz, 3.74, 0], rib);
    }
  }
}
