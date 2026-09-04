// Verifies AI 531 frame and City shadow-refresh lifecycle symmetry with source-level mocks.
// @ts-check

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';

const gameEngineUrl = new URL('../../../src/app/core/GameEngine.js?lifecycle-mock', import.meta.url);
const cityUrl = new URL('../../../src/graphics/visuals/city/City.js?lifecycle-mock', import.meta.url);
const gameEngineSource = readFileSync(new URL('../../../src/app/core/GameEngine.js', import.meta.url), 'utf8');
const citySource = readFileSync(new URL('../../../src/graphics/visuals/city/City.js', import.meta.url), 'utf8');
const dependencyNames = collectNamedImports(gameEngineSource + '\n' + citySource);
const dependencyStubUrl = sourceDataUrl(createDependencyStub(dependencyNames));
const threeStubUrl = sourceDataUrl(`
    export const DoubleSide = 2;
    export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
    export class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
    export class Matrix4 {}
`);
const moduleHooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? '';
        const isLifecycleTarget = parent.startsWith(gameEngineUrl.href)
            || parent.startsWith(cityUrl.href);
        if (isLifecycleTarget && specifier === 'three') {
            return {url: threeStubUrl, shortCircuit: true};
        }
        if (isLifecycleTarget && specifier.startsWith('.')) {
            return {url: dependencyStubUrl, shortCircuit: true};
        }
        return nextResolve(specifier, context);
    }
});
const {GameEngine} = await import(gameEngineUrl.href);
const {City} = await import(cityUrl.href);
moduleHooks.deregister();

test('updateFrame calls one captured pipeline exactly once around renderer and post paths', () => {
    for (const usePost of [false, true]) {
        const events = [];
        const pipeline = lifecyclePipeline(events);
        const engine = makeEngine(events, pipeline, {usePost});
        engine.updateFrame(0.25, {render: true, nowMs: 123, rawDt: 0.5});
        assert.deepEqual(events, [
            'begin:123',
            'staticAo',
            'busShadow',
            'gpuBegin',
            'shadow:123',
            usePost ? 'postRender:0.25' : 'rendererRender',
            'gpuEnd',
            'gpuPoll',
            'end:123'
        ]);
    }
});

test('renderFrame calls one captured pipeline exactly once and reuses one timestamp', () => {
    for (const usePost of [false, true]) {
        const events = [];
        const pipeline = lifecyclePipeline(events);
        const engine = makeEngine(events, pipeline, {usePost});
        engine.renderFrame();
        assert.equal(events.filter((entry) => entry.startsWith('begin:')).length, 1);
        assert.equal(events.filter((entry) => entry.startsWith('shadow:')).length, 1);
        assert.equal(events.filter((entry) => entry.startsWith('end:')).length, 1);
        const timestamp = events[0].slice('begin:'.length);
        assert.equal(events[1], 'shadow:' + timestamp);
        assert.equal(events[3], 'end:' + timestamp);
        assert.equal(events[2], usePost ? 'postRender:undefined' : 'rendererRender');
    }
});

test('both render APIs call frameEnd when setup, shadow, rendering, or timer cleanup throws', () => {
    for (const phase of ['begin', 'staticAo', 'shadow', 'render', 'gpuEnd', 'gpuPoll']) {
        const events = [];
        const pipeline = lifecyclePipeline(events, phase);
        const engine = makeEngine(events, pipeline, {
            throwStaticAo: phase === 'staticAo',
            throwRender: phase === 'render',
            throwGpuEnd: phase === 'gpuEnd',
            throwGpuPoll: phase === 'gpuPoll'
        });
        assert.throws(
            () => engine.updateFrame(0.1, {render: true, nowMs: 10}),
            new RegExp(phase)
        );
        assert.equal(events.filter((entry) => entry === 'end:10').length, 1, phase);
    }

    for (const phase of ['begin', 'shadow', 'render']) {
        const events = [];
        const pipeline = lifecyclePipeline(events, phase);
        const engine = makeEngine(events, pipeline, {throwRender: phase === 'render'});
        assert.throws(() => engine.renderFrame(), new RegExp(phase));
        assert.equal(events.filter((entry) => entry.startsWith('end:')).length, 1, phase);
    }
});

test('pipeline replacement and removal transfer ownership before assignment', () => {
    const events = [];
    const engine = makeEngine(events, null);
    const original = lifecyclePipeline(events, null, 'old');
    const replacement = lifecyclePipeline(events, null, 'new');

    assert.equal(engine.installIlluminationPipeline(original), null);
    assert.equal(engine.getIlluminationPipeline(), original);
    assert.equal(engine.installIlluminationPipeline(original), original);
    assert.deepEqual(events, []);

    const originalUninstall = original.uninstall;
    original.uninstall = (reason) => {
        assert.equal(engine.getIlluminationPipeline(), original);
        originalUninstall(reason);
    };
    assert.equal(engine.installIlluminationPipeline(replacement), original);
    assert.equal(engine.getIlluminationPipeline(), replacement);
    assert.deepEqual(events, ['old:uninstall:pipeline_replaced']);

    const replacementUninstall = replacement.uninstall;
    replacement.uninstall = (reason) => {
        assert.equal(engine.getIlluminationPipeline(), replacement);
        replacementUninstall(reason);
    };
    assert.equal(engine.installIlluminationPipeline(null), replacement);
    assert.equal(engine.getIlluminationPipeline(), null);
    assert.deepEqual(events, [
        'old:uninstall:pipeline_replaced',
        'new:uninstall:pipeline_removed'
    ]);
    assert.equal(engine.installIlluminationPipeline(undefined), null);
});

test('generic engine registry transfers two moving objects to one illumination pipeline', () => {
    const events = [];
    const engine = makeEngine(events, null);
    const rootA = { isObject3D: true };
    const rootB = { isObject3D: true };
    const registeredShadowRoots = [];
    const unregisteredShadowRoots = [];
    engine._contextProxy = {city: {
        registerShadowReceivers: (root) => registeredShadowRoots.push(root),
        unregisterShadowReceivers: (root) => unregisteredShadowRoots.push(root)
    }};
    const handleB = engine.registerDynamicIlluminationObject({
        id: 'vehicle.b',
        root: rootB,
        cast: true,
        receive: true
    });
    const handleA = engine.registerDynamicIlluminationObject({
        id: 'vehicle.a',
        root: rootA,
        cast: true,
        receive: true
    });
    assert.deepEqual(
        engine.getDynamicIlluminationObjects().map((entry) => entry.id),
        ['vehicle.a', 'vehicle.b']
    );
    assert.deepEqual(registeredShadowRoots, [rootB, rootA]);

    const pipeline = lifecyclePipeline(events, null, 'hybrid');
    pipeline.registerDynamicShadowObject = (record) => {
        events.push('bind:' + record.id);
        return { unregister: () => events.push('unbind:' + record.id) };
    };
    engine.installIlluminationPipeline(pipeline);
    assert.deepEqual(events, ['bind:vehicle.a', 'bind:vehicle.b']);

    assert.equal(handleA.unregister(), true);
    assert.equal(handleA.unregister(), false);
    assert.equal(handleB.unregister(), true);
    assert.deepEqual(events, [
        'bind:vehicle.a',
        'bind:vehicle.b',
        'unbind:vehicle.a',
        'unbind:vehicle.b'
    ]);
    assert.deepEqual(engine.getDynamicIlluminationObjects(), []);
    assert.deepEqual(unregisteredShadowRoots, [rootA, rootB]);
});

test('invalid replacement or failed uninstall preserves the installed owner', () => {
    const events = [];
    const original = lifecyclePipeline(events, 'uninstall', 'old');
    const replacement = lifecyclePipeline(events, null, 'new');
    const engine = makeEngine(events, original);
    const incomplete = {
        frameBegin() {},
        shadowPrepare() {},
        frameEnd() {}
    };

    assert.throws(
        () => engine.installIlluminationPipeline(incomplete),
        /frameBegin, shadowPrepare, frameEnd, and uninstall/
    );
    assert.equal(engine.getIlluminationPipeline(), original);
    assert.deepEqual(events, []);
    assert.equal(engine.installIlluminationPipeline(original), original);
    assert.deepEqual(events, []);

    assert.throws(
        () => engine.installIlluminationPipeline(replacement),
        /uninstall failed/
    );
    assert.equal(engine.getIlluminationPipeline(), original);
    assert.deepEqual(events, ['old:uninstall:pipeline_replaced']);

    events.length = 0;
    assert.throws(
        () => engine.installIlluminationPipeline(null),
        /uninstall failed/
    );
    assert.equal(engine.getIlluminationPipeline(), original);
    assert.deepEqual(events, ['old:uninstall:pipeline_removed']);
});

test('mid-frame installation cannot split begin/end across different pipelines', () => {
    const events = [];
    const replacement = lifecyclePipeline(events, null, 'new');
    const original = lifecyclePipeline(events, null, 'old');
    const engine = makeEngine(events, original);
    original.frameBegin = (context) => {
        events.push('old:begin:' + context.nowMs);
        engine.installIlluminationPipeline(replacement);
    };

    engine.updateFrame(0.1, {render: true, nowMs: 44});
    assert.deepEqual(events.filter((entry) => entry.startsWith('old:')), [
        'old:begin:44',
        'old:uninstall:pipeline_replaced',
        'old:shadow:44',
        'old:end:44'
    ]);
    assert.equal(events.some((entry) => entry.startsWith('new:')), false);

    engine.updateFrame(0.1, {render: true, nowMs: 45});
    assert.deepEqual(events.filter((entry) => entry.startsWith('new:')), [
        'new:begin:45',
        'new:shadow:45',
        'new:end:45'
    ]);
});

test('installed-null current rendering has no illumination asset dependency', () => {
    assert.doesNotMatch(gameEngineSource, /StaticSunDepthPipeline|static_sun_depth/);
    const events = [];
    const engine = makeEngine(events, lifecyclePipeline(events));
    assert.ok(engine.installIlluminationPipeline(null));
    engine.updateFrame(0.1, {render: true, nowMs: 1});
    engine.renderFrame();
    assert.equal(engine.getIlluminationPipeline(), null);
    assert.equal(events.filter((entry) => entry === 'rendererRender').length, 2);
    assert.equal(events.some((entry) => /^(begin|shadow|end):/.test(entry)), false);
});

test('GameEngine waits for asynchronous illumination teardown before renderer disposal', async () => {
    const events = [];
    let resolvePipeline;
    const pipelineDone = new Promise((resolve) => {
        resolvePipeline = resolve;
    });
    const engine = Object.create(GameEngine.prototype);
    Object.assign(engine, {
        _autoResize: false,
        _illuminationPipeline: {
            dispose() {
                events.push('pipelineDispose');
                return pipelineDone;
            }
        },
        _bakedLighting: {
            dispose(options) {
                assert.equal(options?.disposePipeline, false);
                events.push('bakedRuntimeDispose');
            }
        },
        _post: {pipeline: null},
        _staticAo: {runtime: {dispose: () => events.push('staticAoDispose')}},
        _busContactShadow: {rig: {dispose: () => events.push('busDispose')}},
        simulation: {dispose: () => events.push('simulationDispose')},
        renderer: {dispose: () => events.push('rendererDispose')},
        stop: () => events.push('stop')
    });

    const disposing = engine.dispose();
    assert.deepEqual(events, ['stop', 'simulationDispose', 'bakedRuntimeDispose', 'pipelineDispose']);
    assert.equal(engine.renderer, null);
    assert.equal(engine.dispose(), disposing);
    assert.deepEqual(events, ['stop', 'simulationDispose', 'bakedRuntimeDispose', 'pipelineDispose']);
    resolvePipeline();
    await disposing;
    assert.deepEqual(events, [
        'stop',
        'simulationDispose',
        'bakedRuntimeDispose',
        'pipelineDispose',
        'staticAoDispose',
        'busDispose',
        'rendererDispose'
    ]);
});

test('City shadow settings always finish the exact captured refresh transaction', () => {
    const successEvents = [];
    const successCity = makeCityForShadowSettings(successEvents);
    successCity.applyShadowSettings(makeShadowEngine());
    assert.deepEqual(successEvents, [
        'before',
        'merge',
        'instanced',
        'deactivateCsm',
        'after:true'
    ]);

    const failureEvents = [];
    const failureCity = makeCityForShadowSettings(failureEvents, {throwMerge: true});
    assert.throws(() => failureCity.applyShadowSettings(makeShadowEngine()), /merge failed/);
    assert.deepEqual(failureEvents, ['before', 'merge', 'after:false']);

    const inactiveEvents = [];
    const inactiveCity = makeCityForShadowSettings(inactiveEvents);
    inactiveCity._staticSunDepthCasterController.beforeShadowSettings = () => {
        inactiveEvents.push('before:false');
        return false;
    };
    inactiveCity.applyShadowSettings(makeShadowEngine());
    assert.deepEqual(inactiveEvents, [
        'before:false',
        'merge',
        'instanced',
        'deactivateCsm'
    ]);
});

test('City baked ownership replaces CSM with one non-shadowing sun and restores the saved mode', () => {
    const events = [];
    const city = makeCityForShadowSettings(events);
    city._staticSunDepthCasterController = null;
    city._staticSunDepthCacheActive = false;
    city._csm = { active: true };
    city._activateCascadedShadows = () => {
        events.push('activateCsm');
        city._csm = { active: true };
    };
    city._deactivateCascadedShadows = () => {
        events.push('deactivateCsm');
        city._csm = null;
    };
    city.sun = {
        visible: false,
        castShadow: false,
        shadow: {
            bias: 0,
            normalBias: 0,
            radius: 0,
            mapSize: { x: 0, y: 0, set() {} },
            map: null
        }
    };
    const engine = {
        shadowSettings: { type: 'cascade', quality: 'high' },
        renderer: null,
        camera: {}
    };
    const previousWindow = globalThis.window;
    globalThis.window = {};
    try {
        assert.equal(city.setStaticSunDepthCacheActive(true, engine), true);
        assert.equal(city._csm, null);
        assert.equal(city.sun.visible, true);
        assert.equal(city.sun.castShadow, false);
        assert.equal(city.setStaticSunDepthCacheActive(false, engine), true);
        assert.equal(city._csm?.active, true);
        assert.equal(city.sun.visible, false);
        assert.equal(city.sun.castShadow, false);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('City static-depth caster snapshot survives camera culling and resolves caster modes', () => {
    const source = {isMesh: true, name: 'source', castShadow: false};
    const merged = {isMesh: true, name: 'merged', castShadow: true};
    const optionalInstance = {isMesh: true, name: 'optional', castShadow: false};
    const indexedCulled = {isMesh: true, name: 'indexed', castShadow: false};
    const uncatalogued = {isMesh: true, name: 'uncatalogued', castShadow: true};
    const disabled = {isMesh: true, name: 'disabled', castShadow: false};
    const meshes = [source, merged, optionalInstance, indexedCulled, uncatalogued, disabled];
    const city = Object.create(City.prototype);
    Object.assign(city, {
        group: {traverse(visitor) { meshes.forEach(visitor); }},
        _shadowMerge: [{merged, sources: [source]}],
        _instancedCasters: [{mesh: optionalInstance, originalCast: true}],
        _instancedCastersEnabled: false,
        _shadowCuller: {getIndexedCasterMeshes: () => Object.freeze([indexedCulled])}
    });

    const cameraA = city.getStaticSunDepthCasterMeshes();
    indexedCulled.castShadow = true;
    uncatalogued.castShadow = false;
    const cameraB = city.getStaticSunDepthCasterMeshes();

    assert.equal(Object.isFrozen(cameraA), true);
    assert.deepEqual(cameraA.map((mesh) => mesh.name), ['source', 'indexed', 'uncatalogued']);
    assert.deepEqual(cameraB.map((mesh) => mesh.name), ['source', 'indexed']);
    assert.equal(cameraA.includes(indexedCulled), true);
    assert.equal(cameraB.includes(indexedCulled), true);
    assert.equal(cameraA.includes(merged), false);
    assert.equal(cameraA.includes(optionalInstance), false);

    city._instancedCastersEnabled = true;
    const optionalEnabled = city.getStaticSunDepthCasterMeshes();
    assert.equal(optionalEnabled.includes(optionalInstance), true);
});

test('City detach releases static caster ownership before CSM and scene teardown', () => {
    const events = [];
    const city = Object.create(City.prototype);
    Object.assign(city, {
        _attached: true,
        _restore: null,
        group: {traverse() {}},
        disableStaticVisibility: () => events.push('visibilityDispose'),
        _staticSunDepthCasterController: {
            deactivate: (reason) => events.push('caster:' + reason)
        },
        _deactivateCascadedShadows: () => events.push('csmDispose')
    });
    const engine = {
        scene: {remove: () => events.push('sceneRemove')},
        camera: {updateProjectionMatrix() {}}
    };
    city.detach(engine);
    assert.deepEqual(events, [
        'visibilityDispose',
        'caster:city_detached',
        'csmDispose',
        'sceneRemove'
    ]);

    const failureEvents = [];
    const failureCity = Object.create(City.prototype);
    Object.assign(failureCity, {
        _attached: true,
        _restore: null,
        group: {traverse() {}},
        disableStaticVisibility() {},
        _staticSunDepthCasterController: {
            deactivate() {
                failureEvents.push('caster');
                throw new Error('restore failed');
            }
        },
        _deactivateCascadedShadows: () => failureEvents.push('csmDispose')
    });
    assert.throws(
        () => failureCity.detach({
            scene: {remove: () => failureEvents.push('sceneRemove')},
            camera: {updateProjectionMatrix() {}}
        }),
        /restore failed/
    );
    assert.deepEqual(failureEvents, ['caster', 'csmDispose', 'sceneRemove']);
    assert.equal(failureCity._attached, false);
});

/**
 * @param {string[]} events
 * @param {string | null} [throwPhase]
 * @param {string} [prefix]
 */
function lifecyclePipeline(events, throwPhase = null, prefix = '') {
    const key = (name) => prefix ? prefix + ':' + name : name;
    return {
        frameBegin(context) {
            events.push(key('begin') + ':' + context.nowMs);
            if (throwPhase === 'begin') throw new Error('begin failed');
        },
        shadowPrepare(context) {
            events.push(key('shadow') + ':' + context.nowMs);
            if (throwPhase === 'shadow') throw new Error('shadow failed');
        },
        frameEnd(context) {
            events.push(key('end') + ':' + context.nowMs);
        },
        uninstall(reason) {
            events.push(key('uninstall') + ':' + reason);
            if (throwPhase === 'uninstall') throw new Error('uninstall failed');
        }
    };
}

/**
 * @param {string[]} events
 * @param {Record<string, any> | null} pipeline
 * @param {{usePost?: boolean, throwStaticAo?: boolean, throwRender?: boolean, throwGpuEnd?: boolean, throwGpuPoll?: boolean}} [options]
 */
function makeEngine(events, pipeline, options = {}) {
    const engine = Object.create(GameEngine.prototype);
    const render = (label) => {
        events.push(label);
        if (options.throwRender) throw new Error('render failed');
    };
    Object.assign(engine, {
        _illuminationPipeline: pipeline,
        _frameTiming: {
            nowMs: 0,
            rawDt: Number.NaN,
            clampedDt: Number.NaN,
            dt: 0,
            fps: 0
        },
        _stateMachine: null,
        _ibl: null,
        _frameListeners: new Set(),
        _post: {
            pipeline: options.usePost
                ? {render: (dt) => render('postRender:' + dt)}
                : null
        },
        _gpuFrameTimer: {
            beginFrame: () => events.push('gpuBegin'),
            endFrame() {
                events.push('gpuEnd');
                if (options.throwGpuEnd) throw new Error('gpuEnd failed');
            },
            poll() {
                events.push('gpuPoll');
                if (options.throwGpuPoll) throw new Error('gpuPoll failed');
            }
        },
        scene: {},
        camera: {},
        renderer: {render: () => render('rendererRender')},
        _ensureIblBackground() {},
        _updateStaticAo() {
            events.push('staticAo');
            if (options.throwStaticAo) throw new Error('staticAo failed');
        },
        _updateBusContactShadow() {
            events.push('busShadow');
        }
    });
    return engine;
}

/** @param {string[]} events @param {{throwMerge?: boolean}} [options] */
function makeCityForShadowSettings(events, options = {}) {
    const city = Object.create(City.prototype);
    const controller = {
        beforeShadowSettings() {
            events.push('before');
        },
        afterShadowSettings(applied) {
            events.push('after:' + applied);
        }
    };
    Object.assign(city, {
        _staticSunDepthCasterController: controller,
        _sunShadowFocus: null,
        sun: null,
        group: {traverse() {}},
        _applyShadowCasterMerge() {
            events.push('merge');
            if (options.throwMerge) throw new Error('merge failed');
        },
        _applyInstancedShadowCasters: () => events.push('instanced'),
        _activateCascadedShadows: () => events.push('activateCsm'),
        _deactivateCascadedShadows: () => events.push('deactivateCsm')
    });
    return city;
}

function makeShadowEngine() {
    return {
        shadowSettings: {
            type: 'off',
            quality: 'low',
            cascades: 0,
            splitScale: 1,
            mergeCasters: true,
            instancedCasters: false
        },
        renderer: null,
        camera: null
    };
}

/** @param {string} source */
function collectNamedImports(source) {
    const names = new Set();
    for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g)) {
        for (const item of match[1].split(',')) {
            const name = item.trim().split(/\s+as\s+/)[0];
            if (name) names.add(name);
        }
    }
    return names;
}

/** @param {Set<string>} names */
function createDependencyStub(names) {
    const special = new Set(['getResolvedShadowSettings', 'getShadowQualityPreset']);
    const exports = [...names]
        .filter((name) => !special.has(name))
        .map((name) => 'export function ' + name + '() {}');
    exports.push(`export function getResolvedShadowSettings() {
        return {type:'off',quality:'low',cascades:0,splitScale:1,mergeCasters:true,instancedCasters:false};
    }`);
    exports.push(`export function getShadowQualityPreset(settings) {
        const enabled = settings?.type !== 'off';
        return {enabled,mapSize:enabled ? 4096 : 0,radiusMeters:110,radius:1,bias:0,normalBias:0,twoSidedCasting:enabled,...(settings?.type === 'cascade' ? {cascades:4} : {})};
    }`);
    return exports.join('\n');
}

/** @param {string} source */
function sourceDataUrl(source) {
    return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source);
}
