import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { cutDisk, forgetDisks, latlonLookup, loadDisk, reproject } from './disk.ts';
import { geosXY } from './geo.ts';
import { createNet, USER_AGENT } from './net.ts';

const api = { createCanvas, loadImage } as never;
const px = (c: { getContext: (k: '2d') => { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } }, x: number, y: number) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];

test('a disk with margins and a caption bar: cut to the Earth, space and the bar black', () => {
  // 100 px image, the Earth 80 px across (red), a white bar over the bottom 6 rows.
  const src = createCanvas(100, 100);
  const g = src.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 100, 100);
  g.fillStyle = '#f00';
  g.beginPath();
  g.arc(50, 50, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(0, 94, 100, 6);
  const d = cutDisk(api, src as never, { scale: 0.8, maskBottom: 6 }, 80);
  assert.equal(d.width, 80);
  assert.deepEqual(px(d as never, 40, 40), [255, 0, 0, 255], 'the middle is the Earth');
  assert.deepEqual(px(d as never, 40, 2).slice(0, 1), [255], 'its top reaches the edge');
  assert.deepEqual(px(d as never, 1, 1), [0, 0, 0, 255], 'the corners are space');
  // No caption bar inside the disk (it was 4 rows under the Earth's bottom here: nothing to hide).
  assert.equal(px(d as never, 40, 79)[1], 0);
});

test('a latitude-longitude grid turned into the satellite’s view: places where they belong', () => {
  // A grid over ±81.5° around 0°, left half green (west of 0°), right half blue, a red row at the equator.
  const n = 326;
  const src = createCanvas(n, n);
  const g = src.getContext('2d');
  g.fillStyle = '#0f0';
  g.fillRect(0, 0, n / 2, n);
  g.fillStyle = '#00f';
  g.fillRect(n / 2, 0, n / 2, n);
  g.fillStyle = '#f00';
  g.fillRect(0, n / 2 - 2, n, 4);
  const bbox = { west: -81.5, south: -81.5, east: 81.5, north: 81.5 };
  const size = 192;
  const d = reproject(api, src as never, bbox, 0, size);
  const at = (lat: number, lon: number) => {
    const p = geosXY(0, lat, lon)!;
    return px(d as never, Math.round(((p[0] + 1) / 2) * size), Math.round(((1 - p[1]) / 2) * size));
  };
  assert.deepEqual(at(30, -40).slice(0, 3), [0, 255, 0], 'west is green');
  assert.deepEqual(at(-30, 40).slice(0, 3), [0, 0, 255], 'east is blue');
  assert.deepEqual(at(0, 20).slice(0, 3), [255, 0, 0], 'the equator is red');
  assert.deepEqual(px(d as never, 2, 2), [0, 0, 0, 255], 'space is black');
  // The lookup is made once per shape.
  assert.equal(latlonLookup(size, n, bbox, 0), latlonLookup(size, n, bbox, 0));
});

test('loading a frame from disk: decoded once and shared', async () => {
  forgetDisks();
  const dir = mkdtempSync(join(tmpdir(), 'world-disk-'));
  try {
    const c = createCanvas(120, 120);
    const g = c.getContext('2d');
    g.fillStyle = '#336';
    g.fillRect(0, 0, 120, 120);
    const file = join(dir, 'disk.jpg');
    writeFileSync(file, c.toBuffer('image/jpeg'));
    const f = { file, takenAt: 1, px: 120, kind: 'disk' as const };
    const a = loadDisk(api, f, 0);
    assert.equal(loadDisk(api, f, 0), a);
    const d = await a;
    assert.equal(d.size, 120);
    assert.equal(d.takenAt, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the network: its User-Agent, 304s, sizes and non-images', async () => {
  const seen: Record<string, string>[] = [];
  const reply = (body: string | Uint8Array, init: ResponseInit) => async (_u: string | URL | Request, req?: RequestInit) => {
    seen.push(Object.fromEntries(Object.entries((req?.headers ?? {}) as Record<string, string>)));
    return new Response(init.status === 304 ? null : body, init);
  };
  const ok = await createNet({ fetch: reply(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg', 'last-modified': 'Fri, 27 Nov 2026 08:04:44 GMT' } }) as never }).image('https://example.org/a.jpg', { since: Date.parse('2026-11-27T07:00:00Z') });
  assert.equal(ok.status, 200);
  assert.equal(ok.status === 200 && ok.lastModified, Date.parse('2026-11-27T08:04:44Z'));
  assert.equal(seen[0]!['User-Agent'], USER_AGENT);
  assert.equal(seen[0]!['If-Modified-Since'], 'Fri, 27 Nov 2026 07:00:00 GMT');
  assert.deepEqual(await createNet({ fetch: reply('', { status: 304 }) as never }).image('https://example.org/a.jpg'), { status: 304 });
  await assert.rejects(createNet({ fetch: reply('<ServiceException/>', { status: 200, headers: { 'content-type': 'text/xml' } }) as never }).image('https://example.org/wms'), /not an image/);
  await assert.rejects(createNet({ fetch: reply('x', { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(1e9) } }) as never }).image('https://example.org/big.jpg'), /more than/);
  await assert.rejects(createNet({ fetch: reply('no', { status: 404 }) as never }).image('https://example.org/missing.jpg'), /HTTP 404/);
});
