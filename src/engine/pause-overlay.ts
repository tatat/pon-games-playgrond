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
 * the panel; the panel owns the control's reactive bindings. */
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
 * `attachLayout` so the overlay can render a "Game" tab. */
export interface GameSettingsPanel extends Disposable {
  sections: GameSettingsSection[]
}

/** Attaches the unified pause / settings overlay. It owns the dim backdrop,
 * the panel, and the keyboard shortcuts; visibility is driven entirely by
 * `useRuntimeStore.gamePaused`. There is no separate "settings" modal —
 * pausing the game *is* opening this panel, with the settings shown inline
 * under tabs.
 *
 * Shortcuts:
 *  - `,`   toggle the overlay (pause / resume)
 *  - `Esc` close the overlay (resume) when open
 *
 * If `gameSettings` is provided a second "Game" tab is shown alongside the
 * System tab. The game panel's `dispose` is called from this attachment's
 * `dispose`, so games don't track it separately. */
export function attachPauseOverlay(
  gameContainer: Container,
  gameSettings?: GameSettingsPanel,
): Disposable {
  const theme = useRuntimeStore.getState().uiTheme

  const overlay = new PauseOverlay(theme, gameSettings)
  overlay.visible = useRuntimeStore.getState().gamePaused
  gameContainer.addChild(overlay)

  const unsubscribe = useRuntimeStore.subscribe((s) => {
    overlay.visible = s.gamePaused
  })

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Comma') {
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

  return {
    dispose: () => {
      window.removeEventListener('keydown', onKey)
      unsubscribe()
      overlay.dispose()
      gameSettings?.dispose()
      gameContainer.removeChild(overlay)
      overlay.destroy({ children: true })
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
const HOVER = 0x4a4a4e
const WHITE = 0xffffff

// Panel spans ~90% width / ~83% height of the logical 1280×720 viewport so
// the content has room to breathe and the type can be read at a glance.
const PANEL_W = 1152
const PANEL_H = 600
const PANEL_X = (DESIGN_W - PANEL_W) / 2
const PANEL_Y = (DESIGN_H - PANEL_H) / 2
const PANEL_RADIUS = 8

// The settings rows live in a centered column rather than stretching the
// full panel width — a 720-wide block reads better than a 1152-wide one.
const CONTENT_W = 720
const CONTENT_X = (PANEL_W - CONTENT_W) / 2
const ROW_LABEL_W = 280
const ROW_GAP = 52
const SECTION_GAP = 20
const SECTION_HEADER_GAP = 30

const SLIDER_W = 360
const SLIDER_TRACK_H = 5
const SLIDER_KNOB_R = 9

const TAB_Y = 40
const TAB_GAP = 40
const CONTENT_TOP_WITH_TABS = 120
const CONTENT_TOP_NO_TABS = 92

const ROW_LABEL_SIZE = 22
const SECTION_SIZE = 15
const TAB_SIZE = 22
const READOUT_SIZE = 18
const CONTROL_FONT = 20

// ── Overlay ──────────────────────────────────────────────────────────────────

type TabId = 'system' | 'game'

class PauseOverlay extends Container implements Disposable {
  private readonly panel: Container
  private readonly theme: UiTheme
  private readonly gameSettings: GameSettingsPanel | undefined
  private readonly disposables: Array<() => void> = []
  private readonly tabs: Record<TabId, Container> = {
    system: new Container(),
    game: new Container(),
  }
  private readonly tabLabels: Partial<Record<TabId, Text>> = {}
  private readonly tabUnderlines: Partial<Record<TabId, Graphics>> = {}

  constructor(theme: UiTheme, gameSettings: GameSettingsPanel | undefined) {
    super()
    this.theme = theme
    this.gameSettings = gameSettings
    this.zIndex = 9500
    this.eventMode = 'static'

    // Single full-viewport dim. Clicking it resumes (closes the overlay).
    const dim = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: 0x000000, alpha: 0.6 })
    dim.eventMode = 'static'
    dim.on('pointertap', () => this.close())
    this.addChild(dim)

    this.panel = new Container()
    this.panel.position.set(PANEL_X, PANEL_Y)
    this.panel.eventMode = 'static'
    this.panel.hitArea = new Rectangle(0, 0, PANEL_W, PANEL_H)
    this.panel.on('pointertap', (e) => e.stopPropagation())
    this.addChild(this.panel)

    this.panel.addChild(
      new Graphics().roundRect(0, 0, PANEL_W, PANEL_H, PANEL_RADIUS).fill(PANEL_BG),
    )

    this.panel.addChild(makeResumeButton(() => this.close(), theme))

    if (this.gameSettings) this.buildTabStrip()
    this.panel.addChild(this.tabs.system)
    this.panel.addChild(this.tabs.game)
    this.buildSystemTab()
    this.buildGameTab()
    this.setActiveTab('system')
  }

  private close(): void {
    useRuntimeStore.getState().setGamePaused(false)
  }

  dispose(): void {
    for (let i = this.disposables.length - 1; i >= 0; i--) this.disposables[i]?.()
    this.disposables.length = 0
  }

  private buildTabStrip(): void {
    const make = (id: TabId, label: string, x: number): { width: number } => {
      const t = new Text({
        text: label,
        style: { fill: TAB_INACTIVE, fontSize: TAB_SIZE, fontFamily: this.theme.fontSans },
      })
      t.position.set(x, TAB_Y)
      t.eventMode = 'static'
      t.cursor = 'pointer'
      t.hitArea = new Rectangle(-12, -16, t.width + 24, t.height + 32)
      t.on('pointertap', () => this.setActiveTab(id))
      this.panel.addChild(t)
      this.tabLabels[id] = t

      const underline = new Graphics().rect(0, 0, t.width, 2).fill(WHITE)
      underline.position.set(x, TAB_Y + t.height + 6)
      underline.visible = false
      this.panel.addChild(underline)
      this.tabUnderlines[id] = underline
      return { width: t.width }
    }
    const sys = make('system', 'System', CONTENT_X)
    make('game', 'Game', CONTENT_X + sys.width + TAB_GAP)
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
    let y = this.gameSettings ? CONTENT_TOP_WITH_TABS : CONTENT_TOP_NO_TABS
    const addSection = (title: string): void => {
      const t = new Text({
        text: title.toUpperCase(),
        style: {
          fill: SUBDUED,
          fontSize: SECTION_SIZE,
          fontFamily: this.theme.fontSans,
          letterSpacing: 2,
        },
      })
      t.position.set(CONTENT_X, y)
      c.addChild(t)
      y += SECTION_HEADER_GAP
    }
    const addRow = (label: string, control: Container): void => {
      const t = new Text({
        text: label,
        style: { fill: ROW_LABEL, fontSize: ROW_LABEL_SIZE, fontFamily: this.theme.fontSans },
      })
      t.position.set(CONTENT_X, y + 4)
      c.addChild(t)
      control.position.set(CONTENT_X + ROW_LABEL_W, y)
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
    if (!this.gameSettings) return
    let y = CONTENT_TOP_WITH_TABS
    let first = true
    for (const section of this.gameSettings.sections) {
      if (!first) y += SECTION_GAP
      first = false
      if (section.title) {
        const t = new Text({
          text: section.title.toUpperCase(),
          style: {
            fill: SUBDUED,
            fontSize: SECTION_SIZE,
            fontFamily: this.theme.fontSans,
            letterSpacing: 2,
          },
        })
        t.position.set(CONTENT_X, y)
        c.addChild(t)
        y += SECTION_HEADER_GAP
      }
      for (const row of section.rows) {
        const t = new Text({
          text: row.label,
          style: { fill: ROW_LABEL, fontSize: ROW_LABEL_SIZE, fontFamily: this.theme.fontSans },
        })
        t.position.set(CONTENT_X, y + 4)
        c.addChild(t)
        row.control.position.set(CONTENT_X + ROW_LABEL_W, y)
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
      style: { fill: SUBDUED, fontSize: READOUT_SIZE, fontFamily: this.theme.fontMono },
    })
    readout.anchor.set(0, 0.5)
    readout.position.set(SLIDER_W + 20, SLIDER_KNOB_R + 2)
    wrap.addChild(readout)

    const set = (v: number): void => {
      const norm = v / 100
      if (key === 'masterVolume') useSettingsStore.getState().setMasterVolume(norm)
      else if (key === 'bgmVolume') useSettingsStore.getState().setBgmVolume(norm)
      else useSettingsStore.getState().setSfxVolume(norm)
    }
    slider.onUpdate.connect(set)
    slider.onChange.connect(set)

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
      buttonW: 66,
      buttonH: 34,
      fontSize: CONTROL_FONT,
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
      buttonW: 78,
      buttonH: 34,
      fontSize: CONTROL_FONT,
    })
    this.disposables.push(() => sc.dispose())
    return sc
  }
}

// ── Visual builders ─────────────────────────────────────────────────────────

const RESUME_W = 184
const RESUME_H = 48
const RESUME_PAD_X = 18

function makeResumeButton(onPress: () => void, theme: UiTheme): Container {
  const c = new Container()
  c.position.set(PANEL_W - CONTENT_X - RESUME_W, 28)
  c.eventMode = 'static'
  c.cursor = 'pointer'
  c.hitArea = new Rectangle(0, 0, RESUME_W, RESUME_H)

  const bg = new Graphics()
  const draw = (hovered: boolean): void => {
    bg.clear()
    bg.roundRect(0, 0, RESUME_W, RESUME_H, 6).fill(hovered ? HOVER : INACTIVE)
  }
  draw(false)
  c.addChild(bg)

  const label = new Text({
    text: 'Resume',
    style: { fill: WHITE, fontSize: 20, fontFamily: theme.fontSans },
  })
  label.anchor.set(0, 0.5)
  label.position.set(RESUME_PAD_X, RESUME_H / 2)
  c.addChild(label)

  const hint = new Text({
    text: '[Esc]',
    style: { fill: SUBDUED, fontSize: 15, fontFamily: theme.fontMono },
  })
  hint.anchor.set(1, 0.5)
  hint.position.set(RESUME_W - RESUME_PAD_X, RESUME_H / 2)
  c.addChild(hint)

  c.on('pointerover', () => draw(true))
  c.on('pointerout', () => draw(false))
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

const CHECKBOX_SIZE = 26
function makeCheckedBox(): Container {
  const s = CHECKBOX_SIZE / 22
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, CHECKBOX_SIZE, CHECKBOX_SIZE, 3 * s).fill(WHITE))
  c.addChild(
    new Graphics()
      .moveTo(5 * s, 12 * s)
      .lineTo(9 * s, 16 * s)
      .lineTo(17 * s, 7 * s)
      .stroke({ color: PANEL_BG, width: 2.5 * s }),
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
