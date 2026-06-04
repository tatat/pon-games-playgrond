import type { Application } from 'pixi.js'
import { unloadGameAssets } from '../../engine/assets'
import { attachAutoPause } from '../../engine/auto-pause'
import { attachLayout } from '../../engine/layout'
import { Rng } from '../../engine/rng'
import { SceneManager } from '../../engine/scene-manager'
import type { GameContext, GameHandle, GameModule } from '../types'
import { GAME_ID } from './constants'
import { OpeningScene } from './opening-scene'
import { MainScene, type MainSceneOptions } from './scene'
import type { StageDef } from './stage'

/** An explicit `?seed=` from the SPA URL, or undefined. The portal folds `?seed=`
 * into `ctx.config.seed` but defaults it to `Date.now()` when absent, so the only
 * way to tell a *pinned* seed from a fresh-session seed is to read the URL here.
 * Used to pin the random entry's seed over the persisted last-used one. */
function urlSeed(): number | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = new URLSearchParams(window.location.search).get('seed')
  if (raw === null) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

export const himeRunGame: GameModule = {
  async start(app: Application, ctx: GameContext, signal: AbortSignal): Promise<GameHandle> {
    const rng = new Rng(ctx.config.seed)
    const layout = attachLayout(app)
    const autoPause = attachAutoPause(app)
    const sm = new SceneManager(layout, app.ticker, GAME_ID, rng)

    const teardown = async (): Promise<void> => {
      await sm.dispose()
      autoPause.dispose()
      layout.dispose()
      await unloadGameAssets(GAME_ID)
    }

    try {
      // Best score is per stage and persisted in the hime-run store, so nothing
      // needs to be threaded across runs here.
      const pinnedSeed = urlSeed()
      const showOpening = (): Promise<void> =>
        sm.changeTo(new OpeningScene({ onSelect: startStage, pinnedSeed }))

      // Fire-and-forget swap back to select (from a button/key or load-failure
      // recovery). Terminal-catches so a rejected swap (e.g. manifest re-fetch
      // fails offline) logs instead of surfacing as an unhandled rejection.
      const returnToOpening = (): void => {
        void showOpening().catch((err) => {
          if (signal.aborted) return
          console.error('[hime-run] failed to return to stage select', err)
        })
      }

      // Play a chosen stage; a retry rebuilds the same stage so its layout (and
      // any seed) replays identically.
      const startStage = (stage: StageDef): void => {
        const sceneOptions: MainSceneOptions = {
          stage,
          onScoreChange: (s) => ctx.onScoreChange(s),
          onGameOver: (score) => ctx.onGameOver({ score }),
          onRequestRestart: () => startStage(stage),
          onBackToSelect: returnToOpening,
        }
        void sm.changeTo(new MainScene(sceneOptions)).catch((err) => {
          // A failed stage load (e.g. a bad JSON) shouldn't strand the player on
          // a non-ready scene — fall back to select. Ignore aborts from teardown.
          if (signal.aborted) return
          console.error('[hime-run] stage failed to load; returning to select', err)
          returnToOpening()
        })
      }

      await showOpening()
      signal.throwIfAborted()
    } catch (e) {
      await teardown()
      throw e
    }

    return { destroy: teardown }
  },
}
