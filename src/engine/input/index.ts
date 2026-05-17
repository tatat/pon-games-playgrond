/** Discrete press/release tracker for game actions. Keyboard input is bound via
 * `bindings`; on-screen UI (Pixi `FancyButton`, custom hit areas) feeds the same
 * `Action` stream by calling `press` / `release` directly. */

export type Action = string

export type InputBindings = Record<Action, string[]>

export class InputManager {
  private readonly pressed = new Set<string>()
  private readonly justPressed = new Set<string>()
  private readonly virtual = new Set<Action>()
  private readonly justPressedVirtual = new Set<Action>()

  constructor(
    private readonly bindings: InputBindings,
    signal: AbortSignal,
  ) {
    const onDown = (e: KeyboardEvent) => {
      if (!this.pressed.has(e.code)) this.justPressed.add(e.code)
      this.pressed.add(e.code)
    }
    const onUp = (e: KeyboardEvent) => {
      this.pressed.delete(e.code)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    signal.addEventListener(
      'abort',
      () => {
        window.removeEventListener('keydown', onDown)
        window.removeEventListener('keyup', onUp)
        this.pressed.clear()
        this.justPressed.clear()
        this.virtual.clear()
        this.justPressedVirtual.clear()
      },
      { once: true },
    )
  }

  /** Called by on-screen UI on pointerdown. */
  press(action: Action): void {
    if (!this.virtual.has(action)) this.justPressedVirtual.add(action)
    this.virtual.add(action)
  }

  /** Called on pointerup / pointerupoutside so virtual presses never get stuck. */
  release(action: Action): void {
    this.virtual.delete(action)
  }

  isDown(action: Action): boolean {
    if (this.virtual.has(action)) return true
    return this.bindings[action]?.some((code) => this.pressed.has(code)) ?? false
  }

  wasJustPressed(action: Action): boolean {
    if (this.justPressedVirtual.has(action)) return true
    return this.bindings[action]?.some((code) => this.justPressed.has(code)) ?? false
  }

  /** Call once per frame after game logic. */
  endFrame(): void {
    this.justPressed.clear()
    this.justPressedVirtual.clear()
  }
}
