/**
 * The weather satellites whose full-disk images are free to show, each a
 * module: where it hangs over the equator, how to ask for its latest image
 * at about the size the panels need, and how to credit it. All without keys.
 *
 * - GOES-East and GOES-West: NOAA/NESDIS/STAR's GeoColor (CIRA), public
 *   domain (works of the US federal government).
 * - Himawari-9: the Japan Meteorological Agency's True Color Reproduction
 *   images, under the JMA website's terms (Public Data License 1.0,
 *   compatible with CC BY 4.0), crediting JMA, NOAA/NESDIS and CSU/CIRA as
 *   its TCR terms ask.
 * - Meteosat (0°, Europe and Africa) and Meteosat IODC (45.5°E, the Indian
 *   Ocean): EUMETSAT's EUMETView map service. Its RGB images are "Advanced
 *   Image Products", "Core" data under EUMETSAT's Data Policy: free and
 *   unrestricted under CC BY 4.0, with the attribution the policy gives.
 */
import { wrapLon } from '../astro.ts';
import { goesEast, goesWest } from './goes.ts';
import { himawari } from './jma.ts';
import { meteosat, meteosatIodc } from './eumetsat.ts';
import type { Provider, SatId } from './types.ts';

export type { Provider, SatId, Shot } from './types.ts';

export const PROVIDERS: Record<SatId, Provider> = {
  'goes-west': goesWest,
  'goes-east': goesEast,
  meteosat,
  'meteosat-iodc': meteosatIodc,
  himawari,
};

/** West to east. */
export const SAT_IDS: SatId[] = ['goes-west', 'goes-east', 'meteosat', 'meteosat-iodc', 'himawari'];

/** The satellite that sees a longitude best: the one hanging closest to it. */
export function closestTo(lon: number): SatId {
  let best: SatId = 'meteosat';
  let d = Infinity;
  for (const id of SAT_IDS) {
    const x = Math.abs(wrapLon(lon - PROVIDERS[id].subLon));
    if (x < d) [best, d] = [id, x];
  }
  return best;
}

/** A longitude from a time zone offset (minutes east of UTC): 15° an hour. */
export const lonOfOffset = (mins: number): number => wrapLon(mins / 4);

export function providerOf(id: string): Provider {
  return PROVIDERS[id as SatId] ?? meteosat;
}
