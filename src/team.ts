/**
 * Your team: the cities set (built-in or your own), each with its local
 * time, its offset and whether it is inside its working hours now, in its
 * own time zone and with its own weekend. All local: no network.
 */
import { t, type Localized } from '@kiosko/sdk';
import { CITIES, CITY_IDS, cityById, DEFAULT_TEAM, WEEKEND_DAYS, type Weekend } from './cities.ts';
import { L } from './i18n.ts';

export type Days = 'auto' | 'mon-fri' | 'sun-thu' | 'sat-wed' | 'mon-sat' | 'sun-fri';
export const DAYS: readonly Days[] = ['auto', 'mon-fri', 'sun-thu', 'sat-wed', 'mon-sat', 'sun-fri'];
const DAYS_WEEKEND: Record<Exclude<Days, 'auto'>, Weekend> = { 'mon-fri': 'sat-sun', 'sun-thu': 'fri-sat', 'sat-wed': 'thu-fri', 'mon-sat': 'sun', 'sun-fri': 'sat' };

export const memberOptions = t.object({
  city: t.enum(['custom', ...CITY_IDS] as const, {
    default: 'london',
    label: L('City', 'Ciudad', 'Stadt', '城市', '城市'),
    labels: { custom: L('Other (set below)', 'Otra (indícala abajo)', 'Andere (unten angeben)', '其他（在下方填写）', '其他（在下方填寫）'), ...Object.fromEntries(CITIES.map((c) => [c.id, c.name])) },
  }),
  name: t.string({
    label: L('Name', 'Nombre', 'Name', '名称', '名稱'),
    placeholder: 'Ana · Lisbon',
    help: L(
      'Empty: the city’s name. A person or an office (“Ana”, “HQ”) works too.',
      'Vacío: el nombre de la ciudad. También vale una persona o una oficina («Ana», «Central»).',
      'Leer: der Name der Stadt. Auch eine Person oder ein Büro („Ana“, „Zentrale“).',
      '留空：使用城市名称。也可以填人名或办公室（“Ana”、“总部”）。',
      '留空：使用城市名稱。也可以填人名或辦公室（「Ana」、「總部」）。',
    ),
  }),
  timeZone: t.string({
    label: L('Time zone', 'Zona horaria', 'Zeitzone', '时区', '時區'),
    placeholder: 'Europe/Lisbon',
    help: L('Only for “Other”: an IANA zone name.', 'Solo para «Otra»: el nombre de una zona IANA.', 'Nur für „Andere“: ein IANA-Zonenname.', '仅用于“其他”：IANA 时区名称。', '僅用於「其他」：IANA 時區名稱。'),
  }),
  latitude: t.number({ default: 0, min: -90, max: 90, step: 0.01, label: L('Latitude', 'Latitud', 'Breitengrad', '纬度', '緯度'), advanced: true }),
  longitude: t.number({ default: 0, min: -180, max: 180, step: 0.01, label: L('Longitude', 'Longitud', 'Längengrad', '经度', '經度'), advanced: true }),
  start: t.string({ default: '09:00', format: 'time', label: L('Work starts', 'Empieza', 'Arbeitsbeginn', '上班时间', '上班時間') }),
  end: t.string({ default: '18:00', format: 'time', label: L('Work ends', 'Termina', 'Arbeitsende', '下班时间', '下班時間') }),
  days: t.enum(DAYS, {
    default: 'auto',
    label: L('Working days', 'Días laborables', 'Arbeitstage', '工作日', '工作日'),
    labels: {
      auto: L('As usual there', 'Los habituales allí', 'Wie dort üblich', '按当地习惯', '依當地習慣'),
      'mon-fri': L('Monday to Friday', 'De lunes a viernes', 'Montag bis Freitag', '周一至周五', '週一至週五'),
      'sun-thu': L('Sunday to Thursday', 'De domingo a jueves', 'Sonntag bis Donnerstag', '周日至周四', '週日至週四'),
      'sat-wed': L('Saturday to Wednesday', 'De sábado a miércoles', 'Samstag bis Mittwoch', '周六至周三', '週六至週三'),
      'mon-sat': L('Monday to Saturday', 'De lunes a sábado', 'Montag bis Samstag', '周一至周六', '週一至週六'),
      'sun-fri': L('Sunday to Friday', 'De domingo a viernes', 'Sonntag bis Freitag', '周日至周五', '週日至週五'),
    },
  }),
});

export type Member = { city: string; name: string; timeZone: string; latitude: number; longitude: number; start: string; end: string; days: Days };

/** A city of the team, resolved. */
export interface TeamCity {
  key: string;
  /** Its name: localized for built-in cities, as typed otherwise. */
  name: Localized | string;
  timeZone: string;
  /** Unset for a city of your own without coordinates: it has no dot on the map. */
  lat?: number;
  lon?: number;
  /** Working weekdays, 0 = Sunday. */
  workDays: number[];
  startMin: number;
  endMin: number;
}

const minutesOf = (hhmm: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return fallback;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : fallback;
};

export function validZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The team from the options; the default team when none is set. Members without a usable zone are left out. */
export function resolveTeam(members: Member[] | undefined): TeamCity[] {
  const list: Member[] = members?.length ? members : DEFAULT_TEAM.map((city) => ({ city, name: '', timeZone: '', latitude: 0, longitude: 0, start: '09:00', end: '18:00', days: 'auto' }));
  const out: TeamCity[] = [];
  list.forEach((m, i) => {
    const b = m.city !== 'custom' ? cityById(m.city) : undefined;
    const timeZone = b?.timeZone ?? m.timeZone.trim();
    if (!validZone(timeZone)) return;
    const own = !b && (m.latitude !== 0 || m.longitude !== 0);
    const weekend: Weekend = m.days === 'auto' ? (b?.weekend ?? 'sat-sun') : DAYS_WEEKEND[m.days];
    const off = WEEKEND_DAYS[weekend];
    out.push({
      key: `${i}:${b?.id ?? timeZone}`,
      name: m.name.trim() || b?.name || timeZone.split('/').pop()!.replace(/_/g, ' '),
      timeZone,
      ...(b ? { lat: b.lat, lon: b.lon } : own ? { lat: m.latitude, lon: m.longitude } : {}),
      workDays: [0, 1, 2, 3, 4, 5, 6].filter((d) => !off.includes(d)),
      startMin: minutesOf(m.start, 9 * 60),
      endMin: minutesOf(m.end, 18 * 60),
    });
  });
  return out;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    formatters.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
  /** Minutes ahead of UTC (Kathmandu: 345). */
  offset: number;
}

/** The wall clock in a time zone at `at`. */
export function zonedTime(at: number, tz: string): ZonedTime {
  const parts = formatter(tz).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const n = (type: string) => Number(get(type));
  const z = { year: n('year'), month: n('month'), day: n('day'), hour: n('hour') % 24, minute: n('minute'), second: n('second'), weekday: WD[get('weekday')] ?? 0 };
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return { ...z, offset: Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000) };
}

/**
 * `at` moved so that this computer's local clock reads what a clock in
 * `tz` reads: what `ctx.fmt.time` needs to write another zone's time in the
 * reader's language and format.
 */
export function wallClock(at: number, tz: string): number {
  const z = zonedTime(at, tz);
  return new Date(z.year, z.month - 1, z.day, z.hour, z.minute, z.second, ((at % 1000) + 1000) % 1000).getTime();
}

/** At work, about to start or just finished (within the hour), off, or a day off. */
export type Status = 'work' | 'edge' | 'off' | 'weekend';

export interface CityNow {
  city: TeamCity;
  local: ZonedTime;
  status: Status;
  /** Days from the reader's own date (−1, 0, +1). */
  dayDiff: number;
}

export const EDGE_MIN = 60;

export function statusAt(c: TeamCity, z: ZonedTime): Status {
  const mins = z.hour * 60 + z.minute;
  const works = (wd: number) => c.workDays.includes(((wd % 7) + 7) % 7);
  const { startMin: s, endMin: e } = c;
  if (e > s) {
    if (!works(z.weekday)) return 'weekend';
    if (mins >= s && mins < e) return 'work';
    return (mins >= s - EDGE_MIN && mins < s) || (mins >= e && mins < e + EDGE_MIN) ? 'edge' : 'off';
  }
  // A night shift (22:00–06:00): its morning belongs to the day before.
  if (mins >= s && works(z.weekday)) return 'work';
  if (mins < e && works(z.weekday - 1)) return 'work';
  if (!works(z.weekday) && !(mins < e + EDGE_MIN && works(z.weekday - 1))) return 'weekend';
  return 'off';
}

/** Every city now, east of the date line last: sorted by offset, then by name. */
export function teamNow(cities: TeamCity[], at: number, here = 'UTC'): CityNow[] {
  const h = zonedTime(at, validZone(here) ? here : 'UTC');
  const hereDay = Date.UTC(h.year, h.month - 1, h.day);
  return cities
    .map((city) => {
      const local = zonedTime(at, city.timeZone);
      const dayDiff = Math.round((Date.UTC(local.year, local.month - 1, local.day) - hereDay) / 86_400_000);
      return { city, local, status: statusAt(city, local), dayDiff };
    })
    .sort((a, b) => a.local.offset - b.local.offset || String(typeof a.city.name === 'string' ? a.city.name : a.city.name.en).localeCompare(String(typeof b.city.name === 'string' ? b.city.name : b.city.name.en)));
}

/** The machine's time zone. */
export const machineZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** `+5:30`, `−3`, `±0` from minutes. */
export function offsetLabel(mins: number): string {
  if (mins === 0) return '±0';
  const sign = mins > 0 ? '+' : '−';
  const a = Math.abs(mins);
  return `${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}
