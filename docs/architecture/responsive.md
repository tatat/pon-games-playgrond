# Responsive Strategy

The canvas fills the entire viewport. Inside the canvas, the game world is projected into a fixed logical 1280×720 rectangle (`gameContainer`), centered, with the leftover viewport area (letterbox) available to Pixi for on-screen UI such as touch controls.

Related: [Plugin Interface § React ↔ Pixi Boundary](./plugin-interface.md#react--pixi-boundary), [Scene](./scene.md), [Input](./input.md).

```
viewport (e.g. 1920×1080)
┌──────────────────────────────────────────────────────┐
│ pad area (left)         pad area (right)             │
│ ┌──┐  ┌──────────────────────────────────┐  ┌──┐    │
│ │  │  │                                  │  │  │    │
│ │  │  │  gameContainer                   │  │  │    │
│ │←│  │  (logical 1280×720)               │  │→│    │
│ │  │  │  HUD, world, overlay layers      │  │  │    │
│ │  │  │                                  │  │  │    │
│ └──┘  └──────────────────────────────────┘  └──┘    │
│  pad/UI lives on uiLayer (viewport coords);          │
│  game content lives on gameContainer (logical)       │
└──────────────────────────────────────────────────────┘
```

## Application setup

`Application.init` tracks the viewport instead of a fixed resolution:

```typescript
await app.init({
  resizeTo: window,
  autoDensity: true,
  resolution: window.devicePixelRatio || 1,
  background: '#000',
  antialias: true,
});
```

`DESIGN_W` / `DESIGN_H` (1280×720) define the **logical** size scenes draw inside, not the canvas pixel size.

## `attachLayout`

```typescript
// engine/layout.ts
export function attachLayout(app: Application, signal: AbortSignal): GameLayout;

export interface GameLayout {
  gameContainer: Container;     // logical coords 0..DESIGN_W × 0..DESIGN_H
  uiLayer: Container;           // viewport coords; lives outside gameContainer
  current(): LayoutMetrics;
  onChange(cb: (m: LayoutMetrics) => void): () => void;
}

export interface LayoutMetrics {
  viewportW: number;
  viewportH: number;
  scale: number;
  gameW: number;
  gameH: number;
  marginLeft: number;
  marginTop: number;
  area: 'sides' | 'bottom' | 'overlay';   // where extra room is, used by pad helper
}
```

### Contract

- Computes `scale`, position, and `area` on mount and on every `window` resize.
- Sets `gameContainer.scale` and `gameContainer.position` so the logical 1280×720 sits centered in the viewport.
- `uiLayer` is added to `app.stage` after `gameContainer` and is **not** transformed — its children use viewport coordinates.
- Subscribes via `onChange` notify pad / debug helpers when layout shifts.
- On signal abort, removes the resize listener and clears all subscribers. Scene-level callers should additionally unsubscribe in their own `onExit` if their subscription is shorter-lived than the layout itself.

A game `start()` typically wires up like:

```typescript
const layout = attachLayout(app, signal);
attachAutoPause(app, signal);
const sm = new SceneManager(layout, app.ticker, signal, GAME_ID, rng);
```

## On-screen controls placement

The touch-pad helper reads `layout.current()` to decide where buttons live:

| `area` | Layout | Container |
|---|---|---|
| `'sides'` | D-pad in left margin, action button in right margin | `uiLayer` (viewport coords) |
| `'bottom'` | Controls in the bottom margin in a single row | `uiLayer` (viewport coords) |
| `'overlay'` | Half-transparent controls over the lower portion of the game | `gameContainer` (logical coords) |

The helper subscribes to `layout.onChange` to reposition on resize / orientation change. See [Input § On-screen controls helper](./input.md#on-screen-controls-helper).

## Safe-area handling

Pure CSS, no JS reading `env(safe-area-inset-*)`:

- `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
- React shell routes (lobby, settings, leaderboard) apply `padding: env(safe-area-inset-*)` to their own wrapper. `#root` itself stays full-screen so the game route still gets a true viewport-fill canvas.
- Canvas covers the full viewport including under the notch. Letterbox bars on phones tend to fall under the device's notch / home-indicator area in landscape, hiding them naturally.

### HUD margin rule

To stay clear of safe-area edges in the worst case (`'overlay'` layout, no letterbox), HUD elements keep **≥ 40 px** clearance from the edges of the 1280×720 logical viewport.

## Orientation

No special handling. Portrait users on a landscape-only game get a small letterboxed view. Adding a "rotate device" overlay is out of scope; see [Scope](../web-arcade-architecture.md#scope).

## UI Placement Rules

| UI element | Layer | Container | Coordinate system |
|---|---|---|---|
| Score, lives, timer (in-game HUD) | Pixi | `gameContainer` (HUD child) | Logical 1280×720 |
| Damage numbers, speech bubbles | Pixi | `gameContainer` (world child) | Logical |
| Pause / Game-over modal | Pixi | `gameContainer` (overlay child) | Logical |
| Settings (in-game), shop, inventory | Pixi | `gameContainer` (overlay child) | Logical |
| Touch pad (sides / bottom) | Pixi | `uiLayer` | Viewport |
| Touch pad (overlay) | Pixi | `gameContainer` (overlay child) | Logical (half-transparent) |
| Settings (lobby), profile | Plain React | React shell | DOM, manual |
| Lobby, leaderboards | Plain React | React shell | DOM, manual |
| Header, navigation | Plain React | React shell | DOM, manual |

## Escape hatch: React over the canvas

Under Principle 1, React should not enter the gameplay area, so this is not used by default. If a non-gameplay overlay (debug HUD, error-boundary fallback, transition screen) ever needs to sit on top of the canvas and align with the same logical coordinates as the game, mirror the `gameContainer` transform in a wrapper via `transform: scale()`. Reach for it only when a Pixi solution is genuinely worse.
