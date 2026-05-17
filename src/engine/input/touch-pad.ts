import { FancyButton } from '@pixi/ui'
import { Container, Graphics, Text } from 'pixi.js'
import { useSettingsStore } from '../../store/settings'
import { DESIGN_H, DESIGN_W } from '../constants'
import type { GameLayout } from '../layout'
import type { Disposable } from '../util/disposable'
import type { Action, InputManager } from './index'

/** True when the primary pointing device is coarse (touch). */
export function shouldShowTouchControls(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** Combines `useSettingsStore.virtualPad` with `shouldShowTouchControls`. */
export function padEnabled(): boolean {
  const mode = useSettingsStore.getState().virtualPad
  if (mode === 'on') return true
  if (mode === 'off') return false
  return shouldShowTouchControls()
}

export interface DirectionalPadOptions {
  leftAction: Action
  rightAction: Action
  upAction?: Action
  downAction?: Action
  buttonSize?: number
}

function makeButton(label: string, size: number): FancyButton {
  const bg = new Graphics().roundRect(0, 0, size, size, 12).fill({ color: 0x000000, alpha: 0.4 })
  const text = new Text({
    text: label,
    style: { fill: 0xffffff, fontSize: Math.round(size * 0.5), fontFamily: 'system-ui' },
  })
  return new FancyButton({ defaultView: bg, text })
}

function wire(
  btn: FancyButton,
  input: InputManager,
  action: Action,
  disposables: Array<() => void>,
): void {
  const onDown = () => input.press(action)
  const onUp = () => input.release(action)
  btn.on('pointerdown', onDown)
  btn.on('pointerup', onUp)
  btn.on('pointerupoutside', onUp)
  btn.on('pointercancel', onUp)
  disposables.push(() => {
    btn.off('pointerdown', onDown)
    btn.off('pointerup', onUp)
    btn.off('pointerupoutside', onUp)
    btn.off('pointercancel', onUp)
    input.release(action)
  })
}

export interface PadHandle extends Disposable {
  view: Container
}

/** Returns a `Container` of pad buttons positioned for the current layout area
 * and a `dispose` to tear it down. Caller is responsible for `addChild`ing
 * `view` into `layout.uiLayer` (sides / bottom) or `layout.gameContainer`
 * (overlay). */
export function createDirectionalPad(
  input: InputManager,
  layout: GameLayout,
  options: DirectionalPadOptions,
): PadHandle {
  const size = options.buttonSize ?? 96
  const container = new Container()
  const disposables: Array<() => void> = []

  const left = makeButton('◀', size)
  const right = makeButton('▶', size)
  wire(left, input, options.leftAction, disposables)
  wire(right, input, options.rightAction, disposables)
  container.addChild(left, right)

  let up: FancyButton | undefined
  let down: FancyButton | undefined
  if (options.upAction) {
    up = makeButton('▲', size)
    wire(up, input, options.upAction, disposables)
    container.addChild(up)
  }
  if (options.downAction) {
    down = makeButton('▼', size)
    wire(down, input, options.downAction, disposables)
    container.addChild(down)
  }

  const reflow = () => {
    const m = layout.current()
    const gap = 8
    if (m.area === 'sides') {
      const cx = Math.max(m.marginLeft / 2 - size / 2, 8)
      const cy = m.viewportH - size * 2 - gap - 24
      left.position.set(cx - size - gap, cy + size + gap)
      right.position.set(cx + size + gap, cy + size + gap)
      up?.position.set(cx, cy)
      down?.position.set(cx, cy + (size + gap) * 2)
    } else if (m.area === 'bottom') {
      const baseY = m.marginTop + m.gameH + 12
      const baseX = 24
      left.position.set(baseX, baseY)
      right.position.set(baseX + size + gap, baseY)
      up?.position.set(baseX + (size + gap) * 2, baseY)
      down?.position.set(baseX + (size + gap) * 3, baseY)
    } else {
      const baseY = DESIGN_H - size - 24
      const baseX = 24
      left.position.set(baseX, baseY)
      right.position.set(baseX + size + gap, baseY)
      up?.position.set(baseX + (size + gap) * 2, baseY)
      down?.position.set(baseX + (size + gap) * 3, baseY)
    }
  }
  reflow()
  const unsub = layout.onChange(reflow)

  return {
    view: container,
    dispose: () => {
      unsub()
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
    },
  }
}

export interface ActionButtonHandle extends Disposable {
  view: Container
}

export function createActionButton(
  input: InputManager,
  layout: GameLayout,
  action: Action,
  label: string,
  size = 96,
): ActionButtonHandle {
  const btn = makeButton(label, size)
  const disposables: Array<() => void> = []
  wire(btn, input, action, disposables)

  const reflow = () => {
    const m = layout.current()
    if (m.area === 'sides') {
      btn.position.set(m.viewportW - m.marginLeft / 2 - size / 2, m.viewportH - size - 24)
    } else if (m.area === 'bottom') {
      btn.position.set(m.viewportW - size - 24, m.viewportH - size - 24)
    } else {
      btn.position.set(DESIGN_W - size - 24, DESIGN_H - size - 24)
    }
  }
  reflow()
  const unsub = layout.onChange(reflow)

  return {
    view: btn,
    dispose: () => {
      unsub()
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
    },
  }
}
