/**
 * Where the sun and the moon are, computed here, with no network.
 *
 * The sun: NOAA's solar calculator equations (Jean Meeus, "Astronomical
 * Algorithms"; the ones behind https://gml.noaa.gov/grad/solcalc/), good to
 * about 0.01° in declination and a few seconds in the equation of time
 * between 1800 and 2100. `@loksly/weather-astro` has sunrise and sunset
 * with a shorter series, but neither the declination, the subsolar point nor
 * the moon's place: they are here.
 *
 * The moon: the low-precision series of the Astronomical Almanac (a few
 * tenths of a degree), enough to put it on a map and draw its phase.
 *
 * Angles are in degrees unless the name says otherwise; times are epoch ms.
 */
const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** -180 … 180. */
export const wrapLon = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

export const julianDay = (at: number): number => at / 86_400_000 + 2_440_587.5;
const centuries = (at: number) => (julianDay(at) - 2_451_545) / 36_525;

export interface SunState {
  /** Declination: the latitude of the subsolar point. */
  declination: number;
  /** Equation of time, minutes (apparent minus mean solar time). */
  eqTime: number;
  /** Longitude where the sun is overhead now. */
  subLon: number;
  /** Apparent ecliptic longitude (for the moon's phase). */
  eclipticLon: number;
}

/** The sun at `at`: NOAA's formulas. */
export function sunAt(at: number): SunState {
  const T = centuries(at);
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * cos(omega);
  const declination = Math.asin(sin(eps) * sin(lambda)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    (4 / RAD) * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0) - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M));
  const d = new Date(at);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60_000;
  return { declination, eqTime, subLon: wrapLon((720 - utcMin - eqTime) / 4), eclipticLon: norm360(lambda) };
}

/** NOAA's refraction correction, degrees to add to a geometric elevation. */
export function refraction(elev: number): number {
  if (elev > 85) return 0;
  const te = Math.tan(elev * RAD);
  let c: number;
  if (elev > 5) c = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) c = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else c = -20.774 / te;
  return c / 3600;
}

/** A unit vector in the Earth's frame: x to (0°, 0°), y to (0°, 90°E), z to the north pole. */
export type Vec3 = [number, number, number];

export const unitOf = (lat: number, lon: number): Vec3 => [cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)];

/** The direction of the sun from the Earth's centre (the subsolar point). */
export function sunVector(at: number): Vec3 {
  const s = sunAt(at);
  return unitOf(s.declination, s.subLon);
}

/** Elevation of the sun over the horizon at a place: geometric (airless), or as seen with refraction. */
export function sunElevation(at: number, lat: number, lon: number, o: { refraction?: boolean } = {}): number {
  const s = sunAt(at);
  const p = unitOf(lat, lon), v = unitOf(s.declination, s.subLon);
  const el = Math.asin(Math.max(-1, Math.min(1, p[0] * v[0] + p[1] * v[1] + p[2] * v[2]))) / RAD;
  return o.refraction ? el + refraction(el) : el;
}

/** Azimuth of the sun, degrees clockwise from north. */
export function sunAzimuth(at: number, lat: number, lon: number): number {
  const s = sunAt(at);
  const H = (lon - s.subLon) * RAD;
  const d = s.declination * RAD, f = lat * RAD;
  return norm360(Math.atan2(-Math.sin(H), Math.cos(f) * Math.tan(d) - Math.sin(f) * Math.cos(H)) / RAD);
}

export type Light = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';
export const LIGHTS: readonly Light[] = ['day', 'civil', 'nautical', 'astronomical', 'night'];

/**
 * The light at a geometric solar elevation: day while the sun's upper limb
 * is up (−0.833°, refraction and the disc's radius), then civil twilight to
 * −6°, nautical to −12°, astronomical to −18°, then night.
 */
export function lightOf(elevation: number): Light {
  if (elevation > -0.833) return 'day';
  if (elevation > -6) return 'civil';
  if (elevation > -12) return 'nautical';
  if (elevation > -18) return 'astronomical';
  return 'night';
}

/** Sines of the band edges, for per-pixel tests without `asin`. */
export const LIGHT_EDGES = [-0.833, -6, -12, -18].map((d) => Math.sin(d * RAD));

/** Greenwich mean sidereal time, degrees. */
export function gmst(at: number): number {
  const jd = julianDay(at), T = (jd - 2_451_545) / 36_525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2_451_545) + 0.000387933 * T * T - (T * T * T) / 38_710_000);
}

export interface MoonState {
  /** Where the moon is overhead now. */
  subLat: number;
  subLon: number;
  /** Lit fraction of the disc, 0 (new) … 1 (full). */
  illumination: number;
  /** Growing (first half of the cycle). */
  waxing: boolean;
  /** 0 … 1 through the cycle from new moon. */
  phase: number;
  /** Angle sun–moon from the Earth. */
  elongation: number;
}

/** The moon at `at`: the Astronomical Almanac's low-precision series. */
export function moonAt(at: number): MoonState {
  const T = centuries(at);
  const lam = norm360(
    218.32 + 481267.881 * T + 6.29 * sin(134.9 + 477198.85 * T) - 1.27 * sin(259.2 - 413335.38 * T) + 0.66 * sin(235.7 + 890534.23 * T) +
      0.21 * sin(269.9 + 954397.7 * T) - 0.19 * sin(357.5 + 35999.05 * T) - 0.11 * sin(186.6 + 966404.05 * T),
  );
  const beta = 5.13 * sin(93.3 + 483202.03 * T) + 0.28 * sin(228.2 + 960400.87 * T) - 0.28 * sin(318.3 + 6003.18 * T) - 0.17 * sin(217.6 - 407332.2 * T);
  const eps = 23.439 - 0.0130042 * T;
  const ra = norm360(Math.atan2(sin(lam) * cos(eps) - Math.tan(beta * RAD) * sin(eps), cos(lam)) / RAD);
  const dec = Math.asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lam)) / RAD;
  const sun = sunAt(at);
  const dl = norm360(lam - sun.eclipticLon);
  const elongation = Math.acos(Math.max(-1, Math.min(1, cos(beta) * cos(dl)))) / RAD;
  return {
    subLat: dec,
    subLon: wrapLon(ra - gmst(at)),
    illumination: (1 - cos(elongation)) / 2,
    waxing: dl < 180,
    phase: dl / 360,
    elongation,
  };
}
