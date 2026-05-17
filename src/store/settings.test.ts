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
    expect(s.masterVolume).toBe(1)
    expect(s.bgmVolume).toBe(0.7)
    expect(s.sfxVolume).toBe(0.7)
    expect(s.showFps).toBe(true)
    expect(s.maxFps).toBe(0)
    expect(s.locale).toBe('ja')
    expect(s.graphicsQuality).toBe('high')
    expect(s.reducedMotion).toBe(false)
    expect(s.touchControls).toBe('auto')
  })

  it('clamps maxFps to non-negative integers', () => {
    const { setMaxFps } = useSettingsStore.getState()
    setMaxFps(30)
    expect(useSettingsStore.getState().maxFps).toBe(30)
    setMaxFps(59.9)
    expect(useSettingsStore.getState().maxFps).toBe(59)
    setMaxFps(-10)
    expect(useSettingsStore.getState().maxFps).toBe(0)
  })

  it('clamps volumes to [0, 1]', () => {
    const { setMasterVolume, setBgmVolume, setSfxVolume } = useSettingsStore.getState()
    setMasterVolume(1.5)
    expect(useSettingsStore.getState().masterVolume).toBe(1)
    setMasterVolume(-0.3)
    expect(useSettingsStore.getState().masterVolume).toBe(0)
    setBgmVolume(1.5)
    expect(useSettingsStore.getState().bgmVolume).toBe(1)
    setBgmVolume(-0.3)
    expect(useSettingsStore.getState().bgmVolume).toBe(0)
    setSfxVolume(2)
    expect(useSettingsStore.getState().sfxVolume).toBe(1)
  })

  it('setters update individual fields', () => {
    const s = useSettingsStore.getState()
    s.setShowFps(false)
    s.setLocale('en')
    s.setGraphicsQuality('low')
    s.setReducedMotion(true)
    s.setTouchControls('off')
    const after = useSettingsStore.getState()
    expect(after.showFps).toBe(false)
    expect(after.locale).toBe('en')
    expect(after.graphicsQuality).toBe('low')
    expect(after.reducedMotion).toBe(true)
    expect(after.touchControls).toBe('off')
  })
})
