import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics } from 'pixi.js'
import {
  PADDLE_BOUNDS_LEFT,
  PADDLE_BOUNDS_RIGHT,
  PADDLE_GROUND_Y,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
} from './constants'

/** Player-controlled paddle. Implemented as a kinematic Rapier body so its
 * velocity drives ball bounces (via restitution + a small velocity transfer
 * applied on contact) without the paddle itself being shoved. Movement is
 * x-only — y stays clamped to the floor. */
export class Paddle extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number

  constructor(
    world: RAPIER.World,
    startX: number = (PADDLE_BOUNDS_LEFT + PADDLE_BOUNDS_RIGHT) / 2,
  ) {
    super()

    const g = new Graphics()
      .rect(-PADDLE_WIDTH / 2, -PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT)
      .fill(0xffffff)
    this.addChild(g)

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(startX, PADDLE_GROUND_Y),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(PADDLE_WIDTH / 2, PADDLE_HEIGHT / 2)
        .setRestitution(1)
        .setFriction(0),
      this.body,
    )
    this.colliderHandle = collider.handle

    this.position.set(startX, PADDLE_GROUND_Y)
  }

  setVelocityX(vx: number): void {
    this.body.setLinvel({ x: vx, y: 0 }, true)
  }

  get velocityX(): number {
    return this.body.linvel().x
  }

  /** Clamp the Rapier body's x into the playfield bounds and zero out the
   * outward-going velocity. Mutates simulation state (body + linvel). */
  clampToBounds(): void {
    let x = this.body.translation().x
    let vx = this.body.linvel().x
    if (x < PADDLE_BOUNDS_LEFT) {
      x = PADDLE_BOUNDS_LEFT
      if (vx < 0) vx = 0
    } else if (x > PADDLE_BOUNDS_RIGHT) {
      x = PADDLE_BOUNDS_RIGHT
      if (vx > 0) vx = 0
    } else {
      return // already in bounds; no body mutation needed
    }
    this.body.setTranslation({ x, y: PADDLE_GROUND_Y }, true)
    this.body.setLinvel({ x: vx, y: 0 }, true)
  }

  /** Copy the Rapier translation onto the Pixi container. Pure view sync. */
  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, PADDLE_GROUND_Y)
    void t.y // y is pinned to PADDLE_GROUND_Y; we don't read it.
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
