/**
 * Projections: the flat map (equirectangular, centred on any longitude and
 * cut to a band of latitudes), the globe (orthographic) and the view from a
 * geostationary satellite (to reproject an image given in latitude and
 * longitude into a full disk, and to find a place on a disk).
 */
import { wrapLon } from './astro.ts';

const RAD = Math.PI / 180;

/** A flat map in a rectangle: longitudes `lon0 - 180 … lon0 + 180` across, latitudes `top … bottom` down. */
export interface FlatMap {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Longitude in the middle. */
  lon0: number;
  top: number;
  bottom: number;
}

export function flatXY(m: FlatMap, lat: number, lon: number): [number, number] {
  return [m.x + ((wrapLon(lon - m.lon0) + 180) / 360) * m.w, m.y + ((m.top - lat) / (m.top - m.bottom)) * m.h];
}

export function flatLatLon(m: FlatMap, x: number, y: number): [number, number] {
  return [m.top - ((y - m.y) / m.h) * (m.top - m.bottom), wrapLon(m.lon0 - 180 + ((x - m.x) / m.w) * 360)];
}

/**
 * The latitudes a flat map shows for a shape: the whole world (2:1) where
 * the box is at least half as tall as wide; for wider boxes, a band cut down
 * to −58° … 78° (where people live, 2.65:1) and no further.
 */
export const FULL = { top: 90, bottom: -90 } as const;
export const BAND = { top: 78, bottom: -58 } as const;
export const MAX_ASPECT = 360 / (BAND.top - BAND.bottom);

export function latitudesFor(w: number, h: number): { top: number; bottom: number } {
  const span = Math.max(BAND.top - BAND.bottom, Math.min(180, (360 * h) / w));
  if (span >= 180) return { ...FULL };
  // Grow the band evenly from its middle (10°N), within the poles.
  const mid = (BAND.top + BAND.bottom) / 2;
  let top = mid + span / 2, bottom = mid - span / 2;
  if (top > 90) [top, bottom] = [90, 90 - span];
  if (bottom < -90) [top, bottom] = [-90 + span, -90];
  return { top, bottom };
}

/** Orthographic globe of radius 1 seen above (lat0, lon0): (u, v) with v up, or null on the far side. */
export function orthoXY(lat0: number, lon0: number, lat: number, lon: number): [number, number] | null {
  const f = lat * RAD, f0 = lat0 * RAD, dl = (lon - lon0) * RAD;
  const c = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(dl);
  if (c < 0) return null;
  return [Math.cos(f) * Math.sin(dl), Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(dl)];
}

/** The inverse: the place at (u, v) on the unit disc, or null off the globe. */
export function orthoLatLon(lat0: number, lon0: number, u: number, v: number): [number, number] | null {
  const r2 = u * u + v * v;
  if (r2 > 1) return null;
  const z = Math.sqrt(1 - r2);
  const f0 = lat0 * RAD;
  const lat = Math.asin(Math.max(-1, Math.min(1, z * Math.sin(f0) + v * Math.cos(f0)))) / RAD;
  const lon = lon0 + Math.atan2(u, z * Math.cos(f0) - v * Math.sin(f0)) / RAD;
  return [lat, wrapLon(lon)];
}

/** Geostationary orbit radius and the Earth's equatorial radius, km. */
export const GEO_R = 42_164.16;
export const EARTH_R = 6_378.137;
/** Half the angle the Earth fills seen from the orbit: the edge of a full-disk image. */
export const DISK_ANGLE = Math.asin(EARTH_R / GEO_R);

/**
 * A place seen from a geostationary satellite over `subLon`: its scan
 * angles over `DISK_ANGLE`, so the disk's edge is at ±1 (x east, y north),
 * or null if the satellite can't see it. A sphere: the 0.3 % flattening is
 * well under a pixel at the sizes drawn here.
 */
export function geosXY(subLon: number, lat: number, lon: number): [number, number] | null {
  const f = lat * RAD, dl = (lon - subLon) * RAD;
  const px = EARTH_R * Math.cos(f) * Math.cos(dl), py = EARTH_R * Math.cos(f) * Math.sin(dl), pz = EARTH_R * Math.sin(f);
  // Seen at all: in front of the tangent cone.
  if (px * GEO_R < EARTH_R * EARTH_R) return null;
  const dx = px - GEO_R;
  return [Math.atan2(py, -dx) / DISK_ANGLE, Math.atan2(pz, Math.hypot(dx, py)) / DISK_ANGLE];
}

/** The inverse: the place under scan angles (x, y) over `DISK_ANGLE`, or null for space. */
export function geosLatLon(subLon: number, x: number, y: number): [number, number] | null {
  const ax = x * DISK_ANGLE, ay = y * DISK_ANGLE;
  const d0 = -Math.cos(ay) * Math.cos(ax), d1 = Math.cos(ay) * Math.sin(ax), d2 = Math.sin(ay);
  // |S + t·d|² = R², S = (GEO_R, 0, 0).
  const b = GEO_R * d0;
  const disc = b * b - (GEO_R * GEO_R - EARTH_R * EARTH_R);
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  const px = GEO_R + t * d0, py = t * d1, pz = t * d2;
  return [Math.asin(Math.max(-1, Math.min(1, pz / EARTH_R))) / RAD, wrapLon(subLon + Math.atan2(py, px) / RAD)];
}
