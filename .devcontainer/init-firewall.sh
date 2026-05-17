#!/bin/bash
set -euo pipefail

# Fetch GitHub IP ranges.
# On first run (postCreate) the firewall is not yet applied so direct access works.
# On subsequent runs (postStart) the firewall is already active so we use the proxy.
echo "Fetching GitHub IP ranges..."
gh_meta=$(curl -s --proxy http://127.0.0.1:3128 https://api.github.com/meta)
if [ -z "$gh_meta" ]; then
    echo "ERROR: Failed to fetch GitHub IP ranges"
    exit 1
fi

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true
ipset destroy github-ssh 2>/dev/null || true

# Allow loopback (Squid listens on localhost:3128)
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT

# Allow SSH outbound to GitHub only (for git operations)
ipset create github-ssh hash:net
while read -r cidr; do
    echo "Adding GitHub SSH range: $cidr"
    ipset add github-ssh "$cidr"
done < <(echo "$gh_meta" | jq -r '.git[]' | grep -v ':')
iptables -A OUTPUT -p tcp --dport 22 -m set --match-set github-ssh dst -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

# Allow established/related connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow host network (for devcontainer connectivity)
HOST_IP=$(ip route | grep default | awk '{print $3}')
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network: $HOST_NETWORK"
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Allow only Squid (proxy user) to make outbound connections
iptables -A OUTPUT -m owner --uid-owner proxy -j ACCEPT

# Set default policies to DROP
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Explicitly REJECT outbound traffic for immediate feedback (instead of silent timeout)
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
