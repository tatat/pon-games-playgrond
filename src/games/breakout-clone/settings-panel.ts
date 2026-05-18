import type { GameSettingsPanel, SettingsRow } from '../../engine/settings-ui'
import { makeSegmentedControl } from '../../engine/ui/segmented-control'
import type { UiTheme } from '../../engine/ui-theme'
import { type MusicScale, useBreakoutCloneStore } from './store'

const SCALE_CHOICES: { label: string; value: MusicScale }[] = [
  { label: 'Chrom', value: 'chromatic' },
  { label: 'Major', value: 'major' },
  { label: 'Minor', value: 'minor' },
  { label: 'Pent', value: 'pentatonic' },
  { label: 'Blues', value: 'blues' },
]

const BASE_KEY_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Build the breakout-clone settings tab: a scale picker (5 options) and a
 * base-key picker (12 chromatic semitones). Both are persisted via
 * `useBreakoutCloneStore` and read back live by `SoundManager.playRandomHit`. */
export function buildBreakoutCloneSettingsPanel(theme: UiTheme): GameSettingsPanel {
  const disposers: Array<() => void> = []

  const scale = makeSegmentedControl<MusicScale>({
    choices: SCALE_CHOICES,
    getValue: () => useBreakoutCloneStore.getState().scale,
    onChange: (v) => useBreakoutCloneStore.getState().setScale(v),
    subscribe: (cb) => useBreakoutCloneStore.subscribe(cb),
    theme,
    buttonW: 42,
    step: 46,
  })
  disposers.push(() => scale.dispose())

  const baseKey = makeSegmentedControl<number>({
    choices: BASE_KEY_LABELS.map((label, i) => ({ label, value: i })),
    getValue: () => useBreakoutCloneStore.getState().baseKey,
    onChange: (v) => useBreakoutCloneStore.getState().setBaseKey(v),
    subscribe: (cb) => useBreakoutCloneStore.subscribe(cb),
    theme,
    buttonW: 18,
    step: 20,
  })
  disposers.push(() => baseKey.dispose())

  const rows: SettingsRow[] = [
    { label: 'Scale', control: scale.view },
    { label: 'Base Key', control: baseKey.view },
  ]

  return {
    sectionTitle: 'Audio',
    rows,
    dispose: () => {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]?.()
    },
  }
}
