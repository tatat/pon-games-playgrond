import { DESIGN_W } from '../../engine/constants'
import { CELL, GROUND_Y } from './constants'
import type { Block } from './obstacles'

export type { Block } from './obstacles'

// A course is a fixed-order list of sections, looping endlessly (see
// docs/hime-run-plan.md). Authored data is in GRID coordinates (cells); `build`
// turns a grid block into the px block the runtime collides/renders with. The
// walker emits px blocks as sections scroll into view.

export interface Section {
  name: string
  /** Width in cells — the distance from this section's start to the next's. */
  width: number
  /** Pattern-relative grid blocks (cells; `y` is ground-relative, up = +). */
  blocks: Block[]
}

export type Course = Section[]

/** Grid → px for one block, placed at screen px `startX`. Cells scale by `CELL`;
 * grid `y` (top, ground-relative, up = +) maps to px top `GROUND_Y - y*CELL`. */
function build(b: Block, startX: number): Block {
  return {
    type: b.type,
    x: startX + b.x * CELL,
    y: GROUND_Y - b.y * CELL,
    w: b.w * CELL,
    h: b.h * CELL,
  }
}

/**
 * Sequences an authored course into live (px) blocks as the world scrolls. Pure
 * and deterministic: same course + same `step` calls → same blocks.
 *
 * `cursor` is the screen px where the NEXT section's start will be placed. It
 * begins at 0 (screen-left), so the first `step` fills the screen left-to-right
 * with the opening sections. Each step scrolls the cursor left by `dx`; whenever
 * it sits at/left of the right edge, the next section is emitted (its grid blocks
 * built to px) and the cursor advances by that section's width in px.
 *
 * At the end the walker wraps to `loopStart`, not 0 — sections before it (the
 * one-time intro) play once and never recur.
 */
export class CourseWalker {
  private index = 0
  /** Screen px of the next section's start. Starts at 0 so step(0) fills screen. */
  private cursor = 0

  constructor(
    private readonly course: Course,
    private readonly loopStart = 0,
  ) {
    if (course.length === 0) throw new Error('CourseWalker: empty course')
    if (loopStart < 0 || loopStart >= course.length) {
      throw new Error(`CourseWalker: loopStart ${loopStart} out of range`)
    }
    for (const s of course) {
      if (!(s.width > 0)) {
        throw new Error(`CourseWalker: section "${s.name}" must have a positive width`)
      }
    }
  }

  /** Advance by `dx` px scrolled this frame. Returns the px blocks that become
   * live this step. Call `step(0)` once at start to fill the screen. */
  step(dx: number): Block[] {
    this.cursor -= dx
    const out: Block[] = []
    while (this.cursor <= DESIGN_W) {
      const section = this.course[this.index] as Section
      const startX = this.cursor
      for (const b of section.blocks) out.push(build(b, startX))
      this.cursor += section.width * CELL
      this.index = this.index + 1 >= this.course.length ? this.loopStart : this.index + 1
    }
    return out
  }
}
