import { CheckBox, Slider } from '@pixi/ui'
import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { useRuntimeStore } from '../store/runtime'
import { useSettingsStore } from '../store/settings'
import { DESIGN_H, DESIGN_W } from './constants'
import { makeSegmentedControl, type SegmentedControl } from './ui/segmented-control'
import type { UiTheme } from './ui-theme'
import type { Disposable } from './util/disposable'

/** One row in a `GameSettingsPanel` — a label + a pre-built Pixi control
 * (e.g. a `SegmentedControl.view`). The engine positions the row inside
 * the modal; the panel owns the control's reactive bindings. */
export interface SettingsRow {
  label: string
  control: Container
}

/** One subsection within a `GameSettingsPanel` — an optional UPPERCASE
 * header rendered above its rows, matching the System tab's
 * Audio / Display / Controls layout. */
export interface GameSettingsSection {
  /** UPPERCASE header label. Omit to render the rows flush, no header. */
  title?: string
  rows: SettingsRow[]
}

/** Game-specific settings sections. Built by the game module (typically
 * via `pixi.js` controls + the per-game store) and handed to
 * `attachLayout` so the engine settings modal can render a "Game" tab. */
export interface GameSettingsPanel extends Disposable {
  sections: GameSettingsSection[]
}

export interface SettingsUi extends Disposable {
  /** Open the settings modal. Used by the pause menu's "Settings" button. */
  openSettings(): void
}

/** Attaches the settings modal (no on-screen trigger of its own) and returns
 * a handle. Caller wires `openSettings` into wherever the user can request
 * it (typically the pause menu). The modal lives in logical 1280×720
 * coords, captured from the active `uiTheme` at build time.
 *
 * If `gameSettings` is provided, a second "Game" tab is shown alongside the
 * System tab. The game panel's `dispose` is called from this attachment's
 * `dispose`, so games don't need to track it separately. */
export function attachSettingsUi(
  gameContainer: Container,
  gameSettings?: GameSettingsPanel,
): SettingsUi {
  const theme = useRuntimeStore.getState().uiTheme
  const root = new Container()
  // Above the pause menu overlay (z=9500) so the panel stays interactive
  // when the user opens settings from the pause menu.
  root.zIndex = 9700
  gameContainer.addChild(root)

  const modal = new SettingsModal(theme, gameSettings)
  root.addChild(modal)

  // Keyboard shortcuts:
  //  ,    → open the settings modal directly
  //  ESC  → close the modal if it's open. `stopImmediatePropagation` keeps
  //         the pause-menu listener (which is attached after this one) from
  //         also handling the same ESC and resuming the game underneath.
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Comma') {
      e.preventDefault()
      modal.open()
    } else if (e.code === 'Escape' && modal.visible) {
      e.preventDefault()
      e.stopImmediatePropagation()
      modal.close()
    }
  }
  window.addEventListener('keydown', onKey)

  return {
    openSettings: () => modal.open(),
    dispose: () => {
      window.removeEventListener('keydown', onKey)
      modal.dispose()
      gameSettings?.dispose()
      gameContainer.removeChild(root)
      root.destroy({ children: true })
    },
  }
}

// ── Tokens ─────────────────────────────────────────────────────────────────

const PANEL_BG = 0x1a1a1c
const ROW_LABEL = 0xe0e0e0
const SUBDUED = 0xa0a0a0
const TAB_INACTIVE = 0x7a7a7e
const TRACK = 0x3a3a3e
const INACTIVE = 0x3a3a3e
const WHITE = 0xffffff

const PANEL_W = 560
const PANEL_H = 520
const PANEL_RADIUS = 6
const PANEL_PADDING_X = 32
const ROW_GAP = 44
const SECTION_GAP = 16
const ROW_LABEL_W = 200
const SLIDER_W = 240
const SLIDER_TRACK_H = 4
const SLIDER_KNOB_R = 8

const TAB_STRIP_Y = 68
const TAB_GAP = 32
const CONTENT_TOP_Y = 110

// ── Modal ──────────────────────────────────────────────────────────────────

type TabId = 'system' | 'game'

class SettingsModal extends Container implements Disposable {
  private readonly overlay: Graphics
  private readonly panel: Container
  private readonly theme: UiTheme
  private readonly gameSettings: GameSettingsPanel | undefined
  private readonly disposables: Array<() => void> = []
  private readonly tabs: Record<TabId, Container> = {
    system: new Container(),
    game: new Container(),
  }
  private readonly tabLabels: Record<TabId, Text> = {} as Record<TabId, Text>
  private readonly tabUnderlines: Record<TabId, Graphics> = {} as Record<TabId, Graphics>
  private pauseSnapshot = false

  constructor(theme: UiTheme, gameSettings: GameSettingsPanel | undefined) {
    super()
    this.theme = theme
    this.gameSettings = gameSettings
    this.visible = false
    this.zIndex = 9999
    this.eventMode = 'static'

    this.overlay = new Graphics()
      .rect(0, 0, DESIGN_W, DESIGN_H)
      .fill({ color: 0x000000, alpha: 0.6 })
    this.overlay.eventMode = 'static'
    this.overlay.on('pointertap', () => this.close())
    this.addChild(this.overlay)

    this.panel = new Container()
    this.panel.position.set((DESIGN_W - PANEL_W) / 2, (DESIGN_H - PANEL_H) / 2)
    this.panel.eventMode = 'static'
    this.panel.hitArea = new Rectangle(0, 0, PANEL_W, PANEL_H)
    this.panel.on('pointertap', (e) => e.stopPropagation())
    this.addChild(this.panel)

    const bg = new Graphics().roundRect(0, 0, PANEL_W, PANEL_H, PANEL_RADIUS).fill(PANEL_BG)
    this.panel.addChild(bg)

    this.panel.addChild(makeTitle('Settings', theme))
    this.panel.addChild(makeCloseButton(() => this.close(), theme))

    if (this.gameSettings) this.buildTabStrip()
    this.panel.addChild(this.tabs.system)
    this.panel.addChild(this.tabs.game)
    this.buildSystemTab()
    this.buildGameTab()
    this.setActiveTab('system')
  }

  open(): void {
    this.pauseSnapshot = useRuntimeStore.getState().gamePaused
    this.visible = true
    useRuntimeStore.getState().setGamePaused(true)
  }
  close(): void {
    this.visible = false
    useRuntimeStore.getState().setGamePaused(this.pauseSnapshot)
  }

  dispose(): void {
    for (let i = this.disposables.length - 1; i >= 0; i--) this.disposables[i]?.()
    this.disposables.length = 0
  }

  private buildTabStrip(): void {
    const make = (id: TabId, label: string, x: number): { width: number } => {
      const t = new Text({
        text: label,
        style: { fill: TAB_INACTIVE, fontSize: 14, fontFamily: this.theme.fontSans },
      })
      t.position.set(x, TAB_STRIP_Y)
      t.eventMode = 'static'
      t.cursor = 'pointer'
      const hit = new Rectangle(-6, -4, t.width + 12, t.height + 8)
      t.hitArea = hit
      t.on('pointertap', () => this.setActiveTab(id))
      this.panel.addChild(t)
      this.tabLabels[id] = t

      // Underline: thin bar below the tab label, visible only when active.
      const underline = new Graphics().rect(0, 0, t.width, 2).fill(WHITE)
      underline.position.set(x, TAB_STRIP_Y + t.height + 4)
      underline.visible = false
      this.panel.addChild(underline)
      this.tabUnderlines[id] = underline
      return { width: t.width }
    }
    const sys = make('system', 'System', PANEL_PADDING_X)
    make('game', 'Game', PANEL_PADDING_X + sys.width + TAB_GAP)
  }

  private setActiveTab(id: TabId): void {
    if (!this.gameSettings && id === 'game') return
    this.tabs.system.visible = id === 'system'
    this.tabs.game.visible = id === 'game'
    for (const t of ['system', 'game'] as TabId[]) {
      const label = this.tabLabels[t]
      const underline = this.tabUnderlines[t]
      if (label) label.style.fill = t === id ? WHITE : TAB_INACTIVE
      if (underline) underline.visible = t === id
    }
  }

  private buildSystemTab(): void {
    const c = this.tabs.system
    // When there's no Game tab the title is the only header, so the content
    // can start right under it instead of leaving space for the strip.
    let y = this.gameSettings ? CONTENT_TOP_Y : 84
    const addSection = (title: string): void => {
      const t = new Text({
        text: title.toUpperCase(),
        style: {
          fill: SUBDUED,
          fontSize: 11,
          fontFamily: this.theme.fontSans,
          letterSpacing: 2,
        },
      })
      t.position.set(PANEL_PADDING_X, y)
      c.addChild(t)
      y += 24
    }
    const addRow = (label: string, control: Container): void => {
      const t = new Text({
        text: label,
        style: { fill: ROW_LABEL, fontSize: 14, fontFamily: this.theme.fontSans },
      })
      t.position.set(PANEL_PADDING_X, y + 6)
      c.addChild(t)
      control.position.set(PANEL_PADDING_X + ROW_LABEL_W, y)
      c.addChild(control)
      y += ROW_GAP
    }

    addSection('Audio')
    addRow('Master Volume', this.makeVolumeSlider('masterVolume'))
    addRow('Music', this.makeVolumeSlider('bgmVolume'))
    addRow('Sound Effects', this.makeVolumeSlider('sfxVolume'))
    y += SECTION_GAP
    addSection('Display')
    addRow('Show FPS Counter', this.makeShowFpsCheckbox())
    addRow('FPS Limit', this.makeMaxFpsGroup().view)
    y += SECTION_GAP
    addSection('Controls')
    addRow('Virtual Pad', this.makeVirtualPadGroup().view)
  }

  private buildGameTab(): void {
    const c = this.tabs.game
    if (!this.gameSettings) {
      // No game registered any settings — leave the tab empty; setActiveTab
      // will prevent switching to it anyway.
      return
    }
    let y = CONTENT_TOP_Y
    let first = true
    for (const section of this.gameSettings.sections) {
      if (!first) y += SECTION_GAP
      first = false
      if (section.title) {
        const t = new Text({
          text: section.title.toUpperCase(),
          style: {
            fill: SUBDUED,
            fontSize: 11,
            fontFamily: this.theme.fontSans,
            letterSpacing: 2,
          },
        })
        t.position.set(PANEL_PADDING_X, y)
        c.addChild(t)
        y += 24
      }
      for (const row of section.rows) {
        const t = new Text({
          text: row.label,
          style: { fill: ROW_LABEL, fontSize: 14, fontFamily: this.theme.fontSans },
        })
        t.position.set(PANEL_PADDING_X, y + 6)
        c.addChild(t)
        row.control.position.set(PANEL_PADDING_X + ROW_LABEL_W, y)
        c.addChild(row.control)
        y += ROW_GAP
      }
    }
  }

  private makeVolumeSlider(key: 'masterVolume' | 'bgmVolume' | 'sfxVolume'): Container {
    const wrap = new Container()
    const slider = new Slider({
      bg: makeSliderTrack(),
      fill: makeSliderFill(),
      slider: makeSliderKnob(),
      min: 0,
      max: 100,
      value: useSettingsStore.getState()[key] * 100,
      step: 1,
    })
    wrap.addChild(slider)

    const readout = new Text({
      text: formatVolume(useSettingsStore.getState()[key]),
      style: { fill: SUBDUED, fontSize: 12, fontFamily: this.theme.fontMono },
    })
    readout.anchor.set(0, 0.5)
    readout.position.set(SLIDER_W + 16, SLIDER_KNOB_R + 2)
    wrap.addChild(readout)

    const set = (v: number): void => {
      const norm = v / 100
      if (key === 'masterVolume') useSettingsStore.getState().setMasterVolume(norm)
      else if (key === 'bgmVolume') useSettingsStore.getState().setBgmVolume(norm)
      else useSettingsStore.getState().setSfxVolume(norm)
    }
    slider.onUpdate.connect(set)
    slider.onChange.connect(set)

    // Reflect external state changes (e.g. console writes) back into the UI.
    this.disposables.push(
      useSettingsStore.subscribe((s) => {
        const next = s[key] * 100
        if (Math.abs(slider.value - next) >= 0.5) slider.value = next
        readout.text = formatVolume(s[key])
      }),
    )
    return wrap
  }

  private makeShowFpsCheckbox(): Container {
    const cb = new CheckBox({
      style: { checked: makeCheckedBox(), unchecked: makeUncheckedBox() },
      checked: useSettingsStore.getState().showFps,
    })
    cb.onCheck.connect((state) => useSettingsStore.getState().setShowFps(state))
    this.disposables.push(
      useSettingsStore.subscribe((s) => {
        if (cb.checked !== s.showFps) cb.forceCheck(s.showFps)
      }),
    )
    return cb
  }

  private makeMaxFpsGroup(): SegmentedControl {
    const sc = makeSegmentedControl<number>({
      choices: [
        { label: '∞', value: 0 },
        { label: '30', value: 30 },
        { label: '60', value: 60 },
        { label: '120', value: 120 },
      ],
      getValue: () => useSettingsStore.getState().maxFps,
      onChange: (v) => useSettingsStore.getState().setMaxFps(v),
      subscribe: (cb) => useSettingsStore.subscribe(cb),
      theme: this.theme,
    })
    this.disposables.push(() => sc.dispose())
    return sc
  }

  private makeVirtualPadGroup(): SegmentedControl {
    const sc = makeSegmentedControl<'auto' | 'on' | 'off'>({
      choices: [
        { label: 'Auto', value: 'auto' },
        { label: 'On', value: 'on' },
        { label: 'Off', value: 'off' },
      ],
      getValue: () => useSettingsStore.getState().virtualPad,
      onChange: (v) => useSettingsStore.getState().setVirtualPad(v),
      subscribe: (cb) => useSettingsStore.subscribe(cb),
      theme: this.theme,
    })
    this.disposables.push(() => sc.dispose())
    return sc
  }
}

// ── Visual builders ─────────────────────────────────────────────────────────

function makeTitle(text: string, theme: UiTheme): Text {
  const t = new Text({
    text,
    style: { fill: WHITE, fontSize: 18, fontFamily: theme.fontSans },
  })
  t.position.set(PANEL_PADDING_X, 32)
  return t
}

function makeCloseButton(onPress: () => void, theme: UiTheme): Container {
  const c = new Container()
  c.eventMode = 'static'
  c.cursor = 'pointer'
  c.hitArea = new Rectangle(-12, -12, 32, 32)
  c.position.set(PANEL_W - PANEL_PADDING_X - 4, 32)
  const x = new Text({
    text: '×',
    style: { fill: SUBDUED, fontSize: 22, fontFamily: theme.fontSans },
  })
  x.anchor.set(1, 0)
  c.addChild(x)
  c.on('pointertap', onPress)
  return c
}

function makeSliderTrack(): Graphics {
  return new Graphics()
    .roundRect(0, SLIDER_KNOB_R - SLIDER_TRACK_H / 2, SLIDER_W, SLIDER_TRACK_H, SLIDER_TRACK_H / 2)
    .fill(TRACK)
}
function makeSliderFill(): Graphics {
  return new Graphics()
    .roundRect(0, SLIDER_KNOB_R - SLIDER_TRACK_H / 2, SLIDER_W, SLIDER_TRACK_H, SLIDER_TRACK_H / 2)
    .fill(WHITE)
}
function makeSliderKnob(): Graphics {
  return new Graphics().circle(0, SLIDER_KNOB_R, SLIDER_KNOB_R).fill(WHITE)
}

const CHECKBOX_SIZE = 22
function makeCheckedBox(): Container {
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, CHECKBOX_SIZE, CHECKBOX_SIZE, 3).fill(WHITE))
  c.addChild(
    new Graphics()
      .moveTo(5, 12)
      .lineTo(9, 16)
      .lineTo(17, 7)
      .stroke({ color: PANEL_BG, width: 2.5 }),
  )
  return c
}
function makeUncheckedBox(): Container {
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, CHECKBOX_SIZE, CHECKBOX_SIZE, 3).fill(INACTIVE))
  return c
}

function formatVolume(v: number): string {
  return v.toFixed(2)
}
