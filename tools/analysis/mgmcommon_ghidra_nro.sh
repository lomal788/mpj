#!/bin/sh
# 사용: web/tools/analysis/mgmcommon_ghidra_nro.sh <프로그램(mgmet.nro)> <스크립트> <인자...>   (PROJ=g3 기본: ghidra_proj g3 사본, mgmet.nro 포함 / PROJ=mgm01: logic1801 mgm01 사본)
prog="$1"; script="$2"; shift 2; proj="${PROJ:-g3}"
until mkdir c:/dev/mpj/ghidra_work/mgmcommon/lock 2>/dev/null; do sleep 3; done
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/mgmcommon "$proj" \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript "$script" "$@" > c:/dev/mpj/ghidra_work/mgmcommon/last_nro_$$.log 2>&1
rmdir c:/dev/mpj/ghidra_work/mgmcommon/lock
tail -2 c:/dev/mpj/ghidra_work/mgmcommon/last_nro_$$.log
