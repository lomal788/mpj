"""
진동 자료 범용 변환기 — 원본 진동 정의(vibration.msgpack)·설정·bnvib 파형·FX 트리거(.ftrg) VB_ 키를 웹 재생용 JSON 하나로. 설계: docs/engine/05_ui_input.md §11.
경로는 모두 인자로 받는다(어느 아카이브·출력 폴더에도 묶이지 않음). convert() 를 다른 변환기(asset_convert.py 처리기 등)가 그대로 부를 수 있다.

출력 {define: {라벨: [설정 이름, Gain_Master, Gain_Low, Gain_High, priority, vib_slot]},
      setting: {설정: 값형 {ampLow, ampHigh, duration, attack, release} | bnvib {rateHz, ampLow[], ampHigh[]}},
      vb: {VB_ 키: 라벨}, missing: [정의가 없는 요청 라벨]}
bnvib 파서는 ui_bnvib.py(§7.6) 그대로.

  python vib_convert.py --msgpack <vibration.msgpack> --bnvib <bnvib 폴더> --out <json>
         [--ftrg <x.ftrg> ...] [--vb-prefix VB_MGM VB_MENU] [--include 'bv_vib_(sys|stamp|cmn)_'] [--scan <폴더> ...]
  --scan 폴더의 .ts/.json 에서 'bv_vib_*' 이름을 더 모은다.
mpj 셸 진동(assets/common/vib/vib.json) 예:
  python web/tools/analysis/vib_convert.py --msgpack extracted/bea/vib.nx.bea/vib/vibration.msgpack --bnvib extracted/bea/vib.nx.bea/vib/bnvib
         --ftrg extracted/bea/bq.nx.bea/chara/pc/ftrgBase/ftrg/vb_pc_base.ftrg --vb-prefix VB_MGM VB_MENU --scan web/script/shell
         --out web/assets/common/vib/vib.json
"""
import argparse
import json
import re
import sys
from pathlib import Path

import msgpack

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ui_bnvib import parse  # noqa: E402


def vb_keys(ftrgs, prefixes) -> dict:
    """FX 트리거의 VB_ 키 → 자원 경로 끝 성분(진동 라벨)"""
    out = {}
    for f in ftrgs:
        b = Path(f).read_bytes()
        keys = list(re.finditer(rb'(VB_[A-Z0-9_]+)\x00', b))
        for n, m in enumerate(keys):
            end = keys[n + 1].start() if n + 1 < len(keys) else len(b)
            p = re.search(rb'/(bv_[a-z0-9_]+)', b[m.end():end])
            k = m.group(1).decode()
            if p and (not prefixes or k.startswith(tuple(prefixes))):
                out.setdefault(k, p.group(1).decode())
    return out


def scan_names(dirs) -> set:
    out = set()
    for d in dirs:
        for p in Path(d).rglob('*'):
            if p.suffix in ('.ts', '.json') and p.is_file():
                try:
                    out |= set(re.findall(r'bv_vib_[a-z0-9_]+', p.read_text(encoding='utf-8')))
                except UnicodeDecodeError:
                    continue
    return out


def convert(msgpack_path, bnvib_dir, ftrgs=(), vb_prefix=(), include=(), scan=()) -> dict:
    d = msgpack.unpackb(Path(msgpack_path).read_bytes(), raw=False, strict_map_key=False)
    defs = {x['label']: x for x in d['vib_define']}
    sets = {x['vib_setting']: x for x in d['vib_setting']}
    vb = vb_keys(ftrgs, vb_prefix)
    rx = [re.compile(r) for r in include]
    want = {k for k in defs if any(r.match(k) for r in rx)} | set(vb.values()) | scan_names(scan)
    out_def, out_set = {}, {}
    for k in sorted(want):
        x = defs.get(k)
        if not x:
            continue
        name = x['play_name']
        out_def[k] = [name, x['Gain_Master'], x['Gain_Low'], x['Gain_High'], x['priority'], x['vib_slot']]
        st = sets.get(name)
        if not st or name in out_set:
            continue
        if st['vib_type'] == 'value':
            out_set[name] = {'ampLow': st['amp_Low'], 'ampHigh': st['amp_High'], 'duration': st['duration'], 'attack': st['attack_time'], 'release': st['release_time']}
        else:
            f = Path(bnvib_dir) / f"{st['bnvib']}.bnvib"
            if f.exists():
                w = parse(f.read_bytes())
                out_set[name] = {'rateHz': w['rateHz'], 'ampLow': w['ampLow'], 'ampHigh': w['ampHigh']}
    return {
        'source': 'vib_convert.py — vibration.msgpack vib_define/vib_setting + bnvib + ftrg VB_ 키',
        'define': out_def,
        'setting': out_set,
        'vb': {k: v for k, v in sorted(vb.items()) if v in out_def},
        'missing': sorted(k for k in want if k not in defs),
    }


def main(argv) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--msgpack', required=True)
    ap.add_argument('--bnvib', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ftrg', nargs='*', default=[])
    ap.add_argument('--vb-prefix', nargs='*', default=[])
    ap.add_argument('--include', nargs='*', default=[r'bv_vib_(sys|stamp|cmn)_'])
    ap.add_argument('--scan', nargs='*', default=[])
    a = ap.parse_args(argv)
    out = convert(a.msgpack, a.bnvib, a.ftrg, a.vb_prefix, a.include, a.scan)
    p = Path(a.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(p, '정의', len(out['define']), '설정', len(out['setting']), 'VB', len(out['vb']), '없음', out['missing'])


if __name__ == '__main__':
    main(sys.argv[1:])
