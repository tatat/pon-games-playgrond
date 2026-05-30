import {
  Container,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
  Graphics,
  Rectangle,
  type Text,
} from 'pixi.js'
import type { UiTheme } from '../../engine/ui-theme'
import type { Disposable } from '../../engine/util/disposable'
import { COLORS, MENU_W, RADIUS } from './constants'
import { CATEGORY_ORDER, type PatternDemo } from './demo'
import { text } from './demo-util'

interface Row {
  id: string
  y: number
  h: number
  bg: Graphics
  label: Text
}

export interface Menu extends Disposable {
  view: Container
  setActive(id: string): void
}

const ROW_H = 32
const HEADER_H = 30
const PAD = 12
const TRANSPARENT = { color: 0x000000, alpha: 0 } as const

/** Scrollable category list. Category headers are UPPERCASE; each demo is a
 * selectable row. Selection is resolved from the pointer's content-local y
 * (so the rows need no per-row listeners), and a drag past a small threshold
 * scrolls instead of selecting. Wheel scrolls too. */
export function makeMenu(
  demos: readonly PatternDemo[],
  height: number,
  theme: UiTheme,
  onSelect: (id: string) => void,
): Menu {
  const view = new Container()
  view.addChild(
    new Graphics()
      .roundRect(0, 0, MENU_W, height, RADIUS.panel)
      .fill(COLORS.panel)
      .stroke({ color: COLORS.border, width: 1 }),
  )

  const viewport = new Container()
  const mask = new Graphics().roundRect(0, 0, MENU_W, height, RADIUS.panel).fill(0xffffff)
  viewport.addChild(mask)
  viewport.mask = mask
  view.addChild(viewport)

  const content = new Container()
  viewport.addChild(content)

  const rows: Row[] = []
  let y = PAD
  for (const cat of CATEGORY_ORDER) {
    const list = demos.filter((d) => d.category === cat)
    if (list.length === 0) continue
    const header = text(cat.toUpperCase(), {
      fill: COLORS.faint,
      fontSize: 12,
      fontFamily: theme.fontSans,
      letterSpacing: 2,
    })
    header.position.set(PAD, y + 8)
    content.addChild(header)
    y += HEADER_H
    for (const d of list) {
      const bg = new Graphics()
        .roundRect(6, y, MENU_W - 12, ROW_H - 4, RADIUS.chip)
        .fill(TRANSPARENT)
      content.addChild(bg)
      const label = text(d.name, { fill: COLORS.muted, fontSize: 16, fontFamily: theme.fontSans })
      label.position.set(PAD + 6, y + 6)
      content.addChild(label)
      rows.push({ id: d.id, y, h: ROW_H, bg, label })
      y += ROW_H
    }
    y += 8
  }

  const contentH = y + PAD
  const minScroll = Math.min(0, height - contentH)
  let scrollY = 0
  const applyScroll = (): void => {
    scrollY = Math.max(minScroll, Math.min(0, scrollY))
    content.y = scrollY
  }

  view.eventMode = 'static'
  view.hitArea = new Rectangle(0, 0, MENU_W, height)

  view.on('wheel', (e: FederatedWheelEvent) => {
    scrollY -= e.deltaY
    applyScroll()
  })

  let dragging = false
  let startGlobalY = 0
  let startScroll = 0
  let moved = 0
  view.on('pointerdown', (e: FederatedPointerEvent) => {
    dragging = true
    startGlobalY = e.global.y
    startScroll = scrollY
    moved = 0
  })
  view.on('pointermove', (e: FederatedPointerEvent) => {
    if (!dragging) return
    const dy = e.global.y - startGlobalY
    moved = Math.max(moved, Math.abs(dy))
    scrollY = startScroll + dy
    applyScroll()
  })
  const onUp = (e: FederatedPointerEvent): void => {
    if (dragging && moved < 6) {
      const local = e.getLocalPosition(content)
      const row = rows.find((r) => local.y >= r.y && local.y < r.y + r.h)
      if (row) onSelect(row.id)
    }
    dragging = false
  }
  view.on('pointerup', onUp)
  view.on('pointerupoutside', () => {
    dragging = false
  })

  const setActive = (id: string): void => {
    for (const r of rows) {
      const active = r.id === id
      r.bg
        .clear()
        .roundRect(6, r.y, MENU_W - 12, ROW_H - 4, RADIUS.chip)
        .fill(active ? COLORS.rowActive : TRANSPARENT)
      r.label.tint = active ? COLORS.text : COLORS.muted
    }
  }

  return {
    view,
    setActive,
    dispose: () => {
      view.removeAllListeners()
    },
  }
}
