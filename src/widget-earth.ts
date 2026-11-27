/**
 * `world/earth`: the whole Earth as a weather satellite sees it now, renewed
 * every 10 minutes: whole on square tiles, beside its caption on long ones.
 * Which satellite, when it was taken and the agency's credit are always on
 * screen.
 */
import { defineWidget, type Box, type Graphics, type ObjectField, type RenderContext } from '@kiosko/sdk';
import { demoEarth } from './demo.ts';
import { loadDisk, type Disk } from './disk.ts';
import { clamp, MIN_PX } from './draw-team.ts';
import type { EarthData } from './earth.ts';
import { L } from './i18n.ts';
import { OLD, SAMPLE, SAMPLE_SHORT, WAITING_SAT } from './labels.ts';
import { globeImage, paletteOf } from './paint.ts';
import { noteDisk } from './sizes.ts';
import { EARTH } from './sources.ts';

/** The latest disk and, for long strips, a few earlier ones (newest first), an hour or so apart. */
export interface Shown {
  latest: Disk;
  past: Disk[];
}
type Ctx = RenderContext<Record<string, never>, Shown | undefined>;

/** Earlier images worth showing beside the latest: at least `gapMs` apart, newest first. */
export function pastFrames<T extends { takenAt: number }>(frames: T[], max: number, gapMs = 50 * 60_000): T[] {
  const out: T[] = [];
  let last = frames[frames.length - 1]?.takenAt ?? 0;
  for (let i = frames.length - 2; i >= 0 && out.length < max; i--) {
    if (last - frames[i]!.takenAt >= gapMs) {
      out.push(frames[i]!);
      last = frames[i]!.takenAt;
    }
  }
  return out;
}
/** Past images decoded at most this big. */
export const PAST_PX = 200;

export interface Caption {
  /** "GOES-East · 07:50 · 12 min ago". */
  head: string;
  /** The agency's credit, word for word as its terms give it. */
  credit: string;
  stale: boolean;
}

export function captionOf(ctx: Pick<Ctx, 't' | 'fmt' | 'now'>, e: EarthData, takenAt: number | undefined): Caption {
  if (e.demo) return { head: `${ctx.t(e.name)} · ${ctx.t(SAMPLE_SHORT)}`, credit: ctx.t(SAMPLE), stale: false };
  const when = takenAt ? `${ctx.fmt.time(takenAt)} · ${ctx.fmt.ago(takenAt, { now: ctx.now })}` : '';
  return {
    head: [ctx.t(e.name), when, e.stale && takenAt ? ctx.t(OLD) : ''].filter(Boolean).join(' · '),
    credit: e.credit,
    stale: e.stale,
  };
}

/** Where the disk and its caption go. */
export function layoutEarth(box: Box): { disk: Box; text: Box | null; overlay: boolean; film?: Box } {
  const { x, y, w, h } = box;
  // A long strip: the disk, its caption, then the hours before it.
  const tw = Math.min(Math.round(h * 3.4), 540, Math.round((w - h) * 0.45));
  if (w / h >= 2.6 && tw >= 160 && w - h - 24 - tw >= h * 0.9) {
    return { disk: { x, y, w: h, h }, text: { x: x + h + 12, y, w: tw, h }, overlay: false, film: { x: x + h + 24 + tw, y, w: w - h - 24 - tw, h } };
  }
  if (w / h >= 1.5 && w - h >= 90) return { disk: { x, y, w: h, h }, text: { x: x + h + 10, y, w: w - h - 14, h }, overlay: false };
  if (h / w >= 1.3 && h - w >= 30) return { disk: { x, y, w, h: w }, text: { x: x + 6, y: y + w + 2, w: w - 12, h: h - w - 2 }, overlay: false };
  const d = Math.min(w, h);
  return { disk: { x: x + (w - d) / 2, y: y + (h - d) / 2, w: d, h: d }, text: null, overlay: true };
}

/** How long each part of a caption that doesn't fit at once stays on screen. */
export const TURN_MS = 20_000;

export type Line = { text: string; size: number; color: string; bold?: boolean };

/**
 * The caption in `n` lines of `w`: all of it when it fits; else in turns
 * (`phase`, a count of `TURN_MS`), the head, then the credit a page of `n`
 * lines at a time. The credit is never shortened nor translated: the
 * agencies' terms give its wording.
 */
export function captionPages(g: Graphics, ctx: Pick<Ctx, 'kit' | 'theme'>, cap: Caption, w: number, n: number, size: number): Line[][] {
  const { kit, theme } = ctx;
  const body = { size, family: theme.fonts.sans };
  const bold = { size, family: theme.fonts.sansBold };
  const headColor = cap.stale ? theme.colors.warn : 'rgba(236,240,245,0.95)';
  const credit = kit.wrapLines(g, cap.credit, w, 40, body).map((text) => ({ text, size, color: 'rgba(236,240,245,0.72)' }));
  const head = (max: number) => kit.wrapLines(g, cap.head, w, max, bold).map((text) => ({ text, size, color: headColor, bold: true }));
  if (credit.length < n) return [[...head(Math.min(2, n - credit.length)), ...credit]];
  if (credit.length === n) return [credit, head(Math.min(2, n))];
  const pages: Line[][] = [head(Math.min(2, n))];
  for (let i = 0; i < credit.length; i += n) pages.push(credit.slice(i, i + n));
  return pages;
}

export function lines(g: Graphics, ctx: Pick<Ctx, 'kit' | 'theme'>, cap: Caption, w: number, n: number, size: number, phase = 0): Line[] {
  const pages = captionPages(g, ctx, cap, w, n, size);
  return pages[phase % pages.length]!;
}

/** Earlier images in a row, newest first, each with its time. */
function drawFilm(g: Graphics, ctx: Ctx, film: Box, past: Disk[]): void {
  const { kit, theme } = ctx;
  const d = Math.round(film.h * 0.86);
  const step = d + Math.round(film.h * 0.18);
  const n = Math.min(past.length, Math.floor((film.w + step - d) / step));
  const size = Math.round(clamp(film.h / 9, MIN_PX, 14));
  for (let k = 0; k < n; k++) {
    const p = past[k]!;
    const x = film.x + k * step, y = film.y + (film.h - d) / 2;
    g.globalAlpha = 0.85 - k * 0.04;
    g.drawImage(p.img, x, y, d, d);
    g.globalAlpha = 1;
    const label = ctx.fmt.time(p.takenAt);
    kit.drawTracked(g, label, x + d, y + d - 2, { size, family: theme.fonts.sans, color: 'rgba(236,240,245,0.8)', align: 'right' });
  }
}

function render(g: Graphics, ctx: Ctx): void {
  const { box, kit, theme, now } = ctx;
  const e = ctx.sources[EARTH] as EarthData | undefined;
  g.fillStyle = '#000';
  g.fillRect(box.x, box.y, box.w, box.h);
  const lay = layoutEarth(box);
  noteDisk(lay.disk.w, now);
  const disk = ctx.data?.latest;
  if (disk) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(disk.img, lay.disk.x, lay.disk.y, lay.disk.w, lay.disk.h);
  } else if (e?.demo) {
    const n = Math.min(360, Math.round(lay.disk.w));
    g.drawImage(globeImage(ctx.canvas, n, 0, e.subLon, now, paletteOf(theme)), lay.disk.x, lay.disk.y, lay.disk.w, lay.disk.h);
  } else {
    const font = { size: Math.round(clamp(Math.min(box.h * 0.12, box.w / 16), MIN_PX, 18)), family: theme.fonts.sans, color: theme.colors.inkDim };
    kit.drawTracked(g, kit.truncate(g, ctx.t(WAITING_SAT), box.w - 12, font), box.x + 6, box.y + box.h / 2 + font.size * 0.36, font);
    return;
  }
  if (!e) return;
  const cap = captionOf(ctx, e, disk?.takenAt);
  if (lay.film && ctx.data?.past.length) drawFilm(g, ctx, lay.film, ctx.data.past);
  if (lay.text) {
    const t = lay.text;
    const size = Math.round(clamp(Math.min(t.h / 4.2, t.w / 11, 18), MIN_PX, 18));
    const lineH = Math.round(size * 1.4);
    const n = Math.max(1, Math.min(6, Math.floor(t.h / lineH)));
    const ls = lines(g, ctx, cap, t.w, n, size, Math.floor(now / TURN_MS));
    let y = t.y + (lay.disk.y === t.y ? (t.h - ls.length * lineH) / 2 : 2) + size;
    for (const l of ls) {
      kit.drawTracked(g, l.text, t.x, y, { size: l.size, family: l.bold ? theme.fonts.sansBold : theme.fonts.sans, color: l.color });
      y += lineH;
    }
    return;
  }
  // Over the disk's bottom, on a shade.
  const size = Math.round(clamp(lay.disk.w / 22, MIN_PX, 16));
  const lineH = Math.round(size * 1.35);
  const n = box.h >= 240 ? 3 : box.h >= 120 ? 2 : 1;
  const pad = Math.round(size * 0.6);
  const ls = lines(g, ctx, cap, box.w - pad * 2, n, size, Math.floor(now / TURN_MS));
  const blockH = ls.length * lineH + pad;
  const shade = g.createLinearGradient(0, box.y + box.h - blockH * 1.5, 0, box.y + box.h);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.4, 'rgba(0,0,0,0.6)');
  shade.addColorStop(1, 'rgba(0,0,0,0.8)');
  g.fillStyle = shade;
  g.fillRect(box.x, box.y + box.h - blockH * 1.5, box.w, blockH * 1.5);
  let y = box.y + box.h - blockH + pad * 0.3 + size;
  for (const l of ls) {
    kit.drawTracked(g, l.text, box.x + pad, y, { size: l.size, family: l.bold ? theme.fonts.sansBold : theme.fonts.sans, color: l.color });
    y += lineH;
  }
}

export const earthWidget = defineWidget<ObjectField<{}>, Shown | undefined>({
  id: 'earth',
  name: L('The Earth now', 'La Tierra ahora', 'Die Erde jetzt', '此刻的地球', '此刻的地球'),
  description: L(
    'The whole Earth as a weather satellite sees it now (GOES, Meteosat or Himawari: the one over you), renewed every 10 minutes, with the satellite, the time and the agency’s credit on screen.',
    'La Tierra entera como la ve ahora un satélite meteorológico (GOES, Meteosat o Himawari: el que tienes encima), renovada cada 10 minutos, con el satélite, la hora y el crédito de la agencia en pantalla.',
    'Die ganze Erde, wie ein Wettersatellit sie gerade sieht (GOES, Meteosat oder Himawari: der über dir), alle 10 Minuten neu, mit Satellit, Uhrzeit und Nennung der Behörde auf dem Bildschirm.',
    '气象卫星此刻看到的整个地球（GOES、Meteosat 或向日葵：你上空的那颗），每 10 分钟更新，屏幕上显示卫星、时间和机构的出处。',
    '氣象衛星此刻看到的整個地球（GOES、Meteosat 或向日葵：你上空的那顆），每 10 分鐘更新，螢幕上顯示衛星、時間和機構的出處。',
  ),
  icon: 'satellite',
  category: 'info',
  tags: ['satellite', 'earth', 'goes', 'himawari', 'meteosat', 'weather'],
  chrome: 'bare',
  size: { min: { w: 100, h: 60 }, preferred: { w: 320, h: 320 } },
  sources: [EARTH],
  intervalMs: 60_000,
  intervalOf: ({ data }) => (data ? undefined : 10_000),
  timeoutMs: 60_000,
  async fetch(ctx): Promise<Shown | undefined> {
    const e = ctx.sources[EARTH] as EarthData | undefined;
    const f = e && !e.demo ? e.frames[e.frames.length - 1] : undefined;
    if (!f || !e) return undefined;
    const latest = await loadDisk(ctx.canvas, f, e.subLon);
    // A handful, so a long strip has the last hours beside the latest.
    const past = await Promise.all(pastFrames(e.frames, 8).map((p) => loadDisk(ctx.canvas, p, e.subLon, PAST_PX)));
    return { latest, past };
  },
  // The caption takes turns where it doesn't fit at once.
  redraw: { everyMs: TURN_MS },
  /** The satellite has answered but there is no image yet ("Waiting for the satellite…"), e.g. its provider failing since the start. */
  empty: ({ sources, data }) => {
    const e = sources[EARTH] as EarthData | undefined;
    return !!e && !e.demo && !data?.latest;
  },
  render(g, ctx) {
    const { box } = ctx;
    g.save();
    g.beginPath();
    g.rect(box.x, box.y, box.w, box.h);
    g.clip();
    try {
      render(g, ctx as unknown as Ctx);
    } finally {
      g.restore();
    }
  },
  demo: ({ now }) => ({ sources: { [EARTH]: demoEarth(now) } }),
});
