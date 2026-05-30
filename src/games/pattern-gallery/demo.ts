import type { Container } from 'pixi.js'
import type { InputManager } from '../../engine/input/index'
import type { Rng } from '../../engine/rng'
import type { SceneDelta } from '../../engine/scene'
import type { UiTheme } from '../../engine/ui-theme'
import { bandDemos } from './demos/bands'
import { layoutDemos } from './demos/layout'
import { motionDemos } from './demos/motion'
import { phasesDemos } from './demos/phases'
import { shapesDemos } from './demos/shapes'
import { spritesDemos } from './demos/sprites'
import { systemDemos } from './demos/system'
import { uiDemos } from './demos/ui'

/** The catalog buckets. Each is a UPPERCASE section in the menu. */
export type PatternCategory =
  | 'layout'
  | 'phases'
  | 'motion'
  | 'ui'
  | 'system'
  | 'shapes'
  | 'sprites'
  | 'bands'

/** Display order of the categories in the menu. */
export const CATEGORY_ORDER: readonly PatternCategory[] = [
  'layout',
  'phases',
  'motion',
  'ui',
  'system',
  'shapes',
  'sprites',
  'bands',
]

/** Everything a demo gets handed when it mounts into the stage. */
export interface DemoContext {
  /** Draw into this. Its origin (0,0) is the stage's top-left; it spans
   * `width × height` logical px and is already clipped to that box. */
  stage: Container
  /** Seeded RNG — never use `Math.random()`. */
  rng: Rng
  /** Keyboard actions (see `BINDINGS`) for the `system` archetype demos.
   * Pointer input is attached directly to `stage` children. */
  input: InputManager
  /** Shared engine fonts for any text the demo draws. */
  theme: UiTheme
  /** Live numeric knobs declared by `PatternDemo.params`, rendered as the
   * right-hand slider panel. Read `get(key)` each frame for motion values, or
   * `subscribe` to rebuild static layout when a value changes. The displayed
   * value is the shared vocabulary too — "flow-color-phase at pulse 220". */
  params: DemoParams
  width: number
  height: number
}

/** A tunable numeric knob shown as one slider in the param panel. */
export interface ParamSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  /** Suffix shown after the value (e.g. 'ms', 'px', '×'). */
  unit?: string
}

export interface DemoParams {
  /** Current value of `key` (its `default` until the user drags the slider). */
  get(key: string): number
  /** Notified whenever any param changes. */
  subscribe(listener: () => void): () => void
}

export interface DemoHandle {
  /** Per-frame animation. Driven by the scene's `onUpdate` (auto-paused). */
  update?(dt: SceneDelta): void
  /** Release listeners / disposables. The scene empties `stage` itself. */
  dispose?(): void
}

/** One catalog entry. `id` is the stable token used as the shared vocabulary
 * anchor — it is shown in the label bar and is what humans and agents say to
 * point at the pattern (e.g. "use the `flow-color-phase` band"). */
export interface PatternDemo {
  readonly id: string
  readonly name: string
  readonly caption: string
  readonly category: PatternCategory
  /** Inset the demo by `CONTENT_PAD` instead of drawing edge-to-edge. Use for
   * diagrams/explainers whose text or framing describes something *outside*
   * the stage (e.g. `letterbox-area`, `phase-flow`, `image-fit`). Leave off for
   * demos that *are* a full screen / playfield (HUD layouts, archetypes, rails)
   * — padding there would misrepresent the edges. */
  readonly pad?: boolean
  /** Optional tunable knobs. Rendered as the right-hand slider panel; absent
   * or empty → the panel shows "no tunable parameters". */
  readonly params?: readonly ParamSpec[]
  mount(ctx: DemoContext): DemoHandle
}

/** The single source of truth for the vocabulary: every demo, in menu order. */
export const DEMOS: readonly PatternDemo[] = [
  ...layoutDemos,
  ...phasesDemos,
  ...motionDemos,
  ...uiDemos,
  ...systemDemos,
  ...shapesDemos,
  ...spritesDemos,
  ...bandDemos,
]
