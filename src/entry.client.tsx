import RAPIER from '@dimforge/rapier2d-compat'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { initAudio } from './engine/audio/index'
import { useRuntimeStore } from './store/runtime'
import { useSettingsStore } from './store/settings'
import { useUserStore } from './store/user'

window.addEventListener('contextmenu', (e) => e.preventDefault())

async function bootstrap(): Promise<void> {
  await RAPIER.init()
  initAudio()
  if (import.meta.env.DEV) {
    ;(window as unknown as { __stores: unknown }).__stores = {
      settings: useSettingsStore,
      user: useUserStore,
      runtime: useRuntimeStore,
    }
  }
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    )
  })
}

void bootstrap()
