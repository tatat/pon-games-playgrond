import { Circle, Container, type FederatedPointerEvent, Graphics } from 'pixi.js'
import type { Action, InputManager } from '../index'

/** Stick is intentionally sized larger than the action buttons (96 ÷ 2 = 48)
 * so that it visually reads as a different kind of control, not a button. */
export const OUTER_R = 56
const KNOB_R = 18
/** Radius (in stick-local px) below which a touch fires no direction. Keeps
 * accidental near-centre touches from spamming `press` / `release`. */
const DEADZONE = 14
/** Per-axis magnitude threshold. Each axis fires independently, so a touch
 * in the upper-right octant with magnitude > AXIS_THRESHOLD on both axes
 * activates both `up` and `right` simultaneously (diagonal). */
const AXIS_THRESHOLD = 22

export interface StickActions {
  left?: Action
  right?: Action
  up?: Action
  down?: Action
}

/** Xbox-style thumbstick: outer ring + draggable inner knob. Resolves the
 * knob position into discrete 4-way direction `press(action)` /
 * `release(action)` calls on the wrapped `InputManager`. Diagonals fire
 * two actions at once (e.g. `up` + `right`).
 *
 * The stick is rendered at its own origin — caller positions the container
 * by writing to `position`. Cell = `OUTER_R * 2 = 96` viewport px. */
export class Stick extends Container {
  private readonly ring = new Graphics()
  private readonly knob = new Graphics()
  private readonly input: InputManager
  private readonly actions: StickActions
  private active = new Set<Action>()
  /** Multitouch guard — once a finger claims the stick, ignore other
   * fingers' move/up events. Resets on pointerup of the claiming finger. */
  private activePointerId: number | null = null

  constructor(input: InputManager, actions: StickActions, disposables: Array<() => void>) {
    super()
    this.input = input
    this.actions = actions
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.hitArea = new Circle(0, 0, OUTER_R)

    this.ring
      .circle(0, 0, OUTER_R)
      .fill({ color: 0x000000, alpha: 0.3 })
      .stroke({ color: 0xffffff, alpha: 0.25, width: 1.5 })
    this.addChild(this.ring)

    this.knob.circle(0, 0, KNOB_R).fill({ color: 0xffffff, alpha: 0.75 })
    this.addChild(this.knob)

    const onDown = (e: FederatedPointerEvent): void => {
      if (this.activePointerId !== null) return
      this.activePointerId = e.pointerId
      e.stopPropagation()
      const local = e.getLocalPosition(this)
      this.updateKnob(local.x, local.y)
    }
    const onMove = (e: FederatedPointerEvent): void => {
      if (e.pointerId !== this.activePointerId) return
      const local = e.getLocalPosition(this)
      this.updateKnob(local.x, local.y)
    }
    const onUp = (e: FederatedPointerEvent): void => {
      if (e.pointerId !== this.activePointerId) return
      this.activePointerId = null
      this.resetKnob()
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
      this.resetKnob()
    })
  }

  /** Release the knob to centre and clear all held direction actions.
   * Public so the keypad can call it on dispose / virtualPad toggle. */
  resetKnob(): void {
    this.knob.position.set(0, 0)
    for (const action of this.active) this.input.release(action)
    this.active.clear()
    this.activePointerId = null
  }

  private updateKnob(localX: number, localY: number): void {
    const dist = Math.hypot(localX, localY)
    let x = localX
    let y = localY
    if (dist > OUTER_R) {
      x = (localX * OUTER_R) / dist
      y = (localY * OUTER_R) / dist
    }
    this.knob.position.set(x, y)

    const want = new Set<Action>()
    if (dist > DEADZONE) {
      // y is screen-down, so -y is "up" relative to the player.
      if (x > AXIS_THRESHOLD && this.actions.right) want.add(this.actions.right)
      if (x < -AXIS_THRESHOLD && this.actions.left) want.add(this.actions.left)
      if (y < -AXIS_THRESHOLD && this.actions.up) want.add(this.actions.up)
      if (y > AXIS_THRESHOLD && this.actions.down) want.add(this.actions.down)
    }

    // Reconcile press/release vs the previous frame.
    for (const action of this.active) {
      if (!want.has(action)) this.input.release(action)
    }
    for (const action of want) {
      if (!this.active.has(action)) this.input.press(action)
    }
    this.active = want
  }
}
