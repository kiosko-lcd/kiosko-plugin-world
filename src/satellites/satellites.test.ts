import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Net } from '../net.ts';
import { resolveSatellite } from '../sources.ts';
import { capsUrl, getMapUrl, meteosat, meteosatIodc, parseWmsTime, sideFor } from './eumetsat.ts';
import { GOES_BAR, goesEast, goesSize, goesTakenAt, goesUrl, goesWest } from './goes.ts';
import { closestTo, lonOfOffset, PROVIDERS, SAT_IDS } from './index.ts';
import { himawari, JMA_PAGE, jmaUrl, parseJmaLatest } from './jma.ts';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** A network that answers text from a table and counts what was asked. */
function fakeNet(texts: Record<string, string>): Net & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async text(url) {
      asked.push(url);
      const t = texts[url];
      if (t === undefined) throw new Error(`unexpected ${url}`);
      return t;
    },
    async image() {
      throw new Error('no images here');
    },
  };
}

test('the satellite over a longitude: the one hanging closest', () => {
  const cases: [number, string][] = [
    [-3.7, 'meteosat'], // Madrid
    [13.4, 'meteosat'], // Berlin
    [-74, 'goes-east'], // New York
    [-46.6, 'goes-east'], // São Paulo
    [-122.4, 'goes-west'], // San Francisco
    [-157.9, 'goes-west'], // Honolulu
    [77.2, 'meteosat-iodc'], // Delhi
    [55.3, 'meteosat-iodc'], // Dubai
    [139.7, 'himawari'], // Tokyo
    [151.2, 'himawari'], // Sydney
    [121.5, 'himawari'], // Shanghai
    [174.8, 'himawari'], // Auckland (39.3° from Himawari, 47.9° from GOES-West)
    [-170, 'goes-west'],
  ];
  for (const [lon, sat] of cases) assert.equal(closestTo(lon), sat, `${lon}`);
  assert.equal(lonOfOffset(60), 15);
  assert.equal(lonOfOffset(-300), -75);
  assert.equal(lonOfOffset(780), -165, 'UTC+13 is past the date line');
});

test('auto: from the place in Settings, else from the time zone; or the one chosen', () => {
  assert.equal(resolveSatellite('auto', { longitude: -3.7 }, 0), 'meteosat');
  assert.equal(resolveSatellite('auto', { longitude: 139.7 }, 0), 'himawari');
  assert.equal(resolveSatellite('goes-west', { longitude: 0 }, 0), 'goes-west');
  assert.equal(resolveSatellite('nonsense', undefined, 0), 'meteosat');
  assert.ok(SAT_IDS.includes(resolveSatellite('auto', undefined, Date.now())));
});

test('every provider: hosts, a credit and a place', () => {
  for (const id of SAT_IDS) {
    const p = PROVIDERS[id];
    assert.equal(p.id, id);
    assert.ok(p.hosts.length && p.hosts.every((h) => /^[a-z0-9.-]+$/.test(h)));
    assert.ok(p.credit(2026).length > 3);
    assert.ok(p.creditLong(2026).length >= p.credit(2026).length);
    assert.ok(Math.abs(p.subLon) <= 180);
  }
  assert.ok(himawari.creditLong(2026).includes('Japan Meteorological Agency'));
  assert.ok(himawari.credit(2026).includes('CSU/CIRA'));
  assert.ok(meteosat.creditLong(2026).includes('Contains modified EUMETSAT Meteosat data 2026'));
  assert.ok(goesEast.creditLong(2026).includes('public domain'));
});

test('GOES: a fixed address per size, the smallest that is big enough, its caption bar hidden', async () => {
  assert.equal(goesSize(200), 339);
  assert.equal(goesSize(480), 678);
  assert.equal(goesSize(678), 678);
  assert.equal(goesSize(900), 1808);
  assert.equal(goesSize(5000), 1808);
  assert.equal(goesUrl('GOES-19', 480), 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/678x678.jpg');
  assert.equal(goesUrl('GOES-18', 300), 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/339x339.jpg');
  const net = fakeNet({});
  const shot = await goesWest.plan(net, 480, { now: 0 });
  assert.deepEqual(shot, { url: 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/678x678.jpg', takenAt: null, px: 678, kind: 'disk', frame: { scale: 1, maskBottom: GOES_BAR[678] } });
  assert.equal(net.asked.length, 0, 'no request before the image');
  // Taken: the 10-minute slot that starts 12 or more minutes before the file reached the site.
  assert.equal(goesTakenAt(Date.parse('2026-11-27T08:04:44Z')), Date.parse('2026-11-27T07:50:00Z'));
  assert.equal(goesTakenAt(Date.parse('2026-11-27T08:13:41Z')), Date.parse('2026-11-27T08:00:00Z'));
});

test('Himawari: the latest time from the JMA page, across midnight too', async () => {
  const html = fixture('jma-fd.html');
  assert.deepEqual(parseJmaLatest(html), { hhmm: '0730', takenAt: Date.parse('2026-11-27T07:30:00Z') });
  // The scan from 23:50 is labelled with its end, 00:00 of the next day.
  assert.deepEqual(parseJmaLatest('<option value=2350>00:00 UTC 27 November 2026</option>'), { hhmm: '2350', takenAt: Date.parse('2026-11-26T23:50:00Z') });
  assert.deepEqual(parseJmaLatest('<option value="0000">00:10 UTC 1 January 2027</option>'), { hhmm: '0000', takenAt: Date.parse('2027-01-01T00:00:00Z') });
  assert.equal(parseJmaLatest('<html>maintenance</html>'), null);
  assert.equal(jmaUrl('0730'), 'https://www.data.jma.go.jp/mscweb/data/himawari/img/fd_/fd__trm_0730.jpg');
  const net = fakeNet({ [JMA_PAGE]: html });
  const shot = await himawari.plan(net, 480, { now: 0 });
  assert.equal(shot.url, jmaUrl('0730'));
  assert.equal(shot.takenAt, Date.parse('2026-11-27T07:30:00Z'));
  assert.equal(shot.kind, 'disk');
  assert.ok(shot.frame!.scale < 1 && shot.frame!.scale > 0.9);
  await assert.rejects(himawari.plan(fakeNet({ [JMA_PAGE]: '<html></html>' }), 480, { now: 0 }), /no image listed/);
});

test('Meteosat: the latest time from the layer’s capabilities, then a GetMap around the satellite', async () => {
  const xml = fixture('eumetview-mtg-geocolour-caps.xml');
  assert.equal(parseWmsTime(xml), Date.parse('2026-11-27T07:30:00Z'));
  assert.equal(parseWmsTime('<WMS_Capabilities/>'), null);
  assert.equal(capsUrl('mtg_fd:rgb_geocolour'), 'https://view.eumetsat.int/geoserver/mtg_fd/rgb_geocolour/ows?service=WMS&version=1.3.0&request=GetCapabilities');
  const { url, bbox } = getMapUrl('msg_iodc:rgb_naturalenhncd', 45.5, Date.parse('2026-11-27T07:45:00Z'), 816);
  const u = new URL(url);
  assert.equal(u.host, 'view.eumetsat.int');
  assert.equal(u.searchParams.get('layers'), 'msg_iodc:rgb_naturalenhncd');
  assert.equal(u.searchParams.get('crs'), 'CRS:84');
  assert.equal(u.searchParams.get('bbox'), '-36.00,-81.50,127.00,81.50');
  assert.equal(u.searchParams.get('time'), '2026-11-27T07:45:00Z');
  assert.equal(u.searchParams.get('width'), '816');
  assert.equal(u.searchParams.get('bgcolor'), '0x000000');
  assert.deepEqual(bbox, { west: -36, south: -81.5, east: 127, north: 81.5 });
  assert.equal(sideFor(480), 816);
  assert.equal(sideFor(100), 400);
  assert.equal(sideFor(5000), 2048);
  const net = fakeNet({ [capsUrl('mtg_fd:rgb_geocolour')]: xml });
  const shot = await meteosat.plan(net, 480, { now: 0 });
  assert.equal(shot.kind, 'latlon');
  assert.equal(shot.takenAt, Date.parse('2026-11-27T07:30:00Z'));
  assert.equal(new URL(shot.url).searchParams.get('layers'), 'mtg_fd:rgb_geocolour');
  assert.equal(meteosatIodc.subLon, 45.5);
});
