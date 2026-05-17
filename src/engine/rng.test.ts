import { describe, expect, it } from 'vitest'
import { Rng } from './rng'

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces a different sequence for a different seed', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() returns values in [0, 1)', () => {
    const rng = new Rng(123)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('intRange returns inclusive bounds', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.intRange(3, 5)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(5)
    }
  })

  it('pick returns an element of the array', () => {
    const rng = new Rng(99)
    const arr = ['a', 'b', 'c', 'd']
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr))
    }
  })

  it('pick throws on an empty array', () => {
    const rng = new Rng(0)
    expect(() => rng.pick([])).toThrow()
  })

  it('chance is approximately calibrated', () => {
    const rng = new Rng(2026)
    let hits = 0
    const n = 10_000
    for (let i = 0; i < n; i++) if (rng.chance(0.3)) hits++
    // 0.3 expected; tolerate +/- 0.02 (3-sigma is ~0.014 here).
    expect(hits / n).toBeGreaterThan(0.27)
    expect(hits / n).toBeLessThan(0.33)
  })

  it('substitutes a non-zero state when seeded with 0', () => {
    const rng = new Rng(0)
    // The first 3 outputs should not all be 0.
    const v = [rng.next(), rng.next(), rng.next()]
    expect(v.some((x) => x !== 0)).toBe(true)
  })
})
