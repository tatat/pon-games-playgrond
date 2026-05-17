import type { Application } from 'pixi.js'

/** Stops `app.ticker` whenever the tab/window is hidden or loses focus, and
 * restarts it on return. Releases listeners when `signal` aborts. */
export function attachAutoPause(app: Application, signal: AbortSignal): void {
  const isHidden = () => document.hidden || !document.hasFocus()

  const update = () => {
    if (isHidden()) app.ticker.stop()
    else app.ticker.start()
  }

  document.addEventListener('visibilitychange', update)
  window.addEventListener('blur', update)
  window.addEventListener('focus', update)

  signal.addEventListener(
    'abort',
    () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('blur', update)
      window.removeEventListener('focus', update)
    },
    { once: true },
  )
}
