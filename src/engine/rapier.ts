import RAPIER from '@dimforge/rapier2d-compat'

// Kick off RAPIER WASM initialisation the moment this module is imported.
// Consumers await this promise before calling any RAPIER API.
export const rapierReady: Promise<void> = RAPIER.init()
