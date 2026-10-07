#!/bin/sh
# 사용: web/tools/analysis/online_ghidra.sh <g3|g4> <프로그램(menu00.nro)> <스크립트> <인자...>   (ghidra_work/online/g3·g4 = ghidra_proj 사본)
grp="$1"; prog="$2"; script="$3"; shift 3
until mkdir c:/dev/mpj/ghidra_work/online/lock_$grp 2>/dev/null; do sleep 3; done
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/online $grp \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/online/last_${grp}_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/online/lock_$grp
tail -2 c:/dev/mpj/ghidra_work/online/last_${grp}_$$.log
