"""rcF: 리듬 쿠킹(rc_stage01) 코스 생성·BPM·등급 재구현 계산.

근거(판독): web/docs/minigame/rc_stage01.md
  - GenerateModeMgList          main @0x710042a7a0 (analysis/decomp/rcF_main_dis1.c)
  - 리믹스 목록 FUN_710042b780  main @0x710042b780 (같은 파일), 풀 D 표 main @0x71015d8e3c
  - libc++ std::sort            main FUN_710042e320 / FUN_710042f0c0 (키 = MgListWork+4 오름차순, len<31 이면 insertion_sort_3)
  - AddArchiveFileSetting       rc_stage01 @0x7100033690 (analysis/decomp/rcF_rc_dis2.c)
  - SettingBpm / SyncedSetupGame rc_stage01 @0x710002c564 / @0x710002c234
  - 결과 기록 FUN_710042ca10    main @0x710042ca10 (코스 평균 등급, analysis/decomp/rcF_main_dis2.c)
  - SyncRand                    tools/core_rand.py (MT19937, SyncRandMod = (u*n)>>32)

사용: .venv/Scripts/python tools/rcF_calc.py   -> 표 출력 + analysis/rcF_calc.json
이 파일은 재구현 계산이다(원본 실행 대조 없음).
"""
from __future__ import annotations

import glob
import itertools
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core_rand import SyncRand, AsyncRand, f32  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
MG = {0x6B + i: f"mg18{i + 1:02d}" for i in range(10)}  # bq::MinigameID 107..116
STARTER = [0x6B, 0x6C, 0x6D, 0x74]  # 첫 게임 후보(mg1801, 1802, 1803, 1810) @0x710042a9e8~
REMIX_A = [(0x6B, 5), (0x6D, 5), (0x6F, 5), (0x71, 5)]
REMIX_B = [(0x6C, 6), (0x70, 6), (0x74, 6)]
REMIX_C = [(0x6C, 9), (0x73, 9), (0x74, 9)]


def remix_d_table() -> list[tuple[int, int]]:
    """풀 D = main @0x71015d8e3c 의 {MinigameID, chart} 5개 (main.decomp.bin 평면 이미지에서 읽음)."""
    d = open(os.path.join(ROOT, "extracted/exefs/main.decomp.bin"), "rb").read()
    v = struct.unpack_from("<10I", d, 0x15D8E3C)
    return [(v[i * 2], v[i * 2 + 1]) for i in range(5)]


# ---------------------------------------------------------------- libc++ std::sort (branchy __sort3/4/5, insertion_sort_3)
def _sort3(a, i, j, k, key):
    if not key(a[j]) < key(a[i]):
        if not key(a[k]) < key(a[j]):
            return
        a[j], a[k] = a[k], a[j]
        if key(a[j]) < key(a[i]):
            a[i], a[j] = a[j], a[i]
        return
    if key(a[k]) < key(a[j]):
        a[i], a[k] = a[k], a[i]
        return
    a[i], a[j] = a[j], a[i]
    if key(a[k]) < key(a[j]):
        a[j], a[k] = a[k], a[j]


def _sort4(a, i, j, k, l, key):
    _sort3(a, i, j, k, key)
    if key(a[l]) < key(a[k]):
        a[k], a[l] = a[l], a[k]
        if key(a[k]) < key(a[j]):
            a[j], a[k] = a[k], a[j]
            if key(a[j]) < key(a[i]):
                a[i], a[j] = a[j], a[i]


def _sort5(a, key):
    _sort4(a, 0, 1, 2, 3, key)
    if key(a[4]) < key(a[3]):
        a[3], a[4] = a[4], a[3]
        if key(a[3]) < key(a[2]):
            a[2], a[3] = a[3], a[2]
            if key(a[2]) < key(a[1]):
                a[1], a[2] = a[2], a[1]
                if key(a[1]) < key(a[0]):
                    a[0], a[1] = a[1], a[0]


def libcxx_sort(a: list, key) -> None:
    n = len(a)
    if n < 2:
        return
    if n == 2:
        if key(a[1]) < key(a[0]):
            a[0], a[1] = a[1], a[0]
        return
    if n == 3:
        _sort3(a, 0, 1, 2, key)
        return
    if n == 4:
        _sort4(a, 0, 1, 2, 3, key)
        return
    if n == 5:
        _sort5(a, key)
        return
    if n >= 31:
        raise NotImplementedError("코스 목록은 최대 10개라 introsort 분할 경로는 쓰이지 않는다")
    _sort3(a, 0, 1, 2, key)  # __insertion_sort_3
    for i in range(3, n):
        j = i - 1
        if key(a[i]) < key(a[j]):
            t = a[i]
            k = j
            j = i
            while True:
                a[j] = a[k]
                j = k
                if j == 0:
                    break
                k -= 1
                if not key(t) < key(a[k]):
                    break
            a[j] = t


def shuffle_sync(a: list, rnd: SyncRand) -> None:
    """뒤에서부터 Fisher-Yates: k = n..2, r = SyncRandMod(k), swap(a[k-1], a[r])."""
    k = len(a)
    if k <= 1:
        return
    while True:
        r = rnd.rand_mod(k)
        a[k - 1], a[r] = a[r], a[k - 1]
        cont = k > 2
        k -= 1
        if not cont:
            break


# ---------------------------------------------------------------- GenerateModeMgList (노멀·롱·하드)
def generate_mode_mg_list(save: dict, available: set, refill: bool, count: int, rnd: SyncRand):
    """save: {MinigameID: 0..2} (RmSaveWork save+8 바이트 배열). 반환 (목록, 갱신된 save)."""
    save = dict(save)
    list_a = [g for g in range(0x6B, 0x75) if save[g] == 2]
    first = None
    if not refill:
        pool = [[g, save[g]] for g in STARTER]
        shuffle_sync(pool, rnd)
        libcxx_sort(pool, key=lambda w: w[1])
        first = pool[0][0]
    rest_ids = [g for g in range(0x6B, 0x75) if g in available and (refill or g != first)]
    work = [[g, save[g]] for g in rest_ids]
    if work and all(w[1] > 0 for w in work):
        for w in work:
            w[1] -= 1
            save[w[0]] = min(w[1], 2)
    for g in list_a:
        save[g] = 1
    shuffle_sync(work, rnd)
    libcxx_sort(work, key=lambda w: w[1])
    n = len(work)
    out = []
    if not refill:
        out.append(first)
        if count >= 2 and n >= 2:
            k = 1
            while True:
                out.append(work[(k - 1) % n][0])
                k += 1
                if k >= count or not (n > k):
                    break
    else:
        k = 0
        while k != count and k != n:
            out.append(work[k % n][0])
            k += 1
    return out, save


# ---------------------------------------------------------------- 리믹스 목록 (FUN_710042b780)
def generate_remix(prev: tuple[int, int, int], rnd: SyncRand, d_table):
    pa, pb, pc = prev
    A = [e for e in REMIX_A if e[0] != pa]
    shuffle_sync(A, rnd)
    B = [e for e in REMIX_B if e[0] != pb]
    shuffle_sync(B, rnd)
    C = [e for e in REMIX_C if e[0] != pc and e[0] != A[0][0] and e[0] != B[0][0]]
    shuffle_sync(C, rnd)
    D = [e for e in d_table if e[0] not in (A[0][0], B[0][0], C[0][0])]
    shuffle_sync(D, rnd)
    course = [A[0], B[0], D[0], D[1], D[2], C[0]]
    return course, (A[0][0], B[0][0], C[0][0])


# ---------------------------------------------------------------- 코스 → 실행 목록
def build_course(mode: int, save, available, refill, rnd, prev_remix=(-1, 0, 0), d_table=None):
    """AddArchiveFileSetting + PreGameWaitFunc 단계 9 의 게임 선택 + SettingBpm."""
    if mode == 3:
        course, new_prev = generate_remix(prev_remix, rnd, d_table)
        ids = [g for g, _ in course]
        charts = [f"chart{c:02d}s" for _, c in course]
        count = len(ids)
        play = ids[:]
        new_save = save
    else:
        lst, new_save = generate_mode_mg_list(save, available, refill, 3, rnd)
        count = 6 if mode == 1 else 3
        table = [lst[i % len(lst)] for i in range(count)]  # RmGameWork+0x44+i*4
        play = [table[i % 3] for i in range(count)]  # CallScene: +0x44[idx % Sequence+0x4c(3)]
        ids = table
        charts = ["chart01" if mode == 2 else "chart00"] * count
        new_prev = prev_remix
    bpm = []
    cur = 120
    for idx in range(count):
        if mode != 1:
            cur = 120
        elif idx >= count // 2:
            cur = 180
        bpm.append(cur)
    flag2c = [1 if idx < count - 1 else 0 for idx in range(count)]
    return {
        "mode": mode, "count": count, "table_0x44": [MG[g] for g in ids], "played": [MG[g] for g in play],
        "charts": charts, "bpm": bpm, "flag_0x2c": flag2c,
    }, new_save, new_prev


# ---------------------------------------------------------------- 채보 줄 수
def chart_rows() -> dict:
    out = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "extracted/bea/mg~mg18*.nx.bea/mg/mg18*/data/mg18*_rm_chart*.json"))):
        d = json.load(open(p, encoding="utf-8-sig"))
        name = os.path.basename(p)[:-5]
        out[name] = len(d["1P"])
    return out


def eighth_sec(bpm: int) -> float:
    return 60.0 / bpm * 0.5


# ---------------------------------------------------------------- 코스 평균 등급 (FUN_710042ca10 꼬리, 전부 f32)
def course_rank(rates: list[float]):
    s = f32(0.0)
    for r in rates:
        s = f32(s + f32(r))
    avg20 = f32(f32(s / f32(float(len(rates)))) / f32(20.0))
    star = int(avg20)  # fcvtzs w8,s0 -> +0x660
    t = float(int(f32(avg20 * f32(10.0))))  # fcvtzs s3 ; scvtf
    fix = f32(f32(f32(t) / f32(10.0)) * f32(20.0))  # +0x664
    disp = f32(float(int(f32(f32(fix / f32(20.0)) * f32(10.0)))) / f32(10.0))  # JudgeCookingWait 2: (int)(fix/20*10)/10
    return {"rates": rates, "0x660_rank": star, "0x664_rateFix": fix, "judge_flash": disp}


def game_rate(achieved: int, total: int) -> float:
    """RmUiStatusMan::GetStarAchieveRate @0x7100436558: f32(a)/f32(t)*100, <0 -> 0, fmin 100."""
    r = f32(f32(f32(float(achieved)) / f32(float(total))) * f32(100.0))
    if r < 0:
        return 0.0
    return min(r, 100.0)


def main():
    rows = chart_rows()
    d_table = remix_d_table()
    res = {"chart_rows": rows, "remix_d_table": [(MG.get(g, g), c) for g, c in d_table]}

    # 리믹스 풀 ↔ 채보 파일 대조
    pools = {"A": REMIX_A, "B": REMIX_B, "C": REMIX_C, "D": d_table}
    pool_files = {k: [f"{MG[g]}_rm_chart{c:02d}s" for g, c in v] for k, v in pools.items()}
    s_files = sorted(k for k in rows if k.endswith("s"))
    covered = sorted(itertools.chain.from_iterable(pool_files.values()))
    res["remix_pool_files"] = pool_files
    res["remix_files_all_covered"] = (s_files == sorted(set(covered)) and len(covered) == len(set(covered)))

    # 리믹스 전수: 모든 직전 상태(초기 -1,0,0 포함)에서 가능한 코스, D 후보 수 최소
    prevs = [(-1, 0, 0)] + list(itertools.product([g for g, _ in REMIX_A], [g for g, _ in REMIX_B], [g for g, _ in REMIX_C]))
    min_d = 99
    courses = set()
    for pa, pb, pc in prevs:
        for a in [e for e in REMIX_A if e[0] != pa]:
            for b in [e for e in REMIX_B if e[0] != pb]:
                cs = [e for e in REMIX_C if e[0] not in (pc, a[0], b[0])]
                min_c = len(cs)
                if min_c == 0:
                    res.setdefault("remix_empty_C", []).append((pa, pb, pc, a, b))
                    continue
                for c in cs:
                    ds = [e for e in d_table if e[0] not in (a[0], b[0], c[0])]
                    min_d = min(min_d, len(ds))
                    for perm in itertools.permutations(ds, 3):
                        courses.add((a, b) + perm + (c,))
    res["remix_min_D_candidates"] = min_d
    res["remix_distinct_courses"] = len(courses)
    tot = []
    for crs in courses:
        n = sum(rows[f"{MG[g]}_rm_chart{c:02d}s"] for g, c in crs)
        tot.append(n)
    res["remix_total_rows_min_max"] = (min(tot), max(tot))
    res["remix_total_8th_sec_min_max_bpm120"] = (min(tot) * eighth_sec(120), max(tot) * eighth_sec(120))

    # 노멀/하드/롱: 가능한 3게임 조합의 줄 수 범위 (첫 게임은 starter)
    combos = []
    for first in STARTER:
        for b, c in itertools.permutations([g for g in range(0x6B, 0x75) if g != first], 2):
            combos.append((first, b, c))
    for mode, chart in ((0, "chart00"), (2, "chart01")):
        t = [sum(rows[f"{MG[g]}_rm_{chart}"] for g in cmb) for cmb in combos]
        res[f"mode{mode}_rows_min_max"] = (min(t), max(t))
    t_long = []
    for cmb in combos:
        r = [rows[f"{MG[g]}_rm_chart00"] for g in cmb]
        t_long.append((sum(r) * 2, sum(r) * eighth_sec(120) + sum(r) * eighth_sec(180)))
    res["mode1_rows_min_max"] = (min(x[0] for x in t_long), max(x[0] for x in t_long))
    res["mode1_8th_sec_min_max"] = (min(x[1] for x in t_long), max(x[1] for x in t_long))

    # 시드 예시 (sync 시드는 원본에서 장면마다 바뀐다 — 예시일 뿐)
    examples = []
    save0 = {g: 0 for g in range(0x6B, 0x75)}
    avail_all = set(range(0x6B, 0x75))
    for seed in (1, 2, 12345):
        for mode in (0, 1, 2, 3):
            rnd = SyncRand(seed)
            c, s1, p1 = build_course(mode, save0, avail_all, False, rnd, d_table=d_table)
            c["seed"] = seed
            examples.append(c)
    res["examples"] = examples

    # 연속 노멀 3회: 세이브 카운트 변화 (결과 기록이 플레이한 게임을 2 로 쓴다고 가정해 이어 붙임)
    chain = []
    save = dict(save0)
    rnd = SyncRand(777)
    for run in range(4):
        c, save, _ = build_course(0, save, avail_all, False, rnd, d_table=d_table)
        for name in c["played"]:
            gid = [k for k, v in MG.items() if v == name][0]
            save[gid] = 2
        chain.append({"played": c["played"], "save_after": {MG[g]: v for g, v in save.items()}})
    res["normal_chain_seed777"] = chain

    # 등급 계산 예시
    res["rank_examples"] = [
        course_rank([100.0, 100.0, 100.0]),
        course_rank([79.9, 80.0, 80.1]),
        course_rank([game_rate(166, 208), game_rate(200, 208), game_rate(150, 208)]),
        course_rank([19.9, 20.0, 19.9]),
        course_rank([0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
    ]
    res["mg1801_chart00_full"] = {"achieved": 208, "total": 208, "rate": game_rate(208, 208)}

    # 출력
    print("== 채보 줄 수")
    for k, v in rows.items():
        print(f"  {k:22s} {v:4d}  8분×줄 @120 {v * eighth_sec(120):6.2f}s  @180 {v * eighth_sec(180):6.2f}s")
    print("== 리믹스 풀 D 표", res["remix_d_table"])
    print("== 리믹스 s 파일 전부 풀에 1번씩:", res["remix_files_all_covered"])
    print("== 리믹스 D 후보 최소:", min_d, " 가능한 서로 다른 코스 수:", len(courses), " 빈 C:", res.get("remix_empty_C"))
    print("== 리믹스 총 줄:", res["remix_total_rows_min_max"], " 8분×줄 초:", res["remix_total_8th_sec_min_max_bpm120"])
    print("== 노멀 줄:", res["mode0_rows_min_max"], " 하드 줄:", res["mode2_rows_min_max"], " 롱 줄:", res["mode1_rows_min_max"], " 롱 8분×줄 초:", res["mode1_8th_sec_min_max"])
    for e in examples:
        print("  예시", e)
    for c in chain:
        print("  연속 노멀", c["played"])
    for r in res["rank_examples"]:
        print("  등급", r)
    json.dump(res, open(os.path.join(ROOT, "analysis/rcF_calc.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    print("-> analysis/rcF_calc.json")


if __name__ == "__main__":
    main()
