"""Append stage 3 supplement lines while preserving all preexisting document bytes."""
from pathlib import Path
import re
ROOT=Path('C:/dev/mpj')

def supplement(file,line):
    p=ROOT/'web/docs/shell'/file
    b=p.read_bytes()
    nl=b'\r\n' if b'\r\n' in b else b'\n'
    addition=line.encode('utf-8')+nl
    if addition in b:return
    marker='### 참조만 한 기존 문서 절'.encode('utf-8')
    where=b.index(marker,b.index('## 11.'.encode('utf-8')))
    # Insert only one line; retain every old byte, including surrounding blank lines.
    p.write_bytes(b[:where]+addition+b[where:])

supplement('mgmet_flow.md','보충(2026-10-07): → [mgm01_freeplay.md](mgm01_freeplay.md) §8.1·8.2·3.2 (항목1·2·8의 슬롯 생성/타입·카운터 소비/fade predicate 보충), §6.1 (항목6의 프리 플레이112개 집합만 보충).')
supplement('mgmet_ruleconfig.md','보충(2026-10-07): → [ui2d_alignment.md](ui2d_alignment.md) §3~6 (항목1의 dirty 소비·kind2/-75·숨김 처리·최종 좌표 계산; 원본 화면 대조는 §11에 유지).')

for file in ('mgm01_freeplay.md','ui2d_alignment.md'):
    p=ROOT/'web/docs/shell'/file
    s=p.read_text(encoding='utf-8')
    lines=[]
    for line in s.splitlines(keepends=True):
        module='main' if file=='ui2d_alignment.md' or 'main @0x710' in line else 'mgmrs' if 'mgmrs @0x710' in line else 'mgm01'
        line=re.sub(r'(?<!main )(?<!mgm01 )(?<!mgmrs )(?<!boot )(?<!menu01 )(?<!mgmet )@0x710[0-9a-f]+',lambda m:module+' '+m[0],line)
        lines.append(line)
    p.write_text(''.join(lines),encoding='utf-8')

notes=ROOT/'analysis/notes/SHARED.md'
marker='## 확정 사실 (2026-10-07 mgm01 3단계 완료, 추가 기록)'
if marker not in notes.read_text(encoding='utf-8'):
    with notes.open('a',encoding='utf-8',newline='\n') as f:
        f.write('\n'+marker+'\n')
        f.write('- [mgm01] 위 mgm01 진행 중 예약 종료. mgm01_freeplay.md(A/B/D)·ui2d_alignment.md(C), 각11절 작성. 웹 script/assets 및 원본/extracted 읽기만; mgmet 기존 문서는 §11 보충1줄씩 추가, 정정0건. — web/docs/shell/ 및 analysis/mgm01_validation.json — [실행: 변환]\n')
        f.write('- [mgm01] 프리 플레이 JSON은112게임/14필터, MgAll112; type0/1/2는14x8/8x4/5x3 grid이며 목록 paging 없음. 랜덤은 현재 필터 unlocked 후보에서 SyncRandRange(0,N). — analysis/decomp/mgm01_stage3.c, mgm01 @0x71000148f0 / mgm01 @0x71000164c0; analysis/mgm01_evidence.json — [판독][데이터]\n')
        f.write('- [mgm01] 결과 ring은 Work+0xc부터100개 x0xc, ID/judge/4 raw bytes. SetMinigameResult는 (Round-1)%100에 쓰며 Round 증가 없음. history8판/화면, raw byte==(judge!=0)만 승리 집계; byte2/255 bool변환 금지. 실제 종료 writer/return은 mgscene 예약 범위에 유지. — analysis/decomp/mgm01_result_writer.c 및 mgm01_main_contract.c, main @0x71001f0460 / main @0x71001f2a80; mgm01_freeplay.md §6.6·8.3 — [판독]\n')
        f.write('- [mgm01] NEW 기본wait12는 GetDeltaRate 누적보다 작을 때 소비, save MG+4 bit0 clear. favorite는 같은 byte bit2(4), 두 setter 자체 SaveRequest 없음. — analysis/decomp/mgm01_callbacks.c 및 mgm01_stage3.c, mgm01 @0x71000247f0 / mgm01 @0x7100015940 / mgm01 @0x710001b560 — [판독]\n')
        f.write('- [mgm01] boot에서 Initialize(4), initial current/base type0·CharacterID0·BaseCharacterID-1. 인원 UI의 FUN_71003476a4가 H명 type0, 나머지 type1로 채우고 SetPlayerType는 current+0x4c/base+0xe0 함께 씀. — analysis/decomp/mgm01_dis_boot.c, boot @0x71000048f8; charsel_setting_player 기존 C, main @0x71003476a4; ui2dalign_main.c, main @0x710021d734 — [판독][판독: 어셈블리]\n')
        f.write('- [mgm01] main GetHumanPlayerNum은 동일 current getter의 type!=0, 허브는 type==0. mgm01은 main 카운터 변화로 팀 후보를 재구성하고 Solo 잠금은 별도로 type0 집계. 이름의 설계 이유는 미확정. — mgm01_freeplay.md §8.2; ui2dalign_main.c main @0x710021d7c8, mgm01_stage3.c mgm01 @0x710001ac24 — [판독]\n')
        f.write('- [mgm01] 기존 FUN_71001ee130 C를 재사용해 TeamOrder15행 변환, 후보4/3/duel6 등의 순서 및 FUN_71001f1930의 TeamID 배정 판독. 후보는 정렬된 목록 위치; 최종 PlayerID->TeamID/GamePlay 계약을 넘긴다. — analysis/mgm01_team_table.json, main @0x71001ee130 / main @0x71001f1930 / main @0x71001f4ef0; 문서 §6.5·8.3 — [판독][실행: 변환]\n')
        f.write('- [mgm01] ExitFlow 첫 WaitUntil의 vtable+0x30=FUN_710001eab8, !IsPlayingFadeAnim. 다른 기존 복귀 사실은 참조만. — analysis/decomp/mgm01_callbacks.c, mgm01 @0x710001eab8; 문서 §3.2 — [판독]\n')
        f.write('- [mgmrs] 정상 오프라인 한 판마다 거치지 않음. main 이탈 오류가 SetErrorReturnSceneName("mgmrs")를 고르는 조건, Scene24함수+Dummy 확보; 복구 Fiber 완료/failure=-1 성공이면 ReturnScene, cleanup에서 조작자 char/basechar 복원. — analysis/decomp/mgm01_main_more.c main @0x71001ec490, mgmrs_stage3.c mgmrs @0x7100003f80 / mgmrs @0x7100003ec8; 문서 §3.3·5.4 — [판독]\n')
        f.write('- [ui2dalign] dirty reader FUN_71014138ac, kind2=right/bottom, 숨김/ignore 제외, 첫 유효 자식 gap0·이후 gap-75. mgmet fixed size root: CPU(136,-299), 설명(507,-299), 형제 Play(910,-386); CPU 숨김에도 설명/Play 동일. 원본 실행 대조는 남음. — analysis/decomp/ui2dalign_main.c main @0x71014138ac / main @0x7101414320; analysis/ui2dalign_evidence.json; ui2d_alignment.md §6 — [판독][실행: 변환]\n')
        f.write('- [mgm01] 신규 C192함수/19파일, module/address 중복 없음. 어셈블리8함수의 예외 이유와5덤프는 문서 §10.2. 기존 보조함수 중복 출력1건은 새 C에서 제거하고 기존 mgmcommon_main_guilayout_all.c를 참조. INDEX 갱신·baseline906파일 보호·기존 문서 원문 hash 복구 검사 통과. 다음 mgscene 호출 입력은 문서 §8.3·9, 받는 쪽 내부는 예약 침범 없음. — analysis/mgm01_validation.json — [실행: 변환]\n')

correction='- [mgm01] 정정(2026-10-07, 위 초기 플레이어 기록의 파일명): charsels_setting_player는 전사 오타이며 정확한 근거는 analysis/decomp/charsel_setting_player.c, main @0x71003476a4다. 문서의 초기 구성 판독은 그대로다. — [데이터]\n'
if 'charsels_setting_player 기존 C' in notes.read_text(encoding='utf-8') and correction not in notes.read_text(encoding='utf-8'):
    with notes.open('a',encoding='utf-8',newline='\n') as f:f.write(correction)
