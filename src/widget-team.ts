/**
 * `world/team`: your team's clocks, sorted by time zone, each with a dot
 * that says whether it is at work there now (green), about to start or just
 * done (amber), or off (grey; a ring on its days off). A list on tall and
 * square tiles, a strip on long ones.
 */
import { defineWidget, type Graphics, type RenderContext } from '@kiosko/sdk';
import { drawList, drawStrip, MIN_PX, teamList } from './draw-team.ts';
import { L } from './i18n.ts';
import { NO_CITIES } from './labels.ts';
import { TEAM, teamDemo, type TeamData } from './sources.ts';

type Ctx = RenderContext<Record<string, never>, undefined>;

function render(g: Graphics, ctx: Ctx): void {
  const { box, now, kit, theme } = ctx;
  const team = ctx.sources[TEAM] as TeamData | undefined;
  const list = teamList(team?.cities, now, team?.here);
  if (!list.length) {
    const font = { size: Math.max(MIN_PX, Math.min(18, Math.round(box.h / 5))), family: theme.fonts.sans, color: theme.colors.inkDim };
    kit.drawTracked(g, kit.truncate(g, ctx.t(NO_CITIES), box.w - 8, font), box.x + 4, box.y + box.h / 2 + font.size * 0.36, font);
    return;
  }
  // Long and low: one city a column; otherwise a row each.
  const strip = box.w / box.h > 3.2 || box.h < 44;
  (strip ? drawStrip : drawList)(g, ctx, box, list, now);
}

export const teamWidget = defineWidget({
  id: 'team',
  name: L('Team clocks', 'Relojes del equipo', 'Team-Uhren', '团队时钟', '團隊時鐘'),
  description: L(
    'Your team’s cities with their local time, sorted by time zone, and a dot for whether they are at work there now: green at work, amber about to start or just done, grey off (a ring on days off). Each city has its own hours and weekend.',
    'Las ciudades de tu equipo con su hora local, ordenadas por zona horaria, y un punto que dice si allí están trabajando: verde trabajando, ámbar a punto de empezar o recién terminado, gris fuera (un aro los días libres). Cada ciudad con su horario y su fin de semana.',
    'Die Städte deines Teams mit Ortszeit, nach Zeitzone sortiert, und ein Punkt, ob dort gerade gearbeitet wird: grün bei der Arbeit, gelb kurz davor oder gerade fertig, grau frei (ein Ring an freien Tagen). Jede Stadt mit eigenen Zeiten und eigenem Wochenende.',
    '团队所在城市的当地时间，按时区排序，圆点表示那里此刻是否在上班：绿色上班中，琥珀色即将上班或刚下班，灰色下班（休息日为空心圆）。每座城市都有自己的工作时间和周末。',
    '團隊所在城市的當地時間，依時區排序，圓點表示那裡此刻是否在上班：綠色上班中，琥珀色即將上班或剛下班，灰色下班（休息日為空心圓）。每座城市都有自己的工作時間和週末。',
  ),
  icon: 'clock',
  category: 'time',
  tags: ['world-clock', 'time-zones', 'team', 'working-hours'],
  size: { min: { w: 120, h: 30 }, preferred: { w: 320, h: 240 } },
  sources: [TEAM],
  redraw: 'minute',
  /** No valid city in the list ("No cities set"). Empty list means the default team, which is not empty. */
  empty: ({ sources }) => {
    const team = sources[TEAM] as TeamData | undefined;
    return !!team && !team.cities.length;
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
  demo: () => ({ sources: { [TEAM]: teamDemo() } }),
});
