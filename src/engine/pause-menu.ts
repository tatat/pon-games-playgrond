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

  // Opaque panel that holds the title + buttons, so text never shows the
  // game scene (or scene-level "Press SPACE to start" hint) bleeding through.
  const panel = new Container()
  panel.position.set((DESIGN_W - PANEL_W) / 2, (DESIGN_H - PANEL_H) / 2)
  panel.eventMode = 'static'
  panel.hitArea = new Rectangle(0, 0, PANEL_W, PANEL_H)
  overlay.addChild(panel)

  panel.addChild(new Graphics().roundRect(0, 0, PANEL_W, PANEL_H, 6).fill(PANEL_BG))

  const title = new Text({
    text: 'PAUSED',
    style: { fill: 0xffffff, fontSize: 48, fontFamily: theme.fontSans, letterSpacing: 8 },
  })
  title.anchor.set(0.5)
  title.position.set(PANEL_W / 2, 84)
  panel.addChild(title)

  // Thin divider between the title and the link list.
  panel.addChild(new Graphics().rect(48, 144, PANEL_W - 96, 1).fill({ color: 0x3a3a3e }))

  const resume = makeMenuButton('Resume', 'P', theme, () => {
    useRuntimeStore.getState().setGamePaused(false)
  })
  resume.position.set((PANEL_W - MENU_BTN_W) / 2, 180)
  panel.addChild(resume)

  const settings = makeMenuButton('Settings', ',', theme, () => {
    opts.openSettings()
  })
  settings.position.set((PANEL_W - MENU_BTN_W) / 2, 244)
  panel.addChild(settings)

  const unsubscribe = useRuntimeStore.subscribe((s) => {
    overlay.visible = s.gamePaused
  })

  // Keyboard shortcuts:
  //  P    → toggle pause from anywhere
  //  ESC  → close the pause menu (resume) if it's open. Settings-ui
  //         intercepts ESC first when its modal is open, so this never
  //         runs in that case.
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyP') {
      e.preventDefault()
      const s = useRuntimeStore.getState()
      s.setGamePaused(!s.gamePaused)
    } else if (e.code === 'Escape') {
      const s = useRuntimeStore.getState()
      if (s.gamePaused) {
        e.preventDefault()
        s.setGamePaused(false)
      }
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

// ── Menu link (text-only, hover-highlight) ────────────────────────────────

// Panel (the opaque box that holds the title + buttons). Matches the
// settings modal's palette so the two read as siblings.
const PANEL_W = 480
const PANEL_H = 360
const PANEL_BG = 0x1a1a1c

const MENU_BTN_W = 380
const MENU_BTN_H = 40
const MENU_BTN_PADDING_X = 8
const LABEL_DEFAULT = 0xcfcfd4
const LABEL_HOVER = 0xffffff
const SHORTCUT_COLOR = 0x808088
const UNDERLINE_COLOR = 0x3a3a3e

function makeMenuButton(
  label: string,
  shortcut: string,
  theme: UiTheme,
  onPress: () => void,
): FancyButton {
  const btn = new FancyButton({
    defaultView: makeBtnView(label, shortcut, theme, 'default'),
    hoverView: makeBtnView(label, shortcut, theme, 'hover'),
    pressedView: makeBtnView(label, shortcut, theme, 'hover'),
  })
  // Pointer events land on FancyButton itself, not on its view container.
  // Without an explicit hit area FancyButton falls back to the view's
  // bounding union (label + shortcut text), so the empty middle gap
  // doesn't react. Set the full row as the hit target instead.
  btn.hitArea = new Rectangle(0, 0, MENU_BTN_W, MENU_BTN_H)
  btn.onPress.connect(onPress)
  return btn
}

function makeBtnView(
  label: string,
  shortcut: string,
  theme: UiTheme,
  state: 'default' | 'hover',
): Container {
  const c = new Container()
  // Transparent backdrop spanning the row so the view's bounds are exactly
  // MENU_BTN_W × MENU_BTN_H. Without this, FancyButton computes bounds from
  // the visible children only (label + shortcut + 1px underline) and lays
  // the view out off-center vs the button's hit area.
  c.addChild(new Graphics().rect(0, 0, MENU_BTN_W, MENU_BTN_H).fill({ color: 0x000000, alpha: 0 }))

  const labelColor = state === 'hover' ? LABEL_HOVER : LABEL_DEFAULT
  const labelText = new Text({
    text: label,
    style: { fill: labelColor, fontSize: 16, fontFamily: theme.fontSans },
  })
  labelText.anchor.set(0, 0.5)
  labelText.position.set(MENU_BTN_PADDING_X, MENU_BTN_H / 2)
  c.addChild(labelText)

  // Underline running the full width of the row (under both the label and
  // the shortcut), link-style. 1px Graphics rect since Pixi's TextStyle has
  // no `underline` property. Drawn in a muted color regardless of hover so
  // the label / shortcut text remain the eye-catchers.
  const underlineY = MENU_BTN_H / 2 + labelText.height / 2
  c.addChild(
    new Graphics()
      .rect(MENU_BTN_PADDING_X, underlineY, MENU_BTN_W - MENU_BTN_PADDING_X * 2, 1)
      .fill({ color: UNDERLINE_COLOR }),
  )

  const shortcutText = new Text({
    text: `[${shortcut}]`,
    style: { fill: SHORTCUT_COLOR, fontSize: 12, fontFamily: theme.fontMono },
  })
  shortcutText.anchor.set(1, 0.5)
  shortcutText.position.set(MENU_BTN_W - MENU_BTN_PADDING_X, MENU_BTN_H / 2)
  c.addChild(shortcutText)

  return c
}
