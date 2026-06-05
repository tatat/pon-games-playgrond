import { GROUND_Y } from './constants'

// Everything in the world is one Block primitive; its `type` sets both behaviour
// and look (see docs/hime-run-plan.md "One block, four types"). There is no
// separate ground line — the floor is made of `terrain` blocks.
//
//   terrain — solid: stand on top; pushed left by its sides. Floor, steps, walls.
//   ledge   — one-way: pass up through from below, land/stand on from above.
//   hazard  — lethal on touch, visible (warning colour).
//   pit     — lethal on touch, invisible (sits at the bottom of a hole).
//   coin    — non-colliding collectible (picked up on touch, scores).
export type BlockType = 'terrain' | 'ledge' | 'hazard' | 'pit' | 'coin'

export interface Block {
  type: BlockType
  /** Left edge. Grid cells in authored/source data; px after `build` (runtime). */
  x: number
  /** Top edge. Grid cells (ground-relative, up = +) in source; px after `build`. */
  y: number
  /** Width. Cells in source; px after `build`. */
  w: number
  /** Height. Cells in source; px after `build`. */
  h: number
}

/** Lethal on contact. */
export const isLethal = (t: BlockType): boolean => t === 'hazard' || t === 'pit'

// ── One collision primitive: the runner is a circle, everything is circle-vs-rect.
// Landing, side-blocking (climb-and-squeeze), lethal/pit death and coins all ask
// the SAME question — does the body circle touch this block — via the two helpers
// below. There is no feet-point or half-width special case anywhere.

/**
 * Minimum translation vector to push a circle (`cx,cy,r`) out of an axis-aligned
 * rect, or null when they don't overlap. The vector points from the rect toward
 * the circle (the shortest way to separate them): a mostly-vertical result means
 * the circle is resting on top / hitting the underside; a horizontal one means it
 * is against a side. The caller decides what that means (land vs squeeze).
 */
export function circleRectMTV(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number } | null {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw))
  const nearestY = Math.max(ry, Math.min(cy, ry + rh))
  const dx = cx - nearestX
  const dy = cy - nearestY
  const d2 = dx * dx + dy * dy
  if (d2 >= r * r) return null
  if (d2 > 1e-6) {
    // Circle centre outside the rect: push out along the centre→nearest-point line.
    const d = Math.sqrt(d2)
    const push = r - d
    return { x: (dx / d) * push, y: (dy / d) * push }
  }
  // Centre inside the rect: push out along whichever edge is closest.
  const left = cx - rx
  const right = rx + rw - cx
  const top = cy - ry
  const bottom = ry + rh - cy
  const minH = Math.min(left, right)
  const minV = Math.min(top, bottom)
  if (minH < minV) {
    return { x: left < right ? -(left + r) : right + r, y: 0 }
  }
  return { x: 0, y: top < bottom ? -(top + r) : bottom + r }
}

/** Whether the body circle (`cx,cy,r`) overlaps the rect — the same test as
 * `circleRectMTV` returning non-null, for callers that only need a yes/no. */
export function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw))
  const nearestY = Math.max(ry, Math.min(cy, ry + rh))
  const ddx = cx - nearestX
  const ddy = cy - nearestY
  return ddx * ddx + ddy * ddy < r * r
}

/** Whether the body circle touches any lethal block (`hazard`/`pit`). */
export function touchesLethal(
  blocks: readonly Block[],
  cx: number,
  cy: number,
  radius: number,
): boolean {
  for (const b of blocks) {
    if (!isLethal(b.type)) continue
    if (circleHitsRect(cx, cy, radius, b.x, b.y, b.w, b.h)) return true
  }
  return false
}

/** Whether the body circle overlaps a coin; returns its index or -1. */
export function coinAt(blocks: readonly Block[], cx: number, cy: number, radius: number): number {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (!b || b.type !== 'coin') continue
    if (circleHitsRect(cx, cy, radius, b.x, b.y, b.w, b.h)) return i
  }
  return -1
}

/** Re-export so callers that only need the ground reference keep working. */
export { GROUND_Y }
