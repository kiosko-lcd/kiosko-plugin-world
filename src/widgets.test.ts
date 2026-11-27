import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as kit from '@loksly/lcd-canvas-kit';
import { createBaseContext, defaultsOf, themeById, type WidgetDefinition } from '@kiosko/sdk';
import { renderWidget } from '@kiosko/sdk/testing';
import { demoEarth } from './demo.ts';
import type { Disk } from './disk.ts';
import { MIN_PX } from './draw-team.ts';
import type { EarthData } from './earth.ts';
import { PROVIDERS } from './satellites/index.ts';
import { EARTH, TEAM, teamDemo } from './sources.ts';
import { resolveTeam } from './team.ts';
import { earthWidget, layoutEarth, pastFrames, type Shown } from './widget-earth.ts';
import { layoutMap, mapWidget } from './widget-map.ts';
import { teamWidget } from './widget-team.ts';

// Times are written in this machine's zone: the same everywhere the tests run.
process.env.TZ = 'Europe/Madrid';

const SIZES = [{ w: 172, h: 320 }, { w: 320, h: 320 }, { w: 480, h: 320 }, { w: 640, h: 320 }, { w: 800, h: 480 }, { w: 1920, h: 140 }, { w: 1920, h: 462 }, { w: 240, h: 70 }];
const LOCALES = ['en', 'es', 'zh-Hant'];
const T = Date.parse('2026-11-27T08:15:00Z');

/**
 * Paints in a box with a margin around it, as the SDK's `renderWidget` does,
 * and counts what spilled into the margin, reading only the margin (the
 * SDK's helper reads every pixel: slow at 1920 px across). Also notes every
 * text with its size, and the time the paint took.
 */
const M = 24;
function paint(w: WidgetDefinition<any, any>, size: { w: number; h: number }, locale: string, o: { options?: Record<string, unknown>; data?: unknown; sources?: Record<string, unknown>; theme?: string; now?: number } = {}) {
  const out: { text: string; size: number }[] = [];
  const spy = { ...kit, drawTracked: (g: never, text: string, x: number, y: number, f: { size: number }) => (out.push({ text, size: f.size }), kit.drawTracked(g, text, x, y, f as never)) };
  const W = size.w + 2 * M, H = size.h + 2 * M;
  const g = createCanvas(W, H).getContext('2d');
  const theme = themeById(o.theme ?? 'midnight');
  const t0 = performance.now();
  let error: string | undefined;
  try {
    w.render(g as never, { ...createBaseContext({ now: o.now ?? T, locale }), options: { ...(w.options ? defaultsOf(w.options as never) : {}), ...(o.options ?? {}) }, data: o.data, sources: o.sources ?? {}, working: true, box: { x: M, y: M, w: size.w, h: size.h }, theme, fonts: theme.fonts, kit: spy, canvas: { createCanvas, loadImage }, preview: false } as never);
  } catch (err) {
    error = String(err);
  }
  const ms = performance.now() - t0;
  let outside = 0;
  for (const [x, y, ww, hh] of [[0, 0, W, M], [0, H - M, W, M], [0, M, M, size.h], [W - M, M, M, size.h]] as const) {
    const d = g.getImageData(x, y, ww, hh).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 24) outside++;
  }
  return { texts: out, error, outside, ms };
}

/** Paints with every text's size noted. */
function texts(w: WidgetDefinition<any, any>, size: { w: number; h: number }, locale: string, o: { options?: Record<string, unknown>; data?: unknown; sources?: Record<string, unknown>; theme?: string } = {}) {
  const out: { text: string; size: number }[] = [];
  const spy = { ...kit, drawTracked: (g: never, text: string, x: number, y: number, f: { size: number }) => (out.push({ text, size: f.size }), kit.drawTracked(g, text, x, y, f as never)) };
  const g = createCanvas(size.w, size.h).getContext('2d');
  const theme = themeById(o.theme ?? 'midnight');
  w.render(g as never, { ...createBaseContext({ now: T, locale }), options: { ...(w.options ? defaultsOf(w.options as never) : {}), ...(o.options ?? {}) }, data: o.data, sources: o.sources ?? {}, working: true, box: { x: 0, y: 0, w: size.w, h: size.h }, theme, fonts: theme.fonts, kit: spy, canvas: { createCanvas, loadImage }, preview: false } as never);
  return out;
}

/** A disk image standing in for a satellite's: blue with a lit half. */
function fakeShown(): Shown {
  const c = createCanvas(300, 300);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 300, 300);
  g.fillStyle = '#2a5d9f';
  g.beginPath();
  g.arc(150, 150, 150, 0, Math.PI * 2);
  g.fill();
  const disk = (takenAt: number): Disk => ({ img: c as never, size: 300, takenAt, file: '/x.jpg' });
  return { latest: disk(T - 25 * 60_000), past: [disk(T - 85 * 60_000), disk(T - 145 * 60_000)] };
}
const earthOf = (sat: keyof typeof PROVIDERS, stale = false): EarthData => {
  const p = PROVIDERS[sat];
  return { sat, name: p.name, craft: p.craft, subLon: p.subLon, credit: p.credit(2026), creditLong: p.creditLong(2026), frames: [{ file: '/x.jpg', takenAt: T - 25 * 60_000, px: 678, kind: 'disk' }], stale, error: null };
};

const team = teamDemo();
const VARIANTS: [string, WidgetDefinition<any, any>, { options?: Record<string, unknown>; data?: unknown; sources: Record<string, unknown> }][] = [
  ['map', mapWidget, { sources: { [TEAM]: team } }],
  ['map, globe', mapWidget, { options: { projection: 'globe' }, sources: { [TEAM]: team } }],
  ['map, no list, plain night', mapWidget, { options: { list: false, twilight: false, showMoon: false, labels: false }, sources: { [TEAM]: team } }],
  ['team', teamWidget, { sources: { [TEAM]: team } }],
  ['team, none', teamWidget, { sources: { [TEAM]: { cities: [], here: 'UTC' } } }],
  ['earth, demo', earthWidget, { sources: { [EARTH]: demoEarth(T) } }],
  ['earth, GOES', earthWidget, { data: fakeShown(), sources: { [EARTH]: earthOf('goes-east') } }],
  ['earth, Meteosat, old', earthWidget, { data: fakeShown(), sources: { [EARTH]: earthOf('meteosat', true) } }],
  ['earth, Himawari', earthWidget, { data: fakeShown(), sources: { [EARTH]: earthOf('himawari') } }],
  ['earth, waiting', earthWidget, { sources: { [EARTH]: { ...earthOf('himawari'), frames: [] } } }],
];

test('every widget at 8 sizes and 3 languages: no errors, nothing outside its box', () => {
  for (const [name, w, o] of VARIANTS)
    for (const size of SIZES)
      for (const locale of LOCALES) {
        const r = paint(w, size, locale, o);
        assert.equal(r.error, undefined, `${name} ${size.w}x${size.h} ${locale}`);
        assert.equal(r.outside, 0, `${name} ${size.w}x${size.h} ${locale}`);
      }
});

test('no text under 11 px, anywhere, in any theme', () => {
  for (const [name, w, o] of VARIANTS)
    for (const size of SIZES)
      for (const locale of LOCALES)
        for (const theme of ['midnight', 'paper', 'phosphor']) {
          const small = texts(w, size, locale, { ...o, theme }).filter((x) => x.size < MIN_PX);
          assert.deepEqual(small, [], `${name} ${size.w}x${size.h} ${locale} ${theme}`);
        }
});

test('the satellite’s credit is on screen at every size, whole', () => {
  for (const sat of ['goes-east', 'goes-west', 'meteosat', 'meteosat-iodc', 'himawari'] as const)
    for (const size of SIZES)
      for (const locale of LOCALES) {
        const p = PROVIDERS[sat];
        const drawn = texts(earthWidget, size, locale, { data: fakeShown(), sources: { [EARTH]: earthOf(sat) } }).map((x) => x.text);
        // Either form, possibly wrapped over lines, whole: no ellipsis in it.
        const flat = drawn.join('').replace(/\s/g, '');
        const has = (credit: string) => flat.includes(credit.replace(/\s/g, ''));
        assert.ok(has(p.credit(2026)) || has(p.creditLong(2026)), `${sat} ${size.w}x${size.h} ${locale}: ${drawn.join(' | ')}`);
      }
});

test('the map: the cities’ times, the clocks beside or under when there is room', () => {
  const r = renderWidget(mapWidget, { size: { w: 640, h: 320 }, locale: 'en', now: T, sources: { [TEAM]: team } });
  // 8:15 UTC: 9:15 in Berlin, 17:15 in Tokyo.
  assert.ok(r.texts.some((t) => t.startsWith('9:15')), r.texts.join(' | '));
  assert.ok(r.texts.includes('Tokyo'), 'names on a big map');
  const es = renderWidget(mapWidget, { size: { w: 800, h: 480 }, locale: 'es', now: T, sources: { [TEAM]: team } });
  assert.ok(es.texts.includes('Nueva York') && es.texts.includes('Sídney'), es.texts.join(' | '));
  const zh = renderWidget(teamWidget, { size: { w: 320, h: 320 }, locale: 'zh-Hant', now: T, sources: { [TEAM]: team } });
  assert.ok(zh.texts.includes('東京') && zh.texts.includes('舊金山'), zh.texts.join(' | '));
  // Layouts: beside on long boxes, under on square ones, none when it doesn't fit.
  assert.equal(layoutMap({ x: 0, y: 0, w: 1920, h: 140 }, false, true, 10).list?.as, 'strip');
  assert.equal(layoutMap({ x: 0, y: 0, w: 320, h: 320 }, false, true, 10).list?.y, 172);
  assert.equal(layoutMap({ x: 0, y: 0, w: 640, h: 320 }, false, true, 10).list, undefined);
  assert.equal(layoutMap({ x: 0, y: 0, w: 640, h: 320 }, true, true, 10).list?.x, 332);
});

test('the clocks: sorted west to east, green at work and grey off', () => {
  const r = renderWidget(teamWidget, { size: { w: 320, h: 400 }, locale: 'en', now: T, sources: { [TEAM]: team } });
  const order = ['San Francisco', 'New York', 'São Paulo', 'London', 'Berlin', 'Dubai', 'Mumbai', 'Shanghai', 'Tokyo', 'Sydney'];
  assert.deepEqual(r.texts.filter((t) => order.includes(t)), order);
  const strip = renderWidget(teamWidget, { size: { w: 1920, h: 140 }, locale: 'en', now: T, sources: { [TEAM]: { cities: resolveTeam([]), here: 'Europe/Madrid' } } });
  assert.ok(strip.texts.some((t) => t === '9:15 AM'), strip.texts.join(' | '));
  assert.ok(!strip.texts.some((t) => t.includes('…') && /\d/.test(t)), 'times never cut');
  const none = renderWidget(teamWidget, { size: { w: 320, h: 200 }, locale: 'en', now: T, sources: { [TEAM]: { cities: [], here: 'UTC' } } });
  assert.deepEqual(none.texts, ['No cities set']);
});

test('the Earth: whole on squares, beside its caption on long tiles, the hours before on strips', () => {
  assert.deepEqual(layoutEarth({ x: 0, y: 0, w: 320, h: 320 }).overlay, true);
  const strip = layoutEarth({ x: 0, y: 0, w: 1920, h: 140 });
  assert.equal(strip.disk.w, 140);
  assert.ok(strip.film && strip.film.w > 500);
  const tall = layoutEarth({ x: 0, y: 0, w: 172, h: 320 });
  assert.equal(tall.disk.w, 172);
  assert.ok(tall.text && tall.text.y >= 172);
  const frames = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((m) => ({ takenAt: m * 60_000 }));
  assert.deepEqual(pastFrames(frames, 8).map((f) => f.takenAt / 60_000), [70, 20]);
  const r = renderWidget(earthWidget, { size: { w: 1920, h: 140 }, locale: 'en', now: T, data: fakeShown(), sources: { [EARTH]: earthOf('goes-east') } });
  assert.ok(r.texts.some((t) => t.startsWith('GOES-East · ')), r.texts.join(' | '));
  assert.ok(r.texts.includes('7:50 AM') && r.texts.includes('6:50 AM'), 'the hours before, with their times');
  assert.ok(r.texts.some((t) => /min ago/.test(t)));
  const old = renderWidget(earthWidget, { size: { w: 480, h: 320 }, locale: 'en', now: T, data: fakeShown(), sources: { [EARTH]: earthOf('meteosat', true) } });
  assert.ok(old.texts.join(' ').includes('not updated'), old.texts.join(' | '));
  const demo = renderWidget(earthWidget, { size: { w: 320, h: 320 }, locale: 'es', now: T });
  assert.ok(demo.texts.join(' ').includes('Muestra'), 'the demo says it is a sample');
  const waiting = renderWidget(earthWidget, { size: { w: 320, h: 320 }, locale: 'en', now: T, demo: false, sources: { [EARTH]: { ...earthOf('himawari'), frames: [] } } });
  assert.deepEqual(waiting.texts, ['Waiting for the satellite…']);
});

test('a paint is cheap once the land is drawn', () => {
  for (const [name, w, o] of VARIANTS.slice(0, 4))
    for (const size of SIZES) {
      paint(w, size, 'en', o);
      const ms = Math.min(...[0, 1, 2].map(() => paint(w, size, 'en', { ...o, now: T + 60_000 }).ms));
      assert.ok(ms < 45, `${name} ${size.w}x${size.h}: ${ms.toFixed(1)} ms`);
    }
});
