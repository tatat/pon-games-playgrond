import { Container, Graphics } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import { STAR_COUNT } from './constants'

interface Star {
  graphic: Graphics
  x: number
  /** 0..1 — higher = nearer = faster, bigger, brighter. Stays below the
   * block layer's speed so blocks read as the foreground. */
  depth: number
}

/** Parallax background: faint circles drifting left and wrapping to the right
 * edge, their speed scaled by the world scroll speed. Ported from
 * sticker-drift's Starfield to give rally-runner a sense of flowing motion. */
export class Starfield extends Container {
  private readonly stars: Star[] = []

  constructor(private readonly rng: Rng) {
    super()
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push(this.makeStar(rng.intRange(0, DESIGN_W)))
    }
  }

  private makeStar(x: number): Star {
    const depth = 0.2 + this.rng.next() * 0.6 // 0.2..0.8
    const size = 0.6 + depth * 1.8
    const alpha = 0.12 + depth * 0.5
    const g = new Graphics().circle(0, 0, size).fill({ color: 0xffffff, alpha })
    g.position.set(x, this.rng.intRange(0, DESIGN_H))
    this.addChild(g)
    return { graphic: g, x, depth }
  }

  /** Parallax against camera movement: when the camera advances by `cameraDx`
   * (world px, signed), stars shift the opposite way scaled by depth. Wraps in
   * both directions, so the field only moves when the player moves. */
  update(cameraDx: number): void {
    if (cameraDx === 0) return
    for (const star of this.stars) {
      star.x -= cameraDx * star.depth
      if (star.x < 0) {
        star.x += DESIGN_W
        star.graphic.position.y = this.rng.intRange(0, DESIGN_H)
      } else if (star.x > DESIGN_W) {
        star.x -= DESIGN_W
        star.graphic.position.y = this.rng.intRange(0, DESIGN_H)
      }
      star.graphic.position.x = star.x
    }
  }
}
