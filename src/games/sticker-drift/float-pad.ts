import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import type { InputManager } from '../../engine/input'
import type { GameLayout } from '../../engine/layout'
import { useRuntimeStore } from '../../store/runtime'
import { useSettingsStore, type VirtualPadMode } from '../../store/settings'

/** Equal padding around each board (the outer container) and gap between
 * the two buttons inside it. */
const BOARD_GAP = 24
const INNER_GAP = 6
const MIN_REQUIRED_MARGIN_PX = BOARD_GAP * 2 + 48
/** Fraction of the board's long axis dedicated to the menu button; the rest
 * goes to the float button. The 0.18 figure gives the menu a clearly
 * smaller hit target than the float action without making it fiddly. */
const MENU_RATIO = 0.18

export interface FloatPad {
  /** Inside `uiLayer`. Visible only when a letterbox margin has room. */
  uiMargin: Container
  /** Inside `gameContainer` (logical coords). Holds the small fallback
   * pause button shown in the top-right when there's no margin to host
   * the full vkeypad. */
  gameOverlay: Container
  dispose(): void
}

/** Size of the in-viewport fallback pause button, in logical px. */
const OVERLAY_PAUSE_SIZE = 40

/** Touch buttons in the letterbox margins. Each board carries a small
 * "menu" (pause) button and a large "float" button. Sides layout: one
 * vertical board per side. Bottom layout: one horizontal board across the
 * bottom strip. When neither margin has room, the pad hides — desktop users
 * have ESC, and the scene's full-viewport tap handles touch float. */
export function makeFloatPad(
  input: InputManager,
  layout: GameLayout,
  signal: AbortSignal,
): FloatPad {
  const uiMargin = new Container()
  const gameOverlay = new Container()

  // Two side boards (each holds menu + float) and one bottom board. Only
  // one orientation is visible at a time.
  const leftBoard = new PadBoard(input, signal)
  const rightBoard = new PadBoard(input, signal)
  const bottomBoard = new PadBoard(input, signal)
  uiMargin.addChild(leftBoard, rightBoard, bottomBoard)

  // Fallback pause-only button shown in the top-right when there's no
  // letterbox margin to host the full vkeypad. Logical coords; lives inside
  // gameContainer so it scales with the viewport.
  const overlayPause = new ActionButton('menu', signal, {
    tap: () => useRuntimeStore.getState().setGamePaused(true),
  })
  overlayPause.setShape(OVERLAY_PAUSE_SIZE, OVERLAY_PAUSE_SIZE)
  overlayPause.position.set(DESIGN_W - 12 - OVERLAY_PAUSE_SIZE / 2, 12 + OVERLAY_PAUSE_SIZE / 2)
  gameOverlay.addChild(overlayPause)

  const apply = (): void => {
    const m = layout.current()
    const padMode = useSettingsStore.getState().virtualPad
    if (!virtualPadEnabled(padMode)) {
      // User has touch controls disabled (manually or via 'auto' on a
      // pointer:fine device). Hide everything and exit early.
      leftBoard.visible = false
      rightBoard.visible = false
      bottomBoard.visible = false
      uiMargin.visible = false
      gameOverlay.visible = false
      return
    }
    const fitsSides = m.marginLeft >= MIN_REQUIRED_MARGIN_PX
    const fitsBottom = !fitsSides && m.marginTop >= MIN_REQUIRED_MARGIN_PX
    leftBoard.visible = fitsSides
    rightBoard.visible = fitsSides
    bottomBoard.visible = fitsBottom
    uiMargin.visible = fitsSides || fitsBottom
    // Show the in-viewport pause fallback only when there's no margin pad.
    gameOverlay.visible = !uiMargin.visible
    if (!uiMargin.visible) return

    if (fitsSides) {
      const w = m.marginLeft - BOARD_GAP * 2
      const h = m.viewportH - BOARD_GAP * 2
      leftBoard.setShape(w, h, 'vertical')
      rightBoard.setShape(w, h, 'vertical')
      leftBoard.position.set(m.marginLeft / 2, m.viewportH / 2)
      rightBoard.position.set(m.viewportW - m.marginLeft / 2, m.viewportH / 2)
    } else {
      const w = m.viewportW - BOARD_GAP * 2
      const h = m.marginTop - BOARD_GAP * 2
      bottomBoard.setShape(w, h, 'horizontal')
      bottomBoard.position.set(m.viewportW / 2, m.marginTop + m.gameH + m.marginTop / 2)
    }
  }
  apply()
  const unsubLayout = layout.onChange(apply)
  // Re-apply whenever the user toggles touch controls (or anything else that
  // matters to placement) — the apply function only reads, so a blanket
  // subscription is cheap.
  const unsubSettings = useSettingsStore.subscribe(apply)

  signal.addEventListener(
    'abort',
    () => {
      unsubLayout()
      unsubSettings()
    },
    { once: true },
  )

  return {
    uiMargin,
    gameOverlay,
    dispose: () => {
      unsubLayout()
      unsubSettings()
    },
  }
}

/** Resolve a `VirtualPadMode` to a boolean. 'auto' means follow the
 * device's primary pointer capability — coarse → enabled, fine → off. */
function virtualPadEnabled(mode: VirtualPadMode): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

// ── Board (menu + float) ────────────────────────────────────────────────

type Orientation = 'vertical' | 'horizontal'

class PadBoard extends Container {
  private readonly menuBtn: ActionButton
  private readonly floatBtn: ActionButton

  constructor(input: InputManager, signal: AbortSignal) {
    super()
    this.menuBtn = new ActionButton('menu', signal, {
      tap: () => useRuntimeStore.getState().setGamePaused(true),
    })
    this.floatBtn = new ActionButton('float', signal, {
      press: () => input.press('float'),
      release: () => input.release('float'),
    })
    this.addChild(this.menuBtn, this.floatBtn)
  }

  setShape(width: number, height: number, orientation: Orientation): void {
    if (orientation === 'vertical') {
      // Menu on top, float below.
      const menuH = Math.max(48, height * MENU_RATIO)
      const floatH = height - menuH - INNER_GAP
      this.menuBtn.setShape(width, menuH)
      this.floatBtn.setShape(width, floatH)
      const top = -height / 2
      this.menuBtn.position.set(0, top + menuH / 2)
      this.floatBtn.position.set(0, top + menuH + INNER_GAP + floatH / 2)
    } else {
      // Menu on left, float on right.
      const menuW = Math.max(64, width * MENU_RATIO)
      const floatW = width - menuW - INNER_GAP
      this.menuBtn.setShape(menuW, height)
      this.floatBtn.setShape(floatW, height)
      const left = -width / 2
      this.menuBtn.position.set(left + menuW / 2, 0)
      this.floatBtn.position.set(left + menuW + INNER_GAP + floatW / 2, 0)
    }
  }
}

// ── Buttons ──────────────────────────────────────────────────────────────

interface ActionButtonHandlers {
  press?: () => void
  release?: () => void
  tap?: () => void
}

type Glyph = 'menu' | 'float'

/** Flat-rect button. Centered on its position. Either tap-driven (menu)
 * or press/release-driven (float). */
class ActionButton extends Container {
  private readonly bg = new Graphics()
  private readonly glyph = new Graphics()
  private readonly kind: Glyph

  constructor(kind: Glyph, signal: AbortSignal, handlers: ActionButtonHandlers) {
    super()
    this.kind = kind
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.addChild(this.bg, this.glyph)

    const onDown = (): void => handlers.press?.()
    const onUp = (): void => handlers.release?.()
    const onTap = (): void => handlers.tap?.()
    this.on('pointerdown', onDown)
    this.on('pointerup', onUp)
    this.on('pointerupoutside', onUp)
    this.on('pointercancel', onUp)
    this.on('pointertap', onTap)
    signal.addEventListener(
      'abort',
      () => {
        this.off('pointerdown', onDown)
        this.off('pointerup', onUp)
        this.off('pointerupoutside', onUp)
        this.off('pointercancel', onUp)
        this.off('pointertap', onTap)
      },
      { once: true },
    )
  }

  setShape(width: number, height: number): void {
    this.bg.clear()
    // Matches the settings panel radius (6) for visual consistency.
    this.bg
      .roundRect(-width / 2, -height / 2, width, height, 6)
      .fill({ color: 0xffffff, alpha: 0.12 })
    this.glyph.clear()
    if (this.kind === 'float') drawFloatGlyph(this.glyph, width, height)
    else drawMenuGlyph(this.glyph, width, height)
    this.hitArea = new Rectangle(-width / 2, -height / 2, width, height)
  }
}

function drawFloatGlyph(g: Graphics, w: number, h: number): void {
  // Upward triangle, sized from the shorter side.
  const tri = Math.min(w, h) * 0.4
  g.poly([0, -tri * 0.6, -tri * 0.5, tri * 0.3, tri * 0.5, tri * 0.3]).fill({
    color: 0xffffff,
    alpha: 0.7,
  })
}

function drawMenuGlyph(g: Graphics, w: number, h: number): void {
  // Pause bars: two vertical rectangles. Bar width is small relative to
  // button size, but readable.
  const barH = Math.min(w, h) * 0.5
  const barW = Math.min(w, h) * 0.12
  const gap = Math.min(w, h) * 0.16
  const left = -gap / 2 - barW
  g.rect(left, -barH / 2, barW, barH)
    .rect(left + barW + gap, -barH / 2, barW, barH)
    .fill({ color: 0xffffff, alpha: 0.7 })
}
