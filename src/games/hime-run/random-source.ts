import { Rng } from '../../engine/rng'
import type { Section, SectionSource } from './course'
import { ceiling, coin, hazard, ledge, pat, terrain } from './grid-authoring'

// Seeded random course generator. `RandomSource` assembles one safe parameterized
// primitive per `next()`, drawn from the sample course's vocabulary, so every
// generated section is solvable on its own. Difficulty is NOT scaled here — the
// runner's existing speed ramp (SPEED_START → SPEED_MAX over SPEED_RAMP_DISTANCE)
// carries the escalation, so a flat-difficulty stream plus that ramp is the curve
// (see docs/hime-run-stage-select-plan.md "Random generation").
//
// Solvability is by construction: the cell values below come from the hand-tuned
// sample course, which already plays from distance 0 at SPEED_START, so each
// primitive clears at both ends of the speed range (gap widths bound by the
// slowest speed's jump reach ≈3 cells; reaction timing by the fastest speed).
// A trailing REST beat ends every primitive so two demands never chain.

/** Trailing breather (cells) after each primitive, so the next one is approached
 * from clean flat ground. Matches the sample course's calm REST_LONG. */
const REST = 6

/** A primitive: builds one self-contained, solvable section from the rng. */
type Primitive = (rng: Rng) => Section

/** A flat breather — open ground with a small coin trail. The most common beat. */
const flat: Primitive = (rng) => {
  const extra = rng.intRange(2, 4)
  const width = REST + extra
  const coins = [coin(2, 1), coin(3, 1), coin(4, 1)]
  return pat('rnd-flat', width, { blocks: coins })
}

/** A single-cell hop (terrain bump 1–2 cells tall) under a coin arc. The bump is
 * within the single jump's 2-cell ceiling. */
const hop: Primitive = (rng) => {
  const h = rng.intRange(1, 2)
  return pat('rnd-hop', 1 + REST, {
    blocks: [terrain(0, 1, h), coin(0, h + 1), coin(1, h + 2), coin(2, h + 1)],
  })
}

/** A wall 3–4 cells tall — needs the double jump (single tops out at 2). The
 * extra trailing cell gives a beat to land after clearing it. */
const wall: Primitive = (rng) => {
  const h = rng.intRange(3, 4)
  return pat('rnd-wall', 1 + REST + 1, {
    blocks: [terrain(0, 1, h), coin(0, h + 1), coin(1, h + 1)],
  })
}

/** A bare pit 2–3 cells wide, cleared in one jump. Capped at 3: one jump carries
 * ≈3.3 cells at SPEED_START (the slowest, shortest-reach case). */
const pitSmall: Primitive = (rng) => {
  const w = rng.intRange(2, 3)
  return pat('rnd-pit', w + REST, { pits: [[0, w]], blocks: [coin(0, 2), coin(w - 1, 2)] })
}

/** A wide pit crossed on ledge stepping stones spaced 3 cells apart (within one
 * hop), so no single gap exceeds the jump reach. */
const pitLedge: Primitive = (rng) => {
  const span = rng.intRange(5, 8)
  const blocks = []
  for (let x = 2; x < span - 1; x += 3) {
    blocks.push(ledge(x, 1, 1), coin(x, 2))
  }
  return pat('rnd-pit-ledge', span + REST, { pits: [[0, span]], blocks })
}

/** A ground spike to hop, with a coin arc over the jump. */
const spike: Primitive = () =>
  pat('rnd-hazard', 1 + REST, {
    blocks: [hazard(0, 1), coin(0, 2), coin(1, 3), coin(2, 2)],
  })

/** A stair hill: +1-cell steps up to a peak, a short plateau, then run off the
 * far side. Each step is one cell, hopped with a single jump. */
const hill: Primitive = (rng) => {
  const peak = rng.intRange(2, 4)
  const plateau = rng.intRange(2, 4)
  const blocks = []
  for (let i = 1; i <= peak; i++) blocks.push(terrain(1 + i, 1, i))
  blocks.push(terrain(1 + peak, plateau, peak))
  for (let i = 0; i < plateau; i++) blocks.push(coin(1 + peak + i, peak + 1))
  const width = 1 + peak + plateau + REST
  return pat('rnd-hill', width, { blocks })
}

/** A valley: drop through a gap onto a lower floor, then climb +1-cell steps back
 * up to ground. Depth is capped at 3 so the double jump (≤4 cells) always recovers
 * the climb out. */
const valley: Primitive = (rng) => {
  const depth = rng.intRange(1, 3)
  const span = rng.intRange(4, 6)
  const blocks = [terrain(2, span, -depth)]
  // Coins along the valley floor.
  for (let i = 0; i < span; i += 2) blocks.push(coin(2 + i, -depth + 1))
  // Stepped climb-out: +1-cell steps from the valley floor back to ground level.
  for (let i = 1; i <= depth; i++) blocks.push(terrain(2 + span + (i - 1), 1, -depth + i))
  const width = 2 + span + depth + REST
  // The gap must span the climb-out columns too, else `pat` floors them at ground
  // level and buries the staircase under a vertical wall.
  return pat('rnd-valley', width, { gaps: [[2, 2 + span + depth]], blocks })
}

/** A tunnel: a floating roof with a lane beneath (run under) and coins on top
 * (climb over). The underside clears the runner's standing height. */
const tunnel: Primitive = (rng) => {
  const span = rng.intRange(4, 6)
  const blocks = [ceiling(2, span, 2)]
  for (let i = 0; i < span; i += 2) blocks.push(coin(2 + i, 1), coin(2 + i, 4))
  const width = 2 + span + REST
  return pat('rnd-tunnel', width, { blocks })
}

/** The primitive pool, sampled uniformly (each primitive's own trailing REST beat
 * keeps the stream from feeling relentless). Light weighting can come later if the
 * mix feels off once the run is playable. */
const PRIMITIVES: Primitive[] = [flat, hop, wall, pitSmall, pitLedge, spike, hill, valley, tunnel]

/** A one-time flat opener wide enough to cover the start screen under the runner,
 * so a fresh run always begins on safe ground (mirrors the sample course's intro).
 * Includes a coin trail like the sample intro. */
function intro(): Section {
  return pat('rnd-intro', 14, { blocks: [coin(6, 1), coin(7, 1), coin(8, 1), coin(9, 1)] })
}

/**
 * Generates an endless solvable course from a seed. Deterministic: same seed → the
 * same section sequence. The first `next()` returns a guaranteed-flat opener; every
 * call after that returns a uniformly-sampled safe primitive.
 */
export class RandomSource implements SectionSource {
  private readonly rng: Rng
  private started = false

  constructor(seed: number) {
    this.rng = new Rng(seed)
  }

  next(): Section {
    if (!this.started) {
      this.started = true
      return intro()
    }
    return this.rng.pick(PRIMITIVES)(this.rng)
  }
}
