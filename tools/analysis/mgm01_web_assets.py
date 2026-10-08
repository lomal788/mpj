"""프리 플레이(mgm01) 화면 데이터 — 목록 JSON·MGList·기본 기록·mgm01 SE → web/assets/mgm01 (레이아웃·글꼴·문구는 web/assets/mgmcommon 을 그대로 쓴다).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/mgm01_web_assets.py [임시 폴더]

근거: web/docs/shell/mgm01_freeplay.md 4.2·6.1·6.4·6.5·7 과 9절 [설계]. 출력 web/assets/mgm01/catalog.json:
  games[112]   mgm01_freeplay_mgList.json gamedata 순서 그대로 {name, genre[13](MgAll..MgRhythm 열 값), setLock, solo, offline}
  filters[14]  filterdata 순서 그대로 {name, sortIdx, label}
  mgList[]     {id, name, rule(문자열), endless, gyro, callInst, available} — id 배정은 9절 [추정](ND 0..78 → 0..78, CA → 79..116, ND Extra → 117..)
  records[]    common/data/gamerecord.json {name, stage, mode, format, sortOrder, initialRecord}
  sounds       {라벨: {file, gain, evidence}} — mgm01 고유 SE 렌더(sound_seq.py, 공용 변환기와 같은 방법). file 은 assets 기준.
               SYS 효과음과 같은 시퀀스를 가리키는 별칭 라벨(CANCEL·CUR·DEC·DECI_S·DECI_LR)은 공용 web/assets/common/sound/ 파일
               (common_shared.py, docs/engine/common_assets.md)
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import common_shared as cs  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "mgm01"
FREEPLAY = BEA / "mgm~mgm01.nx.bea" / "mgm" / "mgm01" / "data" / "mgm01_freeplay_mgList.json"
DATA = BEA / "bq.nx.bea" / "common" / "data"
FSPJ = BEA / "_ResidentAudio.nx.bea" / "_Resident" / "AddonAudioProject.fspj"
GENRES = ["MgAll", "Mg4vs", "Mg1vs3", "Mg2vs2", "MgDuel", "MgItem", "MgChallenge", "MgBoss", "MgGyro", "MgEndless", "MgAthlon", "MgBusters", "MgRhythm"]
SE = {
    "SQ_SE_MGM01_CUR": "설정 값 이동(문서 7절 CUR) [데이터: 라벨 이름 일치]",
    "SQ_SE_MGM01_DECI_S": "설정 랜덤(문서 7절 DECI_S) [데이터: 라벨 이름 일치]",
    "SQ_SE_MGM01_DECI_LR": "필터 이동(문서 7절 DECI_LR) [데이터: 라벨 이름 일치]",
    "SQ_SE_MGM01_LIKE_ADD": "즐겨찾기 켬(문서 7절 LIKE_ADD) [데이터: 라벨 이름 일치]",
    "SQ_SE_MGM01_LIKE_DIS": "즐겨찾기 끔(문서 7절 LIKE_DIS) [데이터: 라벨 이름 일치]",
    "SQ_SE_MGM01_CANCEL": "승패 표 닫기(문서 7절 CANCEL, mgm_common.md 7.4) [판독]",
    "SQ_SE_MGM01_DEC": "설정 플레이 결정 [설계: 문서에 결정 SE 이름 없음, 라벨 이름으로 고름]",
}


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def mg_ids(nd, ca):
    extra = [e for e in nd if e["GameRule"] == "Extra"]
    base = [e for e in nd if e["GameRule"] != "Extra"]
    out = []
    for e in base + ca + extra:
        out.append({"id": len(out), "name": e["Name"], "rule": e["GameRule"], "endless": e["Endless"], "gyro": e["Gyro"],
                    "callInst": e["CallInst"], "available": e["Available"]})
    return out


def render_sounds(tmp):
    from sound_fsar import Fsar
    fs = Fsar(FSPJ)
    (DST / "sound").mkdir(parents=True, exist_ok=True)
    sounds = {}
    for label, ev in SE.items():
        out = Path(tmp) / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        f = cs.sound(label, out, DST / "sound" / f"{label}.wav", cs.ASSETS) or f"mgm01/sound/{label}.wav"
        vol = fs.find(label)["volume"]
        sounds[label] = {"file": f, "gain": round(vol / 127, 4),
                         "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}
    return sounds


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    DST.mkdir(parents=True, exist_ok=True)
    fp = load(FREEPLAY)
    games = [{"name": g["MgName"], "genre": [g[k] for k in GENRES], "setLock": g["SetLock"], "solo": g["SoloPlayOnly"],
              "offline": g["OfflinePlayOnly"]} for g in fp["gamedata"]]
    filters = [{"name": f["FilterName"], "sortIdx": f["SortIdx"], "label": f["LabelName"]} for f in fp["filterdata"]]
    nd = load(DATA / "mgListND.json")["mgList"]
    ca = load(DATA / "mgListCA.json")["mgList"]
    records = [{"name": r["MgName"], "stage": r["Stage"], "mode": r["Mode"], "format": r["Format"], "sortOrder": r["SortOrder"],
                "initialRecord": r["InitialRecord"]} for r in load(DATA / "gamerecord.json")["gamerecord"]]
    cat = {
        "version": 1,
        "source": {"freeplay": str(FREEPLAY.relative_to(ROOT)).replace("\\", "/"), "mgList": "extracted/bea/bq.nx.bea/common/data/mgList{ND,CA}.json",
                   "records": "extracted/bea/bq.nx.bea/common/data/gamerecord.json"},
        "genres": GENRES,
        "games": games,
        "filters": filters,
        "mgList": mg_ids(nd, ca),
        "records": records,
        "sounds": render_sounds(tmp),
    }
    (DST / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"games {len(games)} filters {len(filters)} mgList {len(cat['mgList'])} records {len(records)} sounds {len(cat['sounds'])} → {DST / 'catalog.json'}")


if __name__ == "__main__":
    main()
