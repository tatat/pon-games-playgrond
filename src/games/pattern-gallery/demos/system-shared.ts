import { COLORS } from '../constants'
import type { DemoContext } from '../demo'
import { text } from '../demo-util'

/** Shared helpers for the `system` archetype demos (split across system-*.ts). */

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Gap from the bottom edge to the hint line. */
export const HINT_GAP = 6
/** Bottom strip reserved for the hint (≈ hint height + a gap above it). A
 * bottom-anchored player's lowest point sits at `height - FLOOR_INSET`, leaving
 * ~6px of clearance above the hint text. */
export const FLOOR_INSET = 30

/** Footer line naming the controls. The archetypes are keyboard-only — there
 * is no pointer-driven gameplay in this catalog. */
export function hint(ctx: DemoContext, message: string): void {
  const t = text(message, { fill: COLORS.faint, fontSize: 13, fontFamily: ctx.theme.fontMono })
  t.anchor.set(0.5, 1)
  t.position.set(ctx.width / 2, ctx.height - HINT_GAP)
  ctx.stage.addChild(t)
}

/** -1 / 0 / +1 from a pair of held actions. */
export const axis = (input: DemoContext['input'], neg: string, pos: string): number =>
  (input.isDown(pos) ? 1 : 0) - (input.isDown(neg) ? 1 : 0)
