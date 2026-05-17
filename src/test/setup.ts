/** Vitest setup file (wired up via `test.setupFiles` in vite.config.ts).
 *
 * Provides a minimal in-memory `localStorage` / `sessionStorage` on
 * `globalThis` for every test. Two reasons:
 *
 * 1. Zustand v5's `persist` middleware silently drops its API if its storage
 *    factory throws on first call. The stores under `src/store/` already
 *    pin themselves to `globalThis.localStorage`, but only this shim makes
 *    that property actually exist in the test runner.
 * 2. happy-dom 20 + Node 26 + Vitest 4 have a broken integration where
 *    Node's experimental `localStorage` getter shadows happy-dom's own
 *    implementation. Even `// @vitest-environment happy-dom` will not give
 *    you a working `localStorage`. This shim sidesteps that.
 *
 * Tests can write to / read from `localStorage` directly. State leaks across
 * tests unless `localStorage.clear()` is called in `beforeEach`. */

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'sessionStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
})
