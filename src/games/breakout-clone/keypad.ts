import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { InputManager } from '../../engine/input'
import type { Disposable } from '../../engine/util/disposable'
import { useRuntimeStore } from '../../store/runtime'
import { useSettingsStore, type VirtualPadMode } from '../../store/settings'

/** Touch keypad for breakout-clone. Lives **inside** the 1280×720 logical
 * viewport (not the letterbox margins) so the layout matches the Phaser
 * original: tall left/right tap columns on the left edge plus a stack of
 * Pause / Jump / Fast buttons in the right edge. Visibility follows
 * `useSettingsStore.virtualPad` (`'auto'` resolves to "coarse pointer"). */
export interface Keypad extends Disposable {
  /** Add this to the scene (or a UI layer with design coords). */
  view: Container
}

const COL_WIDTH = 160
const COL_GAP = 2
const COL_ALPHA = 0.1
const BTN_SIZE = 130
const BTN_MARGIN = 15
const BTN_GAP = 15
const BTN_ALPHA = 0.3
const ARROW_DROP_FROM_BOTTOM = 100

const TOGGLE_SIZE = 36
const TOGGLE_ALPHA = 0.35
/** Where the clusters end up when the user hides the keypad — fully off
 * the right edge, with a small tab still reachable. */
const HIDDEN_LEFT_X = -(COL_WIDTH * 2 + COL_GAP + 8)
const HIDDEN_RIGHT_X = BTN_SIZE + BTN_MARGIN * 2

export function makeKeypad(input: InputManager): Keypad {
  const view = new Container()
  view.zIndex = 200
  const disposables: Array<() => void> = []

  // Two clusters so the user can slide them off the respective screen
  // edges without affecting the rest of the scene graph.
  const leftCluster = new Container()
  const rightCluster = new Container()
  view.addChild(leftCluster, rightCluster)

  // Left + right hold columns (transparent, full-height tap zones on the
  // left half of the playfield). Wired as press/release on `left` /
  // `right` actions so the paddle moves while held.
  const left = makeHoldColumn('left', 0, input, disposables)
  const right = makeHoldColumn('right', COL_WIDTH + COL_GAP, input, disposables)
  leftCluster.addChild(left, right)

  // Right-edge stack (bottom-up): Fast → Jump → Pause.
  const fast = makeActionButton({
    label: 'FAST',
    onPress: () => input.press('fast'),
    onRelease: () => input.release('fast'),
    disposables,
  })
  fast.position.set(DESIGN_W - BTN_MARGIN - BTN_SIZE / 2, DESIGN_H - BTN_MARGIN - BTN_SIZE / 2)
  rightCluster.addChild(fast)

  const jump = makeActionButton({
    label: 'JUMP',
    onPress: () => input.press('jump'),
    onRelease: () => input.release('jump'),
    disposables,
  })
  jump.position.set(
    DESIGN_W - BTN_MARGIN - BTN_SIZE / 2,
    DESIGN_H - BTN_MARGIN - BTN_SIZE * 1.5 - BTN_GAP,
  )
  rightCluster.addChild(jump)

  const pause = makeActionButton({
    glyph: 'pause',
    onTap: () => useRuntimeStore.getState().setGamePaused(true),
    disposables,
  })
  pause.position.set(
    DESIGN_W - BTN_MARGIN - BTN_SIZE / 2,
    DESIGN_H - BTN_MARGIN - BTN_SIZE * 2.5 - BTN_GAP * 2,
  )
  rightCluster.addChild(pause)

  // Persistent "slide off-screen" toggle. Sits at the top-right edge so
  // the user can stash the whole keypad when it's in the way (e.g.
  // when reaching for the last brick under the JUMP button). Chevron
  // direction flips between '«' (hide → slide off-right) and '»' (show
  // → slide back in).
  let hidden = false
  const toggle = makeActionButton({
    label: '«',
    fontSize: 20,
    size: TOGGLE_SIZE,
    fillAlpha: TOGGLE_ALPHA,
    onTap: () => {
      hidden = !hidden
      leftCluster.x = hidden ? HIDDEN_LEFT_X : 0
      rightCluster.x = hidden ? HIDDEN_RIGHT_X : 0
      toggle.setLabel(hidden ? '»' : '«')
      // Drop any held inputs when we stash the pad — otherwise a
      // press-held direction would stay latched after the column slides
      // out from under the finger.
      if (hidden) {
        input.release('left')
        input.release('right')
      }
    },
    disposables,
  })
  // Below the HUD timer (which lives at y≈16 with anchor 1,0) so the
  // two don't overlap.
  toggle.position.set(DESIGN_W - BTN_MARGIN - TOGGLE_SIZE / 2, 60)
  // The toggle itself sits OUTSIDE the slidable clusters so it stays
  // reachable when the keypad is hidden.
  view.addChild(toggle)

  const apply = (): void => {
    view.visible = padEnabled(useSettingsStore.getState().virtualPad)
  }
  apply()
  const unsubSettings = useSettingsStore.subscribe(apply)
  disposables.push(unsubSettings)

  return {
    view,
    dispose: () => {
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
      // Release any presses we might still own so the next scene boots
      // with a clean InputManager.
      input.release('left')
      input.release('right')
      input.release('jump')
      input.release('fast')
    },
  }
}

function padEnabled(mode: VirtualPadMode): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

// ── Hold column ─────────────────────────────────────────────────────────

function makeHoldColumn(
  side: 'left' | 'right',
  x: number,
  input: InputManager,
  disposables: Array<() => void>,
): Container {
  const c = new Container()
  c.position.set(x, 0)
  c.eventMode = 'static'
  c.hitArea = new Rectangle(0, 0, COL_WIDTH, DESIGN_H)

  const bg = new Graphics()
    .rect(0, 0, COL_WIDTH, DESIGN_H)
    .fill({ color: 0x000000, alpha: COL_ALPHA })
  c.addChild(bg)

  // Direction triangle near the bottom of the column, matching the
  // Phaser original's 100px-from-bottom placement.
  const cx = COL_WIDTH / 2
  const cy = DESIGN_H - ARROW_DROP_FROM_BOTTOM
  const arrow = new Graphics()
  if (side === 'left') {
    arrow.poly([cx - 15, cy, cx + 10, cy - 15, cx + 10, cy + 15])
  } else {
    arrow.poly([cx + 15, cy, cx - 10, cy - 15, cx - 10, cy + 15])
  }
  arrow.fill({ color: 0xffffff, alpha: 0.6 })
  c.addChild(arrow)

  const onDown = (e: { stopPropagation?(): void }): void => {
    e.stopPropagation?.()
    input.press(side)
  }
  const onUp = (): void => input.release(side)
  c.on('pointerdown', onDown)
  c.on('pointerup', onUp)
  c.on('pointerupoutside', onUp)
  c.on('pointercancel', onUp)
  disposables.push(() => {
    c.off('pointerdown', onDown)
    c.off('pointerup', onUp)
    c.off('pointerupoutside', onUp)
    c.off('pointercancel', onUp)
  })
  return c
}

// ── Action button ───────────────────────────────────────────────────────

interface ActionButtonOptions {
  label?: string
  glyph?: 'pause'
  size?: number
  fontSize?: number
  fillAlpha?: number
  onPress?(): void
  onRelease?(): void
  onTap?(): void
  disposables: Array<() => void>
}

interface ActionButton extends Container {
  setLabel(s: string): void
}

function makeActionButton(opts: ActionButtonOptions): ActionButton {
  const size = opts.size ?? BTN_SIZE
  const fontSize = opts.fontSize ?? 22
  const fillAlpha = opts.fillAlpha ?? BTN_ALPHA

  const c = new Container() as ActionButton
  c.eventMode = 'static'
  c.hitArea = new Rectangle(-size / 2, -size / 2, size, size)

  const bg = new Graphics()
    .rect(-size / 2, -size / 2, size, size)
    .fill({ color: 0x000000, alpha: fillAlpha })
  c.addChild(bg)

  let labelText: Text | undefined
  if (opts.glyph === 'pause') {
    // Two vertical bars, mirroring the Phaser original.
    const g = new Graphics()
    g.rect(-10, -12, 4, 24).rect(6, -12, 4, 24).fill({ color: 0xffffff, alpha: 0.8 })
    c.addChild(g)
  } else if (opts.label !== undefined) {
    labelText = new Text({
      text: opts.label,
      style: { fill: 0xffffff, fontSize, fontFamily: 'system-ui' },
    })
    labelText.anchor.set(0.5)
    c.addChild(labelText)
  }

  c.setLabel = (s: string): void => {
    if (labelText) labelText.text = s
  }

  const onDown = (e: { stopPropagation?(): void }): void => {
    e.stopPropagation?.()
    opts.onPress?.()
  }
  const onUp = (): void => opts.onRelease?.()
  const onTap = (e: { stopPropagation?(): void }): void => {
    e.stopPropagation?.()
    opts.onTap?.()
  }
  c.on('pointerdown', onDown)
  c.on('pointerup', onUp)
  c.on('pointerupoutside', onUp)
  c.on('pointercancel', onUp)
  c.on('pointertap', onTap)
  opts.disposables.push(() => {
    c.off('pointerdown', onDown)
    c.off('pointerup', onUp)
    c.off('pointerupoutside', onUp)
    c.off('pointercancel', onUp)
    c.off('pointertap', onTap)
  })
  return c
}
