/**
 * The planet now: a world map with day and night (twilight bands, the sun
 * and the moon) computed here, your team's cities with their time and
 * whether they are at work, and the whole Earth as the weather satellites
 * see it (GOES, Meteosat, Himawari), every 10 minutes. And an interlude: a
 * day going round the Earth in a few seconds. No keys.
 */
import { definePlugin } from '@kiosko/sdk';
import { L, LANGUAGES } from './i18n.ts';
import { dayInterlude } from './interlude.ts';
import { VERSION } from './net.ts';
import { PROVIDERS, SAT_IDS } from './satellites/index.ts';
import { earthSource, teamSource } from './sources.ts';
import { earthWidget } from './widget-earth.ts';
import { mapWidget } from './widget-map.ts';
import { teamWidget } from './widget-team.ts';

export { PROVIDERS } from './satellites/index.ts';
export { earthSource, teamSource } from './sources.ts';
export { mapWidget, teamWidget, earthWidget, dayInterlude };

export default definePlugin({
  id: 'world',
  name: L('The planet now', 'El planeta ahora', 'Der Planet jetzt', '此刻的地球', '此刻的地球'),
  version: VERSION,
  description: L(
    'The planet now: a world map with day and night as they are (twilight in bands, the sun and the moon overhead) computed on your machine, your team’s cities with their time and whether they are at work, and the whole Earth as the weather satellites see it (GOES, Meteosat, Himawari), renewed every 10 minutes. Also an interlude: a day going round the Earth in a few seconds. No keys needed.',
    'El planeta ahora: un mapa del mundo con el día y la noche como están (el crepúsculo en bandas, el sol y la luna en su cénit) calculados en tu ordenador, las ciudades de tu equipo con su hora y si están trabajando, y la Tierra entera como la ven los satélites meteorológicos (GOES, Meteosat, Himawari), renovada cada 10 minutos. También un interludio: un día alrededor de la Tierra en unos segundos. Sin claves.',
    'Der Planet jetzt: eine Weltkarte mit Tag und Nacht, wie sie gerade sind (Dämmerung in Bändern, Sonne und Mond im Zenit), auf deinem Rechner berechnet, die Städte deines Teams mit Uhrzeit und ob dort gearbeitet wird, und die ganze Erde, wie die Wettersatelliten sie sehen (GOES, Meteosat, Himawari), alle 10 Minuten neu. Dazu ein Zwischenspiel: ein Tag um die Erde in wenigen Sekunden. Ohne Schlüssel.',
    '此刻的地球：在本机计算的昼夜世界地图（晨昏以色带显示，太阳和月亮位于直射点），团队所在城市的时间以及是否在上班，以及气象卫星（GOES、Meteosat、向日葵）看到的整个地球，每 10 分钟更新。还有过场动画：几秒钟绕地球走完一天。无需密钥。',
    '此刻的地球：在本機計算的晝夜世界地圖（晨昏以色帶顯示，太陽和月亮位於直射點），團隊所在城市的時間以及是否在上班，以及氣象衛星（GOES、Meteosat、向日葵）看到的整個地球，每 10 分鐘更新。還有過場動畫：幾秒鐘繞地球走完一天。無需金鑰。',
  ),
  author: 'Loksly',
  license: 'MIT',
  homepage: 'https://github.com/kiosko-lcd/kiosko-plugin-world#readme',
  repository: 'https://github.com/kiosko-lcd/kiosko-plugin-world',
  icon: 'globe',
  sdk: '^0.2.0',
  platforms: ['linux', 'darwin', 'win32'],
  languages: LANGUAGES,
  permissions: { network: [...new Set(SAT_IDS.flatMap((id) => PROVIDERS[id].hosts))] },
  resources: { memoryMb: 60, cpu: 'low' },
  widgets: [mapWidget, teamWidget, earthWidget],
  sources: [teamSource, earthSource],
  interludes: [dayInterlude],
});
