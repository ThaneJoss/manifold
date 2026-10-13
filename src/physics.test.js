import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Simulation,
  centroid,
  hasSelfIntersection,
  makeCircle,
  polygonArea,
  polygonsOverlap,
  resamplePolygon,
  signedArea,
} from './physics.js';

const rectangle = (x, y, width, height) => [
  { x, y }, { x: x + width, y },
  { x: x + width, y: y + height }, { x, y: y + height },
];

function approximately(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('collision checks agree for coarse boundaries and the dense sweep path', () => {
  const square = rectangle(0, 0, 100, 100);
  const crossing = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }];
  for (const count of [4, 80]) {
    const sample = points => resamplePolygon(points, count);
    const boundary = sample(square);
    assert.equal(hasSelfIntersection(boundary), false);
    assert.equal(hasSelfIntersection(sample(crossing)), true);
    assert.equal(polygonsOverlap(boundary, sample(rectangle(20, 20, 20, 20))), true, 'containment');
    assert.equal(polygonsOverlap(boundary, sample(rectangle(100, 0, 100, 100))), true, 'touching edges');
    assert.equal(polygonsOverlap(boundary, sample(rectangle(102, 0, 100, 100))), false, 'separate edges');
    assert.equal(polygonsOverlap(boundary, sample(rectangle(102, 0, 100, 100)), 3), true, 'clearance');
    assert.equal(polygonsOverlap(boundary, sample(rectangle(104, 0, 100, 100)), 3), false, 'outside clearance');
  }
});

test('drawn boundaries normalize orientation and reject invalid geometry without changing the scene', () => {
  const sim = new Simulation({ settings: { drawResolution: 480 } });
  const raw = makeCircle(150, 180, 45, 32).reverse();
  const original = structuredClone(raw);
  const accepted = sim.addDrawnShape(raw);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.shape.points.length, 480);
  assert.ok(signedArea(accepted.shape.points) > 0);
  assert.deepEqual(raw, original);
  assert.notEqual(accepted.shape.points[0], accepted.shape.reference[0]);

  const shapes = [...sim.shapes];
  const invalidStrokes = [
    makeCircle(150, 180, 45, 32), // Overlaps the accepted shape.
    makeCircle(-10, 300, 45, 32), // Extends outside the world.
    makeCircle(800, 300, 5, 12), // Too small to form a usable region.
    [{ x: 700, y: 100 }, { x: 850, y: 250 }, { x: 700, y: 250 }, { x: 800, y: 100 }],
  ];
  for (const stroke of invalidStrokes) {
    assert.equal(sim.addDrawnShape(stroke).ok, false);
    assert.deepEqual(sim.shapes, shapes);
  }
});

test('surface resampling preserves area targets and the rest of an evolving scene', () => {
  const sim = new Simulation();
  const drawn = sim.addDrawnShape(makeCircle(150, 180, 45, 32)).shape;
  const field = sim.addField({ x: 470, y: 335, dx: 80, dy: 20 });
  sim.step(1 / 60);
  const surface = sim.shapes[0];
  const initialArea = surface.initialArea;
  const area = polygonArea(surface.points);
  const initialCentroid = { ...surface.initialCentroid };
  const drawnSnapshot = structuredClone(drawn);
  const drawnReference = drawn.reference;
  const time = sim.time;

  const result = sim.setSurfaceResolution(240);
  assert.equal(result.ok, true);
  assert.equal(result.shape, surface);
  assert.equal(sim.shapes[1], drawn);
  assert.equal(sim.fields[0], field);
  assert.equal(drawn.reference, drawnReference);
  assert.deepEqual(drawn, drawnSnapshot);
  assert.equal(sim.time, time);
  assert.equal(sim.settings.sampleCount, 240);
  assert.equal(surface.points.length, 240);
  assert.equal(surface.reference.length, 240);
  assert.equal(surface.initialArea, initialArea);
  approximately(polygonArea(surface.points) / area, 1);
  approximately(polygonArea(surface.reference) / initialArea, 1);
  approximately(centroid(surface.reference).x, initialCentroid.x);
  approximately(centroid(surface.reference).y, initialCentroid.y);
});

test('unsafe or non-finite surface resolution requests leave the scene unchanged', () => {
  // Coarser sampling needs a slight outward area correction, which would cross
  // the x = 4 world margin for this otherwise valid circle.
  const sim = new Simulation({ cx: 119.01 });
  const before = structuredClone({ shapes: sim.shapes, settings: sim.settings });
  for (const count of [60, NaN, Infinity]) {
    assert.equal(sim.setSurfaceResolution(count).ok, false);
    assert.deepEqual({ shapes: sim.shapes, settings: sim.settings }, before);
  }
});

test('local forces move shapes while preserving droplet area, and disabling them lets the KL prior recover', () => {
  const sim = new Simulation();
  const drawn = sim.addDrawnShape(makeCircle(150, 180, 45, 32)).shape;
  const reference = structuredClone(drawn.reference);
  const initialCenter = centroid(sim.shapes[0].points);
  sim.addField({ x: 350, y: 250, dx: 80, dy: 20, strength: 2, radius: 220 });
  for (let i = 0; i < 12; i++) sim.step(1 / 60);
  assert.ok(centroid(sim.shapes[0].points).x > initialCenter.x + 1);
  approximately(sim.metrics().areaRatio, 1);
  const displacedKL = sim.metrics().kl;
  assert.ok(displacedKL > 0);

  sim.settings.fieldsEnabled = false;
  assert.deepEqual(sim.fieldAt(350, 250), { x: 0, y: 0 });
  for (let i = 0; i < 12; i++) sim.step(1 / 60);
  assert.ok(sim.metrics().kl < displacedKL);
  assert.deepEqual(drawn.reference, reference);
  approximately(sim.metrics().areaRatio, 1);
  assert.equal(polygonsOverlap(sim.shapes[0].points, drawn.points, sim.settings.clearance), false);
  for (const shape of sim.shapes) {
    assert.equal(hasSelfIntersection(shape.points), false);
    assert.ok(shape.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});

test('large frame delays stay bounded and collision backtracking keeps the droplet inside the world', () => {
  const sim = new Simulation({ cx: 119.01 });
  sim.addField({ x: 119, y: 335, dx: -80, dy: 0, strength: 6, radius: 500 });
  sim.step(1000);
  approximately(sim.time, 0.06);
  assert.equal(sim.lastBlocked, true);
  assert.ok(sim.blockedSteps > 0);
  approximately(sim.metrics().areaRatio, 1);
  assert.ok(sim.shapes[0].points.every(p => p.x >= 4 && p.x <= sim.width - 4 && p.y >= 4 && p.y <= sim.height - 4));
  assert.equal(hasSelfIntersection(sim.shapes[0].points), false);

  const before = structuredClone({ points: sim.shapes[0].points, time: sim.time });
  for (const dt of [0, -1, NaN, Infinity]) sim.step(dt);
  assert.deepEqual({ points: sim.shapes[0].points, time: sim.time }, before);
});
