import { CheckBox, Slider } from '@pixi/ui'
import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { useRuntimeStore } from '../store/runtime'
import { useSettingsStore } from '../store/settings'
import { DESIGN_H, DESIGN_W } from './constants'
import { makeSegmentedControl, type SegmentedControl } from './ui/segmented-control'
import type { UiTheme } from './ui-theme'
import type { Disposable } from './util/disposable'

export interface SettingsUi extends Disposable {
  /** Open the settings modal. Used by the pause menu's "Settings" button. */
  openSettings(): void
}

/** Attaches the settings modal (no on-screen trigger of its own) and returns
 * a handle. Caller wires `openSettings` into wherever the user can request
 * it (typically the pause menu). The modal lives in logical 1280×720
 * coords, captured from the active `uiTheme` at build time. */
export function attachSettingsUi(gameContainer: Container): SettingsUi {
  const theme = useRuntimeStore.getState().uiTheme
  const root = new Container()
  // Above the pause menu overlay (z=9500) so the panel stays interactive
  // when the user opens settings from the pause menu.
  root.zIndex = 9700
  gameContainer.addChild(root)

  const modal = new SettingsModal(theme)
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
      gameContainer.removeChild(root)
      root.destroy({ children: true })
    },
  }
}

// ── Tokens ─────────────────────────────────────────────────────────────────

const PANEL_BG = 0x1a1a1c
const ROW_LABEL = 0xe0e0e0
const SUBDUED = 0xa0a0a0
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

// ── Modal ──────────────────────────────────────────────────────────────────

class SettingsModal extends Container implements Disposable {
  private readonly overlay: Graphics
  private readonly panel: Container
  private readonly theme: UiTheme
  private readonly disposables: Array<() => void> = []
  private pauseSnapshot = false

  constructor(theme: UiTheme) {
    super()
    this.theme = theme
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

    this.buildRows()
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

  private buildRows(): void {
    let y = 84
    const addSection = (title: string): void => {
      const t = new Text({
        text: title.toUpperCase(),
        style: { fill: SUBDUED, fontSize: 11, fontFamily: this.theme.fontSans, letterSpacing: 2 },
      })
      t.position.set(PANEL_PADDING_X, y)
      this.panel.addChild(t)
      y += 24
    }
    const addRow = (label: string, control: Container): void => {
      const t = new Text({
        text: label,
        style: { fill: ROW_LABEL, fontSize: 14, fontFamily: this.theme.fontSans },
      })
      t.position.set(PANEL_PADDING_X, y + 6)
      this.panel.addChild(t)
      control.position.set(PANEL_PADDING_X + ROW_LABEL_W, y)
      this.panel.addChild(control)
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
