import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import {
  PADDLE_CENTER_Y,
  PADDLE_DISPLAY_H,
  PADDLE_FAST_MULT,
  PADDLE_JUMP_GRAVITY,
  PADDLE_JUMP_SPEED,
  PADDLE_MAX_TILT_DEG,
  PADDLE_MAX_TILT_FAST_DEG,
  PADDLE_MIN_X,
  PADDLE_POP_AMP,
  PADDLE_POP_DECAY,
  PADDLE_POP_FREQ,
  PADDLE_RADIUS,
  PADDLE_SPEED,
  PADDLE_TILT_LERP,
} from './constants'

const DEG_TO_RAD = Math.PI / 180

/** The player avatar: a Sticker-Drift-style sticker sprite riding a simple
 * circular collider. The scene's contact handler reshapes the ball's velocity
 * on hit (relative to the paddle centre), so the round shape just needs to be a
 * clean bumper — no dome/hull geometry. */
export class Paddle extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number
  /** Sticker sprite; tilted toward the travel direction (collider unaffected). */
  private readonly sprite: Sprite
  /** Base uniform scale (from the @2x texture); pop/squash modulates around it. */
  private readonly baseScale: number
  private tilt = 0
  /** Time since the last ball-contact "boing"; < 0 when idle. */
  private popTime = -1
  /** Horizontal speed from input and vertical speed from a jump arc. */
  private vx = 0
  private vy = 0
  private grounded = true

  constructor(world: RAPIER.World, startX: number, texture: Texture) {
    super()

    this.sprite = new Sprite(texture)
    this.sprite.anchor.set(0.5)
    // @2x textures report their logical height; scale to the target display height.
    this.baseScale = PADDLE_DISPLAY_H / texture.height
    this.sprite.scale.set(this.baseScale)
    this.addChild(this.sprite)

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(startX, PADDLE_CENTER_Y),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(PADDLE_RADIUS).setRestitution(1).setFriction(0),
      this.body,
    )
    this.colliderHandle = collider.handle

    this.position.set(startX, PADDLE_CENTER_Y)
  }

  get velocityX(): number {
    return this.vx
  }

  applyInput(left: boolean, right: boolean, fast: boolean): void {
    const speed = PADDLE_SPEED * (fast ? PADDLE_FAST_MULT : 1)
    if (left && !right) this.vx = -speed
    else if (right && !left) this.vx = speed
    else this.vx = 0
  }

  /** Start a hop if standing on the ground line. */
  jump(): void {
    if (!this.grounded) return
    this.vy = -PADDLE_JUMP_SPEED
    this.grounded = false
  }

  /** Integrate jump gravity and push the combined velocity to the body. Call
   * each frame before the physics step. */
  applyMotion(dtSec: number): void {
    if (!this.grounded) this.vy += PADDLE_JUMP_GRAVITY * dtSec
    this.body.setLinvel({ x: this.vx, y: this.vy }, true)
  }

  /** After the step: clamp to the world-left edge and land back on the ground
   * line. The paddle advances rightward without bound (the camera follows it). */
  clampToBounds(): void {
    const t = this.body.translation()
    let { x, y } = t
    if (x < PADDLE_MIN_X) {
      x = PADDLE_MIN_X
      if (this.vx < 0) this.vx = 0
    }
    if (!this.grounded && this.vy >= 0 && y >= PADDLE_CENTER_Y) {
      y = PADDLE_CENTER_Y
      this.vy = 0
      this.grounded = true
    }
    if (x !== t.x || y !== t.y) this.body.setTranslation({ x, y }, true)
  }

  get worldX(): number {
    return this.body.translation().x
  }

  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
  }

  /** Trigger a "boing" squash — call when the ball hits the paddle. */
  pop(): void {
    this.popTime = 0
  }

  /** Per-frame sprite animation: ease the tilt toward the travel direction and
   * run the contact squash. Only the sprite rotates/scales — the circular
   * collider and body stay put, so hit detection is unchanged. */
  animate(dtSec: number): void {
    const vx = this.body.linvel().x
    // Dashing (velocity above the normal speed) leans the sprite further.
    const dashing = Math.abs(vx) > PADDLE_SPEED * 1.01
    const maxDeg = dashing ? PADDLE_MAX_TILT_FAST_DEG : PADDLE_MAX_TILT_DEG
    const target = Math.sign(vx) * maxDeg * DEG_TO_RAD
    const k = Math.min(1, dtSec * PADDLE_TILT_LERP)
    this.tilt += (target - this.tilt) * k
    this.sprite.rotation = this.tilt

    // Damped squash-and-stretch wobble after a hit (wider + shorter, settling).
    if (this.popTime >= 0) {
      this.popTime += dtSec
      const decay = Math.exp(-this.popTime * PADDLE_POP_DECAY)
      if (decay < 0.03) {
        this.popTime = -1
        this.sprite.scale.set(this.baseScale)
      } else {
        const s = PADDLE_POP_AMP * Math.sin(this.popTime * PADDLE_POP_FREQ) * decay
        this.sprite.scale.set(this.baseScale * (1 + s), this.baseScale * (1 - s))
      }
    }
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
