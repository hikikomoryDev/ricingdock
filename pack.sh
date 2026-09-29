#!/bin/bash
# Builds the zip for extensions.gnome.org into dist/.
set -eu
ROOT=$(dirname "$(readlink -f "$0")")
mkdir -p "$ROOT/dist"
cd "$ROOT/src"
gnome-extensions pack --force --out-dir="$ROOT/dist" \
    --extra-source=dock.js --extra-source=items.js --extra-source=badges.js \
    --extra-source=effects.js --extra-source=util.js --extra-source=LICENSE \
    --schema=schemas/org.gnome.shell.extensions.ricingdock.gschema.xml
ls -l "$ROOT/dist"
