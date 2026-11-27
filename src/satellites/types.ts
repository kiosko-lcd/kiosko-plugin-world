import type { Localized } from '@kiosko/sdk';
import type { Net } from '../net.ts';

export type SatId = 'goes-west' | 'goes-east' | 'meteosat' | 'meteosat-iodc' | 'himawari';

/** What to download for the latest image. */
export interface Shot {
  url: string;
  /** When it was taken (start of the scan), if the provider says before the download; else the file's Last-Modified. */
  takenAt: number | null;
  /** Its size: the disk's diameter, or the side of a latitude-longitude square. */
  px: number;
  /** A full disk as the satellite sees it, or a latitude-longitude grid to turn into one. */
  kind: 'disk' | 'latlon';
  /** For `latlon`: the box it covers, degrees. */
  bbox?: { west: number; south: number; east: number; north: number };
  /** For `disk`: the Earth's diameter over the image's width, and rows at the bottom to hide (a caption bar). */
  frame?: { scale: number; maskBottom: number };
}

export interface Provider {
  id: SatId;
  /** The satellite's position name: "GOES-East". */
  name: Localized;
  /** The spacecraft now in that slot: "GOES-19". */
  craft: string;
  /** Longitude it hangs over. */
  subLon: number;
  /** Hosts it contacts. */
  hosts: string[];
  /**
   * The credit its terms ask for, word for word and in their language: always
   * drawn whole (wrapped, and in turns on small tiles), never shortened.
   */
  credit: (year: number) => string;
  /** The latest image at about `px` across. */
  plan: (net: Net, px: number, o: { now: number; signal?: AbortSignal }) => Promise<Shot>;
}
