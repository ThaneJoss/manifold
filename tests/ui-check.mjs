import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Simulation } from '../dist/physics.js';

// Browser-independent callback/runtime smoke test, not a layout/browser test.
const portrait = process.argv.includes('--portrait');
const viewport = { width: portrait ? 390 : 1000, height: portrait ? 820 : 680, left: 0, top: 0 };
viewport.right = viewport.width; viewport.bottom = viewport.height;
class ClassList {
  values = new Set();
  add(...v) { v.forEach(x => this.values.add(x)); }
  remove(...v) { v.forEach(x => this.values.delete(x)); }
  contains(v) { return this.values.has(v); }
  toggle(v, force = !this.values.has(v)) { force ? this.add(v) : this.remove(v); return force; }
}
class Element {
  constructor(tagName = 'DIV', id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id; this.value = ''; this.min = ''; this.max = '';
    this.hidden = false; this.checked = false; this.open = false; this.textContent = '';
    this.attributes = {}; this.dataset = {}; this.classList = new ClassList(); this.listeners = new Map(); this.children = [];
    this.style = { setProperty(name, value) { this[name] = value; } }; this.selectors = new Map(); this.captures = new Set();
  }
  addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
  dispatch(type, event = {}) {
    const e = { target: this, button: 0, pointerId: 1, preventDefault() {}, ...event };
    for (const fn of this.listeners.get(type) || []) fn(e);
  }
  click() { this.dispatch('click'); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element(selector));
    return this.selectors.get(selector);
  }
  getBoundingClientRect() { return viewport; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  setPointerCapture(id) { this.captures.add(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const elements = new Map();
for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  const [, tag, attrs, id] = match; const el = new Element(tag, id);
  for (const attr of ['value', 'min', 'max']) el[attr] = attrs.match(new RegExp(`\\b${attr}="([^"]*)"`))?.[1] || '';
  el.hidden = /\bhidden\b/.test(attrs); el.checked = /\bchecked\b/.test(attrs);
  const classes = attrs.match(/\bclass="([^"]*)"/)?.[1]; if (classes) el.classList.add(...classes.split(/\s+/));
  elements.set(id, el);
}
const documentStub = new Element('DOCUMENT'); const workspace = new Element('SECTION');
const resolutionPresets = [...html.matchAll(/<button\b([^>]*\bdata-resolution="(\d+)"[^>]*)>/g)].map(([, attrs, value]) => {
  const button = new Element('BUTTON'); button.dataset.resolution = value;
  const classes = attrs.match(/\bclass="([^"]*)"/)?.[1]; if (classes) button.classList.add(...classes.split(/\s+/));
  return button;
});
assert.deepEqual(resolutionPresets.map(b => Number(b.dataset.resolution)), [60, 120, 240, 480]);
documentStub.getElementById = id => { assert(elements.has(id), `Missing actual HTML id: ${id}`); return elements.get(id); };
documentStub.querySelector = selector => { assert.equal(selector, '.workspace'); return workspace; };
documentStub.querySelectorAll = selector => { assert.equal(selector, '[data-resolution]'); return resolutionPresets; };
documentStub.createElement = tag => new Element(tag);
documentStub.createTextNode = text => ({ textContent: String(text) }); documentStub.hidden = false;
let drawCalls = 0, flowArrowStrokes = 0;
const context = {};
for (const method of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'rect', 'clearRect', 'fillRect', 'setTransform', 'fill', 'stroke', 'save', 'restore', 'clip', 'fillText', 'setLineDash']) {
  context[method] = (...args) => {
    drawCalls++;
    if (method === 'stroke' && String(context.strokeStyle).startsWith('rgba(186,156,104,')) flowArrowStrokes++;
    for (const v of args) if (typeof v === 'number') assert(Number.isFinite(v), `${method} has nonfinite argument`);
  };
}
for (const method of ['createLinearGradient', 'createRadialGradient']) context[method] = (...args) => {
  args.forEach(v => assert(Number.isFinite(v))); return { addColorStop() {} };
};
elements.get('scene').getContext = type => { assert.equal(type, '2d'); return context; };
const raf = []; let clock = 1000; const timers = new Map(); let timerId = 0;
Object.assign(globalThis, {
  document: documentStub, devicePixelRatio: 2, matchMedia: () => ({ matches: false }),
  ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() { this.fn(); } },
  requestAnimationFrame: fn => { raf.push(fn); return raf.length; },
  setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
});
let sim;
const originalReset = Simulation.prototype.reset;
Simulation.prototype.reset = function (...args) { sim = this; return originalReset.apply(this, args); };
await import('../dist/app.js');
const el = id => elements.get(id);
function frames(count) { for (let i = 0; i < count; i++) { assert.equal(raf.length, 1); clock += 1000 / 60; raf.shift()(clock); } }
function eventAt(x, y, extra = {}) {
  const scale = Math.min(viewport.width / sim.width, viewport.height / sim.height);
  return { clientX: (viewport.width - sim.width * scale) / 2 + x * scale, clientY: (viewport.height - sim.height * scale) / 2 + y * scale, ...extra };
}
const pointer = (type, x, y, extra) => el('scene').dispatch(type, eventAt(x, y, extra));
function input(id, value) { el(id).value = String(value); el(id).dispatch('input'); }
function checked(id, value) { el(id).checked = value; el(id).dispatch('change'); }
function key(key, code = '') { documentStub.dispatch('keydown', { key, code, target: new Element('DIV') }); }

assert.equal(sim.shapes.length, 1); assert.equal(sim.fields.length, 0);
assert.equal(Number(el('componentCount').textContent), 1); assert.equal(el('playLabel').textContent, '暂停');
frames(12); assert(sim.time > 0); assert(drawCalls > 100);

// Brush: exact event path produces a second region with KL reference.
el('brushTool').click(); assert(el('brushTool').classList.contains('active')); assert(el('fieldPanel').hidden);
const cy = portrait ? 400 : 330, cx = 180, radius = 60;
pointer('pointerdown', cx + radius, cy);
for (let i = 1; i <= 40; i++) pointer('pointermove', cx + radius * Math.cos(i * Math.PI / 20), cy + radius * Math.sin(i * Math.PI / 20));
pointer('pointerup', cx + radius, cy);
assert.equal(sim.shapes.length, 2, el('toast').textContent); assert.equal(sim.shapes[1].kind, 'kl');
assert.equal(Number(el('componentCount').textContent), 2); assert.equal(el('shapeName').textContent, '手绘形状');
assert.equal(Number(el('metricOne').textContent), 0);

// Arrow creation, strength/radius controls, rendering, and actual deformation.
el('arrowTool').click(); assert(!el('fieldPanel').hidden);
pointer('pointerdown', cx + radius, cy); pointer('pointermove', cx + radius + 95, cy - 25); pointer('pointerup', cx + radius + 95, cy - 25);
assert.equal(sim.fields.length, 1); assert.equal(Number(el('fieldCount').textContent), 1);
assert.equal(el('fieldPanelTitle').textContent, '速度场 01'); assert(!el('removeField').hidden);
input('fieldStrength', 2.4); input('fieldRadius', 120);
assert.equal(sim.fields[0].strength, 2.4); assert.equal(sim.fields[0].radius, 120);
assert.equal(el('strengthOutput').textContent, '2.4×'); assert(Math.abs(Number(el('strengthPreview').attributes['stroke-width']) - 6.3) < 1e-8);
frames(35); const deformedKL = sim.metrics().kl; assert(deformedKL > 0.001, `KL did not deform: ${deformedKL}`);

// Arrow drag and escape cancellation restore geometry.
const field = sim.fields[0], ox = field.x, oy = field.y;
pointer('pointerdown', ox + field.dx * .35, oy + field.dy * .35);
pointer('pointermove', ox + field.dx * .35 + 18, oy + field.dy * .35 + 12);
assert.notEqual(field.x, ox); key('Escape'); assert.equal(field.x, ox); assert.equal(field.y, oy);
pointer('pointerdown', ox + field.dx, oy + field.dy); pointer('pointermove', ox + 55, oy + 55); pointer('pointerup', ox + 55, oy + 55);
assert(Math.abs(field.dx - 55) < 1e-6); assert(Math.abs(field.dy - 55) < 1e-6);

// Disable force: reference prior recovers; pause freezes time; resume advances.
checked('forceToggle', false); assert.equal(sim.settings.fieldsEnabled, false); assert.equal(el('simulationStatus').textContent, '先验回复中');
frames(30); assert(sim.metrics().kl < deformedKL);
el('playButton').click(); assert.equal(el('playLabel').textContent, '继续'); const pausedTime = sim.time;
frames(10); assert.equal(sim.time, pausedTime); key(' ', 'Space'); frames(10); assert(sim.time > pausedTime);
input('priorStrength', .65); assert.equal(sim.settings.priorStrength, .65); assert.equal(el('priorOutput').textContent, '0.7×');

// Dialog pauses underlying simulation; close resumes it.
el('aboutButton').click(); assert(el('aboutDialog').open); const dialogTime = sim.time; frames(10); assert.equal(sim.time, dialogTime);
el('aboutDone').click(); frames(10); assert(sim.time > dialogTime);

// Delete selected field, cancel brush, and reset all expected controls/state.
key('Delete'); assert.equal(sim.fields.length, 0); assert.equal(Number(el('fieldCount').textContent), 0);
key('b'); pointer('pointerdown', 70, 100); pointer('pointermove', 100, 130); el('scene').dispatch('pointercancel'); pointer('pointerup', 120, 100); assert.equal(sim.shapes.length, 2);
el('playButton').click(); checked('referenceToggle', false); checked('flowToggle', false);
el('resetButton').click(); assert.equal(sim.shapes.length, 1); assert.equal(sim.fields.length, 0); assert.equal(sim.time, 0);
assert.equal(sim.settings.priorStrength, 1); assert.equal(sim.settings.fieldsEnabled, true);
assert.equal(el('priorOutput').textContent, '1.0×'); assert(el('referenceToggle').checked); assert(el('flowToggle').checked); assert(el('forceToggle').checked);
assert(el('fieldPanel').hidden); assert(el('arrowTool').classList.contains('active')); assert.equal(el('playLabel').textContent, '暂停');
frames(5);

// Resolution UI integration: panels, arbitrary slider steps, presets, and future-stroke scope.
const preset = value => resolutionPresets.find(button => Number(button.dataset.resolution) === value);
assert.equal(sim.settings.drawResolution, 120); assert.equal(sim.shapes[0].points.length, 120);
assert.equal(el('shapeResolution').textContent, '120 点'); assert.equal(el('resolutionOutput').textContent, '120 点');
assert(preset(120).classList.contains('active')); assert(el('brushPanel').hidden);
el('brushTool').click(); assert(!el('brushPanel').hidden); assert.equal(el('brushTool').attributes['aria-expanded'], 'true');
el('brushTool').click(); assert(el('brushPanel').hidden);
el('brushTool').click(); assert(!el('brushPanel').hidden);
el('closeBrushPanel').click(); assert(el('brushPanel').hidden); assert.equal(el('brushTool').attributes['aria-expanded'], 'false');
key('b'); assert(!el('brushPanel').hidden);
input('drawResolution', 270); assert.equal(sim.settings.drawResolution, 270); assert.equal(el('resolutionOutput').textContent, '270 点');
assert(resolutionPresets.every(button => !button.classList.contains('active')));
assert.equal(el('drawResolution').attributes['aria-valuetext'], '270 个边界采样点');
assert(el('canvasHint').querySelector('span').textContent.includes('270'));
preset(240).click(); assert.equal(sim.settings.drawResolution, 240); assert(preset(240).classList.contains('active'));
preset(480).click(); assert.equal(sim.settings.drawResolution, 480); assert.equal(Number(el('drawResolution').value), 480);
assert.equal(preset(480).attributes['aria-pressed'], 'true'); assert.equal(preset(240).attributes['aria-pressed'], 'false');
function drawCircle(x, y, r = 60, samples = 180) {
  pointer('pointerdown', x + r, y); assert(el('brushPanel').hidden);
  for (let i = 1; i <= samples; i++) pointer('pointermove', x + r * Math.cos(i * 2 * Math.PI / samples), y + r * Math.sin(i * 2 * Math.PI / samples), { getCoalescedEvents: () => [] });
  pointer('pointerup', x + r, y);
}
drawCircle(cx, cy); assert.equal(sim.shapes.length, 2, el('toast').textContent);
const highShape = sim.shapes[1];
assert.equal(highShape.points.length, 480); assert.equal(highShape.reference.length, 480);
assert.equal(el('shapeResolution').textContent, '480 点');
const highReference = JSON.stringify(highShape.reference), highPoints = JSON.stringify(highShape.points);
el('brushTool').click(); assert(!el('brushPanel').hidden); input('drawResolution', 60);
assert.equal(sim.settings.drawResolution, 60); assert(preset(60).classList.contains('active'));
assert.equal(highShape.points.length, 480); assert.equal(JSON.stringify(highShape.reference), highReference); assert.equal(JSON.stringify(highShape.points), highPoints);
assert.equal(el('shapeResolution').textContent, '480 点', 'Inspector should show existing shape resolution, not the future stroke setting');
drawCircle(780, cy); assert.equal(sim.shapes.length, 3, el('toast').textContent);
assert.equal(sim.shapes[2].points.length, 60); assert.equal(sim.shapes[2].reference.length, 60); assert.equal(el('shapeResolution').textContent, '60 点');
assert.equal(highShape.points.length, 480); assert.equal(JSON.stringify(highShape.reference), highReference);
frames(9); assert.equal(JSON.stringify(highShape.reference), highReference);
el('brushTool').click(); assert(!el('brushPanel').hidden); el('arrowTool').click(); assert(el('brushPanel').hidden); assert(!el('fieldPanel').hidden);
el('brushTool').click(); assert(!el('brushPanel').hidden); assert(el('fieldPanel').hidden);
el('resetButton').click(); assert.equal(sim.settings.drawResolution, 120); assert.equal(Number(el('drawResolution').value), 120);
assert.equal(el('resolutionOutput').textContent, '120 点'); assert.equal(el('shapeResolution').textContent, '120 点');
assert.equal(sim.shapes.length, 1); assert.equal(sim.shapes[0].points.length, 120); assert.equal(sim.shapes[0].reference.length, 120);
assert(preset(120).classList.contains('active')); assert(el('brushPanel').hidden); assert(el('fieldPanel').hidden);
frames(3);

// Initial-shape resolution commits on change and preserves the rest of a live scene.
assert.equal(Number(el('surfaceResolution').value), 120); assert.equal(Number(el('fieldResolution').value), 24);
assert.equal(el('fieldResolutionOutput').textContent, '24 格'); assert.equal(el('shapeResolution').disabled, false);
el('shapeResolution').click(); assert(!el('surfacePanel').hidden); assert.equal(el('shapeResolution').attributes['aria-expanded'], 'true');
el('closeSurfacePanel').click(); assert(el('surfacePanel').hidden);
el('brushTool').click(); drawCircle(cx, cy);
assert.equal(sim.shapes.length, 2); assert.equal(sim.shapes[1].points.length, 120); assert.equal(el('shapeResolution').disabled, true);
el('shapeResolution').click(); assert(el('surfacePanel').hidden);
el('arrowTool').click();
const surfaceCenter = { x: sim.defaults.cx, y: sim.defaults.cy };
pointer('pointerdown', surfaceCenter.x + sim.defaults.radius * .72, surfaceCenter.y - 20);
pointer('pointermove', surfaceCenter.x + sim.defaults.radius * .72 + 90, surfaceCenter.y - 55);
pointer('pointerup', surfaceCenter.x + sim.defaults.radius * .72 + 90, surfaceCenter.y - 55);
input('fieldStrength', 1.8); frames(18);
assert.equal(sim.fields.length, 1); assert(sim.time > 0);
pointer('pointerdown', surfaceCenter.x, surfaceCenter.y); pointer('pointerup', surfaceCenter.x, surfaceCenter.y);
assert.equal(el('shapeName').textContent, '初始圆盘'); assert.equal(el('shapeResolution').disabled, false);
el('shapeResolution').click(); assert(!el('surfacePanel').hidden); assert(el('brushPanel').hidden); assert(el('fieldPanel').hidden);
const surfaceTimeBefore = sim.time, fieldsBefore = JSON.stringify(sim.fields), handBefore = JSON.stringify(sim.shapes[1]);
const surfaceIdBefore = sim.shapes[0].id, areaBefore = sim.metrics().shapes[0].area;
input('surfaceResolution', 240);
assert.equal(el('surfaceResolutionOutput').textContent, '240 点'); assert.equal(sim.shapes[0].points.length, 120, 'Input must preview until change');
assert.equal(el('surfaceResolution').attributes['aria-valuetext'], '240 个圆盘边界点');
el('surfaceResolution').dispatch('change');
assert.equal(sim.shapes[0].points.length, 240, el('toast').textContent); assert.equal(sim.shapes[0].reference.length, 240);
assert.equal(el('shapeResolution').textContent, '240 点'); assert.equal(el('surfaceResolutionOutput').textContent, '240 点');
assert.equal(sim.shapes[0].id, surfaceIdBefore); assert.equal(sim.time, surfaceTimeBefore);
assert.equal(JSON.stringify(sim.fields), fieldsBefore); assert.equal(JSON.stringify(sim.shapes[1]), handBefore);
assert(Math.abs(sim.metrics().shapes[0].area / areaBefore - 1) < 1e-8, 'Resampling should preserve enclosed area');

// Field-arrow resolution affects only the rendered samples, not the analytic velocity.
el('arrowTool').click(); assert(el('surfacePanel').hidden); assert(!el('fieldPanel').hidden);
el('playButton').click(); assert.equal(el('playLabel').textContent, '继续');
const samples = [surfaceCenter, { x: sim.fields[0].x, y: sim.fields[0].y }, { x: surfaceCenter.x + 100, y: surfaceCenter.y + 80 }];
const velocitiesBefore = samples.map(p => sim.fieldAt(p.x, p.y));
const fieldDataBefore = JSON.stringify(sim.fields), stillShapes = JSON.stringify(sim.shapes), densityTime = sim.time;
input('fieldResolution', 12); assert.equal(el('fieldResolutionOutput').textContent, '12 格');
assert.equal(el('fieldResolution').attributes['aria-valuetext'], '画布短边 12 格');
let strokesBefore = flowArrowStrokes; frames(1); const sparseArrows = flowArrowStrokes - strokesBefore;
input('fieldResolution', 60); assert.equal(el('fieldResolutionOutput').textContent, '60 格');
strokesBefore = flowArrowStrokes; frames(1); const denseArrows = flowArrowStrokes - strokesBefore;
assert(sparseArrows > 0); assert(denseArrows > sparseArrows * 4, `Density did not change: ${sparseArrows} -> ${denseArrows}`);
assert.deepEqual(samples.map(p => sim.fieldAt(p.x, p.y)), velocitiesBefore);
assert.equal(JSON.stringify(sim.fields), fieldDataBefore); assert.equal(sim.fields[0].strength, 1.8);
assert.equal(JSON.stringify(sim.shapes), stillShapes); assert.equal(sim.time, densityTime);

// Reset restores independent brush/surface/field defaults together.
el('brushTool').click(); preset(480).click(); assert.equal(sim.settings.drawResolution, 480);
el('resetButton').click();
assert.equal(sim.settings.drawResolution, 120); assert.equal(Number(el('drawResolution').value), 120);
assert.equal(sim.shapes[0].points.length, 120); assert.equal(sim.shapes[0].reference.length, 120); assert.equal(Number(el('surfaceResolution').value), 120);
assert.equal(Number(el('fieldResolution').value), 24); assert.equal(el('fieldResolutionOutput').textContent, '24 格');
assert.equal(el('shapeResolution').textContent, '120 点'); assert.equal(el('surfaceResolutionOutput').textContent, '120 点');
assert.equal(sim.shapes.length, 1); assert.equal(sim.fields.length, 0); assert.equal(sim.time, 0);
assert(el('surfacePanel').hidden); assert(el('brushPanel').hidden); assert(el('fieldPanel').hidden);
frames(3);
console.log(JSON.stringify({ result: 'PASS', viewport: portrait ? 'portrait' : 'desktop', assertions: 'base interaction regression; brush resolution scope; surface resampling commit/preservation; field rendering density/analytic invariance; independent resolution reset', drawCalls, deformedKL, fieldArrows: { sparse: sparseArrows, dense: denseArrows } }));
