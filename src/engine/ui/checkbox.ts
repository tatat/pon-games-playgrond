import { CheckBox } from '@pixi/ui'
import { Container, Graphics } from 'pixi.js'
import type { Disposable } from '../util/disposable'

export interface CheckboxBindingOptions {
  /** Source-of-truth getter, re-read whenever `subscribe` fires. */
  getValue(): boolean
  /** Notify the source on user toggle. */
  onChange(value: boolean): void
  /** Reactive source — `(listener) => unsubscribe`. */
  subscribe(listener: () => void): () => void
  /** Box edge length. Defaults to 22. */
  size?: number
}

export interface BoundCheckbox extends Disposable {
  view: Container
}

const PANEL_BG = 0x1a1a1c
const INACTIVE = 0x3a3a3e
const WHITE = 0xffffff
const DEFAULT_SIZE = 22

/** Reactive checkbox bound to a getter / setter / subscribe trio. The
 * visual style matches the settings modal's other rows (white-on-dark
 * fill + check mark). */
export function makeCheckbox(opts: CheckboxBindingOptions): BoundCheckbox {
  const size = opts.size ?? DEFAULT_SIZE
  const cb = new CheckBox({
    style: { checked: makeChecked(size), unchecked: makeUnchecked(size) },
    checked: opts.getValue(),
  })
  cb.onCheck.connect((state) => opts.onChange(state))
  const unsubscribe = opts.subscribe(() => {
    const v = opts.getValue()
    if (cb.checked !== v) cb.forceCheck(v)
  })
  return {
    view: cb,
    dispose: () => unsubscribe(),
  }
}

function makeChecked(size: number): Container {
  // Tick path authored against the original 22px box; scale it so the
  // check mark tracks a custom box size.
  const s = size / 22
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, size, size, 3 * s).fill(WHITE))
  c.addChild(
    new Graphics()
      .moveTo(5 * s, 12 * s)
      .lineTo(9 * s, 16 * s)
      .lineTo(17 * s, 7 * s)
      .stroke({ color: PANEL_BG, width: 2.5 * s }),
  )
  return c
}

function makeUnchecked(size: number): Container {
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, size, size, 3 * (size / 22)).fill(INACTIVE))
  return c
}
