/**
 * `world/day`: a day going round the Earth in a few seconds. The night and
 * its twilight sweep across the map (or the globe) while the team's clocks
 * run through the day and their dots turn green and grey; or, when the
 * satellite source has kept a few hours of images, those images in turn.
 * Cheap: the land is painted once; each frame is the night (at half the
 * resolution on big screens) and a few texts.
 */
import { defineInterlude, t, type Graphics } from '@kiosko/sdk';
import * as kit from '@loksly/lcd-canvas-kit';
import { loadDisk, type Disk } from './disk.ts';
import { clamp, drawList, drawStrip, MIN_PX, teamList } from './draw-team.ts';
import type { EarthData } from './earth.ts';
import { L } from './i18n.ts';
import { noteDisk } from './sizes.ts';
import { EARTH, TEAM, type TeamData } from './sources.ts';
import { layoutMap, paintWorld, type MapOpts } from './widget-map.ts';

export const FPS = 15;
const DAY = 86_400_000;
/** At least this many satellite images, over at least this long, to play them. */
export const MIN_FRAMES = 6;
export const MIN_SPAN_MS = 50 * 60_000;
/** Largest disk decoded for the interlude (each image is kept in memory while it plays). */
export const SEQ_MAX = 480;

type Mode = 'auto' | 'map' | 'globe' | 'satellite';

/** What to play: the satellite's images when there are enough, else the map (long screens) or the globe. */
export function modeFor(option: Mode, e: EarthData | undefined, W: number, H: number): 'map' | 'globe' | 'satellite' {
  const frames = e && !e.demo ? e.frames : [];
  const enough = frames.length >= MIN_FRAMES && frames[frames.length - 1]!.takenAt - frames[0]!.takenAt >= MIN_SPAN_MS;
  if (option === 'satellite' && enough) return 'satellite';
  if (option === 'map' || option === 'globe') return option;
  if (option === 'auto' && enough && W / H < 1.6 && H / W < 1.6) return 'satellite';
  return W / H >= 1.4 ? 'map' : 'globe';
}

export const dayInterlude = defineInterlude({
  id: 'day',
  name: L('A day around the Earth', 'Un día alrededor de la Tierra', 'Ein Tag um die Erde', '地球的一天', '地球的一天'),
  description: L(
    'A whole day in a few seconds: night and twilight sweep across the map or the globe while your team’s clocks run through the day; or the last hours of satellite images, one after another.',
    'Un día entero en unos segundos: la noche y el crepúsculo barren el mapa o el globo mientras los relojes de tu equipo recorren el día; o las últimas horas de imágenes del satélite, una tras otra.',
    'Ein ganzer Tag in wenigen Sekunden: Nacht und Dämmerung ziehen über Karte oder Globus, während die Uhren deines Teams durch den Tag laufen; oder die letzten Stunden Satellitenbilder, eins nach dem anderen.',
    '几秒钟内走完一整天：黑夜和晨昏扫过地图或地球仪，团队的时钟随之走过一天；或依次播放最近几个小时的卫星图像。',
    '幾秒鐘內走完一整天：黑夜和晨昏掃過地圖或地球儀，團隊的時鐘隨之走過一天；或依序播放最近幾個小時的衛星影像。',
  ),
  icon: 'globe',
  fps: FPS,
  sources: [TEAM, EARTH],
  preview: { poster: 'docs/day.jpg' },
  options: t.object({
    show: t.enum(['auto', 'map', 'globe', 'satellite'] as const, {
      default: 'auto',
      label: L('Show', 'Mostrar', 'Zeigen', '显示', '顯示'),
      labels: {
        auto: L('Automatic', 'Automático', 'Automatisch', '自动', '自動'),
        map: L('The map', 'El mapa', 'Die Karte', '地图', '地圖'),
        globe: L('The globe', 'El globo', 'Den Globus', '地球仪', '地球儀'),
        satellite: L('Satellite images', 'Imágenes del satélite', 'Satellitenbilder', '卫星图像', '衛星影像'),
      },
      help: L(
        'Automatic: the satellite’s last hours on squarish panels when it has kept enough images; else the map on long panels and the globe on the rest.',
        'Automático: las últimas horas del satélite en paneles casi cuadrados cuando ha guardado bastantes imágenes; si no, el mapa en los paneles largos y el globo en el resto.',
        'Automatisch: die letzten Stunden des Satelliten auf fast quadratischen Panels, wenn genug Bilder gespeichert sind; sonst die Karte auf langen Panels und der Globus auf den übrigen.',
        '自动：保存了足够的卫星图像时，在接近方形的面板上播放最近几个小时；否则长面板显示地图，其他面板显示地球仪。',
        '自動：儲存了足夠的衛星影像時，在接近方形的面板上播放最近幾個小時；否則長面板顯示地圖，其他面板顯示地球儀。',
      ),
    }),
    seconds: t.integer({ default: 12, min: 4, max: 60, unit: 's', label: L('Seconds', 'Segundos', 'Sekunden', '秒数', '秒數') }),
  }),
  async prepare(ctx) {
    const { width: W, height: H, theme } = ctx;
    const frames = Math.max(2, Math.round(ctx.options.seconds * FPS));
    const team = ctx.sources[TEAM] as TeamData | undefined;
    const earth = ctx.sources[EARTH] as EarthData | undefined;
    const mode = modeFor(ctx.options.show as Mode, earth, W, H);
    const dctx = { kit, theme, t: ctx.t, fmt: ctx.fmt, locale: ctx.locale, canvas: ctx.canvas, now: ctx.now, ...(ctx.location ? { location: ctx.location } : {}) };
    const clockSize = Math.round(clamp(Math.min(H / 9, W / 14), MIN_PX + 2, 40));
    const clock = (g: Graphics, at: number, x: number, y: number, sub?: string) => {
      const font = { size: clockSize, family: theme.fonts.sansBold, color: '#F2F4F8' };
      const text = ctx.fmt.time(at);
      const w = Math.max(kit.measureTracked(g, text, font), sub ? kit.measureTracked(g, sub, { size: MIN_PX, family: theme.fonts.sans }) : 0);
      const h = clockSize * 1.25 + (sub ? MIN_PX * 1.4 : 0);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.roundRect(x, y, w + clockSize * 0.7, h + clockSize * 0.3, 6);
      g.fill();
      kit.drawTracked(g, text, x + clockSize * 0.35, y + clockSize * 1.1, font);
      if (sub) kit.drawTracked(g, sub, x + clockSize * 0.35, y + clockSize * 1.1 + MIN_PX * 1.45, { size: MIN_PX, family: theme.fonts.sans, color: 'rgba(242,244,248,0.8)' });
    };

    if (mode === 'satellite' && earth) {
      const d = Math.min(W, H, SEQ_MAX);
      noteDisk(Math.min(W, H), ctx.now);
      const disks: Disk[] = [];
      for (const f of earth.frames) disks.push(await loadDisk(ctx.canvas, f, earth.subLon, d, { cache: false }));
      const size = Math.min(W, H);
      const x0 = (W - size) / 2, y0 = (H - size) / 2;
      // The credit whole, word for word: wrapped, and in turns over the seconds if it takes more than three lines.
      const creditFont = { size: MIN_PX, family: theme.fonts.sans, color: 'rgba(236,240,245,0.8)' };
      const creditLines = kit.wrapLines(ctx.canvas.createCanvas(1, 1).getContext('2d') as never, earth.credit, W - 16, 40, creditFont);
      const per = Math.max(1, Math.min(3, Math.floor((H * 0.3) / (MIN_PX * 1.4)), creditLines.length));
      const creditPages: string[][] = [];
      for (let k = 0; k < creditLines.length; k += per) creditPages.push(creditLines.slice(k, k + per));
      return {
        frames,
        draw(g: Graphics, i: number) {
          const pos = (i / frames) * disks.length;
          const k = Math.min(disks.length - 1, Math.floor(pos));
          const fade = clamp((pos - k - 0.6) / 0.4, 0, 1);
          g.fillStyle = '#000';
          g.fillRect(0, 0, W, H);
          g.imageSmoothingEnabled = true;
          g.drawImage(disks[k]!.img, x0, y0, size, size);
          const next = disks[k + 1];
          if (next && fade > 0) {
            g.globalAlpha = fade;
            g.drawImage(next.img, x0, y0, size, size);
            g.globalAlpha = 1;
          }
          clock(g, disks[k]!.takenAt, 8, 8, ctx.t(earth.name));
          const page = creditPages[Math.min(creditPages.length - 1, Math.floor((i / frames) * creditPages.length))] ?? [];
          const lh = Math.round(MIN_PX * 1.4);
          if (page.length) {
            g.fillStyle = 'rgba(0,0,0,0.55)';
            g.fillRect(0, H - page.length * lh - 10, W, page.length * lh + 10);
          }
          page.forEach((l, j) => kit.drawTracked(g, l, 8, H - 8 - (page.length - 1 - j) * lh, creditFont));
        },
      };
    }

    const globe = mode === 'globe';
    const o: MapOpts = { projection: globe ? 'globe' : 'map', center: 'auto', list: true, labels: false, twilight: true, showMoon: true };
    const lay = layoutMap({ x: 0, y: 0, w: W, h: H }, globe, true, team?.cities.length ?? 0);
    const nightScale = W * H > 200_000 ? 0.5 : 1;
    const start = ctx.now;
    return {
      frames,
      draw(g: Graphics, i: number) {
        const at = start + (i / (frames - 1)) * DAY;
        g.fillStyle = theme.colors.bg;
        g.fillRect(0, 0, W, H);
        const list = teamList(team?.cities, at, team?.here);
        paintWorld(g, dctx as never, lay.map, lay.globe, o, list, at, nightScale);
        if (lay.list) (lay.list.as === 'strip' ? drawStrip : drawList)(g, dctx as never, lay.list, list, at);
        if (lay.map.h >= 90) clock(g, at, lay.map.x + 6, lay.map.y + 6);
      },
    };
  },
});
