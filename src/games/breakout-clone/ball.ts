import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics } from 'pixi.js'
import { BALL_RADIUS } from './constants'

/** Dynamic-body ball. Restitution-1 + zero friction means walls and the
 * paddle act as perfect elastic bouncers; gravity is off so the ball
 * keeps its launch speed indefinitely. */
export class Ball extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number

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
        // CCD prevents the ball from tunnelling through walls / paddles
        // when special-ball pickups or paddle vx transfer push speed past
        // the per-step travel distance for the collider radius.
        .setCcdEnabled(true),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setRestitution(1)
        .setFriction(0)
        // Surface contact-start / contact-stop pairs to the scene's
        // EventQueue. Only one side of a contact needs the flag — set it
        // on the ball so every paddle / brick / wall contact is reported.
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

  /** Pause / resume by toggling body type. Stops the ball in place and
   * stops responding to forces until `unfreeze()`. */
  freeze(): void {
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
    this.body.setLinvel({ x: 0, y: 0 }, true)
  }
  unfreeze(): void {
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
  }

  /** Copy the Rapier translation onto the Pixi container. Pure view sync —
   * does not mutate body state. */
  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
