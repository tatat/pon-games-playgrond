import { describe, expect, it } from 'vitest'
import type { Section } from './course'
import type { Block } from './obstacles'
import { RandomSource } from './random-source'

/** Pull `count` sections from a fresh source on `seed`. */
function generate(seed: number, count: number): Section[] {
  const src = new RandomSource(seed)
  return Array.from({ length: count }, () => src.next())
}

describe('RandomSource', () => {
  it('is deterministic: same seed → identical section sequence', () => {
    const a = generate(12345, 200)
    const b = generate(12345, 200)
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })

  it('produces different courses for different seeds', () => {
    const a = JSON.stringify(generate(1, 100))
    const b = JSON.stringify(generate(2, 100))
    const c = JSON.stringify(generate(3, 100))
    // Not all three identical (a fixed/ignored seed would make them equal).
    expect(new Set([a, b, c]).size).toBeGreaterThan(1)
  })

  it('opens on safe flat ground under the runner', () => {
    // The first section must floor the player's start cells and carry no lethal
    // block, so a fresh run never begins over a pit/hazard.
    for (const seed of [0, 1, 7, 99, 100000]) {
      const [first] = generate(seed, 1)
      if (!first) throw new Error('no section')
      expect(first.blocks.some((b) => b.type === 'pit' || b.type === 'hazard')).toBe(false)
      // Cells 0..6 (the start screen under PLAYER_X) are floored.
      for (let c = 0; c < 7; c++) {
        const floored = first.blocks.some(
          (b) => b.type === 'terrain' && b.y === 0 && b.x <= c && c < b.x + b.w,
        )
        expect(floored).toBe(true)
      }
    }
  })

  it('keeps every block within its section width (positive width)', () => {
    for (const seed of [3, 42, 777, 2024]) {
      for (const s of generate(seed, 300)) {
        expect(s.width).toBeGreaterThan(0)
        for (const b of s.blocks) {
          expect(b.x).toBeGreaterThanOrEqual(0)
          expect(b.x + b.w).toBeLessThanOrEqual(s.width)
        }
      }
    }
  })

  it('caps a bare pit at the single jump reach (≤3 cells)', () => {
    // A pit with no ledge stepping stone in the section must be jumpable in one
    // hop — one jump carries ≈3.3 cells at SPEED_START (the shortest-reach case).
    for (const seed of [5, 50, 500, 5000]) {
      for (const s of generate(seed, 400)) {
        const hasLedge = s.blocks.some((b) => b.type === 'ledge')
        if (hasLedge) continue
        for (const b of s.blocks) {
          if (b.type === 'pit') expect(b.w).toBeLessThanOrEqual(3)
        }
      }
    }
  })

  it('never requires more than a double jump (no surface above 4 cells)', () => {
    // Single jump clears ≤2 cells, double ≤4. No terrain/ledge top sits higher
    // than 4 cells, so every climb is within the double jump.
    for (const seed of [9, 90, 900, 9000]) {
      for (const s of generate(seed, 400)) {
        for (const b of s.blocks) {
          if (b.type === 'terrain' || b.type === 'ledge') {
            expect(b.y).toBeLessThanOrEqual(4)
          }
        }
      }
    }
  })

  it('never buries a below-ground surface under a ground-level floor', () => {
    // A terrain block below the ground line (a valley floor / climb-out step) is
    // only reachable inside an opened gap; if a y=0 floor covers the same cells it
    // is buried behind a vertical wall. Guards the valley climb-out regression.
    for (const seed of [11, 222, 3333, 44444]) {
      for (const s of generate(seed, 400)) {
        const floors = s.blocks.filter((b) => b.type === 'terrain' && b.y === 0)
        const below = s.blocks.filter((b) => b.type === 'terrain' && b.y < 0)
        for (const lo of below) {
          for (const f of floors) {
            const overlaps = lo.x < f.x + f.w && f.x < lo.x + lo.w
            expect(overlaps).toBe(false)
          }
        }
      }
    }
  })

  it('emits coins so a random run can score beyond distance', () => {
    const coins = generate(31, 200).flatMap((s) => s.blocks.filter((b: Block) => b.type === 'coin'))
    expect(coins.length).toBeGreaterThan(20)
  })
})
