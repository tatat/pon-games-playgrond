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
 * applied in the contact handler) without the paddle itself being shoved by
 * the ball. Movement is x-only — y stays clamped to the floor. */
export class Paddle extends Container {
  readonly body: RAPIER.RigidBody

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
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(PADDLE_WIDTH / 2, PADDLE_HEIGHT / 2)
        .setRestitution(1)
        .setFriction(0),
      this.body,
    )

    this.position.set(startX, PADDLE_GROUND_Y)
  }

  /** Set horizontal velocity. Bounds-clamping happens in `sync()` after the
   * world step, so the body can take a small over-shoot in one frame and
   * then snap back; the visual never reflects an out-of-bounds frame. */
  setVelocityX(vx: number): void {
    this.body.setLinvel({ x: vx, y: 0 }, true)
  }

  get velocityX(): number {
    return this.body.linvel().x
  }

  /** Copy the body's translation to the Pixi position, clamping x into
   * the playfield bounds (the body itself stays where Rapier left it,
   * but the visual + downstream collision checks read clamped values). */
  sync(): void {
    let x = this.body.translation().x
    const left = PADDLE_BOUNDS_LEFT
    const right = PADDLE_BOUNDS_RIGHT
    let vx = this.body.linvel().x
    if (x < left) {
      x = left
      if (vx < 0) vx = 0
      this.body.setTranslation({ x, y: PADDLE_GROUND_Y }, true)
      this.body.setLinvel({ x: vx, y: 0 }, true)
    } else if (x > right) {
      x = right
      if (vx > 0) vx = 0
      this.body.setTranslation({ x, y: PADDLE_GROUND_Y }, true)
      this.body.setLinvel({ x: vx, y: 0 }, true)
    }
    this.position.set(x, PADDLE_GROUND_Y)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
