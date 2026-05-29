import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import { BLOCK_BOB_AMP, BLOCK_BOB_FREQ, BLOCK_BOB_ROT } from './constants'

/** One block: a sticker sprite + a kinematic physics body at a world position.
 * The camera scrolls the world; a block only moves by its gentle floating bob,
 * which drives the body (collider) so the hit area matches the visual.
 * Display size is passed in (computed from texture aspect by the spawner,
 * matching breakout-clone's sizeForAspect logic). */
export class Block extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number
  /** Home position; the bob oscillates around it. */
  private readonly baseX: number
  private readonly baseY: number
  /** Per-block phase (from its world position) so blocks bob out of sync. */
  private readonly bobPhase: number

  constructor(
    world: RAPIER.World,
    texture: Texture,
    centerX: number,
    centerY: number,
    displayW: number,
    displayH: number,
  ) {
    super()

    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.width = displayW
    sprite.height = displayH
    this.addChild(sprite)

    this.baseX = centerX
    this.baseY = centerY
    this.bobPhase = centerX * 0.02 + centerY * 0.05

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(centerX, centerY),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(displayW / 2, displayH / 2)
        .setRestitution(1)
        .setFriction(0),
      this.body,
    )
    this.colliderHandle = collider.handle

    this.position.set(centerX, centerY)
  }

  get centerX(): number {
    return this.baseX
  }

  /** Queue the bob target on the body. Call before the physics step. */
  bob(timeSec: number): void {
    const offsetY = Math.sin(timeSec * BLOCK_BOB_FREQ + this.bobPhase) * BLOCK_BOB_AMP
    const rot = Math.sin(timeSec * BLOCK_BOB_FREQ * 0.8 + this.bobPhase) * BLOCK_BOB_ROT
    this.body.setNextKinematicTranslation({ x: this.baseX, y: this.baseY + offsetY })
    this.body.setNextKinematicRotation(rot)
  }

  /** Copy the body transform to the view. Call after the physics step. */
  syncView(): void {
    const t = this.body.translation()
    this.position.set(t.x, t.y)
    this.rotation = this.body.rotation()
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
