import { type Application, Container, Graphics } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from './constants'
import { attachFpsCounter } from './dev-overlay'
import { attachSettingsUi } from './settings-ui'

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

export interface GameLayout {
  /** Scenes mount into this container; uses logical 0..DESIGN_W × 0..DESIGN_H coords. */
  gameContainer: Container
  /** Viewport-coordinate container for on-screen UI in the letterbox area. */
  uiLayer: Container
  current(): LayoutMetrics
  onChange(cb: (m: LayoutMetrics) => void): () => void
}

/** Letterboxes the logical 1280×720 game viewport inside the full-viewport
 * canvas. The leftover area is available to `uiLayer` for on-screen controls. */
export function attachLayout(app: Application, signal: AbortSignal): GameLayout {
  const gameContainer = new Container()
  // Honour zIndex so dev overlays (and any HUD that wants it) can sit above
  // scene content regardless of addChild order.
  gameContainer.sortableChildren = true
  // Clip anything drawn outside the logical 1280×720 viewport so off-screen
  // obstacles / parallax stars don't leak into the letterbox margins.
  const mask = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(0xffffff)
  gameContainer.addChild(mask)
  gameContainer.mask = mask
  const uiLayer = new Container()
  app.stage.addChild(gameContainer)
  app.stage.addChild(uiLayer)

  if (import.meta.env.DEV) attachFpsCounter(gameContainer, app.ticker, signal)
  attachSettingsUi(gameContainer, signal)

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
  signal.addEventListener(
    'abort',
    () => {
      window.removeEventListener('resize', recompute)
      subscribers.clear()
    },
    { once: true },
  )

  return {
    gameContainer,
    uiLayer,
    current: () => metrics,
    onChange: (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }
}
