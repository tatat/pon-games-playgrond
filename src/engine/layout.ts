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
  /** CSS `env(safe-area-inset-*)` in viewport pixels — the display cutout /
   * rounded-corner insets (iPhone notch / Dynamic Island, home indicator).
   * Zero on devices without cutouts. Consumers that anchor UI to a viewport
   * edge (e.g. the virtual pad) push in by these so controls clear the
   * notch. Requires `viewport-fit=cover` (set in the document head). */
  safeArea: { left: number; right: number; top: number; bottom: number }
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
/** Hidden fixed-position element whose padding resolves to the four
 * `env(safe-area-inset-*)` values, so they can be read back as pixels via
 * `getComputedStyle`. CSS is the only place env() is available; this probe
 * bridges it to JS without baking the insets into a stylesheet. */
function makeSafeAreaProbe(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);'
  return el
}

function readSafeArea(probe: HTMLElement): LayoutMetrics['safeArea'] {
  const cs = getComputedStyle(probe)
  return {
    top: Number.parseFloat(cs.paddingTop) || 0,
    right: Number.parseFloat(cs.paddingRight) || 0,
    bottom: Number.parseFloat(cs.paddingBottom) || 0,
    left: Number.parseFloat(cs.paddingLeft) || 0,
  }
}

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

  const safeAreaProbe = makeSafeAreaProbe()
  document.body.appendChild(safeAreaProbe)

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

    const safeArea = readSafeArea(safeAreaProbe)

    metrics = {
      viewportW: w,
      viewportH: h,
      scale,
      gameW,
      gameH,
      marginLeft,
      marginTop,
      area,
      safeArea,
    }
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
      safeAreaProbe.remove()
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
