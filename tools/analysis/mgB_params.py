"""mg0911/mg0912 CSV 파라미터를 원본 로더 규칙대로 인덱스 표로 푼다.

mg0911 GameParam::Initialize @0x710003c2c0 (mg0911.nro):
  각 행 col0 = 값, col1 = 형식. 'FLOAT' 행은 float 벡터(GameParam+0x00)에, 'INT' 행은 int 벡터(+0x18)에 차례로 넣는다.
  GetCsvParamF(i) / GetCsvParamI(i) 는 각 벡터의 i 번째(행 번호가 아니다). 열 수 < 2 인 행은 건너뛴다.
  GetMinScore/GetMaxScore = INT 0..8 의 min(초기 1000)/max(초기 0).
mg0912 GameParam::Initialize @0x7100053a90 (mg0912.nro) 도 같은 규칙(mg/mg0912/data/mg0912_config.csv). 나머지 mg0912 표는 행 그대로. 결과: analysis/mgB_params.json
"""
import csv, json, io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
B11 = os.path.join(ROOT, 'extracted/bea/mg~mg0911.nx.bea/mg/mg0911/data')
B12 = os.path.join(ROOT, 'extracted/bea/mg~mg0912.nx.bea/mg/mg0912/data')

def rows(path):
    t = open(path, encoding='utf-8-sig').read()
    return list(csv.reader(io.StringIO(t)))

def config(path):
    f, i = [], []
    for r in rows(path):
        if len(r) < 2:
            continue
        if r[1] == 'FLOAT':
            f.append(float(r[0]))
        elif r[1] == 'INT':
            i.append(int(r[0]))
    return {'F': f, 'I': i, 'minScore': min([1000] + i[:9]), 'maxScore': max([0] + i[:9])}

def mg0911_config():
    return config(os.path.join(B11, 'mg0911_config.csv'))

def table(path):
    return [r for r in rows(path) if any(c.strip() for c in r)]

if __name__ == '__main__':
    out = {'mg0911': {'config': mg0911_config()}, 'mg0912': {}}
    for n in ['com_param', 'demo_frame', 'probability_param']:
        out['mg0911'][n] = table(os.path.join(B11, f'mg0911_{n}.csv'))
    for fn in sorted(os.listdir(B12)):
        out['mg0912'][fn[7:-4]] = table(os.path.join(B12, fn))
    c12 = config(os.path.join(B12, 'mg0912_config.csv'))
    out['mg0912']['configFI'] = {'F': c12['F'], 'I': c12['I']}
    p = os.path.join(ROOT, 'analysis/mgB_params.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    c = out['mg0911']['config']
    print('F', len(c['F']), ' '.join(f'{k}:{v:g}' for k, v in enumerate(c['F'])))
    print('I', len(c['I']), ' '.join(f'{k}:{v}' for k, v in enumerate(c['I'])))
    print('min/max', c['minScore'], c['maxScore'], '->', p)
    print('mg0912 F', ' '.join(f'{k}:{v:g}' for k, v in enumerate(c12['F'])), ' I', c12['I'])
