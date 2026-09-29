#!/bin/bash
# Runs a scenario on GNOME Shell 49 in a container:
#   test/podman.sh 49 scenarios/<name>.js [WxH] [conf]
# Output lands in test/out/<name>-g<version>/ like a local run.
set -u
V=$1; shift
T=$(dirname "$(readlink -f "$0")")
REPO=$(dirname "$T")
NAME=$(basename "$1" .js)
FAVS='["org.gnome.Characters.desktop", "org.gnome.clocks.desktop", "org.gnome.font-viewer.desktop", "org.gnome.TextEditor.desktop", "org.gnome.Nautilus.desktop", "org.gnome.baobab.desktop", "org.gnome.Calculator.desktop", "yelp.desktop", "org.gnome.Yelp.desktop", "org.gnome.Logs.desktop"]'
WALL=()
[ -f "$HOME/.config/background" ] && WALL=(-v "$HOME/.config/background:$HOME/.config/background:ro" -e RDTEST_WALL="$HOME/.config/background")
podman run --rm --userns=keep-id --security-opt label=disable \
    -v "$REPO:$REPO" "${WALL[@]}" \
    -e RDTEST_ROOT=/tmp/rdenv -e REPO="$REPO" -e RDTEST_FAVS="$FAVS" -e PIN_APP=org.gnome.SystemMonitor.desktop \
    -e HOME=/tmp/home -e XDG_RUNTIME_DIR=/tmp/xdg -e ZIP="${ZIP:-}" \
    "ricingdock-gnome$V" bash -c '
        mkdir -p -m 700 /tmp/xdg /tmp/home
        # The shell always opens the system bus; give it an empty one.
        dbus-daemon --session --address=unix:path=/tmp/sysbus --fork --nopidfile
        export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/tmp/sysbus
        exec "$REPO/test/run.sh" "$@"' _ "$@"
# Keep results per version side by side.
rm -rf "$T/out/$NAME-g$V"; mv "$T/out/$NAME" "$T/out/$NAME-g$V" 2>/dev/null
