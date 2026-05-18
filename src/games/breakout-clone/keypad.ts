import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import type { InputManager } from '../../engine/input'
import type { GameLayout } from '../../engine/layout'
import type { Disposable } from '../../engine/util/disposable'
import { useRuntimeStore } from '../../store/runtime'
import { useSettingsStore, type VirtualPadMode } from '../../store/settings'

const BOARD_GAP = 24
const INNER_GAP = 6
const MIN_REQUIRED_MARGIN_PX = 120
const OVERLAY_PAUSE_SIZE = 130
const OVERLAY_PAUSE_MARGIN = 15
const IN_CANVAS_BTN_SIZE = 130
const IN_CANVAS_BTN_MARGIN = 15
const IN_CANVAS_BTN_GAP = 15
const LABEL_FONT_SIZE = 22

export interface Keypad extends Disposable {
  /** Goes into `layout.uiLayer`. Visible when virtualPad is enabled AND
   * a letterbox margin has enough room for the board layout. */
  uiMargin: Container
  /** Goes into the scene (logical 1280×720 coords). Holds the
   * always-on-top-right pause button (opening / no-margin fallback) and,
   * for `main`, the full in-canvas keypad overlay (Phaser original
   * layout: ◀▶ columns on the left + Jump/Fast stack on the right). */
  gameOverlay: Container
}

/** Touch pause button only. Used by OpeningScene — no direction / action
 * buttons there, just a reachable path into the pause + settings menu. */
export function makePauseButton(layout: GameLayout): Keypad {
  const uiMargin = new Container()
  const gameOverlay = new Container()
  // zIndex 250 keeps the pause button above any full-viewport tap
  // container the owning scene mounts for tap-to-start / -to-restart.
  gameOverlay.zIndex = 250
  const disposables: Array<() => void> = []

  const marginBoard = new PauseOnlyBoard(disposables)
  uiMargin.addChild(marginBoard)

  const overlayPause = makeOverlayPause(disposables)
  gameOverlay.addChild(overlayPause)

  const apply = (): void => {
    const m = layout.current()
    const mode = useSettingsStore.getState().virtualPad
    const enabled = padEnabled(mode)
    if (!enabled) {
      uiMargin.visible = false
      gameOverlay.visible = false
      return
    }
    const placement = placementFor(m)
    if (placement === 'sides' || placement === 'bottom') {
      marginBoard.layoutFor(placement, m)
      uiMargin.visible = true
      gameOverlay.visible = false
    } else {
      uiMargin.visible = false
      gameOverlay.visible = true
    }
  }
  apply()
  disposables.push(layout.onChange(apply))
  disposables.push(useSettingsStore.subscribe(apply))

  return {
    uiMargin,
    gameOverlay,
    dispose: () => {
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
    },
  }
}

/** Full breakout-clone keypad: direction columns / d-pad + Jump + Fast +
 * Pause. Margin-aware (sides → vertical boards, bottom → one horizontal
 * board). Falls back to an in-canvas overlay when no margin has room. */
export function makeKeypad(input: InputManager, layout: GameLayout): Keypad {
  const uiMargin = new Container()
  const gameOverlay = new Container()
  // Above any in-canvas content (bg / starfield / bricks / HUD / tap
  // container) so the keypad always receives pointer events first.
  gameOverlay.zIndex = 250
  const disposables: Array<() => void> = []

  // Margin boards: two side / one bottom — sized by `apply` below.
  const directionBoard = new DirectionBoard(input, disposables)
  const actionsBoard = new ActionsBoard(input, disposables)
  uiMargin.addChild(directionBoard, actionsBoard)

  // In-canvas overlay (no-margin fallback). Pause lives inside the
  // overlay's right-edge stack, so we don't need a separate top-right
  // button here — that would conflict with the HUD timer anyway.
  const inCanvas = new InCanvasOverlay(input, disposables)
  gameOverlay.addChild(inCanvas)

  const apply = (): void => {
    const m = layout.current()
    const mode = useSettingsStore.getState().virtualPad
    const enabled = padEnabled(mode)
    if (!enabled) {
      uiMargin.visible = false
      gameOverlay.visible = false
      input.release('left')
      input.release('right')
      input.release('jump')
      input.release('fast')
      return
    }
    const placement = placementFor(m)
    if (placement === 'sides') {
      directionBoard.layoutFor('sides', m)
      actionsBoard.layoutFor('sides', m)
      uiMargin.visible = true
      gameOverlay.visible = false
    } else if (placement === 'bottom') {
      directionBoard.layoutFor('bottom', m)
      actionsBoard.layoutFor('bottom', m)
      uiMargin.visible = true
      gameOverlay.visible = false
    } else {
      uiMargin.visible = false
      gameOverlay.visible = true
    }
  }
  apply()
  disposables.push(layout.onChange(apply))
  disposables.push(useSettingsStore.subscribe(apply))

  return {
    uiMargin,
    gameOverlay,
    dispose: () => {
      for (let i = disposables.length - 1; i >= 0; i--) disposables[i]?.()
      // Release everything we might still own so a fresh scene starts clean.
      input.release('left')
      input.release('right')
      input.release('jump')
      input.release('fast')
    },
  }
}

// ── Layout decision ─────────────────────────────────────────────────────

type Placement = 'sides' | 'bottom' | 'overlay'

function placementFor(m: { marginLeft: number; marginTop: number }): Placement {
  if (m.marginLeft >= MIN_REQUIRED_MARGIN_PX) return 'sides'
  if (m.marginTop >= MIN_REQUIRED_MARGIN_PX) return 'bottom'
  return 'overlay'
}

function padEnabled(mode: VirtualPadMode): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

// ── Pause-only board (used by OpeningScene) ─────────────────────────────

class PauseOnlyBoard extends Container {
  private readonly pause: PadButton

  constructor(disposables: Array<() => void>) {
    super()
    this.pause = new PadButton({
      glyph: 'pause',
      onTap: () => useRuntimeStore.getState().setGamePaused(true),
      disposables,
    })
    this.addChild(this.pause)
  }

  layoutFor(placement: 'sides' | 'bottom', m: ReturnType<GameLayout['current']>): void {
    if (placement === 'sides') {
      // Sit in the right margin so the user reaches it with the right
      // thumb, top-aligned to mirror the in-canvas overlay's corner.
      const w = Math.min(m.marginLeft - BOARD_GAP * 2, 96)
      const h = w
      this.pause.setShape(w, h)
      this.position.set(m.viewportW - m.marginLeft / 2, BOARD_GAP + h / 2)
    } else {
      // Bottom strip — place near the right end for the same reason.
      const h = Math.min(m.marginTop - BOARD_GAP * 2, 64)
      const w = h
      this.pause.setShape(w, h)
      this.position.set(m.viewportW - BOARD_GAP - w / 2, m.marginTop + m.gameH + m.marginTop / 2)
    }
  }
}

// ── Direction board (◀ ▶) ───────────────────────────────────────────────

class DirectionBoard extends Container {
  private readonly leftBtn: PadButton
  private readonly rightBtn: PadButton

  constructor(input: InputManager, disposables: Array<() => void>) {
    super()
    this.leftBtn = new PadButton({
      glyph: 'arrow-left',
      onPress: () => input.press('left'),
      onRelease: () => input.release('left'),
      disposables,
    })
    this.rightBtn = new PadButton({
      glyph: 'arrow-right',
      onPress: () => input.press('right'),
      onRelease: () => input.release('right'),
      disposables,
    })
    this.addChild(this.leftBtn, this.rightBtn)
  }

  layoutFor(placement: 'sides' | 'bottom', m: ReturnType<GameLayout['current']>): void {
    if (placement === 'sides') {
      // Left margin: ◀ and ▶ live side-by-side in the bottom third of
      // the margin so they fall under the thumb. Stacking them
      // vertically (◀ over ▶) is awkward because the user's thumb has
      // to leave one button to press the other.
      const marginW = m.marginLeft - BOARD_GAP * 2
      const btnW = (marginW - INNER_GAP) / 2
      const btnH = Math.min(marginW * 0.9, 96)
      this.leftBtn.setShape(btnW, btnH)
      this.rightBtn.setShape(btnW, btnH)
      this.leftBtn.position.set(-btnW / 2 - INNER_GAP / 2, 0)
      this.rightBtn.position.set(btnW / 2 + INNER_GAP / 2, 0)
      this.position.set(m.marginLeft / 2, m.viewportH - BOARD_GAP - btnH / 2)
    } else {
      // Bottom strip, left half: ◀ ▶ in the top row of a 2×2 grid
      // (bottom row stays blank to match the symmetrical Actions board
      // where Fast lives in the bottom-right cell).
      const totalW = (m.viewportW - BOARD_GAP * 3) / 2
      const totalH = m.marginTop - BOARD_GAP * 2
      const cellW = (totalW - INNER_GAP) / 2
      const cellH = (totalH - INNER_GAP) / 2
      this.leftBtn.setShape(cellW, cellH)
      this.rightBtn.setShape(cellW, cellH)
      const left = -totalW / 2
      const top = -totalH / 2
      this.leftBtn.position.set(left + cellW / 2, top + cellH / 2)
      this.rightBtn.position.set(left + cellW + INNER_GAP + cellW / 2, top + cellH / 2)
      this.position.set(BOARD_GAP + totalW / 2, m.marginTop + m.gameH + m.marginTop / 2)
    }
  }
}

// ── Actions board (Pause + Jump + Fast) ─────────────────────────────────

class ActionsBoard extends Container {
  private readonly pause: PadButton
  private readonly jump: PadButton
  private readonly fast: PadButton

  constructor(input: InputManager, disposables: Array<() => void>) {
    super()
    this.pause = new PadButton({
      glyph: 'pause',
      onTap: () => useRuntimeStore.getState().setGamePaused(true),
      disposables,
    })
    this.jump = new PadButton({
      label: 'JUMP',
      onPress: () => input.press('jump'),
      onRelease: () => input.release('jump'),
      disposables,
    })
    this.fast = new PadButton({
      label: 'FAST',
      onPress: () => input.press('fast'),
      onRelease: () => input.release('fast'),
      disposables,
    })
    this.addChild(this.pause, this.jump, this.fast)
  }

  layoutFor(placement: 'sides' | 'bottom', m: ReturnType<GameLayout['current']>): void {
    if (placement === 'sides') {
      // Right margin, vertical stack (top → bottom): Pause / Jump / Fast.
      const w = m.marginLeft - BOARD_GAP * 2
      const totalH = m.viewportH - BOARD_GAP * 2
      const pauseH = Math.max(48, totalH * 0.18)
      const remaining = totalH - pauseH - INNER_GAP * 2
      const jumpH = remaining * 0.6
      const fastH = remaining * 0.4
      this.pause.setShape(w, pauseH)
      this.jump.setShape(w, jumpH)
      this.fast.setShape(w, fastH)
      const top = -totalH / 2
      this.pause.position.set(0, top + pauseH / 2)
      this.jump.position.set(0, top + pauseH + INNER_GAP + jumpH / 2)
      this.fast.position.set(0, top + pauseH + INNER_GAP + jumpH + INNER_GAP + fastH / 2)
      this.position.set(m.viewportW - m.marginLeft / 2, m.viewportH / 2)
    } else {
      // Bottom strip, right half — 2×2 grid:
      //   [pause][jump]
      //   [blank][fast]
      // Mirrors the Direction board's 2-cell top row so the four boards
      // form a single tidy 2×4 strip.
      const totalW = (m.viewportW - BOARD_GAP * 3) / 2
      const totalH = m.marginTop - BOARD_GAP * 2
      const cellW = (totalW - INNER_GAP) / 2
      const cellH = (totalH - INNER_GAP) / 2
      this.pause.setShape(cellW, cellH)
      this.jump.setShape(cellW, cellH)
      this.fast.setShape(cellW, cellH)
      const left = -totalW / 2
      const top = -totalH / 2
      this.pause.position.set(left + cellW / 2, top + cellH / 2)
      this.jump.position.set(left + cellW + INNER_GAP + cellW / 2, top + cellH / 2)
      this.fast.position.set(
        left + cellW + INNER_GAP + cellW / 2,
        top + cellH + INNER_GAP + cellH / 2,
      )
      this.position.set(
        m.viewportW - BOARD_GAP - totalW / 2,
        m.marginTop + m.gameH + m.marginTop / 2,
      )
    }
  }
}

// ── In-canvas overlay (no-margin fallback for MainScene) ────────────────

/** In-canvas overlay used when there's no letterbox room for the margin
 * boards. Five PadButtons in the same boxed style as the margin
 * keypad: ◀ ▶ on the bottom-left, plus Pause / Jump / Fast stacked
 * top-down on the bottom-right (Pause on top, Fast at the floor). */
class InCanvasOverlay extends Container {
  constructor(input: InputManager, disposables: Array<() => void>) {
    super()
    this.zIndex = 200

    const leftBtn = new PadButton({
      glyph: 'arrow-left',
      onPress: () => input.press('left'),
      onRelease: () => input.release('left'),
      disposables,
    })
    leftBtn.setShape(IN_CANVAS_BTN_SIZE, IN_CANVAS_BTN_SIZE)
    leftBtn.position.set(
      IN_CANVAS_BTN_MARGIN + IN_CANVAS_BTN_SIZE / 2,
      DESIGN_H - IN_CANVAS_BTN_MARGIN - IN_CANVAS_BTN_SIZE / 2,
    )
    this.addChild(leftBtn)

    const rightBtn = new PadButton({
      glyph: 'arrow-right',
      onPress: () => input.press('right'),
      onRelease: () => input.release('right'),
      disposables,
    })
    rightBtn.setShape(IN_CANVAS_BTN_SIZE, IN_CANVAS_BTN_SIZE)
    rightBtn.position.set(
      IN_CANVAS_BTN_MARGIN + IN_CANVAS_BTN_SIZE * 1.5 + IN_CANVAS_BTN_GAP,
      DESIGN_H - IN_CANVAS_BTN_MARGIN - IN_CANVAS_BTN_SIZE / 2,
    )
    this.addChild(rightBtn)

    // Right-edge stack from bottom up: Fast / Jump / Pause. Each at the
    // same 130×130 size as the direction buttons.
    const stackX = DESIGN_W - IN_CANVAS_BTN_MARGIN - IN_CANVAS_BTN_SIZE / 2
    const fast = new PadButton({
      label: 'FAST',
      onPress: () => input.press('fast'),
      onRelease: () => input.release('fast'),
      disposables,
    })
    fast.setShape(IN_CANVAS_BTN_SIZE, IN_CANVAS_BTN_SIZE)
    fast.position.set(stackX, DESIGN_H - IN_CANVAS_BTN_MARGIN - IN_CANVAS_BTN_SIZE / 2)
    this.addChild(fast)

    const jump = new PadButton({
      label: 'JUMP',
      onPress: () => input.press('jump'),
      onRelease: () => input.release('jump'),
      disposables,
    })
    jump.setShape(IN_CANVAS_BTN_SIZE, IN_CANVAS_BTN_SIZE)
    jump.position.set(
      stackX,
      DESIGN_H - IN_CANVAS_BTN_MARGIN - IN_CANVAS_BTN_SIZE * 1.5 - IN_CANVAS_BTN_GAP,
    )
    this.addChild(jump)

    const pause = new PadButton({
      glyph: 'pause',
      onTap: () => useRuntimeStore.getState().setGamePaused(true),
      disposables,
    })
    pause.setShape(IN_CANVAS_BTN_SIZE, IN_CANVAS_BTN_SIZE)
    pause.position.set(
      stackX,
      DESIGN_H - IN_CANVAS_BTN_MARGIN - IN_CANVAS_BTN_SIZE * 2.5 - IN_CANVAS_BTN_GAP * 2,
    )
    this.addChild(pause)
  }
}

// ── Always-on top-right overlay pause ───────────────────────────────────

function makeOverlayPause(disposables: Array<() => void>): Container {
  const btn = new PadButton({
    glyph: 'pause',
    onTap: () => useRuntimeStore.getState().setGamePaused(true),
    disposables,
  })
  btn.setShape(OVERLAY_PAUSE_SIZE, OVERLAY_PAUSE_SIZE)
  btn.position.set(
    DESIGN_W - OVERLAY_PAUSE_MARGIN - OVERLAY_PAUSE_SIZE / 2,
    OVERLAY_PAUSE_MARGIN + OVERLAY_PAUSE_SIZE / 2,
  )
  btn.zIndex = 250
  return btn
}

// ── Button primitive ────────────────────────────────────────────────────

type Glyph = 'pause' | 'arrow-left' | 'arrow-right'

interface PadButtonOptions {
  label?: string
  glyph?: Glyph
  onPress?(): void
  onRelease?(): void
  onTap?(): void
  disposables: Array<() => void>
}

/** Flat-rect button. `setShape` lays out the background, glyph and hit
 * area. Press / release / tap callbacks are wired once in the
 * constructor; listener teardown goes into the shared disposables
 * array so the owning keypad cleans it up at scene exit. */
class PadButton extends Container {
  private readonly bg = new Graphics()
  private readonly glyph = new Graphics()
  private labelText?: Text
  private readonly opts: PadButtonOptions
  private currentWidth = 0
  private currentHeight = 0
  private pressed = false

  constructor(opts: PadButtonOptions) {
    super()
    this.opts = opts
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.addChild(this.bg, this.glyph)

    if (opts.label !== undefined) {
      const fontFamily = useRuntimeStore.getState().uiTheme.fontSans
      this.labelText = new Text({
        text: opts.label,
        style: { fill: 0xffffff, fontSize: LABEL_FONT_SIZE, fontFamily },
      })
      this.labelText.anchor.set(0.5)
      this.labelText.alpha = 0.75
      this.addChild(this.labelText)
    }

    const setPressed = (v: boolean): void => {
      if (this.pressed === v) return
      this.pressed = v
      this.redrawBg()
      this.redrawGlyph()
      if (this.labelText) this.labelText.alpha = v ? 1 : 0.75
    }
    const onDown = (e: { stopPropagation?(): void }): void => {
      e.stopPropagation?.()
      setPressed(true)
      opts.onPress?.()
    }
    const onUp = (): void => {
      setPressed(false)
      opts.onRelease?.()
    }
    const onTap = (e: { stopPropagation?(): void }): void => {
      e.stopPropagation?.()
      opts.onTap?.()
    }
    this.on('pointerdown', onDown)
    this.on('pointerup', onUp)
    this.on('pointerupoutside', onUp)
    this.on('pointercancel', onUp)
    this.on('pointertap', onTap)
    opts.disposables.push(() => {
      this.off('pointerdown', onDown)
      this.off('pointerup', onUp)
      this.off('pointerupoutside', onUp)
      this.off('pointercancel', onUp)
      this.off('pointertap', onTap)
    })
  }

  setShape(width: number, height: number): void {
    this.currentWidth = width
    this.currentHeight = height
    this.redrawBg()
    this.hitArea = new Rectangle(-width / 2, -height / 2, width, height)
    this.redrawGlyph()
    if (this.labelText) this.labelText.position.set(0, 0)
  }

  private redrawGlyph(): void {
    this.glyph.clear()
    drawGlyph(
      this.glyph,
      this.opts.glyph,
      this.currentWidth,
      this.currentHeight,
      this.pressed ? 1 : 0.75,
    )
  }

  /** Pressed buttons darken slightly and the outline firms up — reads
   * as "pushed in" rather than "lit up". */
  private redrawBg(): void {
    if (this.currentWidth === 0 || this.currentHeight === 0) return
    this.bg.clear()
    this.bg
      .roundRect(
        -this.currentWidth / 2,
        -this.currentHeight / 2,
        this.currentWidth,
        this.currentHeight,
        6,
      )
      .fill({ color: 0x000000, alpha: this.pressed ? 0.5 : 0.3 })
      .stroke({ color: 0xffffff, alpha: this.pressed ? 0.4 : 0.25, width: 1.5 })
  }
}

function drawGlyph(
  g: Graphics,
  glyph: Glyph | undefined,
  w: number,
  h: number,
  alpha: number,
): void {
  if (!glyph) return
  const s = Math.min(w, h)
  if (glyph === 'pause') {
    const barH = Math.min(s * 0.45, 22)
    const barW = Math.min(s * 0.1, 4)
    const gap = Math.min(s * 0.16, 8)
    const left = -gap / 2 - barW
    g.rect(left, -barH / 2, barW, barH)
      .rect(left + barW + gap, -barH / 2, barW, barH)
      .fill({ color: 0xffffff, alpha })
  } else if (glyph === 'arrow-left') {
    const t = s * 0.2
    g.poly([-t * 0.6, 0, t * 0.4, -t, t * 0.4, t]).fill({ color: 0xffffff, alpha })
  } else if (glyph === 'arrow-right') {
    const t = s * 0.2
    g.poly([t * 0.6, 0, -t * 0.4, -t, -t * 0.4, t]).fill({ color: 0xffffff, alpha })
  }
}
