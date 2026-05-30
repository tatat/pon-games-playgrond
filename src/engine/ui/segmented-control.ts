import { FancyButton } from '@pixi/ui'
import { Container, Graphics, Text } from 'pixi.js'
import type { UiTheme } from '../ui-theme'
import type { Disposable } from '../util/disposable'

/** One option in a `SegmentedControl`. */
export interface SegmentedChoice<T> {
  label: string
  value: T
}

export interface SegmentedControlOptions<T> {
  choices: SegmentedChoice<T>[]
  /** Source-of-truth getter, re-read whenever `subscribe` fires. */
  getValue: () => T
  /** Notify the source on user selection. */
  onChange: (value: T) => void
  /** Reactive source — `(listener) => unsubscribe`. */
  subscribe: (listener: () => void) => () => void
  theme: UiTheme
  buttonW?: number
  buttonH?: number
  step?: number
  /** Label font size. Defaults to 17. */
  fontSize?: number
}

export interface SegmentedControl extends Disposable {
  view: Container
}

/** Single-select segmented control rendered as a horizontal row of
 * pill-rectangle buttons. The active option fills white with dark text;
 * the rest sit on a muted dark fill. Reactive to external changes via
 * `subscribe` + `getValue`. */
export function makeSegmentedControl<T>(opts: SegmentedControlOptions<T>): SegmentedControl {
  const { choices, getValue, onChange, subscribe, theme } = opts
  const buttonW = opts.buttonW ?? 52
  const buttonH = opts.buttonH ?? 26
  const step = opts.step ?? buttonW + 8
  const fontSize = opts.fontSize ?? 17

  const view = new Container()
  const buttons: FancyButton[] = []
  let x = 0
  for (const choice of choices) {
    const btn = new FancyButton({
      defaultView: viewFor(choice.label, false, false, theme, buttonW, buttonH, fontSize),
      hoverView: viewFor(choice.label, false, true, theme, buttonW, buttonH, fontSize),
      pressedView: viewFor(choice.label, true, false, theme, buttonW, buttonH, fontSize),
    })
    btn.onPress.connect(() => onChange(choice.value))
    btn.position.set(x, 0)
    buttons.push(btn)
    view.addChild(btn)
    x += step
  }

  const refresh = (): void => {
    const current = getValue()
    buttons.forEach((b, i) => {
      const c = choices[i]
      if (!c) return
      const active = c.value === current
      b.defaultView = viewFor(c.label, active, false, theme, buttonW, buttonH, fontSize)
      b.hoverView = viewFor(c.label, active, true, theme, buttonW, buttonH, fontSize)
    })
  }
  refresh()
  const unsubscribe = subscribe(refresh)

  return {
    view,
    dispose: () => unsubscribe(),
  }
}

// ── Visual ─────────────────────────────────────────────────────────────────

const PANEL_BG = 0x1a1a1c
const INACTIVE = 0x3a3a3e
const HOVER = 0x4a4a4e
const WHITE = 0xffffff

function viewFor(
  label: string,
  active: boolean,
  hovered: boolean,
  theme: UiTheme,
  w: number,
  h: number,
  fontSize: number,
): Container {
  const c = new Container()
  const fill = active ? WHITE : hovered ? HOVER : INACTIVE
  const textFill = active ? PANEL_BG : WHITE
  c.addChild(new Graphics().roundRect(0, 0, w, h, 3).fill(fill))
  const t = new Text({
    text: label,
    style: { fill: textFill, fontSize, fontFamily: theme.fontSans },
  })
  t.anchor.set(0.5)
  t.position.set(w / 2, h / 2)
  c.addChild(t)
  return c
}
