import { Container } from 'pixi.js'
import { type AssetEntry, loadAssets } from './assets'
import { type InputBindings, InputManager } from './input/index'
import type { GameLayout } from './layout'
import type { Rng } from './rng'
import { asDisposeFn, type DisposableLike } from './util/disposable'

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
  /** Per-scene async cancellation signal — same one passed to `onEnter`.
   * Stored here so scenes can use it for `signal.throwIfAborted()` /
   * `preload` without holding the parameter themselves. */
  protected signal!: AbortSignal

  private readonly cleanups: Array<() => void | Promise<void>> = []

  /** Register a resource whose lifetime is bound to this scene. Returns the
   * resource so it can be assigned in one line:
   * ```ts
   * const pad = this.use(makeFloatPad(...))
   * ```
   * `dispose` callbacks run in reverse-registration order, after `onExit`,
   * each `await`ed in sequence so async cleanup (asset unload, animation
   * teardown) completes before the next teardown step. */
  protected use<T extends DisposableLike>(d: T): T {
    this.cleanups.push(asDisposeFn(d))
    return d
  }

  /** Load and track `entries` under the current game's id. */
  protected preload(entries: AssetEntry[], signal: AbortSignal): Promise<void> {
    return loadAssets(this.gameId, entries, signal)
  }

  /** Create + register the scene's InputManager. The instance is disposed
   * (listeners removed, state cleared) when the scene tears down. */
  protected bindInput(bindings: InputBindings): void {
    this.input = this.use(new InputManager(bindings))
  }

  abstract onEnter(signal: AbortSignal): void | Promise<void>
  abstract onUpdate(dt: SceneDelta): void
  onExit(): void | Promise<void> {}

  /** @internal — called by `SceneManager` after `onExit`. Runs all
   * registered cleanups in reverse order, awaiting each. */
  async runTeardown(): Promise<void> {
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      await this.cleanups[i]?.()
    }
    this.cleanups.length = 0
  }

  /** @internal — called by `SceneManager.changeTo`. */
  attach(gameId: string, rng: Rng, layout: GameLayout, signal: AbortSignal): void {
    this.gameId = gameId
    this.rng = rng
    this.layout = layout
    this.signal = signal
  }
}
