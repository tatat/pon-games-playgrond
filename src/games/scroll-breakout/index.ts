import type { Application } from 'pixi.js'
import { unloadGameAssets } from '../../engine/assets'
import { attachAutoPause } from '../../engine/auto-pause'
import { attachLayout } from '../../engine/layout'
import { Rng } from '../../engine/rng'
import { SceneManager } from '../../engine/scene-manager'
import { useRuntimeStore } from '../../store/runtime'
import type { GameContext, GameHandle, GameModule } from '../types'
import { GAME_ID } from './constants'
import { MainScene, type MainSceneOptions } from './scene'
import { buildScrollBreakoutSettingsPanel } from './settings-panel'

export const scrollBreakoutGame: GameModule = {
  uiTheme: {
    fontSans: 'Courier, "Courier New", monospace',
    fontMono: 'Courier, "Courier New", monospace',
  },

  async start(app: Application, ctx: GameContext, signal: AbortSignal): Promise<GameHandle> {
    const rng = new Rng(ctx.config.seed)
    const gameSettings = buildScrollBreakoutSettingsPanel(useRuntimeStore.getState().uiTheme)
    const layout = attachLayout(app, { gameSettings })
    const autoPause = attachAutoPause(app)
    const sm = new SceneManager(layout, app.ticker, GAME_ID, rng)

    const teardown = async (): Promise<void> => {
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
          // Fresh scene in the waiting phase so the player can aim again.
          void sm.changeTo(new MainScene(sceneOptions))
        },
      }
      await sm.changeTo(new MainScene(sceneOptions))
      signal.throwIfAborted()
    } catch (e) {
      await teardown()
      throw e
    }

    return { destroy: teardown }
  },
}
