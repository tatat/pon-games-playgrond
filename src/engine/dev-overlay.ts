import { type Container, Text, type Ticker } from 'pixi.js'
import { useSettingsStore } from '../store/settings'
import { DESIGN_W } from './constants'

/** Pins a small FPS counter to the top-right of the logical 1280×720 game
 * viewport. Dev-only; called from `attachLayout` under `import.meta.env.DEV`.
 * Renders inside `gameContainer` so it sits in the same coordinate system as
 * HUD elements and stays clipped to the game area by the layout's mask. */
export function attachFpsCounter(
  gameContainer: Container,
  ticker: Ticker,
  signal: AbortSignal,
): void {
  const text = new Text({
    text: '-- fps',
    style: {
      fill: 0x00ff00,
      fontSize: 14,
      fontFamily: 'Courier, "Courier New", monospace',
    },
  })
  text.anchor.set(1, 0)
  text.position.set(DESIGN_W - 8, 8)
  text.zIndex = 10000
  text.visible = useSettingsStore.getState().showFps
  gameContainer.addChild(text)

  const unsubscribe = useSettingsStore.subscribe((s) => {
    text.visible = s.showFps
  })

  let acc = 0
  const tick = (): void => {
    if (!text.visible) return
    acc += ticker.deltaMS
    if (acc >= 250) {
      // Subtract the interval (don't reset to 0) so uneven frames don't drag
      // the update cadence below the intended 4 Hz.
      acc -= 250
      text.text = `${ticker.FPS.toFixed(0)} fps`
    }
  }
  ticker.add(tick)

  signal.addEventListener(
    'abort',
    () => {
      unsubscribe()
      ticker.remove(tick)
      gameContainer.removeChild(text)
      text.destroy()
    },
    { once: true },
  )
}
