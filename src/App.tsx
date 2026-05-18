import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { GameMount } from './components/GameMount'

/** Top-level router. `basename` is bound to Vite's `BASE_URL` so the same
 * routes work both locally (`/`) and on GitHub Pages (`/pon-games-playgrond`). */
export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/sticker-drift" element={<GameMount gameId="sticker-drift" />} />
        <Route path="/breakout-clone" element={<GameMount gameId="breakout-clone" />} />
      </Routes>
    </BrowserRouter>
  )
}

/** Dev-only lobby: a plain list of links to each game. Replace with the real
 * lobby once games stabilise. */
function Lobby() {
  return (
    <div
      style={{
        padding: '4rem 2rem',
        maxWidth: 640,
        margin: '0 auto',
        fontFamily: 'system-ui, sans-serif',
        color: '#fff',
      }}
    >
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>Pon Pon Games Playground</h1>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
        <li>
          <Link
            to="/sticker-drift"
            style={{ color: '#cfcfd4', textDecoration: 'underline', fontSize: '1.125rem' }}
          >
            Sticker Drift
          </Link>
        </li>
        <li>
          <Link
            to="/breakout-clone"
            style={{ color: '#cfcfd4', textDecoration: 'underline', fontSize: '1.125rem' }}
          >
            Breakout Clone
          </Link>
        </li>
      </ul>
    </div>
  )
}
