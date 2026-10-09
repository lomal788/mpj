/**
 * 배포용 진입점(index.html, 주소 /) — 게임만 돈다. 열자마자 app/flow 의 실제 흐름을 처음(플레이어 설정)부터 시작한다.
 * 개발 옵션·설정 패널·URL 옵션·시험 훅이 없다(하네스는 /dev, script/dev). 주소는 바뀌지 않고 같은 문서 안에서 화면만 바뀐다(DESIGN.md §10.1 진입점).
 * 브라우저 소리 잠금: 첫 사용자 입력(포인터·키·터치) 때 공용 오디오를 resume 한다.
 * 흐름이 끝나면(플레이어 설정 취소·광장 나감) 흐름 처음으로 돌아간다. 광장 실패는 메시지만 남긴다.
 */
import './style.css';
import './view/assetMode';
import { appAudio } from './view/audio';
import { createGameFlow, createGameHost, prepareFlow, runGameLoop } from '@app/flow';

const PLAYERS = [false, true, true, true];

const app = document.getElementById('app')!;
app.className = 'jw-play';
const host = createGameHost((stageBox) => app.append(stageBox));
runGameLoop(host);
const flow = createGameFlow(host);
flow.listen((e) => {
  if (e.type !== 'end') return;
  if (e.reason === 'error') host.setMsg(e.text);
  else flow.start(PLAYERS);
});

const UNLOCK = ['pointerdown', 'keydown', 'touchend'] as const;
const unlock = (): void => {
  const audio = appAudio();
  if (!audio) return;
  void audio.resume().then(() => {
    if (audio.ctx.state === 'running') for (const k of UNLOCK) removeEventListener(k, unlock, true);
  });
};
for (const k of UNLOCK) addEventListener(k, unlock, true);

prepareFlow();
flow.start(PLAYERS);
