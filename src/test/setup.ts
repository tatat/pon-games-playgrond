/** Test setup: provide a minimal in-memory `localStorage` so Zustand's
 * `persist` middleware can run under Vitest's default `node` environment.
 *
 * happy-dom 20 + Node 26 + Vitest 4 has a broken `localStorage` shim path
 * (Node's experimental localStorage getter shadows happy-dom's), so doing
 * this manually is the most reliable option. */

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
