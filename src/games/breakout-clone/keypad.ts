import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { InputManager } from '../../engine/input'
import type { Disposable } from '../../engine/util/disposable'
import { useRuntimeStore } from '../../store/runtime'
import { useSettingsStore, type VirtualPadMode } from '../../store/settings'

/** Touch keypad for breakout-clone. Lives **inside** the 1280×720 logical
 * viewport so the layout matches the Phaser original: tall left / right
 * tap columns covering the left half of the screen, plus Jump / Fast
 * buttons stacked at the right edge. Visibility follows
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
const LABEL_FONT_SIZE = 22

const PAUSE_SIZE = 44
const PAUSE_MARGIN = 12

export function makeKeypad(input: InputManager): Keypad {
  const view = new Container()
  view.zIndex = 200
  const disposables: Array<() => void> = []
  const fontFamily = useRuntimeStore.getState().uiTheme.fontSans

  // Left + right hold columns (transparent, full-height tap zones on the
  // left half of the playfield). Wired as press/release on `left` /
  // `right` actions so the paddle moves while held.
  const leftCol = makeHoldColumn('left', 0, input, disposables)
  const rightCol = makeHoldColumn('right', COL_WIDTH + COL_GAP, input, disposables)
  view.addChild(leftCol, rightCol)

  // Right-edge stack (bottom-up): Fast → Jump. Pause lives in its own
  // top-right button (see `makePauseButton`) so the title screen can
  // share it without the rest of the keypad.
  const fast = makeActionButton({
    label: 'FAST',
    fontFamily,
    onPress: () => input.press('fast'),
    onRelease: () => input.release('fast'),
    disposables,
  })
  fast.position.set(DESIGN_W - BTN_MARGIN - BTN_SIZE / 2, DESIGN_H - BTN_MARGIN - BTN_SIZE / 2)
  view.addChild(fast)

  const jump = makeActionButton({
    label: 'JUMP',
    fontFamily,
    onPress: () => input.press('jump'),
    onRelease: () => input.release('jump'),
    disposables,
  })
  jump.position.set(
    DESIGN_W - BTN_MARGIN - BTN_SIZE / 2,
    DESIGN_H - BTN_MARGIN - BTN_SIZE * 1.5 - BTN_GAP,
  )
  view.addChild(jump)

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

/** Small top-right pause button. Always visible (independent of
 * `virtualPad`), since keyboard users still benefit from a click target
 * and the title screen has no other path to the pause menu. */
export function makePauseButton(): { view: Container; dispose(): void } {
  const disposables: Array<() => void> = []
  const btn = makeActionButton({
    glyph: 'pause',
    size: PAUSE_SIZE,
    fillAlpha: 0.3,
    onTap: () => useRuntimeStore.getState().setGamePaused(true),
    disposables,
  })
  btn.position.set(DESIGN_W - PAUSE_MARGIN - PAUSE_SIZE / 2, PAUSE_MARGIN + PAUSE_SIZE / 2)
  btn.zIndex = 200
  return {
    view: btn,
    dispose: () => {
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
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
  fontFamily?: string
  fontSize?: number
  fillAlpha?: number
  onPress?(): void
  onRelease?(): void
  onTap?(): void
  disposables: Array<() => void>
}

function makeActionButton(opts: ActionButtonOptions): Container {
  const size = opts.size ?? BTN_SIZE
  const fontFamily = opts.fontFamily ?? 'system-ui'
  const fontSize = opts.fontSize ?? LABEL_FONT_SIZE
  const fillAlpha = opts.fillAlpha ?? BTN_ALPHA

  const c = new Container()
  c.eventMode = 'static'
  c.hitArea = new Rectangle(-size / 2, -size / 2, size, size)

  const bg = new Graphics()
    .rect(-size / 2, -size / 2, size, size)
    .fill({ color: 0x000000, alpha: fillAlpha })
  c.addChild(bg)

  if (opts.glyph === 'pause') {
    // Two vertical bars, mirroring the Phaser original.
    const barH = Math.min(size * 0.45, 22)
    const barW = Math.min(size * 0.1, 4)
    const gap = Math.min(size * 0.16, 8)
    const left = -gap / 2 - barW
    const g = new Graphics()
      .rect(left, -barH / 2, barW, barH)
      .rect(left + barW + gap, -barH / 2, barW, barH)
      .fill({ color: 0xffffff, alpha: 0.85 })
    c.addChild(g)
  } else if (opts.label !== undefined) {
    const t = new Text({
      text: opts.label,
      style: { fill: 0xffffff, fontSize, fontFamily },
    })
    t.anchor.set(0.5)
    c.addChild(t)
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
