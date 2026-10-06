#!/bin/sh
# 사용: web/tools/analysis/modesel_ghidra_nro.sh <프로그램(menu01.nro)> <스크립트> <인자...>   (ghidra_work/modesel/g4 = ghidra_work/charsel g4 사본)
prog="$1"; script="$2"; shift 2
until mkdir c:/dev/mpj/ghidra_work/modesel/lock 2>/dev/null; do sleep 3; done
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/modesel g4 \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/modesel/last_nro_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/modesel/lock
tail -2 c:/dev/mpj/ghidra_work/modesel/last_nro_$$.log
