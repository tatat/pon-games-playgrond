import { beforeEach, describe, expect, it } from 'vitest'
import { defaultUiTheme } from '../engine/ui-theme'
import { useRuntimeStore } from './runtime'

beforeEach(() => {
  useRuntimeStore.setState(useRuntimeStore.getInitialState(), true)
})

describe('useRuntimeStore', () => {
  it('starts unpaused', () => {
    expect(useRuntimeStore.getState().gamePaused).toBe(false)
  })

  it('toggles gamePaused via setter', () => {
    useRuntimeStore.getState().setGamePaused(true)
    expect(useRuntimeStore.getState().gamePaused).toBe(true)
    useRuntimeStore.getState().setGamePaused(false)
    expect(useRuntimeStore.getState().gamePaused).toBe(false)
  })

  it('does not persist (no `.persist` middleware)', () => {
    expect((useRuntimeStore as unknown as { persist?: unknown }).persist).toBeUndefined()
  })

  it('starts with the default uiTheme and swaps via setter', () => {
    expect(useRuntimeStore.getState().uiTheme).toEqual(defaultUiTheme)
    useRuntimeStore.getState().setUiTheme({ fontSans: 'Foo', fontMono: 'Bar' })
    expect(useRuntimeStore.getState().uiTheme).toEqual({ fontSans: 'Foo', fontMono: 'Bar' })
  })
})
