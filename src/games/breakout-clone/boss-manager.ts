import type RAPIER from '@dimforge/rapier2d-compat'
import { Assets, type Container } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import { Boss } from './boss'
import { BOSS_DISPLAY_SIZE, BOSS_FIRST_THRESHOLD, BRICK_NAMES } from './constants'

export interface BossManagerCallbacks {
  /** Called when the threshold is crossed but before the boss spawns —
   * lets the scene fade out / clear bricks. */
  onBossBattleWillStart?(): void
  /** Called once the boss has been added to the world. */
  onBossStarted?(boss: Boss): void
  /** Called after the boss's defeat animation finishes. */
  onBossDefeated?(boss: Boss, bonusScore: number): void
}

/** Tracks the boss battle lifecycle: score-based spawn threshold, the
 * current boss entity, hit accounting, and defeat-animation completion.
 * The scene drives ball↔boss contact and `tick`s the manager every frame. */
export class BossManager {
  private bossNumber = 0
  private current: Boss | null = null
  private spawnPendingMs = -1

  constructor(
    private readonly world: RAPIER.World,
    private readonly parent: Container,
    private readonly rng: Rng,
    private readonly callbacks: BossManagerCallbacks = {},
  ) {}

  /** Should the boss appear given the current score? */
  shouldStart(score: number): boolean {
    if (this.current || this.spawnPendingMs > 0) return false
    return score >= this.nextThreshold()
  }

  /** Begin the boss battle: callers should have already hidden the bricks
   * (via `onBossBattleWillStart`) before this returns. The boss itself
   * spawns after a brief delay; pass `dtMs` to `tick` to advance it. */
  startBattle(delayMs: number): void {
    if (this.current || this.spawnPendingMs > 0) return
    this.callbacks.onBossBattleWillStart?.()
    this.spawnPendingMs = delayMs
  }

  /** Advance any pending spawn or defeat animation. Returns the current
   * boss instance if alive (or `null`). */
  tick(dtMs: number): Boss | null {
    if (this.spawnPendingMs > 0) {
      this.spawnPendingMs -= dtMs
      if (this.spawnPendingMs <= 0) {
        this.spawnPendingMs = -1
        this.spawn()
      }
    }
    if (this.current) {
      const finished = this.current.update(dtMs)
      this.current.syncView()
      if (finished && this.current.isDefeating) {
        const defeated = this.current
        this.parent.removeChild(defeated)
        defeated.removeFromWorld(this.world)
        defeated.destroy({ children: true })
        this.current = null
        this.callbacks.onBossDefeated?.(defeated, defeated.bonusScore)
      }
    }
    return this.current
  }

  /** Apply a hit to the current boss (no-op if none / already defeating). */
  hitCurrent(): boolean {
    if (!this.current?.isAlive) return false
    return this.current.hit()
  }

  get active(): boolean {
    return this.current !== null || this.spawnPendingMs > 0
  }

  /** Tear down any in-flight boss / pending spawn. */
  dispose(): void {
    if (this.current) {
      this.parent.removeChild(this.current)
      this.current.removeFromWorld(this.world)
      this.current.destroy({ children: true })
      this.current = null
    }
    this.spawnPendingMs = -1
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private nextThreshold(): number {
    let threshold = BOSS_FIRST_THRESHOLD
    for (let i = 1; i <= this.bossNumber; i++) {
      const bonus = 400 + i * 100
      threshold += bonus + 1000
    }
    return threshold
  }

  private spawn(): void {
    this.bossNumber++
    const name = this.rng.pick(BRICK_NAMES)
    const texture = Assets.get(`brick-${name}-300`)
    if (!texture) return

    // Honor the source aspect (sticker is taller than wide; long side =
    // 300, short side scales). Use texture intrinsic dimensions.
    const aspect = texture.width / texture.height
    let width: number, height: number
    if (aspect >= 1) {
      width = BOSS_DISPLAY_SIZE
      height = BOSS_DISPLAY_SIZE / aspect
    } else {
      width = BOSS_DISPLAY_SIZE * aspect
      height = BOSS_DISPLAY_SIZE
    }

    const boss = new Boss({
      world: this.world,
      texture,
      bossNumber: this.bossNumber,
      centerX: DESIGN_W / 2,
      centerY: 250,
      width,
      height,
    })
    boss.zIndex = 50
    this.parent.addChild(boss)
    this.current = boss
    this.callbacks.onBossStarted?.(boss)
  }
}
