#!/bin/bash
set -euo pipefail

echo "Verifying firewall rules..."

# Verify: direct outbound access is blocked
if curl --proxy "" --connect-timeout 5 https://192.0.2.1 >/dev/null 2>&1; then
    echo "ERROR: Direct outbound access is not blocked"
    exit 1
else
    echo "OK: Direct outbound access is blocked"
fi

# Verify: proxy access to allowed domain works
if ! curl --proxy http://127.0.0.1:3128 --connect-timeout 10 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Proxy access to api.github.com failed"
    exit 1
else
    echo "OK: Proxy access to api.github.com works"
fi

echo "Firewall verification passed"
