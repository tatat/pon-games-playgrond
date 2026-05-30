import {
  Container,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
  Graphics,
  Rectangle,
} from 'pixi.js'
import { COLORS } from '../constants'
import type { DemoContext, DemoHandle, PatternDemo } from '../demo'
import { tag, text } from '../demo-util'

// ── Chevron band primitives ─────────────────────────────────────────────────
/** How far the chevron point pokes past the slab's rectangle. */
const DEPTH = 16
/** Two-tone palette the slabs cycle through (ABAB ⇄ BABA reads as flow). */
const AB = [0x6ad1ff, 0x2f6bd6]

interface Band {
  view: Container
  update(dtMs: number): void
}

/** Builds one row of interlocking ">"-shaped slabs spanning `spanW`. Each
 * slab's right edge is a chevron point, its left edge the matching notch, so
 * the seams interlock. White-base, recoloured by `tint`. */
function buildSlabs(
  spanW: number,
  h: number,
  tileW: number,
  pad = 1,
): { content: Container; slabs: Graphics[] } {
  const content = new Container()
  const slabs: Graphics[] = []
  // `pad` extra slabs past each edge so neither the interlocking points nor a
  // scroll offset (up to `pad` tiles) ever reveal a gap.
  const count = Math.ceil(spanW / tileW) + 2 * pad
  for (let i = 0; i < count; i++) {
    // top edge → right ">" point → bottom edge → left ">" notch.
    const g = new Graphics()
      .poly([0, 0, tileW, 0, tileW + DEPTH, h / 2, tileW, h, 0, h, DEPTH, h / 2])
      .fill(0xffffff)
    g.x = (i - pad) * tileW
    slabs.push(g)
    content.addChild(g)
  }
  return { content, slabs }
}

/** Apparent motion with no translation: the slabs never move; only the two
 * tints swap every `pulseMs`, so the chevrons read as flowing right. */
function colorPhaseBand(spanW: number, h: number, tileW: number, pulseMs: number): Band {
  const view = new Container()
  const { content, slabs } = buildSlabs(spanW, h, tileW)
  view.addChild(content)
  let elapsed = 0
  let phase = 0
  const recolor = (): void => {
    for (const [i, g] of slabs.entries()) g.tint = AB[(i + phase) % AB.length] ?? 0xffffff
  }
  recolor()
  return {
    view,
    update: (dtMs) => {
      elapsed += dtMs
      if (elapsed < pulseMs) return
      const steps = Math.floor(elapsed / pulseMs)
      elapsed -= steps * pulseMs
      phase = (phase + steps) % AB.length
      recolor()
    },
  }
}

/** Real motion: the slabs keep fixed alternating colours and the whole strip
 * translates right at `speedPxPerMs`. The colours repeat every two tiles, so
 * the wrap distance must also be two tiles (wrapping by one would flip every
 * slab's colour and flicker). `pad = 3` keeps a left neighbour on-screen across
 * the whole 2-tile travel so the left-edge chevron notch is always filled. */
function scrollBand(spanW: number, h: number, tileW: number, speedPxPerMs: number): Band {
  const view = new Container()
  const { content, slabs } = buildSlabs(spanW, h, tileW, 3)
  for (const [i, g] of slabs.entries()) g.tint = AB[i % AB.length] ?? 0xffffff
  view.addChild(content)
  const period = tileW * AB.length
  let offset = 0
  return {
    view,
    update: (dtMs) => {
      // Translate right so the flow direction matches the ">" chevrons.
      offset += speedPxPerMs * dtMs
      if (offset >= period) offset -= period
      content.x = offset
    },
  }
}

const PULSE_SPEC = {
  key: 'pulse',
  label: 'Pulse',
  min: 80,
  max: 3000,
  step: 20,
  default: 220,
  unit: 'ms',
} as const
const TILE_SPEC = {
  key: 'tile',
  label: 'Tile width',
  min: 32,
  max: 120,
  step: 8,
  default: 64,
  unit: 'px',
} as const

// ── Band shape catalog (the "form" vocabulary) ──────────────────────────────
const ACCENT = COLORS.accent

interface BandShapeDef {
  id: string
  draw(g: Graphics, w: number, h: number, tile: number): void
}

/** Smooth circular-arc wave geometry: arcs of radius `r` sweeping ±BETA meet
 * tangentially at the baseline, so there are no cusps. One bump is `wb` wide. */
const BETA = Math.PI / 3
function serpGeom(tile: number, h: number): { r: number; wb: number } {
  const amax = h * 0.42
  const r = Math.min(tile / (2 * Math.sin(BETA)), amax / (1 - Math.cos(BETA)))
  return { r, wb: 2 * r * Math.sin(BETA) }
}

/** Edge-band tile patterns. Each `id` is the spoken token ("scallop rail",
 * "sawtooth band"). Drawn statically; a Scroll-speed param can animate them. */
const BAND_SHAPES: BandShapeDef[] = [
  {
    id: 'chevron',
    draw: (g, w, h, tile) => {
      // Shift left by one chevron depth and over-draw past the right edge; the
      // band is clipped to [0, w], so both ends read as clean vertical cuts.
      const count = Math.ceil(w / tile) + 2
      for (let i = 0; i < count; i++) {
        const x = i * tile - DEPTH
        g.poly([
          x,
          0,
          x + tile,
          0,
          x + tile + DEPTH,
          h / 2,
          x + tile,
          h,
          x,
          h,
          x + DEPTH,
          h / 2,
        ]).fill(i % 2 ? AB[1] : AB[0])
      }
    },
  },
  {
    id: 'sawtooth',
    draw: (g, w, h, tile) => {
      g.rect(0, h * 0.55, w, h * 0.45).fill(ACCENT)
      for (let x = 0; x < w; x += tile)
        g.poly([x, h * 0.55, x + tile, h * 0.55, x + tile, 0]).fill(ACCENT)
    },
  },
  {
    id: 'zigzag',
    draw: (g, w, h, tile) => {
      const half = tile / 2
      // Start at the first vertex (bottom-left) and alternate — no leading
      // vertical stub.
      g.moveTo(0, h - 3)
      let up = true
      for (let x = half; x <= w; x += half) {
        g.lineTo(x, up ? 3 : h - 3)
        up = !up
      }
      g.stroke({ color: ACCENT, width: 6 })
    },
  },
  {
    id: 'scallop',
    draw: (g, w, h, tile) => {
      g.rect(0, h * 0.5, w, h * 0.5).fill(ACCENT)
      const r = Math.min(tile / 2, h * 0.5)
      for (let x = r; x < w + r; x += tile) g.circle(x, h * 0.5, r).fill(ACCENT)
    },
  },
  {
    id: 'square-wave',
    draw: (g, w, h, tile) => {
      g.rect(0, h * 0.5, w, h * 0.5).fill(ACCENT)
      for (let i = 0; i * tile < w; i += 2) g.rect(i * tile, 0, tile, h * 0.5).fill(ACCENT)
    },
  },
  {
    id: 'dots',
    draw: (g, w, h, tile) => {
      const r = Math.min(tile * 0.28, h * 0.34)
      for (let x = tile / 2; x < w; x += tile) g.circle(x, h / 2, r).fill(ACCENT)
    },
  },
  {
    id: 'dashes',
    draw: (g, w, h, tile) => {
      const dw = tile * 0.6
      for (let x = 0; x < w; x += tile) g.roundRect(x, h * 0.3, dw, h * 0.4, 4).fill(ACCENT)
    },
  },
  {
    id: 'sine',
    draw: (g, w, h, tile) => {
      const amp = h * 0.36
      const k = (Math.PI * 2) / tile // wavelength = tile
      for (let x = 0; x <= w; x += 3) {
        const y = h / 2 + Math.sin(x * k) * amp
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke({ color: ACCENT, width: 5 })
    },
  },
  {
    id: 'sine-cos',
    draw: (g, w, h, tile) => {
      // Superposed sine + cosine (different frequency) → a wavier compound line.
      const amp = h * 0.36
      const k = (Math.PI * 2) / tile
      for (let x = 0; x <= w; x += 3) {
        const y = h / 2 + (Math.sin(x * k) * 0.6 + Math.cos(x * k * 2) * 0.4) * amp
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke({ color: ACCENT, width: 5 })
    },
  },
  {
    id: 'sine-mirror',
    draw: (g, w, h, tile) => {
      // A sine and its flip (antiphase: sin and -sin) overlaid; they cross into
      // a chain of lens/leaf shapes.
      const amp = h * 0.36
      const k = (Math.PI * 2) / tile
      for (const sign of [1, -1]) {
        for (let x = 0; x <= w; x += 3) {
          const y = h / 2 + sign * Math.sin(x * k) * amp
          if (x === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
      }
      g.stroke({ color: ACCENT, width: 5 })
    },
  },
  {
    id: 'serpentine',
    draw: (g, w, h, tile) => {
      // Sine-like, but each hump is a TRUE circular arc, alternating up/down and
      // meeting tangentially at the baseline (no cusps).
      const { r, wb } = serpGeom(tile, h)
      const cosB = Math.cos(BETA)
      const y0 = h / 2
      for (let x = 0; x <= w; x += 2) {
        const k = Math.floor(x / wb)
        const dx = x - (k * wb + wb / 2)
        const s = Math.sqrt(Math.max(0, r * r - dx * dx))
        // Even bumps arc up (centre below), odd bumps arc down.
        const y = k % 2 === 0 ? y0 + r * cosB - s : y0 - r * cosB + s
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke({ color: ACCENT, width: 5 })
    },
  },
]

const bandShapes: PatternDemo = {
  id: 'band-shapes',
  name: 'Band shapes',
  caption: 'Edge-band tile patterns (chevron, sawtooth, scallop, …) — the form vocabulary.',
  category: 'bands',
  pad: true,
  params: [
    { key: 'tile', label: 'Tile width', min: 24, max: 96, step: 4, default: 48, unit: 'px' },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    // Comfortable fixed row height; the full list overflows the stage and is
    // scrolled vertically (wheel / drag), like the catalog menu.
    const rowH = 60
    const bandH = 34
    const contentH = BAND_SHAPES.length * rowH + 8
    const minScroll = Math.min(0, height - contentH)

    // Scrollable list clipped to the stage.
    const holder = new Container()
    const clip = new Graphics().rect(0, 0, width, height).fill(0xffffff)
    holder.addChild(clip)
    holder.mask = clip
    root.addChild(holder)
    const list = new Container()
    holder.addChild(list)

    const build = (): void => {
      for (const c of list.removeChildren()) c.destroy({ children: true })
      const tile = params.get('tile')
      BAND_SHAPES.forEach((bs, i) => {
        const label = tag(bs.id, theme.fontMono)
        label.position.set(0, i * rowH + 4)
        list.addChild(label)
        const g = new Graphics()
        bs.draw(g, width, bandH, tile)
        g.position.set(0, i * rowH + 22)
        list.addChild(g)
      })
    }
    build()
    const unsub = params.subscribe(build)

    // Vertical scroll (wheel + drag), matching the menu's behaviour.
    let scrollY = 0
    const apply = (): void => {
      scrollY = Math.max(minScroll, Math.min(0, scrollY))
      list.y = scrollY
    }
    root.eventMode = 'static'
    root.hitArea = new Rectangle(0, 0, width, height)
    root.on('wheel', (e: FederatedWheelEvent) => {
      scrollY -= e.deltaY
      apply()
    })
    let dragging = false
    let startGY = 0
    let startScroll = 0
    root.on('pointerdown', (e: FederatedPointerEvent) => {
      dragging = true
      startGY = e.global.y
      startScroll = scrollY
    })
    root.on('pointermove', (e: FederatedPointerEvent) => {
      if (!dragging) return
      scrollY = startScroll + (e.global.y - startGY)
      apply()
    })
    const stop = (): void => {
      dragging = false
    }
    root.on('pointerup', stop)
    root.on('pointerupoutside', stop)

    return {
      dispose: () => {
        unsub()
        root.removeAllListeners()
      },
    }
  },
}

const flowTechnique: PatternDemo = {
  id: 'flow-technique',
  name: 'Flow technique',
  caption: 'Same band, two ways to read as moving: color-phase vs. scroll.',
  category: 'bands',
  pad: true,
  params: [
    PULSE_SPEC,
    { key: 'speed', label: 'Scroll speed', min: 0, max: 300, step: 10, default: 60, unit: 'px/s' },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    const h = 56
    const top = height * 0.3
    const bottom = height * 0.68

    const phaseTag = tag('flow-color-phase · swap tints, no translation', theme.fontMono)
    phaseTag.position.set(0, top - 28)
    const scrollTag = tag('flow-scroll · translate + wrap by one tile', theme.fontMono)
    scrollTag.position.set(0, bottom - 28)
    root.addChild(phaseTag, scrollTag)

    const holder = new Container()
    root.addChild(holder)
    let phase: Band | null = null
    let scroll: Band | null = null
    const build = (): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true })
      phase = colorPhaseBand(width, h, TILE_SPEC.default, params.get('pulse'))
      phase.view.position.set(0, top)
      scroll = scrollBand(width, h, TILE_SPEC.default, params.get('speed') / 1000)
      scroll.view.position.set(0, bottom)
      holder.addChild(phase.view, scroll.view)
    }
    build()
    const unsub = params.subscribe(build)

    return {
      update: (dt) => {
        phase?.update(dt.dtMs)
        scroll?.update(dt.dtMs)
      },
      dispose: () => unsub(),
    }
  },
}

const edgeRail: PatternDemo = {
  id: 'edge-rail',
  name: 'Edge rail',
  caption: 'Top + bottom rails framing a playfield (composition).',
  category: 'bands',
  params: [
    PULSE_SPEC,
    {
      key: 'runner',
      label: 'Runner speed',
      min: 60,
      max: 700,
      step: 20,
      default: 300,
      unit: 'px/s',
    },
  ],
  mount({ stage, width, height, theme, params }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    const h = 40
    const fieldTop = h + 20
    const fieldH = height - 2 * h - 40
    root.addChild(
      new Graphics()
        .rect(0, fieldTop, width, fieldH)
        .fill({ color: COLORS.panelDeep })
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const runner = new Graphics().circle(0, 0, 16).fill(COLORS.accent)
    runner.position.set(width / 2, fieldTop + fieldH / 2)
    root.addChild(runner)
    const label = text('edge-rail: chevron bands lock the play area top & bottom', {
      fill: COLORS.faint,
      fontSize: 13,
      fontFamily: theme.fontMono,
    })
    label.anchor.set(0.5)
    label.position.set(width / 2, fieldTop + fieldH / 2 + 44)
    root.addChild(label)

    const holder = new Container()
    root.addChild(holder)
    let topRail: Band | null = null
    let bottomRail: Band | null = null
    const build = (): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true })
      topRail = colorPhaseBand(width, h, TILE_SPEC.default, params.get('pulse'))
      bottomRail = colorPhaseBand(width, h, TILE_SPEC.default, params.get('pulse'))
      topRail.view.position.set(0, 0)
      bottomRail.view.position.set(0, height - h)
      holder.addChild(topRail.view, bottomRail.view)
    }
    build()
    const unsub = params.subscribe(build)

    let t = 0
    return {
      update: (dt) => {
        topRail?.update(dt.dtMs)
        bottomRail?.update(dt.dtMs)
        // Bounce the runner across the field; param sets px/s, mapped to the
        // sine sweep's angular rate against the half-width amplitude.
        const amp = width / 2 - 60
        t += (params.get('runner') / Math.max(amp, 1)) * dt.dtSec
        runner.x = width / 2 + Math.sin(t) * amp
      },
      dispose: () => unsub(),
    }
  },
}

export const bandDemos: PatternDemo[] = [bandShapes, flowTechnique, edgeRail]
