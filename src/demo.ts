/**
 * For the gallery, the editor and the tests, where there is no network: the
 * satellite's view drawn here (the land, the night where it is now) and
 * marked as a sample. Never a satellite image.
 */
import type { EarthData } from './earth.ts';
import { meteosat } from './satellites/eumetsat.ts';

export const demoEarth = (_now: number): EarthData => ({
  sat: 'meteosat',
  name: meteosat.name,
  craft: meteosat.craft,
  subLon: meteosat.subLon,
  credit: 'Kiosko',
  creditLong: 'Kiosko',
  frames: [],
  stale: false,
  error: null,
  demo: true,
});
