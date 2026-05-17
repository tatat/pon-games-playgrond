/** Anything with explicit teardown. The engine uses this for every resource
 * whose lifetime needs to outlive a single `await` (event listeners, store
 * subscriptions, attached UI overlays). Caller invokes `dispose()` when
 * done — typically chained by `Scene` (per-scene cleanups) or `SceneManager`
 * (manager + current scene teardown). `dispose` may be sync or async; the
 * registry helpers always `await` it. */
export interface Disposable {
  dispose(): void | Promise<void>
}

/** Disposable that also exposes the registry it owns. Convenience for
 * code that wants both "do something" and "tear it down later" in one
 * value (e.g. a manager). Plain `Disposable` is fine for most cases. */
export type DisposableLike = Disposable | (() => void | Promise<void>)

/** Normalize a `DisposableLike` to a function call. */
export function asDisposeFn(d: DisposableLike): () => void | Promise<void> {
  return typeof d === 'function' ? d : () => d.dispose()
}
