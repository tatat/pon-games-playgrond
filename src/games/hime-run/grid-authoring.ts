import type { Section } from './course'
import type { Block } from './obstacles'

// Grid-block authoring helpers shared by the hand-authored sample course
// (sample-course.ts) and the seeded random generator (random-source.ts). These
// are authoring CONVENIENCE, NOT engine rules: they produce plain grid `Block`s
// (cells; `y` = ground-relative, up = +) and one `pat` section. The engine
// (course.ts) only ever sees the resulting data, never how it was authored.
//
// Imports are type-only, so plain Node's TS type-stripping can load any module
// that re-exports through here (the export script imports sample-course → here).

/** Solid ground-mass terrain fills down to this row (cells below the ground line).
 * Each helper derives a concrete `h` from it — no global pass, no `floating` flag;
 * it never appears in the block data. */
export const FLOOR_BOTTOM = -16

/** A solid block whose TOP is row `top` (cells above ground; negative = below),
 * filled down to FLOOR_BOTTOM. */
export function terrain(x: number, w: number, top: number): Block {
  return { type: 'terrain', x, y: top, w, h: top - FLOOR_BOTTOM }
}
/** Ground floor span: terrain whose top is the ground line. */
export function floor(x: number, w: number): Block {
  return terrain(x, w, 0)
}
/** A one-way ledge, one cell tall, top at row `top`. */
export function ledge(x: number, w: number, top: number): Block {
  return { type: 'ledge', x, y: top, w, h: 1 }
}
/** A visible lethal spike, one cell tall, at row `top` (row 1 = on the floor). */
export function hazard(x: number, w: number, top = 1): Block {
  return { type: 'hazard', x, y: top, w, h: 1 }
}
/** The invisible lethal block three rows below the surface of a hole `w` wide. */
export function pit(x: number, w: number): Block {
  return { type: 'pit', x, y: -3, w, h: 1 }
}
/** A floating solid roof (tunnel): underside `clear` cells above ground, `hCells`
 * thick — a finite height, so a gap stays beneath it. */
export function ceiling(x: number, w: number, clear: number, hCells = 1): Block {
  return { type: 'terrain', x, y: clear + hCells, w, h: hCells }
}
/** A 1×1 collectible coin, top at row `top` (row 1 rests on the floor). */
export function coin(x: number, top: number): Block {
  return { type: 'coin', x, y: top, w: 1, h: 1 }
}

/**
 * Build a section: lay a continuous floor across `width` cells minus the holes,
 * drop a lethal `pit` block in each pit hole, and add any extra blocks. Pit/gap
 * ranges are `[fromCell, toCell)`; a `gap` just opens the floor (drop-through), a
 * `pit` also adds the lethal block.
 */
export function pat(
  name: string,
  width: number,
  opts: { pits?: [number, number][]; gaps?: [number, number][]; blocks?: Block[] } = {},
): Section {
  const pits = opts.pits ?? []
  const gaps = opts.gaps ?? []
  const holes = [...pits, ...gaps].sort((a, b) => a[0] - b[0])
  const blocks: Block[] = []
  let cursor = 0
  for (const [from, to] of holes) {
    if (from > cursor) blocks.push(floor(cursor, from - cursor))
    cursor = Math.max(cursor, to)
  }
  if (cursor < width) blocks.push(floor(cursor, width - cursor))
  for (const [from, to] of pits) blocks.push(pit(from, to - from))
  if (opts.blocks) blocks.push(...opts.blocks)
  return { name, width, blocks }
}
