/**
 * mg1801 싹둑싹둑 수프 — GameDef. 분석 문서 docs/minigame/mg1801.md.
 * 회색 박스 단계: 로직은 원본 판독대로, 화면은 상자(카메라는 원본 값), 소리는 원본 렌더·디코드.
 *
 * 설정(원본에 있는 것만):
 * - mode = RmGameWork+0x20. 미니게임 모드 프리플레이는 규칙 설정의 리듬 난이도(mgm01 +0x267C → +0x288)로 0 노멀·2 하드만 나오고
 *   [판독: mgm01 MgSettingFlow_RuleSetting @0x710001bbf0, MgSettingFlow @0x71000118e8, MgStartFlow @0x7100011a50],
 *   1 롱·3 리믹스는 리듬 쿠킹(rc_stage01) 코스에서만 나온다(web/docs/minigame/rc_stage01.md 6.1).
 * - course / longPos = 리듬 쿠킹 코스 안 자리(RmGameWork+0x38 index, +0x3C 수). 코스 수 노멀·하드 3, 롱 6. 리믹스는 mg1801 이 A 슬롯(index 0)뿐이다.
 * - cpuMiss = Params.CpuMiss(원본 기본 끔). CPU 강도(PlayerWork ComLevel)는 RmGameWork 생성자가 +0xE70 에 모아 두기만 하고
 *   읽는 곳이 없어(main·mg1801 전수 검색) mg1801 CPU 에 영향이 없다 — 설정으로 두지 않는다.
 */
import { type GameDef, type GameOption, readOptions } from '../../../game';
import { mg1801AssetKeys } from './assets';
import type { Mg1801Options } from './logic/game';
import type { Mg1801Event, Mg1801Result, Mg1801State } from './state';

let body: typeof import('./body') | null = null;

const OPTIONS: readonly GameOption[] = [
  {
    key: 'mode',
    label: '모드',
    choices: [
      { value: '0', label: '노멀' },
      { value: '2', label: '하드' },
      { value: '1', label: '롱(리듬 쿠킹)' },
      { value: '3', label: '리믹스(리듬 쿠킹)' },
    ],
    def: '0',
    note: 'RmGameWork+0x20 — 채보·BGM·외곽선 안내가 바뀐다',
  },
  {
    key: 'course',
    label: '진행',
    choices: [
      { value: 'free', label: '미니게임 모드(단독)' },
      { value: 'rc0', label: '리듬 쿠킹 1번째 게임' },
      { value: 'rc2', label: '리듬 쿠킹 마지막(3번째) 게임' },
    ],
    def: 'free',
    when: { key: 'mode', values: ['0', '2'] },
    note: '리듬 쿠킹이면 시작·끝 텔롭과 PERFECT 가 없고, 마지막이 아니면 결과 징글 대신 _INTER_END',
  },
  {
    key: 'longPos',
    label: '롱 코스 자리',
    choices: [
      { value: 'rc0', label: '1번째(BPM 120)' },
      { value: 'rc3', label: '4번째(스피드 업 BPM 180)' },
      { value: 'rc5', label: '6번째 마지막(BPM 180)' },
    ],
    def: 'rc0',
    when: { key: 'mode', values: ['1'] },
    note: 'rc_stage01 SettingBpm: 코스 index ≥ 코스 수/2 면 BPM 180',
  },
  {
    key: 'cpuMiss',
    label: 'CPU 실수',
    choices: [
      { value: '0', label: '끔(원본 기본)' },
      { value: '1', label: '켬' },
    ],
    def: '0',
    note: 'Scene::Params.CpuMiss — 레인0 자르기 수의 1/4 을 P1·P3 FAST, P2·P4 SLOW 로',
  },
];

/** 고른 설정 → 로직 옵션 */
export function mg1801Options(given: Record<string, string> | undefined): Mg1801Options {
  const o = readOptions(OPTIONS, given);
  const mode = Number(o.mode);
  let course: Mg1801Options['course'] = null;
  if (mode === 0 || mode === 2) {
    if (o.course === 'rc0') course = { index: 0, count: 3 };
    else if (o.course === 'rc2') course = { index: 2, count: 3 };
  } else if (mode === 1) {
    course = { index: o.longPos === 'rc5' ? 5 : o.longPos === 'rc3' ? 3 : 0, count: 6 };
  } else {
    course = { index: 0, count: 6 };
  }
  return { mode, course, cpuMiss: o.cpuMiss === '1' };
}

const MODE_NAME = ['노멀', '롱', '하드', '리믹스'];

export const mg1801Game: GameDef<Mg1801State, Mg1801Event, Mg1801Result> = {
  id: 'mg1801',
  title: '싹둑싹둑 수프',
  assetsDir: 'mg1801/',
  assetKeys: mg1801AssetKeys,
  preparationKey: setup => JSON.stringify(setup.players.map(p => p.char)),
  players: 4,
  hasPractice: false,
  options: OPTIONS,
  load: async () => {
    body ??= await import('./body');
  },
  createLogic: (setup, play) => new body!.Mg1801Logic(setup, body!.mg1801PlayOptions(mg1801Options(setup.options), play)),
  createView: (ctx, assets) => new body!.Mg1801View(ctx, assets),
  describeResult(r, setup) {
    return {
      head: `결과(${MODE_NAME[r.mode ?? 0]}) — 팀 ${r.achieved}/${r.totalPoint}점, 달성률 ${r.rate.toFixed(1)}%, 별 판정 ${r.starJudge} (수프 mg1801_soup0${r.starJudge})`,
      rows: r.counts.map((c, i) => ({
        player: i,
        rank: 0,
        value: `${r.scores[i]}점${r.perfect?.[i] && !setup.players[i]?.isCom ? ' PERFECT' : ''} — JUST ${c.just} / FAST ${c.fast} / SLOW ${c.slow} / 놓침 ${c.miss}`,
        data: { score: r.scores[i], just: c.just, fast: c.fast, slow: c.slow, miss: c.miss, perfect: r.perfect?.[i] ? 1 : 0 },
      })),
    };
  },
};
