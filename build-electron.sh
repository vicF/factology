#!/usr/bin/env bash
# build-electron.sh — build the Factology desktop (Electron) app.
#
# Usage:
#   ./build-electron.sh                # local standalone mode (Dexie, no server) — DEFAULT
#   ./build-electron.sh --local        # same as above (explicit)
#   ./build-electron.sh --remote       # remote mode (VITE_API_URL from .env.capacitor)
#
# Produces an unpacked desktop app in dist-electron/ (analogous to dist-android/).
#
# Requires: Node, npm.
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
BUILD_MODE="local"

# Use D: drive for temp to avoid C: disk space issues
export TMP=D:/tmp
export TEMP=D:/tmp
export APPDATA=D:/tmp/appdata-var
mkdir -p D:/tmp D:/tmp/appdata-var

# --- parse args ---------------------------------------------------------------
for arg in "$@"; do
    case "$arg" in
        --local) BUILD_MODE="local" ;;
        --remote) BUILD_MODE="remote" ;;
        *) echo "Unknown arg: $arg (use --local or --remote)"; exit 1 ;;
    esac
done

# --- 1. ensure npm deps + the electron platform -----------------------------------
if [ ! -d node_modules/@capacitor/cli ]; then
    echo "==> npm install"
    npm install
fi
if [ ! -f electron/package.json ]; then
    # electron/ is gitignored (a generated Capacitor platform, like android/).
    echo "==> electron/ missing — running: npx cap add @capacitor-community/electron"
    npm install --save-dev @capacitor-community/electron
    npx cap add @capacitor-community/electron
fi
if [ ! -d electron/node_modules/electron ]; then
    echo "==> npm install (electron platform)"
    (cd electron && npm install)
fi

# --- 2. set VITE_API_URL and build the capacitor SPA ---------------------------
if [ "$BUILD_MODE" = "remote" ]; then
    # Pull VITE_API_URL out of .env.capacitor (strip quotes/comments/CR).
    if [ -f .env.capacitor ]; then
        export VITE_API_URL="$(grep -E '^VITE_API_URL=' .env.capacitor | head -1 | cut -d= -f2- | tr -d '\r\042\047')"
        echo "==> Building in REMOTE mode — VITE_API_URL=$VITE_API_URL"
    else
        export VITE_API_URL=""
        echo "==> --remote but no .env.capacitor found — building standalone."
    fi
else
    export VITE_API_URL=""
    echo "==> Building in LOCAL (standalone Dexie) mode — VITE_API_URL=''"
fi

npm run build:capacitor
# The SPA build emits index.capacitor.html; the electron platform expects an
# index.html entry, so mirror it (same as build-android.sh does for cap sync).
if [ -f dist-capacitor/index.capacitor.html ] && [ ! -f dist-capacitor/index.html ]; then
    cp dist-capacitor/index.capacitor.html dist-capacitor/index.html
fi
echo "==> Capacitor SPA build complete -> $SCRIPT_DIR/dist-capacitor"

# --- 3. copy web assets into the electron platform -------------------------------
# The electron platform serves the SPA from electron/app/ over a custom scheme.
# `npx cap sync electron` is not registered (the community platform isn't in the
# root node_modules), so copy the built webDir manually.
echo "==> Copying SPA into electron/app/"
rm -rf electron/app
mkdir -p electron/app
cp -r dist-capacitor/* electron/app/

# --- 4. package the desktop app (unpacked dir, like the debug APK) ---------------
echo "==> electron-builder --dir"
(cd electron && npm run electron:pack)

# --- 5. copy the packaged app to a known output dir --------------------------------
mkdir -p "$SCRIPT_DIR/dist-electron"
UNPACKED_SRC="$(ls -d "$SCRIPT_DIR/electron/dist/"*-unpacked 2>/dev/null | head -1)"
if [ -n "$UNPACKED_SRC" ] && [ -n "$(ls "$UNPACKED_SRC"/*.exe 2>/dev/null | head -1)" ]; then
    cp -r "$UNPACKED_SRC"/* "$SCRIPT_DIR/dist-electron/"
    echo ""
    echo "==> Desktop app ready: $SCRIPT_DIR/dist-electron/"
    echo "    Launch the packaged app: \"$SCRIPT_DIR/dist-electron/$(basename "$UNPACKED_SRC"/*.exe)\""
    echo "    Dev run (with live-reload watcher): ./run-electron.sh"
else
    echo ""
    echo "==> Packaged app not found under electron/dist — skipping copy."
    echo "    Dev run: ./run-electron.sh"
fi
