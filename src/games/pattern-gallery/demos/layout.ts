import { Container, Graphics } from 'pixi.js'
import { makeSegmentedControl } from '../../../engine/ui/segmented-control'
import { COLORS, RADIUS } from '../constants'
import type { DemoContext, DemoHandle, PatternDemo } from '../demo'
import { reactive, tag, text } from '../demo-util'

/** Fills the stage with a faux "playfield" backdrop the layout sits on. */
function field(width: number, height: number): Graphics {
  return new Graphics()
    .rect(0, 0, width, height)
    .fill(COLORS.panelDeep)
    .stroke({ color: COLORS.border, width: 1 })
}

const titleScreen: PatternDemo = {
  id: 'title-screen',
  name: 'Title screen',
  caption: 'Centered title + subtitle + blinking start prompt + footer.',
  category: 'layout',
  mount({ stage, width, height, theme }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    root.addChild(field(width, height))

    const title = text('PATTERN GALLERY', {
      fill: COLORS.text,
      fontSize: 46,
      fontFamily: theme.fontSans,
      fontWeight: 'bold',
      letterSpacing: 2,
    })
    title.anchor.set(0.5)
    title.position.set(width / 2, height * 0.38)
    root.addChild(title)

    const subtitle = text('a catalog of named patterns', {
      fill: COLORS.muted,
      fontSize: 18,
      fontFamily: theme.fontSans,
    })
    subtitle.anchor.set(0.5)
    subtitle.position.set(width / 2, height * 0.38 + 42)
    root.addChild(subtitle)

    const prompt = text('PRESS SPACE / TAP TO START', {
      fill: COLORS.accent,
      fontSize: 20,
      fontFamily: theme.fontMono,
    })
    prompt.anchor.set(0.5)
    prompt.position.set(width / 2, height * 0.72)
    root.addChild(prompt)

    const footer = text('v0.0.0 · © pon pon games', {
      fill: COLORS.faint,
      fontSize: 13,
      fontFamily: theme.fontMono,
    })
    footer.anchor.set(0.5, 1)
    footer.position.set(width / 2, height - 12)
    root.addChild(footer)

    let t = 0
    return {
      update: (dt) => {
        t += dt.dtMs
        prompt.alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t / 350))
      },
    }
  },
}

/** Dashed inset guide showing the safe-margin the HUD keeps from the edges. */
function marginGuide(width: number, height: number, m: number): Graphics {
  const g = new Graphics()
  const dash = 8
  const drawLine = (x1: number, y1: number, x2: number, y2: number): void => {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    const steps = Math.floor(len / (dash * 2))
    for (let i = 0; i < steps; i++) {
      const a = (i * 2 * dash) / len
      const b = (i * 2 * dash + dash) / len
      g.moveTo(x1 + dx * a, y1 + dy * a).lineTo(x1 + dx * b, y1 + dy * b)
    }
  }
  drawLine(m, m, width - m, m)
  drawLine(m, height - m, width - m, height - m)
  drawLine(m, m, m, height - m)
  drawLine(width - m, m, width - m, height - m)
  g.stroke({ color: COLORS.faint, width: 1 })
  return g
}

const hudCorners: PatternDemo = {
  id: 'hud-corners',
  name: 'HUD corners',
  caption: 'Readouts anchored to the four corners inside a safe margin.',
  category: 'layout',
  params: [
    { key: 'margin', label: 'Safe margin', min: 8, max: 80, step: 4, default: 28, unit: 'px' },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    root.addChild(field(width, height))

    const note = tag('anchor to each corner · keep ≥ margin from edges', theme.fontSans)
    note.anchor.set(0.5)
    note.position.set(width / 2, height / 2)
    root.addChild(note)

    const holder = new Container()
    root.addChild(holder)
    const build = (): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true })
      const m = params.get('margin')
      holder.addChild(marginGuide(width, height, m))
      const corner = (content: string, ax: number, ay: number, x: number, y: number): void => {
        const t = text(content, { fill: COLORS.text, fontSize: 22, fontFamily: theme.fontMono })
        t.anchor.set(ax, ay)
        t.position.set(x, y)
        holder.addChild(t)
      }
      corner('SCORE 01200', 0, 0, m, m)
      corner('♥ ♥ ♥', 1, 0, width - m, m)
      corner('TIME 0:42', 0, 1, m, height - m)
      corner('x1.5', 1, 1, width - m, height - m)
    }
    build()
    const unsub = params.subscribe(build)
    return { dispose: () => unsub() }
  },
}

const hudTopbar: PatternDemo = {
  id: 'hud-topbar',
  name: 'HUD top bar',
  caption: 'A full-width bar splitting score / lives / level into segments.',
  category: 'layout',
  params: [
    { key: 'barH', label: 'Bar height', min: 32, max: 96, step: 4, default: 56, unit: 'px' },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    root.addChild(field(width, height))

    const holder = new Container()
    root.addChild(holder)
    const build = (): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true })
      const barH = params.get('barH')
      holder.addChild(
        new Graphics()
          .rect(0, 0, width, barH)
          .fill(COLORS.panel)
          .stroke({ color: COLORS.border, width: 1 }),
      )
      const seg = (content: string, cx: number): void => {
        const t = text(content, { fill: COLORS.text, fontSize: 20, fontFamily: theme.fontMono })
        t.anchor.set(0.5)
        t.position.set(cx, barH / 2)
        holder.addChild(t)
      }
      seg('SCORE 01200', width * 0.2)
      seg('♥ ♥ ♥', width * 0.5)
      seg('LV 3', width * 0.8)
      for (const x of [width / 3, (width * 2) / 3]) {
        holder.addChild(
          new Graphics()
            .moveTo(x, 10)
            .lineTo(x, barH - 10)
            .stroke({ color: COLORS.border, width: 1 }),
        )
      }
    }
    build()
    const unsub = params.subscribe(build)
    return { dispose: () => unsub() }
  },
}

const resultScreen: PatternDemo = {
  id: 'result-screen',
  name: 'Result screen',
  caption: 'Centered panel with final score, rank, and retry/continue.',
  category: 'layout',
  mount({ stage, width, height, theme }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    root.addChild(field(width, height))
    // Dim scrim over the (frozen) playfield.
    root.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.5 }))

    const pw = width * 0.6
    const ph = height * 0.66
    const px = (width - pw) / 2
    const py = (height - ph) / 2
    root.addChild(
      new Graphics()
        .roundRect(px, py, pw, ph, RADIUS.card)
        .fill(COLORS.panel)
        .stroke({ color: COLORS.border, width: 1 }),
    )

    const line = (content: string, size: number, dy: number, fill: number = COLORS.text): void => {
      const t = text(content, {
        fill,
        fontSize: size,
        fontFamily: theme.fontSans,
        fontWeight: 'bold',
      })
      t.anchor.set(0.5)
      t.position.set(width / 2, py + dy)
      root.addChild(t)
    }
    line('RESULT', 34, 46, COLORS.muted)
    line('12,400', 64, 120)
    line('RANK  A', 26, 180, COLORS.accent)

    const btn = (label: string, cx: number): void => {
      const w = pw * 0.34
      const h = 44
      const bx = cx - w / 2
      const by = py + ph - 70
      root.addChild(new Graphics().roundRect(bx, by, w, h, RADIUS.control).fill(COLORS.rowActive))
      const t = text(label, { fill: COLORS.text, fontSize: 18, fontFamily: theme.fontSans })
      t.anchor.set(0.5)
      t.position.set(cx, by + h / 2)
      root.addChild(t)
    }
    btn('RETRY', width / 2 - pw * 0.2)
    btn('NEXT', width / 2 + pw * 0.2)
    return {}
  },
}

type Area = 'sides' | 'bottom' | 'overlay'

const letterboxArea: PatternDemo = {
  id: 'letterbox-area',
  name: 'Letterbox / touch pad',
  caption: 'The letterbox margin is where the on-screen virtual pad lives: GameLayout.area.',
  category: 'layout',
  pad: true,
  mount({ stage, width, height, theme }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)
    const area = reactive<Area>('sides')

    const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
    const viewport = new Graphics()
    const logical = new Graphics()
    const padG = new Graphics()
    root.addChild(viewport, logical, padG)
    const caption = text('', { fill: COLORS.muted, fontSize: 14, fontFamily: theme.fontMono })
    caption.position.set(0, height - 28)
    root.addChild(caption)

    // A mock virtual pad: stick (ring + knob) on the left, two buttons on the
    // right — the thing that actually occupies the letterbox margin.
    const drawPad = (
      sx: number,
      sy: number,
      bx: number,
      by: number,
      r: number,
      alpha: number,
    ): void => {
      padG.circle(sx, sy, r).stroke({ color: COLORS.accent, width: 2, alpha })
      padG.circle(sx, sy, r * 0.42).fill({ color: COLORS.accent, alpha })
      padG.circle(bx - r * 0.55, by + r * 0.2, r * 0.4).fill({ color: COLORS.accent, alpha })
      padG.circle(bx + r * 0.55, by - r * 0.2, r * 0.4).fill({ color: COLORS.accent, alpha })
    }

    const draw = (): void => {
      viewport.clear()
      logical.clear()
      padG.clear()
      const a = area.get()
      // Reserve a top strip for the segmented control / tag, and a bottom strip
      // for the caption, so the simulated viewport never overlaps them.
      const top = 44
      const bandH = height - 44 - top
      const vpW = a === 'sides' ? width : a === 'bottom' ? width * 0.6 : width * 0.86
      const vpH = a === 'bottom' ? bandH : a === 'sides' ? bandH * 0.62 : bandH * 0.92
      const vx = (width - vpW) / 2
      const vy = top + (bandH - vpH) / 2
      viewport
        .rect(vx, vy, vpW, vpH)
        .fill(COLORS.panelDeep)
        .stroke({ color: COLORS.faint, width: 1 })
      // 16:9 logical box scaled to fit inside, centered.
      const scale = Math.min(vpW / 16, vpH / 9)
      const lw = 16 * scale
      const lh = 9 * scale
      const lx = vx + (vpW - lw) / 2
      const ly = vy + (vpH - lh) / 2
      logical
        .rect(lx, ly, lw, lh)
        .fill({ color: COLORS.rowActive, alpha: 0.5 })
        .stroke({ color: COLORS.accent, width: 2 })

      // Place the pad where the spare room is.
      if (a === 'sides') {
        const r = clampN((lx - vx) * 0.34, 10, 26)
        const cy = vy + vpH * 0.55
        drawPad((vx + lx) / 2, cy, (lx + lw + vx + vpW) / 2, cy, r, 0.9)
        caption.text = "area = 'sides'  ·  pad sits in the left/right margins"
      } else if (a === 'bottom') {
        const r = clampN((vy + vpH - (ly + lh)) * 0.3, 10, 24)
        const cy = (ly + lh + vy + vpH) / 2
        drawPad(vx + vpW * 0.22, cy, vx + vpW * 0.78, cy, r, 0.9)
        caption.text = "area = 'bottom'  ·  pad sits in the bottom margin"
      } else {
        const r = clampN(lh * 0.1, 10, 22)
        const cy = ly + lh * 0.8
        drawPad(lx + lw * 0.16, cy, lx + lw * 0.84, cy, r, 0.55)
        caption.text = "area = 'overlay'  ·  no margin → pad overlays the playfield"
      }
    }

    const ctl = makeSegmentedControl<Area>({
      choices: [
        { label: 'sides', value: 'sides' },
        { label: 'bottom', value: 'bottom' },
        { label: 'overlay', value: 'overlay' },
      ],
      getValue: area.get,
      onChange: (v) => area.set(v),
      subscribe: area.subscribe,
      theme,
      buttonW: 88,
      buttonH: 30,
    })
    ctl.view.position.set(0, 0)
    root.addChild(ctl.view)

    const tagLine = tag('VIRTUAL-PAD PLACEMENT', theme.fontSans)
    tagLine.position.set(width - 220, 8)
    root.addChild(tagLine)

    const unsub = area.subscribe(draw)
    draw()
    return {
      dispose: () => {
        unsub()
        ctl.dispose()
      },
    }
  },
}

export const layoutDemos: PatternDemo[] = [
  titleScreen,
  hudCorners,
  hudTopbar,
  resultScreen,
  letterboxArea,
]
