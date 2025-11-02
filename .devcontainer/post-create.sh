#!/bin/bash

set -e

echo "🚀 Setting up BattleCity JS Remake development environment..."

# Install client dependencies
echo "📦 Installing client dependencies..."
cd "${BATTLECITY_ROOT:-$(pwd)}/client"
npm install

# Install server dependencies
echo "📦 Installing server dependencies..."
cd "${BATTLECITY_ROOT:-$(pwd)}/server"
npm install

# Install pre-commit (requires Python)
echo "🐍 Installing pre-commit..."
if command -v python3 &> /dev/null; then
    # Install UV if not available
    if ! command -v uv &> /dev/null; then
        echo "📦 Installing UV..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        # Source UV's environment setup
        if [ -f "$HOME/.local/bin/env" ]; then
            source "$HOME/.local/bin/env"
        fi
    fi

    # Ensure UV and its tools are in PATH
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

    # Install pre-commit using UV
    echo "📦 Installing pre-commit via UV..."
    uv tool install pre-commit

    # Install pre-commit hooks only if config file exists
    cd "${BATTLECITY_ROOT:-$(pwd)}"
    if [ -f ".pre-commit-config.yaml" ]; then
        echo "🪝 Installing pre-commit hooks..."
        pre-commit install --install-hooks
    else
        echo "⚠️  .pre-commit-config.yaml not found, skipping hook installation"
        echo "💡 Pre-commit is installed. Create .pre-commit-config.yaml to enable hooks"
    fi
else
    echo "⚠️  Python3 not found, skipping pre-commit installation"
fi

# Install Claude Code CLI
echo "🤖 Installing Claude Code CLI..."
if command -v npm &> /dev/null; then
    npm install -g @anthropic-ai/claude-code
else
    echo "⚠️  npm not found, skipping Claude Code CLI installation"
fi

# Install all root/workspace dependencies
cd "${BATTLECITY_ROOT:-$(pwd)}"
echo "📦 Installing all monorepo dependencies (root, client, server)..."
npm install

echo "✅ Development environment ready!"
echo ""
echo "📝 Next steps:"
echo "   - Make you code changes"
echo "  - Start both client and server: npm run dev"
echo ""
echo "💡 Pre-commit hooks are now active. Your commits will be checked for:"
echo "   - Conventional Commits format"
echo "   - ESLint code quality"
