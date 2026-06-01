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

// Solid-terrain blocks (`floor`, `terrain`) are authored by their TOP only; their
// height is filled in later by `flushTerrainBottoms`, which extends every solid
// block down to one shared bottom line (one screen below the course's deepest
// surface). So the camera can never reveal a gap under the lowest floor, and
// authors never think about block depth — only where the walkable top sits.
const TOP_ONLY = 0 // placeholder height; set by flushTerrainBottoms

/** A solid floor span sitting at ground level, `wCells` wide from `xCells`. */
function floor(xCells: number, wCells: number): Block {
  return { type: 'terrain', x: c(xCells), y: GROUND_Y, width: c(wCells), height: TOP_ONLY }
}
/** A solid block whose TOP sits `rowCells` cells above the ground line — a step,
 * wall, plateau, or (with a negative `rowCells`) a lower down-route lane. */
function terrain(xCells: number, wCells: number, rowCells: number): Block {
  return {
    type: 'terrain',
    x: c(xCells),
    y: GROUND_Y - c(rowCells),
    width: c(wCells),
    height: TOP_ONLY,
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
/** The invisible lethal block three cells below the surface of a pit `wCells`
 * wide — the runner drops a few cells into the hole before it kills, which reads
 * better than dying at the lip. One cell tall: at current fall speeds she can't
 * tunnel through it in a frame, and the recovery fall-death catches any miss. */
function pitBlock(xCells: number, wCells: number): Block {
  return {
    type: 'pit',
    x: c(xCells),
    y: GROUND_Y + 3 * CELL,
    width: c(wCells),
    height: CELL,
  }
}

/** Extend every solid-terrain block down to one shared bottom — a full screen
 * below the course's deepest walkable surface — so all block bottoms are flush
 * and the camera never reveals a void beneath the floor, however deep a route
 * goes. Derived from the actual course, so adding a deeper valley just works. */
function flushTerrainBottoms(course: Course): Course {
  let deepest = GROUND_Y
  for (const p of course) {
    for (const b of p.blocks) if (b.type === 'terrain') deepest = Math.max(deepest, b.y)
  }
  const bottom = deepest + DESIGN_H
  for (const p of course) {
    for (const b of p.blocks) if (b.type === 'terrain') b.height = bottom - b.y
  }
  return course
}
/**
 * A collectible coin occupying grid cell (`xCells`, `rowCells`) — a full
 * grid-aligned 1×1 cell like every other block. `rowCells` is the 1-based cell
 * row above the ground: row 1 is the cell resting on the floor (its centre, where
 * the disc draws and where pickup is judged, is half a cell up — also the grounded
 * runner's body-circle centre, so a row-1 trail is collected by just running
 * through it). Drawn as a disc centred in the cell; non-colliding, picked up when
 * the body circle overlaps the cell.
 */
function coin(xCells: number, rowCells: number): Block {
  return { type: 'coin', x: c(xCells), y: GROUND_Y - c(rowCells), width: CELL, height: CELL }
}

/**
 * Build a pattern: lay a continuous `terrain` floor across `lengthCells` minus
 * the pit ranges, drop a lethal `pit` block in each hole, and add any extra
 * blocks (steps, ledges, hazards). Pit ranges are `[fromCell, toCell)` in cells.
 */
function pat(
  name: string,
  lengthCells: number,
  opts: { pits?: [number, number][]; gaps?: [number, number][]; blocks?: Block[] } = {},
): ObstaclePattern {
  const pits = opts.pits ?? []
  const gaps = opts.gaps ?? []
  // Floor = [0, length) minus every hole. A pit also drops a lethal block; a gap
  // is just an opening (a non-lethal drop-through to a lower route).
  const holes = [...pits, ...gaps].sort((a, b) => a[0] - b[0])
  const blocks: Block[] = []
  let cursor = 0
  for (const [from, to] of holes) {
    if (from > cursor) blocks.push(floor(cursor, from - cursor))
    cursor = Math.max(cursor, to)
  }
  if (cursor < lengthCells) blocks.push(floor(cursor, lengthCells - cursor))
  for (const [from, to] of pits) blocks.push(pitBlock(from, to - from))

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
 * on the first step). Played once — not part of the loop. A ground-level coin
 * trail teaches collection (just run through them). */
const INTRO: Course = [
  pat('intro-flat', 14, { blocks: [coin(6, 1), coin(7, 1), coin(8, 1), coin(9, 1)] }),
]

/** The endlessly repeating section (a wave: calm → ramp → peak → calm). The
 * walker wraps from the last pattern back to the first of THIS list. */
const LOOP: Course = [
  // ── Camera-tuning samples: flat → hill → flat → valley → flat. ─────────────
  pat('cam-flat-lead', 6),
  // 山: 6-step staircase up → 6-cell plateau → cliff back to ground.
  pat('cam-hill', 2 + 6 + 6 + REST_LONG, {
    blocks: [
      terrain(2, 1, 1),
      terrain(3, 1, 2),
      terrain(4, 1, 3),
      terrain(5, 1, 4),
      terrain(6, 1, 5),
      terrain(7, 1, 6),
      terrain(8, 6, 6),
      coin(9, 7),
      coin(11, 7),
      coin(13, 7),
    ],
  }),
  pat('cam-flat-mid', 6),
  // 谷: cliff → 6-cell valley floor → staircase back up (dug below ground).
  pat('cam-valley', 2 + 6 + 6 + REST_LONG, {
    gaps: [[2, 13]],
    blocks: [
      terrain(2, 6, -6),
      terrain(8, 1, -5),
      terrain(9, 1, -4),
      terrain(10, 1, -3),
      terrain(11, 1, -2),
      terrain(12, 1, -1),
      coin(3, -5),
      coin(5, -5),
      coin(7, -5),
    ],
  }),
  pat('cam-flat-settle', 10),

  // ── Vertical-route samples first, so they're quick to reach while testing. ──
  // UP route (long): the ground runs straight through (the easy low lane), while
  // a ledge staircase climbs to a long high lane at elev 5 lined with coins.
  pat('up-route-long', 26 + REST_LONG, {
    blocks: [
      ledge(1, 1, 2),
      ledge(3, 1, 3),
      ledge(5, 1, 4),
      ledge(7, 12, 5),
      coin(7, 6),
      coin(8, 6),
      coin(9, 6),
      coin(10, 6),
      coin(11, 6),
      coin(12, 6),
      coin(13, 6),
      coin(14, 6),
      coin(15, 6),
      coin(16, 6),
      coin(17, 6),
      coin(18, 6),
    ],
  }),
  // DOWN route (long): a gap drops to a long lower platform two cells below the
  // ground, lined with coins, that steps back up to the floor.
  pat('down-route-long', 28 + REST_LONG, {
    gaps: [[3, 24]],
    blocks: [
      terrain(3, 19, -2), // lower lane, cells 3-21, two cells down
      terrain(22, 1, -1), // step up
      terrain(23, 1, 0), // back to ground level
      coin(4, -1),
      coin(6, -1),
      coin(8, -1),
      coin(10, -1),
      coin(12, -1),
      coin(14, -1),
      coin(16, -1),
      coin(18, -1),
      coin(20, -1),
    ],
  }),

  // ── Wave 1: intro / calm. ─────────────────────────────────────────────────
  // Coins arc over the hop — juice on a jump the player makes anyway.
  pat('hop-low', 1 + REST_LONG, {
    blocks: [terrain(0, 1, 1), coin(0, 2), coin(1, 3), coin(2, 2)],
  }),
  pat('pit-small', 2 + REST_LONG, { pits: [[0, 2]] }),
  pat('hop-max-single', 1 + REST_LONG, { blocks: [terrain(0, 1, 2)] }),

  // ── Wave 2: ramp — double jump + ledge. ───────────────────────────────────
  pat('wall-double', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 3)] }),
  // A coin trail over the ledge telegraphs the route across the pit.
  pat('pit-ledge', 4 + REST_MED, {
    pits: [[0, 4]],
    blocks: [ledge(1, 2, 1), coin(1, 2), coin(2, 2), coin(3, 2)],
  }),
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
  // Risk/reward: a coin rides above each rising stone, so the payout only comes
  // if you commit to the precise ascending line.
  pat('pit-steps-climb', 11 + REST_LONG, {
    pits: [[0, 11]],
    blocks: [ledge(2, 1, 1), ledge(5, 1, 2), ledge(8, 1, 3), coin(2, 2), coin(5, 3), coin(8, 4)],
  }),
  pat('rhythm-stair', 8 + 1 + REST_SHORT, {
    blocks: [terrain(0, 1, 1), terrain(4, 1, 2), terrain(8, 1, 2)],
  }),
  // The tallest wall: a full 4-cell block, the double jump's ceiling. A long rest
  // after it gives room to recover from the committed double.
  // High risk/reward: a coin crest only reachable near the double-jump apex over
  // the tallest wall.
  pat('wall-max-double', 1 + REST_LONG + 1, {
    blocks: [terrain(0, 1, 4), coin(0, 5), coin(1, 5)],
  }),
  pat('wall-then-pit', 1 + 4 + 2 + REST_MED, { pits: [[5, 7]], blocks: [terrain(0, 1, 3)] }),

  // ── Wave 4: calm — wind down before the loop seam. ────────────────────────
  pat('ledge-easy', 4 + REST_LONG, {
    pits: [[0, 4]],
    blocks: [ledge(1, 2, 1), coin(1, 2), coin(2, 2)],
  }),
  pat('hop-final', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 1)] }),
]

/** Full course: the intro, then the loop, with all solid-terrain bottoms flushed
 * to one shared line (see flushTerrainBottoms). */
export const SAMPLE_COURSE: Course = flushTerrainBottoms([...INTRO, ...LOOP])
/** Index the walker wraps to — the first loop pattern, just past the intro. */
export const SAMPLE_LOOP_START = INTRO.length
