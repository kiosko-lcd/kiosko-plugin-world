import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIGHT_EDGES, lightOf, moonAt, refraction, sunAt, sunAzimuth, sunElevation, unitOf, wrapLon } from './astro.ts';

/**
 * Reference positions from an independent ephemeris (astropy: the sun's
 * apparent place of date, its Greenwich hour angle, its airless elevation),
 * made by scripts/ref_astropy.py. NOAA's calculator is good to about 0.01°
 * against these; our port of its equations must be too.
 */
interface Ref { iso: string; lat: number; lon: number; decl: number; sublon: number; elevation: number; azimuth: number; moonDecl: number; moonLon: number; elongation: number }
const REF = JSON.parse(readFileSync(new URL('./fixtures/astro-ref.json', import.meta.url), 'utf8')) as Ref[];
const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const lonNear = (a: number, b: number, tol: number, msg: string) => near(wrapLon(a - b), 0, tol, msg);

test('the sun: declination, subsolar longitude, elevation and azimuth match the ephemeris', () => {
  for (const r of REF) {
    const at = Date.parse(r.iso);
    const s = sunAt(at);
    near(s.declination, r.decl, 0.01, `declination ${r.iso}`);
    lonNear(s.subLon, r.sublon, 0.02, `subsolar longitude ${r.iso}`);
    near(sunElevation(at, r.lat, r.lon), r.elevation, 0.02, `elevation ${r.iso} ${r.lat},${r.lon}`);
    if (Math.abs(r.elevation) < 89) lonNear(sunAzimuth(at, r.lat, r.lon), r.azimuth, 0.05, `azimuth ${r.iso}`);
  }
});

test('equinoxes and solstices: the sun over the equator, then over the tropics', () => {
  near(sunAt(Date.parse('2024-03-20T03:06Z')).declination, 0, 0.01, 'March equinox');
  near(sunAt(Date.parse('2024-09-22T12:44Z')).declination, 0, 0.01, 'September equinox');
  near(sunAt(Date.parse('2024-06-20T20:51Z')).declination, 23.44, 0.01, 'June solstice');
  near(sunAt(Date.parse('2024-12-21T09:21Z')).declination, -23.44, 0.01, 'December solstice');
  // The equation of time: about +16.4 min early in November, about −14.2 min in mid February (NOAA's tables).
  near(sunAt(Date.parse('2026-11-03T12:00Z')).eqTime, 16.4, 0.15, 'eq. of time, 3 Nov');
  near(sunAt(Date.parse('2026-02-11T12:00Z')).eqTime, -14.2, 0.15, 'eq. of time, 11 Feb');
  // Solar noon at Greenwich on 3 November is about 11:43:35 UTC: the sun is overhead at about 0° then.
  lonNear(sunAt(Date.parse('2026-11-03T11:43:35Z')).subLon, 0, 0.05, 'noon at Greenwich');
});

test('refraction: about 34′ at the horizon, nothing near the zenith', () => {
  near(refraction(0) * 60, 28.9, 1, 'at 0°');
  near(refraction(-0.5) * 60, 34, 2, 'at −0.5°');
  assert.equal(refraction(88), 0);
  assert.ok(sunElevation(Date.parse('2026-11-27T12:00Z'), 40.4, -3.7, { refraction: true }) > sunElevation(Date.parse('2026-11-27T12:00Z'), 40.4, -3.7));
});

test('day and night where they must be', () => {
  // 27 Nov 2026, 12:00 UTC: day in Madrid and Lagos, night in Tokyo, Honolulu and Sydney; polar night in Svalbard, midnight sun at the South Pole.
  const at = Date.parse('2026-11-27T12:00Z');
  const light = (lat: number, lon: number) => lightOf(sunElevation(at, lat, lon));
  assert.equal(light(40.42, -3.7), 'day');
  assert.equal(light(6.52, 3.38), 'day');
  assert.equal(light(35.68, 139.69), 'night');
  assert.equal(light(21.31, -157.86), 'night');
  assert.equal(light(-33.87, 151.21), 'night');
  assert.notEqual(light(78.22, 15.65), 'day');
  assert.equal(light(-89.9, 0), 'day');
  // New York at 12:00 UTC (7:00 local, sunrise about 7:00): around dawn, twilight or the first minutes of day.
  assert.ok(['civil', 'day'].includes(light(40.71, -74.0)), light(40.71, -74.0));
  // The subsolar point is in full day, its antipode in full night.
  const s = sunAt(at);
  assert.equal(lightOf(sunElevation(at, s.declination, s.subLon)), 'day');
  assert.equal(lightOf(sunElevation(at, -s.declination, wrapLon(s.subLon + 180))), 'night');
});

test('twilight bands: civil, nautical, astronomical, by elevation', () => {
  assert.equal(lightOf(10), 'day');
  assert.equal(lightOf(-0.5), 'day');
  assert.equal(lightOf(-1), 'civil');
  assert.equal(lightOf(-5.9), 'civil');
  assert.equal(lightOf(-6.1), 'nautical');
  assert.equal(lightOf(-11.9), 'nautical');
  assert.equal(lightOf(-12.1), 'astronomical');
  assert.equal(lightOf(-17.9), 'astronomical');
  assert.equal(lightOf(-18.1), 'night');
  assert.equal(lightOf(-90), 'night');
  assert.deepEqual(LIGHT_EDGES.map((v) => Math.round((Math.asin(v) * 180) / Math.PI * 1000) / 1000), [-0.833, -6, -12, -18]);
  // Along the equator at an equinox, the bands are 6° wide in longitude: day, then each twilight, then night.
  const at = Date.parse('2024-03-20T03:06Z');
  const s = sunAt(at);
  const seq = [80, 91, 95, 99, 105, 120].map((d) => lightOf(sunElevation(at, 0, wrapLon(s.subLon + d))));
  assert.deepEqual(seq, ['day', 'civil', 'civil', 'nautical', 'astronomical', 'night']);
});

test('the moon: its place and phase within the low-precision series’ error', () => {
  for (const r of REF) {
    const m = moonAt(Date.parse(r.iso));
    near(m.subLat, r.moonDecl, 0.6, `moon declination ${r.iso}`);
    lonNear(m.subLon, r.moonLon, 0.8, `moon longitude ${r.iso}`);
    near(m.elongation, r.elongation, 0.6, `elongation ${r.iso}`);
  }
  // Known phases: full moon 2026-12-24 01:28 UTC, new moon 2026-12-09 00:52 UTC.
  const full = moonAt(Date.parse('2026-12-24T01:28Z'));
  assert.ok(full.illumination > 0.99, `full ${full.illumination}`);
  const nw = moonAt(Date.parse('2026-12-09T00:52Z'));
  assert.ok(nw.illumination < 0.01, `new ${nw.illumination}`);
  assert.equal(moonAt(Date.parse('2026-12-15T00:00Z')).waxing, true);
  assert.equal(moonAt(Date.parse('2026-12-28T00:00Z')).waxing, false);
});

test('unit vectors', () => {
  const v = unitOf(90, 0);
  near(v[2], 1, 1e-12, 'north pole');
  const e = unitOf(0, 90);
  near(e[1], 1, 1e-12, '90°E');
});
