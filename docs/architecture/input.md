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

- **Stick slot** (left side) — a single Xbox-style thumbstick: outer ring with a draggable inner knob. The knob resolves into 1–2 simultaneously-active discrete direction actions (`left` / `right` / `up` / `down`). A diagonal drag activates both axes (e.g. `left` + `up`). Continuous-vector output is intentionally not exposed today.
- **A button** / **B button** (right side) — two hold-buttons. Both `actions.a` and `actions.b` are optional. Cell `96 px`.
- **Option button** (right side) — a single tap-button rendered with a hamburger glyph. The scene wires its `tap` handler to whatever opens the in-game menu (settings, pause modal, etc.). Cell `60 px` (smaller than A / B).

Unassigned slots are not drawn. The other slots stay at their cluster-shape positions (see *Right cluster — 3 patterns* below).

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
  /** Right-side A / B hold-buttons. Either or both may be assigned. */
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

### Anchoring — `space-between` with outer pad

Widgets live in `layout.uiLayer` (viewport coordinates) and anchor to **viewport corners** with a `pad = 15` inset — picture CSS `justify-content: space-between` with outer padding. The canvas (and any letterbox margin around it) is just the space between the two clusters; whether a widget straddles the canvas / letterbox seam falls out of viewport size, not a separate placement decision.

- At `marginLeft = 0`, the right cluster sits inside the canvas's bottom-right corner; the left cluster sits inside the bottom-left. Widgets visually overlap the playfield in that limit.
- As `marginLeft` grows, each cluster slides into the margin opposite it because `vp_right` / `vp_left` track the viewport, not the canvas. At `marginLeft ≥ 111 px` the right cluster's largest button is fully inside the right letterbox margin.
- Same logic applies vertically once `marginTop > 0` (phones in portrait): the bottom cluster anchors to `vp_bottom`, so the buttons drop into the bottom letterbox margin instead of overlapping the canvas's bottom rows.

There is no separate `sides` / `bottom` / `overlay` mode. The single anchoring rule covers every viewport size, with widgets potentially straddling the canvas / letterbox seam in between.

### Right cluster — 3 patterns

The right cluster shape depends on how many right-side slots are filled (counting Option + filled A + filled B). All positions are anchored from `(vp_right, vp_bottom)` with `pad = 15`, `INNER_GAP = 6`, A/B cell `96`, Option cell `60`.

**Pattern 1 — Option only (e.g. title scene):**

```
                       [opt]
```

- `option_center = (vp_right − 45, vp_bottom − 45)` — Option sits flush in the bottom-right corner with `pad` inset (`60/2 + 15 = 45`).

**Pattern 2 — Option + A (e.g. one-button gameplay):**

```
                  [opt]
                       [A]
```

- `A_center      = (vp_right − 63,  vp_bottom − 63)` — A flush in the bottom-right corner (`96/2 + 15 = 63`).
- `option_center = (vp_right − 147, vp_bottom − 147)` — Option diagonally up-left of A, with `INNER_GAP` between A's top-left corner and Option's bottom-right corner (`63 + 48 + 6 + 30 = 147`).

**Pattern 3 — Option + A + B (e.g. two-button gameplay):**

Tilted equilateral triangle, rotated 35° CCW from "apex up". After rotation: Option at the apex (upper-left), B at the right vertex, A at the lower vertex. Sides are `96 + 6 = 102` between adjacent button centres → circumradius `R = 102 / √3 ≈ 58.9`.

```
            [opt]
                              [B]
              [A]
```

Vertex offsets from the triangle's centre (math angle conventions, +y down):

- `option_offset = (R · cos 125°,  −R · sin 125°) ≈ (−34, −48)`
- `B_offset      = (R · cos   5°,  −R · sin   5°) ≈ (+59,  −5)`
- `A_offset      = (R · cos 245°,  −R · sin 245°) ≈ (−25, +53)`

Anchored so A's bottom edge and B's right edge each have `pad = 15` from the viewport edges:

- `triangle_centre_x = vp_right  − 63 − 59 = vp_right − 122` (B's right-edge anchor)
- `triangle_centre_y = vp_bottom − 63 − 53 = vp_bottom − 116` (A's bottom-edge anchor)

Final positions:

- `A_center      = (vp_right − 147, vp_bottom −  63)`
- `B_center      = (vp_right −  63, vp_bottom − 121)`
- `option_center = (vp_right − 156, vp_bottom − 164)`

A is **not** at the viewport corner in Pattern 3 — B is, because B is the rightmost vertex of the tilted triangle. A moves inward (147 px from the edge) and stays anchored to the viewport bottom. The whole triangle slides together as the right margin grows.

### Left cluster — stick

The stick lives at the bottom-left corner: `stick_center = (vp_left + 63, vp_bottom − 63)` (same `pad + cell/2` math as a right-cluster A button, mirrored). Cell `96` — outer ring radius `48`, inner knob radius `~16`.

If `stick` is unset (or all four directions are unset) the widget isn't drawn — the title scene's no-stick / no-A / no-B / Option-only configuration leaves the left side empty.

### Stick widget detail

- **Visual**: outer ring (radius `R = 48`) at the slot centre; a small filled inner knob (radius `~R/3 = 16`) starting at the centre.
- **Interaction**: `pointerdown` anywhere inside the outer ring snaps the knob to the touch position. `pointermove` follows. The knob's offset from centre is clamped to `R`. `pointerup` / `pointerupoutside` / `pointercancel` snaps the knob back to centre and releases every held direction.
- **Direction resolution**: a small inner deadzone (radius `~0.25 R = 12`) keeps a near-centre touch from firing anything. Past the deadzone, each axis fires independently:
  - `|dx| > 0.4 R` → `press(left)` or `press(right)` depending on sign.
  - `|dy| > 0.4 R` → `press(up)` or `press(down)` depending on sign.
  - Both axes can be active at once (diagonals).
- **Unassigned directions**: if a game maps only `left` / `right` (breakout), the up / down axis fires nothing — the knob still moves freely, but no `press(up)` / `press(down)` is dispatched because the action isn't bound.

Continuous-vector output (`{x, y}` ∈ [-1,1]²) is intentionally not exposed today. Add a knob shape on the config later if a game needs it.

### Sizing

Cell sizes are **viewport-pixel constants** (do not scale with canvas):

- A / B / Stick: `96 px`.
- Option: `60 px`.

This is `(α)` from the design discussion — buttons stay touch-sized on phone-portrait viewports where the canvas itself is scaled down to ~31% of design size. The trade-off is that on a small canvas the cluster covers a larger fraction of the playfield in the limit `marginLeft = 0` / `marginTop = 0`; revisit the rule (e.g. `(β)` viewport-shortDim-linked clamp) if that becomes a problem on real devices.

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

Option (`60 px`) is the only non-gameplay slot — it's reached intentionally (open the menu / settings), not under thumb during play. Sizing it smaller than A / B (`96 px`) does three jobs:

- Makes the gameplay buttons visually dominant. The player's eye lands on A / B first.
- Cuts the chance of fat-fingering Option on the way to A or B. The size difference acts as another tier of "this is a different kind of control" beyond the diagonal position.
- Lets Option sit further into the corner without crowding the gameplay buttons — Pattern 3's Option sits 60 px from the A column, smaller cell means a tighter triangle.

If a title scene wants the Option button visually prominent (one button on screen, no gameplay), the call is to size the *scene's* presentation around the canonical 60 px Option, not to make Option grow.

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

