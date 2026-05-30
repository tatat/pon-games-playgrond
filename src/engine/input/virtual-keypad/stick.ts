import { Circle, Container, type FederatedPointerEvent, Graphics } from 'pixi.js'
import type { Action, InputManager } from '../index'

/** Stick is intentionally sized larger than the action buttons (96 ÷ 2 = 48)
 * so that it visually reads as a different kind of control, not a button. */
export const OUTER_R = 56
/** The hit area extends past the drawn ring by this much so the stick is a
 * little more forgiving to grab than it looks — touching just outside the
 * visible ring still claims it and reads the right direction. */
const HIT_PAD = 12
/** Radius (in stick-local px) below which a touch fires nothing — the only
 * dead area. Kept just large enough to swallow the noisy near-centre angle
 * (atan2 is undefined at the origin) without leaving a felt unresponsive
 * zone; the stick reacts almost as soon as the touch leaves dead centre. */
const DEADZONE = 6

/** Visuals. The face is split into four quadrants by an X at ±45° (the
 * static `guide` lines). Judgement is 8-way, though: a touch near an X line
 * snaps to a diagonal and lights *both* adjacent quadrants, so four drawn
 * faces express eight directions. Active quadrants fill with a soft white
 * (the keypad's white/black palette) — this fill is the only input
 * feedback, there is no moving knob. At rest only the faint X shows. */
const FACE_FILL = { color: 0xffffff, alpha: 0.2 } as const
const XLINE = { color: 0xffffff, alpha: 0.14, width: 1.5 } as const
/** Inner / outer radii of the quadrant fills and the X spokes. Inner sits
 * at the dead-zone edge so the dead centre stays a visible hole; outer is
 * inset from the ring stroke. */
const FACE_IN = DEADZONE
const FACE_OUT = OUTER_R - 1.5

type Dir = 'right' | 'down' | 'left' | 'up'

/** 8-way sectors keyed by snapped angle index (`atan2(y, x)`, y screen-down),
 * 0 = East going clockwise to 7 = North-East. Cardinal sectors fire one
 * direction; diagonal sectors fire the two they sit between. */
const SECTORS: Dir[][] = [
  ['right'], // 0  E
  ['right', 'down'], // 1  SE
  ['down'], // 2  S
  ['down', 'left'], // 3  SW
  ['left'], // 4  W
  ['left', 'up'], // 5  NW
  ['up'], // 6  N
  ['up', 'right'], // 7  NE
]

/** Each drawn quadrant: the direction it represents and the angular span
 * (radians, screen-down) it fills, bounded by the X at ±45°. */
const FACES: Array<{ dir: Dir; a0: number; a1: number }> = [
  { dir: 'right', a0: -Math.PI / 4, a1: Math.PI / 4 },
  { dir: 'down', a0: Math.PI / 4, a1: (3 * Math.PI) / 4 },
  { dir: 'left', a0: (3 * Math.PI) / 4, a1: (5 * Math.PI) / 4 },
  { dir: 'up', a0: (5 * Math.PI) / 4, a1: (7 * Math.PI) / 4 },
]

/** The four X spokes (quadrant boundaries), drawn once as the rest guide. */
const SPOKES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]

export interface StickActions {
  left?: Action
  right?: Action
  up?: Action
  down?: Action
}

/** Xbox-style thumbstick: an outer ring whose face is split into four
 * quadrants by an X. Resolves the touch position into 8-way direction
 * `press(action)` / `release(action)` calls on the wrapped `InputManager` —
 * cardinal touches fire one direction, touches near an X line fire the two
 * adjacent directions (diagonal). Only mapped directions fire input; the
 * quadrant(s) the touch points at light up while held (the visual tracks the
 * touch direction, not what the caller mapped). There is no moving knob —
 * the lit quadrant is the feedback.
 *
 * The stick is rendered at its own origin — caller positions the container
 * by writing to `position`. Cell = `OUTER_R * 2 = 96` viewport px. */
export class Stick extends Container {
  private readonly ring = new Graphics()
  /** Active-quadrant fills, redrawn when the lit direction set changes. */
  private readonly faces = new Graphics()
  /** Static X dividing the face into four quadrants. */
  private readonly guide = new Graphics()
  private readonly input: InputManager
  private readonly actions: StickActions
  private active = new Set<Action>()
  /** Quadrants currently lit (geometry, regardless of mapping). Tracked
   * separately from `active` so the visual can light unmapped directions. */
  private litDirs = new Set<Dir>()
  /** Multitouch guard — once a finger claims the stick, ignore other
   * fingers' move/up events. Resets on pointerup of the claiming finger. */
  private activePointerId: number | null = null

  constructor(input: InputManager, actions: StickActions, disposables: Array<() => void>) {
    super()
    this.input = input
    this.actions = actions
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.hitArea = new Circle(0, 0, OUTER_R + HIT_PAD)

    this.ring
      .circle(0, 0, OUTER_R)
      .fill({ color: 0x000000, alpha: 0.3 })
      .stroke({ color: 0xffffff, alpha: 0.25, width: 1.5 })
      // Faint dead-zone circle: marks the small centre that fires nothing,
      // and serves as the rest-state centre marker now there is no knob.
      .circle(0, 0, DEADZONE)
      .stroke({ color: 0xffffff, alpha: 0.1, width: 1 })
    this.addChild(this.ring)

    // Quadrant fills sit above the ring; the X guide above them so the
    // dividers stay crisp over the fill.
    this.addChild(this.faces)
    for (const ang of SPOKES) {
      this.guide
        .moveTo(Math.cos(ang) * FACE_IN, Math.sin(ang) * FACE_IN)
        .lineTo(Math.cos(ang) * FACE_OUT, Math.sin(ang) * FACE_OUT)
        .stroke(XLINE)
    }
    this.addChild(this.guide)

    const onDown = (e: FederatedPointerEvent): void => {
      if (this.activePointerId !== null) return
      this.activePointerId = e.pointerId
      e.stopPropagation()
      const local = e.getLocalPosition(this)
      this.updateInput(local.x, local.y)
    }
    const onMove = (e: FederatedPointerEvent): void => {
      if (e.pointerId !== this.activePointerId) return
      const local = e.getLocalPosition(this)
      this.updateInput(local.x, local.y)
    }
    const onUp = (e: FederatedPointerEvent): void => {
      if (e.pointerId !== this.activePointerId) return
      this.activePointerId = null
      this.reset()
    }

    this.on('pointerdown', onDown)
    // globalpointermove keeps tracking once a finger has left the stick's
    // hit area mid-drag. Requires renderer.eventFeatures.globalMove (Pixi
    // default = true).
    this.on('globalpointermove', onMove)
    this.on('pointerup', onUp)
    this.on('pointerupoutside', onUp)
    this.on('pointercancel', onUp)

    disposables.push(() => {
      this.off('pointerdown', onDown)
      this.off('globalpointermove', onMove)
      this.off('pointerup', onUp)
      this.off('pointerupoutside', onUp)
      this.off('pointercancel', onUp)
      this.reset()
    })
  }

  /** Clear all held direction actions and unlight every quadrant. Public so
   * the keypad can call it on dispose / virtualPad toggle. */
  reset(): void {
    for (const action of this.active) this.input.release(action)
    this.active.clear()
    this.litDirs.clear()
    this.redrawFaces(this.litDirs)
    this.activePointerId = null
  }

  private updateInput(localX: number, localY: number): void {
    const dist = Math.hypot(localX, localY)

    // 8-way: snap the touch angle to the nearest of eight 45° sectors. The
    // sector's direction(s) — one for a cardinal, two for a diagonal — are
    // the quadrant(s) the touch points at. This is pure geometry and drives
    // the visual regardless of what the caller mapped.
    const dirs: Dir[] =
      dist > DEADZONE
        ? (SECTORS[((Math.round(Math.atan2(localY, localX) / (Math.PI / 4)) % 8) + 8) % 8] ?? [])
        : []

    // Game input: only the directions the caller actually mapped fire.
    const want = new Set<Action>()
    for (const dir of dirs) {
      const action = this.actions[dir]
      if (action) want.add(action)
    }

    // Reconcile press/release vs the previous frame.
    for (const action of this.active) {
      if (!want.has(action)) this.input.release(action)
    }
    for (const action of want) {
      if (!this.active.has(action)) this.input.press(action)
    }
    this.active = want

    // Redraw the lit quadrants only when the pointed-at set changes.
    let visChanged = dirs.length !== this.litDirs.size
    if (!visChanged) {
      for (const dir of dirs) {
        if (!this.litDirs.has(dir)) {
          visChanged = true
          break
        }
      }
    }
    if (visChanged) {
      this.litDirs = new Set(dirs)
      this.redrawFaces(this.litDirs)
    }
  }

  /** Redraw the quadrant fills, lighting the ones the touch currently points
   * at (geometry, regardless of mapping). A diagonal lights two adjacent
   * quadrants. */
  private redrawFaces(lit: Set<Dir>): void {
    this.faces.clear()
    for (const f of FACES) {
      if (!lit.has(f.dir)) continue
      // Annular wedge from FACE_IN to FACE_OUT spanning [a0, a1].
      this.faces
        .moveTo(Math.cos(f.a0) * FACE_IN, Math.sin(f.a0) * FACE_IN)
        .lineTo(Math.cos(f.a0) * FACE_OUT, Math.sin(f.a0) * FACE_OUT)
        .arc(0, 0, FACE_OUT, f.a0, f.a1)
        .lineTo(Math.cos(f.a1) * FACE_IN, Math.sin(f.a1) * FACE_IN)
        .arc(0, 0, FACE_IN, f.a1, f.a0, true)
        .fill(FACE_FILL)
    }
  }
}
