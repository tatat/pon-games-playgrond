import type { Ticker } from 'pixi.js'
import type { GameLayout } from './layout'
import type { Rng } from './rng'
import type { Scene } from './scene'

/** Orchestrates scene lifecycle for one game:
 *  - serializes `changeTo` calls via a chained transition promise
 *  - per-scene `AbortSignal` derived from the manager's signal
 *  - calls `onExit()` to completion before destroying a scene
 *  - self-destructs when the manager's signal aborts */
export class SceneManager {
  private current?: Scene
  private currentSceneCtrl?: AbortController
  private transition: Promise<void> = Promise.resolve()
  private destroyed = false
  private readonly tickHandler = (ticker: Ticker): void => {
    this.current?.onUpdate(ticker)
  }

  constructor(
    private readonly layout: GameLayout,
    private readonly ticker: Ticker,
    signal: AbortSignal,
    private readonly gameId: string,
    private readonly rng: Rng,
  ) {
    ticker.add(this.tickHandler)
    signal.addEventListener('abort', () => this.destroy(), { once: true })
  }

  changeTo(next: Scene): Promise<void> {
    next.attach(this.gameId, this.rng, this.layout)
    const run = async (): Promise<void> => {
      if (this.destroyed) {
        next.destroy({ children: true })
        return
      }
      // Exit the previous scene first (cleanup runs to completion, no signal).
      if (this.current) {
        this.currentSceneCtrl?.abort()
        await this.current.onExit()
        this.layout.gameContainer.removeChild(this.current)
        this.current.destroy({ children: true })
        this.current = undefined
      }
      if (this.destroyed) {
        next.destroy({ children: true })
        return
      }
      this.current = next
      this.currentSceneCtrl = new AbortController()
      this.layout.gameContainer.addChild(next)
      await next.onEnter(this.currentSceneCtrl.signal)
    }
    // Serialize: each call waits for the previous to finish before running.
    this.transition = this.transition.catch(() => {}).then(run)
    return this.transition
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.ticker.remove(this.tickHandler)
    this.currentSceneCtrl?.abort()
    // Queue teardown onto the serialized transition chain so it never races
    // with an in-flight changeTo's onExit on the same scene.
    this.transition = this.transition
      .catch(() => {})
      .then(async () => {
        if (this.current) {
          await this.current.onExit()
          this.layout.gameContainer.removeChild(this.current)
          this.current.destroy({ children: true })
          this.current = undefined
        }
      })
  }
}
