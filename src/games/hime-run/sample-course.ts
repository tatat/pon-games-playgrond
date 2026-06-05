import type { Course } from './course'
// `.ts` extension is load-bearing: the export script imports this module under
// plain Node (TS type-stripping), whose ESM resolver needs the explicit extension
// on a runtime import. The helpers themselves only depend on type-only imports.
import { ceiling, coin, hazard, ledge, pat, terrain } from './grid-authoring.ts'

// ── Sample course (debug / tuning) ────────────────────────────────────────────
// One hand-authored course built from the shared grid-authoring helpers. The data
// is plain grid `Block`s (cells; `y` = ground-relative, up = +); the engine
// (course.ts) only knows the resulting data, never how it was authored.

const REST_LONG = 6 // calm beat
const REST_MED = 5
const REST_SHORT = 4 // brisk, used at the peak

/** One-time opening: flat ground the player starts on, with a coin trail. */
const INTRO: Course = [
  pat('intro-flat', 14, { blocks: [coin(6, 1), coin(7, 1), coin(8, 1), coin(9, 1)] }),
]

/** The endlessly repeating section (wave: calm → ramp → peak → calm). */
const LOOP: Course = [
  // Double tunnel (first, easy to find): two stacked roofs → three lanes, each
  // higher one paying one coin more. Run under roof A, or climb onto A then B.
  pat('tunnel', 2 + 8 + REST_LONG, {
    blocks: [
      ceiling(2, 8, 2),
      ceiling(4, 4, 5),
      coin(3, 1),
      coin(8, 1),
      coin(3, 4),
      coin(5, 4),
      coin(7, 4),
      coin(4, 7),
      coin(5, 7),
      coin(6, 7),
      coin(7, 7),
    ],
  }),

  // ── Camera-tuning samples: flat → hill → flat → valley → flat. ─────────────
  pat('cam-flat-lead', 6),
  pat('cam-hill', 2 + 6 + 6 + REST_LONG, {
    blocks: [
      terrain(2, 1, 1),
      terrain(3, 1, 2),
      terrain(4, 1, 3),
      terrain(5, 1, 4),
      terrain(6, 1, 5),
      terrain(7, 1, 6),
      terrain(8, 6, 6),
      coin(9, 7),
      coin(11, 7),
      coin(13, 7),
    ],
  }),
  pat('cam-flat-mid', 6),
  pat('cam-valley', 2 + 6 + 6 + REST_LONG, {
    gaps: [[2, 13]],
    blocks: [
      terrain(2, 6, -6),
      terrain(8, 1, -5),
      terrain(9, 1, -4),
      terrain(10, 1, -3),
      terrain(11, 1, -2),
      terrain(12, 1, -1),
      coin(3, -5),
      coin(5, -5),
      coin(7, -5),
    ],
  }),
  pat('cam-flat-settle', 10),

  // A visible ground spike to hop, with a coin arc over the jump.
  pat('hazard-hop', 1 + REST_LONG, {
    blocks: [hazard(0, 1), coin(0, 2), coin(1, 3), coin(2, 2)],
  }),

  // UP route: ground runs through; a ledge staircase climbs to a long high lane.
  pat('up-route-long', 26 + REST_LONG, {
    blocks: [
      ledge(1, 1, 2),
      ledge(3, 1, 3),
      ledge(5, 1, 4),
      ledge(7, 12, 5),
      coin(7, 6),
      coin(8, 6),
      coin(9, 6),
      coin(10, 6),
      coin(11, 6),
      coin(12, 6),
      coin(13, 6),
      coin(14, 6),
      coin(15, 6),
      coin(16, 6),
      coin(17, 6),
      coin(18, 6),
    ],
  }),
  // DOWN route: a gap drops to a long lower lane two cells down, stepping back up.
  pat('down-route-long', 28 + REST_LONG, {
    gaps: [[3, 24]],
    blocks: [
      terrain(3, 19, -2),
      terrain(22, 1, -1),
      terrain(23, 1, 0),
      coin(4, -1),
      coin(6, -1),
      coin(8, -1),
      coin(10, -1),
      coin(12, -1),
      coin(14, -1),
      coin(16, -1),
      coin(18, -1),
      coin(20, -1),
    ],
  }),

  // ── Wave 1: intro / calm. ─────────────────────────────────────────────────
  pat('hop-low', 1 + REST_LONG, {
    blocks: [terrain(0, 1, 1), coin(0, 2), coin(1, 3), coin(2, 2)],
  }),
  pat('pit-small', 2 + REST_LONG, { pits: [[0, 2]] }),
  pat('hop-max-single', 1 + REST_LONG, { blocks: [terrain(0, 1, 2)] }),

  // ── Wave 2: ramp — double jump + ledge. ───────────────────────────────────
  pat('wall-double', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 3)] }),
  pat('pit-ledge', 4 + REST_MED, {
    pits: [[0, 4]],
    blocks: [ledge(1, 2, 1), coin(1, 2), coin(2, 2), coin(3, 2)],
  }),
  pat('pit-steps', 8 + REST_MED, { pits: [[0, 8]], blocks: [ledge(2, 1, 1), ledge(5, 1, 1)] }),
  pat('hop-two-beat', 4 + 1 + REST_MED, { blocks: [terrain(0, 1, 1), terrain(4, 1, 1)] }),

  // ── Wave 3: peak — switching + continuity. ────────────────────────────────
  pat('pit-then-hop', 2 + 3 + 1 + REST_MED, { pits: [[0, 2]], blocks: [terrain(5, 1, 2)] }),
  pat('pit-wide-steps', 11 + REST_LONG, {
    pits: [[0, 11]],
    blocks: [ledge(2, 1, 1), ledge(5, 1, 1), ledge(8, 1, 1)],
  }),
  pat('pit-steps-climb', 11 + REST_LONG, {
    pits: [[0, 11]],
    blocks: [ledge(2, 1, 1), ledge(5, 1, 2), ledge(8, 1, 3), coin(2, 2), coin(5, 3), coin(8, 4)],
  }),
  pat('rhythm-stair', 8 + 1 + REST_SHORT, {
    blocks: [terrain(0, 1, 1), terrain(4, 1, 2), terrain(8, 1, 2)],
  }),
  pat('wall-max-double', 1 + REST_LONG + 1, {
    blocks: [terrain(0, 1, 4), coin(0, 5), coin(1, 5)],
  }),
  pat('wall-then-pit', 1 + 4 + 2 + REST_MED, { pits: [[5, 7]], blocks: [terrain(0, 1, 3)] }),

  // ── Wave 4: calm — wind down before the loop seam. ────────────────────────
  pat('ledge-easy', 4 + REST_LONG, {
    pits: [[0, 4]],
    blocks: [ledge(1, 2, 1), coin(1, 2), coin(2, 2)],
  }),
  pat('hop-final', 1 + REST_LONG + 1, { blocks: [terrain(0, 1, 1)] }),
]

/** Full course: the intro, then the loop (all grid coordinates). */
export const SAMPLE_COURSE: Course = [...INTRO, ...LOOP]
/** Index the walker wraps to — the first loop section, just past the intro. */
export const SAMPLE_LOOP_START = INTRO.length
