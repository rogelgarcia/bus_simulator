// Validate grass resource generation, dependency ownership and failure cleanup without a renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassDebugV2AssetPipeline } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2AssetPipeline.js';

test('Grass asset pipeline: dependent assets reuse the same leaf-derived resources', async () => {
    const generated = [], disposed = [];
    const item = (id, dependencies = []) => ({
        id, dependencies, parameters: { count: 1 },
        generate: async inputs => {
            generated.push(id);
            assert.deepEqual(Object.keys(inputs), dependencies);
            for (const dependency of dependencies) assert.equal(inputs[dependency], pipeline.get(dependency));
            return { id, dispose() { disposed.push(id); } };
        }
    });
    const pipeline = createGrassDebugV2AssetPipeline({
        sourceKey: 'leaf-v1',
        items: [item('patch', ['leaf']), item('top', ['patch']), item('ring', ['patch']), item('leaf')]
    });
    assert.throws(() => pipeline.get('patch'), /has not been built/);
    const result = await pipeline.buildAll(['top', 'ring']);
    assert.deepEqual(generated, ['leaf', 'patch', 'top', 'ring']);
    assert.equal(await pipeline.build('top'), result.top);
    assert.equal(pipeline.get('ring'), result.ring);
    assert.deepEqual(generated, ['leaf', 'patch', 'top', 'ring']);
    pipeline.dispose();
    pipeline.dispose();
    assert.deepEqual(disposed, ['ring', 'top', 'patch', 'leaf']);
    assert.ok(pipeline.getSnapshot().items.every(item => item.status === 'disposed'));
    await assert.rejects(pipeline.build('leaf'), /disposed/);
});

test('Grass asset pipeline: concurrent requests dedupe builds and serialize GPU generators', async () => {
    const generated = [];
    let active = 0, maximum = 0;
    const item = (id, dependencies = []) => ({
        id, dependencies,
        generate: async () => {
            active++;
            maximum = Math.max(maximum, active);
            await Promise.resolve();
            generated.push(id);
            active--;
            return { id };
        }
    });
    const pipeline = createGrassDebugV2AssetPipeline({
        items: [item('leaf'), item('top', ['leaf']), item('side', ['leaf'])]
    });
    const [top, duplicate, side, leaf] = await Promise.all([
        pipeline.build('top'), pipeline.build('top'), pipeline.build('side'), pipeline.build('leaf')
    ]);
    assert.equal(top, duplicate);
    assert.equal(side, pipeline.get('side'));
    assert.equal(leaf, pipeline.get('leaf'));
    assert.deepEqual(generated, ['leaf', 'top', 'side']);
    assert.equal(maximum, 1);
    pipeline.dispose();
});

test('Grass asset pipeline: invalid graphs fail before generating any resource', () => {
    let generated = 0;
    const generate = () => ++generated;
    const invalid = [
        [{ id: 'leaf', generate }, { id: 'leaf', generate }],
        [{ id: '', generate }],
        [{ id: 'patch', dependencies: ['absent'], generate }],
        [{ id: 'leaf', dependencies: ['leaf'], generate }],
        [{ id: 'leaf', dependencies: ['patch'], generate }, { id: 'patch', dependencies: ['leaf'], generate }],
        [{ id: 'leaf', generate }, { id: 'patch', dependencies: ['leaf', 'leaf'], generate }],
        [{ id: 'leaf', generate: null }]
    ];
    for (const items of invalid) assert.throws(() => createGrassDebugV2AssetPipeline({ items }), /Grass asset pipeline/);
    assert.equal(generated, 0);
});

test('Grass asset pipeline: unknown requests reject without poisoning valid builds', async () => {
    let generated = 0;
    const pipeline = createGrassDebugV2AssetPipeline({
        items: [{ id: 'leaf', generate: () => ++generated }]
    });
    assert.throws(() => pipeline.get('absent'), /unknown item absent/);
    await assert.rejects(pipeline.build('absent'), /unknown item absent/);
    await assert.rejects(pipeline.buildAll(['leaf', 'absent']), /unknown item absent/);
    assert.equal(generated, 0);
    const all = await pipeline.buildAll();
    assert.equal(all.leaf, 1);
    assert.equal(pipeline.get('leaf'), 1);
    pipeline.dispose();
});

test('Grass asset pipeline: snapshots isolate configuration from input and output mutation', async () => {
    const parameters = { capture: { angles: [30, 210] }, enabled: true };
    const dependencies = ['leaf'];
    const items = [
        { id: 'leaf', generate: () => ({}) },
        { id: 'patch', dependencies, parameters, generate: () => ({}) }
    ];
    const pipeline = createGrassDebugV2AssetPipeline({ sourceKey: 'leaf-v2', items });
    parameters.capture.angles[0] = 99;
    dependencies.push('absent');
    items[1].generate = () => { throw new Error('mutated generator'); };
    const first = pipeline.getSnapshot();
    first.items[1].parameters.capture.angles.push(999);
    first.items[1].dependencies.push('other');
    first.items[1].status = 'ready';
    const second = pipeline.getSnapshot();
    assert.equal(second.sourceKey, 'leaf-v2');
    assert.deepEqual(second.items[1], {
        id: 'patch', dependencies: ['leaf'], parameters: { capture: { angles: [30, 210] }, enabled: true }, status: 'pending'
    });
    await pipeline.build('patch');
    assert.equal(pipeline.getSnapshot().items[1].status, 'ready');
    pipeline.dispose();
});

test('Grass asset pipeline: configuration rejects nonserializable or lossy values', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    for (const parameters of [NaN, Infinity, { value: undefined }, { value: () => 1 }, { value: 1n }, cyclic, new Date()]) {
        assert.throws(() => createGrassDebugV2AssetPipeline({
            items: [{ id: 'leaf', parameters, generate: () => ({}) }]
        }), /JSON data/);
    }
});

test('Grass asset pipeline: failed generation cleans completed resources and prevents reuse', async () => {
    const disposed = [], generated = [], original = new Error('capture failed');
    const pipeline = createGrassDebugV2AssetPipeline({ items: [
        { id: 'leaf', generate: () => ({ dispose: () => disposed.push('leaf') }) },
        { id: 'patch', dependencies: ['leaf'], generate: () => ({ dispose: () => disposed.push('patch') }) },
        { id: 'bake', dependencies: ['patch'], generate: async () => { throw original; } },
        { id: 'later', generate: () => generated.push('later') }
    ] });
    const [failed, queued] = await Promise.allSettled([pipeline.build('bake'), pipeline.build('later')]);
    assert.equal(failed.status, 'rejected');
    assert.equal(failed.reason, original);
    assert.equal(queued.status, 'rejected');
    assert.match(queued.reason.message, /failed/);
    assert.deepEqual(disposed, ['patch', 'leaf']);
    assert.deepEqual(generated, []);
    assert.equal(pipeline.getSnapshot().items[2].status, 'failed');
    assert.throws(() => pipeline.get('leaf'), /failed/);
    await assert.rejects(pipeline.build('patch'), /failed/);
    pipeline.dispose();
    pipeline.dispose();
    assert.deepEqual(disposed, ['patch', 'leaf']);
});

test('Grass asset pipeline: borrowed descriptors use explicit non-owning disposal', async () => {
    let borrowedDisposals = 0, ownedDisposals = 0;
    const borrowed = { dispose: () => borrowedDisposals++ };
    const pipeline = createGrassDebugV2AssetPipeline({ items: [
        { id: 'leaf', generate: () => borrowed, dispose: () => {} },
        { id: 'patch', dependencies: ['leaf'], generate: () => ({ dispose: () => ownedDisposals++ }) }
    ] });
    await pipeline.buildAll();
    pipeline.dispose();
    assert.equal(borrowedDisposals, 0);
    assert.equal(ownedDisposals, 1);
});

test('Grass asset pipeline: disposal during generation cleans late resources exactly once', async () => {
    let finish, began, disposals = 0;
    const started = new Promise(resolve => { began = resolve; });
    const waiting = new Promise(resolve => { finish = resolve; });
    const pipeline = createGrassDebugV2AssetPipeline({ items: [{
        id: 'capture',
        generate: async () => { began(); await waiting; return { dispose: () => disposals++ }; }
    }] });
    const pending = pipeline.build('capture');
    await started;
    pipeline.dispose();
    finish();
    await assert.rejects(pending, /disposed/);
    pipeline.dispose();
    assert.equal(disposals, 1);
    assert.equal(pipeline.getSnapshot().items[0].status, 'disposed');
});

test('Grass asset pipeline: cleanup continues after disposal errors without retrying resources', async () => {
    const disposed = [];
    const pipeline = createGrassDebugV2AssetPipeline({ items: ['leaf', 'patch', 'capture'].map(id => ({
        id,
        generate: () => ({ dispose() {
            disposed.push(id);
            if (id === 'patch') throw new Error('disposal failed');
        } })
    })) });
    await pipeline.buildAll();
    assert.throws(() => pipeline.dispose(), AggregateError);
    pipeline.dispose();
    assert.deepEqual(disposed, ['capture', 'patch', 'leaf']);
});
