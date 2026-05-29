import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics } from 'pixi.js'
import { BALL_RADIUS } from './constants'

/** Scale punch on bounce: snaps to 1 + AMP, then eases back to 1. */
const POP_AMP = 0.55
const POP_DECAY = 16

export class Ball extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number
  /** Time since the last bounce pop; < 0 when idle. */
  private popTime = -1

  constructor(world: RAPIER.World, startX: number, startY: number) {
    super()

    const g = new Graphics().circle(0, 0, BALL_RADIUS).fill(0xffffff)
    this.addChild(g)

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(startX, startY)
        .lockRotations()
        .setLinearDamping(0)
        .setGravityScale(0)
        .setCcdEnabled(true),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setRestitution(1)
        .setFriction(0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    )
    this.colliderHandle = collider.handle

    this.position.set(startX, startY)
  }

  setPosition(x: number, y: number): void {
    this.body.setTranslation({ x, y }, true)
    this.position.set(x, y)
  }

  setVelocity(vx: number, vy: number): void {
    this.body.setLinvel({ x: vx, y: vy }, true)
  }

  freeze(): void {
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
    this.body.setLinvel({ x: 0, y: 0 }, true)
  }

  unfreeze(): void {
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
  }

  /** Trigger a scale punch — call when the ball bounces. */
  pop(): void {
    this.popTime = 0
  }

  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
  }

  /** Ease the bounce pop each frame (visual only — the collider is unchanged). */
  animate(dtSec: number): void {
    if (this.popTime < 0) return
    this.popTime += dtSec
    const a = POP_AMP * Math.exp(-this.popTime * POP_DECAY)
    if (a < 0.02) {
      this.popTime = -1
      this.scale.set(1)
    } else {
      this.scale.set(1 + a)
    }
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
