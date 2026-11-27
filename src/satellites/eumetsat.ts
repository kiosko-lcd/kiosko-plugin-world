/**
 * Meteosat: EUMETSAT's EUMETView map service (WMS, no key). The 0° slot
 * (Meteosat-12, MTG-I1: Europe, Africa, the Atlantic) as its GeoColour RGB,
 * which has city lights at night; the Indian Ocean slot (Meteosat-9 at
 * 45.5°E) as Natural Colour Enhanced. The service gives them in latitude and
 * longitude; the plugin turns them back into the disk the satellite sees.
 *
 * Terms: RGB images are "Advanced Image Products", "Core" under EUMETSAT's
 * Data Policy (CC BY 4.0), with the attribution "[Contains modified]
 * EUMETSAT [Meteosat] [data/product] [year]".
 * https://www.eumetsat.int/data-policy  https://view.eumetsat.int
 */
import { L } from '../i18n.ts';
import type { Provider, Shot } from './types.ts';

export const EUM_HOST = 'view.eumetsat.int';
/** How far from the sub-satellite point the disk reaches, degrees (a bit past the 81.3° the service covers). */
export const REACH = 81.5;
/** Pixels across the latitude-longitude square per pixel of the disk wanted (the disk's middle needs about 1.66). */
export const OVERSAMPLE = 1.7;
export const EUM_MIN = 400;
export const EUM_MAX = 2048;

/** The time of the latest image, from a layer's own capabilities: `<Dimension name="time" default="2026-11-27T07:30:00Z" …>`. */
export function parseWmsTime(xml: string): number | null {
  const m = /<Dimension[^>]*name="time"[^>]*default="([^"]+)"/.exec(xml) ?? /<Dimension[^>]*default="([^"]+)"[^>]*name="time"/.exec(xml);
  const t = m ? Date.parse(m[1]!) : NaN;
  return Number.isFinite(t) ? t : null;
}

const ns = (layer: string) => layer.split(':') as [string, string];

export const capsUrl = (layer: string): string => {
  const [w, l] = ns(layer);
  return `https://${EUM_HOST}/geoserver/${w}/${l}/ows?service=WMS&version=1.3.0&request=GetCapabilities`;
};

/** A GetMap for the square around the sub-satellite point at `time`, `side` px. CRS:84 is longitude first. */
export function getMapUrl(layer: string, subLon: number, time: number, side: number): { url: string; bbox: Shot['bbox'] & object } {
  const bbox = { west: subLon - REACH, south: -REACH, east: subLon + REACH, north: REACH };
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: layer,
    styles: '',
    format: 'image/jpeg',
    // Where there is no data: black, like space (some layers default to white).
    bgcolor: '0x000000',
    crs: 'CRS:84',
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].map((v) => v.toFixed(2)).join(','),
    width: String(side),
    height: String(side),
    time: new Date(time).toISOString().replace('.000Z', 'Z'),
  });
  return { url: `https://${EUM_HOST}/geoserver/wms?${q.toString()}`, bbox };
}

export const sideFor = (px: number): number => Math.max(EUM_MIN, Math.min(EUM_MAX, Math.round((px * OVERSAMPLE) / 16) * 16));

function eumetsat(id: 'meteosat' | 'meteosat-iodc', craft: string, subLon: number, layer: string, name: ReturnType<typeof L>): Provider {
  return {
    id,
    name,
    craft,
    subLon,
    hosts: [EUM_HOST],
    // EUMETSAT's attribution, "[Contains modified] EUMETSAT [Meteosat] [data/product] [year]": these are reprojected, so modified; and the licence, as CC BY asks.
    credit: (year) => `Contains modified EUMETSAT Meteosat data ${year} · CC BY 4.0`,
    async plan(net, px, o): Promise<Shot> {
      const time = parseWmsTime(await net.text(capsUrl(layer), o.signal ? { signal: o.signal } : {}));
      if (time === null) throw new Error(`no time for ${layer} on EUMETView`);
      const side = sideFor(px);
      const { url, bbox } = getMapUrl(layer, subLon, time, side);
      return { url, takenAt: time, px: side, kind: 'latlon', bbox };
    },
  };
}

export const meteosat = eumetsat('meteosat', 'Meteosat-12', 0, 'mtg_fd:rgb_geocolour', L('Meteosat', 'Meteosat', 'Meteosat', 'Meteosat 气象卫星', 'Meteosat 氣象衛星'));
export const meteosatIodc = eumetsat(
  'meteosat-iodc',
  'Meteosat-9',
  45.5,
  'msg_iodc:rgb_naturalenhncd',
  L('Meteosat (Indian Ocean)', 'Meteosat (océano Índico)', 'Meteosat (Indischer Ozean)', 'Meteosat（印度洋）', 'Meteosat（印度洋）'),
);
