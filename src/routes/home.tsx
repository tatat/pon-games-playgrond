import { Link } from 'react-router'

export default function Home() {
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
