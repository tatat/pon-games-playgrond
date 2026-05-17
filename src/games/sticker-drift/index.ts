import type { Application } from 'pixi.js'
import { unloadGameAssets } from '../../engine/assets'
import { attachAutoPause } from '../../engine/auto-pause'
import { attachLayout } from '../../engine/layout'
import { Rng } from '../../engine/rng'
import { SceneManager } from '../../engine/scene-manager'
import type { GameContext, GameHandle, GameModule } from '../types'
import { GAME_ID } from './constants'
import { MainScene, type MainSceneOptions } from './scene'

/** Sticker Drift is an endless avoidance game — no save state, no per-game
 * Zustand store. The displayed high score lives in `useUserStore`. */
export const stickerDriftGame: GameModule = {
  uiTheme: {
    fontSans: 'Courier, "Courier New", monospace',
    fontMono: 'Courier, "Courier New", monospace',
  },

  async start(app: Application, ctx: GameContext, signal: AbortSignal): Promise<GameHandle> {
    const rng = new Rng(ctx.config.seed)
    const layout = attachLayout(app)
    const autoPause = attachAutoPause(app)
    const sm = new SceneManager(layout, app.ticker, GAME_ID, rng)

    const teardown = async (): Promise<void> => {
      // Reverse-construction order. SceneManager first so the active scene's
      // onExit / runTeardown completes before layout (which owns gameContainer).
      await sm.dispose()
      autoPause.dispose()
      layout.dispose()
      await unloadGameAssets(GAME_ID)
    }

    try {
      const sceneOptions: MainSceneOptions = {
        onScoreChange: (s) => ctx.onScoreChange(s),
        onGameOver: (score) => ctx.onGameOver({ score }),
        onRequestRestart: () => {
          void sm.changeTo(
            new MainScene({
              ...sceneOptions,
              startImmediately: true,
            }),
          )
        },
      }

      await sm.changeTo(new MainScene(sceneOptions))
      signal.throwIfAborted()
    } catch (e) {
      // Mid-startup abort or any other failure before we return the handle
      // would otherwise leak layout / autoPause / sm. Run the same teardown
      // chain the handle would run, then rethrow so the caller sees the
      // original error.
      await teardown()
      throw e
    }

    return { destroy: teardown }
  },
}
