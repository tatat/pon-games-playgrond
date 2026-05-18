import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_W } from '../../engine/constants'
import type { InputManager } from '../../engine/input'
import type { GameLayout } from '../../engine/layout'
import type { Disposable } from '../../engine/util/disposable'
import { useRuntimeStore } from '../../store/runtime'
import { useSettingsStore, type VirtualPadMode } from '../../store/settings'

const BOARD_GAP = 24
const INNER_GAP = 6
const MIN_REQUIRED_MARGIN_PX = BOARD_GAP * 2 + 48
/** Cap each margin-board button so a wide letterbox doesn't balloon
 * the pad. The pair (menu + float) stays centred in the margin. */
const MAX_MENU_BTN = 96
/** Size of the in-viewport fallback pause button, in logical px. */
const OVERLAY_PAUSE_SIZE = 40

export interface FloatPad extends Disposable {
  /** Inside `uiLayer`. Visible only when a letterbox margin has room. */
  uiMargin: Container
  /** Inside `gameContainer` (logical coords). Holds the small fallback
   * pause button shown when there's no margin to host the full vkeypad. */
  gameOverlay: Container
}

/** Touch buttons in the letterbox margins. Each board carries a small
 * "menu" (pause) button and a large "float" button. Sides layout: one
 * vertical board per side. Bottom layout: one horizontal board across the
 * bottom strip. When neither margin has room, the pad hides — desktop
 * users have ESC, and the scene's full-viewport tap handles touch float. */
export function makeFloatPad(input: InputManager, layout: GameLayout): FloatPad {
  const uiMargin = new Container()
  const gameOverlay = new Container()
  const disposables: Array<() => void> = []

  const leftBoard = new PadBoard(input, disposables)
  const rightBoard = new PadBoard(input, disposables)
  const bottomBoard = new PadBoard(input, disposables)
  uiMargin.addChild(leftBoard, rightBoard, bottomBoard)

  const overlayPause = new ActionButton(
    'menu',
    { tap: () => useRuntimeStore.getState().setGamePaused(true) },
    disposables,
  )
  overlayPause.setShape(OVERLAY_PAUSE_SIZE, OVERLAY_PAUSE_SIZE)
  overlayPause.position.set(DESIGN_W - 12 - OVERLAY_PAUSE_SIZE / 2, 12 + OVERLAY_PAUSE_SIZE / 2)
  gameOverlay.addChild(overlayPause)

  const apply = (): void => {
    const m = layout.current()
    const padMode = useSettingsStore.getState().virtualPad
    if (!virtualPadEnabled(padMode)) {
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
  // Re-apply on layout changes and whenever the user toggles touch controls.
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

  constructor(input: InputManager, disposables: Array<() => void>) {
    super()
    this.menuBtn = new ActionButton(
      'menu',
      { tap: () => useRuntimeStore.getState().setGamePaused(true) },
      disposables,
    )
    this.floatBtn = new ActionButton(
      'float',
      {
        press: () => input.press('float'),
        release: () => input.release('float'),
      },
      disposables,
    )
    this.addChild(this.menuBtn, this.floatBtn)
  }

  setShape(width: number, height: number, orientation: Orientation): void {
    if (orientation === 'vertical') {
      // Two equal squares stacked, centred vertically in the margin.
      // Cap at MAX_MENU_BTN so a wide letterbox doesn't sprawl the pair.
      const cell = Math.min(width, (height - INNER_GAP) / 2, MAX_MENU_BTN)
      const stackH = cell * 2 + INNER_GAP
      this.menuBtn.setShape(cell, cell)
      this.floatBtn.setShape(cell, cell)
      const top = -stackH / 2
      this.menuBtn.position.set(0, top + cell / 2)
      this.floatBtn.position.set(0, top + cell + INNER_GAP + cell / 2)
    } else {
      // Horizontal mirror: two equal squares side by side, centred.
      const cell = Math.min(height, (width - INNER_GAP) / 2, MAX_MENU_BTN)
      const rowW = cell * 2 + INNER_GAP
      this.menuBtn.setShape(cell, cell)
      this.floatBtn.setShape(cell, cell)
      const left = -rowW / 2
      this.menuBtn.position.set(left + cell / 2, 0)
      this.floatBtn.position.set(left + cell + INNER_GAP + cell / 2, 0)
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
 * or press/release-driven (float). Listener teardown is appended to the
 * passed-in `disposables` array so the owning FloatPad cleans them up.
 * Press feedback mirrors breakout-clone's PadButton: the fill darkens
 * and the glyph alpha bumps from 0.7 → 1.0 — "sink in" rather than
 * flash, so the canvas brightness doesn't jump under the player. */
class ActionButton extends Container {
  private readonly bg = new Graphics()
  private readonly glyph = new Graphics()
  private readonly kind: Glyph
  private currentWidth = 0
  private currentHeight = 0
  private pressed = false

  constructor(kind: Glyph, handlers: ActionButtonHandlers, disposables: Array<() => void>) {
    super()
    this.kind = kind
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.addChild(this.bg, this.glyph)

    const setPressed = (v: boolean): void => {
      if (this.pressed === v) return
      this.pressed = v
      this.redrawBg()
      this.redrawGlyph()
    }
    const onDown = (): void => {
      setPressed(true)
      handlers.press?.()
    }
    const onUp = (): void => {
      setPressed(false)
      handlers.release?.()
    }
    const onTap = (): void => handlers.tap?.()
    this.on('pointerdown', onDown)
    this.on('pointerup', onUp)
    this.on('pointerupoutside', onUp)
    this.on('pointercancel', onUp)
    this.on('pointertap', onTap)
    disposables.push(() => {
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
    this.redrawGlyph()
    this.hitArea = new Rectangle(-width / 2, -height / 2, width, height)
  }

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

  private redrawGlyph(): void {
    this.glyph.clear()
    const alpha = this.pressed ? 1 : 0.7
    if (this.kind === 'float')
      drawFloatGlyph(this.glyph, this.currentWidth, this.currentHeight, alpha)
    else drawMenuGlyph(this.glyph, this.currentWidth, this.currentHeight, alpha)
  }
}

function drawFloatGlyph(g: Graphics, w: number, h: number, alpha: number): void {
  const tri = Math.min(w, h) * 0.4
  g.poly([0, -tri * 0.6, -tri * 0.5, tri * 0.3, tri * 0.5, tri * 0.3]).fill({
    color: 0xffffff,
    alpha,
  })
}

function drawMenuGlyph(g: Graphics, w: number, h: number, alpha: number): void {
  const barH = Math.min(w, h) * 0.5
  const barW = Math.min(w, h) * 0.12
  const gap = Math.min(w, h) * 0.16
  const left = -gap / 2 - barW
  g.rect(left, -barH / 2, barW, barH)
    .rect(left + barW + gap, -barH / 2, barW, barH)
    .fill({ color: 0xffffff, alpha })
}
