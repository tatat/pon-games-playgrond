import { Container, Graphics } from 'pixi.js'

const NUM_DEBRIS = 10
const DEBRIS_SPEED = 300
const DEBRIS_RADIUS = 16
const DEBRIS_DURATION_MS = 800

/** Mega-Man-style death effect: rings flying outward from (x, y) and fading.
 * Self-managed — `update(dt)` returns false once the effect is done. */
export class Debris extends Container {
  private readonly pieces: { g: Graphics; vx: number; vy: number }[] = []
  private elapsedMs = 0

  constructor(x: number, y: number) {
    super()
    this.position.set(x, y)
    for (let i = 0; i < NUM_DEBRIS; i++) {
      const angle = (i * 2 * Math.PI) / NUM_DEBRIS
      const g = new Graphics().circle(0, 0, DEBRIS_RADIUS).stroke({ color: 0xffffff, width: 3 })
      g.blendMode = 'add'
      this.pieces.push({
        g,
        vx: Math.cos(angle) * DEBRIS_SPEED,
        vy: Math.sin(angle) * DEBRIS_SPEED,
      })
      this.addChild(g)
    }
  }

  /** Returns true while the effect should keep updating, false once done. */
  update(dtMs: number): boolean {
    this.elapsedMs += dtMs
    const t = Math.min(this.elapsedMs / DEBRIS_DURATION_MS, 1)
    const alpha = 1 - t
    // Total fly-out distance in original: velocity * 1.5; that distance is
    // covered linearly across DEBRIS_DURATION_MS, so scale factor is 1.5 * t.
    const distScale = 1.5 * t
    for (const p of this.pieces) {
      p.g.position.set(p.vx * distScale, p.vy * distScale)
      p.g.alpha = alpha
    }
    return t < 1
  }
}
