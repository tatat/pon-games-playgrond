/** Typography slot for engine-level UI overlays (settings modal, dev FPS
 * counter, etc.). Each `GameModule` can supply its own to keep chrome in
 * step with the game's visual identity; the default is a modern system
 * sans + monospace pair used when a module declines to override. */
export interface UiTheme {
  /** Used for labels, titles, buttons — anything text-heavy where
   * proportional spacing improves readability. */
  fontSans: string
  /** Used for numeric readouts where avoiding width jitter as digits
   * change matters more than typographic flow. */
  fontMono: string
}

export const defaultUiTheme: UiTheme = {
  fontSans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
