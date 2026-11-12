/** Small seeded random generator (mulberry32), so property tests are repeatable. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer from min to max, both included. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** A non-empty random subset. */
    subset<T>(values: readonly T[]): T[] {
      const picked = values.filter(() => next() < 0.5);
      return picked.length > 0 ? picked : [values[Math.floor(next() * values.length)] as T];
    },
  };
}
