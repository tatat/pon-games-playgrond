#!/bin/bash
# Host-side helper for SSH-based commit signing in the devcontainer.
# Only touches a dedicated key directory under ~/.ssh/devcontainer/ and
# (optionally) registers the key on GitHub via gh. Your global ~/.gitconfig
# is NOT modified — signing is configured inside the devcontainer at
# postCreate time based on the key's presence.
#
# Usage: bash .devcontainer/setup-signing-key.sh [KEY_NAME]
#   KEY_NAME defaults to id_devcontainer.

set -euo pipefail

KEY_NAME="${1:-id_devcontainer}"
KEY_DIR="$HOME/.ssh/devcontainer"
KEY_PATH="$KEY_DIR/$KEY_NAME"

mkdir -p "$KEY_DIR"
chmod 700 "$HOME/.ssh"

if [ -f "$KEY_PATH" ]; then
  echo "✓ Key already exists at $KEY_PATH"
else
  echo "Generating ed25519 key at $KEY_PATH"
  ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "devcontainer-$(hostname -s)"
fi

# Register on GitHub via gh (if available and authenticated)
TITLE_BASE="devcontainer-$(hostname -s)"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Registering on GitHub via gh..."
  gh ssh-key add "$KEY_PATH.pub" --title "${TITLE_BASE}-auth" 2>/dev/null \
    && echo "✓ Auth key registered" \
    || echo "↷ Auth key already registered (or registration failed — check GitHub manually)"
  gh ssh-key add "$KEY_PATH.pub" --title "${TITLE_BASE}-sign" --type signing 2>/dev/null \
    && echo "✓ Signing key registered" \
    || echo "↷ Signing key already registered (or registration failed — check GitHub manually)"
else
  cat <<EOF

gh is not installed or not authenticated on the host.
Manually register the following public key on GitHub:
  Settings → SSH and GPG keys
    → New SSH key       (Type: Authentication Key)
    → New SSH key       (Type: Signing Key)

Public key:
$(cat "$KEY_PATH.pub")
EOF
fi

cat <<'EOF'

Setup complete. Next:
  1. (Re)build the devcontainer — Command Palette → "Dev Containers: Rebuild Container".
  2. postCreate.sh detects the key and configures signing INSIDE the container only.
     (Your host's ~/.gitconfig is untouched.)
  3. Verify after a commit inside the container:
       git log --show-signature -1
EOF
