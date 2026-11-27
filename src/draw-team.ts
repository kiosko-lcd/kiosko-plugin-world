/**
 * The team's clocks, drawn as a list (one city a row) or a strip (one city a
 * column), with a coloured dot for whether each is at work. Shared by the
 * clocks widget, the map's side panel and the interlude.
 */
import type { Box, Graphics, Localized, RenderContext, Theme } from '@kiosko/sdk';
import { STATUS } from './labels.ts';
import { offsetLabel, teamNow, wallClock, type CityNow, type Status, type TeamCity } from './team.ts';

/** The smallest text drawn, in px: readable on a panel across the desk. */
export const MIN_PX = 11;

export type DrawCtx = Pick<RenderContext<unknown, unknown>, 'kit' | 'theme' | 't' | 'fmt' | 'locale'>;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function statusColor(theme: Theme, s: Status): string {
  return s === 'work' ? theme.colors.ok : s === 'edge' ? theme.colors.warn : theme.colors.inkDim;
}

export function nameOf(ctx: Pick<DrawCtx, 't'>, name: Localized | string): string {
  return typeof name === 'string' ? name : ctx.t(name);
}

/** Its local time, in the reader's language and clock format. */
export function timeOf(ctx: Pick<DrawCtx, 'fmt'>, c: CityNow, at: number, ampm = true): string {
  return ctx.fmt.time(wallClock(at, c.city.timeZone), { ampm });
}

const dayTag = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '');

export function dot(g: Graphics, x: number, y: number, r: number, color: string, status: Status): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (status === 'weekend') {
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, r * 0.4);
    g.stroke();
  } else {
    g.fillStyle = color;
    g.fill();
  }
}

/** How many rows of at least `minRow` px fit, and in how many columns. */
export function listShape(box: Box, n: number, minRow = 20): { cols: number; rows: number; shown: number } {
  const perCol = Math.max(1, Math.floor(box.h / minRow));
  const maxCols = Math.max(1, Math.floor(box.w / 150));
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(n / perCol)));
  const rows = Math.min(perCol, Math.ceil(n / cols));
  return { cols, rows, shown: Math.min(n, rows * cols) };
}

/** A list of the cities, sorted by offset: dot, name, then the time on the right. */
export function drawList(g: Graphics, ctx: DrawCtx, box: Box, list: CityNow[], at: number): void {
  const { kit, theme } = ctx;
  if (!list.length) return;
  const { cols, rows, shown } = listShape(box, list.length);
  const colW = box.w / cols;
  const rowH = Math.min(48, box.h / rows);
  const nameSize = Math.round(clamp(rowH * 0.42, MIN_PX, 22));
  const timeSize = Math.round(clamp(rowH * 0.5, MIN_PX + 1, 28));
  const r = clamp(rowH * 0.14, 3, 7);
  const top = box.y + (box.h - rows * rowH) / 2;
  for (let k = 0; k < shown; k++) {
    const c = list[k]!;
    const col = Math.floor(k / rows), row = k % rows;
    const x = box.x + col * colW, y = top + row * rowH;
    const base = y + rowH / 2 + timeSize * 0.36;
    const pad = Math.max(4, r);
    dot(g, x + pad + r, y + rowH / 2, r, statusColor(theme, c.status), c.status);
    const tag = dayTag(c.dayDiff);
    const time = timeOf(ctx, c, at);
    const timeFont = { size: timeSize, family: theme.fonts.sansBold, color: theme.colors.ink };
    const tagFont = { size: MIN_PX, family: theme.fonts.sans, color: theme.colors.inkDim };
    const right = x + colW - pad;
    const tagW = tag ? kit.measureTracked(g, tag, tagFont) + 3 : 0;
    const timeW = kit.measureTracked(g, time, timeFont);
    if (tag) kit.drawTracked(g, tag, right, base - timeSize * 0.45, { ...tagFont, align: 'right' });
    kit.drawTracked(g, time, right - tagW, base, { ...timeFont, align: 'right' });
    // The offset from UTC where the row is wide enough.
    const nameX = x + pad * 2 + r * 2;
    let nameW = right - tagW - timeW - 8 - nameX;
    const nameFont = { size: nameSize, family: theme.fonts.sans, color: c.status === 'work' ? theme.colors.ink : theme.colors.inkDim };
    if (nameW > 190) {
      const off = `UTC${offsetLabel(c.local.offset)}`;
      const offFont = { size: MIN_PX, family: theme.fonts.sans, color: theme.colors.inkDim };
      const offW = kit.measureTracked(g, off, offFont);
      kit.drawTracked(g, off, right - tagW - timeW - 10, base, { ...offFont, align: 'right' });
      nameW -= offW + 8;
    }
    if (nameW > 12) kit.drawTracked(g, kit.truncate(g, nameOf(ctx, c.city.name), nameW, nameFont), nameX, y + rowH / 2 + nameSize * 0.36, nameFont);
  }
}

/** A strip of the cities, one column each: the name over its time, the dot beside. */
export function drawStrip(g: Graphics, ctx: DrawCtx, box: Box, list: CityNow[], at: number): void {
  const { kit, theme } = ctx;
  if (!list.length) return;
  const minCell = box.h >= 56 ? 92 : 120;
  const n = Math.min(list.length, Math.max(1, Math.floor(box.w / minCell)));
  // When not all fit, the ones in the middle of the offsets are dropped last: keep both ends.
  const shown = n >= list.length ? list : pickSpread(list, n);
  const cellW = box.w / n;
  const two = box.h >= 44;
  const nameSize = Math.round(clamp(box.h * (two ? 0.2 : 0.36), MIN_PX, 22));
  const r = clamp(box.h * 0.06, 3, 7);
  // One size for every time, the largest at which the longest fits its column.
  const times = shown.map((c) => timeOf(ctx, c, at) + (two ? '' : `${dayTag(c.dayDiff) ? ` ${dayTag(c.dayDiff)}` : ''}`));
  const longest = times.reduce((a, b) => (kit.measureTracked(g, b, { size: 20, family: theme.fonts.sansBold }) > kit.measureTracked(g, a, { size: 20, family: theme.fonts.sansBold }) ? b : a), '');
  const timeRoom = cellW - 12 - (two ? 0 : r * 2 + 5);
  const timeSize = kit.fitSize(g, longest, timeRoom, { size: Math.round(clamp(box.h * (two ? 0.34 : 0.42), MIN_PX + 1, 44)), family: theme.fonts.sansBold }, MIN_PX + 1);
  shown.forEach((c, k) => {
    const x = box.x + k * cellW + 6;
    const w = cellW - 12;
    const color = statusColor(theme, c.status);
    const name = nameOf(ctx, c.city.name);
    const nameFont = { size: nameSize, family: theme.fonts.sans, color: c.status === 'work' ? theme.colors.ink : theme.colors.inkDim };
    const timeFont = { size: timeSize, family: theme.fonts.sansBold, color: theme.colors.ink };
    const time = timeOf(ctx, c, at);
    const tag = dayTag(c.dayDiff);
    const tagFont = { size: MIN_PX, family: theme.fonts.sans, color: theme.colors.inkDim };
    if (two) {
      const block = nameSize * 1.25 + timeSize;
      const y0 = box.y + (box.h - block) / 2;
      dot(g, x + r, y0 + nameSize * 0.62, r, color, c.status);
      kit.drawTracked(g, kit.truncate(g, name, w - r * 2 - 6, nameFont), x + r * 2 + 6, y0 + nameSize, nameFont);
      const tw = kit.drawTracked(g, kit.truncate(g, time, w, timeFont), x, y0 + nameSize * 1.25 + timeSize * 0.92, timeFont);
      if (tag && tw + 4 + kit.measureTracked(g, tag, tagFont) <= w) kit.drawTracked(g, tag, x + tw + 3, y0 + nameSize * 1.25 + timeSize * 0.4, tagFont);
    } else {
      const base = box.y + box.h / 2 + timeSize * 0.36;
      dot(g, x + r, box.y + box.h / 2, r, color, c.status);
      const tw = kit.drawTracked(g, kit.truncate(g, time + (tag ? ` ${tag}` : ''), timeRoom, timeFont), x + r * 2 + 5, base, timeFont);
      const rest = w - (r * 2 + 5) - tw - 6;
      if (rest > 24) kit.drawTracked(g, kit.truncate(g, name, rest, nameFont), x + r * 2 + 5 + tw + 6, base, nameFont);
    }
  });
}

/** `n` of `list`, spread evenly from first to last. */
export function pickSpread<T>(list: T[], n: number): T[] {
  if (n >= list.length) return list;
  if (n === 1) return [list[0]!];
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]!);
}

/** The team now, from a team source's data. */
export function teamList(cities: TeamCity[] | undefined, at: number, here: string | undefined): CityNow[] {
  return teamNow(cities ?? [], at, here);
}

/** The words for a status (for screen readers of the README and the legend). */
export const statusWord = (ctx: Pick<DrawCtx, 't'>, s: Status): string => ctx.t(STATUS[s]);
