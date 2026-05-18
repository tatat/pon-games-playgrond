import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics } from 'pixi.js'
import { SPECIAL_BALL_COLOR, SPECIAL_BALL_RADIUS } from './constants'

/** A glowing green secondary ball. Same physics as the main ball, but
 * dying doesn't cost a life — it just gets removed. */
export class SpecialBall extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number

  constructor(world: RAPIER.World, startX: number, startY: number, vx: number, vy: number) {
    super()

    // Three-layer glow.
    const g = new Graphics()
      .circle(0, 0, SPECIAL_BALL_RADIUS * 1.5)
      .fill({ color: SPECIAL_BALL_COLOR, alpha: 0.3 })
      .circle(0, 0, SPECIAL_BALL_RADIUS * 1.25)
      .fill({ color: SPECIAL_BALL_COLOR, alpha: 0.6 })
      .circle(0, 0, SPECIAL_BALL_RADIUS)
      .fill({ color: SPECIAL_BALL_COLOR })
    this.addChild(g)

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(startX, startY)
        .lockRotations()
        .setLinearDamping(0)
        .setGravityScale(0)
        .setLinvel(vx, vy)
        // Same CCD rationale as the main ball — fast specials shouldn't
        // tunnel through walls / paddles.
        .setCcdEnabled(true),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(SPECIAL_BALL_RADIUS)
        .setRestitution(1)
        .setFriction(0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    )
    this.colliderHandle = collider.handle

    this.position.set(startX, startY)
  }

  get x(): number {
    return this.body.translation().x
  }
  get bodyY(): number {
    return this.body.translation().y
  }

  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
