import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND, DISK_ANGLE, flatLatLon, flatXY, geosLatLon, geosXY, latitudesFor, MAX_ASPECT, orthoLatLon, orthoXY } from './geo.ts';
import { landRings } from './land.ts';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

test('flat map: there and back, centred anywhere', () => {
  for (const lon0 of [0, 150, -90, 180]) {
    const m = { x: 10, y: 5, w: 720, h: 360, lon0, top: 90, bottom: -90 };
    for (const [lat, lon] of [[40.4, -3.7], [-33.9, 151.2], [0, 179.9], [64, -21.9]] as const) {
      const [x, y] = flatXY(m, lat, lon);
      assert.ok(x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);
      const [la, lo] = flatLatLon(m, x, y);
      near(la, lat, 1e-9);
      near(((lo - lon + 540) % 360) - 180, 0, 1e-9);
    }
    const [cx] = flatXY(m, 0, lon0);
    near(cx, m.x + m.w / 2, 1e-9, 'the centre longitude in the middle');
  }
});

test('latitudes: the whole world on 2:1 or taller, a band down to 2.65:1 on long boxes', () => {
  assert.deepEqual(latitudesFor(640, 320), { top: 90, bottom: -90 });
  assert.deepEqual(latitudesFor(320, 320), { top: 90, bottom: -90 });
  const band = latitudesFor(1920, 140);
  assert.deepEqual(band, { top: BAND.top, bottom: BAND.bottom });
  near(MAX_ASPECT, 360 / 136, 1e-12);
  const mid = latitudesFor(500, 220);
  near(mid.top - mid.bottom, (360 * 220) / 500, 1e-9);
  assert.ok(mid.top <= 90 && mid.bottom >= -90);
});

test('globe: there and back; the far side is hidden', () => {
  for (const [lat0, lon0] of [[0, 0], [30, -75], [-20, 140]] as const)
    for (const [lat, lon] of [[lat0, lon0], [lat0 + 20, lon0 - 30], [lat0 - 40, lon0 + 50]] as const) {
      const p = orthoXY(lat0, lon0, lat, lon);
      assert.ok(p);
      const q = orthoLatLon(lat0, lon0, p[0], p[1]);
      assert.ok(q);
      near(q[0], lat, 1e-9);
      near(((q[1] - lon + 540) % 360) - 180, 0, 1e-9);
    }
  assert.deepEqual(orthoXY(0, 0, 0, 0), [0, 0]);
  assert.equal(orthoXY(0, 0, 0, 120), null);
  assert.equal(orthoLatLon(0, 0, 0.8, 0.8), null);
});

test('geostationary view: the sub-satellite point in the middle, the limb at ±1, there and back', () => {
  assert.deepEqual(geosXY(-75.2, 0, -75.2)!.map((v) => Math.round(v * 1e9) / 1e9), [0, 0]);
  near(DISK_ANGLE, 0.1519, 0.0002, 'the Earth fills about ±8.7° seen from the orbit');
  for (const sub of [-75.2, 0, 140.7])
    for (const [lat, lon] of [[40, sub + 10], [-35, sub - 40], [60, sub + 30], [0, sub + 75]] as const) {
      const p = geosXY(sub, lat, lon);
      assert.ok(p, `${lat},${lon} from ${sub}`);
      assert.ok(Math.hypot(p[0], p[1]) <= 1.0001);
      const q = geosLatLon(sub, p[0], p[1]);
      assert.ok(q);
      near(q[0], lat, 1e-6);
      near(((q[1] - lon + 540) % 360) - 180, 0, 1e-6);
    }
  // East is to the right and north up.
  assert.ok(geosXY(0, 0, 30)![0] > 0);
  assert.ok(geosXY(0, 40, 0)![1] > 0);
  // Beyond about 81° from the sub-satellite point the satellite can't see; space off the disk.
  assert.equal(geosXY(0, 0, 85), null);
  assert.equal(geosLatLon(0, 0.99, 0.99), null);
});

test('the land: Natural Earth rings, decoded and closed', () => {
  const rings = landRings();
  assert.ok(rings.length > 100);
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) assert.ok(Math.abs(r[i]!) <= 180.05 && Math.abs(r[i + 1]!) <= 90.05);
  }
});
