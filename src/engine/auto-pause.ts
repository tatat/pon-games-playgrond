import type { Application } from 'pixi.js'
import type { Disposable } from './util/disposable'

/** Stops `app.ticker` whenever the tab/window is hidden or loses focus, and
 * restarts it on return. Caller invokes the returned `dispose` when done. */
export function attachAutoPause(app: Application): Disposable {
  const isHidden = () => document.hidden || !document.hasFocus()

  const update = () => {
    if (isHidden()) app.ticker.stop()
    else app.ticker.start()
  }

  document.addEventListener('visibilitychange', update)
  window.addEventListener('blur', update)
  window.addEventListener('focus', update)

  return {
    dispose: () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('blur', update)
      window.removeEventListener('focus', update)
    },
  }
}
