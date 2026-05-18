import type { Graphics } from 'pixi.js'

/** Visual glyphs the virtual keypad can render on a button. `'menu'` is
 * the option-slot icon (hamburger / three bars). `'float'` is
 * sticker-drift's primary-input pictogram. `'arrow-*'` glyphs are
 * available for any caller that wants to render an action button as an
 * arrow (the stick widget renders its own visuals, so it doesn't depend
 * on these). */
export type KeypadGlyph =
  | 'menu'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'float'

/** Draw a centred glyph into `g`, sized to fit a `w × h` button. `alpha`
 * is bumped on press (the "sink-in" affordance — see
 * `docs/architecture/input.md` § Visual feedback). */
export function drawGlyph(
  g: Graphics,
  glyph: KeypadGlyph,
  w: number,
  h: number,
  alpha: number,
): void {
  const s = Math.min(w, h)
  const fill = { color: 0xffffff, alpha } as const

  if (glyph === 'menu') {
    // Hamburger: three stacked horizontal bars centred on the button.
    const barW = Math.min(s * 0.55, 28)
    const barH = Math.min(s * 0.09, 4)
    const gap = Math.min(s * 0.16, 8)
    const totalH = barH * 3 + gap * 2
    const top = -totalH / 2
    g.rect(-barW / 2, top, barW, barH)
      .rect(-barW / 2, top + barH + gap, barW, barH)
      .rect(-barW / 2, top + 2 * (barH + gap), barW, barH)
      .fill(fill)
    return
  }
  if (glyph === 'arrow-left') {
    const t = s * 0.2
    g.poly([-t * 0.6, 0, t * 0.4, -t, t * 0.4, t]).fill(fill)
    return
  }
  if (glyph === 'arrow-right') {
    const t = s * 0.2
    g.poly([t * 0.6, 0, -t * 0.4, -t, -t * 0.4, t]).fill(fill)
    return
  }
  if (glyph === 'arrow-up') {
    const t = s * 0.2
    g.poly([0, -t * 0.6, -t, t * 0.4, t, t * 0.4]).fill(fill)
    return
  }
  if (glyph === 'arrow-down') {
    const t = s * 0.2
    g.poly([0, t * 0.6, -t, -t * 0.4, t, -t * 0.4]).fill(fill)
    return
  }
  if (glyph === 'float') {
    const tri = s * 0.4
    g.poly([0, -tri * 0.6, -tri * 0.5, tri * 0.3, tri * 0.5, tri * 0.3]).fill(fill)
    return
  }
}
