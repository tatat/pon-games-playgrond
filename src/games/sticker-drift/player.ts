import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Sprite, type Texture } from 'pixi.js'
import { DESIGN_H } from '../../engine/constants'
import { FLOAT_ACCELERATION, PLAYER_MAX_VY, PLAYER_RADIUS, PLAYER_START_X } from './constants'

/** The player sticker. Owns a Rapier dynamic body and a Pixi Sprite, plus
 * a subtle yoyo angle wobble driven by elapsed time. */
export class Player extends Container {
  private readonly sprite: Sprite
  private floating = false
  private alive = true
  private elapsedMs = 0
  readonly body: RAPIER.RigidBody

  constructor(world: RAPIER.World, texture: Texture) {
    super()
    this.sprite = new Sprite(texture)
    this.sprite.anchor.set(0.5)
    // Pixi auto-detects the `@2x` suffix and sets resolution=2 on the texture,
    // so `texture.width` already reports the logical (half-pixel) size that
    // matches the Phaser original's `setScale(0.5)` rendering — scale 1.0 here.
    this.sprite.scale.set(1.0)
    this.addChild(this.sprite)

    const startY = DESIGN_H / 2
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(PLAYER_START_X, startY).lockRotations(),
    )
    world.createCollider(RAPIER.ColliderDesc.ball(PLAYER_RADIUS), rb)
    this.body = rb

    this.position.set(PLAYER_START_X, startY)
  }

  setFloating(v: boolean): void {
    this.floating = v
  }

  isAlive(): boolean {
    return this.alive
  }

  /** Called every fixed step. Adds upward velocity contribution while floating.
   * Rapier already integrates the world gravity, so we only need to add the
   * extra "float" acceleration here. Clamps |vy| to PLAYER_MAX_VY. */
  applyInput(fixedDt: number): void {
    if (!this.alive) return
    const lv = this.body.linvel()
    let vy = lv.y
    if (this.floating) vy -= FLOAT_ACCELERATION * fixedDt
    if (vy > PLAYER_MAX_VY) vy = PLAYER_MAX_VY
    if (vy < -PLAYER_MAX_VY) vy = -PLAYER_MAX_VY
    this.body.setLinvel({ x: 0, y: vy }, true)
  }

  /** Called per render frame to copy Rapier translation onto the sprite and
   * to drive the subtle angle wobble. */
  syncFromBody(deltaMs: number): void {
    if (!this.alive) return
    this.elapsedMs += deltaMs
    const t = this.body.translation()
    this.position.set(t.x, t.y)
    // 2 s yoyo from -5° to +5°, matching the original Phaser tween.
    const phase = (this.elapsedMs / 2000) * Math.PI * 2
    this.sprite.rotation = ((5 * Math.PI) / 180) * Math.sin(phase)
  }

  /** Position read-out for collision checks elsewhere. */
  get x(): number {
    return this.body.translation().x
  }
  override get y(): number {
    return this.body.translation().y
  }

  kill(): void {
    this.alive = false
    this.visible = false
    // Freeze the body so it stops being driven by gravity / our input.
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
  }

  /** Remove the body from the Rapier world. Pixi destroy is handled by the
   * parent container when the scene tears down. */
  removeFromWorld(world: RAPIER.World): void {
    world.removeRigidBody(this.body)
  }
}
