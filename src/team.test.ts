import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, cityById, DEFAULT_TEAM } from './cities.ts';
import { LANGUAGES } from './i18n.ts';
import { offsetLabel, resolveTeam, statusAt, teamNow, validZone, wallClock, zonedTime, type Member, type TeamCity } from './team.ts';

const member = (city: string, o: Partial<Member> = {}): Member => ({ city, name: '', timeZone: '', latitude: 0, longitude: 0, start: '09:00', end: '18:00', days: 'auto', ...o });
const one = (m: Member): TeamCity => resolveTeam([m])[0]!;
const at = (iso: string) => Date.parse(iso);
const status = (c: TeamCity, iso: string) => statusAt(c, zonedTime(at(iso), c.timeZone));

test('built-in cities: valid zones, places, and names in all five languages', () => {
  assert.ok(CITIES.length >= 60);
  const ids = new Set<string>();
  for (const c of CITIES) {
    assert.ok(!ids.has(c.id), c.id);
    ids.add(c.id);
    assert.ok(validZone(c.timeZone), c.timeZone);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180);
    for (const l of LANGUAGES) assert.ok((c.name as Record<string, string>)[l], `${c.id} ${l}`);
  }
  assert.equal((cityById('tokyo')!.name as Record<string, string>)['zh-Hant'], '東京');
  assert.equal((cityById('munich')!.name as Record<string, string>).de, 'München');
  for (const id of DEFAULT_TEAM) assert.ok(cityById(id), id);
});

test('working hours: 9 to 18 on weekdays by default, amber an hour either side, a ring at weekends', () => {
  const madrid = one(member('madrid'));
  // Friday 27 Nov 2026 (CET, UTC+1).
  assert.equal(status(madrid, '2026-11-27T07:30Z'), 'edge'); // 8:30
  assert.equal(status(madrid, '2026-11-27T08:00Z'), 'work'); // 9:00
  assert.equal(status(madrid, '2026-11-27T16:59Z'), 'work'); // 17:59
  assert.equal(status(madrid, '2026-11-27T17:00Z'), 'edge'); // 18:00
  assert.equal(status(madrid, '2026-11-27T18:30Z'), 'off'); // 19:30
  assert.equal(status(madrid, '2026-11-28T10:00Z'), 'weekend'); // Saturday
});

test('summer time: the same UTC instant is work in July and not yet in January (London)', () => {
  const london = one(member('london'));
  assert.equal(status(london, '2026-07-15T08:30Z'), 'work'); // 9:30 BST
  assert.equal(status(london, '2026-01-14T08:30Z'), 'edge'); // 8:30 GMT
  assert.equal(zonedTime(at('2026-07-15T08:30Z'), 'Europe/London').offset, 60);
  assert.equal(zonedTime(at('2026-01-14T08:30Z'), 'Europe/London').offset, 0);
  // The southern hemisphere the other way round: Sydney is +11 in January, +10 in July.
  assert.equal(zonedTime(at('2026-01-14T00:00Z'), 'Australia/Sydney').offset, 660);
  assert.equal(zonedTime(at('2026-07-14T00:00Z'), 'Australia/Sydney').offset, 600);
});

test('other weekends: Riyadh works on Sunday and rests on Friday; Dubai the other way; Tehran rests on Thursday', () => {
  const riyadh = one(member('riyadh')), dubai = one(member('dubai')), tehran = one(member('tehran'));
  // Friday 27 Nov 2026, 10:00 in Riyadh (UTC+3) and 11:00 in Dubai (UTC+4).
  assert.equal(status(riyadh, '2026-11-27T07:00Z'), 'weekend');
  assert.equal(status(dubai, '2026-11-27T07:00Z'), 'work');
  // Sunday 29 Nov.
  assert.equal(status(riyadh, '2026-11-29T07:00Z'), 'work');
  assert.equal(status(dubai, '2026-11-29T07:00Z'), 'weekend');
  // Thursday 26 Nov, 11:00 in Tehran (UTC+3:30).
  assert.equal(status(tehran, '2026-11-26T07:30Z'), 'weekend');
  // Chosen by hand: Monday to Saturday in Madrid.
  assert.equal(status(one(member('madrid', { days: 'mon-sat' })), '2026-11-28T10:00Z'), 'work');
  assert.equal(status(one(member('madrid', { days: 'sun-thu' })), '2026-11-27T10:00Z'), 'weekend');
});

test('own hours and night shifts', () => {
  const late = one(member('new-york', { start: '10:30', end: '19:00' }));
  assert.equal(status(late, '2026-11-27T15:00Z'), 'edge'); // 10:00 EST, before 10:30
  assert.equal(status(late, '2026-11-27T16:00Z'), 'work'); // 11:00
  assert.equal(status(late, '2026-11-28T00:30Z'), 'edge'); // 19:30, Friday still
  const night = one(member('london', { start: '22:00', end: '06:00' }));
  assert.equal(status(night, '2026-11-26T23:00Z'), 'work'); // Thursday 23:00
  assert.equal(status(night, '2026-11-27T03:00Z'), 'work'); // Friday 3:00, Thursday's shift
  assert.equal(status(night, '2026-11-28T03:00Z'), 'work'); // Saturday 3:00, Friday's shift
  assert.equal(status(night, '2026-11-29T03:00Z'), 'weekend'); // Sunday 3:00, after Saturday: no shift
  assert.equal(status(night, '2026-11-27T12:00Z'), 'off');
});

test('offsets, sorting, the day ahead or behind', () => {
  assert.equal(zonedTime(at('2026-11-27T12:00Z'), 'Asia/Kathmandu').offset, 345);
  assert.equal(zonedTime(at('2026-11-27T12:00Z'), 'Australia/Adelaide').offset, 630);
  assert.equal(zonedTime(at('2026-11-27T12:00Z'), 'Asia/Kolkata').offset, 330);
  assert.equal(offsetLabel(345), '+5:45');
  assert.equal(offsetLabel(-300), '−5');
  assert.equal(offsetLabel(0), '±0');
  const team = resolveTeam(['tokyo', 'san-francisco', 'london', 'kathmandu', 'auckland'].map((c) => member(c)));
  const now = teamNow(team, at('2026-11-27T20:00Z'), 'Europe/Madrid');
  assert.deepEqual(now.map((c) => c.city.timeZone), ['America/Los_Angeles', 'Europe/London', 'Asia/Kathmandu', 'Asia/Tokyo', 'Pacific/Auckland']);
  // 21:00 Friday in Madrid: Kathmandu (1:45), Tokyo and Auckland are already on Saturday.
  assert.deepEqual(now.map((c) => c.dayDiff), [0, 0, 1, 1, 1]);
});

test('your own cities, a name of your own, and what is left out', () => {
  const team = resolveTeam([
    member('custom', { name: 'Ana', timeZone: 'Europe/Lisbon', latitude: 41.15, longitude: -8.61 }),
    member('custom', { timeZone: 'America/Argentina/Cordoba' }),
    member('custom', { timeZone: 'Mars/Olympus_Mons' }),
    member('tokyo', { name: 'HQ' }),
  ]);
  assert.equal(team.length, 3, 'the unknown zone is left out');
  assert.equal(team[0]!.name, 'Ana');
  assert.equal(team[0]!.lat, 41.15);
  assert.equal(team[1]!.name, 'Cordoba');
  assert.equal(team[1]!.lat, undefined, 'no coordinates: no dot on the map');
  assert.equal(team[2]!.name, 'HQ');
  assert.equal(resolveTeam([]).length, DEFAULT_TEAM.length, 'none set: the default team');
});

test('wall clock: this machine’s clock reads the zone’s time', () => {
  const t = wallClock(at('2026-11-27T12:34:56Z'), 'Asia/Tokyo');
  const d = new Date(t);
  assert.deepEqual([d.getHours(), d.getMinutes(), d.getSeconds()], [21, 34, 56]);
});
