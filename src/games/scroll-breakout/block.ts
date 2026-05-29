import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import { BLOCK_SCORE } from './constants'

/** One block: a sticker sprite + a fixed physics body at a world position.
 * The camera scrolls the world; blocks themselves don't move.
 * Display size is passed in (computed from texture aspect by the spawner,
 * matching breakout-clone's sizeForAspect logic). */
export class Block extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number
  readonly scoreValue = BLOCK_SCORE

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

    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, centerY))
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
    return this.body.translation().x
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
