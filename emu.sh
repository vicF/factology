#!/usr/bin/env bash
# emu.sh — Start Android emulator, build APK, install, and debug.
# Usage:
#   ./emu.sh          # start emulator (if not running), build & install APK
#   ./emu.sh --build  # rebuild APK and install (emulator must be running)
#   ./emu.sh --watch  # watch resources/js for changes, auto rebuild+install
#   ./emu.sh --log    # show filtered logcat output
#   ./emu.sh --kill   # stop the emulator
set -euo pipefail
cd "$(dirname "$0")"

AVD_NAME="Pixel_6_API_37"
APK_PATH="$PWD/dist-android/factology-debug.apk"

case "${1:-}" in
  --kill)
    echo "==> Killing emulator..."
    adb emu kill 2>/dev/null || true
    taskkill //F //IM emulator.exe 2>/dev/null || true
    echo "Done."
    exit 0
    ;;
  --log)
    echo "==> Filtered logcat (JS console + errors). Press Ctrl+C to stop."
    adb logcat -s "Capacitor/Console:*" "AndroidRuntime:*" "crash_analyzer:*" "WebView:*"
    exit 0
    ;;
  --build)
    # Just rebuild and install (emulator must be running)
    bash build-android.sh --local
    echo "==> Installing on emulator..."
    adb install -r "$APK_PATH" 2>/dev/null || adb install -r -d "$APK_PATH"
    echo "==> Launching..."
    adb shell am start -n com.factology.app/.MainActivity
    echo "==> Done. Run ./emu.sh --log to see console output."
    exit 0
    ;;
  --devtools)
    # Persistent DevTools bridge: keeps the CDP forward alive across app
    # restarts and serves a stable URL at http://127.0.0.1:9334.
    # Fixes the blank-screen chrome://inspect issue (desktop Chrome frontend
    # version != WebView version).
    PIDFILE="$PWD/.emu-devtools.pid"
    if [ -f "$PIDFILE" ]; then
      OLD_PID=$(cat "$PIDFILE")
      if tasklist //FI "PID eq $OLD_PID" 2>/dev/null | grep -q "$OLD_PID"; then
        echo "==> Stopping existing DevTools bridge (PID $OLD_PID)..."
        taskkill //F //PID "$OLD_PID" 2>/dev/null || true
        sleep 1
      fi
      rm -f "$PIDFILE"
    fi
    node emu-devtools.mjs
    exit 0
    ;;
  --watch)
    # Watch resources/js for changes, auto rebuild + reinstall.
    # Uses a Node watcher (Windows Git Bash has no inotifywait).
    node --input-type=module -e '
import { watch } from "node:fs";
import { execSync, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DIRS = ["resources/js", "resources/css", "index.capacitor.html"];
let timer = null;
let building = false;

function build() {
  if (building) return;
  building = true;
  const started = Date.now();
  console.log(`\n==> [$(date +%H:%M:%S)] Change detected — rebuilding...`);
  const r = spawnSync("bash", ["build-android.sh", "--local"], { cwd: ROOT, stdio: "inherit" });
  if (r.status === 0) {
    const inst = spawnSync("adb", ["install", "-r", "-d", `${ROOT}/dist-android/factology-debug.apk`], { stdio: "inherit" });
    if (inst.status === 0) {
      spawnSync("adb", ["shell", "am", "start", "-n", "com.factology.app/.MainActivity"], { stdio: "inherit" });
    }
  }
  building = false;
  console.log(`==> Done in ${((Date.now()-started)/1000).toFixed(1)}s. Watching for changes... (Ctrl+C to stop)`);
}

for (const d of DIRS) {
  try {
    watch(`${ROOT}/${d}`, { recursive: true }, (ev, file) => {
      if (!file) return;
      if (/\.(js|vue|scss|css|html)$/.test(file) && !file.includes("node_modules")) {
        clearTimeout(timer);
        timer = setTimeout(build, 800);
      }
    });
  } catch (e) { /* dir may not exist */ }
}
console.log("==> Watching resources/js, resources/css, index.capacitor.html for changes... (Ctrl+C to stop)");
'
    exit 0
    ;;
esac

# Check if emulator is already running
if adb devices 2>/dev/null | grep -q "emulator-5554.*device"; then
  echo "==> Emulator already running"
else
  echo "==> Starting emulator (this takes ~2 minutes)..."
  "$ANDROID_HOME/emulator/emulator.exe" -avd "$AVD_NAME" -no-boot-anim -no-window -gpu auto -memory 2048 -skin 1080x2400 &
  echo "    Waiting for boot..."
  for i in $(seq 1 30); do
    sleep 5
    if adb devices 2>/dev/null | grep -q "emulator-5554.*device"; then
      echo "    Booted! (${i}x5s)"
      break
    fi
  done
fi

echo "==> Building APK..."
bash build-android.sh --local

echo "==> Installing..."
adb install -r "$APK_PATH" 2>/dev/null || adb install -r -d "$APK_PATH"

echo "==> Launching app..."
adb shell am start -n com.factology.app/.MainActivity

echo ""
echo "    Emulator is ready. Commands:"
echo "    ./emu.sh --log    # see JS console and errors"
echo "    ./emu.sh --build  # rebuild & reinstall (no emulator restart)"
echo "    ./emu.sh --kill   # stop emulator"
echo ""
echo "    To see the app screen, connect to: vnc://localhost:5900"
echo "    (or start emulator without -no-window)"