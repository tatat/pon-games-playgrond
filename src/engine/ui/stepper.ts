import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { UiTheme } from '../ui-theme'
import type { Disposable } from '../util/disposable'

export interface StepperChoice<T> {
  label: string
  value: T
}

export interface StepperOptions<T> {
  choices: StepperChoice<T>[]
  getValue(): T
  onChange(value: T): void
  subscribe(listener: () => void): () => void
  theme: UiTheme
  /** Total width the stepper occupies. Defaults to 200. */
  width?: number
  /** Button height. Defaults to 28. */
  height?: number
  /** Loop back to the first / last choice past the ends. Defaults to true. */
  wrap?: boolean
}

export interface Stepper extends Disposable {
  view: Container
}

/** A single-row pick from a list. Two arrow buttons on either side of a
 * readout — cheap to render, finger-friendly hit targets, and works the
 * same whether the list has 4 entries or 40. The chosen value comes back
 * via `onChange`; external state changes flow in through `subscribe` +
 * `getValue` so the readout stays in sync. */
export function makeStepper<T>(opts: StepperOptions<T>): Stepper {
  const { choices, getValue, onChange, subscribe, theme } = opts
  const totalW = opts.width ?? 200
  const h = opts.height ?? 28
  const wrap = opts.wrap ?? true
  const btnW = h

  const view = new Container()

  const findIndex = (): number =>
    Math.max(
      0,
      choices.findIndex((c) => c.value === getValue()),
    )

  const step = (delta: number): void => {
    const len = choices.length
    if (len === 0) return
    const cur = findIndex()
    let next = cur + delta
    if (wrap) {
      next = ((next % len) + len) % len
    } else {
      next = Math.max(0, Math.min(len - 1, next))
    }
    const choice = choices[next]
    if (choice) onChange(choice.value)
  }

  const prev = makeArrowButton('left', btnW, h, theme, () => step(-1))
  const next = makeArrowButton('right', btnW, h, theme, () => step(1))
  prev.position.set(0, 0)
  next.position.set(totalW - btnW, 0)
  view.addChild(prev, next)

  // Readout. A muted background between the arrows so the label visually
  // anchors the control even when the text is short ("C").
  const readoutW = totalW - btnW * 2 - 8
  const readoutBg = new Graphics()
    .roundRect(btnW + 4, 0, readoutW, h, 3)
    .fill({ color: 0x000000, alpha: 0.3 })
    .stroke({ color: 0xffffff, alpha: 0.2, width: 1 })
  view.addChild(readoutBg)

  const readout = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 17, fontFamily: theme.fontSans },
  })
  readout.anchor.set(0.5)
  readout.position.set(btnW + 4 + readoutW / 2, h / 2)
  view.addChild(readout)

  const refresh = (): void => {
    const c = choices[findIndex()]
    readout.text = c ? c.label : ''
  }
  refresh()
  const unsubscribe = subscribe(refresh)

  return {
    view,
    dispose: () => unsubscribe(),
  }
}

function makeArrowButton(
  direction: 'left' | 'right',
  w: number,
  h: number,
  theme: UiTheme,
  onTap: () => void,
): Container {
  const c = new Container()
  c.eventMode = 'static'
  c.cursor = 'pointer'
  c.hitArea = new Rectangle(0, 0, w, h)

  const bg = new Graphics()
  const arrow = new Graphics()
  c.addChild(bg, arrow)

  const draw = (pressed: boolean): void => {
    bg.clear()
    bg.roundRect(0, 0, w, h, 3)
      .fill({ color: 0x000000, alpha: pressed ? 0.5 : 0.3 })
      .stroke({ color: 0xffffff, alpha: pressed ? 0.4 : 0.25, width: 1 })
    arrow.clear()
    const cx = w / 2
    const cy = h / 2
    const s = Math.min(w, h) * 0.28
    if (direction === 'left') {
      arrow.poly([cx - s * 0.6, cy, cx + s * 0.4, cy - s, cx + s * 0.4, cy + s])
    } else {
      arrow.poly([cx + s * 0.6, cy, cx - s * 0.4, cy - s, cx - s * 0.4, cy + s])
    }
    arrow.fill({ color: 0xffffff, alpha: pressed ? 1 : 0.75 })
  }
  draw(false)

  c.on('pointerdown', (e) => {
    e.stopPropagation()
    draw(true)
  })
  c.on('pointerup', () => draw(false))
  c.on('pointerupoutside', () => draw(false))
  c.on('pointercancel', () => draw(false))
  c.on('pointertap', () => onTap())

  // Suppress the visual-feedback theme lint about the `_ = theme` parameter
  // — we accept theme even though the arrow doesn't use fontSans, so the
  // signature matches other UI helpers.
  void theme
  return c
}
