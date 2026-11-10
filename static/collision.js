const CONTACT_GAP = .0001;
const MAX_STEP = .12;

export class StationCollision {
  constructor(solids, bounds, radius) {
    this.solids = solids.map(solid => ({
      ...solid,
      cosine: Math.cos(solid.yaw || 0),
      sine: Math.sin(solid.yaw || 0),
    }));
    this.groundSolids = this.solids.filter(solid => solid.bottom < 1.83);
    this.bounds = bounds;
    this.radius = radius;
  }

  contact(x, z, shape) {
    const dx = x - shape.x, dz = z - shape.z, radius = this.radius;
    if (shape.radius !== undefined) {
      const reach = radius + shape.radius;
      const length2 = dx * dx + dz * dz;
      if (length2 >= reach * reach) return null;
      const length = Math.sqrt(length2);
      const gap = reach - length + CONTACT_GAP;
      return length ? [dx / length * gap, dz / length * gap] : [gap, 0];
    }
    const {cosine: c, sine: s, width, depth} = shape;
    const u = dx * c - dz * s, v = dx * s + dz * c;
    const w = width / 2, d = depth / 2;
    if (Math.abs(u) >= w + radius || Math.abs(v) >= d + radius) return null;
    let a = u - Math.max(-w, Math.min(w, u));
    let b = v - Math.max(-d, Math.min(d, v));
    const length2 = a * a + b * b;
    if (length2 >= radius * radius) return null;
    if (length2) {
      const length = Math.sqrt(length2);
      const factor = (radius - length + CONTACT_GAP) / length;
      a *= factor;
      b *= factor;
    } else if (w - Math.abs(u) < d - Math.abs(v)) {
      a = (u < 0 ? -1 : 1) * (w - Math.abs(u) + radius + CONTACT_GAP);
    } else {
      b = (v < 0 ? -1 : 1) * (d - Math.abs(v) + radius + CONTACT_GAP);
    }
    return [a * c + b * s, -a * s + b * c];
  }

  free(x, z) {
    const [left, right, north, south] = this.bounds;
    return x >= left + .5 && x <= right - .5 && z >= north + .5 && z <= south - .5
      && !this.groundSolids.some(shape => this.contact(x, z, shape));
  }

  move(position, dx, dz) {
    if (dx === 0 && dz === 0) return;
    const count = Math.ceil(Math.hypot(dx, dz) / MAX_STEP);
    const sx = dx / count, sz = dz / count;
    const [left, right, north, south] = this.bounds;
    for (let step = 0; step < count; step++) {
      let x = position.x + sx, z = position.z + sz;
      // Project the small step out of the contacted surface. Its tangent is
      // preserved so a diagonal input slides along walls and round machines.
      for (let pass = 0; pass < 4; pass++) {
        x = Math.max(left + .5, Math.min(right - .5, x));
        z = Math.max(north + .5, Math.min(south - .5, z));
        let overlap = false;
        for (const shape of this.groundSolids) {
          const push = this.contact(x, z, shape);
          if (!push) continue;
          x += push[0];
          z += push[1];
          overlap = true;
        }
        if (!overlap) break;
      }
      if (!this.free(x, z)) continue;
      position.x = x;
      position.z = z;
    }
  }

  cameraLimit(origin, direction, maxDistance) {
    const margin = .19;
    let nearest = maxDistance;
    for (const shape of this.solids) {
      const dx = origin.x - shape.x, dz = origin.z - shape.z;
      const y = raySlab(origin.y, direction.y, shape.bottom - margin, shape.top + margin);
      if (!y) continue;
      let entry = Math.max(0, y[0]), exit = Math.min(nearest, y[1]);
      if (entry > exit) continue;
      if (shape.radius !== undefined) {
        const r = shape.radius + margin;
        const a = direction.x ** 2 + direction.z ** 2;
        const b = dx * direction.x + dz * direction.z;
        const c = dx ** 2 + dz ** 2 - r ** 2;
        if (a < 1e-8) {
          if (c > 0) continue;
        } else {
          const discriminant = b ** 2 - a * c;
          if (discriminant < 0) continue;
          const root = Math.sqrt(discriminant);
          entry = Math.max(entry, (-b - root) / a);
          exit = Math.min(exit, (-b + root) / a);
        }
      } else {
        const {cosine: c, sine: s} = shape;
        const w = shape.width / 2 + margin, d = shape.depth / 2 + margin;
        const u = raySlab(dx * c - dz * s, direction.x * c - direction.z * s, -w, w);
        const v = raySlab(dx * s + dz * c, direction.x * s + direction.z * c, -d, d);
        if (!u || !v) continue;
        entry = Math.max(entry, u[0], v[0]);
        exit = Math.min(exit, u[1], v[1]);
      }
      if (entry <= exit) nearest = entry;
    }
    return nearest;
  }
}

function raySlab(origin, direction, low, high) {
  if (Math.abs(direction) < 1e-8) return origin < low || origin > high ? null : [-Infinity, Infinity];
  const a = (low - origin) / direction, b = (high - origin) / direction;
  return a <= b ? [a, b] : [b, a];
}
