#!/usr/bin/env bash
# run-electron.sh — build and launch the Factology desktop app in dev mode.
#
# Usage:
#   ./run-electron.sh                 # local standalone mode (Dexie, no server) — DEFAULT
#   ./run-electron.sh --local         # same as above (explicit)
#   ./run-electron.sh --remote        # remote mode (VITE_API_URL from .env.capacitor)
#
# Builds the Capacitor SPA, copies it into electron/app/, and launches the
# Electron shell. There is no HMR inside the Electron window — after changing
# resources/js/** re-run this script (or build-electron.sh for a packaged app).
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
BUILD_MODE="local"

# The electron platform is gitignored (a generated Capacitor platform, like
# android/) — if it is missing, create it via the build script.
if [ ! -f electron/package.json ]; then
    echo "==> electron/ missing — creating it first (run ./build-electron.sh once)"
    bash build-electron.sh
fi

for arg in "$@"; do
    case "$arg" in
        --local) BUILD_MODE="local" ;;
        --remote) BUILD_MODE="remote" ;;
        *) echo "Unknown arg: $arg (use --local or --remote)"; exit 1 ;;
    esac
done

# --- 1. build the capacitor SPA ---------------------------------------------------
if [ "$BUILD_MODE" = "remote" ]; then
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
if [ -f dist-capacitor/index.capacitor.html ] && [ ! -f dist-capacitor/index.html ]; then
    cp dist-capacitor/index.capacitor.html dist-capacitor/index.html
fi

# --- 2. copy the SPA into the electron platform -------------------------------------
echo "==> Copying SPA into electron/app/"
rm -rf electron/app
mkdir -p electron/app
cp -r dist-capacitor/* electron/app/

# --- 3. launch -----------------------------------------------------------------------
echo "==> Launching Electron app (Ctrl+C to quit)"
(cd electron && npm run electron:start)
