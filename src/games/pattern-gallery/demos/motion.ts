import { Container, Graphics } from 'pixi.js'
import { COLORS } from '../constants'
import type { DemoContext, DemoHandle, PatternDemo } from '../demo'
import { tag } from '../demo-util'

type Ease = (t: number) => number

/** A named catalog of easing curves — the shared vocabulary ("use easeOutBack").
 * Out/back/elastic/bounce overshoot beyond [0,1] on purpose; that's their feel. */
const EASINGS: { name: string; fn: Ease }[] = [
  { name: 'linear', fn: (t) => t },
  { name: 'easeInQuad', fn: (t) => t * t },
  { name: 'easeOutQuad', fn: (t) => 1 - (1 - t) * (1 - t) },
  { name: 'easeInOutQuad', fn: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) },
  { name: 'easeOutCubic', fn: (t) => 1 - (1 - t) ** 3 },
  { name: 'easeInOutCubic', fn: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) },
  { name: 'easeOutSine', fn: (t) => Math.sin((t * Math.PI) / 2) },
  { name: 'easeInOutSine', fn: (t) => -(Math.cos(Math.PI * t) - 1) / 2 },
  { name: 'easeOutExpo', fn: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)) },
  {
    name: 'easeOutBack',
    fn: (t) => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
    },
  },
  {
    name: 'easeOutElastic',
    fn: (t) => {
      const c4 = (2 * Math.PI) / 3
      return t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
    },
  },
  {
    name: 'easeOutBounce',
    fn: (t) => {
      const n1 = 7.5625
      const d1 = 2.75
      if (t < 1 / d1) return n1 * t * t
      if (t < 2 / d1) {
        const u = t - 1.5 / d1
        return n1 * u * u + 0.75
      }
      if (t < 2.5 / d1) {
        const u = t - 2.25 / d1
        return n1 * u * u + 0.9375
      }
      const u = t - 2.625 / d1
      return n1 * u * u + 0.984375
    },
  },
]

const easings: PatternDemo = {
  id: 'easings',
  name: 'Easing gallery',
  caption: 'Named easing curves animating side by side (easeOutBack, …).',
  category: 'motion',
  pad: true,
  params: [
    {
      key: 'duration',
      label: 'Duration',
      min: 300,
      max: 2500,
      step: 100,
      default: 1000,
      unit: 'ms',
    },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    const cols = 4
    const rows = Math.ceil(EASINGS.length / cols)
    const cellW = width / cols
    const cellH = height / rows
    const padX = 12
    const labelH = 18
    const boxW = cellW - padX * 2
    const boxH = cellH - labelH - 18
    // Map an eased value (which may overshoot [0,1]) into the box with margins.
    const yOf = (oy: number, v: number): number => oy + boxH - (v * 0.78 + 0.11) * boxH

    const dots: { fn: Ease; ox: number; oy: number; dot: Graphics }[] = []
    EASINGS.forEach((e, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const ox = col * cellW + padX
      const oy = row * cellH + 6

      const box = new Graphics().rect(ox, oy, boxW, boxH).stroke({ color: COLORS.border, width: 1 })
      // Static curve.
      const samples = 48
      for (let k = 0; k <= samples; k++) {
        const t = k / samples
        const x = ox + t * boxW
        const y = yOf(oy, e.fn(t))
        if (k === 0) box.moveTo(x, y)
        else box.lineTo(x, y)
      }
      box.stroke({ color: COLORS.accent, width: 2 })
      root.addChild(box)

      const label = tag(e.name, theme.fontMono)
      label.position.set(ox, oy + boxH + 4)
      root.addChild(label)

      const dot = new Graphics().circle(0, 0, 4).fill(COLORS.text)
      root.addChild(dot)
      dots.push({ fn: e.fn, ox, oy, dot })
    })

    let elapsed = 0
    return {
      update: (dt) => {
        const d = params.get('duration')
        const cycle = d + 350 // brief hold at the end before looping
        elapsed = (elapsed + dt.dtMs) % cycle
        const t = Math.min(1, elapsed / d)
        for (const c of dots) {
          c.dot.position.set(c.ox + t * boxW, yOf(c.oy, c.fn(t)))
        }
      },
    }
  },
}

const tweenTargets: PatternDemo = {
  id: 'tween-targets',
  name: 'Tween targets',
  caption: 'One eased value (yoyo) driving position, scale, rotation and alpha.',
  category: 'motion',
  pad: true,
  params: [
    {
      key: 'duration',
      label: 'Duration',
      min: 300,
      max: 2500,
      step: 100,
      default: 1100,
      unit: 'ms',
    },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    const cy = height * 0.5
    const x0 = width * 0.18
    const x1 = width * 0.82
    const box = new Graphics().roundRect(-26, -26, 52, 52, 8).fill(COLORS.accent)
    box.position.set(x0, cy)
    root.addChild(box)

    const label = tag(
      'one easeInOutSine value (yoyo) → position · scale · rotation · alpha',
      theme.fontSans,
    )
    label.anchor.set(0.5)
    label.position.set(width / 2, height - 20)
    root.addChild(label)

    const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2
    let elapsed = 0
    return {
      update: (dt) => {
        const d = params.get('duration')
        elapsed = (elapsed + dt.dtMs) % (d * 2)
        const phase = elapsed / d
        const tri = phase < 1 ? phase : 2 - phase // yoyo 0→1→0
        const e = easeInOutSine(tri)
        box.position.set(x0 + (x1 - x0) * e, cy)
        box.scale.set(0.7 + 0.8 * e)
        box.rotation = e * Math.PI
        box.alpha = 0.35 + 0.65 * e
      },
    }
  },
}

export const motionDemos: PatternDemo[] = [easings, tweenTargets]
