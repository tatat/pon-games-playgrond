import { sound } from '@pixi/sound'
import { useSettingsStore } from '../../store/settings'

let currentBgm: string | null = null
let unsubBgmVolume: (() => void) | null = null

/** Engine-startup hook. Schedules an iOS Safari `AudioContext` resume on the
 * first user gesture. Volume subscriptions are wired up by `playBgm` /
 * `playSfx` when they actually play something. */
export function initAudio(): void {
  if (typeof window === 'undefined') return
  const resume = () => {
    void sound.context.audioContext?.resume()
  }
  window.addEventListener('pointerdown', resume, { once: true })
}

/** Starts looping `alias` as the current BGM. No-op if the alias is already
 * playing. Subscribes to `useSettingsStore.bgmVolume` so volume changes apply
 * live to this track. */
export function playBgm(alias: string): void {
  if (currentBgm === alias) return
  if (currentBgm) sound.stop(currentBgm)
  currentBgm = alias
  sound.play(alias, {
    loop: true,
    volume: useSettingsStore.getState().bgmVolume,
  })
  unsubBgmVolume?.()
  unsubBgmVolume = useSettingsStore.subscribe((s) => {
    const inst = sound.find(alias)
    if (inst) inst.volume = s.bgmVolume
  })
}

export function stopBgm(): void {
  if (currentBgm) sound.stop(currentBgm)
  currentBgm = null
  unsubBgmVolume?.()
  unsubBgmVolume = null
}

/** Fire-and-forget SFX. Reads volume from settings at play time. */
export function playSfx(alias: string): void {
  sound.play(alias, { volume: useSettingsStore.getState().sfxVolume })
}
