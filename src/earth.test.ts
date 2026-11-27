import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KEEP, MAX_BACKOFF_MS, MIN_GAP_MS, readEarth, STALE_MS } from './earth.ts';
import type { ImageResult, Net } from './net.ts';
import type { Provider, Shot } from './satellites/index.ts';
import { fileStore, memoryStore } from './store.ts';

const T0 = Date.parse('2026-11-27T08:00:00Z');
const MIN = 60_000;

/** A provider whose latest image is whatever `latest` says, and a network that serves it and counts. */
function world(o: { lastModified?: boolean; fixedUrl?: boolean } = {}) {
  const st = { latest: T0 - 10 * MIN, down: false, plans: 0, images: 0, conditional: 0 };
  const provider: Provider = {
    id: 'himawari',
    name: { en: 'Test' },
    craft: 'Test-1',
    subLon: 140.7,
    hosts: ['example.org'],
    credit: () => 'Credit',
    async plan(_net, px): Promise<Shot> {
      st.plans++;
      if (st.down) throw new Error('HTTP 503');
      const url = o.fixedUrl ? 'https://example.org/latest.jpg' : `https://example.org/${st.latest}.jpg`;
      return { url, takenAt: o.fixedUrl ? null : st.latest, px: Math.max(339, px), kind: 'disk' };
    },
  };
  const net: Net = {
    async text() {
      throw new Error('unused');
    },
    async image(_url, req = {}): Promise<ImageResult> {
      if (st.down) throw new Error('HTTP 503');
      if (o.fixedUrl && req.since && req.since >= st.latest) {
        st.conditional++;
        return { status: 304 };
      }
      st.images++;
      return { status: 200, buf: Buffer.from(`jpeg ${st.latest}`), lastModified: o.lastModified ? st.latest : null };
    },
  };
  return { st, provider, net };
}

test('first read downloads; within 10 minutes no request at all; then only when there is a new image', async () => {
  const { st, provider, net } = world();
  const store = memoryStore();
  const a = await readEarth(provider, { now: T0, px: 480 }, { net, store });
  assert.equal(st.images, 1);
  assert.equal(a.frames.length, 1);
  assert.equal(a.frames[0]!.takenAt, T0 - 10 * MIN);
  assert.equal(a.stale, false);
  assert.equal(a.credit, 'Credit');
  // Read again and again for 9 minutes: nothing asked.
  for (let m = 1; m < 10; m++) await readEarth(provider, { now: T0 + m * MIN, px: 480 }, { net, store });
  assert.equal(st.plans, 1);
  assert.equal(st.images, 1);
  // 10 minutes later the provider is asked, but has nothing new: no download.
  await readEarth(provider, { now: T0 + MIN_GAP_MS, px: 480 }, { net, store });
  assert.equal(st.plans, 2);
  assert.equal(st.images, 1);
  // A new image: downloaded and kept after the first.
  st.latest = T0 + 10 * MIN;
  const b = await readEarth(provider, { now: T0 + 2 * MIN_GAP_MS, px: 480 }, { net, store });
  assert.equal(st.images, 2);
  assert.deepEqual(b.frames.map((f) => f.takenAt), [T0 - 10 * MIN, T0 + 10 * MIN]);
});

test('a bigger panel: the same moment again at the bigger size, replacing the smaller', async () => {
  const { st, provider, net } = world();
  const store = memoryStore();
  await readEarth(provider, { now: T0, px: 339 }, { net, store });
  const b = await readEarth(provider, { now: T0 + MIN_GAP_MS, px: 678 }, { net, store });
  assert.equal(st.images, 2);
  assert.equal(b.frames.length, 1);
  assert.equal(b.frames[0]!.px, 678);
});

test('a fixed address (GOES): asked with If-Modified-Since, a 304 downloads nothing', async () => {
  const { st, provider, net } = world({ fixedUrl: true, lastModified: true });
  const store = memoryStore();
  await readEarth(provider, { now: T0, px: 480 }, { net, store });
  await readEarth(provider, { now: T0 + MIN_GAP_MS, px: 480 }, { net, store });
  assert.equal(st.images, 1);
  assert.equal(st.conditional, 1);
});

test('the provider down: the last image stays, marked old after an hour; retries back off', async () => {
  const { st, provider, net } = world();
  const store = memoryStore();
  await readEarth(provider, { now: T0, px: 480 }, { net, store });
  st.down = true;
  const logs: string[] = [];
  let now = T0 + MIN_GAP_MS;
  const a = await readEarth(provider, { now, px: 480, log: (m) => logs.push(m) }, { net, store });
  assert.equal(a.frames.length, 1, 'still the last image');
  assert.equal(a.error, 'HTTP 503');
  assert.ok(logs.some((l) => /next try in 10 min/.test(l)));
  // Backing off: 10, 20, 40 … minutes, never more than 2 h.
  const plans = st.plans;
  await readEarth(provider, { now: now + 5 * MIN, px: 480 }, { net, store });
  assert.equal(st.plans, plans, 'no retry before its time');
  now += 10 * MIN;
  await readEarth(provider, { now, px: 480, log: (m) => logs.push(m) }, { net, store });
  assert.ok(logs.some((l) => /next try in 20 min/.test(l)));
  for (let k = 0; k < 8; k++) {
    now += MAX_BACKOFF_MS;
    await readEarth(provider, { now, px: 480, log: (m) => logs.push(m) }, { net, store });
  }
  assert.ok(logs.at(-1)!.includes('next try in 120 min'));
  const old = await readEarth(provider, { now: T0 + STALE_MS + 20 * MIN, px: 480 }, { net, store });
  assert.equal(old.stale, true);
  // Back up: the error clears.
  st.down = false;
  st.latest = now;
  const ok = await readEarth(provider, { now: now + MAX_BACKOFF_MS, px: 480 }, { net, store });
  assert.equal(ok.error, null);
  assert.equal(ok.frames.at(-1)!.takenAt, now);
});

test('keeps the last few hours, and nothing more on disk', async () => {
  const { st, provider, net } = world();
  const dir = mkdtempSync(join(tmpdir(), 'world-'));
  try {
    const store = fileStore(dir);
    let now = T0;
    for (let k = 0; k < KEEP + 6; k++) {
      st.latest = now - 10 * MIN;
      await readEarth(provider, { now, px: 480 }, { net, store });
      now += MIN_GAP_MS;
    }
    const files = readdirSync(dir).filter((n) => n.startsWith('disk-'));
    assert.equal(files.length, KEEP);
    // A restart: a new store reads the record from disk and asks nothing within the 10 minutes.
    const plans = st.plans;
    const again = await readEarth(provider, { now: now - MIN_GAP_MS + MIN, px: 480 }, { net, store: fileStore(dir) });
    assert.equal(again.frames.length, KEEP);
    assert.equal(st.plans, plans);
    assert.ok(again.frames.every((f) => f.file.startsWith(dir)));
    // Files cleaned behind its back: forgotten, then fetched again when due.
    for (const f of files) unlinkSync(join(dir, f));
    const gone = await readEarth(provider, { now: now - MIN_GAP_MS + 2 * MIN, px: 480 }, { net, store: fileStore(dir) });
    assert.equal(gone.frames.length, 0);
    const back = await readEarth(provider, { now: now + MIN_GAP_MS, px: 480 }, { net, store: fileStore(dir) });
    assert.equal(back.frames.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
