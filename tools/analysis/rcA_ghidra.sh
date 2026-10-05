#!/bin/sh
# 사용: tools/rcA_ghidra.sh <프로그램(mg1802.nro|mg1803.nro)> <스크립트> <스크립트 인자...>
# Ghidra 는 한 번에 하나만 돈다(잠금 디렉터리 ghidra_work/rcA/lock).
prog="$1"; script="$2"; shift 2
until mkdir c:/dev/mpj/ghidra_work/rcA/lock 2>/dev/null; do sleep 3; done
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/rcA rcA \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/rcA/last_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/rcA/lock
tail -2 c:/dev/mpj/ghidra_work/rcA/last_$$.log
