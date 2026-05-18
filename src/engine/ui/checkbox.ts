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
}

export interface BoundCheckbox extends Disposable {
  view: Container
}

const PANEL_BG = 0x1a1a1c
const INACTIVE = 0x3a3a3e
const WHITE = 0xffffff
const SIZE = 22

/** Reactive checkbox bound to a getter / setter / subscribe trio. The
 * visual style matches the settings modal's other rows (white-on-dark
 * fill + check mark). */
export function makeCheckbox(opts: CheckboxBindingOptions): BoundCheckbox {
  const cb = new CheckBox({
    style: { checked: makeChecked(), unchecked: makeUnchecked() },
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

function makeChecked(): Container {
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, SIZE, SIZE, 3).fill(WHITE))
  c.addChild(
    new Graphics()
      .moveTo(5, 12)
      .lineTo(9, 16)
      .lineTo(17, 7)
      .stroke({ color: PANEL_BG, width: 2.5 }),
  )
  return c
}

function makeUnchecked(): Container {
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, SIZE, SIZE, 3).fill(INACTIVE))
  return c
}
