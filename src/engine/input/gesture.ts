import type { Container, FederatedPointerEvent } from 'pixi.js'

export interface SwipeOptions {
  onUp?: () => void
  onDown?: () => void
  onLeft?: () => void
  onRight?: () => void
  /** Minimum distance in pixels before a swipe is registered. */
  threshold?: number
}

/** Attaches a swipe gesture detector to a Pixi `Container`. The container must
 * already have `eventMode` and a `hitArea` set so it actually receives pointer
 * events. Listeners are released when `signal` aborts. */
export function attachSwipe(target: Container, options: SwipeOptions, signal: AbortSignal): void {
  let downX = 0
  let downY = 0
  const threshold = options.threshold ?? 30

  const onDown = (e: FederatedPointerEvent) => {
    downX = e.global.x
    downY = e.global.y
  }
  const onUp = (e: FederatedPointerEvent) => {
    const dx = e.global.x - downX
    const dy = e.global.y - downY
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return
    if (Math.abs(dx) > Math.abs(dy)) {
      ;(dx > 0 ? options.onRight : options.onLeft)?.()
    } else {
      ;(dy > 0 ? options.onDown : options.onUp)?.()
    }
  }

  target.on('pointerdown', onDown)
  target.on('pointerup', onUp)
  signal.addEventListener(
    'abort',
    () => {
      target.off('pointerdown', onDown)
      target.off('pointerup', onUp)
    },
    { once: true },
  )
}
