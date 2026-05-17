import { GameMount } from './components/GameMount'

export function App() {
  // No router yet — just mount the single game directly. Wire up Router +
  // a real lobby once a second game is in.
  return <GameMount gameId="sticker-drift" />
}
