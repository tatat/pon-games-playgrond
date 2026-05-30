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

/** Easing names in `EASINGS` order — the stepper options for `tween-targets`. */
const EASING_NAMES: readonly string[] = EASINGS.map((e) => e.name)
/** Default selection: `linear`, the neutral baseline to step away from. */
const DEFAULT_EASING = EASING_NAMES.indexOf('linear')

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
    // Map an eased value to a box fraction. Compressed enough that big
    // overshoots (easeOutElastic peaks ~1.35) still fit inside the box.
    const yOf = (oy: number, v: number): number => oy + boxH - (v * 0.62 + 0.1) * boxH

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
  caption: 'The same eased value applied to different properties.',
  category: 'motion',
  pad: true,
  params: [
    {
      key: 'easing',
      label: 'Easing',
      min: 0,
      max: EASING_NAMES.length - 1,
      step: 1,
      default: DEFAULT_EASING,
      options: EASING_NAMES,
    },
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

    // 0→1→0 so yoyo rows ease out *and* back; one-way rows take the raw 0→1.
    const tri = (p: number): number => 1 - Math.abs(2 * p - 1)

    const rowDefs = ['move-x', 'move-y', 'scale', 'rotate', 'fade'] as const
    const n = rowDefs.length
    const rowH = height / n
    const trackX0 = width * 0.34
    const trackX1 = width * 0.92
    const objX = (trackX0 + trackX1) / 2

    const rows: { apply(p: number, e: Ease): void }[] = []
    rowDefs.forEach((kind, i) => {
      const cy = (i + 0.5) * rowH
      const lbl = tag(kind, theme.fontMono)
      lbl.anchor.set(0, 0.5)
      lbl.position.set(2, cy)
      root.addChild(lbl)

      const obj = new Graphics().roundRect(-16, -16, 32, 32, 6).fill(COLORS.accent)
      obj.position.set(objX, cy)

      if (kind === 'move-x') {
        root.addChild(
          new Graphics()
            .moveTo(trackX0, cy)
            .lineTo(trackX1, cy)
            .stroke({ color: COLORS.border, width: 1 }),
        )
        root.addChild(obj)
        rows.push({
          apply: (p, e) => obj.position.set(trackX0 + (trackX1 - trackX0) * e(p), cy),
        })
      } else if (kind === 'move-y') {
        const top = cy - rowH * 0.3
        const bottom = cy + rowH * 0.3
        root.addChild(
          new Graphics()
            .moveTo(objX - 26, bottom + 16)
            .lineTo(objX + 26, bottom + 16)
            .stroke({ color: COLORS.border, width: 1 }),
        )
        obj.position.set(objX, top)
        root.addChild(obj)
        rows.push({ apply: (p, e) => (obj.y = top + e(p) * (bottom - top)) })
      } else if (kind === 'scale') {
        root.addChild(obj)
        rows.push({ apply: (p, e) => obj.scale.set(0.5 + 0.9 * e(tri(p))) })
      } else if (kind === 'rotate') {
        root.addChild(obj)
        rows.push({ apply: (p, e) => (obj.rotation = e(p) * Math.PI * 2) })
      } else {
        root.addChild(obj)
        rows.push({
          apply: (p, e) => (obj.alpha = Math.max(0, Math.min(1, 0.1 + 0.9 * e(tri(p))))),
        })
      }
    })

    let elapsed = 0
    return {
      update: (dt) => {
        const d = params.get('duration')
        const ease = EASINGS[params.get('easing')]?.fn ?? ((t) => t)
        elapsed = (elapsed + dt.dtMs) % (d + 250) // brief hold before looping
        const p = Math.min(1, elapsed / d)
        for (const r of rows) r.apply(p, ease)
      },
    }
  },
}

const easeOutBack: Ease = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

const particles: PatternDemo = {
  id: 'particles',
  name: 'Particles',
  caption: 'Pooled burst emitter: random velocity + gravity + fade + shrink.',
  category: 'motion',
  params: [
    { key: 'count', label: 'Per burst', min: 4, max: 40, step: 2, default: 18, unit: '' },
    { key: 'gravity', label: 'Gravity', min: 0, max: 1600, step: 100, default: 600, unit: 'px/s²' },
  ],
  mount({ stage, width, height, rng, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    const cx = width / 2
    const cy = height * 0.56

    interface P {
      g: Graphics
      vx: number
      vy: number
      life: number
      max: number
      alive: boolean
    }
    const pool: P[] = Array.from({ length: 200 }, () => {
      const g = new Graphics().circle(0, 0, 3.5).fill(COLORS.accent)
      g.visible = false
      root.addChild(g)
      return { g, vx: 0, vy: 0, life: 0, max: 1, alive: false }
    })

    const burst = (): void => {
      const n = Math.round(params.get('count'))
      for (let i = 0; i < n; i++) {
        const p = pool.find((q) => !q.alive)
        if (!p) break
        const a = rng.next() * Math.PI * 2
        const sp = rng.intRange(80, 280)
        p.vx = Math.cos(a) * sp
        p.vy = Math.sin(a) * sp - 130
        p.life = 0
        p.max = rng.next() * 0.5 + 0.7
        p.alive = true
        p.g.visible = true
        p.g.tint = rng.chance(0.5) ? 0x6ad1ff : 0xff6bd1
        p.g.position.set(cx, cy)
        p.g.scale.set(1)
        p.g.alpha = 1
      }
    }

    let burstT = 0
    return {
      update: (dt) => {
        burstT += dt.dtMs
        if (burstT >= 600) {
          burstT = 0
          burst()
        }
        const g = params.get('gravity')
        const s = dt.dtSec
        for (const p of pool) {
          if (!p.alive) continue
          p.life += s
          if (p.life >= p.max) {
            p.alive = false
            p.g.visible = false
            continue
          }
          p.vy += g * s
          p.g.x += p.vx * s
          p.g.y += p.vy * s
          const k = 1 - p.life / p.max
          p.g.alpha = k
          p.g.scale.set(0.3 + k)
        }
      },
    }
  },
}

const screenShake: PatternDemo = {
  id: 'screen-shake',
  name: 'Screen shake',
  caption: 'Trauma-based shake: offset ∝ trauma², decaying every frame.',
  category: 'motion',
  params: [
    { key: 'intensity', label: 'Intensity', min: 4, max: 44, step: 2, default: 20, unit: 'px' },
    { key: 'decay', label: 'Decay', min: 0.5, max: 4, step: 0.1, default: 1.6, unit: '/s' },
  ],
  mount({ stage, width, height, rng, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    // A sample scene that gets shaken (static).
    const content = new Container()
    content.position.set(width / 2, height * 0.55)
    root.addChild(content)
    for (let i = 0; i < 5; i++) {
      content.addChild(
        new Graphics()
          .roundRect(-90 + i * 38, -34, 30, 68, 6)
          .fill(i % 2 ? COLORS.rowActive : COLORS.accent),
      )
    }

    // Trauma meter (a bar scaled by trauma — transform only).
    const barW = Math.min(220, width * 0.4)
    const barX = (width - barW) / 2
    root.addChild(new Graphics().rect(barX, 14, barW, 8).fill(COLORS.panel))
    const barFill = new Graphics().rect(barX, 14, barW, 8).fill(COLORS.accent)
    barFill.pivot.set(barX, 0)
    barFill.position.set(barX, 0)
    root.addChild(barFill)
    const lbl = tag('trauma', theme.fontMono)
    lbl.anchor.set(0.5)
    lbl.position.set(width / 2, 34)
    root.addChild(lbl)

    let trauma = 0
    let hitT = 0
    return {
      update: (dt) => {
        hitT += dt.dtMs
        if (hitT >= 1300) {
          hitT = 0
          trauma = 1
        }
        trauma = Math.max(0, trauma - params.get('decay') * dt.dtSec)
        const sh = trauma * trauma
        const amp = params.get('intensity') * sh
        content.x = width / 2 + (rng.next() * 2 - 1) * amp
        content.y = height * 0.55 + (rng.next() * 2 - 1) * amp
        content.rotation = (rng.next() * 2 - 1) * sh * 0.06
        barFill.scale.x = trauma
      },
    }
  },
}

const hitFlash: PatternDemo = {
  id: 'hit-flash',
  name: 'Hit flash + squash',
  caption: 'On hit: a white flash and a squash-stretch that eases back (juice).',
  category: 'motion',
  params: [
    {
      key: 'interval',
      label: 'Hit interval',
      min: 500,
      max: 2500,
      step: 100,
      default: 1100,
      unit: 'ms',
    },
  ],
  mount({ stage, width, height, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    const obj = new Container()
    obj.position.set(width / 2, height / 2)
    root.addChild(obj)
    obj.addChild(new Graphics().roundRect(-34, -34, 68, 68, 12).fill(COLORS.accent))
    const flash = new Graphics().roundRect(-34, -34, 68, 68, 12).fill(0xffffff)
    flash.alpha = 0
    obj.addChild(flash)

    const DUR = 340
    let hitT = 0
    let t = DUR // not animating initially
    return {
      update: (dt) => {
        hitT += dt.dtMs
        if (hitT >= params.get('interval')) {
          hitT = 0
          t = 0
        }
        if (t < DUR) {
          t += dt.dtMs
          const k = Math.min(1, t / DUR)
          const e = easeOutBack(k)
          // Squash 1.5×/0.6× at impact, easing (with overshoot) back to 1×.
          obj.scale.set(1 + (1.5 - 1) * (1 - e), 1 + (0.6 - 1) * (1 - e))
          flash.alpha = Math.max(0, 1 - k * 3)
        } else {
          obj.scale.set(1)
          flash.alpha = 0
        }
      },
    }
  },
}

export const motionDemos: PatternDemo[] = [easings, tweenTargets, particles, screenShake, hitFlash]
