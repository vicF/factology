#!/usr/bin/env bash
# run-electron.sh — develop the Factology desktop app.
#
# DEFAULT (no args): HMR dev loop — Vite dev server + Electron window. Edits to
# resources/js/** hot-reload, no rebuild. The dev server is pinned to the app's
# own port (47321) so the web origin matches the packaged app: IndexedDB (and
# therefore the local database and identity) persists across dev runs.
#   ./run-electron.sh --prod     one-shot: build the SPA, copy it into
#                                electron/app/ and run the static copy (no HMR).
#                                For a packaged app use ./build-electron.sh.
#   ./run-electron.sh --remote   static mode against VITE_API_URL from .env.capacitor
#
# Note: while the dev window is open, port 47321 is owned by Vite — the
# packaged app cannot run at the same time (it would fall back to 47322, a
# different origin with a different local database).
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
MODE="dev"
BUILD_MODE="local"

# The electron platform is gitignored (a generated Capacitor platform, like
# android/) — if it is missing, create it via the build script.
if [ ! -f electron/package.json ]; then
    echo "==> electron/ missing — creating it first (run ./build-electron.sh once)"
    bash build-electron.sh
fi

if [ ! -d electron/node_modules/electron ]; then
    echo "==> npm install (electron platform)"
    (cd electron && npm install)
fi

for arg in "$@"; do
    case "$arg" in
        --dev) MODE="dev" ;;
        --prod|--static) MODE="prod" ;;
        --local) MODE="prod"; BUILD_MODE="local" ;;
        --remote) MODE="prod"; BUILD_MODE="remote" ;;
        *) echo "Unknown arg: $arg (use --prod, --local or --remote)" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# DEV: Vite dev server (HMR) + Electron pointed at it
# ---------------------------------------------------------------------------
if [ "$MODE" = "dev" ]; then
    # Same port as the packaged app's static server => same web origin => the
    # existing local database (IndexedDB) and identity are reused.
    DEV_PORT="${FACTOLOGY_DEV_PORT:-47321}"
    DEV_URL="http://127.0.0.1:${DEV_PORT}/index.capacitor.html"
    VITE_LOG="$SCRIPT_DIR/.vite-electron.log"

    # A half-written dep cache (force-killed Vite mid-optimize) makes the dev
    # server spin without ever answering HTTP — start from a clean one.
    rm -rf "$SCRIPT_DIR/node_modules/.vite"

    echo "==> Starting Vite dev server (HMR on http://127.0.0.1:${DEV_PORT})"
    npm run dev:capacitor -- --host 127.0.0.1 --port "$DEV_PORT" --strictPort > "$VITE_LOG" 2>&1 &
    VITE_PID=$!
    trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT

    for _ in $(seq 1 60); do
        if curl -sf "$DEV_URL" > /dev/null 2>&1; then break; fi
        if ! kill -0 "$VITE_PID" 2>/dev/null; then
            echo "==> Vite exited before serving. Last lines of $VITE_LOG:" >&2
            tail -n 20 "$VITE_LOG" >&2
            exit 1
        fi
        sleep 0.5
    done
    if ! curl -sf "$DEV_URL" > /dev/null 2>&1; then
        echo "==> Vite did not answer on $DEV_URL (is port ${DEV_PORT} busy?). Log: $VITE_LOG" >&2
        exit 1
    fi

    echo "==> Launching Electron (HMR) — Ctrl+C to quit"
    export FACTOLOGY_DEV_URL="$DEV_URL"
    (cd electron && npm run electron:start)
    exit 0
fi

# ---------------------------------------------------------------------------
# PROD: build the capacitor SPA, serve it statically from Electron
# ---------------------------------------------------------------------------
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

echo "==> Copying SPA into electron/app/"
rm -rf electron/app
mkdir -p electron/app
cp -r dist-capacitor/* electron/app/

echo "==> Launching Electron app (Ctrl+C to quit)"
(cd electron && npm run electron:start)
