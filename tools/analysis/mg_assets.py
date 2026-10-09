"""미니게임 어댑터 — 공용 에셋 변환기 코어(asset_convert.py) 위의 분류 mg~ 장면 의미(설계 web/docs/engine/13_asset_converter.md §5).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/mg_assets.py <mgid> [<mgid> ...]     예: mg0508 mg0106 mg0101 mg0122 mg0102
  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/mg_assets.py --all                    mg~mgNNNN 전부(모델 폴더가 있는 것)
    --out <폴더> / --only gfx,ui,sound,fx,data / --force   = asset_convert.py 와 같다(mg1801 대조는 --out 으로 scratch 에)

코어가 아카이브 하나를 형식별 처리기로 바꾼 뒤(web/assets/mg/<id>/{model,tex,anim,cam,ui,sound,fx,data,collision.json}), 이 어댑터가 더한다:
  env_pick       게임 표(SCENES.env)의 환경 컨테이너(나머지는 asset.envVariants)
  sound_sources  게임 소리 뱅크 sound~subarc_<id> 전부 + 상주 프로젝트(AddonAudioProject.fspj)의 _<ID>_ 라벨 + mgsound_setting 게임 BGM
  texts          koKR 메시지 중 라벨에 <id> 가 든 것(im_mg·mg_inst·mg_common)
  extend → manifest.mg = { layout[배치], camera{first, game}, first{P0·P1·경계}, scene(근거) } — 로더 web/script/shell/mgstage 가 읽는다
원본 미니게임은 MapStructure.json 이 없고 장면 엔티티를 게임 코드(SyncedSetupGame·MapImpl·CreateBG)가 경로로 만든다(06_scene_data.md §1.7) →
배치 = 게임 표 SCENES(판독, 근거 evidence) + nbmap 모델 엔티티 + 표 없는 게임은 이름 규칙 RULE_BASE [추정].
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asset_convert as ac  # noqa: E402

MSG_DIR = ac.ROOT / "extracted" / "message" / "koKR"
MGSOUND = ac.BEA / "audio.nx.bea" / "audio" / "data" / "mgsound_setting.json"

# 게임별 장면 표 [판독 — 근거 = evidence]
#   base     원점에 보이게 둔다(판독한 게임 모두 엔티티 변환 항등으로 생성)
#   hidden   장면에 있지만 그리지 않는 모델(런타임 메시 재질 원본·충돌 표시·위치 표 모델)
#   hooks    (모델, 부모 키, 부모 뼈) — 부모 뼈 월드 위치·회전에 붙인다(ComAttachment = 위치·회전만: minigame_result.md §6, plaza world.ts attachToSocket)
#   spawn    (부모 키, 뼈 이름 정규식(이름 묶음 t·iv), 모델 이름 틀, iv 일 때 보임 애니) — 부모 모델 뼈마다 모델 하나
#   anims    키 → 기본 애니 [(종류, 이름)](없으면 같은 이름 fskb 클립·fmab 를 루프 [추정])
#   cameras  first(첫 카메라 = 단계 로딩 P0 기준)·game(본편)
#   env      환경 컨테이너 종류 → 파일, envAnim = env 재질 애니(fmab)
#   nbmap    배치(모델 컴포넌트)로 쓸 nbmap(없으면 아카이브 전부), collision 충돌로 쓸 nbmap(없으면 전부)
SCENES = {
    "mg0508": {
        "evidence": "docs/minigame/mg0508.md §3.2·§7 — Scene::SyncedSetupGame @0x710000f570, Field::Field @0x7100007640 [판독]",
        "base": ["mg0508_bg00", "mg0508_tablecloth", "mg0508_griddle"],
        "hidden": ["mg0508_cutsurf"],
        "hooks": [("mg0508_cuttingboard00", "mg0508_bg00", "pos_cuttingboard00"), ("mg0508_cuttingboard01", "mg0508_bg00", "pos_cuttingboard01"),
                  ("mg0508_plate00", "mg0508_bg00", "pos_cuttingboard00"), ("mg0508_plate01", "mg0508_bg00", "pos_cuttingboard01")],
        "cameras": {"first": "mg0508_cam_start", "game": "mg0508_cam_game"},
        "env": {"environment": "mg0508_env", "directional_light": "mg0508_dir_light", "posteffect": "mg0508_post"},
    },
    "mg0106": {
        "evidence": "docs/minigame/mg0106.md §7 — ComMap 생성자 @0x7100008784·CreateObj @0x7100009020(GetGameStage 0 → grp05), ComCamera @0x7100003d50 [판독]",
        "base": ["mg0106_bg00", "mg0106_bg01", "mg0106_bg_roof00", "mg0106_rotate_floor00", "mg0106_search_light"],
        "hidden": ["mg0106_col00"],
        "hooks": [("mg0106_pos_obj_grp05", "mg0106_rotate_floor00", "pos_locator00")],
        "spawn": [("mg0106_pos_obj_grp05", r"^pos_obj(?P<t>[A-E])\d+$", "mg0106_obj{t}00", None)],
        "anims": {"mg0106_bg00": [("fmab", "mg0106_bg00_light.fmab")], "mg0106_bg_roof00": [("fmab", "mg0106_roof00_light.fmab")]},
        "cameras": {"first": "mg0106_cam_op00", "game": "mg0106_cam_game00"},
        "env": {"environment": "mg0106_env_dark", "directional_light": "mg0106_dir_light", "posteffect": "mg0106_post"},
    },
    "mg0101": {
        "evidence": "docs/minigame/mg0101.md §6.6·§7 — MapMgr CreateBG·CreateFloors·CreateFloorParts @0x7100012ba0, 코스 a0 = 표 @0x7100059e28 첫 칸 [판독]",
        "base": ["mg0101_fld0", "mg0101_fld1", "mg0101_fld2", "mg0101_fld3", "mg0101_fld4", "mg0101_fld5", "mg0101_river", "mg0101_cliff00", "mg0101_cliff01",
                 "mg0101_palm00", "mg0101_leaf00_dec", "mg0101_statue", "mg0101_sunbeams", "mg0101_water_fall00", "mg0101_water_fall01", "mg0101_water_fall02",
                 "mg0101_lever", "mg0101_plants_op"],
        "hidden": ["mg0101_cource_a0_pos"],
        "spawn": [("mg0101_cource_a0_pos", r"^pos_(?:(?P<iv>iv)_)?(?P<t>[a-gp-t])\d+$", "mg0101_floor_{t}", "mg0101_floor_invisible.fvbb")],
        "anims": {"mg0101_lever": [], "mg0101_fld0": []},
        "cameras": {"first": "mg0101_cam_op0", "game": "mg0101_cam_game"},
        "env": {"environment": "mg0101_env", "directional_light": "mg0101_dir_light", "posteffect": "mg0101_post"},
        "collision": ["mg0101_fld0_col", "mg0101_cource_a0_col"],
        "nbmap": [],
    },
    "mg0122": {
        "evidence": "docs/minigame/mg0122.md §5.6 — map/mg0122_map00.nbmap(Bg·Ground·FreeArea), 기믹은 GimmickMgr 런타임 [판독·데이터]",
        "base": [],
        "hidden": ["mg0122_guide_free", "mg0122_pos_result"],
        "cameras": {"first": "mg0122_cam_op00", "game": "mg0122_cam_game"},
        "env": {"environment": "mg0122_env00", "directional_light": "mg0122_dir_light00", "skybox": "mg0122_skybox"},
        "envAnim": "mg0122_env00_game.fmab",
        "nbmap": ["mg0122_map00"],
        "collision": ["mg0122_map00"],
    },
    "mg0102": {
        "evidence": "docs/minigame/mg0102.md §7 — 구체 배경 bg_ground00(+fmab)·bg_distant_view00(+fskb), 카메라 cam_op·cam_00 [판독·데이터]",
        "base": ["mg0102_bg_ground00", "mg0102_bg_distant_view00"],
        "cameras": {"first": "mg0102_cam_op", "game": "mg0102_cam_00"},
        "env": {"environment": "mg0102_env", "directional_light": "mg0102_dir_light", "posteffect": "mg0102_post"},
    },
    "mg1801": {
        "evidence": "script/games/mg1801/view/stage.ts 머리 — MapImpl 표 @0x7100037ff8(bg00·floor00·water00) + stool_npc00(RhythmNpcEnable) [판독]",
        "base": ["mg1801_bg00", "mg1801_floor00", "mg1801_water00", "mg1801_stool_npc00"],
        "cameras": {"first": "mg1801_cam00", "game": "mg1801_cam00"},
        "env": {"environment": "mg1801_env", "directional_light": "mg1801_dir_light", "posteffect": "mg1801_post"},
    },
}
RULE_BASE = re.compile(r"_(bg|fld|ground|map|stage|field|sky|roof|wall)(\d|_|$)")
RULE_HIDE = re.compile(r"(_col\d*$|_col_|^_?pos_|_pos_|_pos\d*$|_guide|_dummy|_loc_|_locator)")


def mgid_of(job):
    return job.arc.parts[-1]


def default_anims(name, info, anims, table):
    if name in table:
        return [{"kind": k, "name": n, "loop": True, "speed": 1, "frame": 0} for k, n in table[name]]
    out = []
    if name in info["clips"]:
        out.append({"kind": "clip", "name": name, "loop": True, "speed": 1, "frame": 0})
    if f"{name}.fmab" in anims:
        out.append({"kind": "fmab", "name": f"{name}.fmab", "loop": True, "speed": 1, "frame": 0})
    return out


def build_layout(job, scene):
    """장면 배치 — 표(base·hooks·spawn·hidden) + nbmap 모델 엔티티 + 규칙. 키 = 모델 이름(spawn = 부모/뼈, nbmap = nbmap/엔티티 경로)"""
    mgid = mgid_of(job)
    models = job.man["models"]
    anims = job.man["anims"]
    names = set(models)
    ta = scene.get("anims", {})
    hidden = set(scene.get("hidden", []))
    layout, keys = [], set()

    def add(e):
        if e["key"] not in keys:
            keys.add(e["key"])
            layout.append(e)
    if "evidence" in scene:
        base, src = [n for n in scene.get("base", []) if n in names], "table"
    else:
        base, src = sorted(n for n in names if RULE_BASE.search(n[len(mgid):]) and not RULE_HIDE.search(n[len(mgid):])), "rule"
    for n in base:
        add({"key": n, "model": n, "visible": True, "source": src, "anims": default_anims(n, models[n], anims, ta)})
    nbs = scene.get("nbmap")
    for p in ac.files_with(job.arc.root, (".nbmap",)):
        if nbs is not None and p.stem not in nbs:
            continue
        for ename, m, comps in ac.nbmap_entities(p):
            for c in comps.get("model", []):
                stem = Path(c["model"]).stem
                if stem not in names:
                    continue
                t, q = ac.mat_to_tq(m)
                add({"key": f"{p.stem}/{ename}", "model": stem, "visible": stem not in hidden and not RULE_HIDE.search(stem[len(mgid):]), "source": f"nbmap:{p.stem}",
                     "pos": [round(x, 6) for x in t], "quat": [round(x, 6) for x in q], "scale": [round(float(np.linalg.norm(m[:3, k])), 6) for k in range(3)],
                     "anims": default_anims(stem, models[stem], anims, ta)})
    for child, host, bone in scene.get("hooks", []):
        if child in names:
            add({"key": child, "model": child, "visible": child not in hidden, "source": "table", "hookKey": host, "hookNode": bone,
                 "anims": default_anims(child, models[child], anims, ta)})
    for n in sorted(hidden):
        if n in names:
            add({"key": n, "model": n, "visible": False, "source": "table", "anims": []})
    for host, pat, tmpl, vis in scene.get("spawn", []):
        if host not in names:
            continue
        rx = re.compile(pat)
        for nd in job.glb_js[host].get("nodes", []):
            mm = rx.match(nd.get("name") or "")
            if not mm:
                continue
            gd = {k: v for k, v in mm.groupdict().items() if v is not None}
            model = tmpl.format(**gd)
            if model not in names:
                continue
            an = default_anims(model, models[model], anims, ta)
            if vis and gd.get("iv"):
                an = an + [{"kind": "vis", "name": vis, "loop": False, "speed": 0, "frame": 0}]
            add({"key": f"{host}/{nd['name']}", "model": model, "visible": True, "source": "spawn", "hookKey": host, "hookNode": nd["name"], "anims": an})
    for e in list(layout):
        if e.get("hookKey") and e["hookKey"] not in keys and e["hookKey"] in names:
            add({"key": e["hookKey"], "model": e["hookKey"], "visible": False, "source": "hook-host", "anims": []})
    return layout


def cam_basis(c, i):
    pos = np.array(c["pos"][i], dtype=np.float64)
    r = c["rotOrAim"][i]
    if c["mode"].startswith("Euler"):
        x, y, z = r
        ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
        rx = np.array([[1, 0, 0], [0, np.cos(x), -np.sin(x)], [0, np.sin(x), np.cos(x)]])
        rz = np.array([[np.cos(z), -np.sin(z), 0], [np.sin(z), np.cos(z), 0], [0, 0, 1]])
        m = ry @ rx @ rz
        fwd, up = -m[:, 2], m[:, 1]
    else:
        fwd = np.array(r, dtype=np.float64) - pos
        fwd /= max(np.linalg.norm(fwd), 1e-9)
        up = np.array([0, 1.0, 0])
    right = np.cross(fwd, up)
    right /= max(np.linalg.norm(right), 1e-9)
    return pos, fwd, right, np.cross(right, fwd)


def sphere_visible(c, i, center, rad, aspect=16 / 9):
    """카메라 i 프레임 시야(세로 화각 fovyRad·16:9, near/far)에 구가 걸치는지 — FsnbCamera 와 같은 자세(EulerZXY → three 'YXZ', Aim → lookAt)"""
    pos, fwd, right, up = cam_basis(c, i)
    d = np.array(center) - pos
    z = float(d @ fwd)
    if z + rad < float(c["near"][i]) or z - rad > float(c["far"][i]):
        return False
    ty = np.tan(float(c["fovyRad"][i]) / 2)
    tx = ty * aspect
    return abs(float(d @ right)) <= z * tx + rad * np.sqrt(1 + tx * tx) and abs(float(d @ up)) <= z * ty + rad * np.sqrt(1 + ty * ty)


def entry_matrix(job, by, e):
    if e.get("hookKey"):
        h = by.get(e["hookKey"])
        if not h:
            return np.eye(4)
        js = job.glb_js[h["model"]]
        idx = next((i for i, nd in enumerate(js.get("nodes", [])) if nd.get("name") == e["hookNode"]), None)
        hm = entry_matrix(job, by, h)
        if idx is None:
            job.report["warnings"].append(f"부착 뼈 없음 {e['key']} → {e['hookKey']}/{e['hookNode']}")
            return hm
        t, q = ac.mat_to_tq(ac.node_matrices(js)[idx])
        return hm @ ac.trs(t, q, [1, 1, 1])
    return ac.trs(e.get("pos", [0, 0, 0]), e.get("quat", [0, 0, 0, 1]), e.get("scale", [1, 1, 1]))


def plan_first(job, layout, cam):
    """단계 로딩: P0 = 첫 카메라 0 프레임 시야에 걸치는 보이는 배치(+ 부착 부모), P1 = 첫 카메라 다른 프레임(10 프레임 간격)에 걸치는 것, P2 = 그 밖 보이는 배치.
    숨김 배치·배치 밖 모델 = P3(게임이 부를 때). 경계 = glb 바인드 자세 AABB 의 구 × 배치 행렬 [근사: 애니로 움직이는 것은 바인드 자세 기준]"""
    by = {e["key"]: e for e in layout}
    bounds, cache = {}, {}
    for e in layout:
        if e["model"] not in cache:
            cache[e["model"]] = ac.glb_bounds(job.glb_js[e["model"]])
        b = cache[e["model"]]
        if b is None:
            continue
        m = entry_matrix(job, by, e)
        lo, hi = np.array(b[:3]), np.array(b[3:])
        c = (lo + hi) / 2
        w = m @ np.array([c[0], c[1], c[2], 1.0])
        s = max(float(np.linalg.norm(m[:3, k])) for k in range(3))
        bounds[e["key"]] = [round(float(w[0]), 4), round(float(w[1]), 4), round(float(w[2]), 4), round(float(np.linalg.norm(hi - lo) / 2) * s, 4)]
    p0, p1 = [], []
    for e in layout:
        b = bounds.get(e["key"])
        if not e["visible"]:
            continue
        if cam is None or b is None or sphere_visible(cam, 0, b[:3], b[3]):
            p0.append(e["key"])
        elif any(sphere_visible(cam, i, b[:3], b[3]) for i in range(0, len(cam["pos"]), 10)):
            p1.append(e["key"])
    for k in list(p0) + list(p1):
        h = by[k].get("hookKey")
        while h:
            if h not in p0:
                p0.append(h)
            h = by.get(h, {}).get("hookKey")
    p1 = [k for k in p1 if k not in p0]
    p2 = [e["key"] for e in layout if e["visible"] and e["key"] not in p0 and e["key"] not in p1]
    return {"p0": p0, "p1": p1, "p2": p2, "bounds": bounds}


class MgAdapter(ac.Adapter):
    name = "mg"

    def env_pick(self, job):
        return SCENES.get(mgid_of(job), {}).get("env", {})

    def collision_nbmaps(self, job):
        return SCENES.get(mgid_of(job), {}).get("collision")

    def texts(self, job):
        import mg1801_web_ui as mu
        mgid = mgid_of(job)
        return {k: v for k, v in sorted(mu.messages().items()) if mgid in k.lower()}

    def sound_sources(self, job):
        mgid = mgid_of(job)
        up = f"_{mgid.upper()}_"
        src = [(p, None) for p in ac.files_with(ac.BEA / f"sound~subarc_{mgid}.nx.bea", (".fsst",))] if (ac.BEA / f"sound~subarc_{mgid}.nx.bea").exists() else []
        src.append((ac.cs.FSPJ, lambda label: up in label + "_"))
        extra = []
        if MGSOUND.exists():
            row = next((r for r in ac.load_json(MGSOUND)["MgSoundData"] if r["id"] == mgid), None)
            if row and isinstance(row.get("mg_bgm_label"), str) and row["mg_bgm_label"] not in ("", "0"):
                extra.append((row["mg_bgm_label"], "mgsound_setting mg_bgm_label"))
        return src, extra

    def extend(self, job):
        mgid = mgid_of(job)
        scene = SCENES.get(mgid, {})
        cams = job.ext.get("cameras") or {}
        if scene.get("envAnim") in job.man["anims"]:
            job.man["env"]["envAnim"] = scene["envAnim"]
        layout = build_layout(job, scene)
        first = scene.get("cameras", {}).get("first")
        if first not in cams:
            first = ([c for c in sorted(cams) if re.search(r"_(op|start)", c)] or sorted(cams) or [None])[0]
        game = scene.get("cameras", {}).get("game")
        if game not in cams:
            game = ([c for c in sorted(cams) if "_game" in c] or [first])[0]
        cam = ac.load_json(job.out / cams[first]["file"])["sceneAnims"][0]["cameras"][0] if first else None
        plan = plan_first(job, layout, cam)
        plan["camera"] = first
        return {"id": mgid, "scene": scene.get("evidence", "규칙(RULE_BASE) [추정] — 게임 표 없음"), "layout": layout, "camera": {"first": first, "game": game},
                "first": plan}


ac.ADAPTERS["mg"] = MgAdapter


def all_games():
    out = []
    for p in sorted(ac.BEA.glob("mg~mg[0-9][0-9][0-9][0-9].nx.bea")):
        mgid = p.name[3:9]
        if any((p / "mg" / mgid / "model").glob("*.fmdb")):
            out.append(mgid)
    return out


def write_index(games):
    import mg1801_web_ui as mu
    p = ac.ASSETS / "mg" / "index.json"
    cur = ac.load_json(p) if p.exists() else {"games": {}}
    msg = mu.messages()
    for g in games:
        m = ac.load_json(ac.ASSETS / "mg" / g / "manifest.json")
        cur["games"][g] = {"name": msg.get(f"im_{g}_name", g), "models": len(m.get("models") or {}), "cameras": sorted((m["asset"].get("cameras") or {}).keys()),
                           "first": m["mg"]["camera"]["first"]}
    p.write_bytes(ac.jbytes({"generator": "tools/analysis/mg_assets.py", "games": dict(sorted(cur["games"].items()))}, pretty=True))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("games", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    games = all_games() if a.all else a.games
    if not games:
        ap.error("게임 id 를 주거나 --all")
    only = set(a.only.split(",")) if a.only else None
    done = []
    for g in games:
        print(f"== {g}")
        ac.print_report(ac.run(f"mg~{g}", MgAdapter(), Path(a.out) if a.out else None, only, a.force))
        done.append(g)
    if not a.out:
        write_index(done)
    if ac.cs.changed:
        print("공용 파일 내용이 바뀐 것:", ac.cs.changed)


if __name__ == "__main__":
    main()
