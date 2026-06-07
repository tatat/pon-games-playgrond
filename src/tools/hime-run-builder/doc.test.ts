import { describe, expect, it } from 'vitest'
import type { Block } from '../../games/hime-run/obstacles'
import { parseStageCourse } from '../../games/hime-run/stage-course'
import {
  blockRect,
  type CellRect,
  clipBlock,
  createEmptyDoc,
  DEFAULT_SECTION_HEIGHT,
  DEFAULT_SECTION_Y,
  eraseRect,
  newSection,
  parseBuilderDoc,
  placeBlock,
  rectBlock,
} from './doc'

const rect = (c0: number, c1: number, r0: number, r1: number): CellRect => ({ c0, c1, r0, r1 })

describe('blockRect / rectBlock round-trip', () => {
  it('maps a block to its inclusive cell box and back', () => {
    const b: Block = { type: 'terrain', x: 2, y: 3, w: 4, h: 5 }
    const r = blockRect(b)
    // columns [2, 5]; rows [3-5, 3-1] = [-2, 2]
    expect(r).toEqual(rect(2, 5, -2, 2))
    expect(rectBlock('terrain', r)).toEqual(b)
  })
})

describe('clipBlock', () => {
  it('returns the block unchanged when the clear box does not overlap', () => {
    const b: Block = { type: 'terrain', x: 0, y: 0, w: 3, h: 1 }
    expect(clipBlock(b, rect(10, 12, 0, 0))).toEqual([b])
  })

  it('returns nothing when the clear box swallows the block whole', () => {
    const b: Block = { type: 'terrain', x: 0, y: 0, w: 3, h: 1 }
    expect(clipBlock(b, rect(-5, 5, -5, 5))).toEqual([])
  })

  it('splits a 1-tall strip around a middle hole into left/right pieces (L→R order)', () => {
    // terrain at row -1 (one cell on the ground), columns [0,2]
    const b: Block = { type: 'terrain', x: 0, y: 0, w: 3, h: 1 }
    const out = clipBlock(b, rect(1, 1, -1, -1))
    expect(out).toEqual([
      { type: 'terrain', x: 0, y: 0, w: 1, h: 1 },
      { type: 'terrain', x: 2, y: 0, w: 1, h: 1 },
    ])
  })

  it('splits a 1-wide column around a middle hole into top/bottom pieces (top first)', () => {
    // column at x=0, rows [-3,-1] (3-tall), top y = 0
    const b: Block = { type: 'terrain', x: 0, y: 0, w: 1, h: 3 }
    const out = clipBlock(b, rect(0, 0, -2, -2))
    // top piece (row -1) emitted before bottom piece (row -3)
    expect(out).toEqual([
      { type: 'terrain', x: 0, y: 0, w: 1, h: 1 },
      { type: 'terrain', x: 0, y: -2, w: 1, h: 1 },
    ])
  })

  it('punching a hole in a solid block yields maximal rects deterministically', () => {
    // 3x3 block, columns [0,2], rows [-3,-1] (top y=0). Clear the centre cell.
    const b: Block = { type: 'terrain', x: 0, y: 0, w: 3, h: 3 }
    const out = clipBlock(b, rect(1, 1, -2, -2))
    // Greedy top→bottom, L→R: full top row (w3,h1); then the left and right
    // columns grow down across the remaining two rows; finally the bottom-centre
    // cell. Columns beat row strips because the top row is consumed first.
    expect(out).toEqual([
      { type: 'terrain', x: 0, y: 0, w: 3, h: 1 }, // top row
      { type: 'terrain', x: 0, y: -1, w: 1, h: 2 }, // left column (mid+bottom)
      { type: 'terrain', x: 2, y: -1, w: 1, h: 2 }, // right column (mid+bottom)
      { type: 'terrain', x: 1, y: -2, w: 1, h: 1 }, // bottom-centre
    ])
  })

  it('is deterministic — same input gives identical output', () => {
    const b: Block = { type: 'terrain', x: 0, y: 0, w: 4, h: 4 }
    const a = clipBlock(b, rect(1, 2, -2, -1))
    const c = clipBlock(b, rect(1, 2, -2, -1))
    expect(a).toEqual(c)
  })
})

describe('placeBlock', () => {
  it('clips an overlapped block then appends the new one on top', () => {
    const floor: Block = { type: 'terrain', x: 0, y: 0, w: 5, h: 1 }
    const coin: Block = { type: 'coin', x: 2, y: 1, w: 1, h: 1 } // above the floor — no overlap
    const out = placeBlock([floor], coin)
    expect(out).toEqual([floor, coin])
  })

  it('a coin overwrites whatever shares its cell (placing overrides)', () => {
    const floor: Block = { type: 'terrain', x: 0, y: 0, w: 5, h: 1 }
    const coin: Block = { type: 'coin', x: 2, y: 0, w: 1, h: 1 } // same cell as the floor
    const out = placeBlock([floor], coin)
    expect(out).toEqual([
      { type: 'terrain', x: 0, y: 0, w: 2, h: 1 },
      { type: 'terrain', x: 3, y: 0, w: 2, h: 1 },
      coin,
    ])
  })

  it('a coin replaces a coin already in its cell — no leftover original', () => {
    const a: Block = { type: 'coin', x: 2, y: 1, w: 1, h: 1 }
    const b: Block = { type: 'coin', x: 2, y: 1, w: 1, h: 1 }
    expect(placeBlock([a], b)).toEqual([b])
  })

  it('a solid placed over a coin swallows it', () => {
    const coin: Block = { type: 'coin', x: 2, y: 0, w: 1, h: 1 }
    const terrain: Block = { type: 'terrain', x: 0, y: 0, w: 5, h: 1 }
    expect(placeBlock([coin], terrain)).toEqual([terrain])
  })

  it('a new block carves the old one where they overlap', () => {
    const floor: Block = { type: 'terrain', x: 0, y: 0, w: 5, h: 1 }
    const hazard: Block = { type: 'hazard', x: 2, y: 0, w: 1, h: 1 }
    const out = placeBlock([floor], hazard)
    expect(out).toEqual([
      { type: 'terrain', x: 0, y: 0, w: 2, h: 1 },
      { type: 'terrain', x: 3, y: 0, w: 2, h: 1 },
      hazard,
    ])
  })
})

describe('eraseRect', () => {
  it('clips the cleared box out of every block', () => {
    const a: Block = { type: 'terrain', x: 0, y: 0, w: 3, h: 1 }
    const b: Block = { type: 'terrain', x: 5, y: 0, w: 3, h: 1 }
    const out = eraseRect([a, b], rect(1, 6, -1, -1))
    expect(out).toEqual([
      { type: 'terrain', x: 0, y: 0, w: 1, h: 1 },
      { type: 'terrain', x: 7, y: 0, w: 1, h: 1 },
    ])
  })
})

describe('export / import (verbatim BuilderDoc)', () => {
  it('the doc is accepted by the runtime loader, which ignores editor-only fields', () => {
    const doc = createEmptyDoc()
    const section = doc.sections[0]
    if (!section) throw new Error('expected a starting section')
    section.blocks = placeBlock([], { type: 'terrain', x: 0, y: 0, w: 4, h: 1 })
    // The doc carries id / y / height; the game's own validator must still accept
    // it (it reads only name/width/blocks and type/x/y/w/h).
    expect(() => parseStageCourse(doc)).not.toThrow()
  })

  it('round-trips verbatim through parseBuilderDoc — id / y / height preserved', () => {
    const doc = createEmptyDoc()
    doc.name = 'My Course'
    doc.sections.push(newSection('section-2'))
    doc.loopStart = 1
    const s1 = doc.sections[1]
    if (!s1) throw new Error('expected section-2')
    s1.y = -3
    s1.height = 10
    // Simulate save → load.
    const back = parseBuilderDoc(JSON.parse(JSON.stringify(doc)))
    expect(back.name).toBe('My Course')
    expect(back.loopStart).toBe(1)
    expect(back.sections.map((s) => s.name)).toEqual(['section-1', 'section-2'])
    expect(back.sections.map((s) => s.id)).toEqual(doc.sections.map((s) => s.id))
    expect(back.sections[1]?.y).toBe(-3)
    expect(back.sections[1]?.height).toBe(10)
  })

  it('defaults the editor box when importing a plain runtime course (no id/y/height)', () => {
    const course = {
      version: 1,
      name: 'Sample',
      loopStart: 0,
      sections: [{ name: 'a', width: 5, blocks: [] }],
    }
    const back = parseBuilderDoc(course)
    const s = back.sections[0]
    if (!s) throw new Error('expected a section')
    expect(typeof s.id).toBe('string')
    expect(s.y).toBe(DEFAULT_SECTION_Y)
    expect(s.height).toBe(DEFAULT_SECTION_HEIGHT)
  })

  it('fits the box to enclose blocks that exceed the default range on import', () => {
    const course = {
      version: 1,
      name: 'High',
      loopStart: 0,
      // A block whose top edge is y=20 (occupies cell row 19) — above the default
      // top row 11. The imported box must grow to include it.
      sections: [{ name: 'a', width: 5, blocks: [{ type: 'terrain', x: 0, y: 20, w: 1, h: 1 }] }],
    }
    const back = parseBuilderDoc(course)
    const s = back.sections[0]
    if (!s) throw new Error('expected a section')
    expect(s.y).toBe(19) // top row covers the block's row 19
    const bottomRow = s.y - s.height + 1
    expect(bottomRow).toBeLessThanOrEqual(-6) // still spans at least the default floor
  })
})
