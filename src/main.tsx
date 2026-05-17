import RAPIER from '@dimforge/rapier2d-compat'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initAudio } from './engine/audio/index'
import { useRuntimeStore } from './store/runtime'
import { useSettingsStore } from './store/settings'
import { useUserStore } from './store/user'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

async function bootstrap(): Promise<void> {
  await RAPIER.init()
  initAudio()
  if (import.meta.env.DEV) {
    // Expose stores on `window.__stores` so we can poke settings from the
    // browser console while there's no in-game UI yet. Dev-only.
    ;(window as unknown as { __stores: unknown }).__stores = {
      settings: useSettingsStore,
      user: useUserStore,
      runtime: useRuntimeStore,
    }
  }
  createRoot(rootEl as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
