import { Container, Graphics } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'

interface Layer {
  speed: number
  stars: { graphic: Graphics; x: number; y: number }[]
}

const LAYERS: Array<{
  count: number
  size: number
  speed: number
  alphaMin: number
  alphaMax: number
}> = [
  // Tiny distant stars, very slow.
  { count: 200, size: 1, speed: 6, alphaMin: 0.2, alphaMax: 0.6 },
  // Medium midground.
  { count: 80, size: 2, speed: 16, alphaMin: 0.3, alphaMax: 0.7 },
  // Big foreground, fastest.
  { count: 20, size: 3, speed: 32, alphaMin: 0.5, alphaMax: 0.9 },
]

/** Three parallax layers of white circles drifting downward, wrapping at
 * the bottom. Simpler than sticker-drift's variant — no shooting stars,
 * fixed downward drift — but the same idea. Uses the scene's seeded RNG
 * so star placement is reproducible for a given seed. */
export class Starfield extends Container {
  private readonly layers: Layer[] = []

  constructor(private readonly rng: Rng) {
    super()
    for (const spec of LAYERS) {
      const layer: Layer = { speed: spec.speed, stars: [] }
      for (let i = 0; i < spec.count; i++) {
        const x = rng.intRange(0, DESIGN_W)
        const y = rng.intRange(0, DESIGN_H)
        const alpha = spec.alphaMin + rng.next() * (spec.alphaMax - spec.alphaMin)
        const g = new Graphics().circle(0, 0, spec.size).fill({ color: 0xffffff, alpha })
        g.position.set(x, y)
        this.addChild(g)
        layer.stars.push({ graphic: g, x, y })
      }
      this.layers.push(layer)
    }
  }

  /** Advance all layers by `dtSec * speed`, wrapping at the bottom. */
  update(dtSec: number): void {
    for (const layer of this.layers) {
      const dy = layer.speed * dtSec
      for (const star of layer.stars) {
        star.y += dy
        if (star.y > DESIGN_H) {
          star.y -= DESIGN_H
          star.x = this.rng.intRange(0, DESIGN_W)
          star.graphic.position.set(star.x, star.y)
        } else {
          star.graphic.position.y = star.y
        }
      }
    }
  }
}
