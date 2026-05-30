import { Graphics, Text, type TextStyleOptions } from 'pixi.js'
import { COLORS, RADIUS } from './constants'

/** A minimal reactive cell — the getter/setter/subscribe trio the engine UI
 * controls (`makeSegmentedControl`, `makeCheckbox`, `makeStepper`) expect,
 * without pulling a per-game Zustand store into a throwaway demo. */
export interface Reactive<T> {
  get(): T
  set(v: T): void
  subscribe(listener: () => void): () => void
}

export function reactive<T>(initial: T): Reactive<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (v) => {
      value = v
      for (const l of listeners) l()
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

/** Convenience `Text` factory with sane catalog defaults. */
export function text(content: string, style: TextStyleOptions = {}): Text {
  return new Text({
    text: content,
    style: { fill: COLORS.text, fontSize: 18, ...style },
  })
}

/** A rounded panel used to frame demo sub-areas. */
export function panel(w: number, h: number, radius: number = RADIUS.panel): Graphics {
  return new Graphics()
    .roundRect(0, 0, w, h, radius)
    .fill(COLORS.panel)
    .stroke({ color: COLORS.border, width: 1 })
}

/** A small UPPERCASE caption used to title a sub-area inside a demo. */
export function tag(content: string, fontFamily: string): Text {
  return text(content, {
    fill: COLORS.muted,
    fontSize: 13,
    fontFamily,
    letterSpacing: 2,
  })
}
