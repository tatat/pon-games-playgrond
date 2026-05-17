import { Container, Graphics } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { WALL_HEIGHT, WALL_STRIPE_WIDTH } from './constants'

const YELLOW = 0xffdd33
const BLACK = 0x111111

/** Top + bottom hazard walls, drawn as diagonal yellow/black stripes. */
export class Walls extends Container {
  constructor() {
    super()
    this.zIndex = 10
    this.addChild(this.makeStrip(0))
    this.addChild(this.makeStrip(DESIGN_H - WALL_HEIGHT))
  }

  private makeStrip(topY: number): Graphics {
    const g = new Graphics()
    for (let x = -WALL_HEIGHT; x < DESIGN_W + WALL_HEIGHT; x += WALL_STRIPE_WIDTH * 2) {
      // Yellow chevron
      g.poly([
        x,
        topY,
        x + WALL_STRIPE_WIDTH,
        topY,
        x + WALL_STRIPE_WIDTH + WALL_HEIGHT,
        topY + WALL_HEIGHT,
      ]).fill(YELLOW)
      g.poly([
        x,
        topY,
        x + WALL_HEIGHT,
        topY + WALL_HEIGHT,
        x + WALL_STRIPE_WIDTH + WALL_HEIGHT,
        topY + WALL_HEIGHT,
      ]).fill(YELLOW)

      // Black chevron
      g.poly([
        x + WALL_STRIPE_WIDTH,
        topY,
        x + WALL_STRIPE_WIDTH * 2,
        topY,
        x + WALL_STRIPE_WIDTH * 2 + WALL_HEIGHT,
        topY + WALL_HEIGHT,
      ]).fill(BLACK)
      g.poly([
        x + WALL_STRIPE_WIDTH,
        topY,
        x + WALL_STRIPE_WIDTH + WALL_HEIGHT,
        topY + WALL_HEIGHT,
        x + WALL_STRIPE_WIDTH * 2 + WALL_HEIGHT,
        topY + WALL_HEIGHT,
      ]).fill(BLACK)
    }
    return g
  }
}

/** True when the player's center (with `radius`) overlaps either wall. */
export function playerHitsWall(playerY: number, radius: number): boolean {
  return playerY - radius <= WALL_HEIGHT || playerY + radius >= DESIGN_H - WALL_HEIGHT
}
