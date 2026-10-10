import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { SceneSequence, SCENE_DT, type SceneLifecycle } from '@game/lib/scene';
import { SceneHost, type SceneContext } from '@app/flow/scenes';
import { WorkModule, type MgResultEntry } from '@app/common/work';
import { commitMinigameResult, minigameReturn } from '@app/minigame/frame/return';

let count = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run(); count++; console.log(`PASS ${name}`);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function advance(sequence: SceneSequence<string>, ticks = 6): void { for (let i = 0; i < ticks; i++) sequence.tick(); }
const result = (id = 7): MgResultEntry => ({ id, judge: 1, results: [1, 0, 2, 255] });

await test('lifecycle order, f32 dt and first update after synced setup', () => {
  const trace: string[] = [];
  const sequence = new SceneSequence({ has: () => true, create: (): SceneLifecycle => ({
    onEntry: () => { trace.push('entry'); }, begin: () => { trace.push('begin'); },
    onLoaded: () => { trace.push('loaded'); return true; }, onLoadComplete: () => { trace.push('complete'); },
    setup: () => { trace.push('setup'); }, syncedSetup: () => { trace.push('synced'); },
    update: dt => { assert.equal(dt, Math.fround(1 / 60)); trace.push('update'); },
  }) });
  sequence.start('a'); advance(sequence, 5);
  assert.deepEqual(trace, ['entry', 'begin', 'loaded', 'complete', 'setup', 'synced']);
  sequence.tick(); assert.equal(trace.at(-1), 'update'); assert.equal(SCENE_DT, Math.fround(1 / 60));
});

await test('closed gate freezes pending requests and every lifecycle phase', () => {
  let calls = 0;
  const sequence = new SceneSequence({ has: () => true, create: () => { calls++; return {}; } });
  sequence.start('a'); for (let i = 0; i < 10; i++) sequence.tick(false);
  assert.equal(calls, 0); assert.equal(sequence.current, null);
  for (let i = 0; i < 6; i++) {
    sequence.tick(); const phase = sequence.phase;
    sequence.tick(false); assert.equal(sequence.phase, phase);
  }
  sequence.call('b'); sequence.tick(false); assert.equal(sequence.current, 'a');
});

await test('loader and sync gates are polled without duplicate setup', () => {
  let loaded = false, synced = false, setup = 0, complete = 0;
  const sequence = new SceneSequence({ has: () => true, create: () => ({
    onLoaded: () => loaded, isSynced: () => synced,
    setup: () => { setup++; }, onLoadComplete: () => { complete++; },
  }) });
  sequence.start('a'); advance(sequence, 10);
  assert.equal(sequence.phase, 'loading'); assert.equal(complete, 0);
  loaded = true; advance(sequence, 6);
  assert.equal(sequence.phase, 'sync'); assert.equal(setup, 1); assert.equal(complete, 1);
  synced = true; sequence.tick(); assert.equal(sequence.phase, 'active');
});

await test('update requests wait until next tick, cleanup completes before child entry', () => {
  const trace: string[] = []; let cleanupReady = false, requested = false;
  const sequence = new SceneSequence({ has: () => true, create: (id, scenes) => ({
    onEntry: () => { trace.push(`${id}:entry`); },
    update: () => { if (!requested) { requested = true; scenes.call('b'); } },
    cleanup: () => { trace.push(`${id}:cleanup`); },
    isCleanupComplete: () => cleanupReady, dispose: () => { trace.push(`${id}:dispose`); },
  }) });
  sequence.start('a'); advance(sequence);
  assert.equal(sequence.phase, 'active'); assert.deepEqual(trace, ['a:entry']);
  sequence.tick(); assert.equal(sequence.phase, 'cleanup');
  advance(sequence, 5); assert.deepEqual(trace, ['a:entry', 'a:cleanup']);
  cleanupReady = true; sequence.tick();
  assert.deepEqual(trace, ['a:entry', 'a:cleanup', 'a:dispose', 'b:entry']);
});

await test('call and return keep names and recreate the parent object', () => {
  const made: object[] = []; const reasons: string[] = []; let disposed = 0;
  const sequence = new SceneSequence({ has: () => true, create: (_id, _scenes, reason) => {
    const object = { dispose: () => { disposed++; } }; made.push(object); reasons.push(reason); return object;
  } });
  sequence.start('a'); advance(sequence); const parent = sequence.scene;
  sequence.call('b'); advance(sequence); assert.deepEqual(sequence.names, ['a', 'b']);
  sequence.return(); advance(sequence); assert.deepEqual(sequence.names, ['a']);
  assert.notEqual(sequence.scene, parent); assert.equal(disposed, 2);
  assert.deepEqual(reasons, ['entry', 'entry', 'return']); assert.equal(made.length, 3);
});

await test('change replaces only the current name and pending requests use last write', () => {
  const sequence = new SceneSequence({ has: () => true, create: () => ({}) });
  sequence.start('a'); advance(sequence); sequence.call('b'); advance(sequence);
  sequence.call('ignored'); sequence.change('c'); advance(sequence);
  assert.deepEqual(sequence.names, ['a', 'c']); sequence.return(); advance(sequence);
  assert.equal(sequence.current, 'a');
});

await test('unknown IDs preserve the active scene; root return notifies once', () => {
  let empty = 0;
  const sequence = new SceneSequence({ has: id => id === 'a', create: () => ({}), onEmpty: () => { empty++; } });
  assert.throws(() => sequence.start('missing')); assert.equal(sequence.return(), false);
  sequence.start('a'); advance(sequence); assert.equal(sequence.call('missing'), false);
  assert.equal(sequence.change('missing'), false); sequence.tick(); assert.equal(sequence.current, 'a');
  sequence.return(); advance(sequence); assert.equal(empty, 1); assert.equal(sequence.depth, 0);
  assert.equal(sequence.return(), false); sequence.tick(); assert.equal(empty, 1);
});

await test('dispose cleans once and blocks subsequent transitions', () => {
  let cleanup = 0, disposed = 0;
  const sequence = new SceneSequence({ has: () => true, create: () => ({ cleanup: () => { cleanup++; }, dispose: () => { disposed++; } }) });
  sequence.start('a'); advance(sequence); sequence.dispose(); sequence.dispose(); sequence.tick();
  assert.deepEqual([cleanup, disposed, sequence.depth], [1, 1, 0]); assert.equal(sequence.call('b'), false);
});

await test('factory and update errors are observable and release owned scenes', () => {
  let cleanup = 0, disposed = 0; const errors: unknown[] = [];
  const boom = new Error('fixture update');
  const sequence = new SceneSequence({ has: () => true, create: () => ({
    update: () => { throw boom; }, cleanup: () => { cleanup++; }, dispose: () => { disposed++; },
  }), onError: error => { errors.push(error); } });
  sequence.start('a'); advance(sequence); assert.equal(sequence.phase, 'failed');
  assert.deepEqual([cleanup, disposed], [1, 1]); assert.equal(sequence.error, boom); assert.deepEqual(errors, [boom]);
  const other = new SceneSequence({ has: () => true, create: () => { throw boom; } });
  other.start('a'); other.tick(); assert.equal(other.phase, 'failed'); assert.equal(other.scene, null);
});

await test('app scope cancels old commands and waits for asynchronous resources', async () => {
  const job = deferred<void>(); let old!: SceneContext<'a' | 'b'>; let disposed = 0, bEntries = 0;
  const host = new SceneHost({
    a: context => { old = context; return { begin: () => { context.scope.track(job.promise); }, dispose: () => { disposed++; } }; },
    b: () => ({ onEntry: () => { bEntries++; } }),
  });
  host.start('a'); advance(host.sequence); old.scenes.call('b'); host.step();
  assert.equal(old.scope.signal.aborted, true); assert.equal(old.scenes.change('a'), false);
  advance(host.sequence); assert.deepEqual([disposed, bEntries], [0, 0]);
  job.resolve(); await flush(); host.step(); assert.deepEqual([disposed, bEntries], [1, 1]);
});

await test('stopping an app scope defers resource disposal until late completion', async () => {
  const job = deferred<void>(); let disposed = 0;
  const host = new SceneHost({ a: ({ scope }) => ({ begin: () => { scope.track(job.promise); }, dispose: () => { disposed++; } }) });
  host.start('a'); advance(host.sequence); host.dispose(); assert.equal(disposed, 0);
  job.resolve(); await flush(); assert.equal(disposed, 1); host.dispose(); assert.equal(disposed, 1);
});

await test('Work request and player snapshots do not share mutable caller data', () => {
  const work = new WorkModule<{ id: number; options: number[] }>();
  const request = { id: 7, options: [2] }; work.prepare(request); request.options[0] = 9;
  const read = work.request!; read.options[0] = 5; assert.deepEqual(work.request, { id: 7, options: [2] });
  const players = [{ playerId: 0, chara: 'pc01', isCom: false, comLevel: 2, teamId: 0, gamePlay: true }];
  work.setPlayers(players); players[0].chara = 'pc02'; assert.equal(work.player[0].chara, 'pc01');
});

await test('one frame owns result commit; raw bytes and result facade are preserved', () => {
  const work = new WorkModule<{ id: number }>(); work.prepare({ id: 7 }); const frame = work.openFrame();
  assert.throws(() => work.openFrame()); const entry = result(); assert.equal(frame.commit(entry), true);
  assert.equal(frame.commit(entry), false); assert.equal(frame.cancel(), false); assert.equal(frame.fail(), false);
  entry.results[0] = 9; assert.deepEqual(work.mode.results[0].results, [1, 0, 2, 255]);
  const view = work.game.result!; view.results[0] = 4; assert.deepEqual(work.mode.results[0].results, [1, 0, 2, 255]);
  assert.deepEqual([work.mode.round, work.mode.results.length, work.status], [1, 1, 'completed']);
});

await test('old or cancelled frame ports cannot write into a new run', () => {
  const work = new WorkModule<{ id: number }>(); work.prepare({ id: 7 }); const old = work.openFrame();
  work.prepare({ id: 8 }); const current = work.openFrame(); assert.equal(old.commit(result()), false);
  assert.equal(current.cancel(), true); assert.equal(current.commit(result(8)), false);
  assert.deepEqual([work.mode.round, work.mode.results.length, work.status], [0, 0, 'cancelled']);
});

await test('invalid result leaves Round and ring untouched', () => {
  const work = new WorkModule<{ id: number }>(); work.prepare({ id: 7 }); const frame = work.openFrame();
  assert.throws(() => frame.commit(result(8)));
  assert.throws(() => frame.commit({ ...result(), results: [1, 0, 0, 256] }));
  assert.deepEqual([work.mode.round, work.mode.results.length], [0, 0]);
  assert.equal(frame.fail(), true); assert.equal(work.status, 'failed');
});

await test('frame result adapter ignores running, missing and quit results', () => {
  for (const state of ['running', 'missing', 'quit'] as const) {
    const work = new WorkModule<{ id: number }>(); work.prepare({ id: 7 }); const frame = work.openFrame();
    let extracted = 0;
    assert.equal(commitMinigameResult({ ended: state !== 'running', logic: { result: state === 'missing' ? null : { quit: state === 'quit' } },
      resultEntry: () => { extracted++; return result(); },
    }, 7, frame), null);
    assert.deepEqual([work.mode.round, work.mode.results.length, extracted], [0, 0, 0]);
    assert.equal(work.status, state === 'running' ? 'requested' : 'cancelled');
  }
});

await test('a completed frame skips the bridge result and Save callback', async () => {
  const work = new WorkModule<{ id: number }>(); work.prepare({ id: 7 }); const frame = work.openFrame();
  let completions = 0;
  const host = new SceneHost({ a: ({ scope, scenes }) => minigameReturn({ frame, scope,
    play: async () => { frame.commit(result()); return result(); },
    complete: entry => { completions++; return entry; }, return: () => { scenes.return(); },
  }) });
  host.start('a'); advance(host.sequence); await flush(); advance(host.sequence);
  assert.deepEqual([completions, work.mode.round, work.mode.results.length], [0, 1, 1]);
});

await test('restore failure blocks parent entry and becomes an observable scene error', async () => {
  const work = new WorkModule<{ id: number }>(); work.prepare({ id: 7 }); let parents = 0; const errors: unknown[] = [];
  const host = new SceneHost({
    mode: () => ({ onEntry: () => { parents++; } }),
    game: ({ scope, scenes }) => minigameReturn({ frame: work.openFrame(), scope,
      play: async () => result(), return: () => { scenes.return(); }, restore: async () => { throw new Error('fixture restore failed'); },
    }),
  }, { onError: error => { errors.push(error); } });
  host.start('mode'); advance(host.sequence); host.sequence.call('game'); advance(host.sequence); await flush();
  advance(host.sequence); await flush(); advance(host.sequence);
  assert.equal(parents, 1); assert.equal(host.sequence.phase, 'failed'); assert.equal(errors.length, 1);
});

await test('105 games keep the last 100 mode results and one Round count', () => {
  const work = new WorkModule<{ id: number }>();
  for (let id = 0; id < 105; id++) { work.prepare({ id }); work.openFrame().commit(result(id)); }
  assert.deepEqual([work.mode.round, work.mode.results.length, work.mode.results[0].id, work.mode.results.at(-1)!.id], [105, 100, 5, 104]);
});

await test('explicit mode entry resets mode state without replacing its backing object', () => {
  const work = new WorkModule<{ id: number }>(); const mode = work.mode;
  work.prepare({ id: 7 }); const old = work.openFrame(); work.beginMode();
  assert.equal(work.mode, mode); assert.equal(old.commit(result()), false);
  assert.deepEqual([mode.round, mode.results.length, work.status], [0, 0, 'idle']);
});

async function bridgeCase(kind: 'success' | 'null' | 'error' | 'cancel' | 'precommitted') {
  const work = new WorkModule<{ id: number }>(); const game = deferred<MgResultEntry | null>();
  const restore = deferred<void>(); let calls = 0, restored = 0, disposed = 0;
  let parentCommands!: SceneContext<'mode' | 'game'>['scenes'];
  const parents: object[] = []; const errors: unknown[] = [];
  const host = new SceneHost({
    mode: ({ scenes }) => { parentCommands = scenes; const object = { cleanup: () => { disposed++; } }; parents.push(object); return object; },
    game: ({ scope, scenes }) => {
      const frame = work.openFrame();
      return minigameReturn({ frame, scope,
        play: async signal => { calls++; assert.equal(signal.aborted, false); if (kind === 'precommitted') frame.commit(result()); return game.promise; },
        return: () => { scenes.return(); }, restore: () => { restored++; return restore.promise; },
        onError: error => { errors.push(error); },
      });
    },
  });
  host.start('mode'); advance(host.sequence); work.prepare({ id: 7 }); parentCommands.call('game');
  advance(host.sequence); await flush(); assert.equal(calls, 1); assert.equal(disposed, 1);
  if (kind === 'cancel') host.dispose();
  if (kind === 'error') game.reject(new Error('fixture loading failed'));
  else game.resolve(kind === 'null' ? null : result());
  await flush(); const roundBeforeTick = kind === 'precommitted' ? 1 : 0;
  host.step(false); assert.equal(work.mode.round, roundBeforeTick);
  advance(host.sequence); await flush();
  if (kind !== 'cancel') { assert.equal(host.sequence.phase, 'cleanup'); assert.equal(parents.length, 1); }
  assert.equal(restored, 1); restore.resolve(); await flush(); advance(host.sequence);
  const success = kind === 'success' || kind === 'precommitted';
  assert.deepEqual([work.mode.round, work.mode.results.length], success ? [1, 1] : [0, 0]);
  if (kind === 'error') assert.equal(errors.length, 1);
  if (kind !== 'cancel') { assert.equal(parents.length, 2); assert.notEqual(parents[0], parents[1]); }
  else assert.equal(host.sequence.phase, 'disposed');
}
for (const kind of ['success', 'null', 'error', 'cancel', 'precommitted'] as const) {
  await test(`minigame bridge ${kind}: fixed-tick result, cleanup wait, parent reconstruction`, () => bridgeCase(kind));
}

await test('same requests, gates and ready ticks produce the same lifecycle and Work hash', () => {
  const replay = (): string => {
    const work = new WorkModule<{ id: number }>(); const trace: unknown[] = [];
    const sequence = new SceneSequence({ has: () => true, create: (id, _scenes, reason) => ({
      onEntry: () => { trace.push([id, reason]); }, update: dt => { trace.push([id, dt, work.mode.round]); },
    }) });
    sequence.start('mode');
    for (let tick = 0; tick < 45; tick++) {
      if (tick === 10) { work.prepare({ id: 7 }); sequence.call('game'); }
      if (tick === 25) { work.openFrame().commit(result()); sequence.return(); }
      sequence.tick(tick % 4 !== 0); trace.push([sequence.phase, sequence.names]);
    }
    return createHash('sha256').update(JSON.stringify([trace, work.mode.round, work.mode.results])).digest('hex');
  };
  assert.equal(replay(), replay());
});

await test('scene core imports nothing and Work/frame/adapter boundaries are explicit', () => {
  const source = readFileSync(resolve('script/game/lib/scene/index.ts'), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|Math\.random|Date\.now|performance\.now|AbortSignal|Promise|\bwindow\b|\bdocument\b/);
  for (const file of readdirSync(resolve('script/app/common/work')).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(join('script/app/common/work', file), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.ok(match[1].startsWith('./'), match[1]);
  }
  const freeplay = readFileSync(resolve('script/app/scene/mode/freeplay/scene.ts'), 'utf8');
  assert.doesNotMatch(freeplay, /pushResult|work\.round\s*\+=|returned\??:/);
  const host = readFileSync(resolve('script/app/flow/host.ts'), 'utf8');
  assert.match(host, /commitMinigameResult\(run, returnFrame\.id, returnFrame\)/);
});
console.log(`scene and Work: ${count}/${count}`);
