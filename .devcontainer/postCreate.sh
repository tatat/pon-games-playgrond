#!/bin/bash
set -e

# Start Squid and apply firewall before any network activity
# so installs from postCreate (npm ci, etc.) go through the allowlist.
sudo squid -f "${WORKSPACE_FOLDER}/.devcontainer/squid.conf"
sleep 1
sudo "${WORKSPACE_FOLDER}/.devcontainer/init-firewall.sh"

cd ~

# Bring the host's gitconfig (user.name / user.email / signing settings)
# into the container. Empty file is fine — `gh auth login` and `git config`
# inside the container can fill it in later.
cp /tmp/host-gitconfig ~/.gitconfig

# Drop any host-only signer program (e.g. 1Password's op-ssh-sign on macOS)
# — its binary does not exist inside the container.
git config --global --unset gpg.ssh.program 2>/dev/null || true

# Bind-mounted workspace is owned by the host user (UID/GID differ from
# the container's `ubuntu`), so git refuses operations without this.
git config --global --add safe.directory "${WORKSPACE_FOLDER}"

mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 600 ~/.ssh/known_hosts 2>/dev/null || true

# Optional: SSH-based commit signing.
# If the host has a dedicated key at ~/.ssh/devcontainer/${DEVCONTAINER_SSH_KEY}
# (default name: id_devcontainer), wire it in. Signing settings are written to
# this container's ~/.gitconfig — the host's ~/.gitconfig is untouched.
SSH_KEY="${DEVCONTAINER_SSH_KEY:-id_devcontainer}"
if [ -f "/tmp/host-ssh/${SSH_KEY}.pub" ] && [ -f "/tmp/host-ssh/${SSH_KEY}" ]; then
    cp "/tmp/host-ssh/${SSH_KEY}" ~/.ssh/${SSH_KEY}
    cp "/tmp/host-ssh/${SSH_KEY}.pub" ~/.ssh/${SSH_KEY}.pub
    chmod 600 ~/.ssh/${SSH_KEY}
    cat > ~/.ssh/config <<EOF
Host github.com
    IdentityFile ~/.ssh/${SSH_KEY}
    IdentitiesOnly yes
EOF

    # Configure signing inside this container only.
    git config --global gpg.format ssh
    git config --global user.signingKey ~/.ssh/${SSH_KEY}.pub
    git config --global commit.gpgsign true
    git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers

    # Populate allowed_signers from the container's git identity, so
    # `git verify-commit` works inside the container.
    EMAIL=$(git config --global user.email || true)
    if [ -n "$EMAIL" ]; then
        printf '%s %s\n' "$EMAIL" "$(cat ~/.ssh/${SSH_KEY}.pub)" > ~/.ssh/allowed_signers
    fi

    echo "✓ SSH signing key configured (~/.ssh/${SSH_KEY})"
fi

cd "${WORKSPACE_FOLDER}"

sudo chown ubuntu -R node_modules
sudo chown -R ubuntu:ubuntu ~/.config ~/.claude ~/.codex ~/.cache/ms-playwright
chmod 700 ~/.claude ~/.codex

# Keep ~/.claude.json in the claude-config volume so it survives rebuilds
[ -f ~/.claude/.claude.json ] || echo '{}' > ~/.claude/.claude.json
ln -sf ~/.claude/.claude.json ~/.claude.json

npm ci
npm run prepare

# Playwright browser for the Playwright MCP server.
# Chromium binary lands in ~/.cache/ms-playwright/chromium-<rev>/ ; that path
# is a named volume so the ~200MB download survives rebuilds.
# (System libs the binary needs are baked into the image — see Dockerfile.)
npx playwright install chromium

# Register the Playwright MCP server for this project. @playwright/mcp is
# installed globally in the image, so we invoke `playwright-mcp` directly
# (no `npx` registry round-trip on every session start).
# Pin --executable-path to the chromium we just installed because the MCP's
# own install-browser step hangs during extraction on arm64 + Node 26.
CHROMIUM_BIN=$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1)
if [ -n "$CHROMIUM_BIN" ]; then
    claude mcp remove playwright -s local 2>/dev/null || true
    claude mcp add playwright -s local -- \
        playwright-mcp --browser=chromium --executable-path="$CHROMIUM_BIN"
fi

cat <<'NOTE'

────────────────────────────────────────────────────────────────────
Container is ready. Next steps inside the container:

  gh auth login         # GitHub auth (used as git credential helper)
  claude                # First-time Claude Code login
  python3 .devcontainer/codex-login-helper.py   # First-time Codex login

See .devcontainer/README.md for optional SSH-based commit signing.
────────────────────────────────────────────────────────────────────
NOTE
