import { Container, FillGradient, Graphics } from 'pixi.js'
import { Rng } from '../../engine/rng'
import {
  DESIGN_H,
  DESIGN_W,
  SKY_HORIZON_COLOR,
  SKY_TOP_COLOR,
  SKYLINE_FAR_COLOR,
  SKYLINE_MID_COLOR,
  SKYLINE_NEAR_COLOR,
  SUN_COLOR,
} from './constants'

/** One ruined-skyline layer: a band of broken buildings that scrolls at a
 * fraction of the world speed. Far layers move least (parallax = depth). */
interface LayerSpec {
  /** Fraction of world scroll this layer moves at (0 = static, 1 = with the
   * world). Smaller = farther away. */
  factor: number
  /** Silhouette colour (atmospheric perspective: far ≈ sky, near = darkest). */
  color: number
  /** Screen y the building bases sit on (taller-but-farther read by base too). */
  baseY: number
  /** Building height range (px). */
  minH: number
  maxH: number
  /** Building width range (px). */
  minW: number
  maxW: number
  /** Gap range between buildings (px). */
  minGap: number
  maxGap: number
  /** Max height a roof segment is eaten back by, for the crumbled top. */
  crumble: number
  /** Roof steps snap to multiples of this (px). Coarse = crisp blocky levels;
   * without it the steps land on arbitrary sub-pixel heights and read as noise
   * instead of deliberate broken floors. */
  step: number
  /** Share of buildings that are tall towers vs. low stumps (the mid height band
   * is left empty for contrast). Real skylines are mostly low with sparse
   * spikes, so far layers keep this low; near layers get the dramatic towers. */
  towerChance: number
  /** Fixed seed so the skyline is identical on every run. */
  seed: number
}

/** Back → front. The nearest layer is darkest and moves fastest (still well
 * under the world speed, so the foreground always reads as ahead of it). */
const LAYERS: LayerSpec[] = [
  {
    factor: 0.12,
    color: SKYLINE_FAR_COLOR,
    baseY: 560,
    minH: 50,
    maxH: 280,
    minW: 64,
    maxW: 150,
    // No gaps: the far layer is the backmost skyline, so any gap is a sky slit
    // that flickers as it scrolls — keep it a fully connected band.
    minGap: 0,
    maxGap: 0,
    crumble: 44,
    step: 16,
    towerChance: 0.16,
    seed: 0x5a17,
  },
  {
    factor: 0.26,
    color: SKYLINE_MID_COLOR,
    baseY: 596,
    minH: 120,
    maxH: 480,
    minW: 175,
    maxW: 350,
    minGap: 14,
    maxGap: 56,
    crumble: 86,
    step: 26,
    towerChance: 0.26,
    seed: 0x91c3,
  },
  {
    factor: 0.46,
    color: SKYLINE_NEAR_COLOR,
    baseY: 632,
    minH: 170,
    maxH: 600,
    minW: 270,
    maxW: 500,
    minGap: 90,
    maxGap: 220,
    crumble: 130,
    step: 38,
    towerChance: 0.34,
    seed: 0xd4e9,
  },
]

/** One screen of skyline; the tile repeats seamlessly via two drawn copies. */
const TILE_W = DESIGN_W

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

/** Draw one tile of broken buildings into `g`, left-to-right across [0, TILE_W],
 * offset by `dx`. Buildings never cross the tile's right edge, so drawing this
 * twice (dx = 0 and dx = TILE_W) is perfectly periodic → a seamless wrap. */
function drawSkylineTile(g: Graphics, spec: LayerSpec, dx: number): void {
  const rng = new Rng(spec.seed)
  let x = rng.intRange(0, spec.maxGap)
  while (x < TILE_W) {
    // Clamp the last building flush to the tile edge (rather than dropping it) so
    // the two tile copies join without a periodic sky slit at the seam.
    let w = rng.intRange(spec.minW, spec.maxW)
    if (x + w > TILE_W) w = TILE_W - x
    // Height contrast: split buildings into low stumps vs. tall towers (the mid
    // band is left empty), so the skyline reads as jagged ruins rather than a
    // uniform-height wall.
    const span = spec.maxH - spec.minH
    const h = rng.chance(spec.towerChance)
      ? Math.round(spec.minH + span * (0.6 + rng.next() * 0.4)) // tower: upper 60–100%
      : Math.round(spec.minH + span * (rng.next() * 0.32)) // stump: lower 0–32%
    const top = spec.baseY - h

    // Crumbled roofline: flat steps each eaten back to a discrete level (a whole
    // number of `step`s), so the silhouette reads as deliberate broken floors,
    // not sub-pixel noise. Most buildings are simple (1–2 steps); only a few are
    // heavily chewed, and the steps are split at random widths — uniform equal
    // steps on every building read as a mechanical comb. The body runs to the
    // screen bottom (DESIGN_H); `baseY` only sets the roofline, and the nearer
    // (darker) layers fill the lower screen, leaving no flat sky band.
    const levels = Math.max(1, Math.floor(spec.crumble / spec.step))
    const eat = (): number => top + rng.intRange(0, levels) * spec.step
    const r = rng.next()
    const segments = r < 0.4 ? 1 : r < 0.74 ? 2 : r < 0.92 ? 3 : 4
    const cuts: number[] = []
    for (let i = 1; i < segments; i++) cuts.push(rng.next())
    cuts.sort((a, b) => a - b)
    const edges = [0, ...cuts, 1]
    const pts: number[] = [dx + x, DESIGN_H]
    for (let s = 0; s < segments; s++) {
      const segTop = eat()
      pts.push(dx + x + w * (edges[s] ?? 0), segTop, dx + x + w * (edges[s + 1] ?? 1), segTop)
    }
    pts.push(dx + x + w, DESIGN_H)
    g.poly(pts)

    // Some towers keep a thin antenna/spire jutting from a ruined crown.
    if (rng.chance(0.28)) {
      const ax = dx + x + w * (0.25 + rng.next() * 0.5)
      const ah = rng.intRange(24, 70)
      g.rect(ax - 2, top - ah, 4, ah + spec.crumble)
    }

    x += w + rng.intRange(spec.minGap, spec.maxGap)
  }
  g.fill(spec.color)
}

/**
 * Parallax backdrop: a smog-dusk sky, a haze-dimmed sun, and three layers of
 * ruined-city skyline that scroll at fractions of the world speed to sell
 * forward motion. Fully deterministic (fixed per-layer seeds), purely
 * decorative — it reads `distance` each frame and never feeds the simulation.
 */
export class Background extends Container {
  private readonly layers: { view: Container; factor: number }[] = []

  constructor() {
    super()

    // Sky: a vertical gradient from a deep dusk top down to a smoggy horizon.
    const sky = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(
      new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: SKY_TOP_COLOR },
          { offset: 0.7, color: SKY_TOP_COLOR },
          { offset: 1, color: SKY_HORIZON_COLOR },
        ],
      }),
    )
    this.addChild(sky)

    // Stars: a fixed scatter across the upper sky, behind the orb and skylines
    // (which crop the lower field) so the night reads as deep. Static — real
    // stars are effectively at infinity, so they don't parallax with the run.
    const stars = new Graphics()
    const srng = new Rng(0x57a2)
    for (let i = 0; i < 140; i++) {
      const sx = srng.next() * DESIGN_W
      const sy = 12 + srng.next() * 470
      const big = srng.chance(0.14)
      const r = big ? 1.6 + srng.next() * 1.1 : 0.5 + srng.next()
      const a = (big ? 0.65 : 0.32) + srng.next() * 0.3
      const tint = srng.chance(0.16) ? 0xffe6c2 : srng.chance(0.3) ? 0xccd6ff : 0xffffff
      stars.circle(sx, sy, r).fill({ color: tint, alpha: a })
    }
    this.addChild(stars)

    // A vast, low orb (a swollen sun/moon) looming over the dead city — its
    // sheer scale sells the uncanny, post-human feel. It sits behind the
    // skylines, so the ruins crop its lower half and it reads as hanging just
    // beyond the horizon. An opaque body occludes the stars behind it; the
    // outer rings fade out for a soft, haloed edge.
    const orb = new Graphics()
    const orbX = DESIGN_W * 0.68
    const orbY = 430
    orb.circle(orbX, orbY, 520).fill({ color: SUN_COLOR, alpha: 0.05 })
    orb.circle(orbX, orbY, 400).fill({ color: SUN_COLOR, alpha: 0.08 })
    orb.circle(orbX, orbY, 320).fill({ color: SUN_COLOR, alpha: 0.18 })
    orb.circle(orbX, orbY, 272).fill({ color: 0xd0a074, alpha: 1 }) // opaque body
    orb.circle(orbX, orbY - 46, 188).fill({ color: 0xdcb183, alpha: 0.18 }) // faint top highlight
    this.addChild(orb)

    // Skyline layers, far → near. Each is a container holding one Graphics with
    // two tile copies; scrolling is a cheap container.x shift (no per-frame
    // redraw), wrapped by modulo for an endless seam-free city.
    for (const spec of LAYERS) {
      const view = new Container()
      const g = new Graphics()
      drawSkylineTile(g, spec, 0)
      drawSkylineTile(g, spec, TILE_W)
      view.addChild(g)
      this.addChild(view)
      this.layers.push({ view, factor: spec.factor })
    }
  }

  /** Scroll each layer to match the run's travelled `distance` (px). Pure
   * function of distance, so it stays in lockstep with the deterministic course
   * and every run looks identical at the same distance. */
  update(distance: number): void {
    for (const { view, factor } of this.layers) {
      view.x = -mod(distance * factor, TILE_W)
    }
  }
}
