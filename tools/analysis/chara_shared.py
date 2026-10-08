"""캐릭터·NPC 공용 에셋 쓰기 — web/assets/chara/ (설계 web/docs/engine/chara_assets.md).

charsel_chara.py(캐릭터 선택·광장 플레이어)·plaza_npc_assets.py(광장 NPC)·mg1801_web_charas.py(mg1801 PC·NPC)가 같이 쓴다.
  tex/<원본 이름>_<sha1 12>.png   ship_tex: 텍스처 바이트 그대로
  <key>/<model>.glb              write_model: 모델(메시·스킨·재질, 클립 없음). 정점 속성은 _C0·_C3·TEXCOORD_3 만 뺀다(화면들의 상위 집합).
                                 반환 (chara 기준 경로, {png: 'tex/…'})
  <key>/motion/<모션>.glb         write_motions: 모션 하나(<모션> + <모션>_shape, mg1801_web_charas.clips_only). glb 에 그 클립이 있을 때만.
                                 반환 chara 기준 경로 목록(이름 순서 그대로)
  <key>/motions.json             merge_motions: 모션 표(compact_motions 항목) — 화면들이 쓰는 모션의 합. 변환기마다 자기 항목만 넣고 고친다(키 정렬)
  rel(spec_dir, p)               chara 기준 경로 → 명세 폴더 기준 상대 경로
같은 경로·같은 모션 항목에 다른 내용을 쓰면 경고하고 덮어쓴다(변환기끼리 결과가 같아야 하고, 다시 돌리면 원본 변환 값으로 돌아간다).
"""
import copy
import hashlib
import json
import os
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import mg1801_web_charas as mwc  # noqa: E402

CHARA = ROOT / "web" / "assets" / "chara"
KEEP_ATTR = {"_C1", "_C2", "TEXCOORD_2"}
changed = []


def glb_bytes(js, rest):
    j = json.dumps(js, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    j += b" " * ((4 - len(j) % 4) % 4)
    return struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + len(rest)) + struct.pack("<II", len(j), 0x4E4F534A) + j + rest


def put(rel_path, data, warn=True):
    p = CHARA / rel_path
    if p.exists():
        if p.read_bytes() == data:
            return rel_path
        if warn:
            print("  경고: 공용 파일 내용이 바뀜(덮어씀) chara/%s" % rel_path)
            changed.append(rel_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return rel_path


def rel(spec_dir, p):
    return os.path.relpath(CHARA / p, spec_dir).replace("\\", "/")


def ship_tex(src_tex, png):
    b = (Path(src_tex) / png).read_bytes()
    return put("tex/%s_%s.png" % (Path(png).stem, hashlib.sha1(b).hexdigest()[:12]), b)


def write_model(key, glb_name, js, rest, src_tex, uv_rule, extra_pngs=()):
    js = copy.deepcopy(js)
    drop = mwc.DROP_ATTR
    mwc.DROP_ATTR = drop - KEEP_ATTR
    try:
        js, rest, _ = mwc.slim(js, rest, set(), uv_rule)
    finally:
        mwc.DROP_ATTR = drop
    js.pop("animations", None)
    tex_map = {}
    for pn in [im["uri"].split("/")[-1] for im in js.get("images", [])] + [p for p in extra_pngs if p]:
        if pn not in tex_map:
            tex_map[pn] = ship_tex(src_tex, pn)
    for im in js.get("images", []):
        im["uri"] = "../" + tex_map[im["uri"].split("/")[-1]]
    return put("%s/%s" % (key, glb_name), glb_bytes(js, rest)), tex_map


def write_motions(key, js, rest, names):
    have = {a["name"] for a in js.get("animations", [])}
    out = []
    for n in names:
        if n not in have and n + "_shape" not in have:
            continue
        cj, cr = mwc.clips_only(js, rest, {n, n + "_shape"})
        out.append(put("%s/motion/%s.glb" % (key, n), glb_bytes(cj, cr)))
    return out


def merge_motions(key, table):
    p = CHARA / key / "motions.json"
    cur = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    for k, v in table.items():
        if k in cur and cur[k] != v:
            print("  경고: 공용 모션 항목이 바뀜(덮어씀) chara/%s/motions.json %s" % (key, k))
            changed.append("%s/motions.json:%s" % (key, k))
    cur.update(table)
    data = json.dumps({k: cur[k] for k in sorted(cur)}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return put("%s/motions.json" % key, data, warn=False)
