#!/usr/bin/env python3
"""
Codex login helper for devcontainer environments where browser access is unavailable.

Starts `codex login`, captures the auth URL, and forwards the OAuth callback
from the host browser back to the local server — all in one interactive flow.
"""

import re
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request


def _drain(proc: subprocess.Popen, buf: list[str]) -> None:
    for line in proc.stdout:  # type: ignore[union-attr]
        print(line, end="", flush=True)
        buf.append(line)


def main() -> None:
    print("Starting codex login...")

    proc = subprocess.Popen(
        ["codex", "login"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    auth_url: str | None = None

    for line in proc.stdout:  # type: ignore[union-attr]
        print(line, end="", flush=True)
        if not auth_url:
            m = re.search(r"https://\S+", line)
            if m:
                auth_url = m.group(0)
                break
    else:
        # stdout closed before a URL appeared — process already finished
        proc.wait()
        if proc.returncode == 0:
            print("\nAlready logged in (no browser redirect needed).")
        else:
            print(f"\ncodex login failed (exit {proc.returncode}).", file=sys.stderr)
            sys.exit(1)
        return

    # Drain remaining output in background so the process doesn't stall
    buf: list[str] = []
    drain_thread = threading.Thread(target=_drain, args=(proc, buf), daemon=True)
    drain_thread.start()

    print(f"\nOpen this URL in your HOST browser:\n\n  {auth_url}\n")
    print("After authenticating, the browser will redirect to localhost and fail to connect.")
    print("Copy that localhost URL from the address bar and paste it below.\n")

    try:
        callback_url = input("Paste localhost callback URL: ").strip()
    except (KeyboardInterrupt, EOFError):
        proc.terminate()
        sys.exit(1)

    if not callback_url:
        print("Error: no URL provided.", file=sys.stderr)
        proc.terminate()
        sys.exit(1)

    try:
        parsed = urllib.parse.urlparse(callback_url)
        if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError
    except ValueError:
        print(f"Error: expected a loopback URL (http://localhost/...), got: {callback_url}", file=sys.stderr)
        proc.terminate()
        sys.exit(1)

    print("\nForwarding callback to Codex server...")
    try:
        with urllib.request.urlopen(callback_url, timeout=10) as resp:
            resp.read()
    except urllib.error.URLError as e:
        # Server may close immediately after receiving the callback — treat as normal
        print(f"Note: {e.reason}", file=sys.stderr)

    print("Waiting for codex login to finish...")
    drain_thread.join(timeout=10)
    try:
        proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait()
        print("codex login timed out.", file=sys.stderr)
        sys.exit(1)

    if proc.returncode == 0:
        print("Login successful!")
    else:
        print(
            f"codex login exited with code {proc.returncode} — run 'codex auth status' to verify.",
            file=sys.stderr,
        )
        sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
