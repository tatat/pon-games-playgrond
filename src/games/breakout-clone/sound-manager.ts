import { sound } from '@pixi/sound'
import { effectiveSfxVolume } from '../../engine/audio'
import type { Rng } from '../../engine/rng'
import { type MusicScale, useBreakoutCloneStore } from './store'

/** Twelve chromatic-note hit samples. The selected note depends on the
 * current musical scale + base key (transposition). */
const HIT_COUNT = 12

const SCALES: Record<MusicScale, readonly number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
}

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

/** Sound-manager port of the Phaser original. Owns the 12 hit-sample
 * registrations; `playRandomHit()` picks one per the configured scale and
 * base key (a +0..11 semitone shift) using the scene RNG.
 *
 * The samples are registered with `@pixi/sound` directly (not via Pixi's
 * `Assets.load`) — letting Pixi's Assets pipeline auto-detect mp3s alongside
 * image assets surfaced an `InvalidStateError: The source image could not
 * be decoded` in the wild, so we keep audio loading on the sound library's
 * own path. */
export class SoundManager {
  constructor(private readonly rng: Rng) {}

  /** Register the 12 hit aliases with `@pixi/sound`. Loading is lazy —
   * the first `play()` triggers a fetch+decode; subsequent plays are
   * synchronous. Safe to call multiple times (`sound.add` overwrites). */
  static registerHits(): void {
    for (let i = 1; i <= HIT_COUNT; i++) {
      const num = i.toString().padStart(2, '0')
      sound.add(aliasFor(i - 1), `${BASE}/games/breakout-clone/sounds/hit/${num}.mp3`)
    }
  }

  /** Pick a random note from the current scale, transpose by base key,
   * and play the matching `hit-<NN>` sample. Volume is multiplied by the
   * engine's `effectiveSfxVolume()` so the settings sliders apply. The
   * scale + base key are read live from the per-game store, so changes
   * in the Settings modal apply on the next hit. */
  playRandomHit(): void {
    const { scale, baseKey } = useBreakoutCloneStore.getState()
    const notes = SCALES[scale]
    const note = this.rng.pick(notes)
    const idx = (note + baseKey) % 12
    sound.play(aliasFor(idx), { volume: effectiveSfxVolume() })
  }
}

function aliasFor(index0: number): string {
  return `bc-hit-${(index0 + 1).toString().padStart(2, '0')}`
}
