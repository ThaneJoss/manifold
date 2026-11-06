/**
 * Keep animation work asleep while paused or hidden. Interactions invalidate one
 * frame; a running simulation requests the next frame after drawing.
 * @param {{
 *   isRunning: () => boolean,
 *   isVisible: () => boolean,
 *   step: (dt: number) => void,
 *   render: () => void,
 *   refreshMetrics: () => void,
 *   requestFrame?: (callback: FrameRequestCallback) => number,
 *   cancelFrame?: (handle: number) => void,
 * }} options
 */
export function createFrameLoop({
  isRunning, isVisible, step, render, refreshMetrics,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
}) {
  let handle = null;
  let previousTime = null;
  let uiElapsed = 0;
  let metricsDirty = false;
  let disposed = false;

  function schedule() {
    if (!disposed && isVisible() && handle === null) handle = requestFrame(frame);
  }

  function frame(timestamp) {
    handle = null;
    if (disposed || !isVisible()) {
      previousTime = null;
      return;
    }
    const running = isRunning();
    const dt = running && previousTime !== null ? Math.min((timestamp - previousTime) / 1000, .05) : 0;
    previousTime = running ? timestamp : null;
    if (dt > 0) {
      step(dt);
      uiElapsed += dt;
      metricsDirty = true;
    }
    if (metricsDirty && (uiElapsed > .12 || !running)) {
      refreshMetrics();
      uiElapsed = 0;
      metricsDirty = false;
    }
    render();
    if (isRunning()) schedule();
    else previousTime = null;
  }

  function invalidate() {
    if (disposed) return;
    if (!isVisible()) {
      if (handle !== null) cancelFrame(handle);
      handle = null;
      previousTime = null;
      return;
    }
    if (!isRunning()) previousTime = null;
    schedule();
  }

  function dispose() {
    disposed = true;
    if (handle !== null) cancelFrame(handle);
    handle = null;
  }

  return { invalidate, dispose };
}
