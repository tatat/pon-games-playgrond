import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Pages serves this repo under /<repo>/ — keep absolute base in sync if renaming.
export default defineConfig({
  base: '/pon-games-playgrond/',
  plugins: [react()],
  server: {
    // Bind to 0.0.0.0 so the devcontainer's published port (appPort 5173) is
    // reachable from the host. Vite's default 127.0.0.1 only listens inside
    // the container.
    host: true,
  },
  optimizeDeps: {
    // Inline-WASM package; Vite's prebundle breaks its init path.
    exclude: ['@dimforge/rapier2d-compat'],
  },
  test: {
    environment: 'node',
    // Provides an in-memory localStorage / sessionStorage on globalThis so
    // Zustand persist works under tests; see src/test/setup.ts for the why.
    setupFiles: ['./src/test/setup.ts'],
    // Use `// @vitest-environment happy-dom` at the top of DOM-touching tests
    // (e.g. input/index.test.ts needs window event dispatch).
  },
})
