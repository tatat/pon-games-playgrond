import { describe, expect, it } from 'vitest'
import { DESIGN_W } from '../../engine/constants'
import { CELL, GROUND_Y } from './constants'
import { AuthoredSource, type Course, CourseWalker, type SectionSource } from './course'
import type { Block } from './obstacles'
import { SAMPLE_COURSE, SAMPLE_LOOP_START } from './sample-course'

// A tiny deterministic course (grid cells) for precise assertions. Each section is
// a single 1×1 block at offset 0; widths are in cells. The walker emits px blocks,
// so an offset-0 block lands at the section's start cursor (px).
const blk = (type: Block['type']): Block => ({ type, x: 0, y: 0, w: 1, h: 1 })
const A: Course = [
  { name: 'a', width: 3, blocks: [blk('terrain')] }, // 3 cells = 288px
  { name: 'b', width: 4, blocks: [blk('hazard')] }, // 4 cells = 384px
]

/** Run the walker for `totalPx` of scroll in `dx`-sized steps (after the initial
 * fill), collecting all emitted blocks (px x). */
function run(course: Course, totalPx: number, dx: number, loopStart = 0) {
  const w = new CourseWalker(new AuthoredSource(course, loopStart))
  const all: { type: string; x: number }[] = []
  for (const b of w.step(0)) all.push({ type: b.type, x: b.x }) // initial fill
  for (let scrolled = 0; scrolled < totalPx; scrolled += dx) {
    for (const b of w.step(dx)) all.push({ type: b.type, x: b.x })
  }
  return all
}

describe('CourseWalker', () => {
  it('fills the screen from x=0 on the first step', () => {
    // step(0) lays sections from x=0 rightward until past the screen edge:
    // a@0, b@288, a@672, b@960 (cursor 1344 > 1280 stops).
    const out = new CourseWalker(new AuthoredSource(A)).step(0)
    expect(out.map((b) => b.type)).toEqual(['terrain', 'hazard', 'terrain', 'hazard'])
    expect(out[0]?.x).toBe(0)
    const lastStart = out[out.length - 1]?.x ?? 0
    expect(lastStart).toBeGreaterThanOrEqual(0)
    expect(lastStart).toBeLessThanOrEqual(DESIGN_W)
  })

  it("places a section's blocks at the cursor plus each block offset (in px)", () => {
    const course: Course = [
      {
        name: 'pair',
        width: 6,
        blocks: [blk('terrain'), { type: 'terrain', x: 2, y: 0, w: 1, h: 1 }],
      },
    ]
    const out = new CourseWalker(new AuthoredSource(course)).step(0)
    expect(out[0]?.x).toBe(0)
    expect(out[1]?.x).toBe(2 * CELL) // offset of 2 cells → 192px
  })

  it('builds grid cells to px (y ground-relative & up-positive; w/h scaled)', () => {
    const course: Course = [
      { name: 's', width: 6, blocks: [{ type: 'coin', x: 3, y: 2, w: 1, h: 1 }] },
    ]
    const out = new CourseWalker(new AuthoredSource(course)).step(0)
    expect(out[0]).toMatchObject({
      x: 3 * CELL,
      y: GROUND_Y - 2 * CELL, // top, 2 cells above the ground line
      w: 1 * CELL,
      h: 1 * CELL,
    })
  })

  it('spaces consecutive section starts by the previous section width', () => {
    // Fill emits a@0,b@288,a@672,b@960; cursor ends at 1344, next is a.
    const w = new CourseWalker(new AuthoredSource(A))
    w.step(0)
    expect(w.step(63)).toHaveLength(0) // cursor 1281 > 1280
    expect(w.step(1).map((b) => b.type)).toEqual(['terrain']) // a; cursor 1280 + 288
    expect(w.step(287)).toHaveLength(0)
    expect(w.step(1).map((b) => b.type)).toEqual(['hazard'])
  })

  it('loops back to the first section endlessly', () => {
    const types = run(A, 3000, 1).map((b) => b.type)
    expect(types.length).toBeGreaterThan(6)
    for (let i = 0; i < types.length; i++) {
      expect(types[i]).toBe(i % 2 === 0 ? 'terrain' : 'hazard')
    }
  })

  it('wraps to loopStart, so intro sections play once and never recur', () => {
    const withIntro: Course = [
      { name: 'intro', width: 3, blocks: [blk('ledge')] },
      { name: 'a', width: 3, blocks: [blk('terrain')] },
      { name: 'b', width: 4, blocks: [blk('hazard')] },
    ]
    const w = new CourseWalker(new AuthoredSource(withIntro, 1))
    const types: string[] = []
    for (const b of w.step(0)) types.push(b.type)
    for (let i = 0; i < 4000; i += 1) for (const b of w.step(1)) types.push(b.type)
    expect(types.filter((t) => t === 'ledge')).toHaveLength(1)
    expect(types[0]).toBe('ledge')
    // After the one-time intro the loop cycles a,b,a,b,… forever — assert the exact
    // alternation so a source that wrongly repeated a single loop section would fail.
    const loop = types.slice(1)
    for (let i = 0; i < loop.length; i++) {
      expect(loop[i]).toBe(i % 2 === 0 ? 'terrain' : 'hazard')
    }
  })

  it('is deterministic: same steps → same output', () => {
    expect(run(SAMPLE_COURSE, 4000, 7, SAMPLE_LOOP_START)).toEqual(
      run(SAMPLE_COURSE, 4000, 7, SAMPLE_LOOP_START),
    )
  })

  it('emits multiple sections when a single step crosses several starts', () => {
    const w = new CourseWalker(new AuthoredSource(A))
    w.step(0)
    expect(w.step(800).length).toBeGreaterThanOrEqual(2)
  })

  it('rejects a non-positive section width from any source (backstop)', () => {
    // An infinite source can't be checked up-front, so the walker guards each
    // emit — a zero width would otherwise stall the cursor in an infinite loop.
    const bad: SectionSource = { next: () => ({ name: 'x', width: 0, blocks: [] }) }
    expect(() => new CourseWalker(bad).step(0)).toThrow()
  })
})

describe('AuthoredSource', () => {
  it('rejects an empty course or a non-positive section width', () => {
    expect(() => new AuthoredSource([])).toThrow()
    expect(() => new AuthoredSource([{ name: 'x', width: 0, blocks: [] }])).toThrow()
  })

  it('rejects a loopStart outside the course', () => {
    expect(() => new AuthoredSource(A, 2)).toThrow()
    expect(() => new AuthoredSource(A, -1)).toThrow()
  })
})

describe('SAMPLE_COURSE', () => {
  it('keeps the intro out of the loop', () => {
    expect(SAMPLE_LOOP_START).toBeGreaterThanOrEqual(1)
    expect(SAMPLE_LOOP_START).toBeLessThan(SAMPLE_COURSE.length)
    expect(SAMPLE_COURSE[0]?.name).toBe('intro-flat')
  })

  it('every block fits within its section width', () => {
    for (const s of SAMPLE_COURSE) {
      const farthest = Math.max(0, ...s.blocks.map((b) => b.x + b.w))
      expect(s.width).toBeGreaterThanOrEqual(farthest)
    }
  })

  it('re-emits coins every loop, so they respawn (memorization track)', () => {
    const coins = run(SAMPLE_COURSE, 16000, 7, SAMPLE_LOOP_START).filter((b) => b.type === 'coin')
    expect(coins.length).toBeGreaterThan(10)
  })
})
