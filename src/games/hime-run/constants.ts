import { DESIGN_H, DESIGN_W } from '../../engine/constants'

export const GAME_ID = 'hime-run'

/** Background of the play area (a dusk sky). */
export const BACKGROUND_COLOR = 0x1b2440

// ── Parallax background (post-apocalyptic ruined skyline) ────────────────────
// A smog-dusk over a dead city: three skyline layers of broken buildings recede
// into a hazy horizon, each scrolling at a fraction of the world speed so the
// run reads as forward motion. Atmospheric perspective — far layers sit close to
// the sky colour, the nearest is the darkest. See background.ts.
/** Sky gradient stops, top → horizon. */
export const SKY_TOP_COLOR = 0x141a2e
export const SKY_HORIZON_COLOR = 0x70503f
/** Dim, haze-swallowed sun low on the horizon. */
export const SUN_COLOR = 0xc88a5d
// Building silhouette colours, far → near. Atmospheric perspective: a single
// monotonic value ramp (far lightest → near darkest), with the far layer tinted
// warm so it melts into the smoggy horizon and the near layer kept cool. Near is
// the darkest but holds a blue-violet so it never crushes to flat black.
export const SKYLINE_FAR_COLOR = 0x4c4249
export const SKYLINE_MID_COLOR = 0x322e3a
export const SKYLINE_NEAR_COLOR = 0x211d2a

// ── Ground ─────────────────────────────────────────────────────────────────
/** World y of the floor surface — the runner's feet rest here, and floor terrain
 * blocks have their top at this y. (The floor is terrain blocks, not a band.) */
export const GROUND_Y = 600

// ── Runner ─────────────────────────────────────────────────────────────────
/** Fixed screen x of the runner (the world scrolls past her). */
export const PLAYER_X = 300
/** On-screen height of the sprite in logical px (source frames are 320×320). */
export const PLAYER_DISPLAY_H = 150
/** Source-frame edge length (px) of the square run frames. */
export const PLAYER_FRAME_SIZE = 320
// The runner's body is ONE circle, measured from the sprite's opaque pixels and
// used for everything — landing, lethal/pit death, side-blocking, and where the
// sprite is drawn (its anchor). The largest circle fitting the silhouette (pixels
// opaque in ANY run frame) is r=96 at centre x=169 in the 320px source. We seat
// it so its BOTTOM is the foot line — the lowest opaque pixel across frames,
// y=301 — so the circle's lowest point IS the contact point: feet rest on the
// floor (no float) and a 1-cell-deep pit kills after exactly one cell of fall.
// Centre y = 301 − 96 = 205. This circle is the single source of truth; if it
// ever looks misaligned, move/resize it HERE (nowhere else).
/** Body circle centre x, in 320px source coords. */
export const PLAYER_HIT_FRAME_CX = 169
/** Body circle centre y, in 320px source coords (bottom = foot line 301). */
export const PLAYER_HIT_FRAME_CY = 205
/** Body circle radius, in 320px source coords. */
export const PLAYER_HIT_FRAME_R = 96
/** Sprite-art scale: source frame → on-screen height. */
export const PLAYER_SCALE = PLAYER_DISPLAY_H / PLAYER_FRAME_SIZE
/** Body circle radius in world px (the source radius at display scale). */
export const PLAYER_HIT_RADIUS = PLAYER_HIT_FRAME_R * PLAYER_SCALE
/** When blocked by a block's side the runner is shoved left of `PLAYER_X`. Once
 * free she waits `PLAYER_RECOVER_DELAY` seconds, then drifts back home: her glide
 * speed ramps up smoothly from 0 (ease-in) at `PLAYER_RECOVER_ACCEL` px/s² up to
 * `PLAYER_RECOVER_SPEED` px/s, then eases out as she nears home
 * (`PLAYER_RECOVER_RATE`, per second). */
export const PLAYER_RECOVER_DELAY = 0.35
export const PLAYER_RECOVER_SPEED = 220
export const PLAYER_RECOVER_ACCEL = 500
export const PLAYER_RECOVER_RATE = 6
/** Squeezed to death once pushed this far left (her left side hits the edge). */
export const PLAYER_MIN_X = PLAYER_HIT_RADIUS

// ── Grid ─────────────────────────────────────────────────────────────────────
// The whole game is laid out on a square grid so course, builder, and jump
// physics all line up (see docs/hime-run-plan.md). One cell is CELL px in both
// axes. Measured jump reach (see the Jump physics block below):
//   • single jump : clears a ≤2-cell obstacle, not a 3-cell one
//   • double jump : clears a ≤4-cell obstacle (3–4 cells need it)
//   • horizontal  : one jump carries ~3 cells of distance at SPEED_START (more as
//     the speed ramp builds)
// So "this wall is 2 cells → single; 3–4 cells → double" reads straight off the
// grid. Authored heights/widths/gaps are all cell multiples.
export const CELL = 96

// ── Jump physics (px, px/s, px/s²) ───────────────────────────────────────────
// Measured peaks from the integrator (apex = JUMP_VELOCITY²/2·GRAVITY):
//   • single (-1050): apex ≈230px ≈2.4 cells — clears 2 cells (192, ~38px spare),
//     falls ~58px short of 3 cells (288), so 3-cell obstacles need the double.
//   • double (-1050 fired near the apex): apex ≈459px ≈4.8 cells — clears 4 cells
//     (384, ~75px spare), short of 5, so ≤4 cells is the double-jump ceiling.
export const GRAVITY = 2400
/** First jump impulse — clears 2 cells with margin; can't reach 3. */
export const JUMP_VELOCITY = -1050
/** Mid-air (second) jump impulse — clears 4 cells with margin near the apex. */
export const DOUBLE_JUMP_VELOCITY = -1050
/** Releasing the button while rising cuts the remaining ascent → variable height. */
export const JUMP_CUT = 0.45
export const MAX_JUMPS = 2

// ── Speed ────────────────────────────────────────────────────────────────────
// Scroll speed ramps up with distance travelled: faster the further you get. The
// course layout is fixed, so the ramp keeps every run deterministic — speed is a
// pure function of distance, so the same distance always plays at the same speed
// (the memorization track stays learnable; only the tempo rises as a difficulty
// curve). It climbs from SPEED_START to SPEED_MAX, reaching the cap at
// SPEED_RAMP_DISTANCE px of travel.
/** Starting scroll speed (px/s). At this speed one jump (airtime ≈0.875s at
 * JUMP_VELOCITY −1050) carries ≈3.3 cells. */
export const SPEED_START = 360
/** Top scroll speed (px/s) the ramp climbs to. */
export const SPEED_MAX = 660
/** Distance travelled (px) at which speed reaches SPEED_MAX. */
export const SPEED_RAMP_DISTANCE = 24000

// ── Blocks ─────────────────────────────────────────────────────────────────
// Everything in the world is one Block with a `type` (see obstacles.ts). These
// are the per-type look constants; behaviour lives in obstacles.ts.
/** terrain — solid floor / steps / walls. */
export const TERRAIN_COLOR = 0x2a3358
/** terrain top lip, a touch brighter so the standable surface reads. */
export const TERRAIN_LIP_COLOR = 0x4a5a92
/** ledge — one-way landable slab. */
export const LEDGE_COLOR = 0x6be8c8
/** hazard — visible lethal block (spikes etc.). */
export const HAZARD_COLOR = 0xff6b9d
/** coin — collectible. */
export const COIN_COLOR = 0xffd34d
/** Coin draw radius (it's authored as a 1-cell block but drawn as a disc). */
export const COIN_RADIUS = 28

// ── Vertical follow camera ───────────────────────────────────────────────────
// Pure dead-zone camera: a fixed on-screen window the runner moves freely within
// (so jumps DON'T scroll the view). The camera moves only when she leaves the
// window, just enough to hold her at the edge it never moves on its own.
/** Resting screen y of the runner on flat ground (the window's bottom edge). */
export const CAMERA_HOME_Y = GROUND_Y - PLAYER_HIT_RADIUS
/** Bottom of the dead-zone window: fall past this and the camera follows down. */
export const CAMERA_WINDOW_BOTTOM = CAMERA_HOME_Y
/** Top of the dead-zone window: rise past this (≈ a 4-cell jump) and the camera
 * follows up. Between the two edges the camera holds — jumps don't move it. */
export const CAMERA_WINDOW_TOP = CAMERA_HOME_Y - 4 * CELL
/** Per-second ease rate for the upward follow (holding her at the window top as
 * she climbs). Downward follow is instant; this only softens the rise. */
export const CAMERA_UP_EASE = 12

// ── Collision / death ────────────────────────────────────────────────────────
/** Apex a full double jump reaches above its launch point (single apex fired,
 * then the second impulse at that apex): JUMP_VELOCITY²/2g + DOUBLE_JUMP_VELOCITY²/2g.
 * Used as the fall-death margin — once the runner is more than this far below
 * the deepest walkable surface on screen, no double jump can recover her, so the
 * run ends. This adapts to the terrain depth (a deep valley pushes the line down)
 * instead of a fixed screen-relative cutoff. */
export const DOUBLE_JUMP_REACH =
  (JUMP_VELOCITY * JUMP_VELOCITY + DOUBLE_JUMP_VELOCITY * DOUBLE_JUMP_VELOCITY) / (2 * GRAVITY)

/** Score per world pixel advanced — 1 m every 10px. */
export const DISTANCE_SCORE_FACTOR = 0.1

/** Re-export for layout maths inside the scene. */
export { DESIGN_H, DESIGN_W }
