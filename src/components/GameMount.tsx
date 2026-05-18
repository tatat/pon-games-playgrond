import { Application } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { rapierReady } from '../engine/rapier'
import { defaultUiTheme } from '../engine/ui-theme'
import { type GameId, games } from '../games/registry'
import type { GameHandle, GameResult } from '../games/types'
import { useRuntimeStore } from '../store/runtime'
import { useSettingsStore } from '../store/settings'

export interface GameMountProps {
  gameId: GameId
  onScoreChange?: (score: number) => void
  onGameOver?: (result: GameResult) => void
  seed?: number
}

export function GameMount({ gameId, onScoreChange, onGameOver, seed }: GameMountProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Background-teardown promise from a previous mount cycle. React doesn't
  // await `useEffect` cleanups, so without serializing here a new mount can
  // race the old `app.destroy()` / `unloadGameAssets` and lose its assets.
  const previousTeardown = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    const ctrl = new AbortController()
    let app: Application | null = null
    let handle: GameHandle | null = null
    let unsubMaxFps: (() => void) | null = null

    void (async () => {
      // Wait for the previous mount's async teardown to settle before
      // touching shared resources (Pixi `Assets`, the runtime store, …).
      await previousTeardown.current

      try {
        if (!containerRef.current) return
        // Build into a local first; only publish `app` after init resolves so
        // a cleanup that fires mid-init (React StrictMode double-mount) never
        // sees a half-constructed Application.
        const appInstance = new Application()
        await appInstance.init({
          resizeTo: window,
          background: '#000',
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        })
        if (ctrl.signal.aborted) {
          appInstance.destroy(true, { children: true })
          return
        }
        app = appInstance

        // Bind the render-loop cap to settings — `maxFps = 0` is Pixi's
        // documented "no cap" value.
        app.ticker.maxFPS = useSettingsStore.getState().maxFps
        unsubMaxFps = useSettingsStore.subscribe((s) => {
          if (app) app.ticker.maxFPS = s.maxFps
        })

        // iOS Safari ignores `user-scalable=no` and doesn't reliably honour
        // body-level `touch-action: none` on a descendant canvas — two-finger
        // virtual-pad usage (stick + A) gets interpreted as a pinch and zooms
        // the page. Setting these on the canvas element itself blocks it.
        // `contextmenu` / `selectstart` prevention stops the iOS magnifier
        // loupe that appears on double-tap-hold even with user-select:none.
        const noDefault = (e: Event): void => e.preventDefault()
        app.canvas.style.touchAction = 'none'
        app.canvas.style.userSelect = 'none'
        app.canvas.style.setProperty('-webkit-user-select', 'none')
        app.canvas.style.setProperty('-webkit-touch-callout', 'none')
        app.canvas.addEventListener('contextmenu', noDefault)
        app.canvas.addEventListener('selectstart', noDefault)
        containerRef.current.appendChild(app.canvas)
        const gameModule = await games[gameId]()
        await rapierReady
        ctrl.signal.throwIfAborted()

        // Publish the game's UI theme before its `start()` runs so any
        // engine UI built during `start()` picks up the right fonts.
        useRuntimeStore.getState().setUiTheme(gameModule.uiTheme ?? defaultUiTheme)

        const search = new URLSearchParams(window.location.search)
        const resolvedSeed = seed ?? (Number.parseInt(search.get('seed') ?? '', 10) || Date.now())

        const started = await gameModule.start(
          app,
          {
            config: { seed: resolvedSeed },
            onScoreChange: (s) => onScoreChange?.(s),
            onGameOver: (r) => onGameOver?.(r),
          },
          ctrl.signal,
        )
        // Cleanup may have fired during `start()`; if so, dispose the just-
        // resolved handle here instead of publishing — the outer cleanup
        // path won't know about it.
        if (ctrl.signal.aborted) {
          await started.destroy()
          return
        }
        handle = started
      } catch (e) {
        if ((e as Error).name !== 'AbortError') throw e
        // Aborted mid-startup. Dispose what we've already published — we
        // can't rely solely on the cleanup function in case the abort
        // came from somewhere other than that cleanup in the future.
        // Null the locals so the cleanup pass is a no-op on these.
        unsubMaxFps?.()
        unsubMaxFps = null
        app?.destroy(true, { children: true })
        app = null
      }
    })()

    return () => {
      ctrl.abort()
      // Clear any pause state held by this mount so a fresh mount doesn't
      // open already paused. Runtime store is shared engine-wide.
      useRuntimeStore.getState().setGamePaused(false)
      // Kick off async teardown and record it for the next mount to await.
      // The order serializes scene cleanup before Pixi's Application destroy
      // so resources referenced by onExit / runTeardown are still alive.
      previousTeardown.current = (async () => {
        unsubMaxFps?.()
        if (handle) await handle.destroy()
        app?.destroy(true, { children: true })
      })()
    }
  }, [gameId, onScoreChange, onGameOver, seed])

  return <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} />
}
