import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import { DEFAULT_SCORE, SCORE_BY_SIZE } from './constants'

/** One brick: a sticker sprite + a fixed-body cuboid collider for bouncing
 * the ball off, plus the score awarded for breaking it. The scene's
 * contact handler resolves contacts back to this entity via the collider
 * handle map maintained by `BrickGenerator`. */
export class Brick extends Container {
  readonly body: RAPIER.RigidBody
  readonly colliderHandle: number
  readonly brickWidth: number
  readonly brickHeight: number
  readonly scoreValue: number

  constructor(args: {
    world: RAPIER.World
    texture: Texture
    centerX: number
    centerY: number
    width: number
    height: number
    /** Logical base size, used to look up the score table. */
    baseSize: number
  }) {
    super()
    const { world, texture, centerX, centerY, width, height, baseSize } = args
    this.brickWidth = width
    this.brickHeight = height
    this.scoreValue = SCORE_BY_SIZE[baseSize] ?? DEFAULT_SCORE

    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.width = width
    sprite.height = height
    this.addChild(sprite)

    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, centerY))
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2)
        .setRestitution(1)
        .setFriction(0),
      this.body,
    )
    this.colliderHandle = collider.handle

    this.position.set(centerX, centerY)
  }

  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
