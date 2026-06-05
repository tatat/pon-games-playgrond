import { describe, expect, it } from 'vitest'
import type { Section } from './course'
import { FLOOR_BOTTOM } from './grid-authoring'
import { RandomSource } from './random-source'

// The generator has no catalogue of pieces; it walks a surface height cell by cell
// under reachability constraints. So the tests reconstruct that continuous surface
// from the emitted blocks (across section seams too) and assert the physical
// invariants directly — there is no "this primitive is safe" shortcut to lean on.

// The contract the walk guarantees (mirrors random-source.ts / constants.ts physics).
const HMIN = -4 // shallowest valley a climb-back recovers from
const HMAX = 6 // a double jump above ground
const GAP_MAX = 3 // bare hole the slowest speed's jump clears (≈3.3 cells)
const WALL_MAX = 4 // tallest up-step the double jump clears

/** Pull `count` sections from a fresh source on `seed`. */
function generate(seed: number, count: number): Section[] {
  const src = new RandomSource(seed)
  return Array.from({ length: count }, () => src.next())
}

interface World {
  /** Surface height per global column, or null where the floor is open (a gap). */
  floor: (number | null)[]
  /** Whether a column has anything to stand on (floor terrain OR a ledge). */
  supported: boolean[]
}

/** Reconstruct the continuous world the walker would lay out from a run of
 * sections, concatenated as the `CourseWalker` places them (so seams are tested). */
function worldOf(sections: Section[]): World {
  const width = sections.reduce((w, s) => w + s.width, 0)
  const floor: (number | null)[] = Array.from({ length: width }, () => null)
  const supported: boolean[] = Array.from({ length: width }, () => false)
  let off = 0
  for (const s of sections) {
    for (const b of s.blocks) {
      // A floor terrain fills down to FLOOR_BOTTOM; a ceiling (tunnel roof) does not.
      const isFloor = b.type === 'terrain' && b.y - b.h === FLOOR_BOTTOM
      if (isFloor) {
        for (let x = b.x; x < b.x + b.w; x++) {
          const gx = off + x
          floor[gx] = floor[gx] === null ? b.y : Math.max(floor[gx] as number, b.y)
          supported[gx] = true
        }
      } else if (b.type === 'ledge') {
        for (let x = b.x; x < b.x + b.w; x++) supported[off + x] = true
      }
    }
    off += s.width
  }
  return { floor, supported }
}

describe('RandomSource', () => {
  it('is deterministic: same seed → identical section sequence', () => {
    expect(JSON.stringify(generate(12345, 200))).toEqual(JSON.stringify(generate(12345, 200)))
  })

  it('produces different courses for different seeds', () => {
    const a = JSON.stringify(generate(1, 100))
    const b = JSON.stringify(generate(2, 100))
    const c = JSON.stringify(generate(3, 100))
    expect(new Set([a, b, c]).size).toBeGreaterThan(1)
  })

  it('opens on safe flat ground under the runner', () => {
    for (const seed of [0, 1, 7, 99, 100000]) {
      const [first] = generate(seed, 1)
      if (!first) throw new Error('no section')
      expect(first.blocks.some((b) => b.type === 'pit' || b.type === 'hazard')).toBe(false)
      // Cells 0..6 (the start screen under PLAYER_X) are floored at ground level.
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

  it('walks a continuous, always-reachable surface across section seams', () => {
    for (const seed of [5, 50, 500, 5000, 44444]) {
      const { floor, supported } = worldOf(generate(seed, 80))
      // Begins and ends on solid ground (no run starts or ends over a hole).
      expect(supported[0]).toBe(true)
      expect(supported[supported.length - 1]).toBe(true)

      let lastSupported = -1
      for (let x = 0; x < supported.length; x++) {
        if (supported[x]) {
          // No run of empty columns between two supports exceeds the jump reach —
          // covers bare gaps and the sub-gaps of a ledge-bridged crossing alike.
          if (lastSupported >= 0) {
            expect(x - lastSupported - 1).toBeLessThanOrEqual(GAP_MAX)
          }
          lastSupported = x
        }
        const h = floor[x]
        if (h != null) {
          // Surface stays inside the reachable band.
          expect(h).toBeGreaterThanOrEqual(HMIN)
          expect(h).toBeLessThanOrEqual(HMAX)
          // An up-step between adjacent floor columns is a wall — never above the
          // double jump's ceiling. (Drops are free, so down-steps are unbounded.)
          const next = floor[x + 1]
          if (next !== null && next !== undefined) {
            expect(next - h).toBeLessThanOrEqual(WALL_MAX)
          }
        }
      }
    }
  })

  it('never stacks two floor terrains on the same column', () => {
    // Each column carries one surface height, so a below-ground valley floor is
    // never buried behind a ground-level wall.
    for (const seed of [11, 222, 3333]) {
      for (const s of generate(seed, 300)) {
        const floors = s.blocks.filter((b) => b.type === 'terrain' && b.y - b.h === FLOOR_BOTTOM)
        for (let i = 0; i < floors.length; i++) {
          for (let j = i + 1; j < floors.length; j++) {
            const a = floors[i]
            const b = floors[j]
            if (!a || !b) continue
            expect(a.x < b.x + b.w && b.x < a.x + a.w).toBe(false)
          }
        }
      }
    }
  })

  it('emits coins so a random run can score beyond distance', () => {
    const coins = generate(31, 200).flatMap((s) => s.blocks.filter((b) => b.type === 'coin'))
    expect(coins.length).toBeGreaterThan(20)
  })
})
