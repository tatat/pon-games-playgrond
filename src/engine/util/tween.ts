/** Tiny tween system designed to be driven by `Scene.onUpdate`. Tweens
 * advance with the same `dtMs` as the rest of the scene, so they pause
 * with the game (auto-pause, settings modal) and run on the same capped
 * timestep as physics — no separate accumulator to maintain. */

export type Easing = (t: number) => number

/** Phaser's Power2 is `easeInOutQuad`; the original `breakout-clone`
 * source uses Power2 throughout for fades, so we expose it under both
 * names for fluent porting. */
export const Easings = {
  linear: (t: number) => t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  power2: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
} satisfies Record<string, Easing>

export interface TweenSpec {
  /** Cycle duration in milliseconds. */
  duration: number
  /** Defaults to `Easings.linear`. */
  ease?: Easing
  /** Called every tick with the eased progress in `[0, 1]`. */
  onUpdate(eased: number): void
  /** Called once after the final cycle resolves. */
  onComplete?(): void
  /** Bounce back to 0 inside each cycle (so one cycle = duration * 2 ms). */
  yoyo?: boolean
  /** Additional repeats after the first cycle. `-1` = forever. */
  repeat?: number
}

export class Tween {
  private elapsed = 0
  private done = false
  private cancelled = false

  constructor(private readonly spec: TweenSpec) {}

  /** Advance by `dtMs`. Returns `true` once the tween is finished (or
   * cancelled) and can be culled by the owner. */
  tick(dtMs: number): boolean {
    if (this.done || this.cancelled) return true
    this.elapsed += dtMs

    const cycleDur = this.spec.yoyo ? this.spec.duration * 2 : this.spec.duration
    const maxRepeat = this.spec.repeat ?? 0
    const totalCycles = maxRepeat < 0 ? Number.POSITIVE_INFINITY : maxRepeat + 1
    const ease = this.spec.ease ?? Easings.linear

    const cycleIndex = Math.floor(this.elapsed / cycleDur)
    if (cycleIndex >= totalCycles) {
      // Snap onUpdate to the final cycle's end state, then complete.
      const finalT = this.spec.yoyo ? 0 : 1
      this.spec.onUpdate(ease(finalT))
      this.done = true
      this.spec.onComplete?.()
      return true
    }

    const inCycle = this.elapsed - cycleIndex * cycleDur
    let t = inCycle / this.spec.duration
    if (this.spec.yoyo && t > 1) t = 2 - t
    this.spec.onUpdate(ease(t))
    return false
  }

  /** Stop the tween at its current state. The next `tick` returns `true`,
   * so the owner culls it without firing `onComplete`. */
  cancel(): void {
    this.cancelled = true
  }
}
