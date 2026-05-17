import { type Container, Text, type Ticker } from 'pixi.js'
import { useRuntimeStore } from '../store/runtime'
import { useSettingsStore } from '../store/settings'
import type { Disposable } from './util/disposable'

/** Pins a small FPS counter to the top-left of the logical 1280×720 game
 * viewport. Dev-only; called from `attachLayout` under `import.meta.env.DEV`.
 * Renders inside `gameContainer` so it sits in the same coordinate system as
 * HUD elements and stays clipped to the game area by the layout's mask. */
export function attachFpsCounter(gameContainer: Container, ticker: Ticker): Disposable {
  const text = new Text({
    text: '-- fps',
    style: {
      fill: 0x00ff00,
      fontSize: 14,
      fontFamily: useRuntimeStore.getState().uiTheme.fontMono,
    },
  })
  // Top-left, vertical-center anchored. x=20 matches the in-game HUD's
  // score text so the two read as one column.
  text.anchor.set(0, 0.5)
  text.position.set(20, 16)
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
      acc -= 250
      text.text = `${ticker.FPS.toFixed(0)} fps`
    }
  }
  ticker.add(tick)

  return {
    dispose: () => {
      unsubscribe()
      ticker.remove(tick)
      gameContainer.removeChild(text)
      text.destroy()
    },
  }
}
