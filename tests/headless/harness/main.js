// Deterministic, automation-friendly harness entry point (window.__testHooks).
import * as THREE from 'three';
import { GameEngine } from '/src/app/core/GameEngine.js';
import { installDeterministicMathRandom } from './DeterministicMathRandom.js';
import { getScenarioById, listScenarioIds } from './scenarios/index.js';

const statusEl = document.getElementById('harness-status');
const logEl = document.getElementById('harness-log');
const canvas = document.getElementById('harness-canvas');

function setStatus(kind, message) {
    const k = String(kind ?? 'idle');
    statusEl.dataset.status = k;
    statusEl.textContent = `HARNESS: ${String(message ?? k).toUpperCase()}`;
}

function appendLog(line) {
    const next = String(line ?? '');
    logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${next}` : next;
}

function clearLog() {
    logEl.textContent = '';
}

function fail(message, extra = null) {
    const msg = String(message ?? 'FAIL');
    setStatus('fail', 'fail');
    appendLog(msg);
    if (extra) appendLog(String(extra));
    console.error('[HARNESS] FAIL:', msg, extra ?? '');
    window.__harnessResult = { status: 'fail', message: msg };
}

function pass(message = 'PASS') {
    const msg = String(message ?? 'PASS');
    setStatus('pass', 'pass');
    appendLog(msg);
    console.log('[HARNESS] PASS:', msg);
    window.__harnessResult = { status: 'pass', message: msg };
}

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(String(message));
}

const state = {
    engine: null,
    scenario: null,
    scenarioId: null,
    seed: 'harness',
    fixedDt: 1 / 60,
    nowMs: 0,
    restoreMathRandom: null
};

function ensureDeterminism(seed) {
    if (state.restoreMathRandom) state.restoreMathRandom();
    state.restoreMathRandom = installDeterministicMathRandom(seed);
    state.seed = String(seed ?? state.seed);
    state.nowMs = 0;
}

function resetScene() {
    if (!state.engine) return;
    if ('city' in state.engine.context) state.engine.context.city = null;
    state.engine.clearScene();
}

async function unloadScenario() {
    if (!state.engine) return;
    try {
        await state.scenario?.dispose?.();
    } finally {
        state.scenario = null;
        state.scenarioId = null;
        resetScene();
        state.engine.renderFrame();
    }
}

async function loadScenario(id, options = {}) {
    const scenarioId = String(id ?? '');
    const entry = getScenarioById(scenarioId);
    if (!entry) throw new Error(`Unknown scenario "${scenarioId}". Available: ${listScenarioIds().join(', ')}`);

    await unloadScenario();
    clearLog();
    setStatus('idle', `loading ${scenarioId}`);

    const seed = options?.seed ?? state.seed;
    ensureDeterminism(seed);

    const handle = await entry.create({
        engine: state.engine,
        THREE,
        seed: state.seed,
        options
    });

    state.scenarioId = scenarioId;
    state.scenario = handle ?? null;

    state.engine.applyCurrentIBLIntensity({ force: true });
    state.engine.renderFrame();
    setStatus('idle', `ready ${scenarioId}`);
    console.log('[HARNESS] Loaded scenario:', scenarioId, { seed: state.seed, options });
    return true;
}

function step(ticks = 1, { dt = null, render = false } = {}) {
    const count = Math.max(0, Math.floor(ticks));
    const stepDt = Number.isFinite(dt) ? dt : state.fixedDt;
    for (let i = 0; i < count; i++) {
        state.nowMs += stepDt * 1000;
        state.scenario?.update?.(stepDt, { nowMs: state.nowMs });
        state.engine.updateFrame(stepDt, { render: false, nowMs: state.nowMs });
    }
    if (render) state.engine.renderFrame();
    return { ticks: count, dt: stepDt, nowMs: state.nowMs };
}

function stepAdvanced(ticks = 1, { dt = null, render = false, renderEachTick = false, resetRendererInfo = false } = {}) {
    const count = Math.max(0, Math.floor(ticks));
    const stepDt = Number.isFinite(dt) ? dt : state.fixedDt;
    if (resetRendererInfo) state.engine.renderer?.info?.reset?.();
    for (let i = 0; i < count; i++) {
        state.nowMs += stepDt * 1000;
        state.scenario?.update?.(stepDt, { nowMs: state.nowMs });
        state.engine.updateFrame(stepDt, { render: !!renderEachTick, nowMs: state.nowMs });
    }
    if (render && !renderEachTick) state.engine.renderFrame();
    return { ticks: count, dt: stepDt, nowMs: state.nowMs };
}

function pStat(values) {
    const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
    if (!list.length) return { avg: null, max: null, p95: null };
    let sum = 0;
    let max = -Infinity;
    for (const v of list) {
        sum += v;
        if (v > max) max = v;
    }
    const sorted = list.slice().sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
    return {
        avg: sum / list.length,
        max,
        p95: sorted[idx]
    };
}

async function measurePerformance({
    scenarioId,
    seed,
    viewport = { width: 960, height: 540 },
    warmupTicks = 60,
    measureTicks = 120,
    dt = 1 / 60
} = {}) {
    const id = String(scenarioId ?? '');
    const s = String(seed ?? state.seed);
    if (!id) throw new Error('measurePerformance requires scenarioId');

    setViewport(viewport.width, viewport.height);
    setFixedDt(dt);
    await loadScenario(id, { seed: s });

    stepAdvanced(warmupTicks, { dt, renderEachTick: true, resetRendererInfo: true });
    state.engine.renderer?.info?.reset?.();

    const frameMs = [];
    const calls = [];
    const triangles = [];
    const lines = [];
    const points = [];

    for (let i = 0; i < Math.max(0, Math.floor(measureTicks)); i++) {
        state.nowMs += dt * 1000;
        const t0 = performance.now();
        state.scenario?.update?.(dt, { nowMs: state.nowMs });
        state.engine.updateFrame(dt, { render: true, nowMs: state.nowMs });
        const t1 = performance.now();

        frameMs.push(t1 - t0);
        const renderInfo = state.engine.renderer?.info?.render ?? null;
        if (renderInfo) {
            calls.push(renderInfo.calls);
            triangles.push(renderInfo.triangles);
            lines.push(renderInfo.lines);
            points.push(renderInfo.points);
        }
    }

    const info = state.engine.renderer?.info ?? null;
    return {
        scenarioId: state.scenarioId,
        seed: state.seed,
        viewport,
        dt,
        warmupTicks,
        measureTicks,
        timing: {
            frameMs: pStat(frameMs)
        },
        renderer: {
            calls: pStat(calls),
            triangles: pStat(triangles),
            lines: pStat(lines),
            points: pStat(points),
            memory: info?.memory ?? null,
            programs: Array.isArray(info?.programs) ? info.programs.length : null
        },
        scenario: state.scenario?.getMetrics?.() ?? null
    };
}

function renderFrame() {
    state.engine.renderFrame();
    return true;
}

function setFixedDt(dt) {
    const next = Number(dt);
    if (!Number.isFinite(next) || next <= 0) throw new Error(`Invalid dt: ${dt}`);
    state.fixedDt = next;
    return state.fixedDt;
}

function setViewport(width, height) {
    state.engine.setViewportSize(width, height);
    return true;
}

function getMetrics() {
    const info = state.engine.renderer?.info ?? null;
    return {
        scenarioId: state.scenarioId,
        seed: state.seed,
        fixedDt: state.fixedDt,
        nowMs: state.nowMs,
        camera: state.engine?.camera ? {
            near: Number.isFinite(state.engine.camera.near) ? state.engine.camera.near : null,
            far: Number.isFinite(state.engine.camera.far) ? state.engine.camera.far : null,
            layersMask: Number.isFinite(state.engine.camera.layers?.mask) ? state.engine.camera.layers.mask : null,
            position: state.engine.camera.position ? {
                x: state.engine.camera.position.x ?? 0,
                y: state.engine.camera.position.y ?? 0,
                z: state.engine.camera.position.z ?? 0
            } : null
        } : null,
        scenario: state.scenario?.getMetrics?.() ?? null,
        renderer: info ? {
            memory: info.memory,
            render: info.render,
            programs: Array.isArray(info.programs) ? info.programs.length : null
        } : null
    };
}

function getBloomDebugInfo() {
    return state.engine?.getBloomDebugInfo?.() ?? null;
}

function getColorGradingDebugInfo() {
    return state.engine?.getColorGradingDebugInfo?.() ?? null;
}

function getSceneObjectStatsByName(name) {
    const target = String(name ?? '');
    const out = { name: target, count: 0, visibleCount: 0, types: {} };
    if (!target || !state.engine?.scene) return out;
    state.engine.scene.traverse((obj) => {
        if (!obj || obj.name !== target) return;
        out.count += 1;
        if (obj.visible !== false) out.visibleCount += 1;
        const type = String(obj.type ?? obj.constructor?.name ?? 'Object3D');
        out.types[type] = (out.types[type] || 0) + 1;
    });
    return out;
}

function setSceneObjectVisibleByName(name, visible) {
    const target = String(name ?? '');
    if (!target || !state.engine?.scene) return 0;
    const next = visible !== false;
    let count = 0;
    state.engine.scene.traverse((obj) => {
        if (!obj || obj.name !== target) return;
        obj.visible = next;
        count += 1;
    });
    return count;
}

function setRoadMarkingsOverlayEnabled(enabled) {
    const next = enabled !== false;
    if (!state.engine?.scene) return 0;
    let count = 0;
    state.engine.scene.traverse((obj) => {
        const mat = obj?.material ?? null;
        if (!mat) return;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
            if (!m?.userData?.roadMarkingsOverlay) continue;
            m.userData.roadMarkingsOverlayEnabled = next;
            const uniforms = m.userData.roadMarkingsOverlayUniforms ?? null;
            if (uniforms?.uRoadMarkingsEnabled) uniforms.uRoadMarkingsEnabled.value = next ? 1.0 : 0.0;
            count += 1;
        }
    });
    return count;
}

function init() {
    if (!canvas) throw new Error('Missing #harness-canvas');
    state.engine = new GameEngine({
        canvas,
        autoResize: false,
        deterministic: true,
        pixelRatio: 1,
        size: { width: 960, height: 540 }
    });
    state.engine.setIBLAutoScanEnabled(false);

    state.engine.scene.background = new THREE.Color('#0b0f16');
    state.engine.camera.position.set(0, 26, 40);
    state.engine.camera.lookAt(0, 0, 0);

    ensureDeterminism(state.seed);
    setStatus('idle', 'ready');
    appendLog('window.__testHooks is ready');
}

window.addEventListener('error', (e) => {
    fail(e?.message ?? 'Unhandled error');
});
window.addEventListener('unhandledrejection', (e) => {
    fail('Unhandled promise rejection', e?.reason ?? null);
});

init();

window.__testHooks = {
    version: 1,
    listScenarios: () => listScenarioIds().slice(),
    loadScenario,
    unloadScenario,
    setSeed: (seed) => { ensureDeterminism(seed); return state.seed; },
    getSeed: () => state.seed,
    setFixedDt,
    getFixedDt: () => state.fixedDt,
    setViewport,
    step,
    stepAdvanced,
    measurePerformance,
    renderFrame,
    getMetrics,
    getBloomDebugInfo,
    getColorGradingDebugInfo,
    getSceneObjectStatsByName,
    setSceneObjectVisibleByName,
    setRoadMarkingsOverlayEnabled,
    assert,
    pass,
    fail
};
