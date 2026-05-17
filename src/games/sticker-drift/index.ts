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
  async start(app: Application, ctx: GameContext, signal: AbortSignal): Promise<GameHandle> {
    const rng = new Rng(ctx.config.seed)
    const layout = attachLayout(app, signal)
    attachAutoPause(app, signal)

    const sm = new SceneManager(layout, app.ticker, signal, GAME_ID, rng)

    const sceneOptions: MainSceneOptions = {
      onScoreChange: (s) => ctx.onScoreChange(s),
      onGameOver: (score) => ctx.onGameOver({ score }),
      onRequestRestart: (currentlyFloating) => {
        void sm.changeTo(
          new MainScene({
            ...sceneOptions,
            startImmediately: true,
            initialFloating: currentlyFloating,
          }),
        )
      },
    }

    await sm.changeTo(new MainScene(sceneOptions))
    signal.throwIfAborted()

    return {
      destroy: () => {
        sm.destroy()
        void unloadGameAssets(GAME_ID)
      },
    }
  },
}
