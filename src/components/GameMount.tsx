import { Application } from 'pixi.js'
import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    const ctrl = new AbortController()
    let app: Application | null = null
    let handle: GameHandle | null = null
    let unsubMaxFps: (() => void) | null = null

    void (async () => {
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

        containerRef.current.appendChild(app.canvas)
        const gameModule = await games[gameId]()
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
      }
    })()

    return () => {
      // React doesn't await the cleanup function, so we kick off async
      // teardown and let it run to completion in the background. The order
      // is important: handle.destroy() awaits scene onExit + registered
      // disposables, after which the Pixi Application can safely go away.
      ctrl.abort()
      const teardown = (async () => {
        unsubMaxFps?.()
        if (handle) await handle.destroy()
        app?.destroy(true, { children: true })
      })()
      void teardown
    }
  }, [gameId, onScoreChange, onGameOver, seed])

  return <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} />
}
