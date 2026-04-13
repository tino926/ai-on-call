#!/bin/bash
# Install Telegram Hook Plugin for OpenCode

set -e

PLUGIN_DIR="$HOME/.opencode/plugins"
PLUGIN_FILE="$PLUGIN_DIR/telegram-hook.js"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Telegram Hook Plugin for OpenCode..."

# Create plugin directory if it doesn't exist
mkdir -p "$PLUGIN_DIR"

# Copy plugin file
cp "$SCRIPT_DIR/telegram-hook.js" "$PLUGIN_FILE"

# Check if plugins.json exists, create if not
PLUGINS_JSON="$PLUGIN_DIR/plugins.json"
if [ ! -f "$PLUGINS_JSON" ]; then
  echo '{"plugins": []}' > "$PLUGINS_JSON"
fi

# Add plugin to plugins.json if not already present
if ! grep -q "telegram-hook" "$PLUGINS_JSON" 2>/dev/null; then
  # Use node to properly update the JSON
  node -e "
    const fs = require('fs');
    const path = require('path');
    const pluginsFile = path.join(process.env.HOME, '.opencode/plugins/plugins.json');
    let data = { plugins: [] };
    try {
      data = JSON.parse(fs.readFileSync(pluginsFile, 'utf-8'));
    } catch (e) {}
    if (!data.plugins.includes('./telegram-hook.js')) {
      data.plugins.push('./telegram-hook.js');
    }
    fs.writeFileSync(pluginsFile, JSON.stringify(data, null, 2));
  "
fi

echo "Plugin installed to: $PLUGIN_FILE"
echo "To use with the bot, set environment variables:"
echo "  export TELEGRAM_BOT_HOOK_URL=http://localhost:3001"
echo "  export OPENCODE_HOOK_PORT=3001"
