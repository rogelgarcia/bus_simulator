// Exercises stale worker events, cancellation, priority and disposal without a browser or GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeWorkerPool } from '../../../src/graphics/engine3d/landscape/LandscapeWorkerPool.js';

function setup(t, size = 2) {
    const original = globalThis.Worker;
    const workers = [];
    globalThis.Worker = class {
        constructor() { this.messages = []; this.terminated = false; workers.push(this); }
        postMessage(message) { this.messages.push(message); }
        terminate() { this.terminated = true; }
        complete(value = {}) { this.onmessage({ data: { id: this.messages.at(-1).id, ...value } }); }
        fail(message) { this.onerror({ message }); }
    };
    const pool = new LandscapeWorkerPool({ manifest: {}, manifestUrl: 'http://fixture/manifest.json', root: {}, size });
    t.after(() => { pool.dispose(); globalThis.Worker = original; });
    return { pool, workers };
}

test('Landscape workers: concurrency stays bounded and queued jobs run in priority order', async t => {
    const { pool, workers } = setup(t);
    const first = pool.request({ chunkId: 'first' });
    const second = pool.request({ chunkId: 'second' });
    const third = pool.request({ chunkId: 'third' }, { priority: 1 });
    const important = pool.request({ chunkId: 'query' }, { priority: 100 });
    assert.equal(workers.length, 2);
    assert.deepEqual(pool.snapshot(), { active: 2, queued: 2, completed: 0, canceled: 0, workers: 2 });
    workers[0].complete();
    assert.equal(workers[0].messages.at(-1).chunkId, 'query');
    workers[1].complete();
    assert.equal(workers[1].messages.at(-1).chunkId, 'third');
    workers[0].complete();
    workers[1].complete();
    await Promise.all([first, second, third, important]);
    assert.equal(pool.snapshot().completed, 4);
});

test('Landscape workers: canceling queued work prevents dispatch and aborting active work terminates its worker', async t => {
    const { pool, workers } = setup(t, 1);
    const activeAbort = new AbortController();
    const queuedAbort = new AbortController();
    const active = pool.request({ chunkId: 'active' }, { signal: activeAbort.signal }).catch(error => error.name);
    const queued = pool.request({ chunkId: 'queued' }, { signal: queuedAbort.signal }).catch(error => error.name);
    queuedAbort.abort();
    activeAbort.abort();
    assert.equal(await active, 'AbortError');
    assert.equal(await queued, 'AbortError');
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, true);
    assert.equal(pool.snapshot().active, 0);
    assert.equal(pool.snapshot().queued, 0);
    assert.equal(pool.snapshot().canceled, 2);
});

test('Landscape workers: late failure from a terminated worker cannot reject the replacement request', async t => {
    const { pool, workers } = setup(t, 1);
    const abort = new AbortController();
    const canceled = pool.request({ chunkId: 'old-revision' }, { signal: abort.signal }).catch(error => error.name);
    abort.abort();
    await canceled;
    const replacement = pool.request({ chunkId: 'current-revision' }).catch(error => ({ error: error.message }));
    const activeId = workers[1].messages.at(-1).id;
    workers[0].fail('late obsolete failure');
    workers[0].onmessage({ data: { id: 1, obsolete: true } });
    workers[1].complete({ accepted: 'current-revision' });
    assert.deepEqual(await replacement, { id: activeId, accepted: 'current-revision' });
    assert.equal(workers[1].terminated, false);
    assert.equal(pool.snapshot().active, 0);
});

test('Landscape workers: disposal terminates active work, rejects queued jobs and releases context', async t => {
    const { pool, workers } = setup(t, 1);
    const jobs = [pool.request({ chunkId: 'active' }), pool.request({ chunkId: 'queued' })].map(promise => promise.catch(error => error.name));
    pool.dispose();
    assert.deepEqual(await Promise.all(jobs), ['AbortError', 'AbortError']);
    assert.equal(workers[0].terminated, true);
    assert.equal(pool.snapshot().workers, 0);
    assert.equal(pool.context, null);
    await assert.rejects(pool.request({ chunkId: 'after-dispose' }), { name: 'AbortError' });
});
