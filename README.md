# pon-games-playgrond

A Pixi v8 playground for replatforming the games hosted by [ponpon](../ponpon/) (Phaser → Pixi). The playground itself is dev-only; the deliverable is per-game ESM library bundles consumed by ponpon via this repo's GitHub Pages.

## Live preview

- **Playground SPA**: <https://tatat.github.io/pon-games-playgrond/>
  Browse and play the current state of each game. Updated on every push to `main`.
- **Library bundles** (for ponpon): <https://tatat.github.io/pon-games-playgrond/dist/>
  Stable, only rebuilt when `release.json` is updated. See [`docs/distribution.md`](./docs/distribution.md).

## Setup

### Option 1 — local

Node 26.1.0 is required (see `.tool-versions`). Recommended installers: [mise](https://mise.jdx.dev/), [asdf](https://asdf-vm.com/), or [fnm](https://github.com/Schniz/fnm).

```bash
npm install
npm run prepare        # .npmrc has ignore-scripts=true, so husky won't auto-install
npm run dev            # http://localhost:5173/pon-games-playgrond/
```

### Option 2 — Dev Container

Open the repo in VS Code with the Dev Containers extension, or launch it as a GitHub Codespace. The container pre-installs Node 26, `gh`, GitHub Copilot CLI, Claude Code, and Codex CLI, plus a Squid + iptables outbound firewall scoped to this project's needs. See [`.devcontainer/README.md`](./.devcontainer/README.md) for first-time auth steps and the SSH-key setup for signed commits.

## Contributors

- **Asset creators (sprites, audio)**: drop files into `public/games/<game-id>/<kind>/` and reference them via a `preload` entry. The live preview above is the easiest way to see your asset in action — your PR will redeploy automatically on merge.
- **Code (with agent assistance)**: read [`AGENTS.md`](./AGENTS.md) first. It covers conventions, workflow, and TypeScript / test gotchas that agents need to know. Use whatever agent you're comfortable with (Claude Code, Codex, Copilot) — the repo ships `.claude/` hooks and a devcontainer geared for all three. Recommended: install the [pixijs-skills](https://github.com/pixijs/pixijs-skills) skill pack via [vercel-labs/skills](https://github.com/vercel-labs/skills) so your agent gets Pixi v8 reference docs on demand:

  ```bash
  npx skills add https://github.com/pixijs/pixijs-skills
  ```

## Docs

- [`docs/web-arcade-architecture.md`](./docs/web-arcade-architecture.md) — index, principles, scope
- [`docs/toolchain.md`](./docs/toolchain.md) — build / lint / format / supply chain / deploy
- [`docs/distribution.md`](./docs/distribution.md) — how built artifacts reach ponpon
- [`docs/architecture/`](./docs/architecture/) — per-topic detail (scene, state, physics, audio, input, rng, responsive, testing, ...)
- [`AGENTS.md`](./AGENTS.md) — guidance for AI agents working in this repo
