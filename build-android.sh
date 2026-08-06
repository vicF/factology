#!/usr/bin/env bash
# build-android.sh — build a Capacitor debug APK from the current code.
#
# Usage:
#   ./build-android.sh                # remote mode (VITE_API_URL from .env.capacitor)
#   ./build-android.sh --local        # standalone offline mode (empty VITE_API_URL -> Dexie)
#   ./build-android.sh --suffix=NAME  # optional versionName suffix (versionName "1.0-NAME")
#
# Requires: Node, npm, an Android SDK (ANDROID_HOME), a JDK (JAVA_HOME).
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
BUILD_MODE="remote"
APK_SUFFIX=""

# --- parse args ---------------------------------------------------------------
for arg in "$@"; do
    case "$arg" in
        --local) BUILD_MODE="local" ;;
        --suffix=*) APK_SUFFIX="${arg#--suffix=}" ;;
        *) echo "Unknown arg: $arg (use --local and/or --suffix=NAME)"; exit 1 ;;
    esac
done

# --- 1. ensure npm deps -------------------------------------------------------
if [ ! -d node_modules/@capacitor/cli ]; then
    echo "==> npm install"
    npm install
fi

# --- 2. set VITE_API_URL and build the capacitor SPA ---------------------------
if [ "$BUILD_MODE" = "local" ]; then
    export VITE_API_URL=""
    echo "==> Building in LOCAL (standalone Dexie) mode — VITE_API_URL=''"
elif [ -f .env.capacitor ]; then
    # Pull VITE_API_URL out of .env.capacitor (strip quotes/comments/CR).
    export VITE_API_URL="$(grep -E '^VITE_API_URL=' .env.capacitor | head -1 | cut -d= -f2- | tr -d '\r\042\047')"
    echo "==> Building in REMOTE mode — VITE_API_URL=$VITE_API_URL"
else
    export VITE_API_URL=""
    echo "==> No .env.capacitor and no --local — building standalone."
fi

npm run build:capacitor
# Capacitor's webDir expects an index.html entry; the SPA build emits
# index.capacitor.html. Mirror it so `cap sync` finds the entry point.
if [ -f dist-capacitor/index.capacitor.html ] && [ ! -f dist-capacitor/index.html ]; then
    cp dist-capacitor/index.capacitor.html dist-capacitor/index.html
fi
echo "==> Capacitor SPA build complete -> $SCRIPT_DIR/dist-capacitor"

# --- 3. ensure the android platform exists -------------------------------------
if [ ! -d android ]; then
    echo "==> android/ missing — running: npx cap add android"
    npx cap add android
fi

# --- 4. sync web assets + config to the native platform ------------------------
npx cap sync android
echo "==> cap sync complete"

# --- 5. bump versionCode + optional versionName --------------------------------
BUILD_GRADLE="$SCRIPT_DIR/android/app/build.gradle"
NEW_CODE="$(git rev-list --count HEAD 2>/dev/null | tr -d '[:space:]')" || true
if ! [[ "$NEW_CODE" =~ ^[0-9]+$ ]] || [ "$NEW_CODE" -lt 1 ]; then
    NEW_CODE=1
fi
# Never lower the code already present in the file.
CUR_CODE="$(sed -n 's/.*versionCode[[:space:]]*\([0-9]*\).*/\1/p' "$BUILD_GRADLE" | head -1)"
if [ -n "$CUR_CODE" ] && [ "${CUR_CODE:-0}" -gt "$NEW_CODE" ]; then
    NEW_CODE="$CUR_CODE"
fi
sed -i "s/versionCode[[:space:]]*[0-9]*/versionCode $NEW_CODE/" "$BUILD_GRADLE"
if [ -n "$APK_SUFFIX" ]; then
    sed -i "s/versionName[[:space:]]*\"[^\"]*\"/versionName \"1.0-$APK_SUFFIX\"/" "$BUILD_GRADLE"
fi
echo "==> versionCode -> $NEW_CODE${APK_SUFFIX:+ (versionName -> 1.0-$APK_SUFFIX)}"

# --- 6. gradle debug build ------------------------------------------------------
# JAVA_HOME auto-detect (Android Studio JBR), if not already set.
if [ -z "${JAVA_HOME:-}" ] || [ ! -f "$JAVA_HOME/bin/java.exe" ]; then
    for cand in "d:/Program Files/Android/Android Studio/jbr" "$HOME/AppData/Local/Programs/Android Studio/jbr"; do
        if [ -f "$cand/bin/java.exe" ]; then
            export JAVA_HOME="$cand"
            break
        fi
    done
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}"
if [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

(cd android && ./gradlew assembleDebug)
echo "==> Gradle assembleDebug complete"

# --- 7. copy the APK to a known output dir --------------------------------------
mkdir -p "$SCRIPT_DIR/dist-android"
APK_SRC="$SCRIPT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
OUT_APK="$SCRIPT_DIR/dist-android/factology-debug.apk"
cp "$APK_SRC" "$OUT_APK"
echo ""
echo "==> APK ready: $OUT_APK"
echo "    Install with: adb install -r \"$OUT_APK\""
