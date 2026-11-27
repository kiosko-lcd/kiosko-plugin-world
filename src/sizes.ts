/**
 * How big a disk the panels need: the satellite widget and the interlude
 * note the diameter they paint at, and the source asks for an image to suit
 * the largest seen lately (no bigger), in a few steps, so a slightly bigger
 * tile doesn't mean another download.
 */
export const PX_STEPS = [240, 360, 480, 678, 900, 1200];
export const DEFAULT_PX = 480;
const FORGET_MS = 24 * 3_600_000;
const seen = new Map<number, number>();

export const stepFor = (px: number): number => PX_STEPS.find((s) => s >= px) ?? PX_STEPS[PX_STEPS.length - 1]!;

/** Notes a disk painted `px` across. Cheap: called on every paint. */
export function noteDisk(px: number, now: number): void {
  if (!(px > 0)) return;
  const k = stepFor(Math.round(px));
  const at = seen.get(k);
  if (at === undefined || now - at > 5 * 60_000) seen.set(k, now);
}

/** The diameter to ask for: the largest noted in the last day; `DEFAULT_PX` before any. */
export function wantedPx(now: number): number {
  let px = 0;
  for (const [k, at] of seen) {
    if (now - at > FORGET_MS) seen.delete(k);
    else px = Math.max(px, k);
  }
  return px || DEFAULT_PX;
}

export function forgetSizes(): void {
  seen.clear();
}
