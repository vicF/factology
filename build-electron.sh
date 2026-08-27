#!/bin/bash
# build-electron.sh
# Builds the Capacitor SPA and copies it into the Electron app directory.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_APP_DIR="$SCRIPT_DIR/electron/app"

# Use D: drive for temp to avoid C: disk space issues
export TMP=D:/tmp
export TEMP=D:/tmp
export APPDATA=D:/tmp/appdata-var
mkdir -p D:/tmp D:/tmp/appdata-var

echo "=== Building Capacitor SPA ==="
cd "$SCRIPT_DIR"
npm run build:capacitor

echo "=== Copying to electron/app/ ==="
rm -rf "$ELECTRON_APP_DIR"
mkdir -p "$ELECTRON_APP_DIR"
cp -r dist-capacitor/* "$ELECTRON_APP_DIR/"
cp "$ELECTRON_APP_DIR/index.capacitor.html" "$ELECTRON_APP_DIR/index.html"

echo "=== Done ==="
echo "To launch the desktop app: cd electron && npm run electron:start"
echo "To package: cd electron && npm run electron:make"