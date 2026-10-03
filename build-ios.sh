#!/usr/bin/env bash
# build-ios.sh — build an iOS Simulator .app from the current code.
#
# Usage:
#   ./build-ios.sh                          # simulator debug build (default)
#   ./build-ios.sh --local                  # standalone offline mode
#   ./build-ios.sh --device                 # attempt device build (requires Developer account)
#
# Produces a simulator .app bundle in dist-ios/ — no Apple Developer account required.
#
# Requires: macOS, Xcode (15+ recommended), Node, npm.
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
BUILD_MODE="remote"
BUILD_DEVICE=""

for arg in "$@"; do
    case "$arg" in
        --local) BUILD_MODE="local" ;;
        --device) BUILD_DEVICE="1" ;;
        *) echo "Unknown arg: $arg (use --local or --device)"; exit 1 ;;
    esac
done

# --- 1. ensure npm deps ---------------------------------------------------------------
if [ ! -d node_modules/@capacitor/cli ]; then
    echo "==> npm install"
    npm install
fi

# --- 2. set VITE_API_URL and build the capacitor SPA -----------------------------------
if [ "$BUILD_MODE" = "local" ]; then
    export VITE_API_URL=""
    echo "==> Building in LOCAL (standalone Dexie) mode — VITE_API_URL=''"
elif [ -f .env.capacitor ]; then
    export VITE_API_URL="$(grep -E '^VITE_API_URL=' .env.capacitor | head -1 | cut -d= -f2- | tr -d '\r\042\047')"
    echo "==> Building in REMOTE mode — VITE_API_URL=$VITE_API_URL"
else
    export VITE_API_URL=""
    echo "==> No .env.capacitor and no --local — building standalone."
fi

npm run build:capacitor
if [ -f dist-capacitor/index.capacitor.html ] && [ ! -f dist-capacitor/index.html ]; then
    cp dist-capacitor/index.capacitor.html dist-capacitor/index.html
fi
echo "==> Capacitor SPA build complete -> $SCRIPT_DIR/dist-capacitor"

# --- 3. ensure the ios platform exists ------------------------------------------------
if [ ! -d ios ]; then
    echo "==> ios/ missing — running: npx cap add ios"
    npx cap add ios
fi

# --- 4. sync web assets + config to the native platform -------------------------------
npx cap sync ios
echo "==> cap sync complete"

# --- 5. build for iOS Simulator (or device) -------------------------------------------
mkdir -p "$SCRIPT_DIR/dist-ios"

if [ -n "$BUILD_DEVICE" ]; then
    echo "==> Building for generic iOS device (requires Developer account)"
    xcodebuild -workspace ios/App/App.xcworkspace \
        -scheme App \
        -configuration Debug \
        -destination 'generic/platform=iOS' \
        build
else
    echo "==> Building for iOS Simulator (no Developer account needed)"

    # Detect the latest available simulator runtime
    SIM_NAME="$(xcrun simctl list runtimes -j 2>/dev/null | \
        python3 -c "import json,sys; d=json.load(sys.stdin); rt=[r for r in d.get('runtimes',[]) if r.get('platform','').startswith('iOS') and r.get('available',False)]; print(max(rt, key=lambda x: x.get('version',''))['name'] if rt else 'iOS-17-0')" 2>/dev/null || echo "iOS-17-0")"

    # Pick a device type matching the runtime
    DEVICE_TYPE="iPhone 16"
    # Fallback through known simulators if the latest doesn't exist
    for model in "iPhone 16" "iPhone 15" "iPhone 14" "iPhone 13" "iPhone 12"; do
        if xcrun simctl list devices available 2>/dev/null | grep -q "$model"; then
            DEVICE_TYPE="$model"
            break
        fi
    done

    echo "    Target: $DEVICE_TYPE on $SIM_NAME"

    xcodebuild -workspace ios/App/App.xcworkspace \
        -scheme App \
        -configuration Debug \
        -destination "platform=iOS Simulator,name=$DEVICE_TYPE,OS=latest" \
        -derivedDataPath "$SCRIPT_DIR/ios/DerivedData" \
        build
fi

echo "==> xcodebuild complete"

# --- 6. copy the .app bundle to dist-ios/ ---------------------------------------------
APP_BUNDLE="$(find "$SCRIPT_DIR/ios/DerivedData" -name 'App.app' -type d -maxdepth 6 2>/dev/null | head -1)"

if [ -z "$APP_BUNDLE" ]; then
    # Fallback: check the default Xcode derived data location
    APP_BUNDLE="$(find "$HOME/Library/Developer/Xcode/DerivedData" -name 'App.app' -type d -maxdepth 6 2>/dev/null | head -1)"
fi

if [ -n "$APP_BUNDLE" ]; then
    OUT_DIR="$SCRIPT_DIR/dist-ios"
    rm -rf "$OUT_DIR/App.app"
    cp -r "$APP_BUNDLE" "$OUT_DIR/App.app"
    echo ""
    echo "==> iOS Simulator app ready: $OUT_DIR/App.app"
    echo "    Run in simulator: xcrun simctl install booted \"$OUT_DIR/App.app\""
    echo "    (Start a simulator first: open -a Simulator)"
    echo ""
    echo "    Or zip it for sharing:"
    echo "      (cd \"$OUT_DIR\" && zip -r Factology-iOS-Simulator.zip App.app)"
else
    echo ""
    echo "==> Build complete, but .app bundle not found in expected locations."
    echo "    Check ios/DerivedData/ manually."
fi