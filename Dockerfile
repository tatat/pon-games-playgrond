# syntax=docker/dockerfile:1
FROM ubuntu:noble

ENV LANG=C.UTF-8

SHELL ["/bin/bash", "-c"]

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive TZ=Asia/Tokyo apt-get install -y \
        sudo \
        curl \
        wget \
        git \
        vim \
        jq \
        make \
        build-essential \
        unzip \
        direnv \
        python3 \
        squid \
        iptables \
        ipset \
        iproute2

RUN echo "ubuntu ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

# GitHub CLI (apt repo) — used by gh + Copilot CLI.
RUN install -m 0755 -d /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out > /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y gh

# Shared libraries Playwright's Chromium needs at runtime. The browser binary
# itself is downloaded per-user by `npx playwright install chromium` in
# postCreate. Note: Chrome for Testing has no linux-arm64 build, so on arm64
# we rely on Playwright's own arm64 chromium build (cdn.playwright.dev).
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libnspr4 \
        libnss3 \
        libcups2t64 \
        libxkbcommon0 \
        libasound2t64 \
        libgbm1 \
        libcairo2 \
        libpango-1.0-0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libatspi2.0-0t64 \
        libatk1.0-0t64 \
        libatk-bridge2.0-0t64

WORKDIR /home/ubuntu

USER ubuntu

RUN echo 'eval "$(direnv hook bash)"' >> ~/.bashrc

# asdf for managing Node from .tool-versions
RUN git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.15.0

RUN echo ". \$HOME/.asdf/asdf.sh" >> ~/.bashrc \
    && echo ". \$HOME/.asdf/completions/asdf.bash" >> ~/.bashrc

RUN --mount=type=bind,source=.tool-versions,target=/tmp/.tool-versions \
    . "$HOME/.asdf/asdf.sh" \
    && cp /tmp/.tool-versions ~/.tool-versions \
    && asdf plugin-add nodejs \
    && asdf install nodejs

# Claude Code (native installer puts the binary in ~/.local/bin/claude)
RUN curl -fsSL https://claude.ai/install.sh | bash

# GitHub Copilot CLI (gh extension)
RUN curl -fsSL https://gh.io/copilot-install | bash

# Codex CLI + Playwright MCP server
RUN . "$HOME/.asdf/asdf.sh" \
    && npm install -g @openai/codex @playwright/mcp
