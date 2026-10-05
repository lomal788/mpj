#!/bin/sh
# usage: mgD_show.sh <decomp.c> <addr|name>...  — 잡음 줄을 걸러 출력
f=$1; shift
c:/dev/mpj/.venv/Scripts/python c:/dev/mpj/web/tools/analysis/mgD_fn.py "$f" "$@" | grep -v "^\s*$" | grep -v "^  undefined\|^  float \|^  ulong\|^  uint\|^  int \|^  long \|^  char \|^  bool \|^  byte \|^  short \|^  ushort \|ExclusiveMonitor\|cVar.. = '\\x01';\|bVar.. = (bool)\|  } while (cVar\|^ *do {$\|if (bVar.) {\|+ 0x100000000;\|g_TypeDesc\|lVar.. = lVar.. + 0x20;\|while (lVar.. != lVar..);\|^ *}$\|^ *else {$\|NnDetailBezel\|^ *uVar.. = (\*\*(code \*\*)(\*plVar.. + 8))(plVar..);"
