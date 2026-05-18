import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import {
  BOSS_BASE_HITS,
  BOSS_DEFEAT_ANIM_MS,
  BOSS_FLASH_MS,
  BOSS_FLOAT_X_AMPLITUDE,
  BOSS_FLOAT_X_PERIOD_MS,
  BOSS_FLOAT_Y_AMPLITUDE,
  BOSS_FLOAT_Y_PERIOD_MS,
} from './constants'

type Phase = 'alive' | 'defeating'

/** A boss entity. Visually a 300px sticker that drifts in a sine wave on
 * both axes; takes `maxHits` ball contacts before defeat. The collider is
 * kinematic so the ball still bounces but the boss isn't pushed around. */
export class Boss extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number
  readonly maxHits: number
  readonly bonusScore: number

  private readonly collider: RAPIER.Collider
  private readonly sprite: Sprite
  private hits = 0
  private elapsedMs = 0
  private flashMs = 0
  private defeatMs = 0
  private phase: Phase = 'alive'
  private readonly originX: number
  private readonly originY: number

  constructor(args: {
    world: RAPIER.World
    texture: Texture
    bossNumber: number
    centerX: number
    centerY: number
    width: number
    height: number
  }) {
    super()
    const { world, texture, bossNumber, centerX, centerY, width, height } = args
    this.maxHits = BOSS_BASE_HITS + bossNumber
    this.bonusScore = 400 + bossNumber * 100
    this.originX = centerX
    this.originY = centerY

    this.sprite = new Sprite(texture)
    this.sprite.anchor.set(0.5)
    this.sprite.width = width
    this.sprite.height = height
    this.addChild(this.sprite)

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(centerX, centerY),
    )
    // 80% collider, like the original's tighter hitbox.
    const cw = width * 0.8
    const ch = height * 0.8
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(cw / 2, ch / 2)
        .setRestitution(1)
        .setFriction(0),
      this.body,
    )
    this.colliderHandle = this.collider.handle

    this.position.set(centerX, centerY)
  }

  get isAlive(): boolean {
    return this.phase === 'alive'
  }
  get isDefeating(): boolean {
    return this.phase === 'defeating'
  }

  /** Returns true if defeated by this hit. */
  hit(): boolean {
    if (this.phase !== 'alive') return false
    this.hits++
    this.flashMs = BOSS_FLASH_MS
    if (this.hits >= this.maxHits) {
      this.phase = 'defeating'
      this.defeatMs = 0
      // The defeat animation is purely visual; disable the collider so
      // balls pass through the shrinking corpse instead of bouncing off
      // (and triggering stray wall-hit sounds).
      this.collider.setEnabled(false)
      return true
    }
    return false
  }

  /** Tick floating motion + flash decay + defeat animation. Returns true
   * once the defeat animation has fully played out (caller should then
   * dispose the boss). */
  update(dtMs: number): boolean {
    this.elapsedMs += dtMs

    if (this.phase === 'alive') {
      const dy =
        Math.sin((this.elapsedMs / BOSS_FLOAT_Y_PERIOD_MS) * Math.PI * 2) * BOSS_FLOAT_Y_AMPLITUDE
      const dx =
        Math.sin((this.elapsedMs / BOSS_FLOAT_X_PERIOD_MS) * Math.PI * 2) * BOSS_FLOAT_X_AMPLITUDE
      this.body.setNextKinematicTranslation({ x: this.originX + dx, y: this.originY + dy })

      // Flash: tint red for half the duration, white the rest.
      if (this.flashMs > 0) {
        this.flashMs -= dtMs
        this.sprite.tint = this.flashMs > BOSS_FLASH_MS / 2 ? 0xff0000 : 0xffffff
      } else {
        this.sprite.tint = 0xffffff
      }
      return false
    }

    // 'defeating': scale up + spin + fade.
    this.defeatMs += dtMs
    const t = Math.min(this.defeatMs / BOSS_DEFEAT_ANIM_MS, 1)
    this.sprite.scale.set(1 + t)
    this.sprite.rotation = t * Math.PI * 2
    this.sprite.alpha = 1 - t
    return t >= 1
  }

  /** Read the body translation (the boss moves; callers shouldn't assume
   * its visual position is static). */
  syncView(): void {
    const tr = this.body.translation()
    this.position.set(tr.x, tr.y)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
