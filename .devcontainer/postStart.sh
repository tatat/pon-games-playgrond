#!/bin/bash
set -e

# Flush any stale iptables rules from the previous session.
# On container restart the network namespace is preserved, so old OUTPUT DROP rules
# would prevent Squid from starting. Reset to ACCEPT before starting Squid.
sudo iptables -P OUTPUT ACCEPT 2>/dev/null || true
sudo iptables -P INPUT ACCEPT 2>/dev/null || true
sudo iptables -P FORWARD ACCEPT 2>/dev/null || true
sudo iptables -F 2>/dev/null || true

# Start Squid if not already listening (check actual port, not just PID file)
if ! bash -c "echo >/dev/tcp/127.0.0.1/3128" 2>/dev/null; then
    sudo squid -f "${WORKSPACE_FOLDER}/.devcontainer/squid.conf"
fi

# Wait for Squid to be ready
for i in $(seq 1 15); do
    bash -c "echo >/dev/tcp/127.0.0.1/3128" 2>/dev/null && break
    echo "Waiting for Squid... ($i/15)"
    sleep 1
done
if ! bash -c "echo >/dev/tcp/127.0.0.1/3128" 2>/dev/null; then
    echo "ERROR: Squid did not become ready in time"
    exit 1
fi

# Apply firewall rules
sudo "${WORKSPACE_FOLDER}/.devcontainer/init-firewall.sh"

# Clear stale Chromium singleton locks left over in the persistent
# playwright-cache volume from a previous container (different hostname/pid).
# Chromium otherwise refuses to launch with "Browser is already in use".
rm -f "$HOME"/.cache/ms-playwright/mcp-chrome-*/Singleton{Lock,Cookie,Socket} 2>/dev/null || true
