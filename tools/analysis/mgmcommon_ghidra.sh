#!/bin/sh
# 사용: web/tools/analysis/mgmcommon_ghidra.sh <스크립트> <스크립트 인자...>   (ghidra_work/mgmcommon/jamboree_main, main NSO, 잠금 공유)
script="$1"; shift
until mkdir c:/dev/mpj/ghidra_work/mgmcommon/lock 2>/dev/null; do sleep 3; done
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/mgmcommon jamboree_main \
  -process -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/mgmcommon/last_main_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/mgmcommon/lock
tail -2 c:/dev/mpj/ghidra_work/mgmcommon/last_main_$$.log
