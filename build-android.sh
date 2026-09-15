#!/usr/bin/env bash
# build-android.sh — build a Capacitor debug APK or release AAB from the current code.
#
# Usage:
#   ./build-android.sh                          # debug APK (remote mode)
#   ./build-android.sh --local                  # debug APK, standalone offline mode
#   ./build-android.sh --release                # signed release AAB (for store upload)
#   ./build-android.sh --release --local        # signed release AAB, standalone mode
#   ./build-android.sh --suffix=NAME            # optional versionName suffix
#
# Requires: Node, npm, an Android SDK (ANDROID_HOME), a JDK (JAVA_HOME).
set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
BUILD_MODE="remote"
APK_SUFFIX=""
BUILD_RELEASE=""

# --- parse args ---------------------------------------------------------------
for arg in "$@"; do
    case "$arg" in
        --local) BUILD_MODE="local" ;;
        --release) BUILD_RELEASE="1" ;;
        --suffix=*) APK_SUFFIX="${arg#--suffix=}" ;;
        *) echo "Unknown arg: $arg (use --local, --release, and/or --suffix=NAME)"; exit 1 ;;
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

# --- 6.5 signing setup -----------------------------------------------------------
if [ -n "$BUILD_RELEASE" ]; then
    # Release signing — read keystore credentials for Gradle.
    KEYSTORE_FILE="$SCRIPT_DIR/release.keystore"
    KEYSTORE_PASS_FILE="$SCRIPT_DIR/release.keystore.password"
    if [ ! -f "$KEYSTORE_FILE" ]; then
        echo "ERROR: release.keystore not found. Generate one first:" >&2
        echo "  keytool -genkey -v -keystore release.keystore -alias factology -keyalg RSA -keysize 2048 -validity 10000" >&2
        exit 1
    fi
    if [ ! -f "$KEYSTORE_PASS_FILE" ]; then
        echo "ERROR: release.keystore.password not found. Save the keystore password in this file." >&2
        exit 1
    fi
    KEYSTORE_PASS="$(cat "$KEYSTORE_PASS_FILE" | tr -d '[:space:]')"
    export ANDROID_STORE_FILE="$KEYSTORE_FILE"
    export ANDROID_STORE_PASSWORD="$KEYSTORE_PASS"
    export ANDROID_KEY_ALIAS="factology"
    export ANDROID_KEY_PASSWORD="$KEYSTORE_PASS"
    echo "==> release signing configured (alias: factology)"
else
    # Debug signing — make sure we use the committed debug keystore so
    # every build shares one signature and alpha updates install cleanly.
    # (Debug-only key; password/alias are the well-known Android defaults.)
    if [ -f "$SCRIPT_DIR/android-debug.keystore" ]; then
        mkdir -p "$HOME/.android"
        cp -f "$SCRIPT_DIR/android-debug.keystore" "$HOME/.android/debug.keystore"
        echo "==> debug keystore installed at \$HOME/.android/debug.keystore"
    fi
fi

# --- 7. build --------------------------------------------------------------------
mkdir -p "$SCRIPT_DIR/dist-android"

if [ -n "$BUILD_RELEASE" ]; then
    (cd android && ./gradlew bundleRelease)
    echo "==> Gradle bundleRelease complete"

    AAB_SRC="$(ls "$SCRIPT_DIR/android/app/build/outputs/bundle/release/"*.aab 2>/dev/null | head -1)"
    if [ -f "$AAB_SRC" ]; then
        OUT_AAB="$SCRIPT_DIR/dist-android/factology-release.aab"
        cp "$AAB_SRC" "$OUT_AAB"
        echo ""
        echo "==> AAB ready: $OUT_AAB"
        echo "    Upload this file to RuStore (or later Google Play)."
    else
        echo "ERROR: No AAB found at android/app/build/outputs/bundle/release/" >&2
        exit 1
    fi
else
    (cd android && ./gradlew assembleDebug)
    echo "==> Gradle assembleDebug complete"

    APK_SRC="$SCRIPT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
    OUT_APK="$SCRIPT_DIR/dist-android/factology-debug.apk"
    cp "$APK_SRC" "$OUT_APK"
    echo ""
    echo "==> APK ready: $OUT_APK"
    echo "    Install with: adb install -r \"$OUT_APK\""
fi
