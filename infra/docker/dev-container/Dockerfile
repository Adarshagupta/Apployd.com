FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install base tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git vim nano \
    build-essential ca-certificates \
    python3 python3-pip python3-venv \
    unzip zip jq \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub Copilot CLI extension
RUN gh extension install github/gh-copilot --force || true

# Create non-root coder user
RUN useradd -m -s /bin/bash -u 1001 coder

# Create workspace and config dirs
RUN mkdir -p /home/coder/project /home/coder/.config /home/coder/.ssh \
    && chown -R coder:coder /home/coder

USER coder
WORKDIR /home/coder/project

# Default shell
CMD ["/bin/bash"]
