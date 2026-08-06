#!/usr/bin/env bash
# run-mobile-tests.sh — build the APK, provision a headless Android emulator,
# start Appium, and run the @smoke mobile suite via codeceptjs.
#
# Usage:
#   ./run-mobile-tests.sh            # full run, tears the emulator down at the end
#   ./run-mobile-tests.sh --keep     # leave the emulator + Appium running
#   ./run-mobile-tests.sh --local    # build a standalone (Dexie) APK
#
# Requires: Android SDK (emulator, platform-tools, a system image), a JDK 17+,
# and an internet connection for the first tooling/driver install.
#
# AVDs are stored under $ANDROID_AVD_HOME (default ~/.android/avd). If your
# home drive is nearly full, point ANDROID_AVD_HOME at a drive with space,
# e.g. export ANDROID_AVD_HOME=D:/Users/<you>/.android/avd
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

KEEP=false
LOCAL_FLAG=""
for arg in "$@"; do
    case "$arg" in
        --keep) KEEP=true ;;
        --local) LOCAL_FLAG="--local" ;;
        *) echo "Unknown arg: $arg (use --keep and/or --local)"; exit 1 ;;
    esac
done

# --- resolve the Android SDK to a Git-Bash-friendly path ------------------------
resolve_path() {
    if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else echo "$1"; fi
}
export ANDROID_HOME="$(resolve_path "${ANDROID_HOME:-d:/Users/Victor/AppData/Local/Android/Sdk}")"
if uname -s 2>/dev/null | grep -qiE 'mingw|msys|cygwin'; then
    ADB="$ANDROID_HOME/platform-tools/adb.exe"
    EMULATOR="$ANDROID_HOME/emulator/emulator.exe"
else
    ADB="$ANDROID_HOME/platform-tools/adb"
    EMULATOR="$ANDROID_HOME/emulator/emulator"
fi
AVD_NAME="factology_test"
AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
# The AVD needs ~7.5 GB of free space. If the default location is on a nearly
# full drive, fall back to a directory on the same drive as the Android SDK.
if [ -z "${ANDROID_AVD_HOME:-}" ]; then
    FREE_KB="$(df -Pk "$AVD_HOME" 2>/dev/null | awk 'NR==2{print $4}')"
    if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 9437184 ]; then
        AVD_HOME="$(dirname "$ANDROID_HOME")/.android/avd"
        echo "==> Home drive nearly full; using AVD_HOME=$AVD_HOME"
    fi
fi
mkdir -p "$AVD_HOME"
AVD_INI="$AVD_HOME/$AVD_NAME.ini"
AVD_DIR="$AVD_HOME/$AVD_NAME.avd"

echo "==> ANDROID_HOME=$ANDROID_HOME"

# --- 1. node tooling in tests-js --------------------------------------------------
if [ ! -d tests-js/node_modules/codeceptjs ] || [ ! -d tests-js/node_modules/appium ]; then
    echo "==> Installing mobile test tooling (codeceptjs/webdriverio/appium)..."
    ( cd tests-js && npm install )
fi
# uiautomator2 3.x is the line compatible with Appium 2.x (4.x needs Appium 3).
# Note: `appium driver list` prints its output to stderr.
if ! ( cd tests-js && npx appium driver list --installed 2>&1 | grep -q uiautomator2 ); then
    echo "==> Installing Appium uiautomator2 driver..."
    ( cd tests-js && npx appium driver install uiautomator2@3.10.0 )
fi

# --- 2. ensure the AVD exists -------------------------------------------------------
# Written manually to bypass avdmanager package-id validation (the installed
# image id contains the non-standard "android-37.0" / "_ps16k" components).
if [ ! -f "$AVD_DIR/config.ini" ]; then
    echo "==> Creating AVD $AVD_NAME"
    mkdir -p "$AVD_DIR"
    # The .ini must reference the AVD dir in native (Windows) path form;
    # the emulator cannot parse Git-Bash /d/... paths.
    NATIVE_AVD_DIR="$(cygpath -w "$AVD_DIR" 2>/dev/null || echo "$AVD_DIR")"
    printf 'avd.ini.encoding=UTF-8\npath=%s\npath.rel=avd\\%s.avd\ntarget=android-37.0\n' \
        "$NATIVE_AVD_DIR" "$AVD_NAME" > "$AVD_INI"
    cat > "$AVD_DIR/config.ini" <<EOF
AvdId=$AVD_NAME
PlayStore.enabled=true
abi.type=x86_64
image.sysdir.1=system-images/android-37.0/google_apis_playstore_ps16k/x86_64/
tag.display=Google APIs PlayStore, Page Size 16KB, AI Glasses Compatible
tag.id=google_apis_playstore_ps16k
hw.cpu.arch=x86_64
hw.ramSize=2048
hw.device.name=pixel_6
disk.dataPartition.size=6G
EOF
fi

# --- 3. build the APK if missing -----------------------------------------------------
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
    echo "==> Building the debug APK..."
    bash build-android.sh $LOCAL_FLAG
fi

# --- teardown trap --------------------------------------------------------------------
cleanup() {
    if [ "$KEEP" != "true" ]; then
        echo "==> Cleaning up (emulator + Appium)..."
        "$ADB" -s emulator-5554 emu kill 2>/dev/null || true
        [ -n "${EMU_PID:-}" ] && kill "$EMU_PID" 2>/dev/null || true
        [ -n "${APPIUM_PID:-}" ] && kill "$APPIUM_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# --- 4. boot the headless emulator ------------------------------------------------------
if ! "$ADB" devices | grep -q "emulator-5554"; then
    echo "==> Booting headless emulator (first boot can take several minutes)..."
    "$EMULATOR" -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim -no-snapshot \
        -gpu swiftshader_indirect -no-metrics >/tmp/emulator.log 2>&1 &
    EMU_PID=$!
    "$ADB" wait-for-device
    while [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
        sleep 3
    done
    echo "==> Emulator booted."
fi

# --- 5. start the Appium server ----------------------------------------------------------
# codeceptjs's Appium helper does NOT spawn Appium — the server must be running.
if ! curl -fsS http://127.0.0.1:4723/status >/dev/null 2>&1; then
    echo "==> Starting Appium server..."
    # chromedriver_autodownload: let uiautomator2 fetch the chromedriver that
    # matches the device's WebView/Chrome version.
    ( cd tests-js && exec npx appium --port 4723 --allow-insecure chromedriver_autodownload ) >/tmp/appium.log 2>&1 &
    APPIUM_PID=$!
    for _ in $(seq 1 60); do
        if curl -fsS http://127.0.0.1:4723/status >/dev/null 2>&1; then break; fi
        sleep 2
    done
    curl -fsS http://127.0.0.1:4723/status >/dev/null 2>&1 || {
        echo "Appium failed to start — see /tmp/appium.log"; tail -30 /tmp/appium.log; exit 1;
    }
    echo "==> Appium ready."
fi

# --- 6. run the mobile smoke suite ----------------------------------------------------------
echo "==> Running mobile smoke tests..."
( cd tests-js && CI=true npx codeceptjs run --config codecept.mobile.conf.js --steps --grep '@smoke' )
