/**
 * The plugin's two sources. `world/team`: your cities, set once and shared
 * by the map, the clocks and the interlude (local, no network).
 * `world/earth`: the latest full disk of a weather satellite, at most every
 * 10 minutes, kept on disk.
 */
import { defineSource, t, type Localized } from '@kiosko/sdk';
import { demoEarth } from './demo.ts';
import { readEarth, type EarthData } from './earth.ts';
import { L } from './i18n.ts';
import { createNet } from './net.ts';
import { closestTo, lonOfOffset, PROVIDERS, providerOf, SAT_IDS, type SatId } from './satellites/index.ts';
import { wantedPx } from './sizes.ts';
import { fileStore, type Store } from './store.ts';
import { machineZone, memberOptions, resolveTeam, zonedTime, type Member, type TeamCity } from './team.ts';

export const TEAM = 'world/team';
export const EARTH = 'world/earth';

export interface TeamData {
  cities: TeamCity[];
  /** The machine's zone, for "+1 day" and the like. */
  here: string;
}

/** The default team, for the gallery and the tests. */
export const teamDemo = (): TeamData => ({ cities: resolveTeam([]), here: 'Europe/Madrid' });

export const teamOptions = t.object({
  members: t.list(memberOptions, {
    label: L('Cities', 'Ciudades', 'Städte', '城市', '城市'),
    help: L(
      'Where your team is: a city from the list (its time zone, place and usual working week come with it) or your own. Empty: a city on each continent.',
      'Dónde está tu equipo: una ciudad de la lista (con su zona horaria, su lugar y su semana laboral habitual) o una tuya. Vacío: una ciudad en cada continente.',
      'Wo dein Team ist: eine Stadt aus der Liste (mit Zeitzone, Lage und üblicher Arbeitswoche) oder eine eigene. Leer: eine Stadt auf jedem Kontinent.',
      '你的团队在哪里：从列表中选择城市（自带时区、位置和当地的工作周），或自行填写。留空：每个大洲一座城市。',
      '你的團隊在哪裡：從清單中選擇城市（附帶時區、位置和當地的工作週），或自行填寫。留空：每個大洲一座城市。',
    ),
    max: 24,
  }),
});

export const teamSource = defineSource({
  id: 'team',
  name: L('Your team’s cities', 'Las ciudades de tu equipo', 'Die Städte deines Teams', '团队所在城市', '團隊所在城市'),
  description: L(
    'The cities of your team, each with its time zone and working hours. Computed here; no network.',
    'Las ciudades de tu equipo, cada una con su zona horaria y su horario laboral. Calculado aquí; sin red.',
    'Die Städte deines Teams, jede mit ihrer Zeitzone und Arbeitszeit. Hier berechnet; ohne Netz.',
    '团队所在的城市，各自带有时区和工作时间。在本机计算，无需联网。',
    '團隊所在的城市，各自附帶時區和工作時間。在本機計算，無需連網。',
  ),
  options: teamOptions,
  intervalMs: 10 * 60_000,
  async read(ctx): Promise<TeamData> {
    return { cities: resolveTeam((ctx.options as { members: Member[] }).members), here: machineZone() };
  },
  demo: () => teamDemo(),
});

const AUTO: Localized = L('The one over you', 'El que tienes encima', 'Der über dir', '你上空的那颗', '你上空的那顆');

export const earthOptions = t.object({
  satellite: t.enum(['auto', ...SAT_IDS] as const, {
    default: 'auto',
    label: L('Satellite', 'Satélite', 'Satellit', '卫星', '衛星'),
    help: L(
      'The one over you: the satellite hanging closest to your longitude (from your location in Settings, or your time zone).',
      'El que tienes encima: el satélite más cercano a tu longitud (la de tu ubicación en Ajustes, o la de tu zona horaria).',
      'Der über dir: der Satellit, der deinem Längengrad am nächsten steht (aus deinem Ort in den Einstellungen oder deiner Zeitzone).',
      '你上空的那颗：离你所在经度最近的卫星（取自设置中的位置，或你的时区）。',
      '你上空的那顆：離你所在經度最近的衛星（取自設定中的位置，或你的時區）。',
    ),
    labels: {
      auto: AUTO,
      'goes-west': L('GOES-West (Pacific, western Americas)', 'GOES-Oeste (Pacífico, oeste de América)', 'GOES-West (Pazifik, westliches Amerika)', 'GOES 西星（太平洋、美洲西部）', 'GOES 西星（太平洋、美洲西部）'),
      'goes-east': L('GOES-East (the Americas)', 'GOES-Este (América)', 'GOES-Ost (Amerika)', 'GOES 东星（美洲）', 'GOES 東星（美洲）'),
      meteosat: L('Meteosat (Europe, Africa)', 'Meteosat (Europa, África)', 'Meteosat (Europa, Afrika)', 'Meteosat（欧洲、非洲）', 'Meteosat（歐洲、非洲）'),
      'meteosat-iodc': L('Meteosat (Indian Ocean)', 'Meteosat (océano Índico)', 'Meteosat (Indischer Ozean)', 'Meteosat（印度洋）', 'Meteosat（印度洋）'),
      himawari: L('Himawari (Asia, Oceania)', 'Himawari (Asia, Oceanía)', 'Himawari (Asien, Ozeanien)', '向日葵（亚洲、大洋洲）', '向日葵（亞洲、大洋洲）'),
    },
  }),
});

/** The satellite for the option and the reader's place (or time zone). */
export function resolveSatellite(option: string, location: { longitude: number } | undefined, now: number): SatId {
  if (option !== 'auto') return providerOf(option).id;
  const lon = location ? location.longitude : lonOfOffset(zonedTime(now, machineZone()).offset);
  return closestTo(lon);
}

const stores = new Map<string, Store>();
const net = createNet();

export const earthSource = defineSource({
  id: 'earth',
  name: L('The Earth from space', 'La Tierra desde el espacio', 'Die Erde aus dem All', '太空中的地球', '太空中的地球'),
  description: L(
    'The latest full-disk image of a weather satellite (GOES, Meteosat or Himawari), at the size your panels need, every 10 minutes at most. Kept on disk: if the satellite’s site is down, the last image stays.',
    'La última imagen de disco completo de un satélite meteorológico (GOES, Meteosat o Himawari), al tamaño que piden tus paneles, como mucho cada 10 minutos. Se guarda en disco: si la web del satélite no responde, se queda la última.',
    'Das neueste Vollbild der Erdscheibe eines Wettersatelliten (GOES, Meteosat oder Himawari), in der Größe, die deine Panels brauchen, höchstens alle 10 Minuten. Auf der Platte gespeichert: Ist die Seite des Satelliten nicht erreichbar, bleibt das letzte Bild.',
    '气象卫星（GOES、Meteosat 或向日葵）最新的全圆盘图像，按面板所需的尺寸获取，最多每 10 分钟一次。保存在磁盘上：卫星网站无法访问时，保留最后一张。',
    '氣象衛星（GOES、Meteosat 或向日葵）最新的全圓盤影像，依面板所需的尺寸取得，最多每 10 分鐘一次。儲存在磁碟上：衛星網站無法存取時，保留最後一張。',
  ),
  options: earthOptions,
  intervalMs: 5 * 60_000,
  minIntervalMs: 60_000,
  timeoutMs: 60_000,
  async read(ctx): Promise<EarthData> {
    const dir = ctx.cacheDir || ctx.dataDir;
    let store = stores.get(dir);
    if (!store) stores.set(dir, (store = fileStore(dir)));
    const sat = resolveSatellite((ctx.options as { satellite: string }).satellite, ctx.location, ctx.now);
    return readEarth(PROVIDERS[sat], { now: ctx.now, px: wantedPx(ctx.now), signal: ctx.signal, log: (m) => ctx.log(m) }, { net, store });
  },
  demo: ({ now }) => demoEarth(now),
});
