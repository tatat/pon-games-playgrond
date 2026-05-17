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
