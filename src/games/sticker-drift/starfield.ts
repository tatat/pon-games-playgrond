import { Container, Graphics } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import { STAR_COUNT } from './constants'

/** Background parallax: STAR_COUNT individual circles that scroll left and
 * wrap to the right edge at a Y picked by the seeded RNG. */
export class Starfield extends Container {
  private readonly stars: { graphic: Graphics; x: number; y: number }[] = []

  constructor(private readonly rng: Rng) {
    super()
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = rng.intRange(0, DESIGN_W)
      const y = rng.intRange(0, DESIGN_H)
      const size = 1 + rng.next() * 2
      const alpha = 0.2 + rng.next() * 0.6
      const g = new Graphics().circle(0, 0, size).fill({ color: 0xffffff, alpha })
      g.position.set(x, y)
      this.stars.push({ graphic: g, x, y })
      this.addChild(g)
    }
  }

  /** Scroll all stars leftward; wrap each off-screen star back to the right. */
  update(dt: number, gameSpeed: number): void {
    const dx = 2 * gameSpeed * 60 * dt // matches original "2 * gameSpeed" per frame at 60Hz
    for (const star of this.stars) {
      star.x -= dx
      if (star.x < 0) {
        star.x = DESIGN_W
        star.y = this.rng.intRange(0, DESIGN_H)
        star.graphic.position.set(star.x, star.y)
      } else {
        star.graphic.position.x = star.x
      }
    }
  }
}
