import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../../store/settings'

// Mock `@pixi/sound` before importing the module under test. The mock holds a
// `find()`-backed instance so we can assert volume updates from subscriptions.
const fakeInstance = { volume: 0 }
const soundMock = {
  play: vi.fn(),
  stop: vi.fn(),
  find: vi.fn(() => fakeInstance),
  context: { audioContext: undefined },
}
vi.mock('@pixi/sound', () => ({ sound: soundMock }))

const { playBgm, playSfx, stopBgm, effectiveBgmVolume, effectiveSfxVolume } = await import(
  './index'
)

beforeEach(() => {
  soundMock.play.mockClear()
  soundMock.stop.mockClear()
  soundMock.find.mockClear()
  fakeInstance.volume = 0
  useSettingsStore.setState(useSettingsStore.getInitialState(), true)
  stopBgm()
})

describe('effective volume helpers', () => {
  it('multiplies channel volume by master', () => {
    useSettingsStore.setState({ masterVolume: 0.5, bgmVolume: 0.7, sfxVolume: 0.4 })
    expect(effectiveBgmVolume()).toBeCloseTo(0.35)
    expect(effectiveSfxVolume()).toBeCloseTo(0.2)
  })

  it('zero master mutes both channels', () => {
    useSettingsStore.setState({ masterVolume: 0, bgmVolume: 1, sfxVolume: 1 })
    expect(effectiveBgmVolume()).toBe(0)
    expect(effectiveSfxVolume()).toBe(0)
  })
})

describe('playBgm', () => {
  it('plays at the master×bgm product', () => {
    useSettingsStore.setState({ masterVolume: 0.5, bgmVolume: 0.6 })
    playBgm('bgm-a')
    expect(soundMock.play).toHaveBeenCalledWith('bgm-a', {
      loop: true,
      volume: 0.3,
    })
  })

  it('updates the playing instance when master volume changes', () => {
    useSettingsStore.setState({ masterVolume: 1, bgmVolume: 0.8 })
    playBgm('bgm-a')
    useSettingsStore.setState({ masterVolume: 0.25 })
    expect(fakeInstance.volume).toBeCloseTo(0.2)
  })

  it('updates the playing instance when bgm volume changes', () => {
    useSettingsStore.setState({ masterVolume: 0.5, bgmVolume: 1 })
    playBgm('bgm-a')
    useSettingsStore.setState({ bgmVolume: 0.4 })
    expect(fakeInstance.volume).toBeCloseTo(0.2)
  })
})

describe('playSfx', () => {
  it('plays at the master×sfx product, read at play time', () => {
    useSettingsStore.setState({ masterVolume: 0.8, sfxVolume: 0.5 })
    playSfx('hit')
    expect(soundMock.play).toHaveBeenCalledWith('hit', { volume: 0.4 })
  })
})
