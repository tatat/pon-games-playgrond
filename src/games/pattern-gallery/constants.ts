import type { InputBindings } from '../../engine/input/index'

export const GAME_ID = 'pattern-gallery'

// ── Catalog layout (logical 1280×720 coords) ────────────────────────────────
/** Uniform margin from the logical viewport edges (HUD ≥40px rule). */
export const MARGIN = 40
/** Uniform gap between panes: menu↔stage↔params (horizontal) and
 * stage↔label (vertical). One value so the spacing reads as intentional. */
export const GAP = 24
/** Inner padding inside the demo stage so content — text especially — never
 * touches the clipped edge. */
export const CONTENT_PAD = 20
/** Left menu column. */
export const MENU_X = MARGIN
export const MENU_W = 300
/** Parameter panel: live sliders + current values on the right edge. */
export const PARAMS_W = 240
/** Demo stage: the area a selected pattern draws into. */
export const STAGE_X = MENU_X + MENU_W + GAP
export const STAGE_Y = MARGIN
export const STAGE_W = 1280 - STAGE_X - MARGIN - GAP - PARAMS_W
export const PARAMS_X = STAGE_X + STAGE_W + GAP
/** Label bar (name + token + caption) sits under the stage. */
export const LABEL_H = 84
export const STAGE_H = 720 - STAGE_Y - MARGIN - LABEL_H - GAP
export const LABEL_Y = STAGE_Y + STAGE_H + GAP

/** Corner-radius tokens. Radii stay modest and do NOT scale up with element
 * size — a large radius on a large surface reads as cheap, so big prominent
 * surfaces (result / modal) use the *tighter* `card` value, not a bigger one.
 * `panel` for boxes/bars, `control` for buttons, `chip` for small rows/pills. */
export const RADIUS = { card: 8, panel: 12, control: 8, chip: 6 } as const

// ── Palette ─────────────────────────────────────────────────────────────────
export const COLORS = {
  panel: 0x1e1e26,
  panelDeep: 0x14141a,
  border: 0x3a3a46,
  rowHover: 0x2a2a34,
  rowActive: 0x3556d4,
  accent: 0x6ad1ff,
  text: 0xffffff,
  muted: 0x9a9ab5,
  faint: 0x6a6a7a,
} as const

// ── Shared input actions for the `system` archetype demos (keyboard-only) ───
export const BINDINGS: InputBindings = {
  // Single-stick movement (either arrows or WASD).
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  // Twin-stick: move (WASD) and aim (arrows) as independent clusters.
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  moveUp: ['KeyW'],
  moveDown: ['KeyS'],
  aimLeft: ['ArrowLeft'],
  aimRight: ['ArrowRight'],
  aimUp: ['ArrowUp'],
  aimDown: ['ArrowDown'],
  action: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyJ'],
}
