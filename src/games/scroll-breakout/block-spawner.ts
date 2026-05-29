import type RAPIER from '@dimforge/rapier2d-compat'
import { Assets, type Container } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import type { Rng } from '../../engine/rng'
import { Block } from './block'
import {
  BLOCK_AREA_BOTTOM,
  BLOCK_AREA_TOP,
  BLOCK_COLUMN_GAP,
  BLOCK_CULL_BEHIND,
  BLOCK_GAP_Y,
  BLOCK_H,
  BLOCK_SIZE_MIN,
  BLOCK_SPAWN_AHEAD,
  BRICK_NAMES,
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

  constructor(
    private readonly world: RAPIER.World,
    private readonly parent: Container,
    callbacks: BlockSpawnerCallbacks = {},
  ) {
    this.callbacks = callbacks
  }

  /** Generate columns until the frontier is past the right view edge. */
  ensureAhead(cameraX: number, rng: Rng): void {
    const limit = cameraX + DESIGN_W + BLOCK_SPAWN_AHEAD
    while (this.frontierX < limit) {
      this.spawnColumnAt(this.frontierX, rng)
      this.frontierX += BLOCK_COLUMN_GAP
    }
  }

  /** Destroy blocks that have scrolled well behind the left view edge. */
  cullBehind(cameraX: number): void {
    const cutoff = cameraX - BLOCK_CULL_BEHIND
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i]
      if (b && b.centerX < cutoff) this.destroyBlock(b)
    }
  }

  /** A column of blocks at world x `cx`, random rows filled with clear lanes. */
  private spawnColumnAt(cx: number, rng: Rng): void {
    // Fill roughly 30-55% of rows so the ball has clear lanes to navigate.
    const minFill = Math.max(1, Math.floor(TOTAL_ROWS * 0.3))
    const maxFill = Math.max(1, Math.floor(TOTAL_ROWS * 0.55))
    const fillCount = rng.intRange(minFill, maxFill)

    const rows = Array.from({ length: TOTAL_ROWS }, (_, i) => i)
    // Fisher-Yates shuffle, take first fillCount.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = rng.intRange(0, i)
      const tmp = rows[i]
      const swapped = rows[j]
      if (tmp !== undefined && swapped !== undefined) {
        rows[i] = swapped
        rows[j] = tmp
      }
    }

    for (let r = 0; r < fillCount; r++) {
      const row = rows[r]
      if (row === undefined) continue

      // Random sticker + a freely-varied display size in [MIN, BLOCK_H]; the
      // texture is the nearest available asset resolution for that size.
      const name = rng.pick(BRICK_NAMES)
      const displayBase = rng.intRange(BLOCK_SIZE_MIN, BLOCK_H)
      const assetSize = SCROLL_BRICK_SIZES.reduce((best, s) =>
        Math.abs(s - displayBase) < Math.abs(best - displayBase) ? s : best,
      )
      const texture = Assets.get(`scroll-brick-${name}-${assetSize}`)
      if (!texture) continue

      // displayBase ≤ BLOCK_H so a block always fits inside its row cell
      // (ROW_HEIGHT = BLOCK_H + gap) and never overlaps its neighbours.
      const aspect = texture.width / texture.height
      const { width, height } = sizeForAspect(displayBase, aspect)

      const cy = BLOCK_AREA_TOP + row * ROW_HEIGHT + BLOCK_H / 2
      const block = new Block(this.world, texture, cx, cy, width, height)
      this.parent.addChild(block)
      this.blocks.push(block)
      this.callbacks.onBlockAdded?.(block)
    }
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

  clear(): void {
    for (const b of [...this.blocks]) this.destroyBlock(b)
  }
}
