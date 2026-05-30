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
/** Width of the ‹ / › hit zones at each end of a stepper row. */
const ARROW_W = 34

/** One param row. `kind` decides how a pointer hit is interpreted:
 * a slider maps the x position to a value; a stepper's end zones decrement /
 * increment the index. `redraw` repaints the row from the current value. */
interface Row {
  spec: ParamSpec
  rowTop: number
  redraw(): void
  /** Slider: set value from local x. Stepper: step by the end zone hit. */
  onDown(localX: number): void
  /** Slider drag; steppers ignore moves. */
  draggable: boolean
}

/** The right-hand panel. Each `ParamSpec` becomes a labelled row whose current
 * value is printed alongside — those numbers/names are the point: they give a
 * human a concrete figure to quote ("flow-scroll at speed 90", "easeOutBack").
 * A plain spec is a slider; one with `options` is a stepper. Exposes a
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

  const clampToStep = (spec: ParamSpec, raw: number): number => {
    const stepped = spec.min + Math.round((raw - spec.min) / spec.step) * spec.step
    return Math.max(spec.min, Math.min(spec.max, stepped))
  }

  const rows: Row[] = []
  specs.forEach((spec, i) => {
    values.set(spec.key, spec.default)
    const rowTop = ROW_TOP + i * ROW_H
    const labelY = rowTop
    const controlY = rowTop + 34

    const label = text(spec.label, { fill: COLORS.text, fontSize: 15, fontFamily: theme.fontSans })
    label.position.set(PAD, labelY)
    view.addChild(label)

    if (spec.options) {
      rows.push(makeStepper(view, theme, spec, rowTop, controlY, width, values, clampToStep))
    } else {
      const value = text('', { fill: COLORS.accent, fontSize: 15, fontFamily: theme.fontMono })
      value.anchor.set(1, 0)
      value.position.set(width - PAD, labelY)
      view.addChild(value)
      rows.push(makeSlider(view, spec, rowTop, controlY, width, values, value, clampToStep))
    }
  })
  for (const r of rows) r.redraw()

  // Drag handling on the whole panel so the pointer can leave a knob mid-drag.
  view.eventMode = 'static'
  view.hitArea = new Rectangle(0, 0, width, height)
  let active: Row | undefined
  const apply = (r: Row, localX: number): void => {
    const before = values.get(r.spec.key)
    r.onDown(localX)
    if (values.get(r.spec.key) !== before) {
      r.redraw()
      notify()
    }
  }
  view.on('pointerdown', (e: FederatedPointerEvent) => {
    const lp = e.getLocalPosition(view)
    const hit = rows.find((r) => lp.y >= r.rowTop && lp.y < r.rowTop + ROW_H)
    active = hit?.draggable ? hit : undefined
    if (hit) apply(hit, lp.x)
  })
  view.on('pointermove', (e: FederatedPointerEvent) => {
    if (active) apply(active, e.getLocalPosition(view).x)
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

/** A draggable slider row for a numeric spec. */
function makeSlider(
  view: Container,
  spec: ParamSpec,
  rowTop: number,
  sliderY: number,
  width: number,
  values: Map<string, number>,
  value: Text,
  clampToStep: (spec: ParamSpec, raw: number) => number,
): Row {
  const x0 = PAD + KNOB_R
  const trackW = width - 2 * (PAD + KNOB_R)
  const decimals = spec.step < 1 ? (String(spec.step).split('.')[1]?.length ?? 1) : 0

  view.addChild(new Graphics().roundRect(x0, sliderY - 3, trackW, 6, 3).fill(COLORS.border))
  const fill = new Graphics()
  const knob = new Graphics().circle(0, 0, KNOB_R).fill(COLORS.accent)
  view.addChild(fill, knob)

  return {
    spec,
    rowTop,
    draggable: true,
    redraw: () => {
      const v = values.get(spec.key) ?? spec.default
      const t = (v - spec.min) / (spec.max - spec.min)
      fill
        .clear()
        .roundRect(x0, sliderY - 3, trackW * t, 6, 3)
        .fill(COLORS.rowActive)
      knob.position.set(x0 + trackW * t, sliderY)
      value.text = `${v.toFixed(decimals)}${spec.unit ?? ''}`
    },
    onDown: (localX) => {
      const t = Math.max(0, Math.min(1, (localX - x0) / trackW))
      values.set(spec.key, clampToStep(spec, spec.min + t * (spec.max - spec.min)))
    },
  }
}

/** A ‹ name › stepper row for an `options` spec. The end zones decrement /
 * increment the index; the chosen option name sits between them. */
function makeStepper(
  view: Container,
  theme: UiTheme,
  spec: ParamSpec,
  rowTop: number,
  controlY: number,
  width: number,
  values: Map<string, number>,
  clampToStep: (spec: ParamSpec, raw: number) => number,
): Row {
  const options = spec.options ?? []
  const left = tag('‹', theme.fontSans)
  left.style.fontSize = 22
  left.anchor.set(0, 0.5)
  left.position.set(PAD, controlY)
  const right = tag('›', theme.fontSans)
  right.style.fontSize = 22
  right.anchor.set(1, 0.5)
  right.position.set(width - PAD, controlY)
  const name = text('', { fill: COLORS.accent, fontSize: 15, fontFamily: theme.fontMono })
  name.anchor.set(0.5)
  name.position.set(width / 2, controlY)
  view.addChild(left, right, name)

  return {
    spec,
    rowTop,
    draggable: false,
    redraw: () => {
      const idx = values.get(spec.key) ?? spec.default
      name.text = options[idx] ?? String(idx)
      // Dim the end arrow once there's nothing left to step to.
      left.alpha = idx > spec.min ? 1 : 0.25
      right.alpha = idx < spec.max ? 1 : 0.25
    },
    onDown: (localX) => {
      const dir = localX < PAD + ARROW_W ? -1 : localX > width - PAD - ARROW_W ? 1 : 0
      if (dir === 0) return
      values.set(spec.key, clampToStep(spec, (values.get(spec.key) ?? spec.default) + dir))
    },
  }
}
