#!/bin/sh
# 사용: tools/rcA_ghidra_main.sh <스크립트> <스크립트 인자...>   (ghidra_work/rcA/jamboree_main, main NSO, 잠금 공유)
script="$1"; shift
until mkdir c:/dev/mpj/ghidra_work/rcA/lock 2>/dev/null; do sleep 3; done
prog=$(ls c:/dev/mpj/ghidra_work/rcA/jamboree_main.rep/idata/*/ 2>/dev/null | head -0)
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/rcA jamboree_main \
  -process -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/rcA/last_main_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/rcA/lock
tail -2 c:/dev/mpj/ghidra_work/rcA/last_main_$$.log
