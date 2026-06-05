import { Rng } from '../../engine/rng'
import type { Section, SectionSource } from './course'
import { ceiling, coin, hazard, ledge, pit, terrain } from './grid-authoring'
import type { Block } from './obstacles'

// Seeded generative course source. There is NO catalogue of pre-shaped pieces —
// the terrain is a left-to-right walk that edits one running surface height cell by
// cell, and coins/hazards are derived from the shape that walk produces. Hills,
// walls, valleys, pits and tunnels are not "primitives" picked from a bag; they
// EMERGE from sequences of local moves, so two runs of the same feature are never
// the same shape (see docs/hime-run-stage-select-plan.md "Random generation").
//
// Solvability is an invariant of the walk, not a property borrowed from hand-tuned
// data: every move is constrained to stay inside the measured jump reach, so any
// reachable sequence is clearable. The binding cases (from constants.ts):
//   • a vertical wall (an up-step between adjacent surface columns) ≤4 cells — the
//     double jump's ceiling; ≤2 takes a single jump.
//   • a gap of empty columns ≤3 — one jump carries ≈3.3 cells at SPEED_START (the
//     slowest, shortest-reach case); wider holes are bridged by ledge stepping
//     stones so no sub-gap exceeds 3.
//   • the surface stays within a [HMIN, HMAX] band the camera and a climb-back can
//     both reach.
// Difficulty is NOT scaled by distance here — the runner's speed ramp carries the
// escalation. What this source adds is TEXTURE: an `intensity` that drifts in a
// bounded random walk so the stream breathes between calm, sparse stretches and
// busy, demanding ones, instead of a flat uniform shuffle.

/** Seed the random entry starts on when nothing is persisted — a fixed value so a
 * first-ever visit is reproducible. */
export const DEFAULT_RANDOM_SEED = 1

/** Surface-height band (cells, ground-relative). The top sits a double jump above
 * ground; the floor is a shallow valley a climb-back can recover from. */
const HMAX = 6
const HMIN = -4
/** A single jump clears ≤2 cells; the double jump clears ≤4 (a "wall"). */
const STEP_MAX = 2
const WALL_MAX = 4
/** A bare gap is bounded by the slowest speed's jump reach. */
const GAP_MAX = 3

/** Mutable state of the section being walked. `cols[x]` is the surface height at
 * column `x`, or `null` where the floor is open (a gap). Overlays sit on top of
 * that profile; coins are emitted as finished blocks as features are laid down. */
interface Seg {
  cols: (number | null)[]
  ledges: { x: number; top: number }[]
  ceilings: { x: number; w: number; clear: number }[]
  hazards: { x: number; top: number }[]
  coins: Block[]
  /** The surface height the walk currently sits at. */
  h: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * Generates an endless solvable course from a seed. Deterministic: same seed → the
 * same blocks. The first `next()` is a guaranteed-flat opener; every call after
 * walks one continuous section, carrying the surface height across the seam so
 * sections flow into one another instead of resetting to flat ground.
 */
export class RandomSource implements SectionSource {
  private readonly rng: Rng
  /** Surface height carried across section seams, so the terrain is continuous. */
  private surface = 0
  /** 0..1 calm→busy. A bounded random walk per section gives breathing waves. */
  private intensity = 0.25
  private started = false

  constructor(seed: number) {
    this.rng = new Rng(seed)
  }

  next(): Section {
    if (!this.started) {
      this.started = true
      return this.opener()
    }
    return this.buildSection()
  }

  /** One-time flat opener wide enough to cover the start screen under the runner —
   * a fresh run always begins on bare safe ground (no coins on the start screen). */
  private opener(): Section {
    const width = 14
    this.surface = 0
    return { name: 'rnd-open', width, blocks: [terrain(0, width, 0)] }
  }

  private buildSection(): Section {
    // Breathe: drift intensity in a bounded random walk → calm/busy waves.
    this.intensity = clamp(this.intensity + this.rng.next() * 0.4 - 0.2, 0.12, 0.95)
    const seg: Seg = { cols: [], ledges: [], ceilings: [], hazards: [], coins: [], h: this.surface }
    const target = this.rng.intRange(18, 28)
    // Leading approach run: continues the carried surface so the seam stays solid.
    this.runMove(seg, 2)
    while (seg.cols.length < target) this.chooseMove(seg)
    // Trailing solid landing so the next section's seam meets solid ground.
    this.runMove(seg, this.rng.intRange(2, 3))
    this.surface = seg.h
    return { name: 'rnd', width: seg.cols.length, blocks: this.emit(seg) }
  }

  /** Pick and run one move, weighting the legal options by intensity. */
  private chooseMove(seg: Seg): void {
    const t = this.intensity
    const h = seg.h
    const cands: { w: number; run: () => void }[] = []
    // Connective flat run — the breather; longer and more common when calm. A
    // breather belongs near the ground, so it is rarer up high (a plateau resolves
    // into a descent instead of running on flat forever).
    cands.push({
      w: h <= 2 ? 2.5 : 1.3,
      run: () => this.runMove(seg, this.rng.intRange(2, t < 0.4 ? 6 : 4), 0.22),
    })
    // Gentle single-jump step, the workhorse that makes terrain roll. Mean-reverts
    // toward a low comfortable band: the higher the surface sits, the likelier the
    // step is down, so the walk undulates instead of ratcheting to an extreme.
    const canUp = h + STEP_MAX <= HMAX
    const canDown = h - STEP_MAX >= HMIN
    if (canUp || canDown) {
      cands.push({
        w: 2.0,
        run: () => {
          const pUp = clamp(0.55 - h * 0.13, 0.12, 0.9)
          const up = canUp && (!canDown || this.rng.chance(pUp))
          // Climbs are single-jump rises (≤2); drops are free, so they can fall
          // further — a deeper cliff descends a plateau in one go.
          const d = up
            ? this.rng.intRange(1, STEP_MAX)
            : this.rng.intRange(1, Math.min(3, h - HMIN))
          this.stepMove(seg, up, d)
        },
      })
    }
    // Hazard hop on flat ground, with a coin arc tempting the jump.
    cands.push({ w: 0.4 + t * 1.1, run: () => this.hazardMove(seg) })
    // Double-jump wall (3–4 cells). Only where the band has room above.
    if (h + 3 <= HMAX) {
      cands.push({
        w: 0.3 + t * 1.2,
        run: () => this.stepMove(seg, true, this.rng.intRange(3, Math.min(WALL_MAX, HMAX - h))),
      })
    }
    // Gaps and tunnels only at/above ground (the lethal pit sits below the surface,
    // and a tunnel's roof must clear the runner's head).
    if (h >= 0) {
      // Holes read best near ground level; up on a plateau they just pock it.
      const gapW = (0.4 + t * 1.3) * (h <= 2 ? 1 : 0.35)
      cands.push({ w: gapW, run: () => this.gapMove(seg, this.rng.intRange(2, GAP_MAX)) })
      cands.push({ w: t * 1.0, run: () => this.bridgedGapMove(seg, this.rng.intRange(5, 9)) })
      if (h <= 3)
        cands.push({ w: 0.6 + t * 0.6, run: () => this.tunnelMove(seg, this.rng.intRange(4, 6)) })
    }
    this.weightedPick(cands)()
  }

  private weightedPick<T>(cands: { w: number; run: T }[]): T {
    const total = cands.reduce((s, c) => s + c.w, 0)
    let r = this.rng.next() * total
    for (const c of cands) {
      r -= c.w
      if (r < 0) return c.run
    }
    return (cands[cands.length - 1] as { w: number; run: T }).run
  }

  /** Flat ground at the current height for `len` columns, with a sparse low coin
   * trail (probability `coinChance` per column). */
  private runMove(seg: Seg, len: number, coinChance = 0): void {
    const start = seg.cols.length
    for (let i = 0; i < len; i++) {
      seg.cols.push(seg.h)
      if (coinChance > 0 && this.rng.chance(coinChance)) seg.coins.push(coin(start + i, seg.h + 1))
    }
  }

  /** A height change of `d` cells (a wall going up, a cliff going down), then a
   * short standing run on the new surface. The discontinuity between the old run
   * and the new one IS the wall/cliff — the runner jumps a rise, falls off a drop. */
  private stepMove(seg: Seg, up: boolean, d: number): void {
    seg.h += up ? d : -d
    if (up) {
      // Reward the climb with coins on top of the new surface.
      seg.coins.push(coin(seg.cols.length, seg.h + 1))
      if (d >= 3) seg.coins.push(coin(seg.cols.length + 1, seg.h + 1))
    }
    const len = this.rng.intRange(2, 3)
    for (let i = 0; i < len; i++) seg.cols.push(seg.h)
  }

  /** A bare hole of `w` empty columns (≤ GAP_MAX), far side level with the near
   * side, with a coin arc over it and a landing run. */
  private gapMove(seg: Seg, w: number): void {
    const start = seg.cols.length
    for (let i = 0; i < w; i++) seg.cols.push(null)
    seg.coins.push(coin(start, seg.h + 1))
    seg.coins.push(coin(start + Math.floor((w - 1) / 2), seg.h + 2))
    if (w >= 2) seg.coins.push(coin(start + w - 1, seg.h + 1))
    const len = this.rng.intRange(2, 3)
    for (let i = 0; i < len; i++) seg.cols.push(seg.h)
  }

  /** A wide hole crossed on ledge stepping stones placed every 3 columns, so no
   * sub-gap between supports exceeds 2 cells. Coins sit on the stones. */
  private bridgedGapMove(seg: Seg, w: number): void {
    const start = seg.cols.length
    for (let i = 0; i < w; i++) seg.cols.push(null)
    for (let x = start + 2; x < start + w; x += 3) {
      seg.ledges.push({ x, top: seg.h })
      seg.coins.push(coin(x, seg.h + 1))
    }
    const len = this.rng.intRange(2, 3)
    for (let i = 0; i < len; i++) seg.cols.push(seg.h)
  }

  /** A spike on the ground with a coin arc, then a landing run. */
  private hazardMove(seg: Seg): void {
    const x = seg.cols.length
    seg.cols.push(seg.h)
    seg.hazards.push({ x, top: seg.h + 1 })
    seg.coins.push(coin(x, seg.h + 2))
    const len = this.rng.intRange(2, 3)
    for (let i = 0; i < len; i++) {
      seg.cols.push(seg.h)
      if (i === 0) seg.coins.push(coin(x + 1, seg.h + 2))
    }
  }

  /** A roofed stretch: ground runs underneath (the safe route) while a roof two
   * cells overhead offers an alternate climb-over route paying a higher coin line. */
  private tunnelMove(seg: Seg, len: number): void {
    const start = seg.cols.length
    for (let i = 0; i < len; i++) seg.cols.push(seg.h)
    const clear = seg.h + 2
    seg.ceilings.push({ x: start, w: len, clear })
    const roofTop = clear + 1 // the standable top of the 1-cell-thick roof
    for (let i = 0; i < len; i += 2) {
      seg.coins.push(coin(start + i, seg.h + 1)) // under route (low, safe)
      seg.coins.push(coin(start + i, roofTop + 1)) // over route (high, reward)
    }
  }

  /** Turn the walked profile into the px-bound blocks the engine collides with:
   * one terrain block per run of equal-height solid columns, one lethal pit per run
   * of open columns, then the overlay features and coins. */
  private emit(seg: Seg): Block[] {
    const blocks: Block[] = []
    let i = 0
    while (i < seg.cols.length) {
      const h = seg.cols[i]
      let j = i
      if (h == null) {
        while (j < seg.cols.length && seg.cols[j] === null) j++
        blocks.push(pit(i, j - i))
      } else {
        while (j < seg.cols.length && seg.cols[j] === h) j++
        blocks.push(terrain(i, j - i, h))
      }
      i = j
    }
    for (const l of seg.ledges) blocks.push(ledge(l.x, 1, l.top))
    for (const c of seg.ceilings) blocks.push(ceiling(c.x, c.w, c.clear))
    for (const hz of seg.hazards) blocks.push(hazard(hz.x, 1, hz.top))
    blocks.push(...seg.coins)
    return blocks
  }
}
