/**
 * Satellite images made ready to paint: a square canvas with the Earth's
 * disk filling it exactly and space black around it, whatever the provider
 * gave (a disk with margins or a caption bar, or a latitude-longitude grid
 * that is turned back into the satellite's view here). Decoded once per
 * image and shared by every tile and the interlude.
 */
import { readFile } from 'node:fs/promises';
import type { Canvas, CanvasApi, Graphics, Image } from '@kiosko/sdk';
import type { EarthFrame } from './earth.ts';
import { geosLatLon } from './geo.ts';

export interface Disk {
  img: Canvas;
  /** Diameter, px. */
  size: number;
  takenAt: number;
  file: string;
}

type Api = Pick<CanvasApi, 'createCanvas' | 'loadImage'> & Partial<Pick<CanvasApi, 'loadImageScaled'>>;

async function decode(canvas: Api, file: string, max?: number): Promise<Image> {
  if (max && canvas.loadImageScaled) return canvas.loadImageScaled(file, { width: max, height: max, fit: 'contain' });
  return canvas.loadImage(await readFile(file));
}

/**
 * Which source pixel each disk pixel takes, for a latitude-longitude grid
 * of `n`×`n` over `bbox` seen from `subLon`: -1 for space. Computed once per
 * shape and reused for every image of that satellite.
 */
const lookups = new Map<string, Int32Array>();
export function latlonLookup(size: number, n: number, bbox: NonNullable<EarthFrame['bbox']>, subLon: number): Int32Array {
  const key = `${size}|${n}|${bbox.west}|${bbox.south}|${bbox.east}|${bbox.north}|${subLon}`;
  const had = lookups.get(key);
  if (had) return had;
  const out = new Int32Array(size * size);
  const lonSpan = bbox.east - bbox.west, latSpan = bbox.north - bbox.south;
  for (let j = 0; j < size; j++) {
    const y = 1 - ((j + 0.5) / size) * 2;
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const p = x * x + y * y <= 1 ? geosLatLon(subLon, x, y) : null;
      if (!p) {
        out[j * size + i] = -1;
        continue;
      }
      let dl = p[1] - bbox.west;
      dl = ((dl % 360) + 360) % 360;
      const u = Math.floor((dl / lonSpan) * n), v = Math.floor(((bbox.north - p[0]) / latSpan) * n);
      out[j * size + i] = u >= 0 && u < n && v >= 0 && v < n ? v * n + u : -1;
    }
  }
  while (lookups.size >= 4) lookups.delete(lookups.keys().next().value!);
  lookups.set(key, out);
  return out;
}

/** A latitude-longitude image turned into the disk the satellite sees, `size` across. */
export function reproject(canvas: Pick<CanvasApi, 'createCanvas'>, img: Image | Canvas, bbox: NonNullable<EarthFrame['bbox']>, subLon: number, size: number): Canvas {
  const n = img.width;
  const src = canvas.createCanvas(n, img.height);
  const sg = src.getContext('2d');
  sg.drawImage(img, 0, 0);
  const sd = sg.getImageData(0, 0, n, img.height).data;
  const lut = latlonLookup(size, n, bbox, subLon);
  const out = canvas.createCanvas(size, size);
  const og = out.getContext('2d');
  const od = og.createImageData(size, size);
  const d = od.data;
  for (let k = 0; k < lut.length; k++) {
    const s = lut[k]!;
    const o = k * 4;
    if (s < 0) {
      d[o + 3] = 255;
      continue;
    }
    d[o] = sd[s * 4]!;
    d[o + 1] = sd[s * 4 + 1]!;
    d[o + 2] = sd[s * 4 + 2]!;
    d[o + 3] = 255;
  }
  og.putImageData(od, 0, 0);
  return out;
}

/** A provider's disk image cut to the Earth: its margins and caption bar gone, space black. */
export function cutDisk(canvas: Pick<CanvasApi, 'createCanvas'>, img: Image | Canvas, frame: { scale: number; maskBottom: number } | undefined, size: number): Canvas {
  const W = img.width, H = img.height;
  const scale = frame?.scale ?? 1;
  const r = (W * scale) / 2;
  const out = canvas.createCanvas(size, size);
  const g = out.getContext('2d') as unknown as Graphics;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.clip();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, W / 2 - r, H / 2 - r, 2 * r, 2 * r, 0, 0, size, size);
  g.restore();
  const mask = frame?.maskBottom ?? 0;
  if (mask > 0) {
    // Where the caption bar was: the bottom of the disk, black (a sliver of the southern limb).
    const y = ((H - mask - (H / 2 - r)) / (2 * r)) * size;
    g.fillStyle = '#000';
    g.fillRect(0, Math.floor(y), size, size - Math.floor(y));
  }
  return out;
}

const loaded = new Map<string, Promise<Disk>>();

/**
 * The disk of a frame, at most `max` across (the size it was downloaded at
 * if smaller); the same promise for every caller.
 */
export function loadDisk(canvas: Api, f: EarthFrame, subLon: number, max = 2048, o: { cache?: boolean } = {}): Promise<Disk> {
  const key = `${f.file}|${max}`;
  const hit = loaded.get(key);
  if (hit) return hit;
  const p = (async (): Promise<Disk> => {
    if (f.kind === 'latlon' && f.bbox) {
      const img = await decode(canvas, f.file);
      const size = Math.max(64, Math.min(max, Math.round(img.width / 1.7)));
      return { img: reproject(canvas, img, f.bbox, subLon, size), size, takenAt: f.takenAt, file: f.file };
    }
    const img = await decode(canvas, f.file);
    const size = Math.max(64, Math.min(max, Math.round(img.width * (f.frame?.scale ?? 1))));
    return { img: cutDisk(canvas, img, f.frame, size), size, takenAt: f.takenAt, file: f.file };
  })();
  if (o.cache === false) return p;
  loaded.set(key, p);
  p.catch(() => loaded.delete(key));
  // The latest and a few small past ones (long strips); the interlude decodes its own.
  while (loaded.size > 12) loaded.delete(loaded.keys().next().value!);
  return p;
}

/** For the tests. */
export function forgetDisks(): void {
  loaded.clear();
  lookups.clear();
}
