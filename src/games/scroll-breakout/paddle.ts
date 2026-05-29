import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics } from 'pixi.js'
import {
  PADDLE_FAST_MULT,
  PADDLE_GROUND_Y,
  PADDLE_MIN_X,
  PADDLE_SPEED,
  PADDLE_START_X,
  PADDLE_WIDTH,
} from './constants'

const DOME_RADIUS = PADDLE_WIDTH / 2

/** Half-disc (semicircle) player paddle: flat side down, dome up.
 * Physics body: convex hull matching the dome profile.
 * The scene's contact handler reshapes the ball's velocity on hit
 * (dome-angle logic) rather than relying on the collider shape alone. */
export class Paddle extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number

  constructor(world: RAPIER.World, startX: number = PADDLE_START_X) {
    super()

    this.drawDome()

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(startX, PADDLE_GROUND_Y),
    )

    // Convex hull of the dome arc. The arc endpoints land on the flat
    // baseline (y = 0), so the hull closes into a clean half-disc and the
    // ball rides the curved surface rather than passing through arc corners.
    const hw = PADDLE_WIDTH / 2
    const arcSteps = 12
    const pts: number[] = []
    for (let i = 0; i <= arcSteps; i++) {
      const angle = Math.PI - (i / arcSteps) * Math.PI // π → 0
      pts.push(Math.cos(angle) * hw, -Math.sin(angle) * DOME_RADIUS)
    }

    const hullDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts))
    const shapeDesc = hullDesc ?? RAPIER.ColliderDesc.cuboid(hw, DOME_RADIUS / 2)
    const collider = world.createCollider(shapeDesc.setRestitution(1).setFriction(0), this.body)
    this.colliderHandle = collider.handle

    this.position.set(startX, PADDLE_GROUND_Y)
  }

  private drawDome(): void {
    const hw = PADDLE_WIDTH / 2
    // Origin = physics body center = midpoint of the flat baseline.
    const g = new Graphics()
    // arc(false) = clockwise in screen space = bows through negative-y = dome UP.
    g.moveTo(-hw, 0)
    g.arc(0, 0, hw, Math.PI, 0, false)
    g.closePath() // flat baseline along the diameter
    g.fill(0xffffff)
    this.addChild(g)
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
