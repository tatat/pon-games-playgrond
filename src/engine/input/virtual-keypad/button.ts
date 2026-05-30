import { Circle, Container, Graphics, Text } from 'pixi.js'
import { useRuntimeStore } from '../../../store/runtime'
import { drawGlyph, type KeypadGlyph } from './glyphs'

const LABEL_FONT_SIZE = 22

export interface PadButtonOptions {
  /** Visual glyph drawn at the button centre. Mutually exclusive with `label`. */
  glyph?: KeypadGlyph
  /** Plain text label (used when no pictogram fits, e.g. JUMP / FAST). */
  label?: string
  /** Label font size. Defaults to `LABEL_FONT_SIZE`; lower it for longer
   * words (e.g. LAUNCH / ROTATE) that would otherwise crowd the disc. */
  labelSize?: number
  /** Hold semantics: fired on `pointerdown` / `pointerup` (and friends). */
  onPress?(): void
  onRelease?(): void
  /** Tap semantics: fired on `pointertap`. Use for pause / menu buttons. */
  onTap?(): void
  /** Listener teardown is appended here so the owning keypad can run them
   * in reverse on dispose without each button having to expose a dispose
   * method of its own. */
  disposables: Array<() => void>
}

/** Flat-rect virtual-pad button — the visual primitive every layout
 * mode (sides margin board, bottom strip, in-canvas overlay) builds on.
 *
 * Press feedback follows the "sink-in" rule from
 * `docs/architecture/input.md` § Visual feedback: fill darkens, stroke
 * firms up, glyph/label alpha bumps from 0.75 → 1.0 — same affordance,
 * no luminance jump against the dark canvas. */
export class PadButton extends Container {
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
        style: { fill: 0xffffff, fontSize: opts.labelSize ?? LABEL_FONT_SIZE, fontFamily },
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
    // Circular hit area — buttons are drawn as discs (see redrawBg) to
    // visually match the stick widget. Smaller dimension is the diameter.
    this.hitArea = new Circle(0, 0, Math.min(width, height) / 2)
    this.redrawGlyph()
    if (this.labelText) this.labelText.position.set(0, 0)
  }

  private redrawGlyph(): void {
    this.glyph.clear()
    if (this.opts.glyph) {
      drawGlyph(
        this.glyph,
        this.opts.glyph,
        this.currentWidth,
        this.currentHeight,
        this.pressed ? 1 : 0.75,
      )
    }
  }

  private redrawBg(): void {
    if (this.currentWidth === 0 || this.currentHeight === 0) return
    this.bg.clear()
    this.bg
      .circle(0, 0, Math.min(this.currentWidth, this.currentHeight) / 2)
      .fill({ color: 0x000000, alpha: this.pressed ? 0.5 : 0.3 })
      .stroke({ color: 0xffffff, alpha: this.pressed ? 0.4 : 0.25, width: 1.5 })
  }
}
