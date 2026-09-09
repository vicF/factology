#!/usr/bin/env bash
# run-android.sh — develop the Factology Android app with live reload.
#
# Live-reload mode (DEFAULT): installs ONE debug APK whose WebView loads its code
# from a Vite dev server on this PC (http://localhost:5174, reached through
# `adb reverse`). After that one-time install, edits to resources/js/** are
# pushed to the running app by Vite HMR — no APK rebuild / reinstall per change.
#
# Usage:
#   ./run-android.sh                # live reload, API url from .env.capacitor
#   ./run-android.sh --local        # live reload, standalone Dexie mode (no backend)
#   ./run-android.sh --static       # classic one-shot: build APK + install (no dev server)
#   ./run-android.sh --emulator     # force the Android emulator (AVD below)
#   ./run-android.sh --target <id>  # use a specific adb device/emulator serial
#   ./run-android.sh --stop         # stop a dev server left running
#
# Requires: Node, Android SDK (ANDROID_HOME), JDK (JAVA_HOME) — same as build-android.sh.
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
APP_ID="com.factology.app"
AVD_NAME="Pixel_6_API_37"
VITE_PORT=5174
VITE_URL="http://localhost:$VITE_PORT"
# The app loads the Capacitor SPA entry (index.html at the vite root boots the
# plain web app — app.js — which is not what runs inside the native shell).
LIVE_ENTRY="$VITE_URL/index.capacitor.html"
VITE_LOG="$SCRIPT_DIR/.vite-capacitor.log"
VITE_PID_FILE="$SCRIPT_DIR/.vite-capacitor.pid"
VITE_MARKER_FILE="$SCRIPT_DIR/.vite-capacitor.mode"
LIVE_APK="$SCRIPT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
BAKE_JSON="$SCRIPT_DIR/android/app/src/main/assets/capacitor.config.json"

MODE="api"           # api = VITE_API_URL from .env.capacitor ; local = standalone Dexie
RUN_TYPE="live"
TARGET=""
TARGET_EMU=0
export MSYS2_ARG_CONV_EXCL="*"

# ─── tiny helpers ---------------------------------------------------------------
info() { echo -e "\\033[0;36m[INFO]\\033[0m  $*"; }
ok()   { echo -e "\\033[0;32m[OK]\\033[0m    $*"; }
warn() { echo -e "\\033[0;33m[WARN]\\033[0m  $*"; }
err()  { echo -e "\\033[0;31m[ERR]\\033[0m   $*" >&2; }

usage() {
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

# ─── environment detection -------------------------------------------------------
detect_adb() {
    if command -v adb >/dev/null 2>&1; then ADB="$(command -v adb)"; return 0; fi
    local sdk="${ANDROID_HOME:-}"
    sdk="${sdk//\\//}"
    for cand in "$sdk/platform-tools/adb" "$HOME/AppData/Local/Android/Sdk/platform-tools/adb" "$LOCALAPPDATA/Android/Sdk/platform-tools/adb"; do
        if [ -x "$cand" ] || [ -x "$cand.exe" ]; then ADB="$cand"; return 0; fi
    done
    return 1
}

detect_java() {
    if [ -n "${JAVA_HOME:-}" ] && [ -f "$JAVA_HOME/bin/java.exe" ]; then return 0; fi
    for cand in "d:/Program Files/Android/Android Studio/jbr" "$HOME/AppData/Local/Programs/Android Studio/jbr"; do
        if [ -f "$cand/bin/java.exe" ]; then export JAVA_HOME="$cand"; return 0; fi
    done
    err "JAVA_HOME not set and no Android Studio JBR found. Set JAVA_HOME to a JDK 17+."
    return 1
}

detect_sdk() {
    if [ -n "${ANDROID_HOME:-}" ]; then return 0; fi
    for cand in "$HOME/AppData/Local/Android/Sdk" "$LOCALAPPDATA/Android/Sdk" "d:/Users/$USERNAME/AppData/Local/Android/Sdk"; do
        if [ -d "$cand" ]; then export ANDROID_HOME="${cand//\\//}"; export ANDROID_SDK_ROOT="$ANDROID_HOME"; return 0; fi
    done
    err "Android SDK not found. Set ANDROID_HOME."
    return 1
}

# ─── adb / device helpers ----------------------------------------------------------
list_devices() { "$ADB" devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}'; }

select_device() {
    if [ -n "$TARGET" ]; then
        if ! "$ADB" -s "$TARGET" get-state >/dev/null 2>&1; then
            err "Target '$TARGET' not reachable via adb."; exit 1
        fi
        return 0
    fi
    TARGET="$(list_devices | head -1)"
    if [ -z "$TARGET" ]; then
        TARGET="$(list_devices | grep '^emulator-' | head -1 || true)"
    fi
    if [ -n "$TARGET" ]; then return 0; fi

    # No device at all — boot the emulator when one is available.
    local emu="${ANDROID_HOME//\\//}/emulator/emulator.exe"
    if [ ! -x "$emu" ]; then
        err "No device connected and no emulator found at $emu"
        err "  - Connect a phone via USB (USB debugging on), or"
        err "  - Start the emulator manually:  $emu -avd $AVD_NAME"
        return 1
    fi
    if [ "$TARGET_EMU" = "0" ]; then
        warn "No device connected — starting the emulator ($AVD_NAME)."
    fi
    echo "==> Booting emulator $AVD_NAME (window opens, ~1-2 min)..."
    "$emu" -avd "$AVD_NAME" -no-snapshot-load -gpu auto >/dev/null 2>&1 &
    local i
    for i in $(seq 1 60); do
        sleep 3
        TARGET="$(list_devices | grep '^emulator-' | head -1 || true)"
        [ -n "$TARGET" ] && break
    done
    if [ -z "$TARGET" ]; then err "Emulator did not appear on adb."; return 1; fi
    info "Emulator serial: $TARGET — waiting for boot to finish..."
    for i in $(seq 1 60); do
        sleep 3
        local boot; boot="$("$ADB" -s "$TARGET" shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r')"
        [ "$boot" = "1" ] && { ok "Emulator booted."; return 0; }
    done
    err "Emulator boot timed out."; return 1
}

# ─── vite dev server ----------------------------------------------------------------
vite_listener_pid() {
    netstat -ano 2>/dev/null | awk -v p="$VITE_PORT" 'index($0,"LISTENING") && $2 ~ (":" p "$") {print $NF}' | sort -u | head -1
}
devserver_up() { curl -s -o /dev/null --connect-timeout 2 "$VITE_URL/" 2>/dev/null; }

stop_devserver() {
    if [ -f "$VITE_PID_FILE" ]; then
        local pid; pid="$(cat "$VITE_PID_FILE" 2>/dev/null || true)"
        [ -n "$pid" ] && { taskkill //F //T //PID "$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true; }
        rm -f "$VITE_PID_FILE"
    fi
    local lp; lp="$(vite_listener_pid || true)"
    [ -n "$lp" ] && taskkill //F //T //PID "$lp" >/dev/null 2>&1 || true
    rm -f "$VITE_MARKER_FILE" 2>/dev/null || true
    echo "Dev server stopped."
}

start_devserver() {
    if devserver_up; then
        local old; old="$(cat "$VITE_MARKER_FILE" 2>/dev/null || true)"
        if [ "$old" = "$MODE" ]; then
            ok "Vite dev server already running on :$VITE_PORT ($MODE mode)"
            return 0
        fi
        warn "Dev server on :$VITE_PORT was started in a different mode — restarting it."
        stop_devserver
        sleep 1
    fi
    echo "==> Starting Vite dev server (port $VITE_PORT)..."
    export VITE_API_URL
    (cd "$SCRIPT_DIR" && nohup npm run dev:capacitor >"$VITE_LOG" 2>&1 &)
    echo "    log: $VITE_LOG"
    local i
    for i in $(seq 1 30); do
        sleep 1
        devserver_up && break
    done
    if devserver_up; then
        echo "$MODE" > "$VITE_MARKER_FILE"
        local lp; lp="$(vite_listener_pid || true)"
        [ -n "$lp" ] && echo "$lp" > "$VITE_PID_FILE"
        ok "Dev server ready: $VITE_URL/"
    else
        err "Dev server failed to start — tail of $VITE_LOG:"
        tail -n 25 "$VITE_LOG" 2>/dev/null || true
        exit 1
    fi
}

# ─── build / install ----------------------------------------------------------------
ensure_web_build() {
    if [ ! -f "$SCRIPT_DIR/dist-capacitor/index.html" ]; then
        echo "==> dist-capacitor missing — building the web bundle once..."
        (cd "$SCRIPT_DIR" && npm run build:capacitor)
        if [ -f "$SCRIPT_DIR/dist-capacitor/index.capacitor.html" ] && [ ! -f "$SCRIPT_DIR/dist-capacitor/index.html" ]; then
            cp "$SCRIPT_DIR/dist-capacitor/index.capacitor.html" "$SCRIPT_DIR/dist-capacitor/index.html"
        fi
    fi
}

install_live_once() {
    # Bake server.url into the native config so the app loads from the dev server.
    if [ ! -d "$SCRIPT_DIR/android" ]; then
        err "android/ platform missing — run ./build-android.sh once first (it runs 'npx cap add android')."
        exit 1
    fi
    local baked=""
    if [ -f "$BAKE_JSON" ]; then
        baked="$(node -e "try{const j=require('$BAKE_JSON');process.stdout.write((j.server&&j.server.url)||'')}catch(e){}" 2>/dev/null || true)"
    fi
    local need=0
    [ -f "$LIVE_APK" ] || need=1
    [ "$baked" != "$LIVE_ENTRY" ] && need=1
    if [ "$need" = "0" ]; then
        ok "Installed APK already points at the dev server — skipping sync/build."
        return 0
    fi
    echo "==> cap sync (baking server.url=$LIVE_ENTRY)..."
    export CAP_LIVE_URL="$LIVE_ENTRY"
    (cd "$SCRIPT_DIR" && npx cap sync android)
    echo "==> gradle assembleDebug (one-time; later runs skip this)..."
    detect_java
    (cd "$SCRIPT_DIR/android" && ./gradlew assembleDebug)
    ok "Debug APK built: $LIVE_APK"
}

# ─── API mode / ports ---------------------------------------------------------------
resolve_mode() {
    VITE_API_URL=""
    if [ "$MODE" = "api" ] && [ -f "$SCRIPT_DIR/.env.capacitor" ]; then
        VITE_API_URL="$(grep -E '^VITE_API_URL=' "$SCRIPT_DIR/.env.capacitor" | head -1 | cut -d= -f2- | tr -d '\\r\\042\\047')"
    fi
    if [ -z "$VITE_API_URL" ]; then
        MODE="local"
        info "Standalone mode (VITE_API_URL='') — Dexie local data, no backend needed."
    else
        info "API mode — VITE_API_URL=$VITE_API_URL"
        if [[ "$VITE_API_URL" =~ ^https?://localhost:([0-9]+) ]]; then
            API_PORT="${BASH_REMATCH[1]}"
        fi
    fi
}

# ─── argument parsing ---------------------------------------------------------------
for arg in "$@"; do
    case "$arg" in
        --local)   MODE="local" ;;
        --static)  RUN_TYPE="static" ;;
        --emulator) TARGET_EMU=1 ;;
        --target=*) TARGET="${arg#--target=}" ;;
        --stop)    stop_devserver; exit 0 ;;
        --help|-h) usage; exit 0 ;;
        *) err "Unknown arg: $arg (see --help)"; exit 1 ;;
    esac
done

# ─── static mode: classic build + install -------------------------------------------
if [ "$RUN_TYPE" = "static" ]; then
    detect_sdk && detect_adb || exit 1
    select_device || exit 1
    echo "==> Building APK (./build-android.sh $([ "$MODE" = "local" ] && echo --local))..."
    if [ "$MODE" = "local" ]; then
        bash "$SCRIPT_DIR/build-android.sh" --local
    else
        bash "$SCRIPT_DIR/build-android.sh"
    fi
    echo "==> Installing on $TARGET..."
    "$ADB" -s "$TARGET" install -r -d "$SCRIPT_DIR/dist-android/factology-debug.apk"
    if [ -n "${API_PORT:-}" ]; then "$ADB" -s "$TARGET" reverse tcp:$API_PORT tcp:$API_PORT >/dev/null 2>&1 || true; fi
    "$ADB" -s "$TARGET" shell am start -n "$APP_ID/.MainActivity" >/dev/null 2>&1
    echo ""
    echo "==> App launched. (Static build — re-run this script after code changes.)"
    exit 0
fi

# ─── live mode ------------------------------------------------------------------------
detect_sdk && detect_adb || exit 1
select_device || exit 1
resolve_mode

# Map the phone's localhost → this PC for the dev server (works for USB and emulator).
REV_OK=0
for i in 1 2 3 4 5; do
    "$ADB" -s "$TARGET" reverse tcp:$VITE_PORT tcp:$VITE_PORT >/dev/null 2>&1 && { REV_OK=1; break; }
    sleep 1
done
if [ "$REV_OK" = "1" ]; then
    ok "adb reverse: device localhost:$VITE_PORT -> this PC"
else
    err "adb reverse for :$VITE_PORT failed — live reload can't work without it."
    err "Unplug/replug the device, then re-run this script."
    exit 1
fi
if [ -n "${API_PORT:-}" ]; then
    "$ADB" -s "$TARGET" reverse tcp:$API_PORT tcp:$API_PORT >/dev/null 2>&1 \
        && ok "adb reverse: device localhost:$API_PORT -> this PC (API)" || true
fi

start_devserver
ensure_web_build
install_live_once

echo "==> Installing + launching on $TARGET..."
"$ADB" -s "$TARGET" install -r -d "$LIVE_APK"
"$ADB" -s "$TARGET" shell am start -n "$APP_ID/.MainActivity" >/dev/null 2>&1

echo ""
echo "=============================================="
echo "  Live reload is ON for $TARGET"
echo ""
echo "  Edit resources/js/** → the app updates within ~1s."
echo "  No APK rebuild/reinstall while this session runs."
echo ""
echo "  DevTools: open chrome://inspect in Chrome and click 'inspect'"
echo "            on the Factology WebView."
echo "  Logs:     adb -s $TARGET logcat -s Capacitor/Console:* WebView:*"
echo ""
echo "  Dev server log: $VITE_LOG"
echo "  Stop the server later: ./run-android.sh --stop"
echo "  (Ctrl+C here only detaches — HMR keeps working.)"
echo "=============================================="
echo ""
echo "==> Following dev server log (Ctrl+C to detach)..."
tail -n 5 -f "$VITE_LOG"
