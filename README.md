# pon-games-playgrond

A Pixi v8 playground for replatforming the games hosted by [ponpon](../ponpon/) (Phaser → Pixi). The playground itself is dev-only; the deliverable is per-game ESM library bundles consumed by ponpon via this repo's GitHub Pages.

## Quick start

```bash
npm install
npm run prepare        # .npmrc has ignore-scripts=true, so husky won't auto-install
npm run dev            # http://localhost:5173/pon-games-playgrond/
```

## Docs

- [`docs/web-arcade-architecture.md`](./docs/web-arcade-architecture.md) — index, principles, scope
- [`docs/toolchain.md`](./docs/toolchain.md) — build / lint / format / supply chain / deploy
- [`docs/distribution.md`](./docs/distribution.md) — how built artifacts reach ponpon
- [`docs/architecture/`](./docs/architecture/) — per-topic detail (scene, state, physics, audio, input, rng, responsive, testing, ...)
- [`AGENTS.md`](./AGENTS.md) — guidance for AI agents working in this repo
