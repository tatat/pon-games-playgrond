import type { GameSettingsPanel, SettingsRow } from '../../engine/settings-ui'
import { makeCheckbox } from '../../engine/ui/checkbox'
import type { UiTheme } from '../../engine/ui-theme'
import { useRallyRunnerStore } from './store'

/** Build the rally-runner settings tab: a single toggle choosing between a
 * fixed (same every run) and a random obstacle course. Persisted via
 * `useRallyRunnerStore`; read when a run starts. */
export function buildRallyRunnerSettingsPanel(_theme: UiTheme): GameSettingsPanel {
  const disposers: Array<() => void> = []

  const fixed = makeCheckbox({
    getValue: () => useRallyRunnerStore.getState().fixedCourse,
    onChange: (v) => useRallyRunnerStore.getState().setFixedCourse(v),
    subscribe: (cb) => useRallyRunnerStore.subscribe(cb),
  })
  disposers.push(() => fixed.dispose())

  const rows: SettingsRow[] = [{ label: 'Fixed course', control: fixed.view }]

  return {
    sections: [{ title: 'Course', rows }],
    dispose: () => {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]?.()
    },
  }
}
