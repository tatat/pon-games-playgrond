import RAPIER from '@dimforge/rapier2d-compat'
import { Application } from 'pixi.js'
// Side-effect import: registers Pixi's renderable render pipes (see the file)
// so production bundling can't tree-shake the `graphics` pipe out.
import '../engine/pixi-pipes'
import { setAssetBaseUrl } from '../engine/assets'
import { initAudio } from '../engine/audio/index'
import { defaultUiTheme } from '../engine/ui-theme'
import { useRuntimeStore } from '../store/runtime'
import { useSettingsStore } from '../store/settings'
import type { GameModule, GameResult } from './types'

/** Bootstrap steps that the SPA's `main.tsx` does at startup but the
 * embed bundle has to take care of itself. Idempotent — repeated calls
 * resolve immediately after the first **successful** one. A rejected
 * attempt clears the cache so the next mount can retry; otherwise a
 * transient Rapier-WASM init failure would brick every subsequent
 * remount in the same page. */
let bootstrapPromise: Promise<void> | undefined
function bootstrapOnce(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await RAPIER.init()
      initAudio()
    })().catch((err) => {
      bootstrapPromise = undefined
      throw err
    })
  }
  return bootstrapPromise
}

export interface EmbedMountOptions {
  /** Override the per-run RNG seed. Falls back to `Date.now()`. */
  seed?: number
  /** Live score callback. */
  onScoreChange?: (score: number) => void
  /** End-of-run callback. */
  onGameOver?: (result: GameResult) => void
  /** Override the asset base. Defaults to `new URL('../../', import.meta.url)`
   * relative to the lib bundle — the playground's Pages root. */
  assetBaseUrl?: string
}

export interface EmbedHandle {
  destroy(): Promise<void>
}

/** Boilerplate shared between every game's `embed.ts`: mount the Pixi
 * Application into a host element, point the asset resolver at the lib
 * bundle's origin, run the game's `start()`, and return a destroy
 * handle. React-free — ponpon embeds the bundle into its own React tree. */
export async function mountGame(
  gameModule: GameModule,
  container: HTMLElement,
  options: EmbedMountOptions = {},
  assetBaseUrl: string,
): Promise<EmbedHandle> {
  // Initialise Rapier WASM and the engine audio context before anything
  // touches them. SPA path does this in `main.tsx`; the embed bundle
  // has no such global entry, so do it here on first mount.
  await bootstrapOnce()

  // Rewire the engine's asset resolver before anything in the game tries
  // to load. Without this, asset paths like `games/<id>/stickers/...`
  // would resolve against the host page's origin instead of the
  // playground's. embed.ts files compute this from `import.meta.url`.
  setAssetBaseUrl(options.assetBaseUrl ?? assetBaseUrl)

  // Publish the game's UI theme so engine-level UI (settings modal, FPS
  // counter, pause menu) picks up the right fonts when scenes mount it.
  useRuntimeStore.getState().setUiTheme(gameModule.uiTheme ?? defaultUiTheme)

  const app = new Application()
  await app.init({
    resizeTo: container,
    background: '#000',
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })
  const noDefault = (e: Event): void => e.preventDefault()
  app.canvas.style.touchAction = 'none'
  app.canvas.addEventListener('contextmenu', noDefault)
  app.canvas.addEventListener('touchstart', noDefault, { passive: false })
  container.appendChild(app.canvas)

  // Mirror GameMount's wiring of the render-loop cap to the persisted
  // settings store, so ponpon's host doesn't need a separate hook.
  app.ticker.maxFPS = useSettingsStore.getState().maxFps
  const unsubMaxFps = useSettingsStore.subscribe((s) => {
    app.ticker.maxFPS = s.maxFps
  })

  const ctrl = new AbortController()
  const seed = options.seed ?? Date.now()

  let handle: { destroy(): Promise<void> | void } | null = null
  try {
    handle = await gameModule.start(
      app,
      {
        config: { seed },
        onScoreChange: (s) => options.onScoreChange?.(s),
        onGameOver: (r) => options.onGameOver?.(r),
      },
      ctrl.signal,
    )
  } catch (e) {
    unsubMaxFps()
    app.destroy(true, { children: true })
    throw e
  }

  let destroyed = false
  return {
    destroy: async () => {
      // Guard against double-destroy: a host that calls destroy() in a
      // React StrictMode cleanup and then again in its own catch path
      // would otherwise hit Pixi's "Application already destroyed" path
      // or unsubscribe a torn-down zustand listener.
      if (destroyed) return
      destroyed = true
      ctrl.abort()
      unsubMaxFps()
      useRuntimeStore.getState().setGamePaused(false)
      if (handle) await handle.destroy()
      app.destroy(true, { children: true })
    },
  }
}
