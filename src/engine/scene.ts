import { Container } from 'pixi.js'
import { type AssetEntry, loadAssets } from './assets'
import { type InputBindings, InputManager } from './input/index'
import type { GameLayout } from './layout'
import type { Rng } from './rng'

/** Per-frame delta handed to `Scene.onUpdate`. Capped at the engine level
 * (see `MAX_DT_SEC`) so a single huge frame can't be propagated to
 * physics / movement code path-by-path — every subsystem in a scene sees
 * the same capped value. */
export interface SceneDelta {
  /** Frame delta in milliseconds (capped). */
  dtMs: number
  /** Frame delta in seconds (capped). */
  dtSec: number
}

export abstract class Scene extends Container {
  protected input!: InputManager
  protected gameId!: string
  protected rng!: Rng
  protected layout!: GameLayout

  /** Load and track `entries` under the current game's id. */
  protected preload(entries: AssetEntry[], signal: AbortSignal): Promise<void> {
    return loadAssets(this.gameId, entries, signal)
  }

  /** Create the InputManager for this scene. Listeners release when `signal` aborts
   * (typically the per-scene signal provided by `SceneManager`). */
  protected bindInput(bindings: InputBindings, signal: AbortSignal): void {
    this.input = new InputManager(bindings, signal)
  }

  abstract onEnter(signal: AbortSignal): void | Promise<void>
  abstract onUpdate(dt: SceneDelta): void
  onExit(): void | Promise<void> {}

  /** @internal — called by `SceneManager.changeTo`. */
  attach(gameId: string, rng: Rng, layout: GameLayout): void {
    this.gameId = gameId
    this.rng = rng
    this.layout = layout
  }
}
