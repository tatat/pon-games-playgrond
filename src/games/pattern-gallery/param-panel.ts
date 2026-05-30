import { Container, type FederatedPointerEvent, Graphics, Rectangle, type Text } from 'pixi.js'
import type { UiTheme } from '../../engine/ui-theme'
import type { Disposable } from '../../engine/util/disposable'
import { COLORS, RADIUS } from './constants'
import type { DemoParams, ParamSpec } from './demo'
import { tag, text } from './demo-util'

export interface ParamPanel extends Disposable {
  view: Container
  params: DemoParams
}

const PAD = 16
const ROW_TOP = 50
const ROW_H = 64
const KNOB_R = 9

interface Slider {
  spec: ParamSpec
  x0: number
  trackW: number
  sliderY: number
  rowTop: number
  decimals: number
  fill: Graphics
  knob: Graphics
  value: Text
}

/** The right-hand panel. Each `ParamSpec` becomes a labelled slider whose
 * current value is printed alongside — those numbers are the point: they give
 * a human a concrete figure to quote ("flow-scroll at speed 90"). Exposes a
 * `DemoParams` the demo reads from. */
export function makeParamPanel(
  specs: readonly ParamSpec[],
  width: number,
  height: number,
  theme: UiTheme,
): ParamPanel {
  const view = new Container()
  view.addChild(
    new Graphics()
      .roundRect(0, 0, width, height, RADIUS.panel)
      .fill(COLORS.panel)
      .stroke({ color: COLORS.border, width: 1 }),
  )
  const title = tag('PARAMETERS', theme.fontSans)
  title.position.set(PAD, 16)
  view.addChild(title)

  const values = new Map<string, number>()
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const l of listeners) l()
  }

  if (specs.length === 0) {
    const none = text('no tunable parameters', {
      fill: COLORS.faint,
      fontSize: 14,
      fontFamily: theme.fontMono,
    })
    none.position.set(PAD, ROW_TOP)
    view.addChild(none)
  }

  const sliders: Slider[] = []
  specs.forEach((spec, i) => {
    values.set(spec.key, spec.default)
    const rowTop = ROW_TOP + i * ROW_H
    const labelY = rowTop
    const sliderY = rowTop + 34
    const x0 = PAD + KNOB_R
    const trackW = width - 2 * (PAD + KNOB_R)
    const decimals = spec.step < 1 ? (String(spec.step).split('.')[1]?.length ?? 1) : 0

    const label = text(spec.label, { fill: COLORS.text, fontSize: 15, fontFamily: theme.fontSans })
    label.position.set(PAD, labelY)
    view.addChild(label)

    const value = text('', { fill: COLORS.accent, fontSize: 15, fontFamily: theme.fontMono })
    value.anchor.set(1, 0)
    value.position.set(width - PAD, labelY)
    view.addChild(value)

    view.addChild(new Graphics().roundRect(x0, sliderY - 3, trackW, 6, 3).fill(COLORS.border))
    const fill = new Graphics()
    const knob = new Graphics().circle(0, 0, KNOB_R).fill(COLORS.accent)
    view.addChild(fill, knob)

    sliders.push({ spec, x0, trackW, sliderY, rowTop, decimals, fill, knob, value })
  })

  const redraw = (s: Slider): void => {
    const v = values.get(s.spec.key) ?? s.spec.default
    const t = (v - s.spec.min) / (s.spec.max - s.spec.min)
    s.fill
      .clear()
      .roundRect(s.x0, s.sliderY - 3, s.trackW * t, 6, 3)
      .fill(COLORS.rowActive)
    s.knob.position.set(s.x0 + s.trackW * t, s.sliderY)
    s.value.text = `${v.toFixed(s.decimals)}${s.spec.unit ?? ''}`
  }
  for (const s of sliders) redraw(s)

  // Drag handling on the whole panel so the pointer can leave a knob mid-drag.
  view.eventMode = 'static'
  view.hitArea = new Rectangle(0, 0, width, height)
  let active: Slider | undefined
  const setFromX = (s: Slider, localX: number): void => {
    const t = Math.max(0, Math.min(1, (localX - s.x0) / s.trackW))
    const raw = s.spec.min + t * (s.spec.max - s.spec.min)
    const stepped = s.spec.min + Math.round((raw - s.spec.min) / s.spec.step) * s.spec.step
    const v = Math.max(s.spec.min, Math.min(s.spec.max, stepped))
    if (values.get(s.spec.key) === v) return
    values.set(s.spec.key, v)
    redraw(s)
    notify()
  }
  view.on('pointerdown', (e: FederatedPointerEvent) => {
    const lp = e.getLocalPosition(view)
    active = sliders.find((s) => lp.y >= s.rowTop && lp.y < s.rowTop + ROW_H)
    if (active) setFromX(active, lp.x)
  })
  view.on('pointermove', (e: FederatedPointerEvent) => {
    if (active) setFromX(active, e.getLocalPosition(view).x)
  })
  const stop = (): void => {
    active = undefined
  }
  view.on('pointerup', stop)
  view.on('pointerupoutside', stop)

  const params: DemoParams = {
    get: (key) => values.get(key) ?? 0,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }

  return {
    view,
    params,
    dispose: () => {
      view.removeAllListeners()
      listeners.clear()
    },
  }
}
