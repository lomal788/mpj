/**
 * 박자 동기 측정 — 헤드리스 크로미움에서 mg1801 을 소리 켜고(?mute=0&synclog=1) 돌려,
 * 로직이 본 박자 사건(G14 변화·줄 배분·JUST 중심·게임 BGM 접수)과 오디오 쪽 실제 소리 시각(마스터 G14 쓰기·BGM 시작·킥)의 차이를 잰다.
 *
 *   npx tsx tools/sync_measure.ts [--gpu d3d11|swiftshader] [--load none|const30|spike] [--label 이름] [--sec 최대초] [--query &키=값] [--from 원자료.json.gz]
 *
 * 비교 기준은 "들리는 오디오 시각"이다: 스텝을 처리한 순간의 AudioContext.getOutputTimestamp 를 그 순간으로 늘인 값(main.ts heardTime).
 * 차이 = (로직이 그 일을 한 스텝의 들리는 시각) − (오디오 쪽에서 그 소리가 난 AudioContext 시각). 양수 = 로직이 소리보다 늦다.
 * 부하: const30 = rAF 마다 30 ms 바쁜 대기, spike = 1 초마다 300 ms 바쁜 대기(rAF 를 감싼다, 페이지 코드는 그대로).
 * 결과: test/out/sync_<label>_<gpu>_<load>.json (요약 + 시간별 표본)
 */
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { chromium } from "playwright-core";
import { WEB, findChromium, startServer } from "./browser";

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const gpu = arg("gpu", "d3d11");
const load = arg("load", "none");
const label = arg("label", "run");
const maxSec = Number(arg("sec", "90"));
const query = arg("query", "");

const GPU_ARGS: Record<string, string[]> = {
  d3d11: ["--use-angle=d3d11"],
  swiftshader: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
};
const LOAD_SCRIPT: Record<string, string> = {
  none: "",
  const30: `(() => { const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { const e = performance.now() + 30; while (performance.now() < e); cb(t); }); })();`,
  spike: `(() => { const raf = window.requestAnimationFrame.bind(window); let next = performance.now() + 1000;
    window.requestAnimationFrame = (cb) => raf((t) => { if (performance.now() >= next) { const e = performance.now() + 300; while (performance.now() < e); next = performance.now() + 1000; } cb(t); }); })();`,
};

type Step = [
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  string[] | null,
  ...unknown[],
];
type AudioRec =
  | ["g", number, number, number, number | null]
  | ["bgmStart", string, number, number | null]
  | ["note", number, number, number];

interface Series {
  n: number;
  first: number;
  mean: number;
  min: number;
  max: number;
  p05: number;
  p95: number;
  /** [마스터 시작 뒤 초, 차이 ms] 5 초 간격 표본 */
  samples: [number, number][];
}

const ms = (x: number): number => Math.round(x * 10000) / 10;
function series(pts: [number, number][]): Series | null {
  if (!pts.length) return null;
  const v = pts.map((p) => p[1]).sort((a, b) => a - b);
  const q = (f: number): number =>
    v[Math.min(v.length - 1, Math.floor(f * v.length))];
  const samples: [number, number][] = [];
  let nextT = -Infinity;
  for (const [t, d] of pts) {
    if (t >= nextT) {
      samples.push([Math.round(t * 10) / 10, ms(d)]);
      nextT = t + 5;
    }
  }
  return {
    n: v.length,
    first: ms(pts[0][1]),
    mean: ms(v.reduce((a, b) => a + b, 0) / v.length),
    min: ms(v[0]),
    max: ms(v[v.length - 1]),
    p05: ms(q(0.05)),
    p95: ms(q(0.95)),
    samples,
  };
}

/** JUST 중심: 등장 프레임 뒤 몇 번째 Update 에서 diff = t3F − trunc(elapsed·60) 가 0 이 되는지(f32 누적, logic/objectMan.ts judgeInput) */
function justK(bpm: number): number {
  const f = Math.fround;
  const t3F = Math.trunc(f(f(f(f(60 / bpm) * 3) * 1) * 60));
  let e = 0;
  for (let k = 1; k < 1000; k++) {
    e = f(f(1 / 60) + e);
    if (t3F - Math.trunc(f(e * 60)) <= 0) return k;
  }
  return -1;
}

interface Raw {
  sync: {
    steps: Step[];
    frames?: [number | null, number][];
    audio: AudioRec[];
  };
  stage: string;
  dropped: number | null;
  errors: string[];
}

/** 브라우저에서 한 판 돌려 원자료를 받는다 */
async function capture(): Promise<Raw> {
  const server = await startServer(5197);
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: [
      ...(GPU_ARGS[gpu] ?? GPU_ARGS.d3d11),
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    if (LOAD_SCRIPT[load]) await page.addInitScript(LOAD_SCRIPT[load]);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(
      `${server.url}?game=mg1801&auto=1&mute=0&seed=1&com=1111&synclog=1${query}`,
    );
    const t0 = Date.now();
    await page.waitForFunction(
      'window.__mpj && window.__mpj.stage === "running"',
      null,
      { timeout: 120000 },
    );
    while (Date.now() - t0 < maxSec * 1000) {
      const st = await page.evaluate("window.__mpj.stage");
      if (st === "done" || st === "error") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const raw = (await page.evaluate(
      "({ sync: window.__mpj.sync, stage: window.__mpj.stage, dropped: window.__mpj.dropped ?? null })",
    )) as Raw;
    raw.errors = errors;
    return raw;
  } finally {
    await browser.close();
    await server.close();
  }
}

/* --from <원자료.json.gz> 면 다시 재지 않고 분석만 한다. 아니면 재서 test/out/sync_raw_*.json.gz 로 남긴다 */
const from = arg("from", "");
const rawFile = path.join(
  WEB,
  "test",
  "out",
  `sync_raw_${label}_${gpu}_${load}.json.gz`,
);
let raw: Raw;
if (from)
  raw = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(from)).toString("utf-8"),
  ) as Raw;
else {
  raw = await capture();
  fs.writeFileSync(rawFile, zlib.gzipSync(JSON.stringify(raw)));
}
const errors = raw.errors ?? [];
{
  const steps = raw.sync.steps;
  const audio = raw.sync.audio;

  // 오디오 쪽 G14 변화 → (마디, 위치) 별 시각
  const audioG14: { bar: number; pos: number; t: number }[] = [];
  let bar = -1;
  for (const a of audio) {
    if (a[0] !== "g" || a[1] !== 14) continue;
    if (a[2] === 1) bar++;
    if (bar >= 0) audioG14.push({ bar, pos: a[2], t: a[3] });
  }
  const audioKey = new Map(audioG14.map((x, i) => [x.bar * 16 + x.pos - 1, i]));
  const tMaster = audioG14[0]?.t ?? 0;
  /**
   * 로직이 본 G14 값 v 에 맞는 오디오 쓰기(audioG14 번호).
   * 스텝 시각 τ 가 있으면(수정 뒤) τ + 30 ms 까지 쓴 같은 값 가운데 마지막 — 긴 멈춤으로 스텝을 버리면 마디를 건너뛰어 마디 세기가 어긋나기 때문.
   * 없으면(수정 전, 프레임 모델은 값을 건너뛰지 않는다) 마스터 시작부터 센 (마디, 위치)로 짝짓는다.
   */
  const match = (bar: number, v: number, tau: number | null): number => {
    if (tau === null) return audioKey.get(bar * 16 + v - 1) ?? -1;
    for (let i = audioG14.length - 1; i >= 0; i--)
      if (audioG14[i].pos === v && audioG14[i].t <= tau + 0.03) return i;
    return -1;
  };

  // 로직 쪽 G14 변화
  const logicG14: {
    bar: number;
    pos: number;
    frame: number;
    heard: number;
    cur: number;
    tau: number | null;
    idx: number;
  }[] = [];
  bar = -1;
  let prev = -99;
  steps.forEach((s, idx) => {
    const g = s[4];
    if (g === null || g === prev) return;
    prev = g;
    if (g < 1) return;
    if (g === 1) bar++;
    if (bar >= 0 && s[3] !== null)
      logicG14.push({
        bar,
        pos: g,
        frame: s[0],
        heard: s[3],
        cur: s[2] ?? NaN,
        tau: typeof s[8] === "number" ? s[8] : null,
        idx,
      });
  });
  const g14Diff: [number, number][] = [];
  const g14DiffCur: [number, number][] = [];
  /** 스텝 시각(τ, 그 스텝이 나타내는 들리는 시각) 기준 — 실행이 늦어도(렌더 멈춤 뒤 따라잡기) 로직 시간축이 소리와 맞는지 */
  const g14DiffTau: [number, number][] = [];
  for (const l of logicG14) {
    const i = match(l.bar, l.pos, l.tau);
    if (i < 0) continue;
    const t = audioG14[i].t;
    g14Diff.push([t - tMaster, l.heard - t]);
    g14DiffCur.push([t - tMaster, l.cur - t]);
    if (l.tau !== null) g14DiffTau.push([t - tMaster, l.tau - t]);
  }

  // 줄 배분과 JUST 중심
  const K = justK(120);
  const byFrame = new Map(steps.map((s) => [s[0], s]));
  const entryDiff: [number, number][] = [];
  const justDiff: [number, number][] = [];
  const entryTau: [number, number][] = [];
  const justTau: [number, number][] = [];
  let curBar = -1;
  let pg = -99;
  let prevRow: number | null = null;
  for (const s of steps) {
    const g = s[4];
    if (g !== null && g !== pg) {
      if (g === 1) curBar++;
      pg = g;
    }
    const row = s[5];
    if (
      row !== null &&
      prevRow !== null &&
      row > prevRow &&
      g !== null &&
      g >= 1 &&
      s[3] !== null
    ) {
      const i = match(curBar, g, typeof s[8] === "number" ? s[8] : null);
      const t = i >= 0 ? audioG14[i].t : undefined;
      if (t !== undefined) entryDiff.push([t - tMaster, s[3] - t]);
      if (t !== undefined && typeof s[8] === "number")
        entryTau.push([t - tMaster, s[8] - t]);
      const tj = i >= 0 ? audioG14[i + 12]?.t : undefined;
      const sj = byFrame.get(s[0] + K);
      if (tj !== undefined && sj && sj[3] !== null)
        justDiff.push([tj - tMaster, sj[3] - tj]);
      if (tj !== undefined && sj && typeof sj[8] === "number")
        justTau.push([tj - tMaster, sj[8] - tj]);
    }
    prevRow = row;
  }

  // 게임 BGM: 로직 'bgm'(접수) 스텝 vs 오디오 출발
  const bgm: {
    label: string;
    logicHeard: number | null;
    audioStart: number | null;
    diffMs: number | null;
  }[] = [];
  for (const s of steps) {
    for (const e of s[7] ?? []) {
      if (!e.startsWith("bgm:SQ_BGM_MG1801")) continue;
      const lab = e.slice(4);
      const a = audio.find((x) => x[0] === "bgmStart" && x[1] === lab) as
        ["bgmStart", string, number, number | null] | undefined;
      bgm.push({
        label: lab,
        logicHeard: s[3],
        audioStart: a ? a[2] : null,
        diffMs: a && s[3] !== null ? ms(s[3] - a[2]) : null,
      });
    }
  }

  // 시퀀서 지연: 음 start − 틱 시각(> 0 이면 늦게 처리해 소리가 밀렸다)
  const noteLate: [number, number][] = audio
    .filter((a) => a[0] === "note")
    .map((a) => [
      (a[2] as number) - tMaster,
      (a[3] as number) - (a[2] as number),
    ]);

  // 로직 시계 대 오디오 시계: 마스터 시작 뒤 첫 스텝 기준으로 (들리는 시각 경과 − 프레임 경과/60). 양수 = 로직이 소리보다 덜 갔다
  const s0 = steps.find((s) => s[3] !== null && s[3] >= tMaster);
  const clockLag: [number, number][] = s0
    ? steps
        .filter((s) => s[3] !== null && s[0] >= s0[0])
        .map((s) => [
          (s[3] as number) - tMaster,
          (s[3] as number) - (s0[3] as number) - (s[0] - s0[0]) / 60,
        ])
    : [];

  // 화면: rAF 마다 (들리는 시각 − 마지막 스텝 시각) = 그린 상태가 소리보다 늦은 양(수정 뒤 기록만 있다)
  const renderLag: [number, number][] = (raw.sync.frames ?? [])
    .filter((x) => x[0] !== null)
    .map((x) => [(x[0] as number) - tMaster, (x[0] as number) - x[1]]);
  // 스텝 시각 대비 실행: 스텝이 나타내는 시각 t(steps[8])와 실행 때 들리는 시각의 차
  const stepLate: [number, number][] = steps
    .filter((s) => typeof s[8] === "number" && s[3] !== null)
    .map((s) => [
      (s[3] as number) - tMaster,
      (s[3] as number) - (s[8] as number),
    ]);
  const observedSteps = steps.filter((s) => s[9] === true).length;

  // rAF 간격
  const walls = steps.map((s) => s[1]);
  /** 스텝 사이 벽시계 간격 > 50 ms(렌더 멈춤): [마스터 시작 뒤 초(들림), 간격 ms] */
  const hitches: [number, number][] = [];
  for (let i = 1; i < steps.length; i++) {
    const gap = steps[i][1] - steps[i - 1][1];
    if (gap > 50)
      hitches.push([
        Math.round(((steps[i][3] ?? 0) - tMaster) * 100) / 100,
        Math.round(gap),
      ]);
  }
  const span =
    walls.length > 1 ? (walls[walls.length - 1] - walls[0]) / 1000 : 0;

  const out = {
    label,
    gpu,
    load,
    query,
    stage: raw.stage,
    errors,
    steps: steps.length,
    wallSec: Math.round(span * 100) / 100,
    framesPerWallSec: span
      ? Math.round((steps.length / span) * 100) / 100
      : null,
    justK: K,
    note: "차이 ms = 로직 스텝의 들리는 오디오 시각 − 오디오 쪽 소리 시각. 양수 = 로직이 늦다. g14Cur 는 들리는 시각 대신 currentTime 기준",
    g14: series(g14Diff),
    g14Cur: series(g14DiffCur),
    g14Tau: series(g14DiffTau),
    entryTau: series(entryTau),
    justCenterTau: series(justTau),
    entry: series(entryDiff),
    justCenter: series(justDiff),
    bgm,
    seqNoteLate: series(noteLate),
    logicClockLag: series(clockLag),
    hitches,
    dropped: raw.dropped,
    observedSteps,
    renderLag: series(renderLag),
    stepLate: series(stepLate),
  };
  const file = path.join(
    WEB,
    "test",
    "out",
    `sync_${label}_${gpu}_${load}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const line = (n: string, s: Series | null): string =>
    s
      ? `${n.padEnd(14)} n=${String(s.n).padStart(4)} 처음 ${s.first} 평균 ${s.mean} 최소 ${s.min} 최대 ${s.max} (p5 ${s.p05}, p95 ${s.p95}) ms`
      : `${n} 없음`;
  console.log(
    `${label} ${gpu} ${load}: stage=${raw.stage} 스텝 ${steps.length} / ${out.wallSec} s (${out.framesPerWallSec}/s)${errors.length ? ` 오류 ${errors.length}` : ""}`,
  );
  console.log(line("G14(들림)", out.g14));
  console.log(line("G14(cur)", out.g14Cur));
  console.log(line("G14(τ)", out.g14Tau));
  console.log(line("줄 배분", out.entry));
  console.log(line("줄 배분(τ)", out.entryTau));
  console.log(line("JUST 중심", out.justCenter));
  console.log(line("JUST 중심(τ)", out.justCenterTau));
  console.log(line("시퀀서 지각", out.seqNoteLate));
  console.log(line("로직시계 지연", out.logicClockLag));
  console.log(line("화면 지연", out.renderLag));
  console.log(line("스텝 실행 지각", out.stepLate));
  console.log(`관측 스텝 ${observedSteps}, 버린 스텝 ${raw.dropped}`);
  console.log(
    `렌더 멈춤(>50 ms) ${hitches.length}회, 합 ${hitches.reduce((a, h) => a + h[1], 0)} ms, 최대 ${Math.max(0, ...hitches.map((h) => h[1]))} ms`,
  );
  for (const b of bgm) console.log(`BGM ${b.label}: 차이 ${b.diffMs} ms`);
  if (errors.length) console.log(errors.slice(0, 5).join("\n"));
  console.log(`→ ${path.relative(WEB, file)}`);
}
