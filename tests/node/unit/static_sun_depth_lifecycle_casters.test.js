// Verifies transactional city-only caster ownership for AI 531.
// @ts-check

import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';

const controllerUrl = new URL(
    '../../../src/graphics/illumination/static_sun_depth/StaticSunDepthCasterController.js?lifecycle-mock',
    import.meta.url
);
const cullerStubUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
    export class ShadowCasterCuller {
        clear() {}
        addRoot() {}
        update() {}
    }
`);
const moduleHooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if ((context.parentURL ?? '').startsWith(controllerUrl.href)
            && specifier.endsWith('/ShadowCasterCulling.js')) {
            return {url: cullerStubUrl, shortCircuit: true};
        }
        return nextResolve(specifier, context);
    }
});
const {StaticSunDepthCasterController} = await import(controllerUrl.href);
moduleHooks.deregister();

test('activation suppresses only City.group and deactivation restores exact merged/instanced states', () => {
    const scene = {};
    const source = mesh('source', true);
    const merged = mesh('merged', true);
    const instanced = mesh('instanced', false);
    const bus = mesh('bus', true);
    const external = mesh('external', false);
    const city = makeCity(scene, [source, merged, instanced]);
    city._extraShadowRoots.add({nodes: [bus, external]});
    const engine = {scene, camera: {}, context: {city}};
    const controller = new StaticSunDepthCasterController(engine);

    controller.activate(city);
    assert.deepEqual([source.castShadow, merged.castShadow, instanced.castShadow], [false, false, false]);
    assert.deepEqual([bus.castShadow, external.castShadow], [true, false]);
    assert.equal(city._staticSunDepthCasterController, controller);
    assert.equal(city._staticSunDepthCacheActive, true);
    assert.equal(controller.verifySuppressed(), true);

    controller.deactivate('current');
    assert.deepEqual([source.castShadow, merged.castShadow, instanced.castShadow], [true, true, false]);
    assert.deepEqual([bus.castShadow, external.castShadow], [true, false]);
    assert.equal(city._staticSunDepthCasterController, null);
    assert.equal(city._staticSunDepthCacheActive, false);
    assert.equal(controller.getDiagnostics().lastReason, 'current');
});

test('verification detects refresh windows, ownership loss, context changes, detach, and new meshes', () => {
    const scene = {};
    const original = mesh('original', true);
    const city = makeCity(scene, [original]);
    const engine = {scene, camera: {}, context: {city}};
    const controller = new StaticSunDepthCasterController(engine);
    controller.activate(city);

    controller.beforeShadowSettings();
    assert.equal(controller.verifySuppressed(), false);
    controller.afterShadowSettings(true);
    assert.equal(controller.verifySuppressed(), true);

    city._staticSunDepthCacheActive = false;
    assert.equal(controller.verifySuppressed(), false);
    city._staticSunDepthCacheActive = true;
    city._staticSunDepthCasterController = {};
    assert.equal(controller.verifySuppressed(), false);
    city._staticSunDepthCasterController = controller;
    engine.context.city = makeCity(scene, []);
    assert.equal(controller.verifySuppressed(), false);
    engine.context.city = city;
    city.group.parent = null;
    assert.equal(controller.verifySuppressed(), false);
    city.group.parent = scene;
    city.group.nodes.push(mesh('late', false));
    assert.equal(controller.verifySuppressed(), false);

    controller.deactivate('test_cleanup');
});

test('activation rollback leaves no owner or partial suppression when traversal or assignment fails', () => {
    const scene = {};
    const first = mesh('first', true);
    const traversalCity = makeCity(scene, [first]);
    traversalCity.group.throwOnTraverse = true;
    const traversalEngine = {scene, camera: {}, context: {city: traversalCity}};
    const traversalController = new StaticSunDepthCasterController(traversalEngine);
    assert.throws(() => traversalController.activate(traversalCity), /traverse failed/);
    assert.equal(first.castShadow, true);
    assert.equal(traversalCity._staticSunDepthCasterController, null);
    assert.equal(traversalCity._staticSunDepthCacheActive, false);
    assert.equal(traversalController.getDiagnostics().active, false);

    const ordinary = mesh('ordinary', true);
    let throwingValue = true;
    const throwing = {isMesh: true, name: 'throwing'};
    Object.defineProperty(throwing, 'castShadow', {
        enumerable: true,
        configurable: true,
        get: () => throwingValue,
        set(value) {
            if (value === false) throw new Error('suppression failed');
            throwingValue = value;
        }
    });
    const assignmentCity = makeCity(scene, [ordinary, throwing]);
    const assignmentEngine = {scene, camera: {}, context: {city: assignmentCity}};
    const assignmentController = new StaticSunDepthCasterController(assignmentEngine);
    assert.throws(() => assignmentController.activate(assignmentCity), /suppression failed/);
    assert.equal(ordinary.castShadow, true);
    assert.equal(throwing.castShadow, true);
    assert.equal(assignmentCity._staticSunDepthCasterController, null);
    assert.equal(assignmentCity._staticSunDepthCacheActive, false);
});

test('activation rollback restores the failing mesh when its setter mutates before throwing', () => {
    const scene = {};
    let castShadow = true;
    let rejectFirstSuppression = true;
    const setterMesh = {isMesh: true, name: 'mutate-then-throw'};
    Object.defineProperty(setterMesh, 'castShadow', {
        enumerable: true,
        configurable: true,
        get: () => castShadow,
        set(value) {
            castShadow = value;
            if (value === false && rejectFirstSuppression) {
                rejectFirstSuppression = false;
                throw new Error('mutated before suppression failure');
            }
        }
    });
    const city = makeCity(scene, [setterMesh]);
    const controller = new StaticSunDepthCasterController({scene, camera: {}, context: {city}});

    assert.throws(() => controller.activate(city), /mutated before suppression failure/);
    assert.equal(setterMesh.castShadow, true);
    assert.equal(city._staticSunDepthCasterController, null);
    assert.equal(city._staticSunDepthCacheActive, false);
    assert.equal(controller.getDiagnostics().active, false);
});

test('successful settings refresh restores the newly selected states after cache deactivation', () => {
    const scene = {};
    const merged = mesh('merged', true);
    const instanced = mesh('instanced', false);
    const city = makeCity(scene, [merged, instanced]);
    const engine = {scene, camera: {}, context: {city}};
    const controller = new StaticSunDepthCasterController(engine);
    controller.activate(city);

    assert.equal(controller.beforeShadowSettings(), true);
    assert.deepEqual([merged.castShadow, instanced.castShadow], [true, false]);
    merged.castShadow = false;
    instanced.castShadow = true;
    assert.equal(controller.afterShadowSettings(true), true);
    assert.deepEqual([merged.castShadow, instanced.castShadow], [false, false]);
    assert.equal(controller.verifySuppressed(), true);

    controller.deactivate('current');
    assert.deepEqual([merged.castShadow, instanced.castShadow], [false, true]);
    assert.equal(controller.getDiagnostics().settingsRefreshes, 1);
});

test('failed settings refresh restores the pre-transaction states and relinquishes ownership', () => {
    const scene = {};
    const merged = mesh('merged', true);
    const instanced = mesh('instanced', false);
    const city = makeCity(scene, [merged, instanced]);
    const engine = {scene, camera: {}, context: {city}};
    const controller = new StaticSunDepthCasterController(engine);
    controller.activate(city);

    controller.beforeShadowSettings();
    merged.castShadow = false;
    instanced.castShadow = true;
    assert.equal(controller.afterShadowSettings(false), false);
    assert.deepEqual([merged.castShadow, instanced.castShadow], [true, false]);
    assert.equal(city._staticSunDepthCasterController, null);
    assert.equal(city._staticSunDepthCacheActive, false);
    assert.equal(controller.getDiagnostics().active, false);
    assert.equal(controller.getDiagnostics().lastReason, 'shadow_settings_failed');
});

test('recapture failure rolls back ownership and original state instead of claiming an empty snapshot', () => {
    const scene = {};
    const caster = mesh('caster', true);
    const city = makeCity(scene, [caster]);
    const engine = {scene, camera: {}, context: {city}};
    const controller = new StaticSunDepthCasterController(engine);
    controller.activate(city);
    controller.beforeShadowSettings();
    caster.castShadow = false;
    city.group.throwOnTraverse = true;

    assert.throws(() => controller.afterShadowSettings(true), /traverse failed/);
    assert.equal(caster.castShadow, true);
    assert.equal(city._staticSunDepthCasterController, null);
    assert.equal(city._staticSunDepthCacheActive, false);
    assert.equal(controller.verifySuppressed(), false);
    assert.equal(controller.getDiagnostics().lastReason, 'shadow_settings_refresh_failed');
});

test('deactivation restores city culling under CSM without indexing external roots', () => {
    const scene = {};
    const caster = mesh('caster', true);
    const bus = mesh('bus', true);
    const events = [];
    const city = makeCity(scene, [caster]);
    city._extraShadowRoots.add({nodes: [bus]});
    city._csm = {maxFar: 300};
    city.sunRef = {direction: {x: 0, y: 1, z: 0}};
    city._shadowCuller = {
        clear: () => events.push('clear'),
        addRoot: (root) => events.push(root === city.group ? 'addCity' : 'addExternal'),
        update: () => events.push('update')
    };
    const engine = {scene, camera: {}, context: {city}};
    const controller = new StaticSunDepthCasterController(engine);

    controller.activate(city);
    controller.deactivate('current');
    assert.deepEqual(events, ['clear', 'clear', 'addCity', 'update']);
    assert.equal(events.includes('addExternal'), false);
    assert.equal(caster.castShadow, true);
    assert.equal(bus.castShadow, true);
});

test('activation rejects an explicit null, stale, or already-owned City context', () => {
    const scene = {};
    const city = makeCity(scene, [mesh('caster', true)]);
    const controller = new StaticSunDepthCasterController({scene, context: {city: null}});
    assert.throws(() => controller.activate(city), /engine context/);

    const otherCity = makeCity(scene, []);
    const stale = new StaticSunDepthCasterController({scene, context: {city: otherCity}});
    assert.throws(() => stale.activate(city), /engine context/);

    city._staticSunDepthCasterController = {};
    const owned = new StaticSunDepthCasterController({scene, context: {city}});
    assert.throws(() => owned.activate(city), /another static-sun caster owner/);
});

/** @param {string} name @param {boolean} castShadow */
function mesh(name, castShadow) {
    return {isMesh: true, name, castShadow};
}

/** @param {object} scene @param {Record<string, any>[]} nodes */
function makeCity(scene, nodes) {
    const group = {
        parent: scene,
        nodes,
        throwOnTraverse: false,
        traverse(visitor) {
            for (const object of this.nodes) {
                visitor(object);
                if (this.throwOnTraverse) throw new Error('traverse failed');
            }
        }
    };
    return {
        cityId: 'fixture-city',
        group,
        _staticSunDepthCasterController: null,
        _staticSunDepthCacheActive: false,
        _shadowCuller: null,
        _csm: null,
        _extraShadowRoots: new Set(),
        sunRef: {direction: {x: 0, y: 1, z: 0}}
    };
}
