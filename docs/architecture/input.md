# Input

`InputManager` tracks both keyboard input (via global listeners) and virtual presses fed by Pixi UI (`@pixi/ui` buttons, custom hit areas). Gestures (swipe / drag) live in a separate helper. Gamepad can be added later behind the same `Action` interface.

Related: [Scene](./scene.md), [Responsive](./responsive.md), [State Management](./state.md).

## Pointer event rule

**All in-game pointer input goes through Pixi's `pointerdown` / `pointerup` / `pointermove` on `DisplayObject`s.** Raw browser `MouseEvent` / `TouchEvent` are not handled by game code — Pixi v8's interaction system delivers pointer events uniformly for mouse, touch, and pen via `pointerType`.

- `window.addEventListener('touchstart' | 'mousedown', …)` for gameplay is forbidden. Set `eventMode = 'static'` and `hitArea` on a `Container`, then listen to `pointerdown`.
- `@pixi/ui` `FancyButton` / `Slider` work for mouse and touch out of the box.
- Browser default scrolling / zoom is suppressed via CSS `touch-action: none` on the canvas (see [Common Pitfalls #13](../web-arcade-architecture.md#common-pitfalls)).

## `InputManager`

```typescript
// engine/input/index.ts
export type Action = string;
export type InputBindings = Record<Action, string[]>;   // keyboard codes per action

export class InputManager {
  constructor(bindings: InputBindings, signal: AbortSignal);

  press(action: Action): void;       // called by Pixi UI on pointerdown
  release(action: Action): void;     // called on pointerup / pointerupoutside

  isDown(action: Action): boolean;
  wasJustPressed(action: Action): boolean;

  /** Call once per frame after game logic. */
  endFrame(): void;
}
```

### Contract

- Bindings declare keyboard codes only. Virtual sources (on-screen buttons) feed actions directly via `press` / `release`.
- `isDown` / `wasJustPressed` are true if **either** a bound keyboard code is held or a virtual `press(action)` is currently active.
- Keyboard listeners (`keydown` / `keyup`) attach to `window` on construction and release when `signal` aborts.
- **Per-scene lifetime.** `signal` is the **per-scene** signal provided by `SceneManager` to `onEnter`, not the game signal. Each scene transition aborts the previous scene's signal, which releases its `InputManager` listeners. Virtual press state has no listener footprint, so nothing extra is required on scene exit.
- `endFrame` clears `wasJustPressed` state and must be called at the end of `onUpdate` if the scene uses just-pressed semantics.

## Virtual keypad

`engine/input/virtual-keypad/` is the shared on-screen controller. Every game declares which slots are filled; the module draws the widgets, wires pointer events to `InputManager`, and reacts to `useSettingsStore.virtualPad` + window resize. There is one canonical layout — games turn slots on and off, layout positions don't vary game-by-game.

### Slots

- **Stick slot** (left side) — a single Xbox-style thumbstick: outer ring with a draggable inner knob, sized slightly larger than the right cluster's buttons so it visibly reads as a different kind of control. The knob resolves into 1–2 simultaneously-active discrete direction actions (`left` / `right` / `up` / `down`). A diagonal drag activates both axes (e.g. `left` + `up`). Continuous-vector output is intentionally not exposed today.
- **Right stick slot** (right side, optional) — a second thumbstick for twin-stick (aim) controls, set via `rightStick`. It mirrors the left stick against the right edge and **takes the place of the A / B cluster** — the two are mutually exclusive, and when a right stick is present `actions` is ignored and the Option button sits diagonally up-left of the aim stick (Pattern 2 geometry, measured from the stick's radius).
- **A button** / **B button** (right side) — two hold-buttons drawn as circles. Both `actions.a` and `actions.b` are optional.
- **Option button** (right side) — a single tap-button drawn as a smaller circle with a hamburger glyph. The scene wires its `tap` handler to whatever opens the in-game menu (settings, pause modal, etc.).

Unassigned slots are not drawn. The other slots stay at their cluster-shape positions (see *Right cluster — 3 patterns* below). Concrete cell sizes, paddings, and gap values live as module-level constants in `engine/input/virtual-keypad/index.ts` and `engine/input/virtual-keypad/stick.ts` — read those when you need exact px values.

### API

```typescript
export type KeypadGlyph =
  | 'menu' | 'arrow-left' | 'arrow-right' | 'arrow-up' | 'arrow-down' | 'float';

export interface KeypadConfig {
  /** Left-side thumbstick. Each direction is optional. Hidden if all four
   * are unset. Stick fires `press(action)` / `release(action)` as the knob
   * crosses per-axis thresholds; diagonals fire two directions at once. */
  stick?: {
    left?: Action;
    right?: Action;
    up?: Action;
    down?: Action;
  };
  /** Right-side thumbstick (aim). When set it owns the bottom-right corner,
   * so it is mutually exclusive with `actions`; the Option button sits
   * diagonally up-left of it. Same shape and behaviour as `stick`. */
  rightStick?: {
    left?: Action;
    right?: Action;
    up?: Action;
    down?: Action;
  };
  /** Right-side A / B hold-buttons. Either or both may be assigned. Ignored
   * when `rightStick` is set. */
  actions?: {
    a?: { action: Action; label?: string; glyph?: KeypadGlyph };
    b?: { action: Action; label?: string; glyph?: KeypadGlyph };
  };
  /** Right-side option tap-button. */
  option?: { tap(): void };
}

export interface VirtualKeypad extends Disposable {
  /** Goes into `layout.uiLayer` — viewport coordinates. All widgets live
   * here; the keypad does not render anything inside `gameContainer`. */
  view: Container;
}

export function makeVirtualKeypad(
  input: InputManager,
  layout: GameLayout,
  config: KeypadConfig,
): VirtualKeypad;

export function padEnabled(): boolean;
```

### Anchoring

Widgets live in `layout.uiLayer` (viewport coordinates). The right cluster anchors to **viewport corners** with an inset pad. The bottom axis additionally leans toward the canvas when the bottom margin has room — the cluster's *top edge* drops just below `canvas-bottom`, so on phone-portrait viewports the cluster sits adjacent to the playfield rather than floating in the far bottom of the letterbox. When there's no bottom margin (canvas fills the viewport vertically), the canvas-lean falls back to the viewport-anchored value, so nothing spills off-screen.

The horizontal axis is **not** canvas-aware — the right cluster always anchors `pad` from `vp_right`. In wide-letterbox layouts the cluster sits at the viewport's right edge, not pushed inward to hug `canvas-right`. The asymmetry is intentional: the cluster's height makes a vertical lean visible and worth the complication; the horizontal slide as the margin grows reads as the cluster "moving into the margin" naturally.

The **stick** uses the same canvas-lean idea on the bottom axis but with its own larger inset — a single circle hugging `canvas-bottom + pad` like the right cluster would, looked like it was glued to the playfield, so the stick gets a softer lean that pulls it down closer to the right cluster's anchor button. The horizontal stick anchor is just viewport-left + a slightly larger outer pad than the right cluster's buttons.

There is no `sides` / `bottom` / `overlay` placement mode — one position formula handles every viewport size.

### Right cluster — 3 patterns

The right cluster shape depends on how many right-side slots are filled (counting Option + filled A + filled B). Smaller clusters get a slightly larger outer pad so they don't read as "single button stuck in the corner".

**Pattern 1 — Option only (title scenes):**

```
                       [opt]
```

The Option button sits alone in the bottom-right corner.

**Pattern 2 — Option + A (one-button gameplay):**

```
                   [opt]
                        [A]
```

A is the bottom-right anchor; Option sits diagonally up-left of A. The diagonal gap between the two circles is intentionally tight (much smaller than the right cluster's outer pad) so the pair reads as one tap-target neighbourhood rather than two separate buttons. Gap and offset are computed from circle geometry: the centre-to-centre distance along the diagonal is `R_a + R_option + GAP`, and the per-axis offset is that distance ÷ √2.

**Pattern 3 — Option + A + B (two-button gameplay):**

```
              [opt]
                              [B]
                [A]
```

The three buttons form a tilted equilateral triangle — a normal "apex up" triangle rotated CCW by a small angle (around 30–40°). Option ends up at the upper-left apex, B at the right vertex, A at the lower-left vertex. Adjacent button centres are spaced by `cell + INNER_GAP`. The triangle anchors so A's bottom edge and B's right edge each sit one outer-pad in from the viewport edges (or shifted upward by the canvas-lean when there's bottom margin to lean into).

A is **not** at the viewport corner in Pattern 3 — B is, because B is the rightmost vertex of the tilted triangle. A is pulled inward to make room for B's right-edge anchor. The whole triangle slides together as the right margin grows.

### Left cluster — stick

If the stick is configured, it sits in the bottom-left of the viewport with its own slightly-larger inset and a softer canvas-lean than the right cluster (see *Anchoring* above). If no stick directions are configured, nothing is drawn on the left.

### Stick widget detail

- **Visual**: outer ring at the slot centre; a small filled inner knob (about one-third the outer radius) starting at the centre.
- **Interaction**: `pointerdown` anywhere inside the outer ring snaps the knob to the touch position. `pointermove` follows. The knob's offset from centre is clamped to the outer radius. `pointerup` / `pointerupoutside` / `pointercancel` snaps the knob back to centre and releases every held direction.
- **Direction resolution**: a small inner deadzone keeps a near-centre touch from firing anything. Past the deadzone, each axis fires independently when its magnitude crosses a per-axis threshold (significantly larger than the deadzone). Both axes can be active at once for diagonals.
- **Unassigned directions**: if a game maps only `left` / `right` (breakout), the up / down axis fires nothing — the knob still moves freely, but no `press(up)` / `press(down)` is dispatched because the action isn't bound.
- **Multitouch**: the stick claims the first finger that lands inside the outer ring and ignores other fingers until that one releases — keeps a second finger pressing A or B from yanking the knob.

Continuous-vector output (`{x, y}` ∈ [-1,1]²) is intentionally not exposed today. Add a knob shape on the config later if a game needs it.

### Sizing

Cell sizes are **viewport-pixel constants** (do not scale with canvas) so buttons stay touch-sized on phone-portrait viewports where the canvas itself is scaled down. The trade-off is that on a small canvas the cluster covers a larger fraction of the playfield in the limit where both margins are 0; revisit the rule (e.g. a viewport-shortDim-linked clamp) if that becomes a problem on real devices.

### Whether to show the pad

`padEnabled()` combines the user setting and the coarse-pointer detection:

```typescript
function padEnabled(): boolean {
  const mode = useSettingsStore.getState().virtualPad;
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return window.matchMedia('(pointer: coarse)').matches;   // 'auto'
}
```

The module subscribes to `useSettingsStore` and `layout.onChange` internally; the scene just calls `makeVirtualKeypad` once in `onEnter` and disposes it on exit.

## Gestures (swipe / drag)

`InputManager` deliberately does **not** know about gestures — its job is discrete press/release tracking. Gestures live as small helpers in `engine/input/gesture.ts`.

```typescript
export interface SwipeOptions {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  threshold?: number;     // px, default 30
}

export function attachSwipe(
  target: Container,
  options: SwipeOptions,
  signal: AbortSignal,
): void;
```

Releases listeners on signal abort. Hold / drag / pinch helpers can be added next to `attachSwipe` as needed; keep them out of `InputManager`.

## Typical scene wiring

```typescript
class BreakoutPlayScene extends Scene {
  async onEnter(signal: AbortSignal) {
    await this.preload([/* assets */], signal);
    this.bindInput({
      left:  ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      jump:  ['Space'],
      fast:  ['ShiftLeft', 'ShiftRight'],
    });

    const keypad = this.use(makeVirtualKeypad(this.input, this.layout, {
      stick: { left: 'left', right: 'right' },
      actions: {
        a: { action: 'jump', label: 'JUMP' },
        b: { action: 'fast', label: 'FAST' },
      },
      option: { tap: () => useRuntimeStore.getState().setGamePaused(true) },
    }));
    this.layout.uiLayer.addChild(keypad.view);
    this.use(() => this.layout.uiLayer.removeChild(keypad.view));

    playBgm('breakout-bgm');
  }

  onUpdate(ticker: Ticker) {
    if (this.input.isDown('left')) { /* ... */ }
    if (this.input.wasJustPressed('jump')) { /* ... */ }
    this.input.endFrame();
  }
}
```

`this.layout` is injected by `SceneManager.attach` alongside `gameId` and `rng` — scenes do not reach into `app.stage` directly. The virtual keypad gates itself on `padEnabled()` internally; the scene does not need an `if (padEnabled())` guard.

## Virtual keypad design conventions

Recurring lessons from porting the breakout-clone keypad — read these before touching the virtual keypad module or extending it for a new game.

### Single attach point, single coordinate system

The keypad renders one `view: Container` that goes into `layout.uiLayer` (viewport coordinates). It does **not** mount anything inside `gameContainer` — there is no separate "in-canvas overlay" + "margin board" split. The space-between anchoring naturally lets widgets straddle the canvas / letterbox seam when the viewport is tight, so an explicit "overlay fallback" mode is unnecessary.

`useSettingsStore.virtualPad` gates everything (`'on'` / `'off'` / `'auto'` = coarse pointer). The module subscribes to `useSettingsStore.subscribe` AND `layout.onChange` so toggling the setting or resizing the window updates visibility / re-runs the layout live.

### Why Option is smaller than A / B

Option is the only non-gameplay slot — it's reached intentionally (open the menu / settings), not under thumb during play. Drawing it smaller than A / B does three jobs:

- Makes the gameplay buttons visually dominant. The player's eye lands on A / B first.
- Cuts the chance of fat-fingering Option on the way to A or B. The size difference acts as another tier of "this is a different kind of control" beyond the diagonal position.
- Lets Option sit further into the corner without crowding the gameplay buttons — Pattern 3's Option is well separated from the A column, and the smaller cell keeps the triangle tight.

If a title scene wants the Option button visually prominent (one button on screen, no gameplay), the call is to size the *scene's* presentation around the canonical small Option, not to make Option grow.

### Widget choice for long lists

Segmented controls are great for 2–5 picks; past that the buttons go tiny. For 7+ options (breakout-clone's 9 musical scales, 12 chromatic semitones) reach for a **stepper** instead — two arrow buttons either side of a readout cell (`engine/ui/stepper.ts`). The readout doubles as a label for the current value, the arrows are always finger-sized, and the control's footprint doesn't grow with the list length.

### Modal text hierarchy

Modal headings need a real size gap from anything underneath them or they read flat:

- Title at fontSize 26 (with a little letter-spacing), tabs / section headers at 13 — roughly 2× ratio is enough to read as "Title >> Tab" instead of two flavours of body text. Same goes for any nested heading.
- Leave ~24 px of whitespace under the title before the next element (tab strip or first row). The settings modal had ~10 px and felt cramped after the title bumped to 26.

### Visual feedback

Buttons need press feedback or they feel dead on touch (no hover state to fall back on). The cheap mistakes:

- **Don't flash white.** Brightening the fill on press flares against the dark canvas. The current pattern is "sink-in": the fill darkens (e.g. `alpha 0.3 → 0.5`), the stroke firms up (`alpha 0.25 → 0.4`), and the glyph / label alpha bumps from `0.75` → `1.0`. Same affordance, no luminance jump.
- **Don't change the button size on press.** Width / height changes pull the visual centre and break thumb tracking.

Always release on `pointerup`, `pointerupoutside`, and `pointercancel` — a finger sliding off the button must not leave it stuck in the pressed look or its `press(action)` latched.

### Common pitfalls

- **Z-index vs the tap-to-start container.** Scenes typically `addChild` a full-viewport tap Container to catch tap-to-start / tap-to-restart. Give the keypad's `view` a clearly higher `zIndex` (the module uses `250`) — otherwise the later-added tap container wins same-z ties and steals pointer events from the Option button.
- **Tap-to-jump vs JUMP button.** A scene that uses the same input action (`jump`) for tap-to-start *and* the in-game JUMP button must gate the full-viewport tap by phase, e.g. `if (this.phase !== 'playing') this.input.press('jump')`. Otherwise center-screen taps double-trigger the action during play.
- **Use the active game's font.** Pad button labels read from `useRuntimeStore.getState().uiTheme.fontSans`, not `'system-ui'` — otherwise the labels look out of place against the rest of the HUD.
- **Persistent controls cross scene boundaries.** A button the player can reach during gameplay (typically the Option button) needs to live on the title / pre-game scene too — it's the path into Settings. Reuse the same component, just configure it without the gameplay-only buttons.
- **Don't anchor persistent overlay buttons over HUD slots.** A scene's HUD already claims fixed corners (score, lives, timer); placing an always-visible touch button there forces the player to choose which they can read. Either give the button a different corner, fold it into a cluster the keypad already draws elsewhere, or hide it whenever the margin pad is showing.

