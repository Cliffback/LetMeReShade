#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$HOME/homebrew/plugins/LetMeReShade"
BACKUP_DIR="$HOME/homebrew/plugins/.LetMeReShade.backup"

# Cache sudo credentials once
sudo -v

# Ensure we restore the backup even if something goes wrong after deployment
restore_backup() {
  if [ -d "$BACKUP_DIR" ]; then
    echo "Restoring original plugin (sudo may be required)..."
    sudo -v
    sudo rm -rf "$PLUGIN_DIR"
    sudo mv "$BACKUP_DIR" "$PLUGIN_DIR"
    sudo systemctl restart plugin_loader.service
    echo "Restored original plugin and restarted Decky Loader."
  fi
}

# 1. Build the plugin
pnpm run build

# 2. Back up existing plugin
if [ -d "$PLUGIN_DIR" ]; then
  sudo rm -rf "$BACKUP_DIR"
  sudo mv "$PLUGIN_DIR" "$BACKUP_DIR"
  echo "Backed up existing plugin to $BACKUP_DIR"
fi

# Restore backup on exit (covers both normal exit and interrupts)
trap restore_backup EXIT

# 3. Deploy to plugins directory
sudo mkdir -p "$PLUGIN_DIR/dist" "$PLUGIN_DIR/defaults"
sudo cp -r dist/* "$PLUGIN_DIR/dist/"
sudo cp -r defaults/* "$PLUGIN_DIR/defaults/"
sudo cp main.py package.json plugin.json "$PLUGIN_DIR/"
sudo sed -i 's/"version": "\([^"]*\)"/"version": "\1-dev"/' "$PLUGIN_DIR/package.json"
echo "Dev build deployed to $PLUGIN_DIR"

# 4. Restart Decky so it loads the new plugin
sudo systemctl restart plugin_loader.service
echo "Decky Loader restarted."

# 5. Launch gamescope with Steam gamepadui
echo "Launching gamescope..."
gamescope -- steam -gamepadui

# 6. Restore happens automatically via the EXIT trap
echo "Gamescope exited."
