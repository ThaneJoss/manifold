import { useLayoutEffect, useRef, useState } from 'react';
import { Simulation, pointInPolygon } from './physics.js';
import { renderScene, resizeCanvas } from './renderScene.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const resolution = value => clamp(Math.round(Number(value) / 30) * 30, 60, 480);
const emptyMetrics = { shapes: [], shapeCount: 1, fieldCount: 0, time: 0, areaRatio: 1, roundness: 1, kl: 0, blockedSteps: 0, lastBlocked: false };

function initialState() {
  return {
    mode: 'arrow',
    playing: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    panel: null,
    selectedShapeId: 'shape-1',
    selectedFieldId: null,
    priorStrength: 1,
    drawResolution: 120,
    surfaceResolution: 120,
    fieldResolution: 24,
    newFieldStrength: 1.2,
    newFieldRadius: 140,
    referenceVisible: true,
    fieldsEnabled: true,
    flowVisible: true,
    metrics: emptyMetrics,
    time: 0,
    toast: null,
    aboutOpen: false,
    cursor: 'crosshair',
  };
}

/** React owns the controls; the simulation and canvas keep animation data in refs. */
export function useShapeFlow() {
  const canvasRef = useRef(null);
  const workspaceRef = useRef(null);
  const simulationRef = useRef(null);
  const cameraRef = useRef(null);
  const gestureRef = useRef(null);
  const hoverRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);

  function patch(changes) {
    const next = { ...stateRef.current, ...changes };
    stateRef.current = next;
    setState(next);
  }

  function notify(message) {
    clearTimeout(toastTimerRef.current);
    patch({ toast: message });
    toastTimerRef.current = setTimeout(() => patch({ toast: null }), 3400);
  }

  function refreshMetrics() {
    const sim = simulationRef.current;
    if (sim) patch({ metrics: { ...sim.metrics(), lastBlocked: sim.lastBlocked }, time: sim.time });
  }

  function selectedField() {
    return simulationRef.current?.fields.find(field => field.id === stateRef.current.selectedFieldId);
  }

  function cancelGesture() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.kind === 'edit') Object.assign(gesture.field, gesture.original);
    const canvas = canvasRef.current;
    if (gesture && canvas?.hasPointerCapture(gesture.pointerId)) canvas.releasePointerCapture(gesture.pointerId);
    if (stateRef.current.cursor !== 'crosshair') patch({ cursor: 'crosshair' });
  }

  function setMode(mode, panel = mode === 'brush' ? 'brush' : 'field') {
    if (mode !== stateRef.current.mode) cancelGesture();
    patch({ mode, panel });
  }

  function toggleBrush() {
    const current = stateRef.current;
    setMode('brush', current.mode !== 'brush' || current.panel !== 'brush' ? 'brush' : null);
  }

  function toggleArrow() {
    const current = stateRef.current;
    setMode('arrow', current.mode !== 'arrow' || current.panel !== 'field' ? 'field' : null);
  }

  function closePanel() { patch({ panel: null }); }

  function toggleSurfacePanel() {
    const sim = simulationRef.current;
    const shape = sim?.shapes.find(item => item.id === stateRef.current.selectedShapeId);
    if (shape?.kind !== 'surface') return;
    patch({ panel: stateRef.current.panel === 'surface' ? null : 'surface', surfaceResolution: shape.points.length });
  }

  function setDrawResolution(value) {
    const count = resolution(value);
    if (simulationRef.current) simulationRef.current.settings.drawResolution = count;
    patch({ drawResolution: count });
  }

  function setFieldResolution(value) {
    patch({ fieldResolution: clamp(Math.round(Number(value) / 6) * 6, 12, 60) });
  }

  function setSurfaceResolution(value) { patch({ surfaceResolution: resolution(value) }); }

  function applySurfaceResolution(value = stateRef.current.surfaceResolution) {
    const sim = simulationRef.current;
    if (!sim) return;
    cancelGesture();
    const result = sim.setSurfaceResolution(value);
    const shape = sim.shapes.find(item => item.kind === 'surface');
    if (shape) patch({ surfaceResolution: shape.points.length });
    refreshMetrics();
    if (!result.ok) notify(result.reason || '当前边界不适合此分辨率，请先关闭外力再试');
  }

  function setFieldStrength(value) {
    const strength = clamp(Number(value), .2, 3);
    const field = selectedField();
    if (field) field.strength = strength;
    patch({ newFieldStrength: strength });
  }

  function setFieldRadius(value) {
    const radius = clamp(Number(value), 60, 220);
    const field = selectedField();
    if (field) field.radius = radius;
    patch({ newFieldRadius: radius });
  }

  function setPriorStrength(value) {
    const priorStrength = clamp(Number(value), 0, 2);
    if (simulationRef.current) simulationRef.current.settings.priorStrength = priorStrength;
    patch({ priorStrength });
  }

  function setReferenceVisible(value) { patch({ referenceVisible: Boolean(value) }); }
  function setFlowVisible(value) { patch({ flowVisible: Boolean(value) }); }
  function setFieldsEnabled(value) {
    const fieldsEnabled = Boolean(value);
    if (simulationRef.current) simulationRef.current.settings.fieldsEnabled = fieldsEnabled;
    patch({ fieldsEnabled });
  }
  function togglePlaying() { patch({ playing: !stateRef.current.playing }); }

  function removeSelectedField() {
    const sim = simulationRef.current;
    if (!sim) return;
    cancelGesture();
    sim.removeField(stateRef.current.selectedFieldId);
    patch({ selectedFieldId: null });
    refreshMetrics();
  }

  function reset() {
    const sim = simulationRef.current;
    if (!sim) return;
    cancelGesture();
    Object.assign(sim.settings, { sampleCount: 120, drawResolution: 120, priorStrength: 1, fieldsEnabled: true });
    sim.reset();
    hoverRef.current = null;
    patch({
      mode: 'arrow', playing: true, panel: null,
      selectedShapeId: sim.shapes[0].id, selectedFieldId: null,
      priorStrength: 1, drawResolution: 120, surfaceResolution: 120, fieldResolution: 24,
      newFieldStrength: 1.2, newFieldRadius: 140,
      referenceVisible: true, fieldsEnabled: true, flowVisible: true, cursor: 'crosshair',
    });
    refreshMetrics();
    notify('已恢复默认圆盘，速度场已清空');
  }

  function openAbout() { cancelGesture(); patch({ aboutOpen: true }); }
  function closeAbout() { patch({ aboutOpen: false }); }

  function worldPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const camera = cameraRef.current;
    return { x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale };
  }

  function screenDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) * cameraRef.current.scale;
  }

  function segmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) * cameraRef.current.scale;
  }

  function hitField(point) {
    const sim = simulationRef.current;
    for (let i = sim.fields.length - 1; i >= 0; i--) {
      const field = sim.fields[i];
      const tip = { x: field.x + field.dx, y: field.y + field.dy };
      if (screenDistance(point, tip) < 15) return { field, part: 'tip' };
      if (segmentDistance(point, field, tip) < 12) return { field, part: 'body' };
    }
    return null;
  }

  function hitShape(point) {
    return [...simulationRef.current.shapes].reverse().find(shape => pointInPolygon(point, shape.points));
  }

  function onPointerDown(event) {
    const sim = simulationRef.current;
    if (!sim || !cameraRef.current || event.button !== 0 || gestureRef.current || stateRef.current.aboutOpen) return;
    const point = worldPoint(event);
    if (!(point.x > 6 && point.x < sim.width - 6 && point.y > 6 && point.y < sim.height - 6)) {
      notify('请在实验场中央区域绘制');
      return;
    }
    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    if (stateRef.current.mode === 'arrow') {
      const hit = hitField(point);
      if (hit) {
        gestureRef.current = { kind: 'edit', pointerId: event.pointerId, start: point, last: point, field: hit.field, part: hit.part, original: { ...hit.field } };
        patch({ selectedFieldId: hit.field.id, panel: 'field', cursor: 'grabbing' });
      } else {
        gestureRef.current = { kind: 'arrow', pointerId: event.pointerId, start: point, last: point };
        patch({ selectedFieldId: null, panel: null });
      }
    } else {
      gestureRef.current = { kind: 'brush', pointerId: event.pointerId, start: point, last: point, points: [point] };
      patch({ panel: null });
    }
  }

  function onPointerMove(event) {
    if (!simulationRef.current || !cameraRef.current) return;
    const point = worldPoint(event);
    hoverRef.current = point;
    const gesture = gestureRef.current;
    if (!gesture) {
      const cursor = stateRef.current.mode === 'arrow' && hitField(point) ? 'grab' : 'crosshair';
      if (cursor !== stateRef.current.cursor) patch({ cursor });
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;
    gesture.last = point;
    if (gesture.kind === 'brush') {
      const nativeEvent = event.nativeEvent || event;
      const coalesced = nativeEvent.getCoalescedEvents?.();
      const samples = coalesced?.length ? coalesced : [event];
      const captureSpacing = clamp(1.5 * 120 / stateRef.current.drawResolution, .25, 2);
      for (const sample of samples) {
        const next = worldPoint(sample), previous = gesture.points.at(-1);
        if (screenDistance(next, previous) > captureSpacing && gesture.points.length < 10000) gesture.points.push(next);
      }
    } else if (gesture.kind === 'edit') {
      const field = gesture.field, original = gesture.original;
      if (gesture.part === 'tip') {
        const dx = point.x - field.x, dy = point.y - field.y, length = Math.hypot(dx, dy);
        if (length > 12) {
          const scale = Math.min(280, length) / length;
          field.dx = dx * scale;
          field.dy = dy * scale;
        }
      } else {
        field.x = clamp(original.x + point.x - gesture.start.x, 10, simulationRef.current.width - 10);
        field.y = clamp(original.y + point.y - gesture.start.y, 10, simulationRef.current.height - 10);
      }
    }
  }

  function onPointerUp(event) {
    const gesture = gestureRef.current;
    const sim = simulationRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId || !sim) return;
    gestureRef.current = null;
    const point = worldPoint(event);
    const moved = screenDistance(gesture.start, point);
    const current = stateRef.current;
    if (gesture.kind === 'arrow' && moved >= 12) {
      if (sim.fields.length >= 12) notify('最多添加 12 个局部场；可选择并移除已有箭头');
      else {
        const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
        const scale = Math.min(250, Math.hypot(dx, dy)) / Math.hypot(dx, dy);
        const field = sim.addField({ x: gesture.start.x, y: gesture.start.y, dx: dx * scale, dy: dy * scale, strength: current.newFieldStrength, radius: current.newFieldRadius });
        patch({ selectedFieldId: field.id, panel: 'field' });
        if (!current.playing) notify('速度场已添加，点击「继续」开始形变');
        else if (!current.fieldsEnabled) notify('速度场已添加，打开下方「外力」开关以施加');
        else if (sim.fields.length === 1) notify('拖动粗细滑杆调整强度；关闭「外力」观察回复');
      }
    } else if (gesture.kind === 'brush' && gesture.points.length > 4) {
      if (sim.shapes.length >= 6) notify('最多同时观察 6 个连通域');
      else {
        gesture.points.push(point);
        const result = sim.addDrawnShape(gesture.points);
        if (result.ok) {
          patch({ selectedShapeId: result.shape.id });
          notify(`已保存 ${result.shape.points.length} 点轮廓。切换「箭头」添加局部速度场`);
        } else notify(result.reason);
      }
    } else if (gesture.kind !== 'edit') {
      const shape = hitShape(point);
      if (shape) patch({ selectedShapeId: shape.id, panel: null });
      else if (gesture.kind === 'brush') notify('按住并拖动画出一个轮廓，松手后自动闭合');
      else patch({ selectedFieldId: null, panel: 'field' });
    }
    const canvas = canvasRef.current;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    patch({ cursor: 'crosshair' });
    refreshMetrics();
  }

  function onPointerCancel(event) {
    if (gestureRef.current?.pointerId === event.pointerId) cancelGesture();
  }

  function onLostPointerCapture(event) {
    if (gestureRef.current?.pointerId === event.pointerId) cancelGesture();
  }

  function onPointerLeave() { hoverRef.current = null; }

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const workspace = workspaceRef.current;
    const rect = workspace.getBoundingClientRect();
    const width = rect.width || 1000, height = rect.height || 680;
    const portrait = width < 700;
    const worldHeight = portrait ? Math.max(900, 1000 * height / width) : 680;
    const worldWidth = portrait ? 1000 : 680 * width / height;
    const sim = new Simulation({ width: worldWidth, height: worldHeight, cx: worldWidth * .5, cy: portrait ? worldHeight * .68 : 335, radius: portrait ? 178 : 115 });
    simulationRef.current = sim;
    const context = canvas.getContext('2d');
    const resize = () => { cameraRef.current = resizeCanvas(canvas, sim); };
    const observer = new ResizeObserver(resize);
    observer.observe(workspace);
    resize();
    refreshMetrics();

    let previousTime = 0;
    let uiElapsed = 0;
    let animationFrame;
    function frame(timestamp) {
      const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, .05) : 0;
      previousTime = timestamp;
      const current = stateRef.current;
      if (current.playing && !gestureRef.current && !current.aboutOpen && !document.hidden && dt > 0) sim.step(dt);
      uiElapsed += dt;
      if (uiElapsed > .12) {
        refreshMetrics();
        uiElapsed = 0;
      }
      renderScene(context, sim, { ...current, camera: cameraRef.current, gesture: gestureRef.current, hover: hoverRef.current });
      animationFrame = requestAnimationFrame(frame);
    }

    function onVisibilityChange() { previousTime = 0; }
    function onKeyDown(event) {
      const target = event.target;
      if (stateRef.current.aboutOpen || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space' && target.tagName !== 'BUTTON') {
        event.preventDefault();
        togglePlaying();
      }
      if (event.key.toLowerCase() === 'b') setMode('brush');
      if (event.key.toLowerCase() === 'v') setMode('arrow');
      if (event.key === 'Escape') { cancelGesture(); closePanel(); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedField()) {
        event.preventDefault();
        removeSelectedField();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(toastTimerRef.current);
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture && canvas.hasPointerCapture(gesture.pointerId)) canvas.releasePointerCapture(gesture.pointerId);
      hoverRef.current = null;
      simulationRef.current = null;
    };
  }, []);

  const sim = simulationRef.current;
  const shape = sim?.shapes.find(item => item.id === state.selectedShapeId) || sim?.shapes[0];
  const field = sim?.fields.find(item => item.id === state.selectedFieldId);

  return {
    ...state,
    canvasRef,
    workspaceRef,
    selectedShape: shape ? { id: shape.id, kind: shape.kind, pointCount: shape.points.length, index: sim.shapes.indexOf(shape) } : null,
    selectedField: field ? { ...field, index: sim.fields.indexOf(field) } : null,
    status: state.playing ? (state.fieldsEnabled ? '实时演化' : '先验回复中') : '已暂停',
    canvasProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, onPointerLeave },
    actions: {
      toggleBrush, toggleArrow, closePanel, toggleSurfacePanel,
      setDrawResolution, setFieldResolution, setSurfaceResolution, applySurfaceResolution,
      setFieldStrength, setFieldRadius, setPriorStrength,
      setReferenceVisible, setFieldsEnabled, setFlowVisible, togglePlaying,
      removeSelectedField, reset, openAbout, closeAbout,
    },
  };
}
