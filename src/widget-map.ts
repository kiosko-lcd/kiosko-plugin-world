/**
 * `world/map`: the world with day and night as they are now (twilight in
 * bands), the sun and the moon where they stand overhead, and your team's
 * cities with their local time; beside or under it, when there is room,
 * the cities' clocks. A flat map or a globe. Computed here, no network.
 */
import { defineWidget, t, type Box, type Graphics, type Location, type RenderContext } from '@kiosko/sdk';
import { moonAt, sunAt, wrapLon } from './astro.ts';
import { clamp, dot, drawList, drawStrip, MIN_PX, nameOf, statusColor, teamList, timeOf, type DrawCtx } from './draw-team.ts';
import { flatXY, latitudesFor, MAX_ASPECT, orthoXY, type FlatMap } from './geo.ts';
import { L } from './i18n.ts';
import { paintFlat, paintGlobe, paletteOf, type MapLayers, type Palette } from './paint.ts';
import { TEAM, teamDemo, type TeamData } from './sources.ts';
import { machineZone, zonedTime, type CityNow } from './team.ts';

export const mapOptions = t.object({
  projection: t.enum(['map', 'globe'] as const, {
    default: 'map',
    label: L('Projection', 'Proyección', 'Projektion', '投影', '投影'),
    labels: {
      map: L('Flat map', 'Mapa plano', 'Flache Karte', '平面地图', '平面地圖'),
      globe: L('Globe', 'Globo', 'Globus', '地球仪', '地球儀'),
    },
  }),
  center: t.enum(['auto', 'greenwich', 'pacific', 'here'] as const, {
    default: 'auto',
    label: L('Centred on', 'Centrado en', 'Zentriert auf', '中心位置', '中心位置'),
    labels: {
      auto: L('Automatic', 'Automático', 'Automatisch', '自动', '自動'),
      greenwich: L('Greenwich (0°)', 'Greenwich (0°)', 'Greenwich (0°)', '格林尼治（0°）', '格林威治（0°）'),
      pacific: L('The Pacific (180°)', 'El Pacífico (180°)', 'Den Pazifik (180°)', '太平洋（180°）', '太平洋（180°）'),
      here: L('Where you are', 'Donde estás', 'Wo du bist', '你所在的位置', '你所在的位置'),
    },
    help: L(
      'Automatic: Greenwich, unless you are far from it (the Americas, Asia, Oceania): then near you. Your place is the one in Settings, or your time zone’s.',
      'Automático: Greenwich, salvo que estés lejos (América, Asia, Oceanía): entonces cerca de ti. Tu lugar es el de Ajustes, o el de tu zona horaria.',
      'Automatisch: Greenwich, außer du bist weit weg (Amerika, Asien, Ozeanien): dann in deiner Nähe. Dein Ort ist der aus den Einstellungen oder der deiner Zeitzone.',
      '自动：以格林尼治为中心；如果你离得很远（美洲、亚洲、大洋洲），则以你附近为中心。你的位置取自设置，或你的时区。',
      '自動：以格林威治為中心；如果你離得很遠（美洲、亞洲、大洋洲），則以你附近為中心。你的位置取自設定，或你的時區。',
    ),
  }),
  list: t.boolean({
    default: true,
    label: L('Clocks beside the map', 'Relojes junto al mapa', 'Uhren neben der Karte', '地图旁显示时钟', '地圖旁顯示時鐘'),
    help: L('When the tile leaves room beside or under the map.', 'Cuando el hueco deja sitio al lado o debajo del mapa.', 'Wenn die Kachel neben oder unter der Karte Platz lässt.', '方块在地图旁边或下方有空间时。', '方塊在地圖旁邊或下方有空間時。'),
  }),
  labels: t.boolean({
    default: true,
    label: L('Times on the map', 'Horas en el mapa', 'Uhrzeiten auf der Karte', '在地图上显示时间', '在地圖上顯示時間'),
  }),
  twilight: t.boolean({
    default: true,
    label: L('Twilight bands', 'Bandas de crepúsculo', 'Dämmerungsbänder', '晨昏带', '晨昏帶'),
    help: L(
      'Civil, nautical and astronomical twilight as steps of darkness. Off: just day and night.',
      'El crepúsculo civil, náutico y astronómico como escalones de oscuridad. Desactivado: solo día y noche.',
      'Bürgerliche, nautische und astronomische Dämmerung als Stufen der Dunkelheit. Aus: nur Tag und Nacht.',
      '以不同的暗度显示民用、航海和天文晨昏。关闭：只分白天和黑夜。',
      '以不同的暗度顯示民用、航海和天文晨昏。關閉：只分白天和黑夜。',
    ),
  }),
  showMoon: t.boolean({ default: true, label: L('The moon', 'La luna', 'Der Mond', '月亮', '月亮') }),
});

export type MapOpts = { projection: 'map' | 'globe'; center: 'auto' | 'greenwich' | 'pacific' | 'here'; list: boolean; labels: boolean; twilight: boolean; showMoon: boolean };
type Ctx = RenderContext<MapOpts, undefined>;

/** Where the reader is: their place in Settings, or a guess from the time zone (longitude only). */
export function hereOf(location: Location | undefined, now: number): { lat: number; lon: number; known: boolean } {
  if (location) return { lat: location.latitude, lon: location.longitude, known: true };
  return { lat: 30, lon: wrapLon(zonedTime(now, machineZone()).offset / 4), known: false };
}

/** The longitude in the middle of the map. */
export function centerLon(option: MapOpts['center'], here: { lon: number }): number {
  if (option === 'greenwich') return 0;
  if (option === 'pacific') return 180;
  if (option === 'here') return Math.round(here.lon / 15) * 15;
  return Math.abs(here.lon) <= 60 ? 0 : Math.round(here.lon / 30) * 30;
}

export interface MapLayout {
  map: Box;
  globe: boolean;
  /** Where the clocks go, as a list (rows) or a strip (columns). */
  list?: Box & { as: 'list' | 'strip' };
}

/** Where the map and the clocks go in a box. */
export function layoutMap(box: Box, globe: boolean, withList: boolean, n: number): MapLayout {
  const { x, y, w, h } = box;
  const gap = Math.round(clamp(Math.min(w, h) * 0.04, 4, 12));
  const list = withList && n > 0;
  if (globe) {
    const d = Math.min(w, h);
    if (list && w - d >= 120) return { map: { x, y, w: d, h }, globe, list: { x: x + d + gap, y, w: w - d - gap, h, as: w - d >= h * 1.6 && h < 120 ? 'strip' : 'list' } };
    if (list && h - d >= 40) return { map: { x, y, w, h: d }, globe, list: { x, y: y + d + gap, w, h: h - d - gap, as: h - d - gap < 60 ? 'strip' : 'list' } };
    return { map: box, globe };
  }
  const ar = w / h;
  if (ar > MAX_ASPECT) {
    const mw = Math.round(h * MAX_ASPECT);
    if (list && w - mw - gap >= 120) {
      const rest = { x: x + mw + gap, y, w: w - mw - gap, h };
      return { map: { x, y, w: mw, h }, globe, list: { ...rest, as: rest.w / h > 2.4 && h < 160 ? 'strip' : 'list' } };
    }
    return { map: { x: x + Math.round((w - mw) / 2), y, w: mw, h }, globe };
  }
  if (ar >= 2) return { map: box, globe };
  const mh = Math.round(w / 2);
  const rest = h - mh - gap;
  if (list && rest >= 34) return { map: { x, y, w, h: mh }, globe, list: { x, y: y + mh + gap, w, h: rest, as: rest < 56 && n > 1 ? 'strip' : 'list' } };
  return { map: { x, y: y + Math.round((h - mh) / 2), w, h: mh }, globe };
}

/** Where a city goes on the map or globe; null if it isn't there (the far side of the globe). */
type Project = (lat: number, lon: number) => [number, number] | null;

/** The cities' dots and, where they don't collide, their times. */
export function drawMarkers(g: Graphics, ctx: DrawCtx, area: Box, project: Project, list: CityNow[], at: number, labels: boolean, pal: Palette, avoid: Box[] = []): void {
  const { kit, theme } = ctx;
  const r = clamp(Math.min(area.w, area.h) / 70, 2.5, 5);
  const size = Math.round(clamp(area.h / 16, MIN_PX, 16));
  const taken: Box[] = [...avoid];
  const font = { size, family: theme.fonts.sansBold, color: theme.colors.ink };
  const showLabels = labels && area.h >= 110 && area.w >= 220;
  const points = list.flatMap((c) => {
    if (c.city.lat === undefined || c.city.lon === undefined) return [];
    const p = project(c.city.lat, c.city.lon);
    return p ? [{ c, x: p[0], y: p[1] }] : [];
  });
  for (const { c, x, y } of points) {
    g.beginPath();
    g.arc(x, y, r + 1.2, 0, Math.PI * 2);
    g.fillStyle = pal.light ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)';
    g.fill();
    dot(g, x, y, r, statusColor(theme, c.status), c.status);
    taken.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
  }
  if (!showLabels) return;
  const nameFont = { ...font, family: theme.fonts.sans, color: theme.colors.inkDim };
  for (const { c, x, y } of points) {
    const time = timeOf(ctx, c, at, false);
    const name = nameOf(ctx, c.city.name);
    const withName = area.w >= 640;
    const text = time;
    const tw = kit.measureTracked(g, text, font);
    const nw = withName ? kit.measureTracked(g, name, nameFont) + 4 : 0;
    const bw = tw + nw + 6, bh = size + 4;
    // Right of the dot, else left; never outside the map.
    const candidates = [
      { x: x + r + 3, y: y - bh / 2 },
      { x: x - r - 3 - bw, y: y - bh / 2 },
      { x: x - bw / 2, y: y - r - 2 - bh },
      { x: x - bw / 2, y: y + r + 2 },
    ];
    const spot = candidates.find((b) => b.x >= area.x && b.y >= area.y && b.x + bw <= area.x + area.w && b.y + bh <= area.y + area.h && !taken.some((t) => b.x < t.x + t.w && b.x + bw > t.x && b.y < t.y + t.h && b.y + bh > t.y));
    if (!spot) continue;
    taken.push({ x: spot.x, y: spot.y, w: bw, h: bh });
    g.fillStyle = pal.light ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.roundRect(spot.x, spot.y, bw, bh, 3);
    g.fill();
    kit.drawTracked(g, text, spot.x + 3, spot.y + bh / 2 + size * 0.36, font);
    if (withName) kit.drawTracked(g, name, spot.x + 3 + tw + 4, spot.y + bh / 2 + size * 0.36, nameFont);
  }
}

/** The map (or globe) with its markers in `area`, at `at`. */
export function paintWorld(g: Graphics, ctx: DrawCtx & { canvas: Ctx['canvas']; location?: Location; now: number }, area: Box, globe: boolean, o: MapOpts, list: CityNow[], at: number, nightScale = 1): void {
  const pal = paletteOf(ctx.theme);
  const here = hereOf(ctx.location, ctx.now);
  const lon0 = centerLon(o.center, here);
  const layers: MapLayers = { night: true, sun: true, moon: o.showMoon, grid: true, nightScale };
  if (!o.twilight) pal.alpha = [pal.alpha[3], pal.alpha[3], pal.alpha[3], pal.alpha[3]];
  // Labels keep off the sun and the moon.
  const bodies = (project: Project, r: number): Box[] => {
    const s = sunAt(at), m = moonAt(at);
    return [project(s.declination, s.subLon), o.showMoon ? project(m.subLat, m.subLon) : null].flatMap((p) => (p ? [{ x: p[0] - r * 2, y: p[1] - r * 2, w: r * 4, h: r * 4 }] : []));
  };
  if (globe) {
    const R = Math.min(area.w, area.h) / 2 - 1;
    const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
    const lat0 = clamp(here.lat * 0.6, -35, 35);
    const glon = o.center === 'auto' || o.center === 'here' ? Math.round(here.lon) : lon0;
    paintGlobe(g, ctx.canvas, cx, cy, R, lat0, glon, at, pal, layers);
    const project: Project = (lat, lon) => {
      const p = orthoXY(lat0, glon, lat, lon);
      return p ? [cx + p[0] * R, cy - p[1] * R] : null;
    };
    drawMarkers(g, ctx, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }, project, list, at, o.labels, pal, bodies(project, Math.max(2.5, Math.min(8, R / 14))));
    return;
  }
  const lats = latitudesFor(area.w, area.h);
  const m: FlatMap = { ...area, lon0, ...lats };
  paintFlat(g, ctx.canvas, m, at, pal, layers);
  const project: Project = (lat, lon) => (lat > m.top || lat < m.bottom ? null : flatXY(m, lat, lon));
  drawMarkers(g, ctx, area, project, list, at, o.labels, pal, bodies(project, Math.max(2.5, Math.min(9, m.h / 28))));
}

function render(g: Graphics, ctx: Ctx): void {
  const { box, options: o, now } = ctx;
  const team = ctx.sources[TEAM] as TeamData | undefined;
  const list = teamList(team?.cities, now, team?.here);
  const lay = layoutMap(box, o.projection === 'globe', o.list, list.length);
  g.fillStyle = ctx.theme.colors.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  paintWorld(g, ctx, lay.map, lay.globe, o, list, now);
  if (lay.list) (lay.list.as === 'strip' ? drawStrip : drawList)(g, ctx, lay.list, list, now);
}

export const mapWidget = defineWidget<typeof mapOptions, undefined>({
  id: 'map',
  name: L('Day and night', 'Día y noche', 'Tag und Nacht', '昼夜地图', '晝夜地圖'),
  description: L(
    'The world with day and night as they are now, twilight in bands, the sun and the moon where they are overhead, and your team’s cities with their local time and whether they are at work. A flat map or a globe; computed here, without network.',
    'El mundo con el día y la noche como están ahora, el crepúsculo en bandas, el sol y la luna donde están en el cénit, y las ciudades de tu equipo con su hora y si están trabajando. Mapa plano o globo; calculado aquí, sin red.',
    'Die Welt mit Tag und Nacht, wie sie gerade sind, die Dämmerung in Bändern, Sonne und Mond, wo sie im Zenit stehen, und die Städte deines Teams mit Ortszeit und ob dort gearbeitet wird. Flache Karte oder Globus; hier berechnet, ohne Netz.',
    '此刻世界的昼与夜，晨昏以色带显示，太阳和月亮位于其直射点，并显示团队所在城市的当地时间以及是否在上班。平面地图或地球仪；在本机计算，无需联网。',
    '此刻世界的晝與夜，晨昏以色帶顯示，太陽和月亮位於其直射點，並顯示團隊所在城市的當地時間以及是否在上班。平面地圖或地球儀；在本機計算，無需連網。',
  ),
  icon: 'globe',
  category: 'time',
  tags: ['world', 'map', 'day-night', 'terminator', 'twilight', 'time-zones', 'team'],
  chrome: 'bare',
  size: { min: { w: 160, h: 60 }, preferred: { w: 640, h: 320 } },
  sources: [TEAM],
  options: mapOptions,
  redraw: 'minute',
  render(g, ctx) {
    const { box } = ctx;
    g.save();
    g.beginPath();
    g.rect(box.x, box.y, box.w, box.h);
    g.clip();
    try {
      render(g, ctx as Ctx);
    } finally {
      g.restore();
    }
  },
  demo: () => ({ sources: { [TEAM]: teamDemo() } }),
});
