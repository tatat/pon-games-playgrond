import { FancyButton } from '@pixi/ui'
import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { useRuntimeStore } from '../store/runtime'
import { DESIGN_H, DESIGN_W } from './constants'
import type { UiTheme } from './ui-theme'

export interface PauseMenuOptions {
  /** Called when the user picks "Settings" in the menu. */
  openSettings(): void
}

/** Pause menu: pauses gameplay (via `useRuntimeStore.gamePaused`) and offers
 * the small set of meta-actions a player needs mid-run. Today: Resume +
 * Settings. ESC toggles the menu open / closed; the same is wired up
 * elsewhere (vkeypad menu button) by setting `gamePaused` directly. */
export function attachPauseMenu(
  gameContainer: Container,
  opts: PauseMenuOptions,
  signal: AbortSignal,
): void {
  const theme = useRuntimeStore.getState().uiTheme

  const overlay = new Container()
  overlay.zIndex = 9500
  overlay.eventMode = 'static'
  overlay.visible = useRuntimeStore.getState().gamePaused
  gameContainer.addChild(overlay)

  // Full-viewport dim. Clicks on the dim are absorbed so they don't
  // accidentally start / float / etc.
  const dim = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: 0x000000, alpha: 0.6 })
  dim.eventMode = 'static'
  overlay.addChild(dim)

  const title = new Text({
    text: 'PAUSED',
    style: { fill: 0xffffff, fontSize: 48, fontFamily: theme.fontSans, letterSpacing: 6 },
  })
  title.anchor.set(0.5)
  title.position.set(DESIGN_W / 2, DESIGN_H / 2 - 96)
  overlay.addChild(title)

  const resume = makeMenuButton('Resume', theme, () => {
    useRuntimeStore.getState().setGamePaused(false)
  })
  resume.position.set(DESIGN_W / 2 - 110, DESIGN_H / 2)
  overlay.addChild(resume)

  const settings = makeMenuButton('Settings', theme, () => {
    opts.openSettings()
  })
  settings.position.set(DESIGN_W / 2 - 110, DESIGN_H / 2 + 64)
  overlay.addChild(settings)

  const hint = new Text({
    text: 'ESC to resume',
    style: { fill: 0xa0a0a0, fontSize: 14, fontFamily: theme.fontSans },
  })
  hint.anchor.set(0.5)
  hint.position.set(DESIGN_W / 2, DESIGN_H / 2 + 144)
  overlay.addChild(hint)

  const unsubscribe = useRuntimeStore.subscribe((s) => {
    overlay.visible = s.gamePaused
  })

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault()
      const s = useRuntimeStore.getState()
      s.setGamePaused(!s.gamePaused)
    }
  }
  window.addEventListener('keydown', onKey)

  signal.addEventListener(
    'abort',
    () => {
      window.removeEventListener('keydown', onKey)
      unsubscribe()
      gameContainer.removeChild(overlay)
      overlay.destroy({ children: true })
    },
    { once: true },
  )
}

// ── Menu button (flat monochrome, matches settings-ui's pill style) ──────

const MENU_BTN_W = 220
const MENU_BTN_H = 48
const TEXT_INACTIVE = 0xffffff
const TEXT_ACTIVE = 0x1a1a1c
const FILL_INACTIVE = 0x3a3a3e
const FILL_HOVER = 0x4a4a4e
const FILL_ACTIVE = 0xffffff

function makeMenuButton(label: string, theme: UiTheme, onPress: () => void): FancyButton {
  const btn = new FancyButton({
    defaultView: makeBtnView(label, theme, 'default'),
    hoverView: makeBtnView(label, theme, 'hover'),
    pressedView: makeBtnView(label, theme, 'pressed'),
  })
  btn.onPress.connect(onPress)
  return btn
}

function makeBtnView(
  label: string,
  theme: UiTheme,
  state: 'default' | 'hover' | 'pressed',
): Container {
  const c = new Container()
  const fill = state === 'pressed' ? FILL_ACTIVE : state === 'hover' ? FILL_HOVER : FILL_INACTIVE
  const textColor = state === 'pressed' ? TEXT_ACTIVE : TEXT_INACTIVE
  // Radius matches the settings panel + vkeypad button radius (6).
  c.addChild(new Graphics().roundRect(0, 0, MENU_BTN_W, MENU_BTN_H, 6).fill(fill))
  const t = new Text({
    text: label,
    style: { fill: textColor, fontSize: 16, fontFamily: theme.fontSans },
  })
  t.anchor.set(0.5)
  t.position.set(MENU_BTN_W / 2, MENU_BTN_H / 2)
  c.addChild(t)
  // Explicit hit area so the button stays responsive regardless of where
  // FancyButton pulls bounds from.
  c.hitArea = new Rectangle(0, 0, MENU_BTN_W, MENU_BTN_H)
  return c
}
