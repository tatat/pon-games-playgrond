import type RAPIER from '@dimforge/rapier2d-compat'
import { Assets, type Container } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import { Block } from './block'
import {
  BLOCK_AREA_BOTTOM,
  BLOCK_AREA_TOP,
  BLOCK_COLUMN_GAP,
  BLOCK_COLUMN_GAP_MIN,
  BLOCK_CULL_BEHIND,
  BLOCK_GAP_Y,
  BLOCK_H,
  BLOCK_JITTER,
  BLOCK_ROW_STAGGER_X,
  BLOCK_SIZE_MIN,
  BLOCK_SPAWN_AHEAD,
  BRICK_NAMES,
  DIFFICULTY_RAMP_DISTANCE,
  SCROLL_BRICK_SIZES,
} from './constants'

export interface BlockSpawnerCallbacks {
  onBlockAdded?(block: Block): void
  onBlockRemoved?(block: Block): void
}

const ROW_HEIGHT = BLOCK_H + BLOCK_GAP_Y
const TOTAL_ROWS = Math.floor((BLOCK_AREA_BOTTOM - BLOCK_AREA_TOP) / ROW_HEIGHT)
/** First column starts ~4/5 across the opening screen, leaving the near 4/5
 * (where the avatar and start/aim text sit) clear so nothing overlaps the text. */
const FIRST_COLUMN_X = DESIGN_W * 0.8

/** Hand-authored column shapes (filled row indices, 0 = top) instead of random
 * scatter, so each column reads as deliberate with an obvious lane. Ordered
 * easy → hard (block count) — the difficulty ramp widens the pickable range.
 * Indices beyond TOTAL_ROWS are ignored, so this degrades gracefully if the row
 * count changes. */
const COLUMN_PATTERNS: readonly (readonly number[])[] = [
  [0], // lone top
  [3], // lone bottom
  [0, 1], // high wall — lane along the bottom
  [2, 3], // low wall — lane along the top
  [1, 2], // mid bar — lanes top and bottom
  [0, 3], // pincer — lane through the middle
  [0, 1, 2], // tall stack from the top — only the bottom open
  [1, 2, 3], // tall stack from the bottom — only the top open
]
/** Highest pattern index pickable at difficulty 0 (only the 1–2 block shapes);
 * the ramp raises the ceiling toward the full set. */
const EASY_PATTERN_HI = 3

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
/** 0 (easiest) at the first column, ramping to 1 over DIFFICULTY_RAMP_DISTANCE. */
const difficultyAt = (x: number): number => clamp01((x - FIRST_COLUMN_X) / DIFFICULTY_RAMP_DISTANCE)

/** Derive display {width, height} for a texture at a given baseSize,
 * matching breakout-clone's sizeForAspect logic. */
function sizeForAspect(baseSize: number, aspect: number): { width: number; height: number } {
  if (aspect >= 1) return { width: baseSize, height: baseSize / aspect }
  return { width: baseSize * aspect, height: baseSize }
}

/** Blocks live at fixed world positions; the camera scrolls past them.
 * Columns are generated lazily ahead of the camera frontier and culled once
 * they fall well behind it. */
export class BlockSpawner {
  readonly blocks: Block[] = []
  private readonly callbacks: BlockSpawnerCallbacks
  /** World x of the next column to generate. */
  private frontierX = FIRST_COLUMN_X
  /** Index of the previous column's pattern, to avoid repeating it. */
  private lastPattern = -1

  constructor(
    private readonly world: RAPIER.World,
    private readonly parent: Container,
    callbacks: BlockSpawnerCallbacks = {},
  ) {
    this.callbacks = callbacks
  }

  /** Generate columns until the frontier is past the right view edge. Column
   * spacing tightens with distance as the difficulty ramps. */
  ensureAhead(cameraX: number, rng: Rng): void {
    const limit = cameraX + DESIGN_W + BLOCK_SPAWN_AHEAD
    while (this.frontierX < limit) {
      this.spawnColumnAt(this.frontierX, rng)
      const gap = lerp(BLOCK_COLUMN_GAP, BLOCK_COLUMN_GAP_MIN, difficultyAt(this.frontierX))
      this.frontierX += gap
    }
  }

  /** Queue every block's bob target before the physics step. */
  bobAll(timeSec: number): void {
    for (const b of this.blocks) b.bob(timeSec)
  }

  /** Sync every block's view to its body after the physics step. */
  syncViews(): void {
    for (const b of this.blocks) b.syncView()
  }

  /** Destroy blocks that have scrolled well behind the left view edge. */
  cullBehind(cameraX: number): void {
    const cutoff = cameraX - BLOCK_CULL_BEHIND
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i]
      if (b && b.centerX < cutoff) this.destroyBlock(b)
    }
  }

  /** A column of blocks at world x `cx`, shaped by a deliberate pattern (not a
   * random scatter), avoiding an immediate repeat. The pickable pattern range
   * widens with distance, so fuller/harder shapes appear as you progress. */
  private spawnColumnAt(cx: number, rng: Rng): void {
    const hi = Math.round(lerp(EASY_PATTERN_HI, COLUMN_PATTERNS.length - 1, difficultyAt(cx)))
    let p = rng.intRange(0, hi)
    if (p === this.lastPattern) p = p >= hi ? 0 : p + 1
    this.lastPattern = p
    const pattern = COLUMN_PATTERNS[p]
    if (!pattern) return
    // Don't repeat a sticker within the same column.
    const usedNames = new Set<string>()
    for (const row of pattern) {
      if (row < TOTAL_ROWS) this.spawnBlockAt(cx, row, rng, usedNames)
    }
  }

  /** One block at column `cx`, row `row`, with a random sticker (distinct from
   * others already in this column) and a freely varied display size. */
  private spawnBlockAt(cx: number, row: number, rng: Rng, usedNames: Set<string>): void {
    const available = BRICK_NAMES.filter((n) => !usedNames.has(n))
    const name = rng.pick(available.length > 0 ? available : BRICK_NAMES)
    usedNames.add(name)
    const displayBase = rng.intRange(BLOCK_SIZE_MIN, BLOCK_H)
    // Nearest available asset resolution for that size.
    const assetSize = SCROLL_BRICK_SIZES.reduce((best, s) =>
      Math.abs(s - displayBase) < Math.abs(best - displayBase) ? s : best,
    )
    const texture = Assets.get(`scroll-brick-${name}-${assetSize}`)
    if (!texture) return

    // displayBase ≤ BLOCK_H so a block always fits inside its row cell
    // (ROW_HEIGHT = BLOCK_H + gap) and never overlaps its neighbours.
    const aspect = texture.width / texture.height
    const { width, height } = sizeForAspect(displayBase, aspect)

    // Jitter off the grid: X freely, Y only within the cell's spare room.
    const slackY = Math.max(0, Math.floor((ROW_HEIGHT - height) / 2))
    const jx = rng.intRange(-BLOCK_JITTER, BLOCK_JITTER)
    const jy = rng.intRange(-Math.min(BLOCK_JITTER, slackY), Math.min(BLOCK_JITTER, slackY))

    // Per-row horizontal stagger so the column's blocks don't line up vertically.
    const staggerX = row * BLOCK_ROW_STAGGER_X
    const cy = BLOCK_AREA_TOP + row * ROW_HEIGHT + BLOCK_H / 2 + jy
    const block = new Block(this.world, texture, cx + staggerX + jx, cy, width, height)
    this.parent.addChild(block)
    this.blocks.push(block)
    this.callbacks.onBlockAdded?.(block)
  }

  destroyBlock(block: Block): void {
    this.callbacks.onBlockRemoved?.(block)
    block.removeFromWorld(this.world)
    this.parent.removeChild(block)
    block.destroy({ children: true })
    const idx = this.blocks.indexOf(block)
    if (idx >= 0) this.blocks.splice(idx, 1)
  }

  /** Remove a block from the simulation (body + tracking) but leave its view in
   * the scene so the caller can play a burst animation, then destroy it. */
  detachBlock(block: Block): void {
    this.callbacks.onBlockRemoved?.(block)
    block.removeFromWorld(this.world)
    const idx = this.blocks.indexOf(block)
    if (idx >= 0) this.blocks.splice(idx, 1)
  }

  /** Clear all blocks and rewind to the start, e.g. to rebuild with a new seed. */
  reset(): void {
    this.clear()
    this.frontierX = FIRST_COLUMN_X
    this.lastPattern = -1
  }

  clear(): void {
    for (const b of [...this.blocks]) this.destroyBlock(b)
  }
}
