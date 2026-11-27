/**
 * The network, as the satellite providers see it: text through the SDK's
 * client (its User-Agent, rate-limit pauses), and images as bytes, with the
 * same User-Agent, a size limit and a conditional request (`If-Modified-Since`)
 * so an image that hasn't changed isn't downloaded again. Tests pass a fake.
 */
import { createHttp, HttpError } from '@kiosko/sdk';

export const VERSION = '0.1.0';
/** What the SDK sends as User-Agent: the plugin, then Kiosko. Never the person. */
export const AGENT = `kiosko-plugin-world/${VERSION}`;
export const USER_AGENT = `${AGENT} Kiosko (+https://kioskolcd.dev)`;

export type ImageResult = { status: 304 } | { status: 200; buf: Buffer; lastModified: number | null };

export interface Net {
  text(url: string, o?: { signal?: AbortSignal }): Promise<string>;
  /** An image: at most `maxBytes`; 304 when not modified since `since` (epoch ms). */
  image(url: string, o?: { since?: number | null; maxBytes?: number; signal?: AbortSignal }): Promise<ImageResult>;
}

/** Bigger than any image asked for here (a 1808 px GOES disk is about 1.7 MB). */
export const MAX_BYTES = 8 * 1024 * 1024;

export function createNet(o: { fetch?: typeof fetch; now?: () => number } = {}): Net {
  const doFetch = o.fetch ?? fetch;
  const http = createHttp({ agent: AGENT, ...(o.fetch ? { fetch: o.fetch } : {}), ...(o.now ? { now: o.now } : {}) });
  return {
    async text(url, req = {}) {
      return (await http.text(url, req.signal ? { signal: req.signal } : {})).data;
    },
    async image(url, req = {}) {
      const resting = http.resting(url);
      if (resting) throw new HttpError(`${new URL(url).host} asked to wait`, { status: 429, url, retryAt: resting });
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/png;q=0.9,image/*;q=0.8' };
      if (req.since) headers['If-Modified-Since'] = new Date(req.since).toUTCString();
      const res = await doFetch(url, { headers, redirect: 'follow', ...(req.signal ? { signal: req.signal } : {}) });
      if (res.status === 304) return { status: 304 };
      if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, { status: res.status, url });
      const max = req.maxBytes ?? MAX_BYTES;
      const declared = Number(res.headers.get('content-length'));
      if (declared > max) {
        await res.body?.cancel();
        throw new Error(`${declared} bytes, more than ${max}`);
      }
      const type = res.headers.get('content-type') ?? '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > max) throw new Error(`${buf.length} bytes, more than ${max}`);
      // A WMS server answers errors with 200 and XML.
      if (type && !type.startsWith('image/')) throw new Error(`not an image (${type}) from ${new URL(url).host}`);
      const lm = Date.parse(res.headers.get('last-modified') ?? '');
      return { status: 200, buf, lastModified: Number.isFinite(lm) ? lm : null };
    },
  };
}
