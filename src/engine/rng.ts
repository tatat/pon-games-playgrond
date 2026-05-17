/** Seeded RNG. Mulberry32 today; the implementation is swappable behind this API. */
export class Rng {
  private state: number

  constructor(seed: number) {
    // A zero state collapses Mulberry32 to a degenerate stream; substitute a non-zero seed.
    this.state = seed >>> 0 || 0xdeadbeef
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Inclusive integer range [min, max]. */
  intRange(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  /** Random element from a non-empty array. Throws on empty arrays so simulation bugs
   * surface immediately rather than propagating an undefined into game state. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: array is empty')
    return arr[Math.floor(this.next() * arr.length)] as T
  }

  /** True with probability p in [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p
  }
}
