import {
  extensions,
  GraphicsPipe,
  MeshPipe,
  ParticleContainerPipe,
  TilingSpritePipe,
} from 'pixi.js'

// Importing this module for its side effect guarantees the renderable render
// pipes are registered before any `Application` is created.
//
// Why it's needed: production bundling can tree-shake away Pixi's own
// `extensions.add(...)` registrations for the renderable pipes when the
// minifier decides those side effects are unused. The renderer then comes up
// without a `graphics` / `mesh` / `tilingSprite` / `particle` pipe, and the
// first frame throws `renderPipes[id].updateRenderable` on undefined — taking
// down every game (they all draw `Graphics`). `Text` / `Sprite` survive, so
// the failure is silent in dev (unminified) and only bites the built site.
//
// Re-adding here keeps these classes referenced (so they're never shaken out)
// and registers them. The renderer keys pipes by name, so re-adding one that
// already survived is harmless.
extensions.add(GraphicsPipe, MeshPipe, TilingSpritePipe, ParticleContainerPipe)
