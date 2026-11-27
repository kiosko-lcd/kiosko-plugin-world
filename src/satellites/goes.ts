/**
 * GOES-East (GOES-19, 75.2°W) and GOES-West (GOES-18, 137.2°W): the latest
 * GeoColor full disk from NOAA/NESDIS/STAR's image site, which keeps it at a
 * fixed address per size and renews it every 10 minutes. Public domain.
 * https://www.star.nesdis.noaa.gov/GOES/
 */
import { L } from '../i18n.ts';
import type { Provider, Shot } from './types.ts';

export const GOES_HOST = 'cdn.star.nesdis.noaa.gov';
/** Sizes on offer (there are also 5424 and 10848: far more than any panel). */
export const GOES_SIZES = [339, 678, 1808];

/** The smallest size at or over `px` (the largest offered past it). */
export function goesSize(px: number): number {
  return GOES_SIZES.find((s) => s >= px) ?? GOES_SIZES[GOES_SIZES.length - 1]!;
}

/** Rows of the caption bar NOAA adds at the bottom (date, NOAA/NESDIS/STAR, satellite), per size, plus one. */
export const GOES_BAR: Record<number, number> = { 339: 15, 678: 17, 1808: 29 };

export function goesUrl(craft: string, px: number): string {
  const s = goesSize(px);
  return `https://${GOES_HOST}/${craft.replace('-', '')}/ABI/FD/GEOCOLOR/${s}x${s}.jpg`;
}

function goes(id: 'goes-east' | 'goes-west', craft: string, subLon: number, name: ReturnType<typeof L>): Provider {
  return {
    id,
    name,
    craft,
    subLon,
    hosts: [GOES_HOST],
    credit: () => 'NOAA/NESDIS/STAR · CIRA',
    creditLong: () => `${craft} GeoColor · NOAA/NESDIS/STAR, CIRA · public domain`,
    // The address is fixed; when it was taken is read from the file (see `goesTakenAt`).
    async plan(_net, px): Promise<Shot> {
      const s = goesSize(px);
      return { url: goesUrl(craft, px), takenAt: null, px: s, kind: 'disk', frame: { scale: 1, maskBottom: GOES_BAR[s] ?? Math.ceil(s * 0.042) } };
    },
  };
}

export const goesEast = goes('goes-east', 'GOES-19', -75.2, L('GOES-East', 'GOES-Este', 'GOES-Ost', 'GOES 东星', 'GOES 東星'));
export const goesWest = goes('goes-west', 'GOES-18', -137.2, L('GOES-West', 'GOES-Oeste', 'GOES-West', 'GOES 西星', 'GOES 西星'));

/**
 * When a GOES full disk was taken, from its file's Last-Modified: the scan
 * starts every 10 minutes and the image reaches the site 12 to 16 minutes
 * after it starts.
 */
export function goesTakenAt(lastModified: number): number {
  return Math.floor((lastModified - 12 * 60_000) / 600_000) * 600_000;
}
