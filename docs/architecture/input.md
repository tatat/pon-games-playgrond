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

## On-screen controls helper

`engine/input/touch-pad.ts` ships templates so games that just want "left/right and a shoot button" do not reinvent layout each time. Games that want bespoke controls skip the helper and add their own `FancyButton`s.

```typescript
export function shouldShowTouchControls(): boolean;
export function padEnabled(): boolean;            // combines useSettingsStore + matchMedia

export interface DirectionalPadOptions {
  leftAction: Action;
  rightAction: Action;
  upAction?: Action;
  downAction?: Action;
}

export function createDirectionalPad(
  input: InputManager,
  layout: GameLayout,
  options: DirectionalPadOptions,
): Container;

export function createActionButton(
  input: InputManager,
  layout: GameLayout,
  action: Action,
  label: string,
): Container;
```

### Contract

- The helper returns a `Container` of buttons positioned for the current `layout.current().area` (`'sides'` / `'bottom'` / `'overlay'`) and subscribes to `layout.onChange` for resize / orientation changes.
- For `'sides'` and `'bottom'`, the container belongs on `layout.uiLayer` (viewport coords). For `'overlay'`, it belongs on `gameContainer` so it scales with the game.
- Each button wires `pointerdown` → `input.press(action)` and `pointerup` / `pointerupoutside` → `input.release(action)` so virtual presses always release even if the user drags off the button.
- The helper accepts an `AbortSignal` (typically the scene signal) and tears down its subscriptions on abort. The caller is responsible for `addChild`ing the returned container into the appropriate layer.

### Whether to show the pad

`padEnabled()` combines the user setting and the coarse-pointer detection:

```typescript
function padEnabled(): boolean {
  const mode = useSettingsStore.getState().virtualPad;
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return shouldShowTouchControls();   // 'auto'
}
```

A scene that wants a pad calls the helper in `onEnter` only when `padEnabled()`.

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
      moveLeft:  ['ArrowLeft', 'KeyA'],
      moveRight: ['ArrowRight', 'KeyD'],
      launch:    ['Space'],
      pause:     ['Escape'],
    }, signal);

    if (padEnabled()) {
      const pad = createDirectionalPad(this.input, this.layout, {
        leftAction: 'moveLeft',
        rightAction: 'moveRight',
      });
      this.layout.uiLayer.addChild(pad);
    }

    playBgm('breakout-bgm');
  }

  onUpdate(ticker: Ticker) {
    if (this.input.isDown('moveLeft')) { /* ... */ }
    if (this.input.wasJustPressed('launch')) { /* ... */ }
    this.input.endFrame();
  }
}
```

`this.layout` is injected by `SceneManager.attach` alongside `gameId` and `rng` — scenes do not reach into `app.stage` directly.

## Touch-pad design conventions

Recurring lessons from porting the breakout-clone keypad — read these before touching another game's on-screen controls.

### Margin-first, overlay-fallback

When a game needs more than a single button, the established pattern (set by `sticker-drift`'s `float-pad.ts`, then matched by `breakout-clone`'s `keypad.ts`) is:

- **Touch UI returns two attach points**, not one Container:

  ```typescript
  interface TouchPad extends Disposable {
    uiMargin:    Container;   // → layout.uiLayer (viewport coords)
    gameOverlay: Container;   // → scene container (design 1280×720 coords)
  }
  ```

- **`uiMargin` is the preferred home.** Wire it to `layout.uiLayer` and only show it when `layout.current().marginLeft` or `marginTop` is over a threshold (`MIN_REQUIRED_MARGIN_PX`, ~120 px). Buttons sized to whichever margin has room: sides → vertical boards on each side, bottom → one horizontal strip across the bottom.
- **`gameOverlay` is the no-margin fallback.** Lives inside the design viewport and overlaps the playfield. Show this only when neither margin has room.
- **`useSettingsStore.virtualPad`** still gates everything (`'on'` / `'off'` / `'auto'` = coarse pointer). Subscribe with `useSettingsStore.subscribe(apply)` AND `layout.onChange(apply)` so toggling the setting or resizing the window re-runs visibility / re-shapes the boards live.

The previous in-canvas-only approach blocked the playfield even when there was plenty of letterbox to spare; don't reach for it again unless the game explicitly wants the Phaser-original "buttons over the play area" look.

### Layout placements

`apply()` looks roughly like sticker-drift's:

```typescript
const placement: 'sides' | 'bottom' | 'overlay' =
  m.marginLeft >= MIN_REQUIRED_MARGIN_PX ? 'sides'
  : m.marginTop  >= MIN_REQUIRED_MARGIN_PX ? 'bottom'
  : 'overlay';
```

For multi-button games (breakout-clone has 4 actions + pause), use a 2×4 grid in the bottom strip — direction board fills its top row only, actions board fills its top row and bottom-right cell. All cells share the same dimensions so the four boards read as one strip.

### Pause vs gameplay buttons — edge-anchor only on sides

Pause and gameplay buttons (Float, Jump, Fast, …) want enough separation that a thumb reaching for an action can't fat-finger Pause and freeze the game. The pattern that landed splits by placement mode:

- **Sides (vertical margin):** anchor Pause to the **top** of the margin; centre the gameplay buttons vertically in the same margin. The whitespace between them does the separating, no fixed gap constant needed.
- **Bottom (horizontal strip):** keep the symmetrical group layout — the two thumbs are already separated by horizontal distance. Sticker-drift uses two equal squares side-by-side centred; breakout-clone uses the 2×2 grid (`[jump][fast]` over `[blank][pause]`) so Pause is diagonally offset from the gameplay buttons.

Don't try to apply the edge-anchor rule on the bottom strip — pushing Pause to one end of a horizontal row didn't read better than the grid, and it broke the visual symmetry between Direction and Actions boards.

A **pause-only board** (e.g. OpeningScene that has no gameplay actions yet) follows a simpler rule: top-anchored on sides like the gameplay scene's Pause, but centred horizontally across the bottom strip — there's no other button to make room for.

### Margin-board sizing — cap, don't sprawl

Letting buttons grow fluidly to fill whatever letterbox the viewport gave us made the boards "loose" on wide-margin displays. The pattern that landed:

- **Cap each button dimension.** A single shared constant (`MAX_MARGIN_BTN = 96` in breakout-clone) is plenty for thumb-sized targets without making narrow-margin layouts pinch. Buttons stay fluid up to the cap and stop growing past it.
- **Centre the board in its margin.** Once the buttons hit the cap the extra margin becomes whitespace around a centred board, not stretched buttons. Same `position.set(marginLeft / 2, viewportH / 2)` / `position.set(viewportW - marginLeft / 2, viewportH / 2)` for both side margins so paired boards read as mirrored.
- **Match anchors across paired boards.** Left-margin Direction and right-margin Actions should share a vertical anchor (both at `viewportH / 2`); same goes for any horizontal pairing in the bottom strip. Mixed anchors (one centred, one bottom-aligned) reads as inconsistent immediately.
- **Pause-only / single-button boards follow the same cap.** A title-screen pause board capped to a different size than the gameplay keypad's buttons reads as "different system" even though both adapt to the same margin.

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

- **Z-index vs the tap-to-start container.** Scenes typically `addChild` a full-viewport tap Container to catch tap-to-start / tap-to-restart. Give the touch pad's `gameOverlay` a clearly higher `zIndex` (the keypad uses `250`) — otherwise the later-added tap container wins same-z ties and steals pointer events from the pause button.
- **Tap-to-jump vs JUMP button.** A scene that uses the same input action (`jump`) for tap-to-start *and* the in-game JUMP button must gate the full-viewport tap by phase, e.g. `if (this.phase !== 'playing') this.input.press('jump')`. Otherwise center-screen taps double-trigger the action during play.
- **Use the active game's font.** Pad button labels read from `useRuntimeStore.getState().uiTheme.fontSans`, not `'system-ui'` — otherwise the labels look out of place against the rest of the HUD.
- **Persistent controls cross scene boundaries.** A button the player can reach during gameplay (typically pause) needs to live on the title / pre-game scene too — it's the path into Settings. Reuse the same component, just configure it without the gameplay-only buttons.
- **Don't anchor persistent overlay buttons over HUD slots.** A scene's HUD already claims fixed corners (score, lives, timer); placing an always-visible touch button there forces the player to choose which they can read. Either give the button a different corner, fold it into a cluster the keypad already draws elsewhere, or hide it whenever the margin pad is showing.

### Future direction: a generic controller pad

Breakout-clone's `keypad.ts` and sticker-drift's `float-pad.ts` ended up restating the same patterns — margin-first / overlay-fallback, `MAX_MARGIN_BTN` cap, press-feedback rules, virtualPad reactivity, sides Pause / bottom Pause split. The current `engine/input/touch-pad.ts` (with `createDirectionalPad` + `createActionButton`) was too low-level to absorb that — neither game uses it. The next consolidation pass should promote a single engine-level controller pad that games drive with an action slot description.

Sketch the API at the level of "what does the player's hand sit on":

- **Left side: one stick / circle slot.** Single round tap target — analog-ish on touch (could resolve into a `left` / `right` / `up` / `down` discrete action, or a `dir` vector for games that want one). Replaces both the breakout d-pad and the sticker-drift float circle's "primary input" role.
- **Right side: two main action buttons.** Famicom-style A / B. Games map these to whatever (Jump + Fast for breakout, Float for sticker-drift — one of the two might be unused). Same square button shape as today.
- **Plus one pause / option button.** Edge-anchored on sides, somewhere visually distinct on the bottom strip (or top-right overlay when no margin fits). The "options" framing leaves room for non-pause uses on games that want a third action.

Bring the layout / placement / cap / visibility logic with the move, and games stop owning a keypad file each — they just declare what fills the slots. Sticker-drift's "float fills the canvas in overlay mode" affordance is a knob the controller exposes (the primary-input slot can opt into a full-screen tap fallback in overlay mode).

Tradeoff: a too-strict shape forces games into a controller that doesn't fit their UX; the action slots have to be expressive enough to capture both breakout's hold-left/hold-right + Jump + Fast and sticker-drift's hold-float-only without per-game escape hatches. Defer the move until a third game's needs clarify the slot model.
