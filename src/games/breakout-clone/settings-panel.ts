import type { GameSettingsPanel, SettingsRow } from '../../engine/pause-overlay'
import { makeCheckbox } from '../../engine/ui/checkbox'
import { makeStepper } from '../../engine/ui/stepper'
import type { UiTheme } from '../../engine/ui-theme'
import { type MusicScale, useBreakoutCloneStore } from './store'

const SCALE_CHOICES: { label: string; value: MusicScale }[] = [
  { label: 'Chromatic', value: 'chromatic' },
  { label: 'Major', value: 'major' },
  { label: 'Minor', value: 'minor' },
  { label: 'Pentatonic', value: 'pentatonic' },
  { label: 'Blues', value: 'blues' },
  { label: 'Dorian', value: 'dorian' },
  { label: 'Mixolydian', value: 'mixolydian' },
  { label: 'Whole Tone', value: 'wholeTone' },
  { label: 'Diminished', value: 'diminished' },
]

const BASE_KEY_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Build the breakout-clone settings tab: a scale picker (9 options) and a
 * base-key picker (12 chromatic semitones). Both rendered as steppers
 * because a 9-/12-wide segmented control would crowd the panel and
 * leave each button too small to tap. Persisted via
 * `useBreakoutCloneStore`; read back live by `SoundManager.playRandomHit`. */
export function buildBreakoutCloneSettingsPanel(theme: UiTheme): GameSettingsPanel {
  const disposers: Array<() => void> = []

  const scale = makeStepper<MusicScale>({
    choices: SCALE_CHOICES,
    getValue: () => useBreakoutCloneStore.getState().scale,
    onChange: (v) => useBreakoutCloneStore.getState().setScale(v),
    subscribe: (cb) => useBreakoutCloneStore.subscribe(cb),
    theme,
    width: 240,
    height: 36,
    fontSize: 19,
  })
  disposers.push(() => scale.dispose())

  const baseKey = makeStepper<number>({
    choices: BASE_KEY_LABELS.map((label, i) => ({ label, value: i })),
    getValue: () => useBreakoutCloneStore.getState().baseKey,
    onChange: (v) => useBreakoutCloneStore.getState().setBaseKey(v),
    subscribe: (cb) => useBreakoutCloneStore.subscribe(cb),
    theme,
    width: 160,
    height: 36,
    fontSize: 19,
  })
  disposers.push(() => baseKey.dispose())

  const debug = makeCheckbox({
    getValue: () => useBreakoutCloneStore.getState().debugMode,
    onChange: (v) => useBreakoutCloneStore.getState().setDebugMode(v),
    subscribe: (cb) => useBreakoutCloneStore.subscribe(cb),
    size: 26,
  })
  disposers.push(() => debug.dispose())

  const audioRows: SettingsRow[] = [
    { label: 'Scale', control: scale.view },
    { label: 'Base Key', control: baseKey.view },
  ]
  const debugRows: SettingsRow[] = [{ label: 'Near-boss start', control: debug.view }]

  return {
    sections: [
      { title: 'Audio', rows: audioRows },
      { title: 'Debug', rows: debugRows },
    ],
    dispose: () => {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]?.()
    },
  }
}
