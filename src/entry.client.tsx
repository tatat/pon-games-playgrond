import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { initAudio } from './engine/audio/index'
// Importing this module kicks off RAPIER WASM initialisation in the
// background. GameMount awaits rapierReady before calling start().
import './engine/rapier'
import { useRuntimeStore } from './store/runtime'
import { useSettingsStore } from './store/settings'
import { useUserStore } from './store/user'

window.addEventListener('contextmenu', (e) => e.preventDefault())
initAudio()

if (import.meta.env.DEV) {
  ;(window as unknown as { __stores: unknown }).__stores = {
    settings: useSettingsStore,
    user: useUserStore,
    runtime: useRuntimeStore,
  }
}

// Hydrate immediately so React can reconcile the pre-rendered HTML before
// the streaming-marker resolution pass ($RV) modifies the DOM — delaying
// hydrateRoot past any await causes React error #418.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  )
})
