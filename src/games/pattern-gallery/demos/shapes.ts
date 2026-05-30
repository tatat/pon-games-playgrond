import { Container, FillGradient, Graphics } from 'pixi.js'
import { COLORS } from '../constants'
import type { DemoContext, DemoHandle, PatternDemo } from '../demo'
import { tag, text } from '../demo-util'

/** One labelled cell drawing a single Pixi `Graphics` primitive. The label is
 * the literal API call so the name in the catalog matches the code you'd write. */
interface ShapeCell {
  api: string
  draw(g: Graphics, s: number): void
}

const ACCENT = COLORS.accent

const CELLS: ShapeCell[] = [
  { api: 'rect', draw: (g, s) => g.rect(-s, -s * 0.7, s * 2, s * 1.4).fill(ACCENT) },
  { api: 'roundRect', draw: (g, s) => g.roundRect(-s, -s * 0.7, s * 2, s * 1.4, 14).fill(ACCENT) },
  { api: 'circle', draw: (g, s) => g.circle(0, 0, s).fill(ACCENT) },
  { api: 'ellipse', draw: (g, s) => g.ellipse(0, 0, s, s * 0.6).fill(ACCENT) },
  { api: 'star', draw: (g, s) => g.star(0, 0, 5, s, s * 0.5).fill(ACCENT) },
  { api: 'regularPoly', draw: (g, s) => g.regularPoly(0, 0, s, 6).fill(ACCENT) },
  {
    api: 'poly',
    draw: (g, s) => g.poly([-s, s * 0.7, s, s * 0.7, s * 0.4, -s, -s * 0.4, -s]).fill(ACCENT),
  },
  {
    api: 'fill(FillGradient)',
    draw: (g, s) => {
      const grad = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        colorStops: [
          { offset: 0, color: 0x6ad1ff },
          { offset: 1, color: 0xff6bd1 },
        ],
      })
      g.roundRect(-s, -s * 0.7, s * 2, s * 1.4, 14).fill(grad)
    },
  },
  {
    api: 'stroke',
    draw: (g, s) => g.circle(0, 0, s).stroke({ color: ACCENT, width: 6, alignment: 0.5 }),
  },
]

const shapePrimitives: PatternDemo = {
  id: 'shape-primitives',
  name: 'Shape primitives',
  caption: 'Pixi Graphics building blocks, each labelled with its API call.',
  category: 'shapes',
  params: [
    { key: 'size', label: 'Shape size', min: 0.5, max: 1.6, step: 0.1, default: 1, unit: '×' },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    const cols = 3
    const rows = Math.ceil(CELLS.length / cols)
    const cellW = width / cols
    const cellH = height / rows
    const baseRadius = Math.min(cellW, cellH) * 0.22

    // Footer hint naming the convention (static).
    const hint = text('Graphics: shape method → fill() / stroke()', {
      fill: COLORS.faint,
      fontSize: 13,
      fontFamily: theme.fontMono,
    })
    hint.anchor.set(0.5, 1)
    hint.position.set(width / 2, height)
    root.addChild(hint)

    const holder = new Container()
    root.addChild(holder)
    const build = (): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true })
      const radius = baseRadius * params.get('size')
      CELLS.forEach((cell, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const cx = col * cellW + cellW / 2
        const cy = row * cellH + cellH / 2 - 10

        const g = new Graphics()
        cell.draw(g, radius)
        g.position.set(cx, cy)
        holder.addChild(g)

        const label = tag(cell.api, theme.fontMono)
        label.anchor.set(0.5, 0)
        label.position.set(cx, cy + radius + 18)
        holder.addChild(label)
      })
    }
    build()
    const unsub = params.subscribe(build)
    return { dispose: () => unsub() }
  },
}

export const shapesDemos: PatternDemo[] = [shapePrimitives]
