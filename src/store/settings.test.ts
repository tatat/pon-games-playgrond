import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from './settings'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.persist.clearStorage()
  useSettingsStore.setState(useSettingsStore.getInitialState(), true)
})

describe('useSettingsStore', () => {
  it('has sensible defaults', () => {
    const s = useSettingsStore.getState()
    expect(s.bgmVolume).toBe(0.7)
    expect(s.sfxVolume).toBe(0.7)
    expect(s.locale).toBe('ja')
    expect(s.graphicsQuality).toBe('high')
    expect(s.reducedMotion).toBe(false)
    expect(s.touchControls).toBe('auto')
  })

  it('clamps volumes to [0, 1]', () => {
    const { setBgmVolume, setSfxVolume } = useSettingsStore.getState()
    setBgmVolume(1.5)
    expect(useSettingsStore.getState().bgmVolume).toBe(1)
    setBgmVolume(-0.3)
    expect(useSettingsStore.getState().bgmVolume).toBe(0)
    setSfxVolume(2)
    expect(useSettingsStore.getState().sfxVolume).toBe(1)
  })

  it('setters update individual fields', () => {
    const s = useSettingsStore.getState()
    s.setLocale('en')
    s.setGraphicsQuality('low')
    s.setReducedMotion(true)
    s.setTouchControls('off')
    const after = useSettingsStore.getState()
    expect(after.locale).toBe('en')
    expect(after.graphicsQuality).toBe('low')
    expect(after.reducedMotion).toBe(true)
    expect(after.touchControls).toBe('off')
  })
})
