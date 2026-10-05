#!/bin/sh
# 사용: tools/rcC_ghidra.sh <프로그램(mg1806.nro|mg1807.nro)> <스크립트> <인자...>
prog="$1"; script="$2"; shift 2
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/rcC mg18xx \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/rcC/last.log 2>&1
tail -2 c:/dev/mpj/ghidra_work/rcC/last.log
