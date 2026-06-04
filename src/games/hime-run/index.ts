import type { Application } from 'pixi.js'
import { unloadGameAssets } from '../../engine/assets'
import { attachAutoPause } from '../../engine/auto-pause'
import { attachLayout } from '../../engine/layout'
import { Rng } from '../../engine/rng'
import { SceneManager } from '../../engine/scene-manager'
import type { GameContext, GameHandle, GameModule } from '../types'
import { GAME_ID } from './constants'
import { OpeningScene } from './opening-scene'
import { type HimeSession, MainScene, type MainSceneOptions } from './scene'
import type { StageDef } from './stage'

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
      // Shared across restarts so the best score persists between runs.
      const session: HimeSession = { best: 0 }
      // Play a chosen stage; a retry rebuilds the same stage so it persists.
      const startStage = (stage: StageDef): void => {
        const sceneOptions: MainSceneOptions = {
          stage,
          session,
          onScoreChange: (s) => ctx.onScoreChange(s),
          onGameOver: (score) => ctx.onGameOver({ score }),
          onRequestRestart: () => startStage(stage),
        }
        void sm.changeTo(new MainScene(sceneOptions))
      }
      await sm.changeTo(new OpeningScene({ onSelect: startStage }))
      signal.throwIfAborted()
    } catch (e) {
      await teardown()
      throw e
    }

    return { destroy: teardown }
  },
}
