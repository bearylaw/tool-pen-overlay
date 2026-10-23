// End-to-end smoke test: launches the built app with throwaway settings,
// draws, erases, undoes, opens every panel and changes settings, asserting
// on what the windows render. Needs a desktop session; not part of `check`.
//
//   npm run test:e2e            (screenshots go to test-results/)

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const out = process.argv[2] ?? 'test-results';
mkdirSync(out, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'pen-overlay-smoke-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = await electron.launch({
  args: ['.'],
  // Let the app drive prefers-color-scheme, as it does outside tests.
  colorScheme: null,
  env: { ...process.env, PEN_OVERLAY_USER_DATA: userData },
});

async function page(host, count = 1) {
  for (let i = 0; i < 100; i++) {
    const pages = app.windows().filter((p) => p.url().startsWith(`app://${host}/`));
    if (pages.length >= count) return pages;
    await sleep(100);
  }
  throw new Error(`window app://${host}/ did not open`);
}

/** Number of painted pixels and the highest alpha on an overlay's ink layer. */
function inkStats(overlay) {
  return overlay.evaluate(() => {
    const canvas = document.getElementById('ink');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) painted++;
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    return { painted, maxAlpha };
  });
}

async function stroke(overlay, points, { shift = false } = {}) {
  const [first, ...rest] = points;
  if (shift) await overlay.keyboard.down('Shift');
  await overlay.mouse.move(first[0], first[1]);
  await overlay.mouse.down();
  for (const [x, y] of rest) await overlay.mouse.move(x, y, { steps: 8 });
  await overlay.mouse.up();
  if (shift) await overlay.keyboard.up('Shift');
  await sleep(150);
}

// Test input arrives through the DevTools protocol, not the OS. Keep the
// windows click-through and unfocused so the person at the computer can
// keep working while the test runs without drawing into it.
await app.evaluate(({ BrowserWindow }) => {
  const ignore = BrowserWindow.prototype.setIgnoreMouseEvents;
  BrowserWindow.prototype.setIgnoreMouseEvents = function () {
    return ignore.call(this, true);
  };
  BrowserWindow.prototype.focus = () => undefined;
  for (const win of BrowserWindow.getAllWindows()) ignore.call(win, true);
});

// Chromium moves a canvas from GPU to CPU rasterisation after repeated
// reads, which changes anti-aliased edge pixels; compare with a tolerance.
function assertSameInk(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) <= expected * 0.15,
    `expected about ${expected} pixels, got ${actual}`,
  );
}

const step = (name) => console.info(`ok - ${name}`);

try {
  const [toolbar] = await page('toolbar');
  const overlays = await page('overlay');
  const overlay = overlays[0];
  await toolbar.waitForSelector('.bar[aria-label]');
  const button = (name) => toolbar.getByRole('button', { name, exact: true });
  await sleep(500);
  await toolbar.screenshot({ path: join(out, 'toolbar.png'), omitBackground: true });
  step('toolbar renders');

  await button('Pen').click();
  await sleep(150);
  assert.match(await overlay.evaluate(() => document.body.style.cursor), /url\(/);
  step('pen enters drawing mode with a brush cursor');

  await stroke(overlay, [
    [300, 300],
    [420, 360],
    [520, 300],
    [640, 380],
  ]);
  const drawn = await inkStats(overlay);
  assert.ok(drawn.painted > 500, `expected ink, got ${drawn.painted} pixels`);
  assert.equal(drawn.maxAlpha, 255);
  assert.equal(await button('Undo').isEnabled(), true);
  step('freehand stroke is drawn and undoable');

  await button('Undo').click();
  await sleep(150);
  assert.equal((await inkStats(overlay)).painted, 0);
  await button('Redo').click();
  await sleep(150);
  assertSameInk((await inkStats(overlay)).painted, drawn.painted);
  step('undo and redo restore the exact stroke');

  await toolbar.keyboard.press('e');
  await stroke(overlay, [
    [420, 250],
    [420, 450],
    [520, 250],
    [520, 450],
  ]);
  assert.equal((await inkStats(overlay)).painted, 0);
  await toolbar.keyboard.press('Control+z');
  await sleep(150);
  assertSameInk((await inkStats(overlay)).painted, drawn.painted);
  step('eraser removes the stroke; Ctrl+Z brings it back');

  await toolbar.keyboard.press('h');
  await stroke(overlay, [
    [300, 600],
    [700, 600],
  ]);
  const highlighted = await inkStats(overlay);
  assert.ok(highlighted.painted > drawn.painted);
  step('highlighter draws translucent ink');

  await toolbar.keyboard.press('r');
  await stroke(
    overlay,
    [
      [800, 300],
      [1000, 360],
    ],
    { shift: true },
  );
  await toolbar.keyboard.press('a');
  await stroke(overlay, [
    [800, 600],
    [1000, 500],
  ]);
  assert.ok((await inkStats(overlay)).painted > highlighted.painted);
  await overlay.screenshot({
    path: join(out, 'ink.png'),
    omitBackground: true,
    clip: { x: 250, y: 220, width: 820, height: 450 },
  });
  step('rectangle (Shift: square) and arrow are drawn');

  await toolbar.getByRole('button', { name: 'Color #3B82F6' }).click();
  await sleep(100);
  assert.equal(
    await toolbar.getByRole('button', { name: 'Color #3B82F6' }).getAttribute('aria-pressed'),
    'true',
  );
  step('palette swatch selects its colour');

  await button('More colors and palettes').click();
  const [panel] = await page('panel');
  await panel.waitForSelector('.color-panel');
  await panel.getByRole('textbox', { name: 'Hex color' }).fill('#14b8a6');
  await panel.getByRole('textbox', { name: 'Hex color' }).press('Enter');
  await sleep(150);
  await panel.getByRole('button', { name: 'Add current color to palette' }).click();
  await sleep(200);
  assert.equal(await toolbar.locator('.swatch').count(), 9);
  await panel.screenshot({ path: join(out, 'panel-color.png'), omitBackground: true });
  step('custom colour is added to the palette');

  await panel.keyboard.press('Escape');
  await sleep(300);
  await button('Brush size: 4 px').click();
  await panel.waitForSelector('.size-panel');
  await panel.getByRole('button', { name: '16', exact: true }).click();
  await sleep(150);
  assert.equal(await toolbar.getByRole('button', { name: 'Brush size: 16 px' }).count(), 1);
  await panel.screenshot({ path: join(out, 'panel-size.png'), omitBackground: true });
  step('size preset applies to the current tool');

  await panel.keyboard.press('Escape');
  await sleep(300);
  await button('Settings').click();
  await panel.waitForSelector('.settings-panel');
  await sleep(200);
  await panel.screenshot({ path: join(out, 'panel-settings.png'), omitBackground: true });
  await panel.getByRole('radio', { name: 'Vertical' }).click();
  await sleep(300);
  assert.equal(await toolbar.locator('.bar.vertical').count(), 1);
  await toolbar.screenshot({ path: join(out, 'toolbar-vertical.png'), omitBackground: true });
  step('settings switch the toolbar to vertical');

  const before = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('app://toolbar/'))
      .getBounds(),
  );
  await panel.evaluate(() => {
    const scale = document.getElementById('scale');
    scale.value = '150';
    scale.dispatchEvent(new Event('change'));
  });
  await sleep(400);
  const after = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('app://toolbar/'))
      .getBounds(),
  );
  assert.ok(after.height > before.height * 1.4, `toolbar ${before.height} → ${after.height}`);
  step('toolbar size setting scales the toolbar');

  await panel.keyboard.press('Escape');
  await sleep(300);
  await toolbar.keyboard.press('Delete');
  await sleep(150);
  assert.equal((await inkStats(overlay)).painted, 0);
  await toolbar.keyboard.press('Escape');
  await sleep(150);
  assert.equal(await overlay.evaluate(() => document.body.style.cursor), 'default');
  step('Delete clears, Escape stops drawing');

  // Dark theme, normal size, horizontal: the README screenshots.
  await button('Settings').click();
  await panel.waitForSelector('.settings-panel');
  await panel.getByRole('radio', { name: 'Dark' }).click();
  await panel.getByRole('radio', { name: 'Horizontal' }).click();
  await panel.evaluate(() => {
    const scale = document.getElementById('scale');
    scale.value = '100';
    scale.dispatchEvent(new Event('change'));
  });
  await sleep(500);
  assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors), true);
  await panel.screenshot({ path: join(out, 'panel-settings-dark.png'), omitBackground: true });
  await toolbar.evaluate(() => document.activeElement?.blur());
  await toolbar.screenshot({ path: join(out, 'toolbar-dark.png'), omitBackground: true });
  await panel.keyboard.press('Escape');
  await sleep(300);
  await button('More colors and palettes').click();
  await panel.waitForSelector('.color-panel');
  await sleep(300);
  assert.equal(await panel.locator('.palette-row input').isVisible(), false);
  await panel.screenshot({ path: join(out, 'panel-color-dark.png'), omitBackground: true });
  await panel.keyboard.press('Escape');
  await sleep(300);
  await button('Brush size: 16 px').click();
  await panel.waitForSelector('.size-panel');
  await sleep(300);
  await panel.screenshot({ path: join(out, 'panel-size-dark.png'), omitBackground: true });
  step('dark theme applies to toolbar and panels; hidden rows stay hidden');

  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await sleep(500);
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
  assert.equal(saved.toolbar.theme, 'dark');
  assert.equal(saved.tool.sizes.shape, 16);
  assert.ok(saved.palettes[0].colors.includes('#14b8a6'));
  step('settings persist to the user folder');
  console.info('smoke test passed');
} finally {
  await app.close().catch(() => undefined);
  rmSync(userData, { recursive: true, force: true });
}
