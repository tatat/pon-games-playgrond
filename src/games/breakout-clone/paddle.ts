import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics } from 'pixi.js'
import {
  JUMP_GRAVITY,
  JUMP_VELOCITY,
  PADDLE_BOUNDS_LEFT,
  PADDLE_BOUNDS_RIGHT,
  PADDLE_GROUND_Y,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
} from './constants'

/** Player-controlled paddle. Kinematic Rapier body driven by velocity:
 * the ball bounces off (restitution + a small post-contact velocity
 * transfer) without the paddle being shoved. X moves with input; Y is
 * pinned to the floor except during a jump, which integrates its own
 * gravity-affected `jumpVy`. */
export class Paddle extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number

  private jumping = false
  private jumpVy = 0

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
    this.body.setLinvel({ x: vx, y: this.body.linvel().y }, true)
  }

  get velocityX(): number {
    return this.body.linvel().x
  }

  get isJumping(): boolean {
    return this.jumping
  }

  /** Start a jump if grounded. Returns true if the jump actually began
   * (caller may want to fire a visual squash tween). No-op while
   * airborne. */
  startJump(): boolean {
    if (this.jumping) return false
    this.jumping = true
    this.jumpVy = JUMP_VELOCITY
    return true
  }

  /** Integrate jump physics; call before `world.step()`. */
  updateJump(dtSec: number): void {
    if (!this.jumping) {
      // Pin y velocity to zero while grounded.
      const vx = this.body.linvel().x
      this.body.setLinvel({ x: vx, y: 0 }, true)
      return
    }
    this.jumpVy += JUMP_GRAVITY * dtSec
    const vx = this.body.linvel().x
    this.body.setLinvel({ x: vx, y: this.jumpVy }, true)
  }

  /** Snap back to ground if the body crossed it on the way down; call
   * after `world.step()`. Returns true on the frame the paddle actually
   * touches down — callers use that to fire a landing squash tween. */
  checkLanding(): boolean {
    if (!this.jumping) return false
    const y = this.body.translation().y
    if (y >= PADDLE_GROUND_Y && this.jumpVy >= 0) {
      const x = this.body.translation().x
      this.body.setTranslation({ x, y: PADDLE_GROUND_Y }, true)
      const vx = this.body.linvel().x
      this.body.setLinvel({ x: vx, y: 0 }, true)
      this.jumping = false
      this.jumpVy = 0
      return true
    }
    return false
  }

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
      return
    }
    const y = this.body.translation().y
    this.body.setTranslation({ x, y }, true)
    this.body.setLinvel({ x: vx, y: this.body.linvel().y }, true)
  }

  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
