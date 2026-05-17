import type { Ticker } from 'pixi.js'
import { useRuntimeStore } from '../store/runtime'
import { MAX_DT_SEC } from './constants'
import type { GameLayout } from './layout'
import type { Rng } from './rng'
import type { Scene } from './scene'
import type { Disposable } from './util/disposable'

/** Orchestrates scene lifecycle for one game:
 *  - serializes `changeTo` calls via a chained transition promise
 *  - per-scene `AbortSignal` derived internally (for async-op cancel only)
 *  - calls `onExit()` + `runTeardown()` to completion before destroying a scene
 *  - `dispose()` finalises the manager: aborts the in-flight scene, exits it,
 *    runs its teardown, then removes the ticker handler. */
export class SceneManager implements Disposable {
  private current?: Scene
  private currentSceneCtrl?: AbortController
  private currentReady = false
  private paused = useRuntimeStore.getState().gamePaused
  private readonly unsubPaused: () => void
  private transition: Promise<void> = Promise.resolve()
  private destroyed = false
  private readonly tickHandler = (ticker: Ticker): void => {
    if (this.paused) return
    if (!this.currentReady || !this.current) return
    const dtMs = Math.min(ticker.deltaMS, MAX_DT_SEC * 1000)
    this.current.onUpdate({ dtMs, dtSec: dtMs / 1000 })
  }

  constructor(
    private readonly layout: GameLayout,
    private readonly ticker: Ticker,
    private readonly gameId: string,
    private readonly rng: Rng,
  ) {
    ticker.add(this.tickHandler)
    this.unsubPaused = useRuntimeStore.subscribe((s, prev) => {
      this.paused = s.gamePaused
      if (s.gamePaused !== prev.gamePaused) {
        // Drop any presses collected during the transition (or held
        // through the paused window) so they don't fire as "just pressed"
        // on the first frame after resume.
        this.current?.clearInputTransientState()
      }
    })
  }

  changeTo(next: Scene): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.destroyed) {
        next.destroy({ children: true })
        return
      }
      if (this.current) {
        await this.tearDownCurrent()
      }
      if (this.destroyed) {
        next.destroy({ children: true })
        return
      }
      this.current = next
      this.currentSceneCtrl = new AbortController()
      next.attach(this.gameId, this.rng, this.layout, this.currentSceneCtrl.signal)
      this.layout.gameContainer.addChild(next)
      await next.onEnter(this.currentSceneCtrl.signal)
      if (this.current === next && !this.destroyed) {
        this.currentReady = true
      }
    }
    this.transition = this.transition.catch(() => {}).then(run)
    return this.transition
  }

  async dispose(): Promise<void> {
    if (this.destroyed) {
      await this.transition.catch(() => {})
      return
    }
    this.destroyed = true
    this.currentReady = false
    this.unsubPaused()
    this.ticker.remove(this.tickHandler)
    // Queue teardown onto the serialized transition chain so it never races
    // with an in-flight changeTo's onExit on the same scene.
    this.transition = this.transition.catch(() => {}).then(() => this.tearDownCurrent())
    await this.transition
  }

  /** Tear down the active scene: cancel its async ops, exit it, and run
   * its registered cleanups, then detach + destroy the Pixi container.
   * The detach/destroy/clear happens in `finally` so a throwing onExit or
   * cleanup can't leave the scene stuck on the stage. */
  private async tearDownCurrent(): Promise<void> {
    const scene = this.current
    if (!scene) return
    this.currentReady = false
    this.currentSceneCtrl?.abort()
    try {
      await scene.onExit()
      await scene.runTeardown()
    } finally {
      this.layout.gameContainer.removeChild(scene)
      scene.destroy({ children: true })
      this.current = undefined
    }
  }
}
