// Drawing-latency benchmark: floods an overlay with pointer moves the way a
// fast pen or high-rate mouse does (one long stroke) and reports how long
// input waits before it is handled and how long frames take. Queue delay and
// stalled frames are what users feel as lag; any frame over 50 ms fails the
// run. Needs a desktop session.
//
//   npm run build && node scripts/bench.mjs [moves]

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const moves = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3000);
const userData = mkdtempSync(join(tmpdir(), 'pen-overlay-bench-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, PEN_OVERLAY_USER_DATA: userData },
});
try {
  // Keep the real mouse and keyboard with the person at the computer.
  await app.evaluate(({ BrowserWindow }) => {
    const ignore = BrowserWindow.prototype.setIgnoreMouseEvents;
    BrowserWindow.prototype.setIgnoreMouseEvents = function () {
      return ignore.call(this, true);
    };
    BrowserWindow.prototype.focus = () => undefined;
    for (const win of BrowserWindow.getAllWindows()) ignore.call(win, true);
  });
  let toolbar;
  let overlay;
  for (let i = 0; i < 100 && (toolbar === undefined || overlay === undefined); i++) {
    toolbar = app.windows().find((p) => p.url().startsWith('app://toolbar/'));
    overlay = app.windows().find((p) => p.url().startsWith('app://overlay/'));
    await sleep(100);
  }
  await toolbar.waitForSelector('.bar[aria-label]');
  await toolbar.getByRole('button', { name: 'Pen', exact: true }).click();
  await sleep(300);

  await overlay.evaluate(() => {
    const probe = { delays: [], frames: [] };
    window.__probe = probe;
    const type = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
    window.addEventListener(type, (e) => probe.delays.push(performance.now() - e.timeStamp), {
      capture: true,
    });
    let last = performance.now();
    const tick = (t) => {
      probe.frames.push(t - last);
      last = t;
      if (!probe.done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const cdp = await overlay.context().newCDPSession(overlay);
  const at = (i) => {
    const angle = i / 40;
    const radius = 80 + i / 12;
    return {
      x: Math.round(700 + Math.cos(angle) * radius),
      y: Math.round(500 + Math.sin(angle) * radius),
    };
  };
  const send = (type, i) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      ...at(i),
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });

  const started = Date.now();
  await send('mousePressed', 0);
  // Fire without waiting for each: the renderer sees a continuous flood.
  const pending = [];
  for (let i = 1; i <= moves; i++) pending.push(send('mouseMoved', i));
  await Promise.all(pending);
  await send('mouseReleased', moves);
  const elapsed = Date.now() - started;
  await sleep(300);

  const { delays, frames } = await overlay.evaluate(() => {
    window.__probe.done = true;
    return window.__probe;
  });
  const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]?.toFixed(1);
    return `p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${s.at(-1)?.toFixed(1)} ms (n=${s.length})`;
  };
  console.info(`${moves} moves in ${elapsed} ms`);
  console.info(`input queue delay: ${stats(delays)}`);
  console.info(`frame time:        ${stats(frames.slice(1))}`);
  const slow = frames.slice(1).filter((f) => f > 50).length;
  console.info(`frames over 50 ms: ${slow}`);
  // Regression check for the 1.0.0 lag: a long stroke must not stall frames.
  if (slow > 0) {
    console.error('FAIL: frames stalled while drawing');
    process.exitCode = 1;
  }
} finally {
  await app.close().catch(() => undefined);
  rmSync(userData, { recursive: true, force: true });
}
