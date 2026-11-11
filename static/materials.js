import * as THREE from './vendor/three.module.js';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function heightToNormal(source, strength) {
  const w = source.width;
  const h = source.height;
  const src = source.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w);
  const image = out.getContext('2d').createImageData(w, h);
  const sample = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = sample(x + 1, y) - sample(x - 1, y);
      const dy = sample(x, y + 1) - sample(x, y - 1);
      const i = (y * w + x) * 4;
      image.data[i] = Math.max(0, Math.min(255, (-dx * strength + 1) * 127.5));
      image.data[i + 1] = Math.max(0, Math.min(255, (-dy * strength + 1) * 127.5));
      image.data[i + 2] = 255;
      image.data[i + 3] = 255;
    }
  }
  out.getContext('2d').putImageData(image, 0, 0);
  return out;
}

function keepTexture(source, colorSpace) {
  const texture = new THREE.CanvasTexture(source);
  if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.userData.keep = true;
  return texture;
}

function stamp(source, repeat) {
  const texture = source.clone();
  texture.userData = {};
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.needsUpdate = true;
  return texture;
}

function grain(ctx, rand, count, alpha) {
  for (let i = 0; i < count; i++) {
    const shade = Math.floor(rand() * 40);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha * rand()})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function paintPlaster(stage) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const base = ['#d8c4a0', '#c3ccd0', '#d7e6e2'][stage];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(210 + stage * 17);
  grain(ctx, rand, 7000, .22);
  ctx.strokeStyle = stage === 1 ? 'rgba(40,48,52,.45)' : 'rgba(70,60,40,.28)';
  ctx.lineWidth = 3;
  for (let x = 0; x <= 512; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 188);
  ctx.lineTo(512, 188);
  ctx.stroke();
  const height = canvas();
  const h = height.getContext('2d');
  h.fillStyle = '#808080';
  h.fillRect(0, 0, 512, 512);
  h.strokeStyle = '#3a3a3a';
  h.lineWidth = 4;
  for (let x = 0; x <= 512; x += 128) {
    h.beginPath();
    h.moveTo(x, 0);
    h.lineTo(x, 512);
    h.stroke();
  }
  h.beginPath();
  h.moveTo(0, 188);
  h.lineTo(512, 188);
  h.stroke();
  h.fillStyle = '#d0d0d0';
  for (let x = 16; x < 512; x += 32) {
    for (const y of [176, 200]) h.fillRect(x, y, 5, 5);
  }
  if (stage === 1) {
    ctx.fillStyle = 'rgba(55,62,58,.28)';
    ctx.beginPath();
    ctx.ellipse(180, 360, 90, 40, .4, 0, Math.PI * 2);
    ctx.fill();
    h.strokeStyle = '#2a2a2a';
    h.beginPath();
    h.moveTo(240, 80);
    h.lineTo(300, 210);
    h.lineTo(270, 340);
    h.stroke();
  }
  if (stage === 2) {
    ctx.fillStyle = 'rgba(90,140,130,.16)';
    for (let i = 0; i < 18; i++) ctx.fillRect(rand() * 512, 420 + rand() * 80, 18, 8);
  }
  const rough = canvas();
  const r = rough.getContext('2d');
  r.fillStyle = stage === 1 ? '#9a9a9a' : '#b5b5b5';
  r.fillRect(0, 0, 512, 512);
  r.drawImage(height, 0, 0);
  return {color: c, height, rough, metalness: .04, normalScale: .85};
}

function paintFloor(stage) {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = ['#cbb89a', '#aeb8b6', '#d5e2de'][stage];
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(88 + stage);
  for (let y = 0; y < 512; y += 128) {
    for (let x = 0; x < 512; x += 128) {
      const shift = Math.floor((rand() - .5) * 18);
      ctx.fillStyle = `rgba(${120 + shift},${110 + shift},${96 + shift},.18)`;
      ctx.fillRect(x + 4, y + 4, 120, 120);
    }
  }
  ctx.strokeStyle = stage === 0 ? '#8d7354' : '#7d8c8a';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
  }
  grain(ctx, rand, 4000, .16);
  if (stage === 1) {
    ctx.fillStyle = 'rgba(40,70,78,.34)';
    ctx.beginPath();
    ctx.ellipse(140, 300, 70, 36, .2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(360, 120, 50, 24, -.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const height = canvas();
  const h = height.getContext('2d');
  h.fillStyle = '#9a9a9a';
  h.fillRect(0, 0, 512, 512);
  h.strokeStyle = '#4a4a4a';
  h.lineWidth = 6;
  for (let i = 0; i <= 512; i += 128) {
    h.beginPath();
    h.moveTo(0, i);
    h.lineTo(512, i);
    h.moveTo(i, 0);
    h.lineTo(i, 512);
    h.stroke();
  }
  const rough = canvas();
  rough.getContext('2d').drawImage(height, 0, 0);
  return {color: c, height, rough, metalness: .02, normalScale: 1};
}

function paintEarth(stage) {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = ['#d5d2bc', '#c9cbbd', '#d4ddd2'][stage];
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(440 + stage);
  grain(ctx, rand, 12000, .2);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(90,80,55,${.04 + rand() * .05})`;
    ctx.fillRect(rand() * 512, rand() * 512, 2 + rand() * 5, 2);
  }
  const height = canvas();
  const h = height.getContext('2d');
  h.fillStyle = '#808080';
  h.fillRect(0, 0, 512, 512);
  h.fillStyle = '#666';
  for (let i = 0; i < 80; i++) h.fillRect(rand() * 512, rand() * 512, 8 + rand() * 20, 3);
  const rough = canvas();
  const rctx = rough.getContext('2d');
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, 512, 512);
  return {color: c, height, rough, metalness: 0, normalScale: .7};
}

function paintWood(stage) {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = ['#8d6844', '#7d7360', '#8ea09a'][stage];
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(19 + stage);
  for (let y = 0; y < 512; y += 3) {
    ctx.strokeStyle = `rgba(40,24,12,${.08 + rand() * .12})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(160, y + rand() * 6, 340, y - rand() * 6, 512, y);
    ctx.stroke();
  }
  const height = canvas();
  const h = height.getContext('2d');
  h.fillStyle = '#808080';
  h.fillRect(0, 0, 512, 512);
  h.strokeStyle = '#5a5a5a';
  for (let y = 8; y < 512; y += 18) {
    h.beginPath();
    h.moveTo(0, y);
    h.lineTo(512, y + 2);
    h.stroke();
  }
  const rough = canvas();
  rough.getContext('2d').drawImage(c, 0, 0);
  return {color: c, height, rough, metalness: .02, normalScale: .45};
}

function paintSteel() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8d9694';
  ctx.fillRect(0, 0, 512, 512);
  const rand = rng(7);
  for (let y = 0; y < 512; y += 2) {
    ctx.strokeStyle = `rgba(255,255,255,${.03 + rand() * .05})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const height = canvas();
  const h = height.getContext('2d');
  h.fillStyle = '#808080';
  h.fillRect(0, 0, 512, 512);
  h.strokeStyle = '#6e6e6e';
  for (let y = 0; y < 512; y += 4) {
    h.beginPath();
    h.moveTo(0, y);
    h.lineTo(512, y);
    h.stroke();
  }
  const rough = canvas();
  const r = rough.getContext('2d');
  r.fillStyle = '#6a6a6a';
  r.fillRect(0, 0, 512, 512);
  r.fillStyle = '#9a9a9a';
  for (let i = 0; i < 30; i++) r.fillRect(rand() * 512, rand() * 512, 40, 8);
  return {color: c, height, rough, metalness: .72, normalScale: .28};
}

function paintWater(stage) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  const tops = ['#8eb8b0', '#6e8e9a', '#7eb8b4'];
  const bottoms = ['#3f6e78', '#355868', '#3d7c86'];
  grad.addColorStop(0, tops[stage]);
  grad.addColorStop(1, bottoms[stage]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  const height = canvas();
  const h = height.getContext('2d');
  h.fillStyle = '#808080';
  h.fillRect(0, 0, 512, 512);
  h.strokeStyle = '#b4b4b4';
  h.lineWidth = 2;
  for (let y = 0; y < 512; y += 28) {
    h.beginPath();
    h.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) h.quadraticCurveTo(x + 16, y + ((y / 28) % 2 ? 7 : -7), x + 32, y);
    h.stroke();
  }
  const rough = canvas();
  const r = rough.getContext('2d');
  r.fillStyle = '#2e2e2e';
  r.fillRect(0, 0, 512, 512);
  return {color: c, height, rough, metalness: .2, normalScale: .55};
}

const painters = {
  plaster: paintPlaster,
  floor: paintFloor,
  earth: paintEarth,
  wood: paintWood,
  steel: paintSteel,
  water: paintWater,
};

function pack(kind, stage) {
  const key = kind + ':' + stage;
  if (cache.has(key)) return cache.get(key);
  const painted = (painters[kind] || paintSteel)(stage);
  const stored = {
    map: keepTexture(painted.color, true),
    normal: keepTexture(heightToNormal(painted.height, kind === 'steel' ? 1.4 : 2.4), false),
    rough: keepTexture(painted.rough, false),
    bump: keepTexture(painted.height, false),
    metalness: painted.metalness,
    normalScale: painted.normalScale,
  };
  cache.set(key, stored);
  return stored;
}

export function surfaceMaterial(kind, stage, repeat = [4, 4], quality = 1) {
  const maps = pack(kind, kind === 'steel' ? 0 : stage);
  const material = new THREE.MeshStandardMaterial({
    map: stamp(maps.map, repeat),
    roughnessMap: stamp(maps.rough, repeat),
    roughness: 1,
    metalness: maps.metalness,
  });
  if (quality > 0) {
    material.normalMap = stamp(maps.normal, repeat);
    material.normalScale = new THREE.Vector2(maps.normalScale, maps.normalScale);
  } else {
    material.bumpMap = stamp(maps.bump, repeat);
    material.bumpScale = kind === 'steel' ? .02 : .045;
  }
  return material;
}

let equipment;
export function equipmentMaps() {
  if (equipment) return equipment;
  const maps = pack('steel', 0);
  equipment = {bumpMap: maps.bump, roughnessMap: maps.rough};
  return equipment;
}

const skies = [];
export function skyTexture(stage) {
  if (skies[stage]) return skies[stage];
  const c = canvas(128);
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  const tops = ['#f0c27a', '#8eabbf', '#8fd0c8'];
  const mids = ['#f4ddb4', '#c5d3dc', '#cfeae4'];
  const lows = ['#e6d2ae', '#b7c8d2', '#c7e6e0'];
  grad.addColorStop(0, tops[stage]);
  grad.addColorStop(.34, mids[stage]);
  grad.addColorStop(.5, lows[stage]);
  grad.addColorStop(1, lows[stage]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.keep = true;
  skies[stage] = texture;
  return texture;
}

const environments = [];
export function environmentFor(stage) {
  if (environments[stage]) return environments[stage];
  const c = canvas(128);
  c.height = 64;
  const ctx = c.getContext('2d');
  const sky = ['#f3ddb8', '#c5d4de', '#c9ebe6'][stage];
  const horizon = ['#e7d3ae', '#d5dde2', '#d7f0ea'][stage];
  const ground = ['#8a7350', '#5d6c74', '#6e908a'][stage];
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, sky);
  grad.addColorStop(.48, horizon);
  grad.addColorStop(.55, ground);
  grad.addColorStop(1, ground);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);
  const texture = new THREE.CanvasTexture(c);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.keep = true;
  environments[stage] = texture;
  return texture;
}
