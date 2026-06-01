# hime-run map builder — plan (data structure & UI/UX)

Status: design for the visual pattern/course editor (`/tools/hime-run-builder`).

**Scope:** the editor's **data structure** and **UI/UX**.

## Coordinates

Everything is in **grid coordinates (cells)** — the editor stores, edits, and
**exports grid coordinates**. Pixels are a *render-time* concern only: the canvas
multiplies cells by the cell size (plus scroll/zoom) just before drawing. No pixel
value is ever stored, and the px constants (`CELL`, `GROUND_Y`) are **not** part of
the data.

(The current game stores blocks in pixels; that's the wrong foundation and will be
refactored to grid coordinates separately. This plan assumes grid in and grid out.)

## Data structure

```
BuilderDoc {
  version: number
  loopStart: number          // sections [0, loopStart) are the intro (play once);
                             // [loopStart, …] repeat
  sections: Section[]        // the ordered course
}

Section {
  id: string                 // stable builder-local id
  name: string
  width: number              // grid box size (cells). x is always 0, so not stored
  height: number
  y: number                  // grid box vertical position (cells)
  blocks: Block[]
}

Block {
  id: string
  type: 'terrain' | 'ledge' | 'hazard' | 'pit' | 'coin'
  x: number                  // left, cells (within the section)
  y: number                  // top, cells
  w: number                  // width, cells
  h: number                  // height, cells
}
```

- All of `x / y / w / h` and `width / height / y` are integer cells. Same field
  shape as the game's `Block` (`x, y, w, h`), just in cells instead of px.
- A **Section** is a grid box: position `(x = 0, y)`, size `width × height`. Storing
  `width / height / y` means the grid state is **fully restorable** from the saved
  document (no deriving / fitting).
- Blocks are positioned in the section's grid.

### What a "hole" is

- The five block types are the whole vocabulary. A run of floor is `terrain`
  blocks; **where there is no block, there is a hole** — nothing is stored for it.
  There is no `gap` / opening concept.
- A hole is made **lethal** by putting a `pit` block in it. Lethality is a block
  you add, not a property of the hole.

### Placing, erasing, splitting

- Blocks are solid rects that **never overlap**. **Placing overrides**: a new block
  clips any block under its footprint (the old one decomposes into the surrounding
  solid rects) and is added. **Erase** is the same clip with nothing added.
- **Splitting is deterministic**: subtract the cleared cells per block and emit the
  maximal solid rects in a stable order (top-to-bottom, then left-to-right).

### Sections / loop

- `loopStart` splits intro (once) from loop (repeats). Invariant:
  `sections.length > 0`, `0 ≤ loopStart < sections.length`.
- Export is grid-coordinate, 1:1 with the course (each Section → one runtime
  pattern; coordinates stay in cells). Import is the inverse.

## UI/UX

### Layout

- **Toolbar** — new / open / save, undo / redo, zoom, snap, play/preview.
- **Palette (left)** — the active tool.
- **Canvas (center)** — the grid.
- **Inspector (right)** — the selection's `x / y / w / h`, or the section's
  `name / width / height / y`.
- **Section strip (bottom)** — the ordered course, with the intro | loop divider.

### Canvas (the grid)

- A **cell grid**: horizontal = distance, vertical = height. The ground line is
  emphasized; rows read above and below it. Sections shown in sequence so the
  course flows continuously.
- **Expand then draw:** a section is a grid box of an explicit size; you grow the
  box (its `width / height`) and draw inside it — you can't draw outside the box.
- **Snap-only** (whole cells). Zoom / scroll.
- The canvas draws blocks at their cells; **cell → px happens here only**, for
  display.

### Tools

- **Select** — pick / move / resize / delete; marquee; arrow-nudge; click-cycle
  through stacked blocks.
- **Terrain brush** — drag a cell rect.
- **Ledge / Hazard / Pit / Coin** — stamp (drag to widen).
- **Erase** — clip cells (splitting blocks deterministically).
- **Repetition** — duplicate / alt-drag, interval drag-stamp (coin trails, ledge
  rhythms, stairs).

### Sections

Add / split / merge / reorder; resize (`width / height / y`); set the intro|loop
divider (`loopStart`). No default floor — a new section is empty.

### Open / save

Open an existing course to edit, or start a new empty one. Save/load the
`BuilderDoc` (grid coordinates) — it fully restores the editor.

### Guides

Jump-arc reach overlay; chained-jump labels for stepping stones; neighbour-section
context; loop-seam preview.

### Preview

Drop the real game into the canvas reading the document (static + scrolling).

### Validation (inline, advisory)

`0 ≤ loopStart < sections.length`; `width / height > 0`; a `pit` over solid ground
flagged. Nothing blocks the author.
