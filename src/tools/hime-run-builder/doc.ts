import type { Section } from '../../games/hime-run/course'
import type { Block, BlockType } from '../../games/hime-run/obstacles'
import { parseStageCourse, STAGE_COURSE_VERSION } from '../../games/hime-run/stage-course'

// ── The builder document & its pure operations ───────────────────────────────
//
// The editor stores, edits, and exports GRID coordinates (cells) — never pixels
// (see docs/hime-run-builder-plan.md "Coordinates"). The document reuses the
// game's own grid `Block`/`Section` shape (cells; `y` = top, ground-relative,
// up = +) and adds editor fields (`id`, and the section box `y` / `height`). The
// document is saved and exported VERBATIM: the runtime loader reads only the
// fields it needs and ignores the editor ones, so the same JSON is both the
// editor save and the shipped course — no separate export schema, no stripping.
//
// Everything in here is pure (no Pixi, no IO) so it can be unit-tested directly.

/** A section as the editor holds it: the runtime `Section` plus the editor's grid
 * box. All of this is written to the export verbatim; the runtime ignores the
 * fields it doesn't use (`id`, `y`, `height`). */
export interface BuilderSection extends Section {
  /** Stable editor-local id (React key / selection handle). */
  id: string
  /** Section grid box: top row (ground-relative cells, up = +). Same "y = top"
   * meaning as a {@link Block}'s `y`. */
  y: number
  /** Section grid box: number of rows tall (bottom row = `y - height + 1`). */
  height: number
}

/** The whole course under edit — the saved & exported document. */
export interface BuilderDoc {
  version: number
  name: string
  /** Sections [0, loopStart) play once (intro); [loopStart, …] repeat. */
  loopStart: number
  sections: BuilderSection[]
}

// Editor-local id sequence. Runtime-only (React keys / selection), regenerated
// on import — never serialized — so a plain counter is enough; no RNG needed.
let idSeq = 0
function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}${idSeq}`
}

/** Default width (cells) of a freshly added, empty section. */
export const DEFAULT_SECTION_WIDTH = 12
/** Default section box: top row 11 (≈ a full double-jump above ground), 18 rows
 * tall (→ bottom row -6, six rows below ground). */
export const DEFAULT_SECTION_Y = 11
export const DEFAULT_SECTION_HEIGHT = 18
/** Safety rails on the box (rows above / below ground). Not a fit cap — the view
 * scrolls — just a guard against pathological values. */
export const MAX_ROWS_ABOVE = 200
export const MAX_ROWS_BELOW = 200

/** A new empty section (no default floor — the author draws everything). */
export function newSection(name: string, width = DEFAULT_SECTION_WIDTH): BuilderSection {
  return {
    id: nextId('sec'),
    name,
    width,
    y: DEFAULT_SECTION_Y,
    height: DEFAULT_SECTION_HEIGHT,
    blocks: [],
  }
}

/** A new document with a single empty section. */
export function createEmptyDoc(): BuilderDoc {
  return {
    version: STAGE_COURSE_VERSION,
    name: 'Untitled',
    loopStart: 0,
    sections: [newSection('section-1')],
  }
}

// ── Cell-rect ↔ block conversion ─────────────────────────────────────────────
//
// A `Block {x,y,w,h}` (cells; `y` = top edge, ground-relative, up = +) occupies
// columns [x, x+w) and the cell rows whose own top edge lies in (y-h, y]. We
// index a cell row by its FLOOR (a row `r` spans the continuous band [r, r+1)),
// so the block covers rows r ∈ [y-h, y-1] and columns c ∈ [x, x+w-1]. `CellRect`
// is that inclusive integer box; it is the natural space for clipping/splitting.

/** An inclusive integer cell box: columns [c0, c1], rows [r0, r1] (row floors). */
export interface CellRect {
  c0: number
  c1: number
  r0: number
  r1: number
}

/** The cell box a block occupies. */
export function blockRect(b: Block): CellRect {
  return { c0: b.x, c1: b.x + b.w - 1, r0: b.y - b.h, r1: b.y - 1 }
}

/** Build a block of `type` from an inclusive cell box. */
export function rectBlock(type: BlockType, r: CellRect): Block {
  return { type, x: r.c0, y: r.r1 + 1, w: r.c1 - r.c0 + 1, h: r.r1 - r.r0 + 1 }
}

/** Whether two inclusive cell boxes overlap. */
function rectsOverlap(a: CellRect, b: CellRect): boolean {
  return a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1
}

/** Whether a cell box contains a single cell. */
export function rectContainsCell(r: CellRect, col: number, row: number): boolean {
  return col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1
}

// ── Clip / split ─────────────────────────────────────────────────────────────

/**
 * Subtract the cleared cell box `clear` from block `b`, returning the maximal
 * solid rectangles that remain — the deterministic split the plan calls for. The
 * survivors are emitted top-to-bottom (higher rows first), then left-to-right, so
 * the same edit always produces the same block list. Returns `[b]` unchanged when
 * they don't overlap, and `[]` when `clear` swallows `b` whole.
 */
export function clipBlock(b: Block, clear: CellRect): Block[] {
  const rect = blockRect(b)
  if (!rectsOverlap(rect, clear)) return [b]

  const rows = rect.r1 - rect.r0 + 1
  const cols = rect.c1 - rect.c0 + 1
  // Solid map over the block's own bbox: a cell is solid unless cleared.
  // present[rowIndex][colIndex], rowIndex 0 = bottom row (rect.r0).
  const present: boolean[][] = []
  for (let ri = 0; ri < rows; ri++) {
    const row: boolean[] = []
    for (let ci = 0; ci < cols; ci++) {
      const col = rect.c0 + ci
      const r = rect.r0 + ri
      row.push(!rectContainsCell(clear, col, r))
    }
    present.push(row)
  }

  const out: Block[] = []
  // Greedy maximal rectangles, top (high row) → bottom, left → right.
  for (let ri = rows - 1; ri >= 0; ri--) {
    for (let ci = 0; ci < cols; ci++) {
      if (!present[ri]?.[ci]) continue
      // Grow right along this top row.
      let w = 1
      while (ci + w < cols && present[ri]?.[ci + w]) w++
      // Grow down (toward lower rows) while the full width stays solid.
      let h = 1
      while (ri - h >= 0) {
        let full = true
        for (let k = 0; k < w; k++) {
          if (!present[ri - h]?.[ci + k]) {
            full = false
            break
          }
        }
        if (!full) break
        h++
      }
      // Consume the rectangle.
      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          const row = present[ri - dr]
          if (row) row[ci + dc] = false
        }
      }
      out.push(
        rectBlock(b.type, {
          c0: rect.c0 + ci,
          c1: rect.c0 + ci + w - 1,
          r0: rect.r0 + (ri - h + 1),
          r1: rect.r0 + ri,
        }),
      )
    }
  }
  return out
}

/**
 * Place `block` into a section's block list: clip every existing block out of the
 * new block's footprint (placing overrides), then append the new block on top.
 * No block ever overlaps another afterwards — a new block fully owns its cells,
 * whatever was there before (including a coin) is cleared first. Coins normally
 * live in empty cells above the floor, so this only clears what genuinely shares
 * the coin's cell.
 */
export function placeBlock(blocks: readonly Block[], block: Block): Block[] {
  const footprint = blockRect(block)
  const out: Block[] = []
  for (const b of blocks) out.push(...clipBlock(b, footprint))
  out.push(block)
  return out
}

/** Erase a cell box: clip it out of every block (no block added). */
export function eraseRect(blocks: readonly Block[], clear: CellRect): Block[] {
  const out: Block[] = []
  for (const b of blocks) out.push(...clipBlock(b, clear))
  return out
}

// ── Persistence ───────────────────────────────────────────────────────────────
//
// The document is saved and exported VERBATIM (see docs/hime-run-builder-plan.md):
// the same JSON serves both the editor (full restore) and the game (whose loader
// reads only the fields it needs and ignores the editor-only `id` / `y` / `height`).
// So there is no separate export schema — `JSON.stringify(doc)` is the export.
// `parseBuilderDoc` validates the runtime-critical fields via the game's own
// `parseStageCourse`, then layers the editor fields back on (defaulting a plain
// runtime course that has none).

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** A section box that encloses `blocks` (and at least the default range). Used when
 * importing a plain runtime course that carries no editor box, so its blocks never
 * land outside the drawable grid. Returns `y` = top row, `height` = rows. */
function fitBox(blocks: readonly Block[]): { y: number; height: number } {
  let top = DEFAULT_SECTION_Y
  let bottom = DEFAULT_SECTION_Y - DEFAULT_SECTION_HEIGHT + 1
  for (const b of blocks) {
    top = Math.max(top, b.y - 1) // topmost cell row the block occupies
    bottom = Math.min(bottom, b.y - b.h) // bottommost cell row
  }
  // Keep the ground line inside (top ≥ 1, bottom ≤ -1) and within the safety rails.
  top = Math.min(Math.max(top, 1), MAX_ROWS_ABOVE)
  bottom = Math.max(Math.min(bottom, -1), -MAX_ROWS_BELOW)
  return { y: top, height: top - bottom + 1 }
}

/** Parse a saved/imported document into an editable {@link BuilderDoc}. Throws via
 * `parseStageCourse` on an invalid course. The editor box (`y` / `height`) is
 * restored verbatim when present (our own saves) and otherwise fitted to the
 * section's blocks (a plain runtime course such as a hand-authored `stages/*.json`,
 * whose blocks must stay inside the drawable grid). `id` is restored or generated. */
export function parseBuilderDoc(data: unknown): BuilderDoc {
  const validated = parseStageCourse(data)
  const rawSections = isRecord(data) && Array.isArray(data.sections) ? data.sections : []
  const sections: BuilderSection[] = validated.course.map((s, i) => {
    const raw = isRecord(rawSections[i]) ? (rawSections[i] as Record<string, unknown>) : {}
    const id = typeof raw.id === 'string' ? raw.id : nextId('sec')
    const hasBox =
      Number.isInteger(raw.y) && Number.isInteger(raw.height) && (raw.height as number) > 0
    const box = hasBox ? { y: raw.y as number, height: raw.height as number } : fitBox(s.blocks)
    return {
      id,
      name: s.name,
      width: s.width,
      y: box.y,
      height: box.height,
      blocks: s.blocks.map((b) => ({ ...b })),
    }
  })
  return {
    version: STAGE_COURSE_VERSION,
    name: validated.name,
    loopStart: validated.loopStart,
    sections,
  }
}
