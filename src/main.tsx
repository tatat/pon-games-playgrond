import RAPIER from '@dimforge/rapier2d-compat'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initAudio } from './engine/audio/index'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

async function bootstrap(): Promise<void> {
  await RAPIER.init()
  initAudio()
  createRoot(rootEl as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
