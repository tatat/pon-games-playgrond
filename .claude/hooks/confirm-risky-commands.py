#!/usr/bin/env python3
"""PreToolUse hook: ask for confirmation before executing risky commands."""

import json
import os
import re
import shlex
import sys

# ── git ──────────────────────────────────────────────────────────────────────
# Global options that consume the next token as their argument
GIT_GLOBAL_WITH_ARG = frozenset(
    {
        "-C",
        "-c",
        "--git-dir",
        "--work-tree",
        "--namespace",
        "--exec-path",
        "--html-path",
        "--man-path",
        "--info-path",
        "--config-env",
    }
)

# Subcommands that write to the remote
GIT_WRITE_SUBCMDS = frozenset({"push"})

# Subcommands where write depends on the first argument
GIT_WRITE_WITH_ARG: dict[str, frozenset[str]] = {
    "remote": frozenset({"add", "set-url", "rm", "remove", "rename"}),
    "submodule": frozenset({"add"}),
}

# ── gh ───────────────────────────────────────────────────────────────────────
GH_GLOBAL_WITH_ARG: frozenset[str] = frozenset()  # gh has no global options that take an argument

# Subcommands that are always read-only regardless of action
GH_READONLY_SUBCMDS = frozenset({"browse", "status", "search"})

# Actions considered read-only for standard subcommands (pr, issue, release, etc.)
GH_READONLY_ACTIONS = frozenset(
    {
        "list",
        "view",
        "status",
        "checks",
        "diff",
        "download",
        "watch",
        "clone",
        "token",
    }
)

# ── aws ──────────────────────────────────────────────────────────────────────
AWS_GLOBAL_WITH_ARG = frozenset(
    {
        "--profile",
        "--region",
        "--endpoint-url",
        "--output",
        "--query",
        "--ca-bundle",
        "--cli-connect-timeout",
        "--cli-read-timeout",
        "--color",
        "--cli-input-json",
        "--cli-input-yaml",
    }
)

AWS_READONLY_PREFIXES = ("describe-", "list-", "get-", "head-", "show-")
AWS_READONLY_EXACT = frozenset({"ls", "help", "validate"})

# ── rm ───────────────────────────────────────────────────────────────────────
# Short flags that mean recursive
RM_RECURSIVE_FLAGS = frozenset({"r", "R"})

# ── docker ───────────────────────────────────────────────────────────────────
# Top-level subcommands that are read-only
DOCKER_READONLY_SUBCMDS = frozenset(
    {
        "ps",
        "images",
        "inspect",
        "logs",
        "stats",
        "info",
        "version",
        "pull",
        "search",
        "history",
        "diff",
        "port",
        "top",
        "events",
        "ls",
        "config",
    }
)

# Management subcommands (docker image/container/volume/network/system/...)
# that take a further action token
DOCKER_MGMT_SUBCMDS = frozenset(
    {
        "image",
        "container",
        "volume",
        "network",
        "system",
        "service",
        "node",
        "stack",
        "secret",
        "trust",
    }
)

# Read-only actions for management subcommands
DOCKER_MGMT_READONLY_ACTIONS = frozenset(
    {
        "ls",
        "list",
        "inspect",
        "logs",
        "stats",
        "top",
        "info",
        "df",
        "events",
        "ps",
    }
)

# ── terraform / tofu ─────────────────────────────────────────────────────────
# -chdir=DIR always uses = form; split("=")[0] handles it
TERRAFORM_GLOBAL_WITH_ARG = frozenset({"-chdir"})
TERRAFORM_READONLY_SUBCMDS = frozenset(
    {
        "plan",
        "validate",
        "show",
        "output",
        "graph",
        "providers",
        "version",
        "fmt",
        "console",
    }
)

# ── transparent wrappers ─────────────────────────────────────────────────────
# Shell interpreters: inner command could be anything, always ask
SHELL_CMDS = frozenset({"bash", "sh", "zsh", "fish", "ksh", "dash", "csh", "tcsh"})

# Commands where inner command analysis is impractical, always ask
ALWAYS_ASK_CMDS = frozenset({"xargs", "parallel"})


def strip_global_opts(tokens: list[str], opts_with_arg: frozenset[str]) -> list[str]:
    """Return [command, subcommand, ...] with leading options removed.

    Skips flags and --opt=val / --opt <val> forms starting at index 1.
    Stops at the first non-option token (the subcommand).
    """
    result = [tokens[0]]
    i = 1
    while i < len(tokens):
        tok = tokens[i]
        if not tok.startswith("-"):
            result.extend(tokens[i:])
            break
        base = tok.split("=")[0]
        if tok in opts_with_arg or base in opts_with_arg:
            i += 1 if "=" in tok else 2  # --opt=val or --opt <val>
        else:
            i += 1  # bare flag
    return result


def is_git_write(tokens: list[str]) -> bool:
    cleaned = strip_global_opts(tokens, GIT_GLOBAL_WITH_ARG)
    if len(cleaned) < 2:
        return False
    subcmd = cleaned[1]
    if subcmd in GIT_WRITE_SUBCMDS:
        return True
    if subcmd in GIT_WRITE_WITH_ARG:
        return len(cleaned) >= 3 and cleaned[2] in GIT_WRITE_WITH_ARG[subcmd]
    return False


def is_gh_write(tokens: list[str]) -> bool:
    cleaned = strip_global_opts(tokens, GH_GLOBAL_WITH_ARG)
    if len(cleaned) < 2:
        return False
    subcmd = cleaned[1]
    if subcmd in GH_READONLY_SUBCMDS:
        return False
    if subcmd == "api":
        # Explicit GET is safe; anything else (or unspecified) is conservative ask
        for i, tok in enumerate(tokens):
            if tok in ("-X", "--method") and i + 1 < len(tokens):
                return tokens[i + 1].upper() != "GET"
        return True
    if len(cleaned) < 3:
        return True  # bare 'gh <subcmd>' — ask to be safe
    return cleaned[2] not in GH_READONLY_ACTIONS


def is_rm_recursive(tokens: list[str]) -> bool:
    for tok in tokens[1:]:
        if tok == "--":
            break
        if tok in ("-r", "-R", "--recursive"):
            return True
        # Combined short flags: -rf, -fr, -Rf, etc.
        if tok.startswith("-") and not tok.startswith("--"):
            if RM_RECURSIVE_FLAGS & set(tok[1:]):
                return True
    return False


def is_docker_write(tokens: list[str]) -> bool:
    if len(tokens) < 2:
        return False
    subcmd = tokens[1]
    # docker compose/management-subcmd <action>: check the third token
    if subcmd in ("compose", *DOCKER_MGMT_SUBCMDS):
        if len(tokens) < 3:
            return True  # bare 'docker <subcmd>' — ask to be safe
        readonly = DOCKER_MGMT_READONLY_ACTIONS if subcmd in DOCKER_MGMT_SUBCMDS else DOCKER_READONLY_SUBCMDS
        return tokens[2] not in readonly
    return subcmd not in DOCKER_READONLY_SUBCMDS


def is_terraform_write(tokens: list[str]) -> bool:
    cleaned = strip_global_opts(tokens, TERRAFORM_GLOBAL_WITH_ARG)
    if len(cleaned) < 2:
        return False
    return cleaned[1] not in TERRAFORM_READONLY_SUBCMDS


def is_aws_write(tokens: list[str]) -> bool:
    cleaned = strip_global_opts(tokens, AWS_GLOBAL_WITH_ARG)
    # cleaned: [aws, service, subcommand, ...]
    if len(cleaned) < 3:
        return False
    subcommand = cleaned[2]
    if subcommand in AWS_READONLY_EXACT:
        return False
    return not any(subcommand.startswith(p) for p in AWS_READONLY_PREFIXES)


OPERATORS = frozenset({"|", "||", "&", "&&", ";", ";;", "|&"})


def split_segments(cmd: str) -> list[list[str]] | None:
    """Split a shell command into segments at pipe/semicolon/and operators,
    respecting quoting. Returns None if the command cannot be parsed."""
    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None
    segments: list[list[str]] = []
    current: list[str] = []
    for tok in tokens:
        if tok in OPERATORS:
            if current:
                segments.append(current)
            current = []
        else:
            current.append(tok)
    if current:
        segments.append(current)
    return segments


def skip_env_vars(tokens: list[str]) -> list[str]:
    """Skip leading VAR=VAL assignments and return remaining tokens starting with the command."""
    i = 0
    while i < len(tokens) and "=" in tokens[i] and not tokens[i].startswith("-"):
        i += 1
    return tokens[i:]


def unwrap_transparent(cmd: str, tokens: list[str]) -> list[str] | None:
    """If cmd is a transparent wrapper, return the inner command tokens; else None.

    Handles: nohup, command, time, nice, timeout, ionice.
    """
    # nohup cmd ...
    if cmd == "nohup":
        return tokens[1:]

    # command [-p|-v|-V] cmd ...
    if cmd == "command":
        rest = tokens[1:]
        while rest and rest[0] in {"-p", "-v", "-V"}:
            rest = rest[1:]
        return rest

    # time [-p] cmd ...
    if cmd == "time":
        rest = tokens[1:]
        if rest and rest[0] == "-p":
            rest = rest[1:]
        return rest

    # nice [-n N | -n=N | -NUM] cmd ...
    if cmd == "nice":
        rest = tokens[1:]
        if rest:
            if rest[0] == "-n" and len(rest) > 1:
                rest = rest[2:]
            elif re.match(r"^-n=?\d+$", rest[0]):
                # -n5 or -n=5 form
                rest = rest[1:]
            elif re.match(r"^-\d+$", rest[0]):
                rest = rest[1:]
        return rest

    # timeout [--signal=SIG | -s SIG] [--kill-after=DUR | -k DUR] DURATION cmd ...
    if cmd == "timeout":
        rest = tokens[1:]
        while rest and rest[0].startswith("-"):
            tok = rest[0]
            tok_base = tok.split("=")[0]
            rest = rest[1:]
            # flags that take a separate value token
            if tok_base in {"-s", "-k", "--signal", "--kill-after"} and "=" not in tok and rest:
                rest = rest[1:]
        if rest:
            rest = rest[1:]  # skip the DURATION positional arg
        return rest

    # ionice [-c CLASS] [-n PRIO] [-p PID | -P PGID] cmd ...
    if cmd == "ionice":
        rest = tokens[1:]
        while rest and rest[0].startswith("-"):
            flag = rest[0]
            rest = rest[1:]
            if flag in {"-c", "-n", "-p", "-P", "--class", "--classdata", "--pid", "--pgid"} and rest and not rest[0].startswith("-"):
                rest = rest[1:]
        return rest

    return None  # not a recognized transparent wrapper


def should_ask_segment(tokens: list[str]) -> bool:
    if not tokens:
        return False

    # Skip leading VAR=VAL assignments
    tokens = skip_env_vars(tokens)
    if not tokens:
        return False

    cmd = os.path.basename(tokens[0])

    # Shell interpreters and analysis-resistant commands always need confirmation
    if cmd in SHELL_CMDS or cmd in ALWAYS_ASK_CMDS:
        return True

    # Transparent wrappers: unwrap and recurse (handles chains like nohup nice -n5 aws ...)
    inner = unwrap_transparent(cmd, tokens)
    if inner is not None:
        return should_ask_segment(inner)

    match cmd:
        case "git":
            return is_git_write(tokens)
        case "gh":
            return is_gh_write(tokens)
        case "aws":
            return is_aws_write(tokens)
        case "rm":
            return is_rm_recursive(tokens)
        case "terraform" | "tofu":
            return is_terraform_write(tokens)
        case "docker":
            return is_docker_write(tokens)
        case "docker-compose":
            # docker-compose <subcmd>: same readonly set as docker compose
            if len(tokens) < 2:
                return True
            return tokens[1] not in DOCKER_READONLY_SUBCMDS
        case "sudo" | "su" | "env":
            return True
    return False


def should_ask(cmd: str) -> tuple[bool, str]:
    """Return (should_ask, reason) for the command."""
    segments = split_segments(cmd)
    if segments is None:
        return True, "Command could not be parsed safely"
    if ".claude" in cmd:
        for segment in segments:
            for token in segment:
                for m in re.finditer(r"\.claude", token):
                    if not token[m.start() :].startswith(".claude/plugins/cache"):
                        return True, "Command accesses .claude directory"
    if any(should_ask_segment(s) for s in segments):
        return True, "This command may affect external state (sudo/su/env/aws/gh/git/rm/terraform/docker write operation)"
    return False, ""


def main() -> None:
    try:
        data = json.load(sys.stdin)
        cmd = data.get("tool_input", {}).get("command", "")
        hook_event_name = data.get("hook_event_name", "PreToolUse")
    except (json.JSONDecodeError, KeyError):
        cmd = ""
        hook_event_name = "PreToolUse"

    ask, reason = should_ask(cmd)
    if ask:
        output: dict = {
            "hookEventName": hook_event_name,
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
        print(json.dumps({"hookSpecificOutput": output}))


def _run_tests() -> None:
    def ask(cmd: str) -> bool:
        return should_ask(cmd)[0]

    # .claude access — should ask
    assert ask("cat ~/.claude/settings.json")
    assert ask("cat .claude/settings.json")
    assert ask("rm -rf .claude/")
    assert ask("echo foo > .claude/settings.json")

    # .claude/plugins/cache — should NOT ask
    assert not ask("node .claude/plugins/cache/foo/bar.mjs")
    assert not ask("cat .claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs")

    # mixed token: cache path AND non-cache .claude in same token — should ask
    assert ask("cat .claude/plugins/cache/foo:.claude/settings.json")

    # multiple tokens: one cache, one non-cache — should ask
    assert ask("cat .claude/plugins/cache/foo .claude/settings.json")

    # .claude not present — should NOT ask
    assert not ask("cat /home/ubuntu/.config/something")
    assert not ask("ls -la")
    assert not ask("uv sync --all-groups")

    # risky commands unrelated to .claude — should ask
    assert ask("git push origin main")
    assert ask("rm -rf /tmp/foo")
    assert ask("sudo apt-get install vim")
    assert ask("gh pr create")

    # safe commands — should NOT ask
    assert not ask("git status")
    assert not ask("git log --oneline")
    assert not ask("gh pr list")
    assert not ask("aws s3 ls")

    # unparseable — should ask
    assert ask("cat 'unclosed quote")

    # regression: VAR=VAL prefix was not skipped, hiding the real command
    assert ask("AWS_PROFILE=x aws ecs register-task-definition")
    assert ask("ENV=val gh pr create")

    # regression: absolute path was not matched against command name
    assert ask("/usr/local/bin/aws ecs register-task-definition")
    assert ask("/usr/bin/git push origin main")

    # regression: transparent wrappers were not unwrapped
    assert ask("nohup aws ecs register-task-definition")
    assert ask("time git push origin main")
    assert ask("nice -n 10 aws ecs register-task-definition")
    assert ask("timeout 30 git push origin main")

    # shell interpreters — always ask
    assert ask('bash -c "aws ecs register-task-definition"')
    assert ask("sh -c 'git push'")

    # xargs/parallel — inner command unanalysable, always ask
    assert ask("xargs aws")
    assert ask("parallel git push")

    # regression: pipe should not cause risky segment to be missed
    assert ask("git push origin main | cat")
    assert ask("cat foo | gh pr create")

    print("All tests passed.")


if __name__ == "__main__":
    import sys

    if "--test" in sys.argv:
        _run_tests()
    else:
        main()
