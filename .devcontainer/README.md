# Dev Container

Development container for `pon-games-playgrond`, based on Ubuntu Noble.

## What's included

- **Node.js** — managed by asdf (version from `.tool-versions`, currently 26.1.0)
- **GitHub CLI (gh)** — installed via the official apt repository
- **GitHub Copilot CLI** — installed via `gh` extension
- **Claude Code** — installed via the native installer (`~/.local/bin/claude`)
- **Codex CLI** — installed via npm (`@openai/codex`)
- **Squid + iptables firewall** — outbound allowlist (see `squid.conf`)
- **direnv** — environment variable management

Intentionally **not** included (kept narrow because this is a single-language
playground): Python toolchain, Terraform, Docker dind, AWS CLI, DynamoDB Local,
OpenSearch. If a future port back into ponpon needs them, add them then.

## First-time authentication

### Claude Code

Claude Code authentication is not shared with the host. Run `claude` inside the container and authenticate once. Credentials persist in the `claude-config` named volume and survive container rebuilds.

Optional: create `~/.claude/settings.json` for environment-specific settings (model, AWS profile, permission denies, etc.). The repo already ships a project-scoped `.claude/settings.json` for the `confirm-risky-commands` hook — keep that one as the project default; per-user settings go in `~/.claude/settings.json` or `.claude/settings.local.json` (gitignored).

### Codex CLI

Codex authentication is not shared with the host. Because the container has no browser access, use the login helper instead of `codex login` directly:

```bash
python3 .devcontainer/codex-login-helper.py
```

The helper starts `codex login`, displays the auth URL, and forwards the OAuth callback once you paste the localhost redirect URL from your host browser. Credentials persist in the `codex-config` named volume.

### Codex plugin for Claude Code

The [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) plugin integrates Codex into Claude Code as slash commands. Install it once inside the container:

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
```

Then reload plugins and run setup:

```
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

### GitHub CLI (gh) and Copilot CLI

gh authentication is not shared with the host. Run `gh auth login` inside the container and authenticate once. Credentials persist in the `user-config` named volume. Copilot CLI inherits the gh authentication automatically.

```bash
gh auth login
```

## Post-create setup

On container creation, the following runs automatically:

```
npm ci && npm run prepare
```

(`npm run prepare` installs the husky git hooks; `.npmrc` has `ignore-scripts=true` so they don't auto-install during `npm ci`.)

## Git SSH key (auth + signing)

A dedicated SSH key is used for both GitHub authentication and commit signing inside the container. GPG signing is not supported because GPG keys are managed by macOS Keychain and cannot be exported.

**One-time setup on the host:**

```bash
# Generate a dedicated key for the devcontainer (stored in a separate directory)
mkdir -p ~/.ssh/devcontainer
ssh-keygen -t ed25519 -f ~/.ssh/devcontainer/id_devcontainer -N ""

# Configure git signing
git config --global gpg.format ssh
git config --global user.signingKey ~/.ssh/devcontainer/id_devcontainer.pub
git config --global commit.gpgsign true

# Configure allowed signers for verification
echo "your@email.com $(cat ~/.ssh/devcontainer/id_devcontainer.pub)" >> ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

Register `~/.ssh/devcontainer/id_devcontainer.pub` on GitHub as both:
- **Authentication Key** (Settings → SSH and GPG keys → New SSH key)
- **Signing Key** (Settings → SSH and GPG keys → New signing key)

**Verify a commit:**

```bash
git verify-commit HEAD
# or
git log --show-signature -1
```

## Firewall

Outbound network access is restricted via iptables + Squid proxy to mitigate supply-chain attacks and enable safe use of `claude --dangerously-skip-permissions`.

**Architecture:**
- Squid listens on `localhost:3128` and enforces a domain-based allowlist
- iptables blocks all outbound traffic except:
  - The `proxy` user (Squid) — for HTTP/HTTPS via the allowlist
  - GitHub IP ranges on TCP/22 — for git over SSH
  - Loopback and host network
- All processes use `http_proxy` / `https_proxy` env vars to route traffic through Squid

**Allowed domains** are defined in `.devcontainer/squid.conf`. To add a domain, add it to one of the `acl allowed_domains dstdomain ...` lines and rebuild, or apply changes without rebuild:

```bash
sudo squid -k reconfigure -f "${WORKSPACE_FOLDER}/.devcontainer/squid.conf"
```

**Firewall rules** are applied in two places:
- `postCreate.sh` — on first container creation, before `npm ci`
- `postStart.sh` — on every subsequent container start

To verify the firewall is working correctly, run inside the container:

```bash
.devcontainer/verify-firewall.sh
```
