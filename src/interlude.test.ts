import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createBaseContext, themeById, validate } from '@kiosko/sdk';
import type { EarthData } from './earth.ts';
import { dayInterlude, FPS, MIN_FRAMES, modeFor } from './interlude.ts';
import { PROVIDERS } from './satellites/index.ts';
import { EARTH, TEAM, teamDemo } from './sources.ts';

process.env.TZ = 'Europe/Madrid';
const T = Date.parse('2026-11-27T08:15:00Z');

async function play(width: number, height: number, sources: Record<string, unknown>, options: Record<string, unknown> = {}) {
  const base = createBaseContext({ now: T, locale: 'es' });
  return dayInterlude.prepare({ ...base, options: validate(dayInterlude.options!, options).value as never, width, height, seed: 1, theme: themeById('midnight'), canvas: { createCanvas, loadImage } as never, sources } as never);
}

/** Satellite frames on disk, every 10 minutes for `n` frames. */
function frames(dir: string, n: number): EarthData {
  const p = PROVIDERS['goes-east'];
  const list = Array.from({ length: n }, (_, k) => {
    const c = createCanvas(200, 200);
    const g = c.getContext('2d');
    g.fillStyle = `rgb(${20 + k * 8},80,160)`;
    g.fillRect(0, 0, 200, 200);
    const file = join(dir, `f${k}.jpg`);
    writeFileSync(file, c.toBuffer('image/jpeg'));
    return { file, takenAt: T - (n - k) * 600_000, px: 200, kind: 'disk' as const };
  });
  return { sat: 'goes-east', name: p.name, craft: p.craft, subLon: p.subLon, credit: p.credit(2026), creditLong: p.creditLong(2026), frames: list, stale: false, error: null };
}

const lit = (g: ReturnType<ReturnType<typeof createCanvas>['getContext']>, w: number, h: number) => {
  const d = g.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 40) n++;
  return n / (w * h);
};

test('a day in the seconds asked, at every panel shape; each frame cheap', async () => {
  for (const [w, h] of [[480, 320], [1920, 462], [1920, 140], [320, 320], [172, 320]] as const) {
    const p = await play(w, h, { [TEAM]: teamDemo() }, { seconds: 8 });
    assert.ok(p, `${w}x${h}`);
    assert.equal(p.frames, 8 * FPS);
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    await p.draw(g as never, 0);
    let worst = 0;
    for (const i of [1, 30, 60, 90, p.frames - 1]) {
      const t0 = performance.now();
      await p.draw(g as never, i);
      worst = Math.max(worst, performance.now() - t0);
    }
    assert.ok(worst < 40, `${w}x${h}: a frame took ${worst.toFixed(1)} ms`);
    // The map (or globe) and the clocks: a good part of the screen lit (on a long strip, the map's share of it).
    assert.ok(lit(g, w, h) > (w / h > 4 ? 0.15 : 0.3), `${w}x${h}: the map is there`);
  }
});

test('the night moves: the first and middle frames differ, the last is back to the start', async () => {
  const p = (await play(480, 240, { [TEAM]: teamDemo() }, { show: 'map', seconds: 4 }))!;
  const shot = async (i: number) => {
    const c = createCanvas(480, 240);
    await p.draw(c.getContext('2d') as never, i);
    return c.getContext('2d').getImageData(0, 60, 480, 1).data;
  };
  const a = await shot(0), b = await shot(Math.floor(p.frames / 2)), z = await shot(p.frames - 1);
  const diff = (x: Uint8ClampedArray, y: Uint8ClampedArray) => x.reduce((s, v, i) => s + Math.abs(v - y[i]!), 0) / x.length;
  assert.ok(diff(a, b) > 10, 'half a day later, day and night have swapped');
  assert.ok(diff(a, z) < diff(a, b) / 3, 'a whole day later, about where it started');
});

test('satellite images when there are enough, else the map or the globe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'world-seq-'));
  try {
    const few = frames(dir, MIN_FRAMES - 1), many = frames(dir, 12);
    assert.equal(modeFor('auto', few, 480, 480), 'globe');
    assert.equal(modeFor('auto', few, 1920, 462), 'map');
    assert.equal(modeFor('auto', many, 480, 480), 'satellite');
    assert.equal(modeFor('auto', many, 1920, 462), 'map');
    assert.equal(modeFor('satellite', few, 480, 480), 'globe');
    assert.equal(modeFor('globe', many, 1920, 140), 'globe');
    const p = (await play(480, 480, { [EARTH]: many, [TEAM]: teamDemo() }, { show: 'satellite', seconds: 6 }))!;
    const c = createCanvas(480, 480);
    const g = c.getContext('2d');
    let worst = 0;
    for (const i of [0, 20, 45, 89]) {
      const t0 = performance.now();
      await p.draw(g as never, i);
      worst = Math.max(worst, performance.now() - t0);
    }
    assert.ok(worst < 20, `a frame took ${worst.toFixed(1)} ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('nothing set up yet: still plays, the map alone', async () => {
  const p = await play(320, 240, {});
  assert.ok(p);
});
