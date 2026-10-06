#!/bin/sh
# 사용: web/tools/analysis/charsel_ghidra.sh <스크립트> <스크립트 인자...>   (ghidra_work/charsel/jamboree_main, main NSO, 잠금 공유)
script="$1"; shift
until mkdir c:/dev/mpj/ghidra_work/charsel/lock 2>/dev/null; do sleep 3; done
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/charsel jamboree_main \
  -process -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/charsel/last_main_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/charsel/lock
tail -2 c:/dev/mpj/ghidra_work/charsel/last_main_$$.log
