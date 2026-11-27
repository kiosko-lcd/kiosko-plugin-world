/**
 * The land, from Natural Earth (public domain): outlines to fill on the flat
 * map, and a mask in latitude and longitude for the globe.
 */
import type { CanvasApi, Graphics } from '@kiosko/sdk';
import { flatXY, type FlatMap } from './geo.ts';
import { LAND } from './land-data.ts';

let rings: Float32Array[] | undefined;

/** The land's rings as [lon, lat, lon, lat, …], decoded once. */
export function landRings(): Float32Array[] {
  if (rings) return rings;
  rings = LAND.map((d) => {
    const out = new Float32Array(d.length);
    let x = 0, y = 0;
    for (let i = 0; i < d.length; i += 2) {
      x += d[i]!;
      y += d[i + 1]!;
      out[i] = x / 10;
      out[i + 1] = y / 10;
    }
    return out;
  });
  return rings;
}

/**
 * Adds the land to the current path on a flat map. Natural Earth cuts its
 * polygons at ±180°; a map centred elsewhere has its seam at another
 * longitude, so each ring is traced where it falls and, shifted by a whole
 * turn, where it wraps onto the other side.
 */
export function traceLand(g: Graphics, m: FlatMap): void {
  const left = m.lon0 - 180;
  for (const r of landRings()) {
    // Unwrapped x of the ring's first point; the rest follow it continuously.
    let minX = Infinity, maxX = -Infinity;
    const xs = new Float32Array(r.length / 2);
    for (let i = 0, j = 0; i < r.length; i += 2, j++) {
      let lon = r[i]! - left;
      lon = ((lon % 360) + 360) % 360;
      if (j > 0) {
        const prev = xs[j - 1]!;
        while (lon - prev > 180) lon -= 360;
        while (prev - lon > 180) lon += 360;
      }
      xs[j] = lon;
      if (lon < minX) minX = lon;
      if (lon > maxX) maxX = lon;
    }
    for (const shift of [-360, 0, 360]) {
      if (maxX + shift < 0 || minX + shift > 360) continue;
      for (let i = 0, j = 0; i < r.length; i += 2, j++) {
        const x = m.x + ((xs[j]! + shift) / 360) * m.w;
        const y = m.y + ((m.top - r[i + 1]!) / (m.top - m.bottom)) * m.h;
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    }
  }
}

/** A graticule every `step` degrees on a flat map. */
export function traceGraticule(g: Graphics, m: FlatMap, step = 30): void {
  for (let lon = -180 + step; lon < 180; lon += step) {
    const [x] = flatXY(m, 0, lon);
    g.moveTo(Math.round(x) + 0.5, m.y);
    g.lineTo(Math.round(x) + 0.5, m.y + m.h);
  }
  for (let lat = -90 + step; lat < 90; lat += step) {
    if (lat > m.top || lat < m.bottom) continue;
    const [, y] = flatXY(m, lat, 0);
    g.moveTo(m.x, Math.round(y) + 0.5);
    g.lineTo(m.x + m.w, Math.round(y) + 0.5);
  }
}

/** A land mask: `MASK_W`×`MASK_H` bytes over the whole world, 1 for land (row 0 at 90°N, column 0 at 180°W). */
export const MASK_W = 1024;
export const MASK_H = 512;
let mask: Uint8Array | undefined;

export function landMask(canvas: Pick<CanvasApi, 'createCanvas'>): Uint8Array {
  if (mask) return mask;
  const c = canvas.createCanvas(MASK_W, MASK_H);
  const g = c.getContext('2d') as unknown as Graphics;
  g.fillStyle = '#000';
  g.fillRect(0, 0, MASK_W, MASK_H);
  g.fillStyle = '#fff';
  g.beginPath();
  traceLand(g, { x: 0, y: 0, w: MASK_W, h: MASK_H, lon0: 0, top: 90, bottom: -90 });
  g.fill('evenodd');
  const px = g.getImageData(0, 0, MASK_W, MASK_H).data;
  const m = new Uint8Array(MASK_W * MASK_H);
  for (let i = 0; i < m.length; i++) m[i] = px[i * 4]! > 127 ? 1 : 0;
  mask = m;
  return m;
}

/** Land at a place, from the mask. */
export function isLand(m: Uint8Array, lat: number, lon: number): boolean {
  const x = Math.min(MASK_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MASK_W)));
  const y = Math.min(MASK_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MASK_H)));
  return m[y * MASK_W + x] === 1;
}
