/**
 * The satellite images on disk: a record per satellite and its last images,
 * so a restart (or a provider that is down) doesn't mean another download,
 * and the interlude has a few hours of them to play.
 */
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SatId, Shot } from './satellites/index.ts';

export interface Frame {
  /** File name in the store. */
  file: string;
  url: string;
  takenAt: number;
  /** The file's Last-Modified, for a conditional request next time. */
  lastModified: number | null;
  px: number;
  kind: Shot['kind'];
  bbox?: Shot['bbox'];
  frame?: Shot['frame'];
}

export interface State {
  version: 1;
  sat: SatId;
  /** Oldest first. */
  frames: Frame[];
  /** Last time the provider was asked, its failures in a row and when to ask again. */
  attemptAt: number;
  failures: number;
  retryAt: number;
  error: string | null;
}

export const emptyState = (sat: SatId): State => ({ version: 1, sat, frames: [], attemptAt: 0, failures: 0, retryAt: 0, error: null });

export interface Store {
  load(sat: SatId): Promise<State | undefined>;
  save(s: State): Promise<void>;
  writeImage(name: string, buf: Buffer): Promise<void>;
  /** Absolute path of a file in the store. */
  path(name: string): string;
  exists(name: string): Promise<boolean>;
  /** Removes this satellite's image files not in `keep`. */
  prune(sat: SatId, keep: string[]): Promise<void>;
}

export const imageName = (sat: SatId, takenAt: number, px: number): string => `disk-${sat}-${new Date(takenAt).toISOString().replace(/[-:]/g, '').slice(0, 13)}-${px}.jpg`;

export function fileStore(dir: string): Store {
  const memory = new Map<SatId, State>();
  const atomic = async (path: string, data: string | Buffer) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  };
  return {
    async load(sat) {
      const had = memory.get(sat);
      if (had) return had;
      try {
        const s = JSON.parse(await readFile(join(dir, `earth-${sat}.json`), 'utf8')) as State;
        if (s?.version !== 1 || s.sat !== sat || !Array.isArray(s.frames)) return undefined;
        memory.set(sat, s);
        return s;
      } catch {
        return undefined;
      }
    },
    async save(s) {
      memory.set(s.sat, s);
      await atomic(join(dir, `earth-${s.sat}.json`), JSON.stringify(s));
    },
    async writeImage(name, buf) {
      await atomic(join(dir, name), buf);
    },
    path: (name) => join(dir, name),
    async exists(name) {
      try {
        return (await stat(join(dir, name))).size > 0;
      } catch {
        return false;
      }
    },
    async prune(sat, keep) {
      let names: string[] = [];
      try {
        names = await readdir(dir);
      } catch {
        return;
      }
      for (const n of names) if (n.startsWith(`disk-${sat}-`) && !keep.includes(n)) await unlink(join(dir, n)).catch(() => {});
    },
  };
}

/** The same in memory, for the tests. */
export function memoryStore(): Store & { files: Map<string, Buffer>; saves: number } {
  const states = new Map<SatId, State>();
  const files = new Map<string, Buffer>();
  const s = {
    files,
    saves: 0,
    async load(sat: SatId) {
      const x = states.get(sat);
      return x ? structuredClone(x) : undefined;
    },
    async save(x: State) {
      s.saves++;
      states.set(x.sat, structuredClone(x));
    },
    async writeImage(name: string, buf: Buffer) {
      files.set(name, buf);
    },
    path: (name: string) => `/mem/${name}`,
    async exists(name: string) {
      return files.has(name);
    },
    async prune(sat: SatId, keep: string[]) {
      for (const n of [...files.keys()]) if (n.startsWith(`disk-${sat}-`) && !keep.includes(n)) files.delete(n);
    },
  };
  return s;
}
