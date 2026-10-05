#!/bin/sh
# usage: tools/ghidra_group.sh <group index>
cd c:/dev/mpj
i=$1
args=""
for f in $(cat ghidra_proj/group$i.txt); do args="$args -import c:/dev/mpj/extracted/romfs/nro/NX_Release/$f"; done
GHIDRA_HEADLESS_MAXMEM=4G MSYS_NO_PATHCONV=1 ./tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_proj g$i $args -overwrite -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts -postScript ExportFunctions.java c:/dev/mpj/analysis/functions > ghidra_proj/g$i.log 2>&1
