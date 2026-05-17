import { Container, Sprite, type Texture } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import {
  HOMING_PROBABILITY,
  HOMING_SPEED_MAX,
  HOMING_SPEED_MIN,
  OBSTACLE_RADIUS_RATIO,
  OBSTACLE_SIZE_MAX,
  OBSTACLE_SIZE_MIN,
  OBSTACLE_SPEED_MAX,
  OBSTACLE_SPEED_MIN,
} from './constants'
import { homingAcceleration } from './homing'

const SPIN_PER_SECOND = 100 // degrees/sec, matches -100..100 angular range

/** A flying obstacle. Plain JS physics — no Rapier body. Velocity is updated
 * each step; homing variants accelerate vertically toward the player. */
export class Obstacle extends Container {
  private vx: number
  private vy: number
  private readonly radius: number
  private readonly isHoming: boolean
  private readonly homingSpeed: number
  private readonly spinPerSecond: number

  constructor(args: {
    rng: Rng
    getTexture: (alias: string) => Texture
    playerX: number
    playerY: number
    gameSpeed: number
  }) {
    super()
    const { rng, getTexture, playerX, playerY, gameSpeed } = args

    const stickerName = rng.pick(['d2', 'r1', 'r2', 't1', 't2'])
    const targetSize = rng.intRange(OBSTACLE_SIZE_MIN, OBSTACLE_SIZE_MAX)
    const imageSize = targetSize <= 64 ? 64 : 96
    const texture = getTexture(`${stickerName}-${imageSize}`)

    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    // Pixi reports `texture.width` at the @2x logical size (= imageSize), so
    // `targetSize / imageSize` matches the Phaser source's effective scaling.
    sprite.scale.set(targetSize / imageSize)
    this.addChild(sprite)

    this.radius = targetSize * OBSTACLE_RADIUS_RATIO

    // Spawn off the right edge at a random Y, then aim straight at the player.
    const startX = DESIGN_W + 100
    const startY = rng.intRange(50, DESIGN_H - 50)
    this.position.set(startX, startY)

    const speed = rng.intRange(OBSTACLE_SPEED_MIN, OBSTACLE_SPEED_MAX) * gameSpeed
    const angle = Math.atan2(playerY - startY, playerX - startX)
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.spinPerSecond = rng.intRange(-SPIN_PER_SECOND, SPIN_PER_SECOND)

    this.isHoming = rng.chance(HOMING_PROBABILITY)
    this.homingSpeed = this.isHoming ? rng.intRange(HOMING_SPEED_MIN, HOMING_SPEED_MAX) : 0
  }

  update(dtSec: number, playerY: number, gameSpeed: number): void {
    if (this.isHoming) {
      const a = homingAcceleration({
        obstacleY: this.position.y,
        playerY,
        currentVy: this.vy,
        homingSpeed: this.homingSpeed,
        gameSpeed,
      })
      this.vy += a * dtSec
    }
    this.position.x += this.vx * dtSec
    this.position.y += this.vy * dtSec
    this.rotation += ((this.spinPerSecond * Math.PI) / 180) * dtSec
  }

  /** Obstacle is far enough off-screen that it's safe to free. */
  isOffScreen(): boolean {
    return this.position.x < -150
  }

  /** Circle-circle collision against the player at (px, py) with `playerRadius`. */
  collidesWith(px: number, py: number, playerRadius: number): boolean {
    const dx = this.position.x - px
    const dy = this.position.y - py
    const r = this.radius + playerRadius
    return dx * dx + dy * dy < r * r
  }
}
