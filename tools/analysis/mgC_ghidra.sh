#!/bin/sh
# 사용: tools/mgC_ghidra.sh <프로그램(mg0508.nro|mg0107.nro)> <출력파일> <CoreTool 명령...>
prog="$1"; out="$2"; shift 2
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/mgC mgC \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript CoreTool.java "$out" "$@" > c:/dev/mpj/ghidra_work/mgC/last.log 2>&1
tail -2 c:/dev/mpj/ghidra_work/mgC/last.log
