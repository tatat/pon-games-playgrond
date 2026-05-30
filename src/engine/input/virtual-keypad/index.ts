import { Container } from 'pixi.js'
import { useSettingsStore, type VirtualPadMode } from '../../../store/settings'
import type { GameLayout } from '../../layout'
import type { Disposable } from '../../util/disposable'
import type { Action, InputManager } from '../index'
import { PadButton } from './button'
import type { KeypadGlyph } from './glyphs'
import { OUTER_R as STICK_R, Stick, type StickActions } from './stick'

export type { KeypadGlyph } from './glyphs'
export type { StickActions } from './stick'

export interface ActionButtonSpec {
  action: Action
  label?: string
  /** Override the label font size (e.g. for longer words like LAUNCH). */
  labelSize?: number
  glyph?: KeypadGlyph
}

export interface KeypadConfig {
  /** Xbox-style thumbstick on the left. Each direction is optional; if
   * none are set, the stick is hidden. The stick fires `press(action)` /
   * `release(action)` via 8-way angle sectors (diagonals fire two). */
  stick?: StickActions
  /** Second thumbstick on the right, for twin-stick controls (aim). When
   * set it occupies the bottom-right corner that the A / B cluster would
   * use, so it is mutually exclusive with `actions`; an `option` button
   * still appears, tucked diagonally up-left of the aim stick. */
  rightStick?: StickActions
  /** A / B hold-buttons on the right. Either or both optional. Ignored
   * when `rightStick` is set (the right corner is the aim stick then). */
  actions?: {
    a?: ActionButtonSpec
    b?: ActionButtonSpec
  }
  /** Right-side option tap-button. Smaller cell so it reads as a
   * non-gameplay control. */
  option?: { tap(): void }
}

export interface VirtualKeypad extends Disposable {
  /** Single attach point — caller adds to `layout.uiLayer` (viewport
   * coordinates). Visibility tracks `useSettingsStore.virtualPad`. */
  view: Container
}

const PAD = 15
/** Stick's outer inset from the viewport edge. Larger than the button PAD
 * so the stick sits further from the corner — combined with the bigger
 * stick radius, the stick's bottom edge ends up on a different line from
 * the right-cluster's A button, signalling that it's a different control. */
const STICK_PAD = 24
/** Stick's canvas-aware lean uses a larger inset than `STICK_PAD` so the
 * stick doesn't hug the canvas edge as aggressively as the right
 * cluster does in portrait viewports. The right cluster's tall triangle
 * absorbs the lean naturally (its A button still sits well down in the
 * margin); the stick is a single circle, so the same `STICK_PAD` lean
 * left it floating high up close to the canvas. Only used for the
 * canvas-aware branch of the vertical anchor — the viewport-anchored
 * fallback still uses `STICK_PAD`. */
const STICK_LEAN_PAD = 60
/** Gap between adjacent button edges inside a cluster. Used for the
 * Pattern 3 triangle (centre-to-centre distance = CELL + INNER_GAP) and
 * any other multi-button geometry. */
const INNER_GAP = 6
/** Diagonal edge-to-edge gap between the Option circle and the A circle
 * in Pattern 2 — the actual pixel distance along the line of centres.
 * Roughly half of the original rect-based equivalent (which gave a
 * ~40 px diagonal gap), so the two circles read as a tight pair without
 * touching. The per-axis offset is `(R_a + R_opt + this) / √2`. */
const PATTERN_2_DIAGONAL_GAP = 20
const CELL = 96
const OPT_CELL = 60

// Pattern 3 (tilted equilateral triangle, 35° CCW from "apex up")
// constants. side s = CELL + INNER_GAP (centre-to-centre distance for
// adjacent buttons); circumradius R = s / sqrt(3). Vertex offsets baked
// in below — keep `docs/architecture/input.md` § Right cluster in sync if
// the angle changes.
const TRI_R = (CELL + INNER_GAP) / Math.sqrt(3)
const RAD = Math.PI / 180
const TRI_OPT_OFFSET = {
  x: TRI_R * Math.cos(125 * RAD),
  y: -TRI_R * Math.sin(125 * RAD),
}
const TRI_A_OFFSET = {
  x: TRI_R * Math.cos(245 * RAD),
  y: -TRI_R * Math.sin(245 * RAD),
}
const TRI_B_OFFSET = {
  x: TRI_R * Math.cos(5 * RAD),
  y: -TRI_R * Math.sin(5 * RAD),
}

/** `useSettingsStore.virtualPad` resolved against the platform pointer
 * type when set to `'auto'`. */
export function padEnabled(): boolean {
  return resolvePadEnabled(useSettingsStore.getState().virtualPad)
}

function resolvePadEnabled(mode: VirtualPadMode): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export function makeVirtualKeypad(
  input: InputManager,
  layout: GameLayout,
  config: KeypadConfig,
): VirtualKeypad {
  const view = new Container()
  view.zIndex = 250
  const disposables: Array<() => void> = []

  const hasDir = (s?: StickActions): boolean => !!(s && (s.left || s.right || s.up || s.down))

  // Left stick — hidden unless at least one direction is bound.
  let stick: Stick | undefined
  if (hasDir(config.stick)) {
    stick = new Stick(input, config.stick as StickActions, disposables)
    view.addChild(stick)
  }

  // Right stick (aim) — occupies the bottom-right corner, so it takes the
  // place of the A / B cluster when present.
  let rightStick: Stick | undefined
  if (hasDir(config.rightStick)) {
    rightStick = new Stick(input, config.rightStick as StickActions, disposables)
    view.addChild(rightStick)
  }

  // Right-side buttons. Bind press/release directly; the layout step
  // below positions them based on which slots are filled. Suppressed when
  // a right stick owns that corner.
  let aButton: PadButton | undefined
  if (config.actions?.a && !rightStick) {
    const spec = config.actions.a
    aButton = new PadButton({
      label: spec.label,
      labelSize: spec.labelSize,
      glyph: spec.glyph,
      onPress: () => input.press(spec.action),
      onRelease: () => input.release(spec.action),
      disposables,
    })
    aButton.setShape(CELL, CELL)
    view.addChild(aButton)
  }

  let bButton: PadButton | undefined
  if (config.actions?.b && !rightStick) {
    const spec = config.actions.b
    bButton = new PadButton({
      label: spec.label,
      labelSize: spec.labelSize,
      glyph: spec.glyph,
      onPress: () => input.press(spec.action),
      onRelease: () => input.release(spec.action),
      disposables,
    })
    bButton.setShape(CELL, CELL)
    view.addChild(bButton)
  }

  let optionButton: PadButton | undefined
  if (config.option) {
    const opt = config.option
    optionButton = new PadButton({
      glyph: 'menu',
      onTap: () => opt.tap(),
      disposables,
    })
    optionButton.setShape(OPT_CELL, OPT_CELL)
    view.addChild(optionButton)
  }

  const releaseAll = (): void => {
    if (aButton && config.actions?.a) input.release(config.actions.a.action)
    if (bButton && config.actions?.b) input.release(config.actions.b.action)
    stick?.reset()
    rightStick?.reset()
  }

  const apply = (): void => {
    const mode = useSettingsStore.getState().virtualPad
    const enabled = resolvePadEnabled(mode)
    view.visible = enabled
    if (!enabled) {
      releaseAll()
      return
    }

    const m = layout.current()
    const vpW = m.viewportW
    const vpH = m.viewportH
    const canvasBottomY = m.marginTop + m.gameH

    // Right cluster — pattern depends on how many slots are filled.
    // Option always counts when present; A / B add to the count.
    const rightCount = (optionButton ? 1 : 0) + (aButton ? 1 : 0) + (bButton ? 1 : 0)

    // Anchor offsets, measured from the right cluster's anchor button
    // (Option in Pattern 1, A in Pattern 2, B in Pattern 3):
    //   topOffset      — distance up to the cluster's topmost edge
    //   halfAnchorCell — half the anchor button's own cell (== distance
    //                    to its own bottom / right edge).
    const topOffset = topOffsetFor(rightCount)
    const halfAnchorCell = anchorHalfCellFor(rightCount)

    // Per-pattern outer margin. The 3-button cluster is large enough to
    // sit close to the viewport corner without looking cramped; the 1
    // and 2-button clusters are small, so we push them in with a larger
    // margin (matching the stick's STICK_PAD) so the corner doesn't
    // read as "single button stuck in the corner".
    const outerPad = rightCount === 3 ? PAD : STICK_PAD

    // Horizontal anchor: viewport-anchored (canvas-lean is bottom only).
    const rightCenterX = vpW - outerPad - halfAnchorCell

    // Vertical anchor: hug `canvas-bottom + outerPad` when the bottom
    // margin has room; fall back to `vp_bottom - outerPad` when the
    // canvas reaches the viewport bottom. The cluster leans toward the
    // playfield rather than sitting in the far corner of the letterbox.
    const bottomY = Math.min(canvasBottomY + outerPad + topOffset, vpH - outerPad - halfAnchorCell)

    // Left cluster — stick anchors to the viewport-left edge with
    // STICK_PAD horizontally. Vertically it has its own canvas-aware
    // anchor with a larger STICK_LEAN_PAD (so it doesn't float up close
    // to the canvas like the right cluster's small Option / A would);
    // the viewport-anchored fallback still uses STICK_PAD, keeping the
    // landscape position (no bottom margin) unchanged.
    const stickY = Math.min(canvasBottomY + STICK_LEAN_PAD + STICK_R, vpH - STICK_PAD - STICK_R)
    if (stick) {
      stick.position.set(STICK_PAD + STICK_R, stickY)
    }
    // Right stick mirrors the left one against the right edge.
    if (rightStick) {
      rightStick.position.set(vpW - STICK_PAD - STICK_R, stickY)
    }

    if (rightStick) {
      // The aim stick owns the bottom-right corner; the Option button sits
      // diagonally up-left of it, the same tight-pair geometry as Pattern 2
      // (Option vs. A) but anchored to the stick's larger radius.
      if (optionButton) {
        optionButton.position.set(rightStick.x - OPT_STICK_OFFSET, rightStick.y - OPT_STICK_OFFSET)
      }
    } else if (rightCount === 1) {
      placeOnlyAtCorner({ aButton, bButton, optionButton, rightCenterX, bottomY })
    } else if (rightCount === 2) {
      placeTwoDiagonal({ aButton, bButton, optionButton, rightCenterX, bottomY })
    } else if (rightCount === 3) {
      placeThreeTriangle({ aButton, bButton, optionButton, rightCenterX, bottomY })
    }
  }

  apply()
  disposables.push(layout.onChange(apply))
  disposables.push(useSettingsStore.subscribe(apply))

  return {
    view,
    dispose: () => {
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
      releaseAll()
      view.destroy({ children: true })
    },
  }
}

/** Distance from the right cluster's anchor button centre up to the top
 * edge of its tallest visible button. (Stick has its own anchor, so it
 * is intentionally excluded.) */
function topOffsetFor(rightCount: number): number {
  if (rightCount === 1) return OPT_CELL / 2
  if (rightCount === 2) {
    // Pattern 2 Option: top edge above A.y by PATTERN_2_OFFSET (per-axis
    // diagonal distance from A's centre) plus Option's half-cell.
    return PATTERN_2_OFFSET + OPT_CELL / 2
  }
  if (rightCount === 3) {
    // Pattern 3 Option: top edge above A.y by
    //   (A's offset.y − Option's offset.y) + OPT_CELL/2.
    return TRI_A_OFFSET.y - TRI_OPT_OFFSET.y + OPT_CELL / 2
  }
  return 0
}

/** Half the cell size of the cluster's anchor button. The anchor is
 * the bottom-right vertex of the right cluster (Option for Pattern 1,
 * A for Pattern 2, B for Pattern 3 — these are the buttons whose right
 * and bottom edges define the cluster's right/bottom extents). */
function anchorHalfCellFor(rightCount: number): number {
  if (rightCount === 1) return OPT_CELL / 2
  return CELL / 2
}

interface PatternCtx {
  aButton?: PadButton
  bButton?: PadButton
  optionButton?: PadButton
  /** Centre x of the cluster's anchor button (rightmost button). */
  rightCenterX: number
  /** Centre y of the cluster's anchor button (bottommost button). */
  bottomY: number
}

function placeOnlyAtCorner(ctx: PatternCtx): void {
  const { aButton, bButton, optionButton, rightCenterX, bottomY } = ctx
  const single = optionButton ?? aButton ?? bButton
  if (!single) return
  single.position.set(rightCenterX, bottomY)
}

/** Per-axis Option centre offset from A centre for the Pattern 2
 * diagonal, computed from circle geometry: the centre-to-centre
 * distance along the diagonal is (R_a + R_opt + PATTERN_2_DIAGONAL_GAP),
 * and the per-axis component is that distance ÷ √2. */
const PATTERN_2_OFFSET = (CELL / 2 + OPT_CELL / 2 + PATTERN_2_DIAGONAL_GAP) / Math.SQRT2

/** Per-axis Option offset up-left of the right (aim) stick — Pattern 2
 * geometry measured from the stick's radius instead of the A button's. */
const OPT_STICK_OFFSET = (STICK_R + OPT_CELL / 2 + PATTERN_2_DIAGONAL_GAP) / Math.SQRT2

function placeTwoDiagonal(ctx: PatternCtx): void {
  const { aButton, bButton, optionButton, rightCenterX, bottomY } = ctx
  // A (or B as fallback) at the anchor; Option diagonally up-left so
  // its circle's bottom-right tangent line is PATTERN_2_DIAGONAL_GAP
  // away from A's circle's top-left tangent line.
  const cornerBtn = aButton ?? bButton
  if (cornerBtn) cornerBtn.position.set(rightCenterX, bottomY)
  if (optionButton) {
    optionButton.position.set(rightCenterX - PATTERN_2_OFFSET, bottomY - PATTERN_2_OFFSET)
  }
}

function placeThreeTriangle(ctx: PatternCtx): void {
  const { aButton, bButton, optionButton, rightCenterX, bottomY } = ctx
  // B is the cluster's right-vertex anchor; centre derived from B's
  // (rightCenterX, B.y) and A's (A.x, bottomY).
  const centreX = rightCenterX - TRI_B_OFFSET.x
  const centreY = bottomY - TRI_A_OFFSET.y
  if (aButton) aButton.position.set(centreX + TRI_A_OFFSET.x, centreY + TRI_A_OFFSET.y)
  if (bButton) bButton.position.set(centreX + TRI_B_OFFSET.x, centreY + TRI_B_OFFSET.y)
  if (optionButton)
    optionButton.position.set(centreX + TRI_OPT_OFFSET.x, centreY + TRI_OPT_OFFSET.y)
}
