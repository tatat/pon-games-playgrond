import { describe, expect, it } from 'vitest'
import { DESIGN_W } from '../../engine/constants'
import { type Course, CourseWalker, SAMPLE_COURSE, SAMPLE_LOOP_START } from './course'
import type { Block } from './obstacles'

// A tiny deterministic course for precise assertions. Each pattern is a single
// block at offset 0; pattern starts sit `length` apart.
const blk = (type: Block['type']): Block => ({ type, x: 0, y: 0, width: 50, height: 50 })
const A: Course = [
  { name: 'a', blocks: [blk('terrain')], length: 300 },
  { name: 'b', blocks: [blk('hazard')], length: 400 },
]

/** Run the walker for `totalPx` of scroll in `dx`-sized steps (after the initial
 * fill), collecting all emitted blocks. */
function run(course: Course, totalPx: number, dx: number, loopStart = 0) {
  const w = new CourseWalker(course, loopStart)
  const all: { type: string; x: number }[] = []
  for (const b of w.step(0)) all.push({ type: b.type, x: b.x }) // initial fill
  for (let scrolled = 0; scrolled < totalPx; scrolled += dx) {
    for (const b of w.step(dx)) all.push({ type: b.type, x: b.x })
  }
  return all
}

describe('CourseWalker', () => {
  it('fills the screen from x=0 on the first step', () => {
    // step(0) lays patterns from x=0 rightward until past the screen edge:
    // A@0, B@300, A@700, B@1100 (cursor 1500 > 1280 stops). Player starts on A.
    const out = new CourseWalker(A).step(0)
    expect(out.map((b) => b.type)).toEqual(['terrain', 'hazard', 'terrain', 'hazard'])
    expect(out[0]?.x).toBe(0)
    // The fill reaches at least the right edge.
    const lastStart = out[out.length - 1]?.x ?? 0
    expect(lastStart).toBeGreaterThanOrEqual(0)
    expect(lastStart).toBeLessThanOrEqual(DESIGN_W)
  })

  it("places a pattern's blocks at the cursor plus each block offset", () => {
    const course: Course = [
      {
        name: 'pair',
        blocks: [
          { type: 'terrain', x: 0, y: 0, width: 50, height: 50 },
          { type: 'terrain', x: 120, y: 0, width: 50, height: 50 },
        ],
        length: 600,
      },
    ]
    const out = new CourseWalker(course).step(0)
    // First copy starts at x=0: blocks at 0 and 120.
    expect(out[0]?.x).toBe(0)
    expect(out[1]?.x).toBe(120)
  })

  it('spaces consecutive pattern starts by the previous pattern length', () => {
    // Fill emits A@0,B@300,A@700,B@1000; cursor ends at 1400, next is A.
    const w = new CourseWalker(A)
    w.step(0)
    // Reach the edge (1400 → 1280 = 120px) to emit the next A.
    expect(w.step(119)).toHaveLength(0)
    expect(w.step(1).map((b) => b.type)).toEqual(['terrain']) // A; cursor 1280+300
    // Next is B, one A-length (300px) later.
    expect(w.step(299)).toHaveLength(0)
    expect(w.step(1).map((b) => b.type)).toEqual(['hazard'])
  })

  it('loops back to the first pattern endlessly', () => {
    // Over a long run the types cycle terrain,hazard,terrain,hazard,...
    const types = run(A, 3000, 1).map((b) => b.type)
    expect(types.length).toBeGreaterThan(6)
    for (let i = 0; i < types.length; i++) {
      expect(types[i]).toBe(i % 2 === 0 ? 'terrain' : 'hazard')
    }
  })

  it('wraps to loopStart, so intro patterns play once and never recur', () => {
    // [intro=ledge, a=terrain, b=hazard] with loopStart=1: 'ledge' is the opening
    // only; the loop then cycles terrain,hazard,terrain,hazard,...
    const withIntro: Course = [
      { name: 'intro', blocks: [blk('ledge')], length: 300 },
      { name: 'a', blocks: [blk('terrain')], length: 300 },
      { name: 'b', blocks: [blk('hazard')], length: 400 },
    ]
    const w = new CourseWalker(withIntro, 1)
    const types: string[] = []
    for (const b of w.step(0)) types.push(b.type)
    for (let i = 0; i < 4000; i += 1) for (const b of w.step(1)) types.push(b.type)
    expect(types.filter((t) => t === 'ledge')).toHaveLength(1)
    expect(types[0]).toBe('ledge')
    expect(types.slice(1).every((t) => t === 'terrain' || t === 'hazard')).toBe(true)
  })

  it('is deterministic: same steps → same output', () => {
    expect(run(SAMPLE_COURSE, 4000, 7, SAMPLE_LOOP_START)).toEqual(
      run(SAMPLE_COURSE, 4000, 7, SAMPLE_LOOP_START),
    )
  })

  it('emits multiple patterns when a single step crosses several starts', () => {
    // After the fill the next start sits just past the right edge; a large step
    // pulls several starts onto the edge at once, so more than one emits.
    const w = new CourseWalker(A)
    w.step(0)
    const out = w.step(800)
    expect(out.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects an empty course or a non-positive pattern length', () => {
    expect(() => new CourseWalker([])).toThrow()
    expect(() => new CourseWalker([{ name: 'x', blocks: [], length: 0 }])).toThrow()
  })

  it('rejects a loopStart outside the course', () => {
    expect(() => new CourseWalker(A, 2)).toThrow()
    expect(() => new CourseWalker(A, -1)).toThrow()
  })
})

describe('SAMPLE_COURSE', () => {
  it('keeps the intro out of the loop', () => {
    expect(SAMPLE_LOOP_START).toBeGreaterThanOrEqual(1)
    expect(SAMPLE_LOOP_START).toBeLessThan(SAMPLE_COURSE.length)
    expect(SAMPLE_COURSE[0]?.name).toBe('intro-flat')
  })

  it('every block fits within its pattern length', () => {
    for (const p of SAMPLE_COURSE) {
      const farthest = Math.max(0, ...p.blocks.map((b) => b.x + b.width))
      expect(p.length).toBeGreaterThanOrEqual(farthest)
    }
  })
})
