import {
  type Application,
  Container,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
  Graphics,
  Rectangle,
} from 'pixi.js'
import { clamp } from '../../engine/util/math'
import {
  COIN_COLOR,
  HAZARD_COLOR,
  HAZARD_DARK_COLOR,
  LEDGE_COLOR,
  TERRAIN_COLOR,
  TERRAIN_LIP_COLOR,
} from '../../games/hime-run/constants'
import type { Block, BlockType } from '../../games/hime-run/obstacles'
import {
  type BuilderDoc,
  blockRect,
  type CellRect,
  DEFAULT_SECTION_HEIGHT,
  DEFAULT_SECTION_Y,
  eraseRect,
  placeBlock,
  rectBlock,
  rectContainsCell,
} from './doc'

/** What a pointer-drag does. `'select'` picks a block; `'erase'` clears cells;
 * a `BlockType` paints that block. */
export type Tool = 'select' | 'erase' | BlockType

// Default view range, derived from the section box defaults (doc.ts). Row `r` spans
// the continuous ground-up band [r, r+1); the ground line sits at the floor of row
// 0. Cell size is fixed to fit DEFAULT_VISIBLE_ROWS; a larger range scrolls
// vertically rather than shrinking the cells.
const DEFAULT_TOP_ROW = DEFAULT_SECTION_Y
const DEFAULT_BOTTOM_ROW = DEFAULT_SECTION_Y - DEFAULT_SECTION_HEIGHT + 1
const DEFAULT_VISIBLE_ROWS = DEFAULT_SECTION_HEIGHT

const MIN_CELL_PX = 14
const MAX_CELL_PX = 44

// Margins (CSS px) reserved around the drawable grid for the edge controls. The
// grid is laid out and clipped inside these, so a control sitting in a margin is
// always outside the grid and never blocks editing. No control on the left.
const INSET_TOP = 42
const INSET_BOTTOM = 42
const INSET_RIGHT = 86
const INSET_LEFT = 8

// Editor palette (dark canvas behind the section box).
const CANVAS_BG = 0x0e1322
const BOX_BG = 0x161d31
const OOB_BG = 0x0a0e18
const GRID_LINE = 0x26304c
const GROUND_LINE = 0x6f7ba6
const BOX_EDGE = 0x46527e
export const SELECT_COLOR = 0xffe06b
const PLACE_PREVIEW = 0x8fb6ff
export const ERASE_PREVIEW = 0xff6b78
const HOVER_COLOR = 0x8ea0d8

/** Liang–Barsky clip of a segment to an axis-aligned rect; null if fully outside.
 * Used to keep the pit hatch lines inside the pit block. */
function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): [number, number, number, number] | null {
  const dx = x1 - x0
  const dy = y1 - y0
  const p = [-dx, dx, -dy, dy]
  const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0]
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 4; i++) {
    const pi = p[i] as number
    const qi = q[i] as number
    if (pi === 0) {
      if (qi < 0) return null
    } else {
      const r = qi / pi
      if (pi < 0) {
        if (r > t1) return null
        if (r > t0) t0 = r
      } else {
        if (r < t0) return null
        if (r < t1) t1 = r
      }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy]
}

/** The grid box's position in screen (CSS) px, for anchoring overlay controls. */
export interface LayoutBox {
  left: number
  right: number
  top: number
  bottom: number
  screenW: number
  screenH: number
}

interface EditorCallbacks {
  /** A place/erase committed: the active section's new block list. */
  onEditBlocks(nextBlocks: Block[]): void
  /** A block was picked with the select tool (or the empty canvas clicked). */
  onSelectBlock(index: number | null): void
  /** The grid box moved/resized — used to place the edge controls. */
  onLayout(box: LayoutBox): void
}

interface DragState {
  startCol: number
  startRow: number
  col: number
  row: number
}

/**
 * The Pixi editing surface for one section of the course. Renders the cell grid,
 * the section's blocks, a hover cursor and a live drag preview, and translates
 * pointer drags into block edits (place / erase / select) via {@link doc}'s pure
 * operations. The canvas never owns the document — it renders the snapshot handed
 * to it through {@link setState} and reports edits back through the callbacks.
 */
export class EditorCanvas {
  private readonly root = new Container()
  // The grid/blocks/overlay live in `world`, masked to the drawable area so they
  // never render into the reserved inset margins where the edge controls sit.
  private readonly world = new Container()
  private readonly gridLayer = new Graphics()
  private readonly blockLayer = new Graphics()
  private readonly overlayLayer = new Graphics()
  private readonly maskGfx = new Graphics()
  private readonly hit = new Container()

  private doc: BuilderDoc
  private activeSection = 0
  private tool: Tool = 'terrain'
  private selection: number | null = null

  private topRow = DEFAULT_TOP_ROW
  private bottomRow = DEFAULT_BOTTOM_ROW
  private cellPx = 32
  private offsetX = 0
  private offsetY = 0
  private scrollX = 0
  private scrollY = 0

  private drag: DragState | null = null
  private hover: { col: number; row: number } | null = null

  constructor(
    private readonly app: Application,
    private readonly cb: EditorCallbacks,
    doc: BuilderDoc,
  ) {
    this.doc = doc

    this.world.addChild(this.gridLayer, this.blockLayer, this.overlayLayer)
    this.world.mask = this.maskGfx
    this.root.addChild(this.world, this.maskGfx, this.hit)
    app.stage.addChild(this.root)

    this.hit.eventMode = 'static'
    this.hit.cursor = 'crosshair'
    this.hit.on('pointerdown', this.onPointerDown)
    this.hit.on('globalpointermove', this.onPointerMove)
    this.hit.on('pointerup', this.onPointerUp)
    this.hit.on('pointerupoutside', this.onPointerUp)
    this.hit.on('wheel', this.onWheel)

    app.renderer.on('resize', this.handleResize)
    this.handleResize()
  }

  // ── External state ──────────────────────────────────────────────────────────

  setState(next: {
    doc?: BuilderDoc
    activeSection?: number
    tool?: Tool
    selection?: number | null
    topRow?: number
    bottomRow?: number
  }): void {
    // Geometry inputs drive the cell size, offsets, mask, hit area and the grid /
    // block layers; tool & selection only affect the overlay. Detect a geometry
    // change so a tool/selection-only update can skip the layout recompute and
    // redraw just the overlay (avoids a needless LayoutBox round-trip to React).
    const geometryChanged =
      (next.doc !== undefined && next.doc !== this.doc) ||
      (next.activeSection !== undefined && next.activeSection !== this.activeSection) ||
      (next.topRow !== undefined && next.topRow !== this.topRow) ||
      (next.bottomRow !== undefined && next.bottomRow !== this.bottomRow)
    const sectionChanged =
      next.activeSection !== undefined && next.activeSection !== this.activeSection

    if (next.doc) this.doc = next.doc
    if (next.activeSection !== undefined) this.activeSection = next.activeSection
    if (next.tool !== undefined) this.tool = next.tool
    if (next.selection !== undefined) this.selection = next.selection
    if (next.topRow !== undefined) this.topRow = next.topRow
    if (next.bottomRow !== undefined) this.bottomRow = next.bottomRow
    if (sectionChanged) {
      this.scrollX = 0
      this.scrollY = 0
      this.drag = null
    }

    if (geometryChanged) {
      this.recomputeLayout()
      this.drawAll()
    } else {
      this.drawOverlay()
    }
  }

  destroy(): void {
    this.app.renderer.off('resize', this.handleResize)
    this.root.destroy({ children: true })
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  private get section() {
    return this.doc.sections[this.activeSection]
  }

  private get screenW(): number {
    return this.app.screen.width
  }
  private get screenH(): number {
    return this.app.screen.height
  }

  private get visibleRows(): number {
    return this.topRow - this.bottomRow + 1
  }

  private colToX(col: number): number {
    return this.offsetX + col * this.cellPx - this.scrollX
  }
  private rowTopY(row: number): number {
    return this.offsetY + (this.topRow - row) * this.cellPx - this.scrollY
  }
  private xToCol(sx: number): number {
    return Math.floor((sx - this.offsetX + this.scrollX) / this.cellPx)
  }
  private yToRow(sy: number): number {
    return this.topRow - Math.floor((sy - this.offsetY + this.scrollY) / this.cellPx)
  }

  /** The drawable rect (screen px): the canvas minus the reserved control insets. */
  private get avail() {
    return {
      left: INSET_LEFT,
      top: INSET_TOP,
      right: this.screenW - INSET_RIGHT,
      bottom: this.screenH - INSET_BOTTOM,
    }
  }

  private handleResize = (): void => {
    this.recomputeLayout()
    this.drawAll()
  }

  /** Recompute the cell size and centring offsets inside the drawable rect (the
   * canvas minus the control insets). The grid is centred when it fits and scrolls
   * (both axes) when the section/range is larger than the drawable rect. Updates the
   * clip mask and the input hit area to match, then reports the layout. */
  private recomputeLayout(): void {
    const a = this.avail
    const availW = Math.max(1, a.right - a.left)
    const availH = Math.max(1, a.bottom - a.top)
    // Fixed cell size (fits the default range); a larger range scrolls, not shrinks.
    this.cellPx = clamp(Math.floor(availH / DEFAULT_VISIBLE_ROWS), MIN_CELL_PX, MAX_CELL_PX)
    const worldH = this.visibleRows * this.cellPx
    this.offsetY = a.top + Math.max(0, Math.floor((availH - worldH) / 2))
    this.scrollY = clamp(this.scrollY, 0, Math.max(0, worldH - availH))
    const worldW = (this.section?.width ?? 0) * this.cellPx
    this.offsetX = a.left + Math.max(0, Math.floor((availW - worldW) / 2))
    this.scrollX = clamp(this.scrollX, 0, Math.max(0, worldW - availW))

    // Clip the world and the input to the drawable rect.
    this.maskGfx.clear().rect(a.left, a.top, availW, availH).fill(0xffffff)
    this.hit.hitArea = new Rectangle(a.left, a.top, availW, availH)
    this.emitLayout()
  }

  /** Report the grid box's screen-px rect, clamped to the drawable area, so React
   * can anchor the edge controls just outside the *visible* edges (which always sit
   * inside an inset margin → never over the grid). Screen px == CSS px. */
  private emitLayout(): void {
    const a = this.avail
    const width = this.section?.width ?? 0
    this.cb.onLayout({
      left: clamp(this.colToX(0), a.left, a.right),
      right: clamp(this.colToX(width), a.left, a.right),
      top: clamp(this.rowTopY(this.topRow), a.top, a.bottom),
      bottom: clamp(this.rowTopY(this.bottomRow - 1), a.top, a.bottom),
      screenW: this.screenW,
      screenH: this.screenH,
    })
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  private drawAll(): void {
    this.drawGrid()
    this.drawBlocks()
    this.drawOverlay()
  }

  private drawGrid(): void {
    const g = this.gridLayer
    g.clear()
    const width = this.section?.width ?? 0
    const W = this.screenW
    const H = this.screenH

    g.rect(0, 0, W, H).fill(CANVAS_BG)

    // Out-of-box rows (above TOP_ROW / below BOTTOM_ROW) are dimmed everywhere.
    const boxTop = this.rowTopY(this.topRow)
    const boxBottom = this.rowTopY(this.bottomRow - 1)
    if (boxTop > 0) g.rect(0, 0, W, boxTop).fill(OOB_BG)
    if (boxBottom < H) g.rect(0, boxBottom, W, H - boxBottom).fill(OOB_BG)

    // The section box: the only place you can draw.
    const boxLeft = this.colToX(0)
    const boxRight = this.colToX(width)
    g.rect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop).fill(BOX_BG)
    // Columns outside [0,width] within the visible band are out of bounds.
    if (boxLeft > 0) g.rect(0, boxTop, boxLeft, boxBottom - boxTop).fill(OOB_BG)
    if (boxRight < W) g.rect(boxRight, boxTop, W - boxRight, boxBottom - boxTop).fill(OOB_BG)

    // Grid lines across the visible columns.
    const firstCol = Math.max(0, this.xToCol(0))
    const lastCol = Math.min(width, this.xToCol(W) + 1)
    for (let c = firstCol; c <= lastCol; c++) {
      const x = this.colToX(c)
      g.moveTo(x, boxTop).lineTo(x, boxBottom).stroke({ width: 1, color: GRID_LINE })
    }
    // Only the row lines crossing the drawable band (the range can be large now).
    const a = this.avail
    const firstRow = Math.max(this.bottomRow, this.yToRow(a.bottom))
    const lastRow = Math.min(this.topRow + 1, this.yToRow(a.top) + 2)
    for (let r = firstRow; r <= lastRow; r++) {
      const y = this.rowTopY(r - 1)
      g.moveTo(boxLeft, y).lineTo(boxRight, y).stroke({ width: 1, color: GRID_LINE })
    }

    // Ground line (floor of row 0) emphasised.
    const groundY = this.rowTopY(-1)
    g.moveTo(boxLeft, groundY).lineTo(boxRight, groundY).stroke({ width: 2.5, color: GROUND_LINE })

    // Section box edges.
    g.rect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop).stroke({
      width: 2,
      color: BOX_EDGE,
    })
  }

  private drawBlocks(): void {
    const g = this.blockLayer
    g.clear()
    const blocks = this.section?.blocks ?? []
    for (const b of blocks) this.drawBlock(g, b)
  }

  /** Screen-px rect for an inclusive cell box, given the current cell size and
   * scroll/centring offsets. The one place cells → pixels for drawing. */
  private rectToScreen(r: CellRect): { x: number; y: number; w: number; h: number } {
    return {
      x: this.colToX(r.c0),
      y: this.rowTopY(r.r1),
      w: (r.c1 - r.c0 + 1) * this.cellPx,
      h: (r.r1 - r.r0 + 1) * this.cellPx,
    }
  }

  private drawBlock(g: Graphics, b: Block): void {
    const r = blockRect(b)
    const { x, y, w, h } = this.rectToScreen(r)

    switch (b.type) {
      case 'terrain':
        g.rect(x, y, w, h).fill(TERRAIN_COLOR)
        g.rect(x, y, w, Math.max(2, this.cellPx * 0.12)).fill(TERRAIN_LIP_COLOR)
        break
      case 'ledge':
        g.rect(x, y, w, h).fill({ color: LEDGE_COLOR, alpha: 0.85 })
        break
      case 'hazard':
        g.rect(x, y, w, h).fill(HAZARD_DARK_COLOR)
        // A row of warning triangles along the top.
        for (let i = 0; i < r.c1 - r.c0 + 1; i++) {
          const tx = x + i * this.cellPx
          g.poly([tx, y + h, tx + this.cellPx / 2, y, tx + this.cellPx, y + h]).fill(HAZARD_COLOR)
        }
        break
      case 'pit': {
        // Invisible at runtime — drawn here as a hatched lethal zone so the
        // author can see it sitting in a hole. Each diagonal is clipped to the
        // block rect so the hatch never spills past its edges.
        g.rect(x, y, w, h).fill({ color: HAZARD_COLOR, alpha: 0.18 })
        g.rect(x, y, w, h).stroke({ width: 1.5, color: HAZARD_COLOR, alpha: 0.7 })
        const step = this.cellPx * 0.5
        for (let sx = x; sx < x + w + h; sx += step) {
          const seg = clipSegment(sx, y, sx - h, y + h, x, y, x + w, y + h)
          if (!seg) continue
          g.moveTo(seg[0], seg[1])
            .lineTo(seg[2], seg[3])
            .stroke({ width: 1, color: HAZARD_COLOR, alpha: 0.35 })
        }
        break
      }
      case 'coin': {
        const cx = x + w / 2
        const cy = y + h / 2
        g.circle(cx, cy, Math.min(w, h) * 0.32).fill(COIN_COLOR)
        break
      }
    }
  }

  private drawOverlay(): void {
    const g = this.overlayLayer
    g.clear()

    // Selection highlight.
    if (this.selection !== null) {
      const b = this.section?.blocks[this.selection]
      if (b) {
        const { x, y, w, h } = this.rectToScreen(blockRect(b))
        g.rect(x - 1, y - 1, w + 2, h + 2).stroke({ width: 2.5, color: SELECT_COLOR })
      }
    }

    // Live drag preview.
    if (this.drag) {
      const rect = this.pendingRect()
      if (rect) {
        const { x, y, w, h } = this.rectToScreen(rect)
        const color = this.tool === 'erase' ? ERASE_PREVIEW : PLACE_PREVIEW
        g.rect(x, y, w, h).fill({ color, alpha: 0.28 })
        g.rect(x, y, w, h).stroke({ width: 1.5, color })
      }
    } else if (this.hover && this.tool !== 'select') {
      // Hover cursor (single cell) when idle.
      if (this.inBox(this.hover.col, this.hover.row)) {
        const x = this.colToX(this.hover.col)
        const y = this.rowTopY(this.hover.row)
        g.rect(x, y, this.cellPx, this.cellPx).stroke({ width: 1.5, color: HOVER_COLOR })
      }
    }
  }

  // ── Pointer handling ─────────────────────────────────────────────────────────

  private localCell(e: FederatedPointerEvent): { col: number; row: number } {
    const p = e.getLocalPosition(this.root)
    return { col: this.xToCol(p.x), row: this.yToRow(p.y) }
  }

  private inBox(col: number, row: number): boolean {
    const width = this.section?.width ?? 0
    return col >= 0 && col < width && row >= this.bottomRow && row <= this.topRow
  }

  private clampCol(col: number): number {
    return clamp(col, 0, (this.section?.width ?? 1) - 1)
  }
  private clampRow(row: number): number {
    return clamp(row, this.bottomRow, this.topRow)
  }

  private onPointerDown = (e: FederatedPointerEvent): void => {
    const { col, row } = this.localCell(e)
    if (this.tool === 'select') {
      this.cb.onSelectBlock(this.pickBlock(col, row))
      return
    }
    const c = this.clampCol(col)
    const r = this.clampRow(row)
    this.drag = { startCol: c, startRow: r, col: c, row: r }
    this.drawOverlay()
  }

  private onPointerMove = (e: FederatedPointerEvent): void => {
    const { col, row } = this.localCell(e)
    if (this.drag) {
      this.drag.col = this.clampCol(col)
      this.drag.row = this.clampRow(row)
      this.drawOverlay()
    } else {
      this.hover = { col, row }
      this.drawOverlay()
    }
  }

  private onPointerUp = (): void => {
    if (!this.drag) return
    const rect = this.pendingRect()
    this.drag = null
    if (rect) this.commit(rect)
    this.drawOverlay()
  }

  private onWheel = (e: FederatedWheelEvent): void => {
    // Wheel scrolls vertically; Shift+wheel (or a horizontal wheel) scrolls the
    // long axis of the course horizontally.
    if (e.shiftKey) {
      this.scrollX += e.deltaY
    } else {
      this.scrollX += e.deltaX
      this.scrollY += e.deltaY
    }
    this.recomputeLayout()
    this.drawAll()
  }

  /** The cell box the current drag covers, with per-tool height locking. */
  private pendingRect(): CellRect | null {
    if (!this.drag) return null
    const { startCol, startRow, col, row } = this.drag
    const c0 = Math.min(startCol, col)
    const c1 = Math.max(startCol, col)
    // terrain & erase paint a free rectangle; the strip tools are one cell tall.
    if (this.tool === 'terrain' || this.tool === 'erase') {
      return { c0, c1, r0: Math.min(startRow, row), r1: Math.max(startRow, row) }
    }
    return { c0, c1, r0: startRow, r1: startRow }
  }

  private commit(rect: CellRect): void {
    if (this.tool === 'select') return
    const blocks = this.section?.blocks ?? []
    if (this.tool === 'erase') {
      this.cb.onEditBlocks(eraseRect(blocks, rect))
      return
    }
    if (this.tool === 'coin') {
      // A coin trail: one 1×1 coin per column at the drawn row.
      let next = [...blocks]
      for (let c = rect.c0; c <= rect.c1; c++) {
        next = placeBlock(next, { type: 'coin', x: c, y: rect.r0 + 1, w: 1, h: 1 })
      }
      this.cb.onEditBlocks(next)
      return
    }
    // terrain / ledge / hazard / pit: one block spanning the rect.
    this.cb.onEditBlocks(placeBlock(blocks, rectBlock(this.tool, rect)))
  }

  /** Topmost block (last drawn) whose cell box contains the cell, or null. */
  private pickBlock(col: number, row: number): number | null {
    const blocks = this.section?.blocks ?? []
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b && rectContainsCell(blockRect(b), col, row)) return i
    }
    return null
  }
}
