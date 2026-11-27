/**
 * The latest full disk of a satellite, kept on disk: the provider is asked
 * at most every 10 minutes (more slowly after failures), an image that
 * hasn't changed isn't downloaded again, and when the provider is down the
 * last image stays on screen, marked as old.
 */
import type { Localized } from '@kiosko/sdk';
import type { Net } from './net.ts';
import { goesTakenAt } from './satellites/goes.ts';
import type { Provider, SatId } from './satellites/index.ts';
import { emptyState, imageName, type Frame, type State, type Store } from './store.ts';

/** Never ask a provider more often: they renew their images every 10 minutes. */
export const MIN_GAP_MS = 10 * 60_000;
/** After failures: 10, 20, 40… minutes, up to this. */
export const MAX_BACKOFF_MS = 2 * 3_600_000;
/** Images kept for the interlude: four hours at one every 10 minutes. */
export const KEEP = 24;
/** An image older than this is shown as old. */
export const STALE_MS = 60 * 60_000;

export interface EarthFrame {
  /** Absolute path. */
  file: string;
  takenAt: number;
  px: number;
  kind: Frame['kind'];
  bbox?: Frame['bbox'];
  frame?: Frame['frame'];
}

export interface EarthData {
  sat: SatId;
  name: Localized;
  craft: string;
  subLon: number;
  credit: string;
  creditLong: string;
  /** Oldest first; the last is the one to show. Empty before the first image. */
  frames: EarthFrame[];
  stale: boolean;
  /** The last failure, while the provider keeps failing. */
  error: string | null;
  demo?: boolean;
}

export interface EarthEnv {
  now: number;
  /** Disk size the panels need, px. */
  px: number;
  signal?: AbortSignal;
  log?: (m: string) => void;
}

function dataOf(p: Provider, s: State, store: Store, now: number): EarthData {
  const last = s.frames[s.frames.length - 1];
  const year = new Date(last?.takenAt ?? now).getUTCFullYear();
  return {
    sat: p.id,
    name: p.name,
    craft: p.craft,
    subLon: p.subLon,
    credit: p.credit(year),
    creditLong: p.creditLong(year),
    frames: s.frames.map((f) => ({ file: store.path(f.file), takenAt: f.takenAt, px: f.px, kind: f.kind, ...(f.bbox ? { bbox: f.bbox } : {}), ...(f.frame ? { frame: f.frame } : {}) })),
    stale: !last || now - last.takenAt > STALE_MS,
    error: s.error,
  };
}

/** Reads the latest image of `p`, downloading it only when there is a new one (or a bigger one is needed). */
export async function readEarth(p: Provider, env: EarthEnv, deps: { net: Net; store: Store }): Promise<EarthData> {
  const { net, store } = deps;
  const { now } = env;
  let s = (await store.load(p.id)) ?? emptyState(p.id);
  // Files deleted behind our back (a cache cleaned): forget them.
  const present: Frame[] = [];
  for (const f of s.frames) if (await store.exists(f.file)) present.push(f);
  if (present.length !== s.frames.length) s = { ...s, frames: present };

  const last = s.frames[s.frames.length - 1];
  const due = now - s.attemptAt >= MIN_GAP_MS && now >= s.retryAt;
  if (!due) return dataOf(p, s, store, now);

  s = { ...s, attemptAt: now };
  try {
    const shot = await p.plan(net, env.px, { now, ...(env.signal ? { signal: env.signal } : {}) });
    const same = !!last && shot.takenAt !== null && last.takenAt === shot.takenAt && last.px >= shot.px;
    if (same) {
      s = { ...s, failures: 0, retryAt: 0, error: null };
    } else {
      // Same address as last time (GOES): ask only if it changed since.
      const since = last && last.url === shot.url ? last.lastModified : null;
      const res = await net.image(shot.url, { since, ...(env.signal ? { signal: env.signal } : {}) });
      if (res.status === 304) {
        s = { ...s, failures: 0, retryAt: 0, error: null };
      } else {
        const takenAt = shot.takenAt ?? (res.lastModified !== null && p.id.startsWith('goes') ? goesTakenAt(res.lastModified) : (res.lastModified ?? now));
        if (last && last.takenAt === takenAt && last.px === shot.px) {
          // The same image again (no Last-Modified support): nothing new to keep.
          s = { ...s, failures: 0, retryAt: 0, error: null };
        } else {
          const file = imageName(p.id, takenAt, shot.px);
          await store.writeImage(file, res.buf);
          const frame: Frame = { file, url: shot.url, takenAt, lastModified: res.lastModified, px: shot.px, kind: shot.kind, ...(shot.bbox ? { bbox: shot.bbox } : {}), ...(shot.frame ? { frame: shot.frame } : {}) };
          // A bigger copy of the same moment replaces the smaller one.
          const frames = [...s.frames.filter((f) => f.takenAt !== takenAt), frame].sort((a, b) => a.takenAt - b.takenAt).slice(-KEEP);
          s = { ...s, frames, failures: 0, retryAt: 0, error: null };
          await store.prune(p.id, frames.map((f) => f.file));
          env.log?.(`${p.craft}: new image from ${new Date(takenAt).toISOString()}, ${shot.px} px`);
        }
      }
    }
  } catch (err) {
    const failures = s.failures + 1;
    const wait = Math.min(MAX_BACKOFF_MS, MIN_GAP_MS * 2 ** (failures - 1));
    const msg = err instanceof Error ? err.message : String(err);
    s = { ...s, failures, retryAt: now + wait, error: msg };
    env.log?.(`${p.craft}: ${msg}; next try in ${Math.round(wait / 60_000)} min`);
  }
  await store.save(s);
  return dataOf(p, s, store, now);
}
