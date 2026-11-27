/**
 * Painting the planet: the flat map and the globe in the theme's colours,
 * the night and its twilight bands over them, the sun and the moon where
 * they stand overhead, and the team's cities. The land and the graticule
 * are painted once per size and kept; the night is recomputed per paint,
 * a few multiplications per pixel.
 */
import type { CanvasApi, Canvas, Graphics, Theme } from '@kiosko/sdk';
import { hex, mix, type RGB } from '@loksly/lcd-canvas-kit';
import { LIGHT_EDGES, moonAt, sunAt, unitOf, type MoonState } from './astro.ts';
import { flatXY, orthoLatLon, orthoXY, type FlatMap } from './geo.ts';
import { isLand, landMask, traceGraticule, traceLand } from './land.ts';

type Api = Pick<CanvasApi, 'createCanvas'>;

export interface Palette {
  ocean: RGB;
  land: RGB;
  grid: string;
  coast: string;
  /** The night's colour and its strength per band: civil, nautical, astronomical, night. */
  night: RGB;
  alpha: [number, number, number, number];
  sun: string;
  moon: string;
  light: boolean;
}

const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

export function paletteOf(theme: Theme): Palette {
  const bg = hex(theme.colors.bg), ink = hex(theme.colors.ink), info = hex(theme.colors.info), ok = hex(theme.colors.ok);
  const light = lum(bg) > 0.5;
  const ocean = light ? mix(bg, info, 0.32) : mix(mix(bg, info, 0.34), [0, 0, 0], 0.1);
  const land = light ? mix(mix(bg, ok, 0.3), [120, 100, 60], 0.18) : mix(mix(bg, ok, 0.32), ink, 0.14);
  return {
    ocean,
    land,
    grid: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
    coast: light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.16)',
    night: light ? [16, 24, 46] : [0, 2, 8],
    alpha: light ? [0.24, 0.4, 0.52, 0.6] : [0.3, 0.48, 0.6, 0.7],
    sun: theme.colors.warn,
    moon: light ? '#FBFAF4' : theme.colors.ink,
    light,
  };
}

const cssOf = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** Night alpha for a sine of the sun's elevation, with a quarter-degree ramp at each band's edge. */
export function nightAlpha(sinAlt: number, a: Palette['alpha']): number {
  const RAMP = 0.0045;
  const e = LIGHT_EDGES;
  if (sinAlt > e[0]! + RAMP) return 0;
  const levels = [0, a[0], a[1], a[2], a[3]];
  for (let k = 0; k < 4; k++) {
    const edge = e[k]!;
    if (sinAlt > edge + RAMP) return levels[k]!;
    if (sinAlt > edge - RAMP) {
      const t = (edge + RAMP - sinAlt) / (2 * RAMP);
      return levels[k]! + (levels[k + 1]! - levels[k]!) * t;
    }
  }
  return a[3];
}

// --- the flat map -----------------------------------------------------------

const bases = new Map<string, Canvas>();
const keep = <T>(m: Map<string, T>, k: string, v: T, max = 6) => {
  while (m.size >= max) m.delete(m.keys().next().value!);
  m.set(k, v);
  return v;
};

/** The day map, land and sea, at the map's size: painted once and kept. */
export function baseMap(api: Api, m: Omit<FlatMap, 'x' | 'y'>, pal: Palette, grid = true): Canvas {
  const w = Math.max(1, Math.round(m.w)), h = Math.max(1, Math.round(m.h));
  const key = `${w}x${h}|${m.lon0}|${m.top}|${m.bottom}|${cssOf(pal.ocean)}|${cssOf(pal.land)}|${grid}`;
  const had = bases.get(key);
  if (had) return had;
  const c = api.createCanvas(w, h);
  const g = c.getContext('2d') as unknown as Graphics;
  const fm: FlatMap = { ...m, x: 0, y: 0, w, h };
  g.fillStyle = cssOf(pal.ocean);
  g.fillRect(0, 0, w, h);
  g.beginPath();
  traceLand(g, fm);
  g.fillStyle = cssOf(pal.land);
  g.fill('evenodd');
  if (w >= 300) {
    g.strokeStyle = pal.coast;
    g.lineWidth = w >= 900 ? 0.8 : 0.6;
    g.stroke();
  }
  if (grid) {
    g.beginPath();
    traceGraticule(g, fm, 30);
    g.strokeStyle = pal.grid;
    g.lineWidth = 1;
    g.stroke();
  }
  return keep(bases, key, c);
}

const overlays = new Map<string, Canvas>();

/** The night over a flat map at `at`, `scale` of the map's resolution (1: every pixel). */
export function nightOverlay(api: Api, m: Omit<FlatMap, 'x' | 'y'>, at: number, pal: Palette, scale = 1): Canvas {
  const w = Math.max(1, Math.round(m.w * scale)), h = Math.max(1, Math.round(m.h * scale));
  const key = `${w}x${h}`;
  const c = overlays.get(key) ?? keep(overlays, key, api.createCanvas(w, h), 4);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const s = sunAt(at);
  const RAD = Math.PI / 180;
  const sd = Math.sin(s.declination * RAD), cd = Math.cos(s.declination * RAD);
  const cosH = new Float32Array(w);
  for (let i = 0; i < w; i++) cosH[i] = Math.cos((m.lon0 - 180 + ((i + 0.5) / w) * 360 - s.subLon) * RAD);
  const [nr, ng, nb] = pal.night;
  // Alpha in steps of 1/255 is what the canvas keeps: a table by elevation would do, but this is already cheap.
  for (let j = 0; j < h; j++) {
    const lat = (m.top - ((j + 0.5) / h) * (m.top - m.bottom)) * RAD;
    const A = Math.sin(lat) * sd, B = Math.cos(lat) * cd;
    let o = j * w * 4;
    for (let i = 0; i < w; i++, o += 4) {
      const a = nightAlpha(A + B * cosH[i]!, pal.alpha);
      if (a === 0) continue;
      d[o] = nr;
      d[o + 1] = ng;
      d[o + 2] = nb;
      d[o + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export interface Marker {
  lat: number;
  lon: number;
  color: string;
  hollow?: boolean;
  label?: string;
}

export interface MapLayers {
  night: boolean;
  sun: boolean;
  moon: boolean;
  grid: boolean;
  /** Resolution of the night, 1 for every pixel (the interlude uses less). */
  nightScale?: number;
}

/** A flat map in `m` at `at`: land, night, sun, moon. */
export function paintFlat(g: Graphics, api: Api, m: FlatMap, at: number, pal: Palette, layers: MapLayers): void {
  g.save();
  g.beginPath();
  g.rect(m.x, m.y, m.w, m.h);
  g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(baseMap(api, m, pal, layers.grid), m.x, m.y, m.w, m.h);
  if (layers.night) g.drawImage(nightOverlay(api, m, at, pal, layers.nightScale ?? 1), m.x, m.y, m.w, m.h);
  const r = Math.max(2.5, Math.min(9, m.h / 28));
  if (layers.sun) {
    const s = sunAt(at);
    const [x, y] = flatXY(m, s.declination, s.subLon);
    sunMark(g, x, y, r, pal);
  }
  if (layers.moon) {
    const mo = moonAt(at);
    const [x, y] = flatXY(m, mo.subLat, mo.subLon);
    moonMark(g, x, y, r * 0.9, mo, pal);
  }
  g.restore();
}

export function sunMark(g: Graphics, x: number, y: number, r: number, pal: Palette): void {
  const glow = g.createRadialGradient(x, y, 0, x, y, r * 3);
  glow.addColorStop(0, 'rgba(255,214,102,0.55)');
  glow.addColorStop(1, 'rgba(255,214,102,0)');
  g.fillStyle = glow;
  g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = pal.sun;
  g.fill();
}

/** The moon with its phase: the lit part towards the sun (right when waxing, from the north). */
export function moonMark(g: Graphics, x: number, y: number, r: number, mo: Pick<MoonState, 'illumination' | 'waxing'>, pal: Palette): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = pal.light ? 'rgba(40,44,56,0.55)' : 'rgba(10,12,18,0.75)';
  g.fill();
  g.strokeStyle = pal.light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.stroke();
  const s = mo.waxing ? 1 : -1;
  const k = mo.illumination;
  const N = 24;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * Math.PI;
    g.lineTo(x + s * r * Math.sin(u), y - r * Math.cos(u));
  }
  for (let i = N; i >= 0; i--) {
    const u = (i / N) * Math.PI;
    g.lineTo(x + s * r * Math.sin(u) * (1 - 2 * k), y - r * Math.cos(u));
  }
  g.closePath();
  g.fillStyle = pal.moon;
  g.fill();
}

// --- the globe --------------------------------------------------------------

interface GlobeGeo {
  n: number;
  /** Unit vectors per pixel (NaN off the globe) and land flags. */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  land: Uint8Array;
  /** Shading towards the limb, 0…1. */
  limb: Float32Array;
}
const globes = new Map<string, GlobeGeo>();

function globeGeo(api: Api, n: number, lat0: number, lon0: number): GlobeGeo {
  const key = `${n}|${lat0}|${lon0}`;
  const had = globes.get(key);
  if (had) return had;
  const mask = landMask(api);
  const x = new Float32Array(n * n), y = new Float32Array(n * n), z = new Float32Array(n * n);
  const land = new Uint8Array(n * n), limb = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const u = ((i + 0.5) / n) * 2 - 1, v = 1 - ((j + 0.5) / n) * 2;
      const p = orthoLatLon(lat0, lon0, u, v);
      if (!p) {
        x[k] = NaN;
        continue;
      }
      const e = unitOf(p[0], p[1]);
      x[k] = e[0];
      y[k] = e[1];
      z[k] = e[2];
      land[k] = isLand(mask, p[0], p[1]) ? 1 : 0;
      limb[k] = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    }
  return keep(globes, key, { n, x, y, z, land, limb }, 3);
}

const globeCanvases = new Map<number, Canvas>();

/** The globe seen above (lat0, lon0) at `at`, as an image `n` across (space transparent). */
export function globeImage(api: Api, n: number, lat0: number, lon0: number, at: number, pal: Palette, night = true): Canvas {
  const geo = globeGeo(api, n, lat0, lon0);
  const c = globeCanvases.get(n) ?? (globeCanvases.set(n, api.createCanvas(n, n)), globeCanvases.get(n)!);
  while (globeCanvases.size > 3) globeCanvases.delete(globeCanvases.keys().next().value!);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const d = img.data;
  const sv = night ? sunAt(at) : null;
  const s = sv ? unitOf(sv.declination, sv.subLon) : [0, 0, 0];
  const [or, og, ob] = pal.ocean, [lr, lg, lb] = pal.land, [nr, ng, nb] = pal.night;
  for (let k = 0, o = 0; k < n * n; k++, o += 4) {
    const px = geo.x[k]!;
    if (Number.isNaN(px)) continue;
    const isL = geo.land[k] === 1;
    // A little darker towards the limb, so it reads as a sphere.
    const shade = 0.72 + 0.28 * geo.limb[k]!;
    let r = (isL ? lr : or) * shade, gg = (isL ? lg : og) * shade, b = (isL ? lb : ob) * shade;
    if (sv) {
      const a = nightAlpha(px * s[0]! + geo.y[k]! * s[1]! + geo.z[k]! * s[2]!, pal.alpha);
      r += (nr - r) * a;
      gg += (ng - gg) * a;
      b += (nb - b) * a;
    }
    d[o] = r;
    d[o + 1] = gg;
    d[o + 2] = b;
    d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Largest globe computed pixel by pixel; bigger ones are drawn scaled up. */
export const GLOBE_MAX = 360;

export function paintGlobe(g: Graphics, api: Api, cx: number, cy: number, R: number, lat0: number, lon0: number, at: number, pal: Palette, layers: MapLayers): void {
  const n = Math.max(16, Math.min(GLOBE_MAX, Math.round(2 * R * (layers.nightScale ?? 1))));
  const img = globeImage(api, n, lat0, lon0, at, pal, layers.night);
  g.save();
  g.imageSmoothingEnabled = true;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, cx - R, cy - R, 2 * R, 2 * R);
  g.restore();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.strokeStyle = pal.coast;
  g.lineWidth = 1;
  g.stroke();
  const r = Math.max(2.5, Math.min(8, R / 14));
  if (layers.sun) {
    const s = sunAt(at);
    const p = orthoXY(lat0, lon0, s.declination, s.subLon);
    if (p) sunMark(g, cx + p[0] * R, cy - p[1] * R, r, pal);
  }
  if (layers.moon) {
    const mo = moonAt(at);
    const p = orthoXY(lat0, lon0, mo.subLat, mo.subLon);
    if (p) moonMark(g, cx + p[0] * R, cy - p[1] * R, r * 0.9, mo, pal);
  }
}

/** For the tests. */
export function forgetPaint(): void {
  bases.clear();
  overlays.clear();
  globes.clear();
  globeCanvases.clear();
}
