import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import {
  PADDLE_CENTER_Y,
  PADDLE_DISPLAY_H,
  PADDLE_FAST_MULT,
  PADDLE_MIN_X,
  PADDLE_RADIUS,
  PADDLE_SPEED,
} from './constants'

/** The player avatar: a Sticker-Drift-style sticker sprite riding a simple
 * circular collider. The scene's contact handler reshapes the ball's velocity
 * on hit (relative to the paddle centre), so the round shape just needs to be a
 * clean bumper — no dome/hull geometry. */
export class Paddle extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number

  constructor(world: RAPIER.World, startX: number, texture: Texture) {
    super()

    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    // @2x textures report their logical height; scale to the target display height.
    sprite.scale.set(PADDLE_DISPLAY_H / texture.height)
    this.addChild(sprite)

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

  setVelocityX(vx: number): void {
    this.body.setLinvel({ x: vx, y: 0 }, true)
  }

  get velocityX(): number {
    return this.body.linvel().x
  }

  applyInput(left: boolean, right: boolean, fast: boolean): void {
    const speed = PADDLE_SPEED * (fast ? PADDLE_FAST_MULT : 1)
    if (left && !right) this.setVelocityX(-speed)
    else if (right && !left) this.setVelocityX(speed)
    else this.setVelocityX(0)
  }

  /** World-space left clamp only; the paddle advances rightward without bound
   * (the camera follows it). */
  clampToBounds(): void {
    const x = this.body.translation().x
    if (x >= PADDLE_MIN_X) return
    const y = this.body.translation().y
    this.body.setTranslation({ x: PADDLE_MIN_X, y }, true)
    if (this.body.linvel().x < 0) this.body.setLinvel({ x: 0, y: 0 }, true)
  }

  get worldX(): number {
    return this.body.translation().x
  }

  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
