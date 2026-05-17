# Dev Container

Ubuntu Noble based development container for Node + agent-assisted development (Claude Code / Codex / GitHub Copilot), with an outbound Squid + iptables firewall and optional SSH-based commit signing.

## What's included

- **Node.js** — managed by asdf (version from `.tool-versions`, currently 26.1.0)
- **GitHub CLI (gh)** — installed via the official apt repository
- **GitHub Copilot CLI** — installed via `gh` extension
- **Claude Code** — installed via the native installer (`~/.local/bin/claude`)
- **Codex CLI** — installed via npm (`@openai/codex`)
- **Squid + iptables firewall** — outbound allowlist (see `squid.conf`)
- **direnv** — environment variable management

Intentionally **not** included (kept narrow on purpose; the sample this was forked from carried more): Python toolchain, Terraform, Docker dind, AWS CLI, DynamoDB Local, OpenSearch. Add them back when a project actually needs them.

## First-time setup (inside the container)

After the container boots, run these once. Credentials persist in named volumes (`claude-config`, `codex-config`, `user-config`) and survive rebuilds.

```bash
# GitHub auth — also used as git credential helper for HTTPS push
gh auth login

# Claude Code login (opens an auth URL — paste into your host browser)
claude

# Codex login (browser-less helper for the OAuth round-trip)
python3 .devcontainer/codex-login-helper.py
```

`gh auth login` is enough for `git push` over HTTPS, no SSH key needed.

### Codex plugin for Claude Code

The [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) plugin integrates Codex into Claude Code as slash commands. Install it once inside the container:

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

Key commands:

| Command | Description |
|---|---|
| `/codex:rescue` | Delegate investigation or fixes to Codex |
| `/codex:review` | Code review of uncommitted changes or a branch |
| `/codex:adversarial-review` | Steerable review challenging design decisions |
| `/codex:status` | Monitor running or recent jobs |
| `/codex:result` | Retrieve completed job output |
| `/codex:cancel` | Stop active background tasks |

## Post-create setup

On container creation, the following runs automatically (see `postCreate.sh`):

```
# Squid + firewall come up first so all network goes through the allowlist
npm ci
npm run prepare
```

`npm run prepare` installs the husky git hooks (`.npmrc` has `ignore-scripts=true`, so they don't auto-install during `npm ci`).

## Firewall

Outbound network access is restricted via iptables + Squid proxy to mitigate supply-chain attacks and enable safe use of `claude --dangerously-skip-permissions`.

**Architecture:**
- Squid listens on `localhost:3128` and enforces a domain-based allowlist
- iptables blocks all outbound traffic except:
  - The `proxy` user (Squid) — for HTTP/HTTPS via the allowlist
  - GitHub IP ranges on TCP/22 — for git over SSH (if you set up SSH below)
  - Loopback, host network, DNS
- All processes use `http_proxy` / `https_proxy` env vars to route traffic through Squid

**Allowed domains** are defined in `.devcontainer/squid.conf`. To add a domain, edit it and either rebuild, or hot-reload:

```bash
sudo squid -k reconfigure -f "${WORKSPACE_FOLDER}/.devcontainer/squid.conf"
```

**Firewall rules** are applied in two places:
- `postCreate.sh` — on first container creation, before `npm ci`
- `postStart.sh` — on every subsequent container start

To verify:

```bash
.devcontainer/verify-firewall.sh
```

## Optional: SSH-based commit signing

Default git push from inside the container uses HTTPS via `gh auth`. If you want **signed commits**, run the helper script on the host once; the devcontainer auto-detects the key on next rebuild and wires it in.

macOS GPG signing is not supported here because the GPG key lives in the host's Keychain and cannot be exported.

**On the host (one-time):**

```bash
bash .devcontainer/setup-signing-key.sh
```

The script is idempotent and **does not modify your global `~/.gitconfig`**. It will:

1. Generate `~/.ssh/devcontainer/id_devcontainer` (ed25519, no passphrase) if it does not exist.
2. If `gh` is installed and authenticated on the host, register the key on GitHub as both an Authentication Key and a Signing Key. Otherwise it prints the public key and the manual upload steps.

Git signing config (`gpg.format=ssh`, `user.signingKey`, `commit.gpgsign=true`, `gpg.ssh.allowedSignersFile`) is set **inside the container only**, by `postCreate.sh`, when it detects the key. That means your host repos outside this project still use whatever defaults you already had.

Pass a custom name as an argument (e.g. `bash .devcontainer/setup-signing-key.sh id_myproject`) if you want a separate key. Set `DEVCONTAINER_SSH_KEY` on the host with the matching name before opening the container.

**Rebuild the container** afterwards (Command Palette → "Dev Containers: Rebuild Container"). `postCreate.sh` checks for the key on first boot:

- if present → copies it in, writes a `~/.ssh/config` that uses it for `github.com`, prints `✓ SSH signing key configured`
- if absent → silently skips (the empty `~/.ssh/devcontainer` directory created by `initializeCommand` is harmless)

Verify after a commit:

```bash
git log --show-signature -1
```
