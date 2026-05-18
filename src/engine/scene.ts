import { Container } from 'pixi.js'
import { type AssetEntry, loadAssets } from './assets'
import { type InputBindings, InputManager } from './input/index'
import type { GameLayout } from './layout'
import type { Rng } from './rng'
import { asDisposeFn, type DisposableLike } from './util/disposable'
import { Tween, type TweenSpec } from './util/tween'

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
  private readonly activeTweens: Tween[] = []

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

  /** Run a tween driven by this scene's `onUpdate`. The returned promise
   * resolves when the tween finishes (after `onComplete`); a cancellation
   * — via `Tween.cancel()` or scene teardown — leaves the promise
   * unresolved on purpose, matching how Phaser's `tweens.add` drops
   * callbacks on `Tween.stop()`. Await it for sequence sequencing or
   * ignore the return for fire-and-forget. */
  protected tween(spec: TweenSpec): { promise: Promise<void>; tween: Tween } {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    const t = new Tween({
      ...spec,
      onComplete: () => {
        spec.onComplete?.()
        resolve()
      },
    })
    this.activeTweens.push(t)
    return { promise, tween: t }
  }

  /** Advance any active tweens by `dtMs`. Scenes call this from their
   * `onUpdate` — tweens then automatically pause whenever the engine
   * suppresses `onUpdate` (pause menu, settings modal, auto-pause). */
  protected updateTweens(dtMs: number): void {
    for (let i = this.activeTweens.length - 1; i >= 0; i--) {
      const t = this.activeTweens[i]
      if (t?.tick(dtMs)) this.activeTweens.splice(i, 1)
    }
  }

  abstract onEnter(signal: AbortSignal): void | Promise<void>
  abstract onUpdate(dt: SceneDelta): void
  onExit(): void | Promise<void> {}

  /** @internal — called by `SceneManager` on every pause-state transition
   * so presses collected while paused don't fire as "just pressed" the
   * next frame. */
  clearInputTransientState(): void {
    this.input?.clearTransientState()
  }

  /** @internal — called by `SceneManager` after `onExit`. Runs every
   * registered cleanup in reverse order. Errors are collected and thrown
   * as an `AggregateError` at the end so a single failing cleanup can't
   * orphan the rest. */
  async runTeardown(): Promise<void> {
    // Cancel any in-flight tweens first so their callbacks can't fire
    // against a half-destroyed scene during cleanup.
    for (const t of this.activeTweens) t.cancel()
    this.activeTweens.length = 0

    const errors: unknown[] = []
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        await this.cleanups[i]?.()
      } catch (e) {
        errors.push(e)
      }
    }
    this.cleanups.length = 0
    if (errors.length > 0) throw new AggregateError(errors, 'Scene teardown failed')
  }

  /** @internal — called by `SceneManager.changeTo`. */
  attach(gameId: string, rng: Rng, layout: GameLayout, signal: AbortSignal): void {
    this.gameId = gameId
    this.rng = rng
    this.layout = layout
    this.signal = signal
  }
}
