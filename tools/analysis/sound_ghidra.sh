#!/bin/sh
# 사용: tools/sound_ghidra.sh <프로젝트(jamboree_main|mg1801)> <출력 파일> <CoreTool 명령...>
# ghidra_work/sound1801 의 복사본만 읽는다(-readOnly).
proj="$1"; out="$2"; shift 2
prog=main.nso
[ "$proj" = mg1801 ] && prog=mg1801.nro
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/sound1801 "$proj" \
  -process "$prog" -noanalysis -readOnly -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript CoreTool.java "$out" "$@" > c:/dev/mpj/ghidra_work/sound1801/last.log 2>&1
tail -2 c:/dev/mpj/ghidra_work/sound1801/last.log
