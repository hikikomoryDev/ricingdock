#!/bin/bash
# Installs the latest RicingDock release for this user:
#
#   curl -fsSL https://raw.githubusercontent.com/hikikomoryDev/ricingdock/main/get.sh | bash
#
# GNOME on Wayland loads a new extension only at login, so it is switched on
# in the settings here and starts after the next login.
set -eu
UUID=ricingdock@hikikomoriDev
URL=https://github.com/hikikomoryDev/ricingdock/releases/latest/download/$UUID.shell-extension.zip
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Downloading $URL"
curl -fsSL -o "$TMP/$UUID.shell-extension.zip" "$URL"
gnome-extensions install --force "$TMP/$UUID.shell-extension.zip"
python3 - "$UUID" <<'PY'
import ast, subprocess, sys

def get(key):
    out = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', key], text=True)
    return ast.literal_eval(out.replace('@as ', ''))

def put(key, value):
    subprocess.check_call(['gsettings', 'set', 'org.gnome.shell', key, str(value)])

uuid = sys.argv[1]
on = [u for u in get('enabled-extensions') if u != uuid] + [uuid]
off = [u for u in get('disabled-extensions') if u != uuid]
# Two docks would fight: Ubuntu Dock goes off.
on = [u for u in on if u != 'ubuntu-dock@ubuntu.com']
off = [u for u in off if u != 'ubuntu-dock@ubuntu.com'] + ['ubuntu-dock@ubuntu.com']
put('enabled-extensions', on)
put('disabled-extensions', off)
PY
echo "RicingDock is installed. Log out and back in to start it."
