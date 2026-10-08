"""시스템 효과음·공용 UI 그림 공용 에셋 쓰기 — web/assets/common/ (설계 web/docs/engine/common_assets.md).

화면 변환기(charsel·modesel·mgmcommon·mgm01·mgmet·online·partyrule·setplayer·plaza_ui·plaza_card·mg1801_web_ui)가 소리·텍스처를 쓸 때 부른다.
  sound/<라벨>.wav         sound: 공용 효과음(sound_file)이면 렌더 바이트 그대로 여기에, 아니면 화면 폴더에. 같은 시퀀스를 가리키는 다른 라벨(별칭 ALIASES)은
                           같은 파일 하나(이름 = SQ_SE_SYS_ 라벨)
  tex/<원본 이름>.png       tex: 공용 그림(is_common_tex)이면 PNG(화면 변환기와 같은 PIL optimize 저장)를 여기에, 아니면 화면 폴더에
  반환 = 명세 기준 폴더(base_dir) 상대 경로(공용) 또는 None(부른 쪽이 원래 화면 경로를 그대로 씀)
공용 = 범주(SQ_SE_SYS_ 효과음 전부·sys_ 그림 전부 = 원본 상주 공용, 문서 §11) + 범주 밖이지만 여러 화면이 같은 원본 이름·같은 바이트로 갖던 것(TEXTURES, §2).
같은 경로에 다른 내용을 쓰면 경고하고 덮어쓴다(변환기끼리 결과가 같아야 하고, 다시 돌리면 원본 변환 값으로 돌아간다 — chara_shared.py 와 같은 규칙).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/common_shared.py check   화면 폴더 감사(공용 후보·이름 같고 내용 다른 것·남은 공용 사본·빠진 공용 파일)
"""
import hashlib
import io
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "web" / "assets"
COMMON = ASSETS / "common"

FSPJ = ROOT / "extracted" / "bea" / "_ResidentAudio.nx.bea" / "_Resident" / "AddonAudioProject.fspj"
SYS_SE = "SQ_SE_SYS_"
SYS_TEX = "sys_"
ALIASES = {"SQ_SE_MGM01_CANCEL": "SQ_SE_SYS_CANCEL", "SQ_SE_MGM01_CUR": "SQ_SE_SYS_CURSOR", "SQ_SE_MGM01_DEC": "SQ_SE_SYS_DECI",
           "SQ_SE_MGM01_DECI_S": "SQ_SE_SYS_DECI_S", "SQ_SE_MGM01_DECI_LR": "SQ_SE_SYS_DECI_LR"}
FACES = [f"face_128_pc{n:02d}^u" for n in (1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 50, 51, 52, 53, 54, 56, 58, 61, 62)]
TEXTURES = set(FACES) | {"mgmet_pict_free_02^o", "mn00_white_00^s", "mn01_icon_feel_00^s", "mn01_stripe_00^r", "mn01_win_00^s", "mn01_win_20px^s",
                         "mn01_win_shadow_00^s"}
changed = []


def put(rel_path, data):
    p = COMMON / rel_path
    if p.exists():
        if p.read_bytes() == data:
            return rel_path
        print("  경고: 공용 파일 내용이 바뀜(덮어씀) common/%s" % rel_path)
        changed.append(rel_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return rel_path


def rel(base_dir, p):
    return os.path.relpath(COMMON / p, base_dir).replace("\\", "/")


def tex_file(name):
    return "tex/" + name.replace("^", "_") + ".png"


def sound_file(label):
    if label in ALIASES:
        return ALIASES[label]
    return label if label.startswith(SYS_SE) else None


def is_common_tex(name):
    return name.startswith(SYS_TEX) or name in TEXTURES


def tex(name, img, dst_file, base_dir):
    if is_common_tex(name):
        b = io.BytesIO()
        img.save(b, format="PNG", optimize=True)
        return rel(base_dir, put(tex_file(name), b.getvalue()))
    img.save(dst_file, optimize=True)
    return None


def sound(label, wav, dst_file, base_dir):
    data = Path(wav).read_bytes()
    f = sound_file(label)
    if f:
        return rel(base_dir, put(f"sound/{f}.wav", data))
    Path(dst_file).write_bytes(data)
    return None


SKIP = ("chara/", "font/", "common/", "plaza/world/", "plaza/player/", "charselect/chara/", "mg1801/tex/", "mg1801/chara/",
        "mg1801/effect/", "mg1801/npc/", "mg1801/model/", "mg1801/sound/")


def seq_key(fs, label):
    s = fs.find(label)
    return (s["fileId"], s["sequence"]["startOffset"], tuple(s["sequence"]["banks"])) if s and s.get("type") == "sequence" else None


def check():
    sys.path.insert(0, str(ROOT / "web/tools/analysis"))
    from sound_fsar import Fsar
    fs = Fsar(FSPJ)
    by_name = defaultdict(list)
    by_hash = defaultdict(list)
    sys_units = set()
    for p in sorted(ASSETS.rglob("*")):
        r = p.relative_to(ASSETS).as_posix()
        if not p.is_file() or p.suffix not in (".png", ".wav") or r.startswith(SKIP) or "/voice/" in r:
            continue
        h = hashlib.sha1(p.read_bytes()).hexdigest()
        unit = p.stem
        if p.suffix == ".wav":
            k = seq_key(fs, p.stem)
            unit = k if k else p.stem
            if p.stem.startswith(SYS_SE) and k:
                sys_units.add(k)
        by_name[(p.suffix, unit)].append((r, h, p.stat().st_size))
        by_hash[h].append(r)
    common_units = {(".png", t.replace("^", "_")) for t in TEXTURES} | {(".wav", seq_key(fs, a)) for a in ALIASES}
    is_common = lambda k: k in common_units or (k[0] == ".png" and k[1].startswith(SYS_TEX)) or (k[0] == ".wav" and k[1] in sys_units)  # noqa: E731
    bad_alias = [a for a, s in ALIASES.items() if seq_key(fs, a) != seq_key(fs, s) or seq_key(fs, a) is None]
    left = [r for k, v in by_name.items() if is_common(k) for r, _, _ in v]
    cand = {k: v for k, v in by_name.items() if len(v) > 1 and not is_common(k) and len({h for _, h, _ in v}) == 1}
    diff = {k: v for k, v in by_name.items() if len(v) > 1 and len({h for _, h, _ in v}) > 1}
    miss = [f for f in sorted({tex_file(t) for t in TEXTURES} | {f"sound/{s}.wav" for s in ALIASES.values()}) if not (COMMON / f).exists()]
    other = [v for v in by_hash.values() if len({Path(r).stem for r in v}) > 1]
    other_bytes = sum((ASSETS / v[0]).stat().st_size * (len({Path(r).stem for r in v}) - 1) for v in other)
    have = sorted(p.relative_to(COMMON).as_posix() for p in COMMON.rglob("*") if p.is_file()) if COMMON.exists() else []
    print("common: 소리 %d·그림 %d(범주 밖 목록 %d) / 별칭 %d / 목록인데 common 에 없는 것 %d %s" % (
        sum(f.startswith("sound/") for f in have), sum(f.startswith("tex/") for f in have), len(TEXTURES), len(ALIASES), len(miss), miss[:5]))
    print("별칭 라벨이 같은 시퀀스(fileId·시작 위치·뱅크)가 아님 %d %s" % (len(bad_alias), bad_alias))
    print("화면 폴더에 남은 공용 단위 사본 %d %s" % (len(left), left[:5]))
    print("공용 후보(같은 원본 단위·같은 바이트, 둘 이상 화면) %d" % len(cand))
    for k, v in sorted(cand.items(), key=str):
        print("  ", k, [r for r, _, _ in v])
    print("원본 단위 같고 내용 다름 %d" % len(diff))
    for k, v in sorted(diff.items(), key=str):
        print("  ", k, [(r, h[:8]) for r, h, _ in v])
    print("이름 다르고 바이트 같음(소리 별칭 포함 — 그림은 원본 단위가 달라 따로 둠) %d 묶음, 겹친 양 %.3f MB" % (len(other), other_bytes / 1e6))
    return len(miss) + len(bad_alias) + len(left) + len(cand) + len(diff)


if __name__ == "__main__":
    if sys.argv[1:2] == ["check"]:
        sys.exit(1 if check() else 0)
    print(__doc__)
