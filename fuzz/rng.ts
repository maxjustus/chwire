import type { Rng } from "../native/codecs/base.ts";

/**
 * splitmix32 finalizer: avalanche a seed so structured or nearby seeds — e.g.
 * the arithmetic progression of per-iteration seeds, each XORed with a small
 * salt — yield streams decorrelated from the very first draw. mulberry32 scrambles
 * its first output too little on its own: feeding it raw structured seeds biases
 * a single first-bit draw (`int(0, 1)`) hard toward one value.
 */
function mixSeed(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * mulberry32 PRNG: deterministic, seedable, fast. Seeds are derived from the
 * iteration index so a failing fuzz case replays bit-for-bit.
 */
export function makeRng(seed: number): Rng {
  let state = mixSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}
