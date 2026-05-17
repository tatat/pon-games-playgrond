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
        const unsubMaxFps = useSettingsStore.subscribe((s) => {
          if (app) app.ticker.maxFPS = s.maxFps
        })
        ctrl.signal.addEventListener('abort', unsubMaxFps, { once: true })

        containerRef.current.appendChild(app.canvas)
        const gameModule = await games[gameId]()
        ctrl.signal.throwIfAborted()

        // Publish the game's UI theme before its `start()` runs so any
        // engine UI built during `start()` (settings modal, dev FPS
        // counter) picks up the right fonts.
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
        // Cleanup may have fired during `start()`; if so, the outer `handle`
        // is still null and tearing down only `app` would leak whatever this
        // resolved handle owns. Destroy it here instead of publishing.
        if (ctrl.signal.aborted) {
          started.destroy()
          return
        }
        handle = started
      } catch (e) {
        if ((e as Error).name !== 'AbortError') throw e
      }
    })()

    return () => {
      ctrl.abort()
      handle?.destroy()
      app?.destroy(true, { children: true })
    }
  }, [gameId, onScoreChange, onGameOver, seed])

  return <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} />
}
