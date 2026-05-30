import { FancyButton } from '@pixi/ui'
import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { makeCheckbox } from '../../../engine/ui/checkbox'
import { makeSegmentedControl } from '../../../engine/ui/segmented-control'
import { makeStepper } from '../../../engine/ui/stepper'
import type { UiTheme } from '../../../engine/ui-theme'
import { COLORS, RADIUS } from '../constants'
import type { DemoContext, PatternDemo } from '../demo'
import { reactive, tag, text } from '../demo-util'

/** Places a single control roughly centered in the stage, with a tag above and
 * a live readout below — the common scaffold for the UI-component demos. */
function frame(
  ctx: DemoContext,
  tagLabel: string,
): { root: Container; cx: number; cy: number; readout: Text } {
  const root = new Container()
  ctx.stage.addChild(root)
  const cx = ctx.width / 2
  const cy = ctx.height / 2

  const t = tag(tagLabel, ctx.theme.fontSans)
  t.anchor.set(0.5)
  t.position.set(cx, cy - 70)
  root.addChild(t)

  const readout = text('', { fill: COLORS.accent, fontSize: 18, fontFamily: ctx.theme.fontMono })
  readout.anchor.set(0.5)
  readout.position.set(cx, cy + 70)
  root.addChild(readout)
  return { root, cx, cy, readout }
}

function pillButton(label: string, theme: UiTheme, w = 160, h = 44): FancyButton {
  const make = (fill: number, textFill: number): Container => {
    const c = new Container()
    c.addChild(new Graphics().roundRect(0, 0, w, h, RADIUS.control).fill(fill))
    const t = new Text({
      text: label,
      style: { fill: textFill, fontSize: 18, fontFamily: theme.fontSans },
    })
    t.anchor.set(0.5)
    t.position.set(w / 2, h / 2)
    c.addChild(t)
    return c
  }
  return new FancyButton({
    defaultView: make(COLORS.rowActive, COLORS.text),
    hoverView: make(0x4566e4, COLORS.text),
    pressedView: make(0x2545b4, COLORS.text),
  })
}

const segmented: PatternDemo = {
  id: 'segmented-control',
  name: 'Segmented control',
  caption: 'Single-select pill row (engine/ui/segmented-control).',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy, readout } = frame(ctx, 'SEGMENTED CONTROL')
    const value = reactive('mid')
    const ctl = makeSegmentedControl<string>({
      choices: [
        { label: 'low', value: 'low' },
        { label: 'mid', value: 'mid' },
        { label: 'high', value: 'high' },
      ],
      getValue: value.get,
      onChange: (v) => value.set(v),
      subscribe: value.subscribe,
      theme: ctx.theme,
      buttonW: 72,
      buttonH: 32,
    })
    ctl.view.position.set(cx - (72 + 8) * 1.5 + 4, cy - 16)
    root.addChild(ctl.view)
    const sync = (): void => {
      readout.text = `value = '${value.get()}'`
    }
    const unsub = value.subscribe(sync)
    sync()
    return {
      dispose: () => {
        unsub()
        ctl.dispose()
      },
    }
  },
}

const checkbox: PatternDemo = {
  id: 'checkbox',
  name: 'Checkbox',
  caption: 'Reactive boolean toggle (engine/ui/checkbox).',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy, readout } = frame(ctx, 'CHECKBOX')
    const value = reactive(true)
    const cb = makeCheckbox({
      getValue: value.get,
      onChange: (v) => value.set(v),
      subscribe: value.subscribe,
      size: 36,
    })
    cb.view.position.set(cx - 18, cy - 18)
    root.addChild(cb.view)
    const sync = (): void => {
      readout.text = `checked = ${value.get()}`
    }
    const unsub = value.subscribe(sync)
    sync()
    return {
      dispose: () => {
        unsub()
        cb.dispose()
      },
    }
  },
}

const stepper: PatternDemo = {
  id: 'stepper',
  name: 'Stepper',
  caption: 'Prev/next pick from a list (engine/ui/stepper).',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy, readout } = frame(ctx, 'STEPPER')
    const value = reactive('Normal')
    const st = makeStepper<string>({
      choices: [
        { label: 'Easy', value: 'Easy' },
        { label: 'Normal', value: 'Normal' },
        { label: 'Hard', value: 'Hard' },
        { label: 'Lunatic', value: 'Lunatic' },
      ],
      getValue: value.get,
      onChange: (v) => value.set(v),
      subscribe: value.subscribe,
      theme: ctx.theme,
      width: 240,
    })
    st.view.position.set(cx - 120, cy - 14)
    root.addChild(st.view)
    const sync = (): void => {
      readout.text = `value = '${value.get()}'`
    }
    const unsub = value.subscribe(sync)
    sync()
    return {
      dispose: () => {
        unsub()
        st.dispose()
      },
    }
  },
}

const slider: PatternDemo = {
  id: 'slider',
  name: 'Slider',
  caption: 'Draggable 0–100 value track (Graphics + pointer drag).',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy, readout } = frame(ctx, 'SLIDER')
    const trackW = 260
    const x0 = cx - trackW / 2
    const y = cy
    const value = reactive(40)

    const track = new Graphics().roundRect(x0, y - 4, trackW, 8, 4).fill(COLORS.border)
    const fill = new Graphics()
    const knob = new Graphics().circle(0, 0, 14).fill(COLORS.accent)
    root.addChild(track, fill, knob)

    const redraw = (): void => {
      const t = value.get() / 100
      const kx = x0 + trackW * t
      fill
        .clear()
        .roundRect(x0, y - 4, trackW * t, 8, 4)
        .fill(COLORS.rowActive)
      knob.position.set(kx, y)
      readout.text = `value = ${value.get()}`
    }

    // Drag handling on the demo root (covers the whole stage so the pointer
    // can leave the knob mid-drag without dropping it).
    root.eventMode = 'static'
    root.hitArea = new Rectangle(0, 0, ctx.width, ctx.height)
    let dragging = false
    const setFromX = (px: number): void => {
      const t = Math.max(0, Math.min(1, (px - x0) / trackW))
      value.set(Math.round(t * 100))
    }
    root.on('pointerdown', (e) => {
      const lp = e.getLocalPosition(root)
      if (lp.y > y - 30 && lp.y < y + 30) {
        dragging = true
        setFromX(lp.x)
      }
    })
    root.on('pointermove', (e) => {
      if (dragging) setFromX(e.getLocalPosition(root).x)
    })
    const stop = (): void => {
      dragging = false
    }
    root.on('pointerup', stop)
    root.on('pointerupoutside', stop)

    const unsub = value.subscribe(redraw)
    redraw()
    return {
      dispose: () => {
        unsub()
        root.removeAllListeners()
      },
    }
  },
}

const button: PatternDemo = {
  id: 'button',
  name: 'Button',
  caption: 'FancyButton with default/hover/pressed views (@pixi/ui).',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy, readout } = frame(ctx, 'BUTTON')
    let count = 0
    const btn = pillButton('PRESS ME', ctx.theme)
    btn.position.set(cx - 80, cy - 22)
    btn.onPress.connect(() => {
      count++
      readout.text = `pressed ×${count}`
    })
    root.addChild(btn)
    readout.text = 'pressed ×0'
    return {}
  },
}

const modalDialog: PatternDemo = {
  id: 'modal-dialog',
  name: 'Modal dialog',
  caption: 'Backdrop + centered panel + confirm/cancel; fades in/out.',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy, readout } = frame(ctx, 'MODAL DIALOG')
    readout.text = 'result = —'

    const open = pillButton('OPEN DIALOG', ctx.theme, 180)
    open.position.set(cx - 90, cy - 22)
    root.addChild(open)

    const modal = new Container()
    modal.alpha = 0
    modal.visible = false
    root.addChild(modal)
    const backdrop = new Graphics()
      .rect(0, 0, ctx.width, ctx.height)
      .fill({ color: 0x000000, alpha: 0.6 })
    modal.addChild(backdrop)
    const pw = 320
    const ph = 180
    const px = cx - pw / 2
    const py = cy - ph / 2
    modal.addChild(
      new Graphics()
        .roundRect(px, py, pw, ph, RADIUS.card)
        .fill(COLORS.panel)
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const title = text('Discard changes?', {
      fill: COLORS.text,
      fontSize: 20,
      fontFamily: ctx.theme.fontSans,
    })
    title.anchor.set(0.5)
    title.position.set(cx, py + 50)
    modal.addChild(title)

    let target = 0
    const confirm = pillButton('CONFIRM', ctx.theme, 120, 40)
    confirm.position.set(cx - 130, py + ph - 60)
    const cancel = pillButton('CANCEL', ctx.theme, 120, 40)
    cancel.position.set(cx + 10, py + ph - 60)
    modal.addChild(confirm, cancel)

    const close = (result: string): void => {
      target = 0
      readout.text = `result = ${result}`
    }
    open.onPress.connect(() => {
      modal.visible = true
      target = 1
      readout.text = 'result = —'
    })
    confirm.onPress.connect(() => close('confirm'))
    cancel.onPress.connect(() => close('cancel'))

    return {
      update: (dt) => {
        const k = Math.min(1, dt.dtMs / 120)
        modal.alpha += (target - modal.alpha) * k
        if (target === 0 && modal.alpha < 0.02) {
          modal.alpha = 0
          modal.visible = false
        }
      },
    }
  },
}

const toast: PatternDemo = {
  id: 'toast',
  name: 'Toast',
  caption: 'Transient banner that slides up, holds, then auto-dismisses.',
  category: 'ui',
  mount(ctx) {
    const { root, cx, cy } = frame(ctx, 'TOAST')
    const notify = pillButton('NOTIFY', ctx.theme, 160)
    notify.position.set(cx - 80, cy - 22)
    root.addChild(notify)

    const tw = 280
    const th = 50
    const restY = ctx.height + th
    const showY = ctx.height - th - 24
    const toastView = new Container()
    toastView.position.set(cx - tw / 2, restY)
    toastView.addChild(
      new Graphics()
        .roundRect(0, 0, tw, th, RADIUS.panel)
        .fill(COLORS.rowActive)
        .stroke({ color: COLORS.accent, width: 1 }),
    )
    const msg = text('Saved ✓', { fill: COLORS.text, fontSize: 18, fontFamily: ctx.theme.fontSans })
    msg.anchor.set(0.5)
    msg.position.set(tw / 2, th / 2)
    toastView.addChild(msg)
    root.addChild(toastView)

    let holdMs = 0 // > 0 while the toast should stay up
    notify.onPress.connect(() => {
      holdMs = 1600
    })

    return {
      update: (dt) => {
        if (holdMs > 0) holdMs -= dt.dtMs
        const targetY = holdMs > 0 ? showY : restY
        const k = Math.min(1, dt.dtMs / 140)
        toastView.y += (targetY - toastView.y) * k
      },
    }
  },
}

export const uiDemos: PatternDemo[] = [
  segmented,
  checkbox,
  stepper,
  slider,
  button,
  modalDialog,
  toast,
]
