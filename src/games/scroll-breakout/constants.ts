export const GAME_ID = 'scroll-breakout'

export const PADDLE_GROUND_Y = 720 - 30
/** Half-width doubles as the dome radius. */
export const PADDLE_WIDTH = 120
/** Left clamp in world space: the paddle's centre can't go before this x. */
export const PADDLE_MIN_X = PADDLE_WIDTH / 2
export const PADDLE_SPEED = 420
export const PADDLE_FAST_MULT = 1.75
/** Fraction of the paddle's horizontal velocity added to the ball's bounce as
 * "english" — moving the paddle into the ball steers (and speeds) the bounce. */
export const PADDLE_BOUNCE_INFLUENCE = 0.5
/** Initial paddle world x (~1/4 across the 1280-wide design); sits at the left
 * edge of the camera dead-zone. */
export const PADDLE_START_X = 320

export const BALL_RADIUS = 9
export const BALL_LAUNCH_SPEED = 320
export const BALL_DEATH_Y = 720 + BALL_RADIUS
/** Dome radius = half paddle width; ball sits just above the dome peak. */
export const BALL_START_Y = PADDLE_GROUND_Y - PADDLE_WIDTH / 2 - BALL_RADIUS - 5
export const BALL_RESET_DELAY_MS = 1200

export const WALL_THICKNESS = 50

export const STARTING_LIVES = 3

/** Camera follows the paddle (the avatar). While the paddle stays inside this
 * screen-space dead-zone the camera holds still; pushing past an edge scrolls
 * the world that way. Free two-way, but never before world x = 0. */
export const CAMERA_FOLLOW_LEFT = 320
export const CAMERA_FOLLOW_RIGHT = 700

/** Max block height for a row; width is computed per-texture from its natural aspect ratio. */
export const BLOCK_H = 80
export const BLOCK_GAP_Y = 10

/** World-space gap between successive block columns. */
export const BLOCK_COLUMN_GAP = 240
/** Generate columns until the frontier is this far past the right view edge. */
export const BLOCK_SPAWN_AHEAD = 400
/** Destroy blocks this far behind the left view edge. */
export const BLOCK_CULL_BEHIND = 600

/** Base sizes used to look up sticker assets (same @2x naming as breakout-clone). */
export const SCROLL_BRICK_SIZES = [64, 96, 128] as const

/** Vertical range where blocks are spawned. */
export const BLOCK_AREA_TOP = 64
export const BLOCK_AREA_BOTTOM = 586

export const BLOCK_SCORE = 80
/** Score per world pixel advanced (distance travelled). */
export const DISTANCE_SCORE_FACTOR = 0.1

/** Sticker asset names shared with breakout-clone. */
export const BRICK_NAMES = ['d1', 'd2', 'r1', 'r2', 't1', 't2'] as const

/** Parallax starfield that sells the sense of forward motion (à la sticker-drift). */
export const STAR_COUNT = 110

/** Ceiling rail: a solid band along the top edge sliced into ">"-shaped slabs
 * (chevron seams) that interlock. The two slab colours swap on a timer so the
 * chevrons appear to flow right — a "keep moving →" cue without moving shapes. */
export const CEILING_Y = 0
export const CEILING_BAND_H = 21
/** Horizontal repeat of one slab. */
export const CEILING_TILE_W = 60
/** How far the ">" point juts past the slab's base (the chevron depth). */
export const CEILING_CHEVRON_DEPTH = 12
/** How often the two colours swap (ABAB ⇄ BABA). Slow and gentle. */
export const CEILING_PULSE_MS = 1000
/** The two alternating slab colours — kept low-contrast so the swap reads as a
 * soft shift rather than a flicker. */
export const CEILING_COLORS = [0xd9c060, 0x9c8538] as const
