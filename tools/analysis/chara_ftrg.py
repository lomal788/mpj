"""캐릭터 FX 트리거(.ftrg) → 웹 런타임 표(assets/chara/<pc>/ftrg.json, assets/chara/ftrg_base.json).

근거: docs/engine/05_ui_input.md §7.1~7.5(형식·참조·애니 이벤트), docs/engine/09_character.md 웹 런타임 계약 절. 파서는 ui_ftrg.py 를 그대로 쓴다.
원본(extracted/bea)은 읽기만 한다.

소스 하나(.ftrg 파일 하나) = {
  "ref":  참조 소스 이름(루트 +0x38 경로의 파일 이름, 없으면 null),
  "rows": {키: [[종류, 훅, [[라벨, 가중치], …], 볼륨, 재생 지연 초, [조건 이름…]], …]}   종류 0 SE·1 FX·2 VB(루트 +0x10/+0x18/+0x20)
  "anim": {모션 이름: [[프레임, 키, 플래그(u32 +0x0C), 길이(+0x10), 루프 K(+0x14), 모드 M(+0x18)], …]}
}
- 라벨 = 자원 경로의 마지막 성분(§7.3: SQ_* 사운드 라벨 · bv_* 진동 이름 · .eset 이펙트).
- 조건(+0x68 의 0x910A 이름)은 이름만 옮긴다 — 조건 그래프 값의 뜻은 [미확정](05 §7.9). 런타임은 조건 없는 행을 먼저 고른다 [근사].
- 캐릭터 폴더의 *_fake.ftrg(파라미터 ID 102~111 전용, §7.5)는 옮기지 않는다.

전이표: extracted/converted/scene/mpat.json(06 §2.5 파서 결과) → assets/chara/mpat.json {표 이름: [[from, to, a, b, α, β], …]}.
  α = c(f32), β = d 의 u32 비트를 f32 로 읽은 값(09 §6.5 "d 는 소비 시 f32 β"). from/to 빈 이름은 null.

사용: python web/tools/analysis/chara_ftrg.py   (C:/dev/mpj 에서)
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui_ftrg as U  # noqa: E402

BEA = ROOT / "extracted" / "bea"
OUT = ROOT / "web" / "assets" / "chara"
SLOTS = (("+10", 0), ("+18", 1), ("+20", 2))


def num(v):
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str) and v.startswith("0x"):
        return int(v, 16)
    return 0


def last(p):
    return p.replace("\\", "/").split("/")[-1] if p else ""


def source(path):
    _, tree = U.load(path)
    r = tree[0]
    ref = last(r.get("+38") or "")
    out = {"ref": ref[:-5] if ref.endswith(".ftrg") else (ref or None), "rows": {}, "anim": {}}
    for slot, kind in SLOTS:
        for t in r.get(slot) or []:
            if slot == "+20":
                key, props, res, hook = t.get("+30"), t.get("+50"), t.get("+5c"), ""
            else:
                key, props, res, hook = t.get("+14"), t.get("+44"), t.get("+50"), t.get("+34", "")
            props = props.get("_props", {}) if isinstance(props, dict) else {}
            conds = [c.get("+00") for c in (t.get("+68") or []) if isinstance(c, dict)]
            row = [
                kind,
                hook or "",
                [[last(x.get("+00")), x.get("+08", 50.0)] for x in (res or []) if isinstance(x, dict)],
                props.get("SoundVolume", 1.0) if kind != 2 else 1.0,
                props.get("PlayOffsetSec", 0.0),
                conds,
            ]
            out["rows"].setdefault(key, []).append(row)
    for a in r.get("+40") or []:
        ev = [[k.get("+08"), k.get("+00"), num(k.get("+0c")), num(k.get("+10")), num(k.get("+14")), num(k.get("+18"))] for k in a.get("+1c") or []]
        name = a.get("+00")
        if name in out["anim"]:
            print(f"  경고: 같은 모션 트랙 둘 {Path(path).name} {name} — 앞 것만", file=sys.stderr)
            continue
        out["anim"][name] = ev
    return out


def mpat():
    src = json.loads((ROOT / "extracted" / "converted" / "scene" / "mpat.json").read_text(encoding="utf-8"))
    out = {}
    for name, t in sorted(src.items()):
        rows = []
        for e in t.get("entries", []):
            beta = struct.unpack("<f", struct.pack("<I", int(e.get("d", 0)) & 0xFFFFFFFF))[0]
            rows.append([e.get("from") or None, e.get("to") or None, e.get("a", -1), e.get("b", -1), e.get("c", 0.0), beta])
        out[name[:-5] if name.endswith(".mpat") else name] = rows
    f = OUT / "mpat.json"
    f.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("mpat.json", len(out), f.stat().st_size)


def main():
    mpat()
    base_dir = BEA / "bq.nx.bea" / "chara" / "pc" / "ftrgBase" / "ftrg"
    base = {p.stem: source(p) for p in sorted(base_dir.glob("*.ftrg"))}
    (OUT / "ftrg_base.json").write_text(json.dumps({"sources": base}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("ftrg_base.json", len(base), (OUT / "ftrg_base.json").stat().st_size)
    total = 0
    for d in sorted(BEA.glob("chara~pc*.nx.bea")):
        for ch in sorted((d / "chara" / "pc").glob("pc*")):
            fdir = ch / "ftrg"
            if not fdir.is_dir():
                continue
            pc = ch.name.split("_")[0]
            if not (OUT / pc).is_dir():
                continue
            srcs = {p.stem: source(p) for p in sorted(fdir.glob("*.ftrg")) if not p.stem.endswith("_fake")}
            f = OUT / pc / "ftrg.json"
            f.write_text(json.dumps({"model": ch.name, "sources": srcs}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            total += f.stat().st_size
            print(f"{pc}/ftrg.json {ch.name} 소스 {len(srcs)} {f.stat().st_size} B")
    print("캐릭터 합", total)


if __name__ == "__main__":
    main()
