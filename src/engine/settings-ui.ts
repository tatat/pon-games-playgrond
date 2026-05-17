import { CheckBox, FancyButton, Slider } from '@pixi/ui'
import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { useRuntimeStore } from '../store/runtime'
import { useSettingsStore } from '../store/settings'
import { DESIGN_H, DESIGN_W } from './constants'
import type { UiTheme } from './ui-theme'

/** Open / close a Pixi-side settings modal driven by `useSettingsStore`.
 * Attached to `gameContainer` from `attachLayout`, so it lives in logical
 * 1280×720 coordinates and stays clipped to the game viewport. The active
 * `uiTheme` from `useRuntimeStore` is captured here at build time — the
 * theme must already be set (by `GameMount`) before this runs. */
export function attachSettingsUi(gameContainer: Container, signal: AbortSignal): void {
  const theme = useRuntimeStore.getState().uiTheme
  const root = new Container()
  root.zIndex = 9000
  gameContainer.addChild(root)

  const gear = makeGearButton(() => modal.open(), theme)
  // y=16 is the shared vertical center used by the FPS counter too.
  gear.position.set(DESIGN_W - 8, 16)
  root.addChild(gear)

  const modal = new SettingsModal(theme)
  root.addChild(modal)

  signal.addEventListener(
    'abort',
    () => {
      modal.dispose()
      gameContainer.removeChild(root)
      root.destroy({ children: true })
    },
    { once: true },
  )
}

// ── Gear button ────────────────────────────────────────────────────────────

function makeGearButton(onPress: () => void, theme: UiTheme): Container {
  const c = new Container()
  c.eventMode = 'static'
  c.cursor = 'pointer'
  c.hitArea = new Rectangle(-28, -14, 32, 32)
  const glyph = new Text({
    text: '⚙',
    style: { fill: WHITE, fontSize: 20, fontFamily: theme.fontSans },
  })
  glyph.anchor.set(1, 0.5)
  c.addChild(glyph)
  c.on('pointertap', onPress)
  return c
}

// ── Tokens ─────────────────────────────────────────────────────────────────

// Monochrome flat palette. Black → white only; no accent hue. Picks the
// contrast band intentionally so an inactive button reads as "off" but is
// still visible against the panel background.
const PANEL_BG = 0x1a1a1c
const ROW_LABEL = 0xe0e0e0
const SUBDUED = 0xa0a0a0
const TRACK = 0x3a3a3e
const INACTIVE = 0x3a3a3e
const WHITE = 0xffffff

const PANEL_W = 560
const PANEL_H = 460
const PANEL_RADIUS = 6
const PANEL_PADDING_X = 32
const ROW_GAP = 44
const SECTION_GAP = 16
const ROW_LABEL_W = 200
const SLIDER_W = 240
const SLIDER_TRACK_H = 4
const SLIDER_KNOB_R = 8

// ── Modal ──────────────────────────────────────────────────────────────────

class SettingsModal extends Container {
  private readonly overlay: Graphics
  private readonly panel: Container
  private readonly theme: UiTheme
  private readonly unsubs: Array<() => void> = []

  constructor(theme: UiTheme) {
    super()
    this.theme = theme
    this.visible = false
    this.zIndex = 9999
    this.eventMode = 'static'

    // Full-viewport dim. Clicking the dim closes the modal; the panel below
    // stops propagation so clicks inside don't.
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
    this.visible = true
    useRuntimeStore.getState().setGamePaused(true)
  }
  close(): void {
    this.visible = false
    useRuntimeStore.getState().setGamePaused(false)
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.unsubs.length = 0
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
    addRow('FPS Limit', this.makeMaxFpsGroup())
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
    this.unsubs.push(
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
    this.unsubs.push(
      useSettingsStore.subscribe((s) => {
        if (cb.checked !== s.showFps) cb.forceCheck(s.showFps)
      }),
    )
    return cb
  }

  private makeMaxFpsGroup(): Container {
    const group = new Container()
    const choices: Array<{ label: string; value: number }> = [
      { label: '∞', value: 0 },
      { label: '30', value: 30 },
      { label: '60', value: 60 },
      { label: '120', value: 120 },
    ]
    const buttons: FancyButton[] = []
    let x = 0
    for (const choice of choices) {
      const btn = new FancyButton({
        defaultView: makeChoiceView(choice.label, false, false, this.theme),
        hoverView: makeChoiceView(choice.label, false, true, this.theme),
        pressedView: makeChoiceView(choice.label, true, false, this.theme),
      })
      btn.onPress.connect(() => useSettingsStore.getState().setMaxFps(choice.value))
      btn.position.set(x, 0)
      buttons.push(btn)
      group.addChild(btn)
      x += 60
    }

    // Rebuild each button's defaultView so the currently-active choice reads
    // as "filled". FancyButton has no built-in toggle state, so we swap views
    // on state change rather than relying on alpha.
    const refresh = (current: number): void => {
      buttons.forEach((b, i) => {
        const c = choices[i]
        if (!c) return
        const active = c.value === current
        b.defaultView = makeChoiceView(c.label, active, false, this.theme)
        b.hoverView = makeChoiceView(c.label, active, true, this.theme)
      })
    }
    refresh(useSettingsStore.getState().maxFps)
    this.unsubs.push(useSettingsStore.subscribe((s) => refresh(s.maxFps)))
    return group
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

function makeChoiceView(
  label: string,
  active: boolean,
  hovered: boolean,
  theme: UiTheme,
): Container {
  const c = new Container()
  const fill = active ? WHITE : hovered ? 0x4a4a4e : INACTIVE
  const textFill = active ? PANEL_BG : WHITE
  c.addChild(new Graphics().roundRect(0, 0, 52, 26, 3).fill(fill))
  const t = new Text({
    text: label,
    style: { fill: textFill, fontSize: 12, fontFamily: theme.fontSans },
  })
  t.anchor.set(0.5)
  t.position.set(26, 13)
  c.addChild(t)
  return c
}

function formatVolume(v: number): string {
  return v.toFixed(2)
}
