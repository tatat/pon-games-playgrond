import type { Application } from 'pixi.js'
import { unloadGameAssets } from '../../engine/assets'
import { attachAutoPause } from '../../engine/auto-pause'
import { attachLayout } from '../../engine/layout'
import { Rng } from '../../engine/rng'
import { SceneManager } from '../../engine/scene-manager'
import type { GameContext, GameHandle, GameModule } from '../types'
import { GAME_ID } from './constants'
import { MainScene } from './scene'

/** Breakout Clone — port of the Phaser original. Currently a skeleton: the
 * scene only renders a placeholder while the gameplay subsystems (paddle,
 * ball, bricks, boss, sound) come online in subsequent phases. */
export const breakoutCloneGame: GameModule = {
  uiTheme: {
    // Match the original's Phaser-default Courier look across engine UI.
    fontSans: 'Courier, "Courier New", monospace',
    fontMono: 'Courier, "Courier New", monospace',
  },

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

    // Skeleton phase: callbacks unused until paddle/ball/bricks land. They
    // stay in GameContext so the type contract doesn't change later.
    void ctx

    try {
      await sm.changeTo(new MainScene())
      signal.throwIfAborted()
    } catch (e) {
      await teardown()
      throw e
    }

    return { destroy: teardown }
  },
}
