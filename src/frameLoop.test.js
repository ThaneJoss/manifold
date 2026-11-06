import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameLoop } from './frameLoop.js';

function setup() {
  let running = false, visible = true, nextId = 0;
  const pending = new Map();
  const calls = { steps: [], renders: 0, metrics: 0 };
  const loop = createFrameLoop({
    isRunning: () => running,
    isVisible: () => visible,
    step: dt => calls.steps.push(dt),
    render: () => { calls.renders++; },
    refreshMetrics: () => { calls.metrics++; },
    requestFrame: callback => {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    cancelFrame: id => { pending.delete(id); },
  });
  return {
    loop, pending, calls,
    setRunning(value) { running = value; loop.invalidate(); },
    setVisible(value) { visible = value; loop.invalidate(); },
    frame(timestamp) {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach(callback => callback(timestamp));
    },
  };
}

test('paused scenes draw only when invalidated and coalesce interaction updates', () => {
  const h = setup();
  h.loop.invalidate();
  h.loop.invalidate();
  assert.equal(h.pending.size, 1);
  h.frame(0);
  for (let i = 1; i <= 600; i++) h.frame(i * 1000 / 60);
  assert.deepEqual(h.calls, { steps: [], renders: 1, metrics: 0 });
  assert.equal(h.pending.size, 0);

  h.loop.invalidate(); // A hover, field edit or resize must still be drawn.
  h.frame(11000);
  assert.equal(h.calls.renders, 2);
  assert.equal(h.pending.size, 0);
});

test('running scenes refresh metrics periodically and flush once when paused', () => {
  const h = setup();
  h.setRunning(true);
  h.frame(0);
  for (let i = 1; i <= 9; i++) h.frame(i * 16);
  assert.equal(h.calls.steps.length, 9);
  assert.equal(h.calls.metrics, 1);
  h.setRunning(false);
  h.frame(160);
  assert.equal(h.calls.metrics, 2);
  assert.equal(h.calls.steps.length, 9);
  assert.equal(h.pending.size, 0);
  h.loop.invalidate();
  h.frame(176);
  assert.equal(h.calls.metrics, 2, 'an unchanged scene needs no metrics work');
});

test('resuming after a long pause starts with a fresh clock', () => {
  const h = setup();
  h.setRunning(true);
  h.frame(0);
  h.frame(16);
  h.setRunning(false);
  h.frame(32);
  h.loop.invalidate();
  h.frame(5000); // Hovering while paused must not restart the simulation clock.
  h.setRunning(true);
  h.frame(10000);
  assert.deepEqual(h.calls.steps, [.016]);
  h.frame(10016);
  assert.deepEqual(h.calls.steps, [.016, .016]);
  h.frame(11016);
  assert.equal(h.calls.steps.at(-1), .05, 'active frame delays remain bounded');
});

test('hidden scenes cancel pending work and do not catch up on return', () => {
  const h = setup();
  h.setRunning(true);
  h.frame(0);
  h.frame(16);
  h.setVisible(false);
  assert.equal(h.pending.size, 0);
  h.loop.invalidate();
  h.frame(10000);
  assert.equal(h.calls.renders, 2);
  h.setVisible(true);
  h.frame(20000);
  assert.deepEqual(h.calls.steps, [.016]);
  h.frame(20016);
  assert.deepEqual(h.calls.steps, [.016, .016]);
});

test('disposing cancels the scheduled frame and ignores later invalidations', () => {
  const h = setup();
  h.setRunning(true);
  assert.equal(h.pending.size, 1);
  h.loop.dispose();
  h.loop.invalidate();
  h.frame(1000);
  assert.equal(h.pending.size, 0);
  assert.deepEqual(h.calls, { steps: [], renders: 0, metrics: 0 });
});
