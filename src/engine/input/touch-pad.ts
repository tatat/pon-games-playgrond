import { FancyButton } from '@pixi/ui'
import { Container, Graphics, Text } from 'pixi.js'
import { useSettingsStore } from '../../store/settings'
import { DESIGN_H, DESIGN_W } from '../constants'
import type { GameLayout } from '../layout'
import type { Action, InputManager } from './index'

/** True when the primary pointing device is coarse (touch). */
export function shouldShowTouchControls(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** Combines `useSettingsStore.touchControls` with `shouldShowTouchControls`. */
export function padEnabled(): boolean {
  const mode = useSettingsStore.getState().touchControls
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

function wire(btn: FancyButton, input: InputManager, action: Action, signal: AbortSignal): void {
  const onDown = () => input.press(action)
  const onUp = () => input.release(action)
  btn.on('pointerdown', onDown)
  btn.on('pointerup', onUp)
  btn.on('pointerupoutside', onUp)
  btn.on('pointercancel', onUp)
  signal.addEventListener(
    'abort',
    () => {
      btn.off('pointerdown', onDown)
      btn.off('pointerup', onUp)
      btn.off('pointerupoutside', onUp)
      btn.off('pointercancel', onUp)
      input.release(action)
    },
    { once: true },
  )
}

/** Returns a `Container` of pad buttons positioned for the current layout area.
 * Caller is responsible for `addChild`ing it into `layout.uiLayer` (sides /
 * bottom) or `layout.gameContainer` (overlay). */
export function createDirectionalPad(
  input: InputManager,
  layout: GameLayout,
  options: DirectionalPadOptions,
  signal: AbortSignal,
): Container {
  const size = options.buttonSize ?? 96
  const container = new Container()

  const left = makeButton('◀', size)
  const right = makeButton('▶', size)
  wire(left, input, options.leftAction, signal)
  wire(right, input, options.rightAction, signal)
  container.addChild(left, right)

  let up: FancyButton | undefined
  let down: FancyButton | undefined
  if (options.upAction) {
    up = makeButton('▲', size)
    wire(up, input, options.upAction, signal)
    container.addChild(up)
  }
  if (options.downAction) {
    down = makeButton('▼', size)
    wire(down, input, options.downAction, signal)
    container.addChild(down)
  }

  const reflow = () => {
    const m = layout.current()
    const gap = 8
    if (m.area === 'sides') {
      // viewport coords; container is mounted to layout.uiLayer
      const cx = Math.max(m.marginLeft / 2 - size / 2, 8)
      const cy = m.viewportH - size * 2 - gap - 24
      left.position.set(cx - size - gap, cy + size + gap)
      right.position.set(cx + size + gap, cy + size + gap)
      up?.position.set(cx, cy)
      down?.position.set(cx, cy + (size + gap) * 2)
    } else if (m.area === 'bottom') {
      // viewport coords; container is mounted to layout.uiLayer
      const baseY = m.marginTop + m.gameH + 12
      const baseX = 24
      left.position.set(baseX, baseY)
      right.position.set(baseX + size + gap, baseY)
      up?.position.set(baseX + (size + gap) * 2, baseY)
      down?.position.set(baseX + (size + gap) * 3, baseY)
    } else {
      // 'overlay': container is mounted to layout.gameContainer (logical coords)
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
  signal.addEventListener('abort', unsub, { once: true })

  return container
}

export function createActionButton(
  input: InputManager,
  layout: GameLayout,
  action: Action,
  label: string,
  signal: AbortSignal,
  size = 96,
): Container {
  const btn = makeButton(label, size)
  wire(btn, input, action, signal)

  const reflow = () => {
    const m = layout.current()
    if (m.area === 'sides') {
      // viewport coords; mount to layout.uiLayer
      btn.position.set(m.viewportW - m.marginLeft / 2 - size / 2, m.viewportH - size - 24)
    } else if (m.area === 'bottom') {
      // viewport coords; mount to layout.uiLayer
      btn.position.set(m.viewportW - size - 24, m.viewportH - size - 24)
    } else {
      // 'overlay': logical coords; mount to layout.gameContainer
      btn.position.set(DESIGN_W - size - 24, DESIGN_H - size - 24)
    }
  }
  reflow()
  const unsub = layout.onChange(reflow)
  signal.addEventListener('abort', unsub, { once: true })

  return btn
}
