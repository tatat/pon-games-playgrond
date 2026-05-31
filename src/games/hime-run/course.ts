import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { CELL, GROUND_Y } from './constants'
import type { Block } from './obstacles'

export type { Block } from './obstacles'

// Hand-authored, fixed-order course (see docs/hime-run-plan.md): a one-time intro
// followed by a section that repeats endlessly. Placement is fully deterministic
// (no RNG). Everything is one Block primitive; a pattern's block `x` is an offset
// from the pattern's start cursor, which the walker turns into screen positions as
// the world scrolls.
//
// The floor is explicit `terrain` blocks: every pattern lays a floor across its
// whole length (minus pits), so the ground is a continuous strip pattern-to-
// pattern. The opening `intro-flat` pattern is the starting ground; it plays once
// and is NOT part of the repeating loop (the walker wraps to `loopStart`).

export interface ObstaclePattern {
  name: string
  /** Blocks with `x` relative to the pattern start cursor. */
  blocks: Block[]
  /** Distance from this pattern's start cursor to the next pattern's start. */
  length: number
}

export type Course = ObstaclePattern[]

/**
 * Sequences an authored course into live blocks as the world scrolls. Pure and
 * deterministic: same course + same `step` calls → same blocks.
 *
 * `cursor` is the screen x where the NEXT pattern's start will be placed. It
 * begins at 0 (screen-left), so the first `step` fills the whole screen left-to-
 * right with the opening patterns (the player starts standing on pattern 0's
 * floor — no special seed). Each step scrolls the cursor left by `dx`; whenever
 * it sits at/left of the right edge, the next pattern is emitted there and the
 * cursor advances by that pattern's `length`.
 *
 * At the end the walker wraps to `loopStart`, not to 0 — so patterns before
 * `loopStart` (the one-time intro) play once and never recur. The scene owns and
 * scrolls the emitted blocks.
 */
export class CourseWalker {
  private index = 0
  /** Screen x of the next pattern's start. Starts at 0 so step(0) fills screen. */
  private cursor = 0

  /**
   * @param course    ordered patterns: intro patterns first, then the loop.
   * @param loopStart index the walker wraps back to at the end; patterns before
   *                  it play once. Defaults to 0 (the whole course loops).
   */
  constructor(
    private readonly course: Course,
    private readonly loopStart = 0,
  ) {
    if (course.length === 0) throw new Error('CourseWalker: empty course')
    if (loopStart < 0 || loopStart >= course.length) {
      throw new Error(`CourseWalker: loopStart ${loopStart} out of range`)
    }
    for (const p of course) {
      if (!(p.length > 0)) {
        throw new Error(`CourseWalker: pattern "${p.name}" must have a positive length`)
      }
    }
  }

  /** Advance by `dx` px scrolled this frame. Returns blocks that become live this
   * step, each with screen-space `x`. Call `step(0)` once at start to fill the
   * screen with the opening patterns. */
  step(dx: number): Block[] {
    this.cursor -= dx
    const out: Block[] = []
    // Emit every pattern whose start has reached the right edge this step (also
    // covers the initial fill and patterns shorter than a single `dx`).
    while (this.cursor <= DESIGN_W) {
      const pattern = this.course[this.index] as ObstaclePattern
      const startX = this.cursor
      for (const b of pattern.blocks) {
        out.push({ type: b.type, x: startX + b.x, y: b.y, width: b.width, height: b.height })
      }
      this.cursor += pattern.length
      // Wrap to loopStart (not 0): the intro before it never recurs.
      this.index = this.index + 1 >= this.course.length ? this.loopStart : this.index + 1
    }
    return out
  }
}

// ── Authoring helpers (everything in cells) ──────────────────────────────────

/** Cells → px. */
const c = (n: number): number => n * CELL
/** Floor terrain reaches from the ground surface to the bottom of the screen. */
const FLOOR_DEPTH = DESIGN_H - GROUND_Y

/** A solid floor span sitting at ground level, `wCells` wide from `xCells`. */
function floor(xCells: number, wCells: number): Block {
  return { type: 'terrain', x: c(xCells), y: GROUND_Y, width: c(wCells), height: FLOOR_DEPTH }
}
/** A solid step/wall standing on the floor, `hCells` tall. */
function terrain(xCells: number, wCells: number, hCells: number): Block {
  return {
    type: 'terrain',
    x: c(xCells),
    y: GROUND_Y - c(hCells),
    width: c(wCells),
    height: c(hCells),
  }
}
/** A one-way ledge floating with its top `elevCells` above the ground, one cell
 * tall (grid-aligned, not a thin slab). */
function ledge(xCells: number, wCells: number, elevCells: number): Block {
  return {
    type: 'ledge',
    x: c(xCells),
    y: GROUND_Y - c(elevCells),
    width: c(wCells),
    height: CELL,
  }
}
/** The invisible lethal block at the bottom of a pit `wCells` wide. Its top sits
 * one cell below the surface (grid-aligned). */
function pitBlock(xCells: number, wCells: number): Block {
  return {
    type: 'pit',
    x: c(xCells),
    y: GROUND_Y + CELL,
    width: c(wCells),
    height: DESIGN_H,
  }
}

/**
 * Build a pattern: lay a continuous `terrain` floor across `lengthCells` minus
 * the pit ranges, drop a lethal `pit` block in each hole, and add any extra
 * blocks (steps, ledges, hazards). Pit ranges are `[fromCell, toCell)` in cells.
 */
function pat(
  name: string,
  lengthCells: number,
  opts: { pits?: [number, number][]; blocks?: Block[] } = {},
): ObstaclePattern {
  const pits = (opts.pits ?? []).slice().sort((a, b) => a[0] - b[0])
  const blocks: Block[] = []

  // Floor = [0, length) minus pit ranges, as contiguous terrain spans.
  let cursor = 0
  for (const [from, to] of pits) {
    if (from > cursor) blocks.push(floor(cursor, from - cursor))
    blocks.push(pitBlock(from, to - from))
    cursor = Math.max(cursor, to)
  }
  if (cursor < lengthCells) blocks.push(floor(cursor, lengthCells - cursor))

  if (opts.blocks) blocks.push(...opts.blocks)
  return { name, blocks, length: c(lengthCells) }
}

// ── Authored course ──────────────────────────────────────────────────────────
// A hand-designed, fixed-order loop on the 96px grid. Measured reach (see
// constants.ts): single jump clears ≤2 cells tall and carries ~3 cells of
// distance at the start speed; double clears ≤4 cells tall. Spacing and pit
// widths below are authored by feel and meant to be checked in play, not derived
// from a proven minimum.
// Ordering is a wave — gentle intro → ramp → peak → calm — switching the demanded
// operation (axis 5). Failing a jump pushes the runner (climb-and-squeeze); only
// pits and the left-edge squeeze kill.

const REST_LONG = 6 // calm beat
const REST_MED = 5
const REST_SHORT = 4 // brisk, used at the peak

/** One-time opening: flat ground the player starts standing on (fills the screen
 * on the first step). Played once — not part of the loop. */
const INTRO: Course = [pat('intro-flat', 14)]

/** The endlessly repeating section (a wave: calm → ramp → peak → calm). The
 * walker wraps from the last pattern back to the first of THIS list. */
const LOOP: Course = [
  // ── Wave 1: intro / calm. ─────────────────────────────────────────────────
  pat('hop-low', 1 + REST_LONG, { blocks: [terrain(0, 1, 1)] }),
  pat('pit-small', 2 + REST_LONG, { pits: [[0, 2]] }),
  pat('hop-max-single', 1 + REST_LONG, { blocks: [terrain(0, 1, 2)] }),

  // ── Wave 2: ramp — double jump + ledge. ───────────────────────────────────
  pat('wall-double', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 3)] }),
  pat('pit-ledge', 4 + REST_MED, { pits: [[0, 4]], blocks: [ledge(1, 2, 1)] }),
  // Wide pit crossed on fine 1-cell stepping stones: three 2-cell hops, each
  // landing on a single-cell ledge. The gap is jumpable; the precision is the
  // narrow target.
  pat('pit-steps', 8 + REST_MED, { pits: [[0, 8]], blocks: [ledge(2, 1, 1), ledge(5, 1, 1)] }),
  pat('hop-two-beat', 4 + 1 + REST_MED, { blocks: [terrain(0, 1, 1), terrain(4, 1, 1)] }),

  // ── Wave 3: peak — switching + continuity. ────────────────────────────────
  pat('pit-then-hop', 2 + 3 + 1 + REST_MED, { pits: [[0, 2]], blocks: [terrain(5, 1, 2)] }),
  // The peak version: a wider pit on more fine stepping stones — four 2-cell hops
  // across three single-cell ledges, a sustained run of precise landings.
  pat('pit-wide-steps', 11 + REST_LONG, {
    pits: [[0, 11]],
    blocks: [ledge(2, 1, 1), ledge(5, 1, 1), ledge(8, 1, 1)],
  }),
  // Stepping stones climbing 1→2→3 across the pit: each hop lands a cell higher,
  // so you ascend as you cross.
  pat('pit-steps-climb', 11 + REST_LONG, {
    pits: [[0, 11]],
    blocks: [ledge(2, 1, 1), ledge(5, 1, 2), ledge(8, 1, 3)],
  }),
  pat('rhythm-stair', 8 + 1 + REST_SHORT, {
    blocks: [terrain(0, 1, 1), terrain(4, 1, 2), terrain(8, 1, 2)],
  }),
  // The tallest wall: a full 4-cell block, the double jump's ceiling. A long rest
  // after it gives room to recover from the committed double.
  pat('wall-max-double', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 4)] }),
  pat('wall-then-pit', 1 + 4 + 2 + REST_MED, { pits: [[5, 7]], blocks: [terrain(0, 1, 3)] }),

  // ── Wave 4: calm — wind down before the loop seam. ────────────────────────
  pat('ledge-easy', 4 + REST_LONG, { pits: [[0, 4]], blocks: [ledge(1, 2, 1)] }),
  pat('hop-final', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 1)] }),
]

/** Full course: the intro, then the loop. */
export const SAMPLE_COURSE: Course = [...INTRO, ...LOOP]
/** Index the walker wraps to — the first loop pattern, just past the intro. */
export const SAMPLE_LOOP_START = INTRO.length
