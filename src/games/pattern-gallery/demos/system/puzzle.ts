import { Container, Graphics } from 'pixi.js'
import { COLORS } from '../../constants'
import type { PatternDemo } from '../../demo'
import { axis, clamp, FLOOR_INSET, hint } from './shared'

const fallingBlock: PatternDemo = {
  id: 'falling-block-style',
  name: 'Falling-block-style',
  caption: 'Tetromino grid: move ← →, rotate Space, soft-drop ↓; full rows clear (Tetris).',
  category: 'system',
  params: [
    { key: 'drop', label: 'Drop interval', min: 80, max: 900, step: 20, default: 480, unit: 'ms' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → move · ↓ soft-drop · Space rotate')

    const cols = 9
    const rows = 15
    const avail = height - FLOOR_INSET - 12
    const cell = Math.floor(Math.min((width - 20) / cols, avail / rows))
    const bx = Math.floor((width - cols * cell) / 2)
    const by = 8
    root.addChild(
      new Graphics()
        .rect(bx, by, cols * cell, rows * cell)
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const g = new Graphics()
    root.addChild(g)

    const PAL = [0x6ad1ff, 0xff6bd1, 0x9b8cff, 0x6ee7b7, 0xffd166, 0xf4978e, 0x7aa2ff]
    // Tetromino cell offsets (I, O, T, S, Z, J, L).
    const SHAPES: [number, number][][] = [
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
      ],
      [
        [-1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      [
        [-1, 0],
        [0, 0],
        [1, 0],
        [-1, 1],
      ],
    ]
    const board: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))

    let offs: [number, number][] = []
    let ptype = 0
    let ppx = 0
    let ppy = 0

    const canPlace = (os: [number, number][], px: number, py: number): boolean =>
      os.every(([ox, oy]) => {
        const x = px + ox
        const y = py + oy
        return x >= 0 && x < cols && y >= 0 && y < rows && board[y]?.[x] === 0
      })

    const spawn = (): void => {
      ptype = ctx.rng.intRange(0, SHAPES.length - 1)
      offs = (SHAPES[ptype] ?? []).map(([x, y]) => [x, y] as [number, number])
      ppx = Math.floor(cols / 2)
      ppy = 1
      // Board full → reset (keeps the demo running forever).
      if (!canPlace(offs, ppx, ppy)) for (const r of board) r.fill(0)
    }

    const lockAndNext = (): void => {
      const color = PAL[ptype] ?? COLORS.accent
      for (const [ox, oy] of offs) {
        const row = board[ppy + oy]
        if (row) row[ppx + ox] = color
      }
      for (let y = rows - 1; y >= 0; y--) {
        if (board[y]?.every((c) => c !== 0)) {
          board.splice(y, 1)
          board.unshift(new Array<number>(cols).fill(0))
          y++ // re-check the row that dropped into this slot
        }
      }
      spawn()
    }

    const render = (): void => {
      g.clear()
      for (let y = 0; y < rows; y++) {
        const row = board[y]
        if (!row) continue
        for (let x = 0; x < cols; x++) {
          const c = row[x]
          if (c) g.roundRect(bx + x * cell + 1, by + y * cell + 1, cell - 2, cell - 2, 3).fill(c)
        }
      }
      const color = PAL[ptype] ?? COLORS.accent
      for (const [ox, oy] of offs) {
        g.roundRect(
          bx + (ppx + ox) * cell + 1,
          by + (ppy + oy) * cell + 1,
          cell - 2,
          cell - 2,
          3,
        ).fill(color)
      }
    }

    spawn()
    render()
    let elapsed = 0

    return {
      update: (dt) => {
        let changed = false
        if (input.wasJustPressed('left') && canPlace(offs, ppx - 1, ppy)) {
          ppx--
          changed = true
        }
        if (input.wasJustPressed('right') && canPlace(offs, ppx + 1, ppy)) {
          ppx++
          changed = true
        }
        if (input.wasJustPressed('action') && ptype !== 1) {
          const rot = offs.map(([x, y]) => [y, -x] as [number, number])
          if (canPlace(rot, ppx, ppy)) {
            offs = rot
            changed = true
          }
        }
        const interval = input.isDown('down')
          ? Math.min(70, params.get('drop'))
          : params.get('drop')
        elapsed += dt.dtMs
        if (elapsed >= interval) {
          elapsed = 0
          if (canPlace(offs, ppx, ppy + 1)) ppy++
          else lockAndNext()
          changed = true
        }
        if (changed) render()
      },
    }
  },
}

const gridMove: PatternDemo = {
  id: 'grid-move-style',
  name: 'Grid-move-style',
  caption: 'Step cell-to-cell on a tile grid (top-down Zelda / roguelike movement).',
  category: 'system',
  params: [
    { key: 'cell', label: 'Cell size', min: 28, max: 72, step: 4, default: 44, unit: 'px' },
    { key: 'step', label: 'Step time', min: 60, max: 320, step: 20, default: 130, unit: 'ms' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ / WASD : step (cell by cell)')

    const floor = height - FLOOR_INSET
    const grid = new Graphics()
    root.addChild(grid)
    const player = new Graphics().roundRect(-14, -14, 28, 28, 6).fill(COLORS.accent)
    root.addChild(player)

    // Cell-indexed position; the sprite lerps from previous to target cell.
    let cell = params.get('cell')
    let cols = Math.floor(width / cell)
    let rows = Math.floor(floor / cell)
    let cx = Math.floor(cols / 2)
    let cy = Math.floor(rows / 2)
    let fromX = 0
    let fromY = 0
    let moveT = 1 // 1 = settled
    const cellCenter = (i: number, n: number, span: number): number =>
      (span - n * cell) / 2 + i * cell + cell / 2

    const drawGrid = (): void => {
      grid.clear()
      for (let i = 0; i <= cols; i++) {
        const x = (width - cols * cell) / 2 + i * cell
        grid.moveTo(x, (floor - rows * cell) / 2).lineTo(x, (floor - rows * cell) / 2 + rows * cell)
      }
      for (let j = 0; j <= rows; j++) {
        const y = (floor - rows * cell) / 2 + j * cell
        grid.moveTo((width - cols * cell) / 2, y).lineTo((width - cols * cell) / 2 + cols * cell, y)
      }
      grid.stroke({ color: COLORS.border, width: 1 })
    }
    let lastCell = cell
    drawGrid()

    return {
      update: (dt) => {
        cell = params.get('cell')
        if (cell !== lastCell) {
          lastCell = cell
          cols = Math.floor(width / cell)
          rows = Math.floor(floor / cell)
          cx = clamp(cx, 0, cols - 1)
          cy = clamp(cy, 0, rows - 1)
          drawGrid()
        }
        const stepMs = params.get('step')
        moveT = Math.min(1, moveT + dt.dtMs / stepMs)
        if (moveT >= 1) {
          // 4-directional: take one axis per step (horizontal wins ties), so
          // holding two keys never produces a diagonal move.
          const dx = axis(input, 'left', 'right')
          const dy = axis(input, 'up', 'down')
          let tx = cx
          let ty = cy
          if (dx !== 0) tx = clamp(cx + Math.sign(dx), 0, cols - 1)
          else if (dy !== 0) ty = clamp(cy + Math.sign(dy), 0, rows - 1)
          if (tx !== cx || ty !== cy) {
            fromX = cx
            fromY = cy
            cx = tx
            cy = ty
            moveT = 0
          }
        }
        const ease = moveT * moveT * (3 - 2 * moveT)
        const ix = fromX + (cx - fromX) * ease
        const iy = fromY + (cy - fromY) * ease
        player.position.set(cellCenter(ix, cols, width), cellCenter(iy, rows, floor))
      },
    }
  },
}

export const puzzleDemos: PatternDemo[] = [fallingBlock, gridMove]
