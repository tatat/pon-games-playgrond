import { type Application, Container, Graphics } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from './constants'
import { attachFpsCounter } from './dev-overlay'
import { attachPauseOverlay, type GameSettingsPanel } from './pause-overlay'
import type { Disposable } from './util/disposable'

export interface LayoutOptions {
  /** Optional game-specific settings panel rendered as a second tab in
   * the Settings modal. The engine takes ownership: `dispose()` on the
   * returned `GameLayout` will also dispose the panel. */
  gameSettings?: GameSettingsPanel
}

export interface LayoutMetrics {
  viewportW: number
  viewportH: number
  scale: number
  gameW: number
  gameH: number
  marginLeft: number
  marginTop: number
  /** Where extra room exists relative to the projected game viewport. */
  area: 'sides' | 'bottom' | 'overlay'
}

export interface GameLayout extends Disposable {
  /** Scenes mount into this container; uses logical 0..DESIGN_W × 0..DESIGN_H coords. */
  gameContainer: Container
  /** Viewport-coordinate container for on-screen UI in the letterbox area. */
  uiLayer: Container
  current(): LayoutMetrics
  onChange(cb: (m: LayoutMetrics) => void): () => void
}

/** Letterboxes the logical 1280×720 game viewport inside the full-viewport
 * canvas. Internally attaches the unified pause/settings overlay and the
 * dev FPS overlay — these share the same lifetime as the layout. Caller
 * invokes the returned `dispose` (typically chained from a
 * `GameHandle.destroy`). */
export function attachLayout(app: Application, opts: LayoutOptions = {}): GameLayout {
  const gameContainer = new Container()
  gameContainer.sortableChildren = true
  // Clip anything drawn outside the logical 1280×720 viewport so off-screen
  // obstacles / parallax stars don't leak into the letterbox margins.
  const mask = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(0xffffff)
  gameContainer.addChild(mask)
  gameContainer.mask = mask
  const uiLayer = new Container()
  app.stage.addChild(gameContainer)
  app.stage.addChild(uiLayer)

  const inner: Disposable[] = []
  if (import.meta.env.DEV) inner.push(attachFpsCounter(gameContainer, app.ticker))
  inner.push(attachPauseOverlay(gameContainer, opts.gameSettings))

  const subscribers = new Set<(m: LayoutMetrics) => void>()
  let metrics!: LayoutMetrics

  const recompute = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const scale = Math.min(w / DESIGN_W, h / DESIGN_H)
    const gameW = DESIGN_W * scale
    const gameH = DESIGN_H * scale
    const marginLeft = (w - gameW) / 2
    const marginTop = (h - gameH) / 2

    const area: LayoutMetrics['area'] =
      marginLeft >= 120 ? 'sides' : marginTop >= 120 ? 'bottom' : 'overlay'

    gameContainer.scale.set(scale)
    gameContainer.position.set(marginLeft, marginTop)

    metrics = { viewportW: w, viewportH: h, scale, gameW, gameH, marginLeft, marginTop, area }
    for (const cb of subscribers) cb(metrics)
  }

  recompute()
  window.addEventListener('resize', recompute)

  return {
    gameContainer,
    uiLayer,
    current: () => metrics,
    onChange: (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    dispose: () => {
      window.removeEventListener('resize', recompute)
      subscribers.clear()
      // Dispose inner attachments in reverse-attach order.
      for (let i = inner.length - 1; i >= 0; i--) inner[i]?.dispose()
      app.stage.removeChild(uiLayer)
      app.stage.removeChild(gameContainer)
      uiLayer.destroy({ children: true })
      gameContainer.destroy({ children: true })
    },
  }
}
