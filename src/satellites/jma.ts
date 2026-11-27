/**
 * Himawari-9 (140.7°E): the Japan Meteorological Agency's True Color
 * Reproduction full disk, 601 px, every 10 minutes, from its Meteorological
 * Satellite Center's real-time page. Its file names repeat every day
 * (`fd__trm_0730.jpg`), so the page's list of times says which is the latest.
 *
 * Terms: the JMA website's (Public Data License 1.0, compatible with CC BY
 * 4.0): "Source: Japan Meteorological Agency website"; TCR images also
 * credit JMA, NOAA/NESDIS and CSU/CIRA.
 * https://www.jma.go.jp/jma/en/copyright.html
 * https://www.jma.go.jp/jma/jma-eng/satellite/introduction/TCR.html
 */
import { L } from '../i18n.ts';
import type { Provider, Shot } from './types.ts';

export const JMA_HOST = 'www.data.jma.go.jp';
export const JMA_PAGE = `https://${JMA_HOST}/mscweb/data/himawari/sat_img.php?area=fd_`;
export const JMA_PX = 601;
/** The Earth fills 577 of the image's 601 px. */
export const JMA_SCALE = 577 / 601;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * The latest image in the page's list of times: `<option value=0730>07:40
 * UTC 27 November 2026</option>`. The value is the scan's start (the file's
 * name); the label, its end and its date. Null if the page has none.
 */
export function parseJmaLatest(html: string): { hhmm: string; takenAt: number } | null {
  const m = /<option value=["']?(\d{4})["']?>\s*(\d{2}):(\d{2}) UTC (\d{1,2}) ([A-Za-z]+) (\d{4})\s*<\/option>/.exec(html);
  if (!m) return null;
  const [, hhmm, lh, lm, d, mon, y] = m;
  const month = MONTHS.indexOf(mon!.toLowerCase());
  if (month < 0) return null;
  const start = Number(hhmm!.slice(0, 2)) * 60 + Number(hhmm!.slice(2));
  const end = Number(lh) * 60 + Number(lm);
  // A scan that starts before midnight and ends after it belongs to the day before the label's.
  const day = Date.UTC(Number(y), month, Number(d)) - (start > end ? 86_400_000 : 0);
  return { hhmm: hhmm!, takenAt: day + start * 60_000 };
}

export const jmaUrl = (hhmm: string): string => `https://${JMA_HOST}/mscweb/data/himawari/img/fd_/fd__trm_${hhmm}.jpg`;

export const himawari: Provider = {
  id: 'himawari',
  name: L('Himawari', 'Himawari', 'Himawari', '向日葵', '向日葵'),
  craft: 'Himawari-9',
  subLon: 140.7,
  hosts: [JMA_HOST],
  credit: () => 'JMA · NOAA/NESDIS · CSU/CIRA',
  creditLong: () => 'Himawari-9 True Color Reproduction · Source: Japan Meteorological Agency website · JMA, NOAA/NESDIS, CSU/CIRA',
  async plan(net, _px, o): Promise<Shot> {
    const latest = parseJmaLatest(await net.text(JMA_PAGE, o.signal ? { signal: o.signal } : {}));
    if (!latest) throw new Error('no image listed on the JMA page');
    return { url: jmaUrl(latest.hhmm), takenAt: latest.takenAt, px: JMA_PX, kind: 'disk', frame: { scale: JMA_SCALE, maskBottom: 0 } };
  },
};
