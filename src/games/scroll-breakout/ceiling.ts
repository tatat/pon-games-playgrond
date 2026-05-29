import { Container, Graphics } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import {
  CEILING_BAND_H,
  CEILING_CHEVRON_DEPTH,
  CEILING_COLORS,
  CEILING_PULSE_MS,
  CEILING_TILE_W,
  CEILING_Y,
} from './constants'

/** A solid band along the top edge, sliced into ">"-shaped slabs whose seams
 * interlock (each slab's right edge is a chevron point, its left edge the
 * matching notch). The two slab colours swap every CEILING_PULSE_MS (ABAB ⇄
 * BABA) so the chevrons read as flowing right. White-base, recoloured by tint. */
export class Ceiling extends Container {
  private readonly slabs: Graphics[] = []
  private elapsedMs = 0
  private phase = 0

  constructor() {
    super()
    this.y = CEILING_Y
    const w = CEILING_TILE_W
    const h = CEILING_BAND_H
    const d = CEILING_CHEVRON_DEPTH
    // One extra slab past each edge so the interlocking points never reveal a gap.
    const count = Math.ceil(DESIGN_W / w) + 2
    for (let i = 0; i < count; i++) {
      // top edge → right ">" point → bottom edge → left ">" notch.
      const g = new Graphics().poly([0, 0, w, 0, w + d, h / 2, w, h, 0, h, d, h / 2]).fill(0xffffff)
      g.x = (i - 1) * w
      this.slabs.push(g)
      this.addChild(g)
    }
    this.recolor()
  }

  update(dtMs: number): void {
    this.elapsedMs += dtMs
    if (this.elapsedMs < CEILING_PULSE_MS) return
    // Catch up if several intervals elapsed in one frame (e.g. after a stall).
    const steps = Math.floor(this.elapsedMs / CEILING_PULSE_MS)
    this.elapsedMs -= steps * CEILING_PULSE_MS
    this.phase = (this.phase + steps) % CEILING_COLORS.length
    this.recolor()
  }

  private recolor(): void {
    const n = CEILING_COLORS.length
    for (const [i, g] of this.slabs.entries()) {
      g.tint = CEILING_COLORS[(i + this.phase) % n] ?? 0xffffff
    }
  }
}
