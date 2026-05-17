import type RAPIER from '@dimforge/rapier2d-compat'
import { Assets, type Container } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import { Brick } from './brick'
import { BRICK_AREA_HEIGHT, BRICK_AREA_MARGIN, BRICK_NAMES, BRICK_SIZES } from './constants'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const SIZE_WEIGHTS: Array<{ size: number; weight: number }> = [
  { size: 64, weight: 30 },
  { size: 96, weight: 25 },
  { size: 128, weight: 20 },
  { size: 160, weight: 12 },
  { size: 192, weight: 8 },
  { size: 224, weight: 3 },
  { size: 256, weight: 2 },
]

const BRICK_AREA_TOP = 80
const BRICK_MARGIN = 8

export interface BrickGeneratorCallbacks {
  /** Called once when a brick is added to the world. Receivers typically
   * index it (e.g. collider handle → brick) for contact lookup. */
  onBrickAdded?(brick: Brick): void
  onBrickRemoved?(brick: Brick): void
}

/** Random-pack brick spawner — port of the Phaser BrickGenerator. Uses the
 * scene's seeded RNG so a given run is reproducible. */
export class BrickGenerator {
  private readonly aspect = new Map<string, number>()
  private readonly occupied = new Map<Brick, Rect>()
  private readonly callbacks: BrickGeneratorCallbacks
  readonly bricks: Brick[] = []

  constructor(
    private readonly world: RAPIER.World,
    private readonly parent: Container,
    private readonly rng: Rng,
    callbacks: BrickGeneratorCallbacks = {},
  ) {
    this.callbacks = callbacks
    for (const name of BRICK_NAMES) {
      const tex = Assets.get(`brick-${name}-64`)
      if (!tex) continue
      this.aspect.set(name, tex.width / tex.height)
    }
  }

  /** Pack as many bricks as fit into the brick area without overlap. */
  generateInitial(): void {
    const maxAttempts = 2000
    const maxConsecutiveFailures = 100
    let attempts = 0
    let consecutiveFailures = 0
    while (attempts < maxAttempts && consecutiveFailures < maxConsecutiveFailures) {
      attempts++
      if (this.tryAddOne()) consecutiveFailures = 0
      else consecutiveFailures++
    }
  }

  /** Single best-effort spawn during gameplay. Returns true if placed. */
  addOne(): boolean {
    const maxAttempts = 100
    for (let i = 0; i < maxAttempts; i++) {
      if (this.tryAddOne()) return true
    }
    return false
  }

  destroyBrick(brick: Brick): void {
    this.callbacks.onBrickRemoved?.(brick)
    brick.removeFromWorld(this.world)
    this.parent.removeChild(brick)
    brick.destroy({ children: true })
    this.occupied.delete(brick)
    const bIdx = this.bricks.indexOf(brick)
    if (bIdx >= 0) this.bricks.splice(bIdx, 1)
  }

  clear(): void {
    // Snapshot the array — destroyBrick mutates `this.bricks` while we iterate.
    for (const b of [...this.bricks]) this.destroyBrick(b)
  }

  get count(): number {
    return this.bricks.length
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private tryAddOne(): boolean {
    const name = this.rng.pick(BRICK_NAMES)
    const aspect = this.aspect.get(name)
    if (aspect === undefined) return false

    const baseSize = this.weightedRandomSize()
    const { width, height } = sizeForAspect(baseSize, aspect)

    const areaX = BRICK_AREA_MARGIN
    const areaY = BRICK_AREA_TOP
    const areaW = DESIGN_W - BRICK_AREA_MARGIN * 2
    const areaH = BRICK_AREA_HEIGHT

    const x = this.rng.intRange(0, Math.max(0, Math.floor(areaW - width))) + areaX
    const y = this.rng.intRange(0, Math.max(0, Math.floor(areaH - height))) + areaY

    const candidate: Rect = { x, y, width, height }
    if (this.overlapsAny(candidate)) return false

    const sizeKey = nearestAvailableSize(baseSize)
    const texture = Assets.get(`brick-${name}-${sizeKey}`)
    if (!texture) return false

    const brick = new Brick({
      world: this.world,
      texture,
      centerX: x + width / 2,
      centerY: y + height / 2,
      width,
      height,
      baseSize,
    })
    this.parent.addChild(brick)
    this.bricks.push(brick)
    this.occupied.set(brick, candidate)
    this.callbacks.onBrickAdded?.(brick)
    return true
  }

  private weightedRandomSize(): number {
    const total = SIZE_WEIGHTS.reduce((sum, w) => sum + w.weight, 0)
    let r = this.rng.next() * total
    for (const w of SIZE_WEIGHTS) {
      r -= w.weight
      if (r <= 0) return w.size
    }
    return SIZE_WEIGHTS[0]?.size ?? 64
  }

  private overlapsAny(candidate: Rect): boolean {
    const m = BRICK_MARGIN
    const a = {
      x: candidate.x - m,
      y: candidate.y - m,
      width: candidate.width + m * 2,
      height: candidate.height + m * 2,
    }
    for (const b of this.occupied.values()) {
      if (
        !(
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        )
      ) {
        return true
      }
    }
    return false
  }
}

function sizeForAspect(baseSize: number, aspect: number): { width: number; height: number } {
  if (aspect >= 1) return { width: baseSize, height: baseSize / aspect }
  return { width: baseSize * aspect, height: baseSize }
}

function nearestAvailableSize(target: number): number {
  // BRICK_SIZES is a tuple of literal types; widen to number for accumulator.
  let best: number = BRICK_SIZES[0]
  let diff = Math.abs(target - best)
  for (const s of BRICK_SIZES) {
    const d = Math.abs(target - s)
    if (d < diff) {
      diff = d
      best = s
    }
  }
  return best
}
