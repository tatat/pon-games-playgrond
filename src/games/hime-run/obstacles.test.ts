import { describe, expect, it } from 'vitest'
import type { Block } from './obstacles'
import { circleHitsRect, circleRectMTV, coinAt, touchesLethal } from './obstacles'

// The runner is one circle; these lock in the single circle-vs-rect primitive
// that landing, side-squeeze, lethal death and coins all share.

describe('circleRectMTV', () => {
  it('returns null when the circle is clear of the rect', () => {
    expect(circleRectMTV(0, 0, 10, 100, 100, 50, 50)).toBeNull()
  })

  it('returns null when they merely touch (no penetration)', () => {
    // Circle bottom exactly on the rect top: distance == r.
    expect(circleRectMTV(50, 90, 10, 0, 100, 100, 100)).toBeNull()
  })

  it('pushes up when resting into a surface from above', () => {
    // Centre 5px into the top → push up by 5, vertical-dominant.
    const mtv = circleRectMTV(50, 95, 10, 0, 100, 100, 100)
    expect(mtv).not.toBeNull()
    expect(mtv?.x).toBeCloseTo(0)
    expect(mtv?.y).toBeCloseTo(-5)
  })

  it('pushes left when hitting a left face side-on', () => {
    // Circle centre left of the rect, overlapping its left edge by 5.
    const mtv = circleRectMTV(95, 150, 10, 100, 100, 100, 100)
    expect(mtv).not.toBeNull()
    expect(mtv?.y).toBeCloseTo(0)
    expect(mtv?.x).toBeCloseTo(-5)
  })

  it('separates along the nearest edge when the centre is inside', () => {
    // Centre just inside the top edge → smallest exit is upward.
    const mtv = circleRectMTV(50, 105, 10, 0, 100, 100, 100)
    expect(mtv).not.toBeNull()
    expect(Math.abs(mtv?.y ?? 0)).toBeGreaterThan(Math.abs(mtv?.x ?? 0))
    expect(mtv?.y).toBeLessThan(0)
  })
})

describe('touchesLethal / coinAt (circle-based)', () => {
  const lethal = (x: number, y: number): Block => ({
    type: 'pit',
    x,
    y,
    width: 100,
    height: 100,
  })
  const coin = (x: number, y: number): Block => ({ type: 'coin', x, y, width: 40, height: 40 })

  it('detects a lethal block the circle overlaps and ignores a clear one', () => {
    const blocks = [lethal(40, 40)]
    expect(touchesLethal(blocks, 50, 50, 20)).toBe(true)
    expect(touchesLethal(blocks, 500, 500, 20)).toBe(false)
  })

  it('does not flag a non-lethal terrain block', () => {
    const terrain: Block = { type: 'terrain', x: 40, y: 40, width: 100, height: 100 }
    expect(touchesLethal([terrain], 50, 50, 20)).toBe(false)
  })

  it('finds an overlapped coin by index, or -1 when clear', () => {
    const blocks = [coin(0, 0), coin(200, 200)]
    expect(coinAt(blocks, 210, 210, 15)).toBe(1)
    expect(coinAt(blocks, 1000, 1000, 15)).toBe(-1)
  })
})

describe('circleHitsRect', () => {
  it('is true on penetration and false on a clean miss or exact touch', () => {
    expect(circleHitsRect(50, 95, 10, 0, 100, 100, 100)).toBe(true) // 5px in
    expect(circleHitsRect(50, 90, 10, 0, 100, 100, 100)).toBe(false) // exact touch
    expect(circleHitsRect(50, 0, 10, 0, 100, 100, 100)).toBe(false) // far away
  })
})
