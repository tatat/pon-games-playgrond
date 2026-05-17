#!/bin/bash
set -e

# Start Squid and apply firewall before any network activity
# so installs from postCreate (npm ci, etc.) go through the allowlist.
sudo squid -f "${WORKSPACE_FOLDER}/.devcontainer/squid.conf"
sleep 1
sudo "${WORKSPACE_FOLDER}/.devcontainer/init-firewall.sh"

cd ~

cp /tmp/host-gitconfig ~/.gitconfig

SSH_KEY="${DEVCONTAINER_SSH_KEY:-id_devcontainer}"
if [ ! -f /tmp/host-ssh/${SSH_KEY}.pub ]; then
    echo "ERROR: ~/.ssh/devcontainer/${SSH_KEY}.pub not found." >&2
    echo "To set up a dedicated SSH key, run on the host:" >&2
    echo "  mkdir -p ~/.ssh/devcontainer && ssh-keygen -t ed25519 -f ~/.ssh/devcontainer/${SSH_KEY} -N \"\"" >&2
    echo "Then register it on GitHub as both an Authentication Key and a Signing Key." >&2
    echo "See .devcontainer/README.md for details." >&2
    exit 1
fi

mkdir -p ~/.ssh
chmod 700 ~/.ssh
cp /tmp/host-ssh/${SSH_KEY} ~/.ssh/${SSH_KEY}
cp /tmp/host-ssh/${SSH_KEY}.pub ~/.ssh/${SSH_KEY}.pub
chmod 600 ~/.ssh/${SSH_KEY}
ssh-keyscan github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts

cat > ~/.ssh/config << EOF
Host github.com
    IdentityFile ~/.ssh/${SSH_KEY}
    IdentitiesOnly yes
EOF

git config --global gpg.format ssh
git config --global user.signingKey ~/.ssh/${SSH_KEY}.pub
git config --global commit.gpgsign true
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
git config --global --unset gpg.ssh.program || true

cd "${WORKSPACE_FOLDER}"

sudo chown ubuntu -R node_modules
sudo chown -R ubuntu:ubuntu ~/.config ~/.claude ~/.codex
chmod 700 ~/.claude ~/.codex

# Keep ~/.claude.json in the claude-config volume so it survives rebuilds
[ -f ~/.claude/.claude.json ] || echo '{}' > ~/.claude/.claude.json
ln -sf ~/.claude/.claude.json ~/.claude.json

npm ci
npm run prepare
