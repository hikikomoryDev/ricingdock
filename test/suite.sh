#!/bin/bash
# Runs every scenario on one GNOME version (49 in a container, 50 locally)
# and prints each scenario's findings plus any error from the extension.
#   test/suite.sh 49|50
V=$1
T=$(dirname "$(readlink -f "$0")")
cd "$T"
SCEN="tour interact live badges single oneicon dotstill badgepin clickzoom clickgap reorder sweep2 gaps activezoom activefixed activeclick edgehover appspos nobounce urgent animspeed height align glass prefs hints hints2 presets"
for s in $SCEN; do
    if [ "$V" = 50 ]; then
        out=$(./run.sh scenarios/$s.js 2>&1); log=out/$s/shell.log
    else
        out=$(./podman.sh "$V" scenarios/$s.js 2>&1); log=out/$s-g$V/shell.log
    fi
    status=OK
    grep -q "RDTEST DONE" "$log" 2>/dev/null || status=NO-DONE
    grep -q "RDTEST FAIL" "$log" 2>/dev/null && status=FAIL
    errs=$(grep -E "JS ERROR|JS WARNING|CRITICAL" "$log" 2>/dev/null | grep -iE "ricingdock|rdtest" | grep -v "not in the stage" | head -3)
    [ -n "$errs" ] && status="$status+ERR"
    echo "=== $s: $status"
    grep -E "RDTEST" "$log" 2>/dev/null | grep -vE "shot |RDTEST DONE" | sed 's/.*RDTEST /    /' | cut -c1-160
    [ -n "$errs" ] && echo "$errs" | sed 's/^/    !! /' | cut -c1-220
    grep -A4 "RDTEST FAIL" "$log" 2>/dev/null | sed 's/^/    !! /' | cut -c1-220
done
