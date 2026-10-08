/**
 * A small, deterministic boundary-flow model for the Shape Flow playground.
 * All coordinates and velocities are in world pixels and world pixels/second.
 *
 * The continuous force model is smooth away from degenerate boundaries. The
 * finite polygon integrator is protected by collision checks and backtracking;
 * those checks are practical safeguards, not a proof of a global diffeomorphism.
 */

const EPS = 1e-8;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const copy = (p) => ({ x: p.x, y: p.y });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePoint = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);

function asPoint(p) {
  return Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) };
}

export function signedArea(points) {
  let sum = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(points) { return Math.abs(signedArea(points)); }

export function perimeter(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) sum += dist(points[i], points[(i + 1) % points.length]);
  return sum;
}

export function centroid(points) {
  let area6 = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area6 += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(area6) < EPS) {
    const n = Math.max(1, points.length);
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: x / (3 * area6), y: y / (3 * area6) };
}

export function makeCircle(cx = 470, cy = 335, radius = 115, count = 120) {
  return Array.from({ length: count }, (_, i) => ({ x: cx + radius * Math.cos(i * TAU / count), y: cy + radius * Math.sin(i * TAU / count) }));
}

export function resamplePolygon(points, count = 120) {
  if (points.length < 3) return points.map(copy);
  const lengths = points.map((p, i) => dist(p, points[(i + 1) % points.length]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total < EPS) return [];
  const out = [];
  let segment = 0, offset = 0;
  for (let i = 0; i < count; i++) {
    const target = i * total / count;
    while (segment < points.length - 1 && offset + lengths[segment] < target) offset += lengths[segment++];
    const a = points[segment], b = points[(segment + 1) % points.length];
    const t = lengths[segment] > EPS ? (target - offset) / lengths[segment] : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Close a brush stroke and sample its fixed material boundary at the chosen detail. */
export function prepareStroke(raw, count = 120) {
  count = Math.round(clamp(Number(count) || 120, 60, 480));
  const captureSpacing = 1.1 * Math.min(1, 120 / count);
  let points = [];
  for (const rawPoint of raw) {
    const p = asPoint(rawPoint);
    if (finitePoint(p) && (!points.length || dist(p, points[points.length - 1]) > captureSpacing)) points.push(p);
  }
  if (points.length > 1 && dist(points[0], points[points.length - 1]) < captureSpacing * 1.8) points.pop();
  if (points.length < 3) return [];
  // Resampling before corner cutting makes smoothing independent of pen speed.
  // Fine settings preserve the captured corners instead of smoothing away detail.
  points = resamplePolygon(points, count);
  const smoothingPasses = count <= 120 ? 2 : count <= 240 ? 1 : 0;
  for (let pass = 0; pass < smoothingPasses; pass++) {
    const smooth = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      smooth.push({ x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y });
      smooth.push({ x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y });
    }
    points = smooth;
  }
  if (smoothingPasses > 0) points = resamplePolygon(points, count);
  if (signedArea(points) < 0) points.reverse();
  return points;
}

function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < 1e-6 && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
function segmentsIntersect(a, b, c, d) {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - EPS || Math.max(c.x, d.x) < Math.min(a.x, b.x) - EPS || Math.max(a.y, b.y) < Math.min(c.y, d.y) - EPS || Math.max(c.y, d.y) < Math.min(a.y, b.y) - EPS) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function boundarySegments(points, group = 0) {
  return points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    return { a, b, index, group, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
  });
}

// A sweep limits exact checks to overlapping segment bounds. This leaves the
// intersection predicate unchanged while avoiding a full N² scan for fine paths.
function sweepSegmentPairs(segments, clearance, intersects) {
  segments.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
  const active = [];
  for (const segment of segments) {
    let retained = 0;
    for (const other of active) {
      if (other.maxX + clearance < segment.minX - EPS) continue;
      active[retained++] = other;
      if (other.maxY + clearance < segment.minY - EPS || segment.maxY + clearance < other.minY - EPS) continue;
      if (intersects(segment, other)) return true;
    }
    active.length = retained;
    active.push(segment);
  }
  return false;
}

export function hasSelfIntersection(points) {
  const n = points.length;
  if (n >= 80) {
    return sweepSegmentPairs(boundarySegments(points), 0, (a, b) => {
      const gap = Math.abs(a.index - b.index);
      return gap !== 1 && gap !== n - 1 && segmentsIntersect(a.a, a.b, b.a, b.b);
    });
  }
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function pointInPolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (onSegment(a, b, p)) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function bounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > EPS ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function polygonsOverlap(a, b, clearance = 0) {
  const ba = bounds(a), bb = bounds(b);
  if (ba.maxX + clearance < bb.minX || bb.maxX + clearance < ba.minX || ba.maxY + clearance < bb.minY || bb.maxY + clearance < ba.minY) return false;
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return true;
  if (a.length + b.length >= 160) {
    return sweepSegmentPairs([...boundarySegments(a), ...boundarySegments(b, 1)], clearance, (first, second) => {
      if (first.group === second.group) return false;
      const { a: a0, b: a1 } = first, { a: b0, b: b1 } = second;
      return segmentsIntersect(a0, a1, b0, b1) || (clearance > 0 && Math.min(pointSegmentDistance(a0, b0, b1), pointSegmentDistance(a1, b0, b1), pointSegmentDistance(b0, a0, a1), pointSegmentDistance(b1, a0, a1)) < clearance);
    });
  }
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i], a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j], b1 = b[(j + 1) % b.length];
      if (Math.max(a0.x, a1.x) + clearance < Math.min(b0.x, b1.x) || Math.max(b0.x, b1.x) + clearance < Math.min(a0.x, a1.x) || Math.max(a0.y, a1.y) + clearance < Math.min(b0.y, b1.y) || Math.max(b0.y, b1.y) + clearance < Math.min(a0.y, a1.y)) continue;
      if (segmentsIntersect(a0, a1, b0, b1)) return true;
      if (clearance > 0 && Math.min(pointSegmentDistance(a0, b0, b1), pointSegmentDistance(a1, b0, b1), pointSegmentDistance(b0, a0, a1), pointSegmentDistance(b1, a0, a1)) < clearance) return true;
    }
  }
  return false;
}

export function localFieldVelocity(fields, x, y, enabled = true) {
  let vx = 0, vy = 0;
  if (!enabled) return { x: 0, y: 0 };
  for (const field of fields) {
    const length = Math.hypot(field.dx, field.dy);
    if (length < EPS) continue;
    const sigma = Math.max(20, Number(field.radius) || 140);
    const r2 = (x - field.x) ** 2 + (y - field.y) ** 2;
    const weight = Math.exp(-r2 / (2 * sigma * sigma));
    const magnitude = 60 * clamp(Number(field.strength) || 0, 0, 6) * weight / length;
    vx += field.dx * magnitude;
    vy += field.dy * magnitude;
  }
  // Smoothly bound extreme combinations without affecting ordinary single arrows.
  const speed = Math.hypot(vx, vy);
  const scale = speed > EPS ? 420 * Math.tanh(speed / 420) / speed : 1;
  return { x: vx * scale, y: vy * scale };
}

function correctedArea(points, targetArea) {
  const area = signedArea(points);
  if (area <= EPS) return points;
  const scale = Math.sqrt(targetArea / area), center = centroid(points);
  return points.map(p => ({ x: center.x + (p.x - center.x) * scale, y: center.y + (p.y - center.y) * scale }));
}

function minimumEdge(points) {
  return Math.min(.22, ...points.map((p, i) => .15 * dist(p, points[(i + 1) % points.length])));
}

// Freeze the current edge lengths and treat the curvature Laplacian implicitly.
// The cyclic tridiagonal solve is O(N), so finer boundaries need no O(N²) number
// of explicit time steps. External forces and area pressure remain explicit.
function advanceSurface(points, velocities, gamma, h) {
  const n = points.length;
  const lower = new Float64Array(n), diagonal = new Float64Array(n), upper = new Float64Array(n);
  const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n], p = points[i], b = points[(i + 1) % n];
    const la = Math.max(.3, dist(a, p)), lb = Math.max(.3, dist(p, b));
    const left = 2 / ((la + lb) * la), right = 2 / ((la + lb) * lb);
    lower[i] = -h * gamma * left;
    upper[i] = -h * gamma * right;
    diagonal[i] = 1 - lower[i] - upper[i];
    x[i] = p.x + h * (velocities[i].x - gamma * (left * (a.x - p.x) + right * (b.x - p.x)));
    y[i] = p.y + h * (velocities[i].y - gamma * (left * (a.y - p.y) + right * (b.y - p.y)));
  }
  // Sherman–Morrison removes the two wrap-around matrix entries. Factor once
  // and solve the x, y and correction vectors together.
  const cornerTop = lower[0], cornerBottom = upper[n - 1], shift = -diagonal[0];
  diagonal[0] -= shift;
  diagonal[n - 1] -= cornerTop * cornerBottom / shift;
  z[0] = shift;
  z[n - 1] = cornerBottom;
  for (let i = 1; i < n; i++) {
    const factor = lower[i] / diagonal[i - 1];
    diagonal[i] -= factor * upper[i - 1];
    x[i] -= factor * x[i - 1];
    y[i] -= factor * y[i - 1];
    z[i] -= factor * z[i - 1];
  }
  x[n - 1] /= diagonal[n - 1];
  y[n - 1] /= diagonal[n - 1];
  z[n - 1] /= diagonal[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    x[i] = (x[i] - upper[i] * x[i + 1]) / diagonal[i];
    y[i] = (y[i] - upper[i] * y[i + 1]) / diagonal[i];
    z[i] = (z[i] - upper[i] * z[i + 1]) / diagonal[i];
  }
  const cornerRatio = cornerTop / shift;
  const denominator = 1 + z[0] + cornerRatio * z[n - 1];
  const factorX = (x[0] + cornerRatio * x[n - 1]) / denominator;
  const factorY = (y[0] + cornerRatio * y[n - 1]) / denominator;
  return points.map((_, i) => ({ x: x[i] - factorX * z[i], y: y[i] - factorY * z[i] }));
}

export class Simulation {
  constructor(options = {}) {
    this.width = options.width ?? 1000;
    this.height = options.height ?? 680;
    this.defaults = { cx: options.cx ?? 470, cy: options.cy ?? 335, radius: options.radius ?? 115 };
    this.settings = {
      priorStrength: 1,
      fieldsEnabled: true,
      surfaceTension: 1000,
      klRate: 1.1,
      klSigma: 35,
      sampleCount: 120,
      drawResolution: 120,
      clearance: 3,
      ...options.settings,
    };
    this.reset();
  }

  reset(options = {}) {
    this.defaults = { ...this.defaults, ...options };
    const { cx, cy, radius } = this.defaults;
    this.shapes = [];
    this.fields = [];
    this.time = 0;
    this.blockedSteps = 0;
    this.lastBlocked = false;
    this._shapeId = 0;
    this._fieldId = 0;
    this.shapes.push(this._newShape(makeCircle(cx, cy, radius, this.settings.sampleCount), 'surface'));
    return this;
  }

  _newShape(points, kind) {
    return {
      id: `shape-${++this._shapeId}`,
      kind,
      points: points.map(copy),
      reference: points.map(copy),
      initialArea: polygonArea(points),
      initialPerimeter: perimeter(points),
      initialCentroid: centroid(points),
      // Dense boundaries have legitimately short edges, especially at corners.
      // Measure collapse relative to that shape's own initial sampling distance.
      minEdge: minimumEdge(points),
    };
  }

  setSurfaceResolution(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return { ok: false, reason: '请选择有效的圆盘分辨率' };
    const count = Math.round(clamp(numeric, 60, 480) / 30) * 30;
    const index = this.shapes.findIndex(shape => shape.kind === 'surface');
    if (index < 0) return { ok: false, reason: '当前场景没有初始圆盘' };
    const shape = this.shapes[index];
    if (shape.points.length === count) {
      this.settings.sampleCount = count;
      return { ok: true, shape };
    }
    const points = correctedArea(resamplePolygon(shape.points, count), polygonArea(shape.points));
    // The surface prior is the original circle. Rebuild that circle at the new
    // resolution with exactly the same enclosed area and center.
    const radius = Math.sqrt(2 * shape.initialArea / (count * Math.sin(TAU / count)));
    const reference = makeCircle(shape.initialCentroid.x, shape.initialCentroid.y, radius, count);
    const candidateShape = { ...shape, points, reference, minEdge: minimumEdge(points) };
    const candidateShapes = this.shapes.map((current, i) => i === index ? candidateShape : current);
    if (!this._validCandidates(candidateShapes.map(current => current.points), candidateShapes)) {
      return { ok: false, reason: '当前轮廓太接近其他形状或边界，请先移开后再调整分辨率' };
    }
    // Commit only after geometry validation; preserve identities and all other
    // shapes, KL material references, fields, area targets and simulation time.
    shape.points = points;
    shape.reference = reference;
    shape.minEdge = candidateShape.minEdge;
    this.settings.sampleCount = count;
    return { ok: true, shape };
  }

  addDrawnShape(rawPoints) {
    const points = prepareStroke(rawPoints, this.settings.drawResolution ?? this.settings.sampleCount);
    if (points.length < 3 || polygonArea(points) < 700 || perimeter(points) < 80) return { ok: false, reason: '请画一个稍大的闭合区域' };
    if (hasSelfIntersection(points)) return { ok: false, reason: '轮廓不能自交，请重新画一个闭合区域' };
    if (points.some(p => p.x < 6 || p.x > this.width - 6 || p.y < 6 || p.y > this.height - 6)) return { ok: false, reason: '请把轮廓画在画布范围内' };
    if (this.shapes.some(s => polygonsOverlap(points, s.points, this.settings.clearance))) return { ok: false, reason: '请在空白处绘制，让区域彼此分离' };
    const shape = this._newShape(points, 'kl');
    this.shapes.push(shape);
    return { ok: true, shape };
  }

  addField(options) {
    const field = {
      id: `field-${++this._fieldId}`,
      x: Number(options.x), y: Number(options.y),
      dx: Number(options.dx ?? 80), dy: Number(options.dy ?? 0),
      strength: options.strength ?? 1.2,
      radius: options.radius ?? 140,
    };
    this.fields.push(field);
    return field;
  }

  removeField(id) { this.fields = this.fields.filter(f => f.id !== id); }
  fieldAt(x, y) { return localFieldVelocity(this.fields, x, y, this.settings.fieldsEnabled); }

  _velocities(shape) {
    const points = shape.points, n = points.length;
    const prior = clamp(Number(this.settings.priorStrength) || 0, 0, 3);
    const gamma = this.settings.surfaceTension * prior;
    const kbar = TAU / Math.max(1, perimeter(points));
    return points.map((p, i) => {
      const v = this.fieldAt(p.x, p.y);
      if (shape.kind === 'kl') {
        // Each material boundary point is an isotropic Gaussian N(p, σ²I).
        // KL(N(p,σ²I) || N(p0,σ²I)) = ||p-p0||²/(2σ²).
        // A positive mobility absorbs σ² and the mean's 1/N normalization.
        v.x += this.settings.klRate * prior * (shape.reference[i].x - p.x);
        v.y += this.settings.klRate * prior * (shape.reference[i].y - p.y);
      } else if (gamma > 0) {
        const a = points[(i + n - 1) % n], b = points[(i + 1) % n];
        const la = Math.max(.3, dist(a, p)), lb = Math.max(.3, dist(p, b));
        const ta = { x: (p.x - a.x) / la, y: (p.y - a.y) / la };
        const tb = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
        const tx = ta.x + tb.x, ty = ta.y + tb.y;
        const tl = Math.max(EPS, Math.hypot(tx, ty));
        const nx = ty / tl, ny = -tx / tl;
        const kx = 2 * (tb.x - ta.x) / (la + lb), ky = 2 * (tb.y - ta.y) / (la + lb);
        v.x += gamma * (kx + kbar * nx);
        v.y += gamma * (ky + kbar * ny);
        // Tangential motion only redistributes samples; it does not intentionally
        // change the boundary geometry. It prevents compressed sample clusters.
        const tangential = .35 * gamma * (lb - la) / Math.max(1, la * lb);
        v.x += tangential * tx / tl;
        v.y += tangential * ty / tl;
      }
      return v;
    });
  }

  _validCandidates(candidates, shapes = this.shapes) {
    for (let i = 0; i < candidates.length; i++) {
      const points = candidates[i], shape = shapes[i];
      if (points.some(p => !finitePoint(p) || p.x < 4 || p.x > this.width - 4 || p.y < 4 || p.y > this.height - 4)) return false;
      if (signedArea(points) < Math.max(80, shape.initialArea * .12) || hasSelfIntersection(points)) return false;
      for (let j = 0; j < points.length; j++) if (dist(points[j], points[(j + 1) % points.length]) < shape.minEdge) return false;
      for (let j = 0; j < i; j++) if (polygonsOverlap(points, candidates[j], this.settings.clearance)) return false;
    }
    return true;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .06); // Returning to a backgrounded tab cannot make a large jump.
    let remaining = dt;
    let count = 0;
    this.lastBlocked = false;
    while (remaining > 1e-8 && count++ < 80) {
      const h = Math.min(remaining, 1 / 180);
      const gamma = this.settings.surfaceTension * clamp(Number(this.settings.priorStrength) || 0, 0, 3);
      const velocities = this.shapes.map(shape => this._velocities(shape));
      let accepted = false;
      for (let backtrack = 0; backtrack < 9; backtrack++) {
        const scale = 2 ** -backtrack;
        const candidates = this.shapes.map((shape, si) => {
          let points = shape.kind === 'surface' && gamma > 0
            ? advanceSurface(shape.points, velocities[si], gamma, h * scale)
            : shape.points.map((p, pi) => ({ x: p.x + velocities[si][pi].x * h * scale, y: p.y + velocities[si][pi].y * h * scale }));
          // Fixed enclosed area is a separate hard constraint of the droplet.
          if (shape.kind === 'surface') points = correctedArea(points, shape.initialArea);
          return points;
        });
        if (this._validCandidates(candidates)) {
          this.shapes.forEach((shape, i) => { shape.points = candidates[i]; });
          accepted = true;
          if (backtrack > 0) this.lastBlocked = true;
          break;
        }
      }
      if (!accepted) { this.lastBlocked = true; this.blockedSteps++; }
      remaining -= h;
    }
    this.time += dt - Math.max(0, remaining);
  }

  metrics() {
    const sigma2 = this.settings.klSigma ** 2;
    const shapes = this.shapes.map(shape => {
      const area = polygonArea(shape.points), length = perimeter(shape.points);
      let squared = 0, maxDisplacement = 0;
      shape.points.forEach((p, i) => {
        const d = dist(p, shape.reference[i]);
        squared += d * d;
        maxDisplacement = Math.max(maxDisplacement, d);
      });
      return {
        id: shape.id, kind: shape.kind, area,
        areaRatio: area / shape.initialArea,
        perimeter: length,
        roundness: clamp(4 * Math.PI * area / (length * length), 0, 1),
        kl: shape.kind === 'kl' ? squared / (2 * sigma2 * shape.points.length) : 0,
        maxDisplacement,
      };
    });
    const surface = shapes.find(s => s.kind === 'surface');
    const drawn = shapes.filter(s => s.kind === 'kl');
    return {
      shapeCount: shapes.length, fieldCount: this.fields.length, time: this.time,
      areaRatio: surface?.areaRatio ?? 1,
      roundness: surface?.roundness ?? 1,
      kl: drawn.length ? drawn.reduce((sum, s) => sum + s.kl, 0) / drawn.length : 0,
      blockedSteps: this.blockedSteps,
      shapes,
    };
  }
}
