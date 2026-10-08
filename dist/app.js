import { Simulation, centroid, pointInPolygon, localFieldVelocity } from './physics.js';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const workspace = document.querySelector('.workspace');
const initialRect = workspace.getBoundingClientRect();
const portrait = initialRect.width < 700;
const worldHeight = portrait ? Math.max(900, 1000 * initialRect.height / initialRect.width) : 680;
const worldWidth = portrait ? 1000 : 680 * initialRect.width / initialRect.height;
const sim = new Simulation({width: worldWidth, height: worldHeight, cx: worldWidth * .5, cy: portrait ? worldHeight * .68 : 335, radius: portrait ? 178 : 115});
let mode = 'arrow';
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let selectedShapeId = sim.shapes[0].id;
let selectedFieldId = null;
let newStrength = 1.2, newRadius = 140;
let drawResolution = 120;
let fieldResolution = 24;
let gesture = null, hover = null, toastTimer;
let camera = {scale: 1, x: 0, y: 0, width: 1000, height: 680, dpr: 1};
let previousTime = 0, uiElapsed = 0, cachedMetrics = sim.metrics();
const palette = {surface: {fill: '#dce9cdbb', stroke: '#7d9f62', node: '#8fae76', reference: '#a4b58d'}, kl: {fill: '#dceaf2bb', stroke: '#789fbf', node: '#8eadc7', reference: '#adc2d3'}};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const selectedField = () => sim.fields.find(f => f.id === selectedFieldId);
const selectedShape = () => sim.shapes.find(s => s.id === selectedShapeId) || sim.shapes[0];
const isFormControl = target => /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400);
}

function updateRange(input) {
  input.style.setProperty('--pct', `${100 * (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
}

function setPanel(open) {
  if (open) setSurfacePanel(false);
  $('fieldPanel').hidden = !open;
  $('arrowTool').setAttribute('aria-expanded', String(open));
  updateFieldPanel();
}

function setBrushPanel(open) {
  if (open) setSurfacePanel(false);
  $('brushPanel').hidden = !open;
  $('brushTool').setAttribute('aria-expanded', String(open));
}

function setSurfacePanel(open) {
  $('surfacePanel').hidden = !open;
  $('shapeResolution').setAttribute('aria-expanded', String(open));
  if (open) {
    setPanel(false); setBrushPanel(false);
    const shape = sim.shapes.find(s => s.kind === 'surface');
    $('surfaceResolution').value = shape.points.length;
    updateSurfaceOutput();
  }
}

function updateSurfaceOutput() {
  const value = Number($('surfaceResolution').value);
  $('surfaceResolutionOutput').textContent = `${value} 点`;
  $('surfaceResolution').setAttribute('aria-valuetext', `${value} 个圆盘边界点`);
  updateRange($('surfaceResolution'));
}

function applySurfaceResolution() {
  cancelGesture();
  const result = sim.setSurfaceResolution(Number($('surfaceResolution').value));
  const shape = sim.shapes.find(s => s.kind === 'surface');
  $('surfaceResolution').value = shape.points.length;
  updateSurfaceOutput();
  cachedMetrics = sim.metrics(); updateInspector();
  if (!result.ok) toast(result.reason || '当前边界不适合此分辨率，请先关闭外力再试');
}

function setFieldResolution(value) {
  fieldResolution = clamp(Math.round(Number(value) / 6) * 6, 12, 60);
  $('fieldResolution').value = fieldResolution;
  $('fieldResolutionOutput').textContent = `${fieldResolution} 格`;
  $('fieldResolution').setAttribute('aria-valuetext', `画布短边 ${fieldResolution} 格`);
  updateRange($('fieldResolution'));
}

function setDrawResolution(value) {
  drawResolution = clamp(Math.round(Number(value) / 30) * 30, 60, 480);
  sim.settings.drawResolution = drawResolution;
  $('drawResolution').value = drawResolution;
  $('resolutionOutput').textContent = `${drawResolution} 点`;
  $('drawResolution').setAttribute('aria-valuetext', `${drawResolution} 个边界采样点`);
  document.querySelectorAll('[data-resolution]').forEach(button => {
    const active = Number(button.dataset.resolution) === drawResolution;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateRange($('drawResolution'));
  if (mode === 'brush') updateHint();
}

function updateFieldPanel() {
  const field = selectedField();
  $('fieldPanelTitle').textContent = field ? `速度场 ${String(sim.fields.indexOf(field) + 1).padStart(2, '0')}` : '新建速度场';
  $('fieldStrength').value = field ? field.strength : newStrength;
  $('fieldRadius').value = field ? field.radius : newRadius;
  $('strengthOutput').textContent = `${Number($('fieldStrength').value).toFixed(1)}×`;
  $('radiusOutput').textContent = $('fieldRadius').value;
  $('strengthPreview').setAttribute('stroke-width', 1.5 + Number($('fieldStrength').value) * 2);
  $('fieldHint').textContent = field ? '拖动箭头移动位置；拖动端点调整方向。' : '在画布上拖动，设定位置与方向。';
  $('removeField').hidden = !field;
  updateRange($('fieldStrength')); updateRange($('fieldRadius'));
}

function setMode(next, openPanel = false) {
  if (next !== mode) cancelGesture();
  mode = next;
  $('brushTool').classList.toggle('active', mode === 'brush');
  $('arrowTool').classList.toggle('active', mode === 'arrow');
  $('brushTool').setAttribute('aria-pressed', String(mode === 'brush'));
  $('arrowTool').setAttribute('aria-pressed', String(mode === 'arrow'));
  workspace.classList.toggle('brush-mode', mode === 'brush');
  setSurfacePanel(false);
  if (mode === 'brush') { setPanel(false); setBrushPanel(true); }
  else { setBrushPanel(false); if (openPanel) setPanel(true); }
  updateHint();
}

function updateHint() {
  const hint = $('canvasHint');
  hint.hidden = mode === 'arrow' && sim.fields.length > 0;
  hint.querySelector('use').setAttribute('href', mode === 'brush' ? '#i-pen' : '#i-arrow');
  hint.querySelector('span').textContent = mode === 'brush' ? `绘制闭合轮廓 · ${drawResolution} 个边界点 · 松手保存为 KL 参考` : '从圆盘边缘向外拖动，试试第一股流';
}

function syncPlay() {
  $('playButton').querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  $('playLabel').textContent = playing ? '暂停' : '继续';
  $('playButton').setAttribute('aria-label', playing ? '暂停演化' : '继续演化');
  workspace.classList.toggle('paused', !playing);
  $('simulationStatus').textContent = playing ? (sim.settings.fieldsEnabled ? '实时演化' : '先验回复中') : '已暂停';
}

function updateInspector(metrics = cachedMetrics) {
  const shape = selectedShape();
  if (!shape) return;
  const m = metrics.shapes.find(m => m.id === shape.id);
  if (!m) return;
  const isSurface = shape.kind === 'surface';
  const index = sim.shapes.indexOf(shape) + 1;
  $('shapeName').textContent = isSurface ? '初始圆盘' : '手绘形状';
  $('shapeId').textContent = String(index).padStart(2, '0');
  $('shapeResolution').textContent = `${shape.points.length} 点`;
  $('shapeResolution').disabled = !isSurface;
  $('shapeResolution').title = isSurface ? '点击调整初始圆盘分辨率' : '此手绘轮廓的实际采样点数；新轮廓在画笔设置中调整';
  if (!isSurface) setSurfacePanel(false);
  $('shapeSwatch').style.background = isSurface ? '#ccdebf' : '#d6e5f0';
  $('shapeSwatch').style.borderColor = isSurface ? '#719664' : '#7c9dbf';
  $('priorBadge').textContent = isSurface ? '表面张力 + 面积约束' : 'KL 散度 · 初始形状先验';
  $('priorBadge').style.color = isSurface ? '#769067' : '#789ab5';
  $('priorBadge').style.background = isSurface ? '#eaf0e3' : '#eaf1f6';
  $('priorDescription').textContent = isSurface ? '边界趋向平滑，在固定面积下回到圆形。' : '以初始边界为参考，抑制形变与位置偏移。';
  $('metricOneLabel').textContent = isSurface ? '圆度' : 'KL 散度';
  $('metricOne').textContent = (isSurface ? m.roundness : m.kl).toFixed(3);
  $('metricTwo').replaceChildren(document.createTextNode((m.areaRatio * 100).toFixed(1)));
  const percent = document.createElement('span'); percent.textContent = '%'; $('metricTwo').append(percent);
  $('componentCount').textContent = sim.shapes.length;
  $('fieldCount').textContent = sim.fields.length;
  $('timeDisplay').textContent = sim.time.toFixed(1);
  $('footerNote').textContent = sim.lastBlocked ? '已减小步长，保护边界不相交' : '光滑局部场驱动 · 离散自交保护';
}

function reset() {
  cancelGesture();
  sim.settings.sampleCount = 120;
  sim.reset();
  sim.settings.priorStrength = 1;
  sim.settings.fieldsEnabled = true;
  selectedShapeId = sim.shapes[0].id;
  selectedFieldId = null;
  newStrength = 1.2; newRadius = 140;
  setDrawResolution(120);
  setFieldResolution(24);
  $('surfaceResolution').value = 120; updateSurfaceOutput(); setSurfacePanel(false);
  $('priorStrength').value = 1;
  $('priorOutput').textContent = '1.0×';
  $('referenceToggle').checked = true;
  $('forceToggle').checked = true;
  $('flowToggle').checked = true;
  playing = true;
  setMode('arrow'); setPanel(false); syncPlay();
  updateRange($('priorStrength'));
  cachedMetrics = sim.metrics(); updateInspector();
  toast('已恢复默认圆盘，速度场已清空');
}

$('brushTool').addEventListener('click', () => { const open = mode !== 'brush' || $('brushPanel').hidden; setMode('brush'); setBrushPanel(open); });
$('closeBrushPanel').addEventListener('click', () => setBrushPanel(false));
$('shapeResolution').addEventListener('click', () => { if (selectedShape().kind === 'surface') setSurfacePanel($('surfacePanel').hidden); });
$('closeSurfacePanel').addEventListener('click', () => setSurfacePanel(false));
$('surfaceResolution').addEventListener('input', updateSurfaceOutput);
$('surfaceResolution').addEventListener('change', applySurfaceResolution);
$('fieldResolution').addEventListener('input', event => setFieldResolution(event.target.value));
$('drawResolution').addEventListener('input', event => setDrawResolution(event.target.value));
document.querySelectorAll('[data-resolution]').forEach(button => button.addEventListener('click', () => setDrawResolution(button.dataset.resolution)));
$('arrowTool').addEventListener('click', () => { const open = mode !== 'arrow' || $('fieldPanel').hidden; setMode('arrow'); setPanel(open); });
$('resetButton').addEventListener('click', reset);
$('closeFieldPanel').addEventListener('click', () => setPanel(false));
$('fieldStrength').addEventListener('input', event => {
  newStrength = Number(event.target.value);
  const field = selectedField(); if (field) field.strength = newStrength;
  updateFieldPanel();
});
$('fieldRadius').addEventListener('input', event => {
  newRadius = Number(event.target.value);
  const field = selectedField(); if (field) field.radius = newRadius;
  updateFieldPanel();
});
$('priorStrength').addEventListener('input', event => {
  sim.settings.priorStrength = Number(event.target.value);
  $('priorOutput').textContent = `${sim.settings.priorStrength.toFixed(1)}×`;
  updateRange(event.target);
});
$('removeField').addEventListener('click', () => {
  sim.removeField(selectedFieldId); selectedFieldId = null;
  updateFieldPanel(); updateHint(); cachedMetrics = sim.metrics(); updateInspector();
});
$('playButton').addEventListener('click', () => { playing = !playing; syncPlay(); });
$('forceToggle').addEventListener('change', event => { sim.settings.fieldsEnabled = event.target.checked; syncPlay(); });
function openAbout() { cancelGesture(); $('aboutDialog').showModal(); }
$('aboutButton').addEventListener('click', openAbout);
$('closeAbout').addEventListener('click', () => $('aboutDialog').close());
$('aboutDone').addEventListener('click', () => $('aboutDialog').close());
$('aboutDialog').addEventListener('click', event => { if (event.target === $('aboutDialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
document.addEventListener('keydown', event => {
  if ($('aboutDialog').open || isFormControl(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space' && event.target.tagName !== 'BUTTON') { event.preventDefault(); playing = !playing; syncPlay(); }
  if (event.key.toLowerCase() === 'b') setMode('brush');
  if (event.key.toLowerCase() === 'v') setMode('arrow', true);
  if (event.key === 'Escape') { cancelGesture(); setPanel(false); setBrushPanel(false); setSurfacePanel(false); }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedField()) {
    event.preventDefault(); $('removeField').click();
  }
});

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const scale = Math.min(rect.width / sim.width, rect.height / sim.height);
  camera = {scale, x: (rect.width - sim.width * scale) / 2, y: (rect.height - sim.height * scale) / 2, width: rect.width, height: rect.height, dpr};
}
new ResizeObserver(resize).observe(workspace);
resize();

function worldPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale};
}
function inWorld(p) { return p.x > 6 && p.x < sim.width - 6 && p.y > 6 && p.y < sim.height - 6; }
function screenDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) * camera.scale; }
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) * camera.scale;
}
function hitField(p) {
  for (const f of [...sim.fields].reverse()) {
    const tip = {x: f.x + f.dx, y: f.y + f.dy};
    if (screenDistance(p, tip) < 15) return {field: f, part: 'tip'};
    if (segmentDistance(p, f, tip) < 12) return {field: f, part: 'body'};
  }
  return null;
}
function hitShape(p) { return [...sim.shapes].reverse().find(s => pointInPolygon(p, s.points)); }

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || gesture) return;
  const p = worldPoint(event);
  if (!inWorld(p)) { toast('请在实验场中央区域绘制'); return; }
  setSurfacePanel(false);
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  if (mode === 'arrow') {
    const hit = hitField(p);
    if (hit) {
      selectedFieldId = hit.field.id;
      gesture = {kind: 'edit', pointerId: event.pointerId, start: p, last: p, field: hit.field, part: hit.part, original: {...hit.field}};
      setPanel(true);
    } else {
      selectedFieldId = null;
      gesture = {kind: 'arrow', pointerId: event.pointerId, start: p, last: p};
      setPanel(false);
    }
  } else {
    setBrushPanel(false);
    gesture = {kind: 'brush', pointerId: event.pointerId, start: p, last: p, points: [p]};
  }
});

canvas.addEventListener('pointermove', event => {
  const p = worldPoint(event); hover = p;
  if (!gesture) { canvas.style.cursor = mode === 'arrow' && hitField(p) ? 'grab' : 'crosshair'; return; }
  if (event.pointerId !== gesture.pointerId) return;
  gesture.last = p;
  if (gesture.kind === 'brush') {
    const coalesced = event.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [event];
    for (const e of events) {
      const q = worldPoint(e), prev = gesture.points.at(-1);
      const captureSpacing = clamp(1.5 * 120 / drawResolution, .25, 2);
      if (screenDistance(q, prev) > captureSpacing && gesture.points.length < 10000) gesture.points.push(q);
    }
  }
  if (gesture.kind === 'edit') {
    const f = gesture.field, o = gesture.original;
    if (gesture.part === 'tip') {
      const dx = p.x - f.x, dy = p.y - f.y, length = Math.hypot(dx, dy);
      if (length > 12) { const scale = Math.min(280, length) / length; f.dx = dx * scale; f.dy = dy * scale; }
    } else {
      f.x = clamp(o.x + p.x - gesture.start.x, 10, sim.width - 10);
      f.y = clamp(o.y + p.y - gesture.start.y, 10, sim.height - 10);
    }
    canvas.style.cursor = 'grabbing';
  }
});

function finishGesture(event) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const g = gesture; gesture = null;
  const p = worldPoint(event);
  const moved = screenDistance(g.start, p);
  if (g.kind === 'arrow' && moved >= 12) {
    if (sim.fields.length >= 12) toast('最多添加 12 个局部场；可选择并移除已有箭头');
    else {
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      const scale = Math.min(250, Math.hypot(dx, dy)) / Math.hypot(dx, dy);
      const field = sim.addField({x: g.start.x, y: g.start.y, dx: dx * scale, dy: dy * scale, strength: newStrength, radius: newRadius});
      selectedFieldId = field.id; setPanel(true);
      if (!playing) toast('速度场已添加，点击「继续」开始形变');
      else if (!sim.settings.fieldsEnabled) toast('速度场已添加，打开下方「外力」开关以施加');
      else if (sim.fields.length === 1) toast('拖动粗细滑杆调整强度；关闭「外力」观察回复');
    }
  } else if (g.kind === 'brush' && g.points.length > 4) {
    if (sim.shapes.length >= 6) toast('最多同时观察 6 个连通域');
    else {
      g.points.push(p);
      const result = sim.addDrawnShape(g.points);
      if (result.ok) { selectedShapeId = result.shape.id; toast(`已保存 ${result.shape.points.length} 点轮廓。切换「箭头」添加局部速度场`); }
      else toast(result.reason);
    }
  } else if (g.kind !== 'edit') {
    const shape = hitShape(p);
    if (shape) { selectedShapeId = shape.id; setPanel(false); }
    else if (g.kind === 'brush') toast('按住并拖动画出一个轮廓，松手后自动闭合');
    else { selectedFieldId = null; setPanel(true); }
  }
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  cachedMetrics = sim.metrics(); updateInspector(); updateHint();
  canvas.style.cursor = 'crosshair';
}
canvas.addEventListener('pointerup', finishGesture);
function cancelGesture() {
  if (gesture?.kind === 'edit') Object.assign(gesture.field, gesture.original);
  if (gesture && canvas.hasPointerCapture(gesture.pointerId)) canvas.releasePointerCapture(gesture.pointerId);
  gesture = null;
}
canvas.addEventListener('pointercancel', cancelGesture);
canvas.addEventListener('lostpointercapture', () => { if (gesture) cancelGesture(); });
canvas.addEventListener('pointerleave', () => { hover = null; });

function path(points, close = true) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (close) ctx.closePath();
}
function drawGrid() {
  const {dpr, width, height} = camera;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#dae3d055';
  const gap = 22;
  for (let x = (width / 2) % gap; x < width; x += gap) for (let y = (height / 2) % gap; y < height; y += gap) { ctx.beginPath(); ctx.arc(x, y, .75, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#e6ebdf'; ctx.lineWidth = .7;
  const cx = camera.x + sim.width * .5 * camera.scale, cy = camera.y + sim.height * .5 * camera.scale;
  ctx.beginPath();ctx.moveTo(cx - 5, cy);ctx.lineTo(cx + 5, cy);ctx.moveTo(cx, cy - 5);ctx.lineTo(cx, cy + 5);ctx.stroke();
}
function drawTinyArrow(x, y, dx, dy, opacity) {
  const length = Math.hypot(dx, dy); if (length < .001) return;
  ctx.strokeStyle = `rgba(186,156,104,${opacity})`;
  ctx.lineWidth = .85 / camera.scale;
  ctx.lineCap = 'round';
  const ux = dx / length, uy = dy / length;
  const tipX = x + dx / 2, tipY = y + dy / 2;
  const head = Math.min(3 / camera.scale, length * .42);
  ctx.beginPath();ctx.moveTo(x - dx / 2, y - dy / 2);ctx.lineTo(tipX, tipY);
  ctx.moveTo(tipX - ux * head - uy * head * .6, tipY - uy * head + ux * head * .6);ctx.lineTo(tipX, tipY);ctx.lineTo(tipX - ux * head + uy * head * .6, tipY - uy * head - ux * head * .6);ctx.stroke();
}
function drawFlow() {
  if (!$('flowToggle').checked || !sim.fields.length) return;
  const step = Math.min(sim.width, sim.height) / fieldResolution;
  for (let y = step / 2; y < sim.height; y += step) for (let x = step / 2; x < sim.width; x += step) {
    const v = localFieldVelocity(sim.fields, x, y);
    const speed = Math.hypot(v.x, v.y); if (speed < 2) continue;
    const length = Math.min(clamp(speed * .19, 3, 18) / camera.scale, step * .65);
    drawTinyArrow(x, y, v.x / speed * length, v.y / speed * length, (sim.settings.fieldsEnabled ? 1 : .25) * clamp(speed / 140, .08, .42));
  }
}
function drawShape(shape, index) {
  const colors = palette[shape.kind];
  const c = centroid(shape.points);
  const selected = shape.id === selectedShapeId;
  if ($('referenceToggle').checked) {
    ctx.save(); ctx.setLineDash([4 / camera.scale, 5 / camera.scale]);
    ctx.strokeStyle = colors.reference; ctx.globalAlpha = .6;ctx.lineWidth = .9 / camera.scale;
    path(shape.reference);ctx.stroke();ctx.restore();
  }
  ctx.save(); path(shape.points);
  const gradient = ctx.createLinearGradient(c.x - 120, c.y - 140, c.x + 120, c.y + 140);
  gradient.addColorStop(0, shape.kind === 'surface' ? '#e4edd5da' : '#e8f0f5da');
  gradient.addColorStop(1, shape.kind === 'surface' ? '#cedfbcdd' : '#d1e3efda');
  ctx.fillStyle = gradient;ctx.fill();ctx.strokeStyle = colors.stroke;ctx.lineWidth = (selected ? 1.5 : 1.1) / camera.scale;ctx.stroke();
  if (selected) {
    const markerStep = Math.max(1, Math.ceil(shape.points.length / 16));
    for (let i = 0; i < shape.points.length; i += markerStep) { const p = shape.points[i]; ctx.beginPath();ctx.arc(p.x, p.y, 1.8 / camera.scale, 0, Math.PI * 2);ctx.fillStyle = '#fcfdf5';ctx.fill();ctx.strokeStyle = colors.node;ctx.lineWidth = .8 / camera.scale;ctx.stroke(); }
  }
  ctx.fillStyle = shape.kind === 'surface' ? '#7d9868' : '#7e9bb4';
  ctx.textAlign = 'center';ctx.textBaseline = 'middle';
  ctx.font = `400 ${26 / camera.scale}px Georgia, serif`; ctx.fillText('H₀', c.x, c.y - 7 / camera.scale);
  ctx.font = `400 ${8 / camera.scale}px system-ui, sans-serif`;
  ctx.fillStyle = shape.kind === 'surface' ? '#8ea17a' : '#8faabc';ctx.fillText(shape.kind === 'surface' ? 'SURFACE TENSION' : 'KL SHAPE PRIOR', c.x, c.y + 16 / camera.scale);
  ctx.restore();
}
function drawField(field, preview = false) {
  const selected = selectedFieldId === field.id || preview;
  const active = sim.settings.fieldsEnabled || preview;
  const screen = 1 / camera.scale;
  ctx.save();ctx.globalAlpha = active ? 1 : .32;
  if (selected) {
    const gradient = ctx.createRadialGradient(field.x, field.y, 0, field.x, field.y, field.radius);
    gradient.addColorStop(0, '#dfa0690d'); gradient.addColorStop(1, '#dfa06900');
    ctx.fillStyle = gradient;ctx.beginPath();ctx.arc(field.x, field.y, field.radius, 0, Math.PI * 2);ctx.fill();
    ctx.setLineDash([3 * screen, 5 * screen]);ctx.strokeStyle = '#d3a37666';ctx.lineWidth = .8 * screen;ctx.stroke();ctx.setLineDash([]);
  }
  const length = Math.hypot(field.dx, field.dy);if (length < 2) {ctx.restore();return;}
  const ux = field.dx / length, uy = field.dy / length;
  const tip = {x: field.x + field.dx, y: field.y + field.dy};
  const width = (1.5 + field.strength * 2.1) * screen;
  const head = (10 + field.strength * 1.8) * screen;
  ctx.lineWidth = width;ctx.strokeStyle = '#cd8755';ctx.fillStyle = '#cd8755';ctx.lineCap = 'round';ctx.lineJoin = 'round';
  ctx.beginPath();ctx.moveTo(field.x, field.y);ctx.lineTo(tip.x - ux * 3 * screen, tip.y - uy * 3 * screen);ctx.stroke();
  ctx.beginPath();ctx.moveTo(tip.x - ux * head - uy * head * .56, tip.y - uy * head + ux * head * .56);ctx.lineTo(tip.x, tip.y);ctx.lineTo(tip.x - ux * head + uy * head * .56, tip.y - uy * head - ux * head * .56);ctx.stroke();
  ctx.beginPath();ctx.arc(field.x, field.y, (selected ? 4 : 2.5) * screen, 0, Math.PI * 2);ctx.fillStyle = '#fffaf0';ctx.fill();ctx.lineWidth = 1.25 * screen;ctx.stroke();
  if (selected && !preview) {
    ctx.font = `${9 * screen}px ui-monospace, monospace`;ctx.textAlign = 'center';ctx.textBaseline = 'middle';
    const tx = field.x + field.dx * .48 + uy * 15 * screen, ty = field.y + field.dy * .48 - ux * 15 * screen;
    const text = `${field.strength.toFixed(1)}×`;
    ctx.fillStyle = '#fcf9eef2';ctx.fillRect(tx - 17 * screen, ty - 8 * screen, 34 * screen, 16 * screen);ctx.fillStyle = '#bd855c';ctx.fillText(text, tx, ty);
    ctx.beginPath();ctx.arc(tip.x, tip.y, 7 * screen, 0, Math.PI * 2);ctx.strokeStyle = '#d2a16c66';ctx.lineWidth = 1 * screen;ctx.stroke();
  }
  ctx.restore();
}
function render() {
  drawGrid();
  const {scale, x, y, dpr} = camera;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, x * dpr, y * dpr);
  ctx.save();ctx.beginPath();ctx.rect(0, 0, sim.width, sim.height);ctx.clip();
  drawFlow();
  sim.shapes.forEach(drawShape);
  for (const field of sim.fields) drawField(field);
  if (gesture?.kind === 'arrow') drawField({x: gesture.start.x, y: gesture.start.y, dx: gesture.last.x - gesture.start.x, dy: gesture.last.y - gesture.start.y, strength: newStrength, radius: newRadius}, true);
  if (gesture?.kind === 'brush' && gesture.points.length) {
    ctx.save();path(gesture.points, false);ctx.lineWidth = 1.7 / scale;ctx.lineCap = 'round';ctx.lineJoin = 'round';ctx.strokeStyle = '#719cbc';ctx.stroke();
    ctx.lineTo(gesture.points[0].x, gesture.points[0].y);ctx.fillStyle = '#d4e7f333';ctx.fill();
    const start = gesture.points[0];ctx.setLineDash([4 / scale, 4 / scale]);ctx.beginPath();ctx.moveTo(gesture.last.x, gesture.last.y);ctx.lineTo(start.x, start.y);ctx.lineWidth = .7 / scale;ctx.strokeStyle = '#8daabd88';ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(start.x, start.y, 4 / scale, 0, Math.PI * 2);ctx.fillStyle = '#fff';ctx.fill();ctx.strokeStyle = '#84a6bf';ctx.stroke();ctx.restore();
  }
  if (hover && mode === 'brush' && !gesture) {ctx.beginPath();ctx.arc(hover.x, hover.y, 3 / scale, 0, Math.PI * 2);ctx.strokeStyle = '#7a9db6';ctx.lineWidth = 1 / scale;ctx.stroke();}
  ctx.restore();
}

function frame(timestamp) {
  const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, .05) : 0;
  previousTime = timestamp;
  if (playing && !gesture && !$('aboutDialog').open && !document.hidden && dt > 0) sim.step(dt);
  uiElapsed += dt;
  if (uiElapsed > .12) { cachedMetrics = sim.metrics(); updateInspector(); uiElapsed = 0; }
  render(); requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { previousTime = 0; });
setDrawResolution(120); setFieldResolution(24); updateSurfaceOutput(); updateRange($('priorStrength')); updateFieldPanel(); syncPlay(); updateInspector();
requestAnimationFrame(frame);
