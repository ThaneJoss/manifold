import { centroid, localFieldVelocity } from './physics.js';

const palette = {
  surface: { stroke: '#7d9f62', node: '#8fae76', reference: '#a4b58d' },
  kl: { stroke: '#789fbf', node: '#8eadc7', reference: '#adc2d3' },
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Fit the simulation world inside the canvas while keeping its proportions. */
export function resizeCanvas(canvas, sim) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const scale = Math.min(rect.width / sim.width, rect.height / sim.height);
  return {
    scale,
    x: (rect.width - sim.width * scale) / 2,
    y: (rect.height - sim.height * scale) / 2,
    width: rect.width,
    height: rect.height,
    dpr,
  };
}

/** Draw a simulation snapshot. Interaction and React state stay in the controller. */
export function renderScene(ctx, sim, view) {
  const {
    camera,
    selectedShapeId,
    selectedFieldId,
    referenceVisible,
    flowVisible,
    fieldResolution,
    gesture,
    hover,
    mode,
    newFieldStrength,
    newFieldRadius,
  } = view;

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
    if (!flowVisible || !sim.fields.length) return;
    const step = Math.min(sim.width, sim.height) / fieldResolution;
    for (let y = step / 2; y < sim.height; y += step) for (let x = step / 2; x < sim.width; x += step) {
      const v = localFieldVelocity(sim.fields, x, y);
      const speed = Math.hypot(v.x, v.y); if (speed < 2) continue;
      const length = Math.min(clamp(speed * .19, 3, 18) / camera.scale, step * .65);
      drawTinyArrow(x, y, v.x / speed * length, v.y / speed * length, (sim.settings.fieldsEnabled ? 1 : .25) * clamp(speed / 140, .08, .42));
    }
  }
  function drawShape(shape) {
    const colors = palette[shape.kind];
    const c = centroid(shape.points);
    const selected = shape.id === selectedShapeId;
    if (referenceVisible) {
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

  drawGrid();
  const {scale, x, y, dpr} = camera;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, x * dpr, y * dpr);
  ctx.save();ctx.beginPath();ctx.rect(0, 0, sim.width, sim.height);ctx.clip();
  drawFlow();
  sim.shapes.forEach(drawShape);
  for (const field of sim.fields) drawField(field);
  if (gesture?.kind === 'arrow') drawField({x: gesture.start.x, y: gesture.start.y, dx: gesture.last.x - gesture.start.x, dy: gesture.last.y - gesture.start.y, strength: newFieldStrength, radius: newFieldRadius}, true);
  if (gesture?.kind === 'brush' && gesture.points.length) {
    ctx.save();path(gesture.points, false);ctx.lineWidth = 1.7 / scale;ctx.lineCap = 'round';ctx.lineJoin = 'round';ctx.strokeStyle = '#719cbc';ctx.stroke();
    ctx.lineTo(gesture.points[0].x, gesture.points[0].y);ctx.fillStyle = '#d4e7f333';ctx.fill();
    const start = gesture.points[0];ctx.setLineDash([4 / scale, 4 / scale]);ctx.beginPath();ctx.moveTo(gesture.last.x, gesture.last.y);ctx.lineTo(start.x, start.y);ctx.lineWidth = .7 / scale;ctx.strokeStyle = '#8daabd88';ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(start.x, start.y, 4 / scale, 0, Math.PI * 2);ctx.fillStyle = '#fff';ctx.fill();ctx.strokeStyle = '#84a6bf';ctx.stroke();ctx.restore();
  }
  if (hover && mode === 'brush' && !gesture) {ctx.beginPath();ctx.arc(hover.x, hover.y, 3 / scale, 0, Math.PI * 2);ctx.strokeStyle = '#7a9db6';ctx.lineWidth = 1 / scale;ctx.stroke();}
  ctx.restore();
}
