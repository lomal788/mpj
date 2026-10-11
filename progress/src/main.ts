import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import './styles.css';
import type { Mode, Status, Scope, Stats, Progress, FunctionRecord, Link, Tree, TreeNode, Issue, Feature, Document } from './types';

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer]);
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
const number = (value: number | undefined) => (value ?? 0).toLocaleString('ko-KR');
const percent = (n: number | null | undefined) => n == null ? '—' : `${n.toFixed(1)}%`;
const colors: Record<Status, string> = {complete:'#92d263',partial:'#bfa355',none:'#344238',candidate:'#4e8aae',pending:'#b67257',tested:'#61a6c5',verified:'#9b77c9'};
let labels: Record<Mode, Record<string, string>> = {
  analysis: {complete:'분석 완료',partial:'부분 판독',none:'미분석',candidate:'문서 연결',pending:'판정 대기'},
  implementation: {complete:'완료 근거 확인',partial:'부분 구현 근거',none:'대응 미확인',candidate:'관련 코드 후보',pending:'판정 대기'},
  verification: {verified:'원본 비교 검증',tested:'자동 테스트 통과',none:'미검증'}
};
const modeNames: Record<Mode,string> = {analysis:'분석',implementation:'웹 구현',verification:'검증'};
const params = new URLSearchParams(location.search);
let mode: Mode = ['analysis','implementation','verification'].includes(params.get('mode') ?? '') ? params.get('mode') as Mode : 'analysis';
let view = params.get('view') === 'module' ? 'module' : 'category';
let category = params.get('category') ?? '';
let scope: Scope = [];
let scopeNames: string[] = [];
let progress: Progress;
let selectedId = '';
let selectedFunction: FunctionRecord | null = null;
let treeRequest = 0, detailsRequest = 0, searchRequest = 0, ledgerRequest = 0;
let ledger: 'unresolved' | 'features' | 'documents' = 'unresolved';
let ledgerOffset = 0, ledgerTotal = 0;
let links: Link[] = [];
let previewPath = '';
let updating = false;
let renderedMs = 0;
const chart = echarts.init($('#chart'), undefined, {renderer:'canvas'});
new ResizeObserver(() => chart.resize()).observe($('#chart'));
const badge = (state: string, m: Mode) => `<span class="badge ${escape(state)}">${escape(labels[m][state] ?? state)}</span>`;

async function api<T>(route: string, query: Record<string,string> = {}): Promise<T> {
  const response = await fetch(`/api/${route}?${new URLSearchParams(query)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}

function groups(): Record<string,{name:string}> {
  return progress.groups ?? Object.fromEntries(Object.entries(progress.minigames ?? {}).map(([k,v]) => [k,{name:v.name_ko}]));
}

function toast(message: string) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  window.setTimeout(() => $('#toast').hidden = true, 3500);
}

function query(): Record<string,string> {
  const related = $<HTMLInputElement>('#related-tags').checked;
  return {mode, view, category:related ? '' : category, tag:related ? category : '',
    state:$<HTMLSelectElement>('#state').value,
    unresolved:$<HTMLInputElement>('#only-unresolved').checked ? '1' : '',
    q:$<HTMLInputElement>('#search').value.trim(), scope:JSON.stringify(scope)};
}

function saveUrl() {
  const q = query(); delete q.scope; delete q.tag;
  q.category = category;
  for (const key of Object.keys(q)) if (!q[key]) delete q[key];
  history.replaceState(null, '', `${location.pathname}?${new URLSearchParams(q)}`);
}

function renderModes() {
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-selected',String(active));
  });
  $<HTMLSelectElement>('#view').value = view;
  const previous = $<HTMLSelectElement>('#state').value;
  $<HTMLSelectElement>('#state').innerHTML = `<option value="">전체 상태</option><option value="unfinished">미완료만</option>` + Object.entries(labels[mode]).map(([value,name]) => `<option value="${value}">${name}</option>`).join('');
  if (previous === 'unfinished' || previous in labels[mode]) $<HTMLSelectElement>('#state').value = previous;
  $('#legend').innerHTML = Object.entries(labels[mode]).map(([state,label]) => `<span><i style="background:${colors[state as Status]}"></i>${label}</span>`).join('');
}

function renderProgress() {
  const s = progress.stats;
  const statistics: [string,number,string,boolean][] = progress.cards ?? [
    ['전체 원본 함수',s.functions,`${progress.modules}개 모듈 · 중복 제거`,true],
    ['분석 문서 연결',s.document_linked,`${progress.linked_documents}개 문서 연결`,false],
    ['분석 완료',s.analysis.complete ?? 0,`전체 함수 중 ${percent(s.analysis_percent)}`,true],
    ['부분 판독',s.analysis.partial ?? 0,'완료 근거와 별도 집계',false],
    ['식별 웹 코드 / 기능',s.features,'전체 구현 대상 목록은 미확정',false],
    ['구현 완료 근거',s.implementation.complete ?? 0,`식별 항목 중 ${percent(s.implementation_percent)}`,true],
    ['원본 비교 검증',s.verification.verified ?? 0,`테스트 통과 ${number(s.verification.tested)}`,false],
    ['미확정 항목',s.unresolved,`미분류 함수 ${number(s.unclassified)}`,false]
  ];
  $('#stats').innerHTML = statistics.map(([label,n,note,accent]) => `<div class="stat ${accent?'accent':''}"><div class="stat-label">${label}</div><div class="stat-value">${number(n)}</div><div class="stat-note">${escape(note)}</div></div>`).join('');
  $('#scan-time').textContent = `최근 스캔 ${new Date(progress.version).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · ${progress.scan_seconds.toFixed(1)}s`;
  $('#category-count').textContent = `${progress.categories.length} GROUPS`;
  $('#total-functions').textContent = number(s.functions);
  $('#category-list').innerHTML = progress.categories.map(c => {
    const pct = mode === 'analysis' ? c.analysis_percent : mode === 'implementation' ? c.implementation_percent : c.verification_percent;
    return `<button class="category-row ${category===c.id?'active':''}" data-category="${escape(c.id)}" title="분석 ${percent(c.analysis_percent)} · 구현 ${percent(c.implementation_percent)} · 검증 ${percent(c.verification_percent)} · 평균 분류 신뢰도 ${(c.confidence_average*100).toFixed(0)}%"><span>${escape(c.name)}</span><b>${number(c.functions)}</b><span class="category-progress"><i style="width:${pct??0}%"></i></span></button>`;
  }).join('');
  document.querySelector<HTMLButtonElement>('.categories>[data-category=""]')?.classList.toggle('active', !category);
  $('#audit').textContent = `${progress.audit.inventory_matches?'TSV 수량 일치':'인덱스 확인 필요'} · 분류율 ${percent(s.classification_rate)}`;
  renderDenominator();
}

function renderDenominator() {
  const c = progress.categories.find(x => x.id === category);
  const stats: Stats = c ?? progress.stats;
  const numerator = mode === 'analysis' ? stats.analysis.complete ?? 0 : mode === 'implementation' ? stats.implementation.complete ?? 0 : stats.verification.verified ?? 0;
  const denominator = mode === 'analysis' || progress.source === 'ghidra' ? stats.functions : stats.features;
  $('#denominator').innerHTML = `<strong>${escape(c?.name ?? '전체')} ${modeNames[mode]} 근거 확인: ${number(numerator)} / ${number(denominator)} ${mode==='analysis'?'함수':'식별 항목'}</strong> · ${percent(denominator ? numerator/denominator*100 : null)}<br>${escape(progress.denominators[mode])}${progress.source==='ghidra'?'':mode==='analysis'?' · 자동 문서 연결과 부분 판독은 완료에 포함하지 않습니다.':' · 게임 전체 구현률을 뜻하지 않습니다. 대응 미확인은 미구현 확정이 아니며, 완료 0은 완료 근거 미확보입니다.'}`;
}

function renderBreadcrumbs() {
  $('#breadcrumbs').innerHTML = `<button data-depth="0">전체</button>` + scopeNames.map((name,i) => `<span>/</span><button data-depth="${i+1}" title="${escape(name)}">${escape(name)}</button>`).join('');
}

function groupColor(node: TreeNode) {
  if ((node.complete??0) === node.value) return colors[mode==='verification'?'verified':'complete'];
  if ((node.complete??0)>0 || (node.partial??0)>0) return '#697653';
  if ((node.candidate??0)>0) return '#365763';
  return '#293b2e';
}

async function renderTree() {
  const token = ++treeRequest;
  $('#loading').hidden = false; $('#chart-message').hidden = true;
  renderBreadcrumbs(); saveUrl();
  try {
    const tree = await api<Tree>('tree',query());
    if (token!==treeRequest) return;
    const start = performance.now();
    chart.setOption({
      backgroundColor:'#0b120d',
      tooltip:{trigger:'item',confine:true,backgroundColor:'#121e16',borderColor:'#476049',textStyle:{color:'#d5e9d0',fontSize:11},formatter:(item:unknown) => {
        const n = (item as {data:TreeNode}).data;
        return `<b>${escape(n.name)}</b><br>${n.state ? `${escape(n.module)} · ${escape(n.address)}<br>${escape(labels[mode][n.state])}` : `${number(n.value)} 함수<br>완료 ${number(n.complete)} · 부분 ${number(n.partial)} · 미확정 ${number(n.unresolved)}`}`;
      }},
      series:[{id:'atlas',type:'treemap',left:3,top:3,right:3,bottom:3,
        roam:true,nodeClick:'zoomToNode',leafDepth:1,breadcrumb:{show:false},
        animation: !matchMedia('(prefers-reduced-motion: reduce)').matches && tree.nodes.length<10000,
        animationDurationUpdate:260,visibleMin:0,
        label:{show:true,color:tree.leaf?'#d0dec8':'#d5ebc8',fontSize:tree.leaf?10:13,
          overflow:'truncate',formatter:(item:unknown) => {
            const n = (item as {data:TreeNode}).data;
            return tree.leaf ? (n.name || '') : `${n.name || scopeNames.at(-1) || '전체'}\n${number(n.value)} 함수 · ${percent((n.complete??0)/n.value*100)}`;
          }},
        upperLabel:{show:!tree.leaf,height:25,formatter:(item:unknown)=>(item as {name?:string}).name || scopeNames.at(-1) || '전체'},
        itemStyle:{borderColor:'#0b120d',borderWidth:tree.leaf?1:3,gapWidth:tree.leaf?1:3},
        emphasis:{itemStyle:{borderColor:'#d3f4a7',borderWidth:2},label:{color:'#f0ffe6'}},
        data:tree.nodes.map(node => ({...node,itemStyle:{color:node.state?colors[node.state]:groupColor(node)}}))
      }]
    },{notMerge:true});
    renderedMs = performance.now()-start;
    $('#selection-total').textContent = `${number(tree.total)} FUNCTIONS`;
    $('#render-info').textContent = `${number(tree.nodes.length)} ${tree.leaf?'CELLS':'GROUPS'} · ${renderedMs.toFixed(0)}ms`;
    $('#map-description').textContent = tree.leaf?'함수 하나 = 셀 하나 · 셀을 클릭하면 문서와 구현 근거가 열립니다.':'그룹 클릭 → 하위 탐색 · 큰 그룹은 모듈과 주소 범위로 나눠 모든 함수를 표시합니다.';
    $('#chart-message').hidden = tree.nodes.length>0;
    $('#chart-message').textContent = '조건에 맞는 함수가 없습니다.';
    chart.off('click');
    chart.on('click',(event:unknown) => {
      const node = (event as {data?:TreeNode}).data;
      if (!node) return;
      if (node.field && node.key) { scope.push([node.field,node.key]); scopeNames.push(node.name); void renderTree(); }
      else void showFunction(node.id);
    });
    $('#chart').setAttribute('aria-label',`${modeNames[mode]} 트리맵: ${number(tree.total)} 함수, ${number(tree.nodes.length)} ${tree.leaf?'셀':'그룹'}`);
  } catch (error) {
    if (token!==treeRequest) return;
    $('#chart-message').hidden=false; $('#chart-message').textContent=String(error);
  } finally { if (token===treeRequest) $('#loading').hidden=true; }
}

function sourceLink(link: Link, note='') {
  const index = links.push(link)-1;
  return `<button class="source-link" data-preview="${index}"><span class="path">${escape(link.path)}${link.line?`:${link.line}`:''} ↗</span><span class="link-note">${escape(note || link.reason || link.heading || '')}${link.confidence!=null?` · 연결 신뢰도 ${(link.confidence*100).toFixed(0)}%`:''}</span></button>`;
}

async function showFunction(id: string) {
  const token = ++detailsRequest;
  selectedId=id;
  $('#details').innerHTML='<div class="section-label">함수 상세</div><p class="subtitle">근거를 불러오는 중…</p>';
  try {
    const f = await api<FunctionRecord>('function',{id});
    if (token!==detailsRequest) return;
    selectedFunction=f; links=[];
    const categoryName = progress.categories.find(c=>c.id===f.category)?.name ?? f.category;
    $('#details').innerHTML = `<div class="section-label">함수 상세 <span>READ ONLY</span></div><h2 class="detail-name">${escape(f.name)}</h2><div class="detail-address"><span>${escape(f.module)}</span><span>${escape(f.address)}</span></div>
      <div class="detail-modes">${(['analysis','implementation','verification'] as Mode[]).map(m=>`<div><span>${modeNames[m]}</span>${badge(f[m],m)}</div>`).join('')}</div>
      <span class="tag">${escape(categoryName)}</span><span class="tag">${escape(f.subsystem)}</span>${f.tags.map(t=>`<span class="tag">${escape(progress.categories.find(c=>c.id===t)?.name ?? t)}</span>`).join('')}
      <div class="detail-section"><h3>분류 근거</h3><p>${escape(f.classification)}</p><p>분류 신뢰도 ${(f.confidence*100).toFixed(0)}% · 원본 크기 ${number(f.size)} B</p></div>
      <div class="detail-section"><h3>원본 디컴파일 · ${f.sources.length}</h3>${f.sources.length?f.sources.map(s=>sourceLink(s)).join(''):'<p>연결된 디컴파일 소스 없음. 함수 인덱스에는 존재합니다.</p>'}</div>
      <div class="detail-section"><h3>연결된 분석 문서 · ${f.documents.length}</h3>${f.documents.length?f.documents.slice(0,35).map(d=>sourceLink(d,d.heading)+`<p>${escape(d.excerpt)}</p>`).join(''):'<p>정확한 주소 또는 고유 심볼로 연결된 문서 없음.</p>'}${f.documents.length>35?'<p>앞의 35개 연결만 표시합니다.</p>':''}</div>
      <div class="detail-section"><h3>미확정 판독 사항 · ${f.issue_details.length}</h3>${f.issue_details.length?f.issue_details.map(u=>`<p class="issue-text">${escape(u.text)}</p>${sourceLink(u,u.heading)}`).join(''):'<p>이 함수를 명시적으로 참조한 미확정 항목 없음. 문서 전체의 미확정은 아래 목록에서 확인하세요.</p>'}</div>
      <div class="detail-section"><h3>웹 구현 및 검증 · ${f.feature_details.length}</h3>${f.feature_details.length?f.feature_details.map(x=>`<p>${escape(x.name)} ${badge(x.implementation,'implementation')} ${badge(x.verification,'verification')}</p>${x.path?sourceLink(x,'웹 구현 코드'):''}${x.structure?`<p>AST 구조: 실행 본문 ${x.structure.executable_members}개 · 빈 본문 ${x.structure.empty_members}개 · throw 전용 ${x.structure.throw_only_members}개 · 상수 반환 ${x.structure.constant_return_members}개</p>`:''}${x.assessment?`<p>판정 근거: ${escape(x.assessment.basis)}</p><p>${escape(x.assessment.warning)}</p><p>아직 필요한 확인: ${escape(x.assessment.missing.join(' / '))}</p>`:''}${x.evidence.map(e=>sourceLink(e)).join('')}${x.tests.map(t=>sourceLink(t)).join('')}<p>${x.tests.length?'테스트 연결 있음 · 통과 여부는 별도 증거 필요':'연결된 테스트 없음'}</p>${x.verification_evidence.map(e=>sourceLink(e)).join('')}`).join(''):'<p>원본 함수와 웹 코드의 명시적 대응을 찾지 못했습니다. 미구현으로 확정하지 않습니다. 관련 코드 후보는 아래 웹 기능 목록에서 확인할 수 있습니다.</p>'}</div>
      <div class="detail-section"><h3>확인된 직접 호출 · ${f.calls.length}</h3>${f.calls.slice(0,35).map(k=>`<button class="source-link" data-function="${escape(k)}"><span class="path">${escape(k)}</span></button>`).join('') || '<p>직접 FUN_ 호출 근거 없음. 간접 호출은 자동 판정하지 않습니다.</p>'}</div>`;
  } catch(error) { if(token===detailsRequest) $('#details').innerHTML=`<p class="error-box">${escape(error)}</p>`; }
}

async function preview(link: Link) {
  try {
    const result = await api<{path:string;line:number;lines:{number:number;text:string}[]}>('preview',{path:link.path,line:String(link.line??1)});
    previewPath=result.path;
    $('#preview-title').textContent=`${result.path}:${result.line}`;
    $('#preview-content').innerHTML=result.lines.map(l=>`<span class="preview-line ${l.number===result.line?'highlight':''}"><span class="line-no">${l.number}</span>${escape(l.text)}</span>`).join('');
    const dialog=$<HTMLDialogElement>('#preview'); if(!dialog.open) dialog.showModal();
    $('#preview-content .highlight')?.scrollIntoView({block:'center'});
  } catch(error) {toast(String(error));}
}

async function search() {
  const token=++searchRequest;
  const q=query();
  if (!q.q) {$('#search-results').hidden=true; return;}
  try {
    const results=await api<{total:number;items:FunctionRecord[]}>('search',q);
    if(token!==searchRequest)return;
    $('#search-results').hidden=false;
    $('#search-results').innerHTML=`<div class="search-caption">${number(results.total)}개 검색 결과 · 앞의 60개 표시 · 클릭하면 해당 함수로 이동</div>`+results.items.map(f=>`<button class="search-result" data-search-id="${escape(f.id)}" data-category="${escape(f.category)}" data-subgroup="${escape(f.subgroup)}" data-subsystem="${escape(f.subsystem)}" data-module="${escape(f.module)}"><span>${escape(f.name)}</span><small>${escape(f.id)} · ${escape(labels[mode][f[mode]])}</small></button>`).join('');
  }catch(error){toast(String(error));}
}

async function navigateToFunction(id:string) {
  const f=await api<FunctionRecord>('function',{id});
  scope=[];scopeNames=[];
  if(view==='module'){scope.push(['module',f.module]);scopeNames.push(f.module);}
  else{
    scope.push(['category',f.category],['subgroup',f.subgroup]);
    const g=groups()[f.subgroup];
    scopeNames.push(progress.categories.find(c=>c.id===f.category)?.name??f.category,g?`${f.subgroup} · ${g.name}`:f.subgroup);
    if(g){scope.push(['subsystem',f.subsystem]);scopeNames.push(f.subsystem);}
  }
  $('#search-results').hidden=true;
  await renderTree();await showFunction(id);
}

async function renderLedger() {
  const token=++ledgerRequest;
  try {
    const result=await api<{total:number;items:(Issue|Feature|Document)[]}>(ledger,{q:$<HTMLInputElement>('#ledger-search').value,offset:String(ledgerOffset)});
    if(token!==ledgerRequest)return;
    ledgerTotal=result.total;
    $('#ledger-count').textContent=`${number(result.total)} RECORDS`;
    $('#ledger-body').innerHTML=result.items.map(item=>{
      const encoded=escape(JSON.stringify({path:item.path,line:'line'in item?item.line:1}));
      if(ledger==='unresolved'){
        const u=item as Issue;
        return `<div class="ledger-row"><div><button data-ledger-preview="${encoded}" class="ledger-path">${escape(u.path)}:${u.line}</button></div><div><div class="ledger-heading">${escape(u.heading)}</div><p class="ledger-text">${escape(u.text)}</p></div><button data-ledger-preview="${encoded}">문서 보기 ↗</button></div>`;
      }
      if(ledger==='features'){
        const f=item as Feature;
        return `<div class="ledger-row"><div><span class="ledger-path">${escape(f.path||f.id)}</span>${badge(f.implementation,'implementation')}</div><div><div class="ledger-heading">${escape(f.name)} ${f.stub?'<span class="badge pending">스텁 표시</span>':''}</div><p class="ledger-text">${escape(f.exports.slice(0,12).join(', '))}<br>원본 함수 ${f.functions.length}개 연결 · 테스트 import ${f.tests.length}개 (통과 미확인) · ${escape(f.origin==='manual'?'수동 등록':'자동 발견 코드 단위')}${f.structure?`<br>실행 본문 ${f.structure.executable_members}개 / 빈 본문 ${f.structure.empty_members}개 / throw 전용 ${f.structure.throw_only_members}개`:''}${f.assessment?`<br>${escape(f.assessment.basis)} · 동작 동등성 미확인`:''}</p></div>${f.path?`<button data-ledger-preview="${encoded}">코드 보기 ↗</button>`:`<span>${badge(f.verification,'verification')}</span>`}</div>`;
      }
      const d=item as Document;
      return `<div class="ledger-row"><div><span class="ledger-path">${escape(d.path)}</span></div><div><div class="ledger-heading">${escape(d.title)}</div><p class="ledger-text">함수 ${d.functions.length}개 연결 · 미확정 ${d.unresolved.length}항목<br>${escape(d.summary)}</p></div><button data-ledger-preview="${encoded}">문서 보기 ↗</button></div>`;
    }).join('')||'<p class="list-empty">조건에 맞는 항목이 없습니다.</p>';
    $<HTMLButtonElement>('#ledger-prev').disabled=ledgerOffset===0;
    $<HTMLButtonElement>('#ledger-next').disabled=ledgerOffset+100>=ledgerTotal;
    $('#ledger-page').textContent=ledgerTotal?`${ledgerOffset+1}–${Math.min(ledgerOffset+100,ledgerTotal)} / ${number(ledgerTotal)}`:'0 / 0';
  }catch(error){$('#ledger-body').innerHTML=`<p class="error-box">${escape(error)}</p>`;}
}

async function refresh() {
  if(updating)return;updating=true;
  try {
    progress=await api<Progress>('progress');
    if(progress.labels){labels=progress.labels;renderModes();}
    if(progress.title){document.title=progress.title;$('#brand-name').textContent=progress.title;}
    renderProgress();await renderTree();await renderLedger();
    if(selectedId)await showFunction(selectedId);
  }catch(error){toast(String(error));}finally{updating=false;}
}

document.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;
  if(button.dataset.mode){mode=button.dataset.mode as Mode;renderModes();renderProgress();void renderTree();}
  if(button.dataset.category!=null && !button.dataset.searchId){category=button.dataset.category;scope=[];scopeNames=[];renderProgress();void renderTree();}
  if(button.dataset.depth){const depth=Number(button.dataset.depth);scope=scope.slice(0,depth);scopeNames=scopeNames.slice(0,depth);void renderTree();}
  if(button.dataset.preview!=null)void preview(links[Number(button.dataset.preview)]);
  if(button.dataset.function)void navigateToFunction(button.dataset.function);
  if(button.dataset.searchId)void navigateToFunction(button.dataset.searchId);
  if(button.dataset.ledger){ledger=button.dataset.ledger as typeof ledger;ledgerOffset=0;document.querySelectorAll('[data-ledger]').forEach(b=>b.classList.toggle('active',b===button));void renderLedger();}
  if(button.dataset.ledgerPreview)void preview(JSON.parse(button.dataset.ledgerPreview));
});
$('#home').addEventListener('click',()=>{scope=[];scopeNames=[];void renderTree();});
$('#breadcrumbs').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-depth="0"]');if(b){scope=[];scopeNames=[];void renderTree();}});
$('#refresh').addEventListener('click',()=>void refresh());
$('#view').addEventListener('change',()=>{view=$<HTMLSelectElement>('#view').value;scope=[];scopeNames=[];void renderTree();});
for(const selector of ['#state','#only-unresolved','#related-tags'])$(selector).addEventListener('change',()=>void renderTree());
$('#reset').addEventListener('click',()=>{category='';scope=[];scopeNames=[];$<HTMLSelectElement>('#state').value='';$<HTMLInputElement>('#search').value='';$<HTMLInputElement>('#only-unresolved').checked=false;$<HTMLInputElement>('#related-tags').checked=false;$('#search-results').hidden=true;renderProgress();void renderTree();});
let searchTimer=0;
$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>{void search();void renderTree();},300);});
document.addEventListener('click',event=>{if(!(event.target as HTMLElement).closest('.search-box,.search-results'))$('#search-results').hidden=true;});
document.addEventListener('keydown',event=>{if(event.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement).tagName)){event.preventDefault();$('#search').focus();}if(event.key==='Escape')$('#search-results').hidden=true;});
let ledgerTimer=0;
$('#ledger-search').addEventListener('input',()=>{clearTimeout(ledgerTimer);ledgerTimer=window.setTimeout(()=>{ledgerOffset=0;void renderLedger();},300);});
$('#ledger-prev').addEventListener('click',()=>{ledgerOffset=Math.max(0,ledgerOffset-100);void renderLedger();});
$('#ledger-next').addEventListener('click',()=>{ledgerOffset+=100;void renderLedger();});
$('#preview-close').addEventListener('click',()=>$<HTMLDialogElement>('#preview').close());
$('#preview-copy').addEventListener('click',()=>void navigator.clipboard.writeText(previewPath).then(()=>toast('파일 경로를 복사했습니다.')).catch(()=>toast('클립보드 접근 실패. 상단 경로를 선택해 복사하세요.')));

async function start() {
  renderModes();
  $<HTMLInputElement>('#search').value=params.get('q')??'';
  $<HTMLInputElement>('#only-unresolved').checked=params.get('unresolved')==='1';
  $<HTMLSelectElement>('#state').value=params.get('state')??'';
  await refresh();
  let failures=0;
  window.setInterval(async()=>{
    try{
      const status=await api<{version:string;scanning:boolean;watching:boolean;error:string|null}>('status');
      failures=0;
      $('#connection').classList.toggle('off',!!status.error);
      $('#connection').innerHTML=`<i></i> ${status.error?'스캔 오류':status.scanning?'변경 사항 스캔 중':status.watching?'LIVE · 자동 갱신':'고정 스냅샷'}`;
      $('#connection').title=status.error??'파일 변경 시 자동 갱신';
      if(progress && status.version!==progress.version){await refresh();toast('원본 자료 변경을 반영했습니다.');}
    }catch{
      failures++;if(failures>=2){$('#connection').classList.add('off');$('#connection').innerHTML='<i></i> 서버 연결 확인 필요';}
    }
  },3000);
}
void start();
