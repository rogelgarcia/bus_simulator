// Interactive grass transition bands with cached spatial selection and a soil-only baseline.
import * as THREE from 'three';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { createGrassDebugV2FreeCamera } from './GrassDebugV2FreeCamera.js?v=transition-navigation-1';
import { GRASS_FIELD_BUS_CAMERA } from './GrassDebugV2BusCamera.js';
import { loadGrassDebugV2TransitionAssets } from './GrassDebugV2TransitionAssets.js?v=transition-lighting-1';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js?v=transition-blend-startup-1';
import { createGrassDebugV2TransitionHelpers } from './GrassDebugV2TransitionHelpers.js?v=transition-band-1';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js?v=transition-blend-1';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { createGrassDebugV2TransitionExperiments, GRASS_TRANSITION_EXPERIMENTS } from './GrassDebugV2TransitionExperiments.js';
import { configureGrassDebugV2TransitionAppearance } from './GrassDebugV2DistanceAppearance.js';

const loading = document.querySelector('#scene-loading');
const controls = document.querySelectorAll('#scene-panel input, #scene-panel select, #scene-panel button');

export async function createGrassDebugV2TransitionScene() {
    const canvas = document.querySelector('#scene-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .02, 250);
    const lighting = new GrassDebugV2Lighting({ renderer, scene, camera, retainSceneDepth: true });
    const assets = await loadGrassDebugV2TransitionAssets({ renderer, lighting, offline: new URLSearchParams(location.search).get('assets') === 'compressed', onProgress: message => { loading.textContent = message; } });
    const fields = createGrassDebugV2TransitionFields({ ...assets, fieldSize: 32, gap: 1 });
    const experiments = createGrassDebugV2TransitionExperiments(renderer, lighting.environment, lighting.sunRef.direction);
    let experiment = 'recommended';
    let experimentRequest = 0;
    scene.add(fields.group);
    const axis = [-120, -32.5, -.5, .5, 32.5, 120], positions = [], uv = [], indices = [];
    const coordinate = new THREE.Vector3();
    for (const z of axis) for (const x of axis) {
        positions.push(x, 0, z); coordinate.set(x, z, 1).applyMatrix3(assets.soilUv); uv.push(coordinate.x, coordinate.y);
    }
    for (let z = 0; z < axis.length - 1; z++) for (let x = 0; x < axis.length - 1; x++) {
        if ((x === 1 || x === 3) && (z === 1 || z === 3)) continue;
        const a = z * axis.length + x, b = a + axis.length; indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const groundGeometry = new THREE.BufferGeometry();
    groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    groundGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    groundGeometry.setIndex(indices); groundGeometry.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeometry, assets.soilMaterial); ground.name = 'TransitionPathsAndSurroundings';
    ground.receiveShadow = true; scene.add(ground);
    const bandParameter = new URLSearchParams(location.search).get('transition');
    const selection = new GrassDebugV2TransitionSelection({ cells: fields.cells,
        transitionFraction: bandParameter === null ? .5 : Number(bandParameter) / 100,
        transitionMode: new URLSearchParams(location.search).get('transitionMode') || 'blend' });
    const helpers = createGrassDebugV2TransitionHelpers({ cells: fields.cells });
    const appearanceMaterials = new Set();
    fields.group.traverse(mesh => { if (mesh.isMesh && mesh.material.userData.grassFieldDistance) appearanceMaterials.add(mesh.material); });
    lighting.applyEnvironment();
    const sun = lighting.sun, extent = 48;
    sun.position.copy(lighting.sunRef.direction).multiplyScalar(100); sun.target.position.set(0, 0, 0);
    sun.shadow.mapSize.set(8192, 8192);
    Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: .05, far: 210 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.00001; sun.shadow.normalBias = .0005;
    const gpu = getOrCreateGpuFrameTimer(renderer);
    const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
    const shadowLevels = new Uint8Array(fields.cells.length).fill(2);
    const flatLevels = new Uint8Array(fields.cells.length).fill(4), noSideLeaves = new Uint8Array(fields.cells.length);
    const forcedSideLeaves = new Uint8Array(fields.cells.length), perimeterCells = fields.cells.filter(cell => cell.edge);
    let configuration = 'distance';
    let levels, renderMasks = null, shadowGenerations = 0, soilOnly = false, showHelpers = true, pose = 'front';
    let animating = false, frame = null, previous = performance.now(), lastTelemetry = 0, drive = false;
    let renderedFrames = 0, frameCpuTotalMs = 0, frameCpuMaxMs = 0;
    const frameDraws = { triangles: 0, calls: 0, lines: 0, points: 0 };
    const speedLabel = document.querySelector('#transition-speed-label');
    const navigation = createGrassDebugV2FreeCamera({ camera, canvas, onChange: () => {},
        horizontal: true, lookButtons: [1], onReset: () => resetBusCamera(),
        onSpeedChange: value => { speedLabel.textContent = value.toFixed(1) + ' m/s'; } });
    navigation.setSpeed(3);
    const updateSelection = (force = false, now = performance.now()) => {
        if (configuration !== 'distance') {
            levels = flatLevels; renderMasks = null;
            const sides = configuration === 'lod4-elevated-sides';
            const scanned = sides && selection.update(camera.position, now, { force }).scanned;
            if (force || scanned) {
                if (sides) {
                    const cutoff = selection.getSnapshot().sideLeafDistance ** 2;
                    for (const cell of perimeterCells) forcedSideLeaves[cell.id] = Number(cutoff > 0
                        && (cell.centerX - camera.position.x) ** 2 + (cell.centerZ - camera.position.z) ** 2 <= cutoff);
                }
                fields.applyLevels(levels, sides ? forcedSideLeaves : noSideLeaves);
                if (showHelpers) helpers.update(levels, camera.position, null);
            }
            return { levels, scanned: !!scanned, changedCount: 0, sideLeavesChangedCount: 0 };
        }
        const result = selection.update(camera.position, now, { force });
        levels = result.levels; renderMasks = result.renderMasks;
        if (force || result.changedCount || result.sideLeavesChangedCount || result.renderChangedCount) fields.applyLevels(levels, result.sideLeaves, renderMasks);
        if (result.scanned && showHelpers) { const state = selection.getSnapshot(); helpers.update(levels, camera.position, state.effectiveDistances, state.transitionBands); }
        return result;
    };
    const refreshShadows = () => {
        if (!renderer.shadowMap.enabled) return;
        const previousTarget = renderer.getRenderTarget(), helperVisible = helpers.group.visible;
        helpers.group.visible = false;
        if (!soilOnly && ['distance', 'lod4-elevated-sides'].includes(configuration)) fields.applyLevels(shadowLevels);
        renderer.shadowMap.needsUpdate = sun.shadow.needsUpdate = true;
        try {
            renderer.setRenderTarget(shadowTarget); renderer.render(scene, camera);
            shadowGenerations++;
        } finally {
            renderer.setRenderTarget(previousTarget);
            if (!soilOnly) fields.applyLevels(levels, null, renderMasks);
            helpers.group.visible = helperVisible;
        }
    };
    const setSoilOnly = value => {
        if (typeof value !== 'boolean') throw new Error('Soil-only visibility must be boolean.');
        if (soilOnly === value) return;
        soilOnly = value; fields.setSoilOnly(value);
        document.querySelector('#transition-soil').checked = value;
        refreshShadows();
    };
    const setShadows = value => {
        if (typeof value !== 'boolean') throw new Error('Shadow visibility must be boolean.');
        if (renderer.shadowMap.enabled === value) return;
        renderer.shadowMap.enabled = value;
        scene.traverse(mesh => { if (mesh.isMesh) for (const material of [mesh.material].flat()) material.needsUpdate = true; });
        document.querySelector('#transition-shadows').checked = value;
        if (value) refreshShadows();
    };
    const setHelpers = value => {
        showHelpers = value; helpers.setVisible(value);
        document.querySelector('#transition-helpers').checked = value;
        if (value && levels) { const state = selection.getSnapshot(); helpers.update(levels, camera.position, configuration !== 'distance' ? null : state.effectiveDistances, state.transitionBands); }
    };
    const setConfiguration = value => {
        if (!['distance', 'lod4-flat', 'lod4-ground', 'lod4-elevated', 'lod4-elevated-sides'].includes(value)) throw new Error('Unknown transition configuration: ' + value);
        const changed = configuration !== value;
        configuration = value;
        fields.setLod4Surface(value === 'lod4-ground' ? 'ground' : value === 'lod4-flat' ? 'flat' : 'beveled'); updateSelection(true);
        if (changed && shadowGenerations > 0) refreshShadows();
        document.querySelector('#transition-configuration').value = value;
        document.querySelector('.transition-distances').disabled = value !== 'distance';
        document.querySelector('#transition-only-sides').hidden = value !== 'lod4-elevated-sides';
        const url = new URL(location.href);
        if (value === 'distance') url.searchParams.delete('configuration');
        else url.searchParams.set('configuration', value);
        history.replaceState(null, '', url);
    };
    const setOptimization = value => {
        fields.setOptimization(value);
        document.querySelector('#transition-optimization').value = value;
        const url = new URL(location.href);
        if (value === 'optimized') url.searchParams.delete('optimization');
        else url.searchParams.set('optimization', value);
        history.replaceState(null, '', url);
    };
    const setExperiment = async value => {
        if (!Object.hasOwn(GRASS_TRANSITION_EXPERIMENTS, value)) throw new Error('Unknown grass experiment: ' + value);
        const request = ++experimentRequest;
        await experiments.prepare(value);
        if (request !== experimentRequest) return;
        experiment = value; fields.setMaterialTransform(material => experiments.material(material, value));
        fields.setEdgeStrips(value === 'strips' || value === 'recommended');
        fields.setChunkSize(value === 'chunks4' ? 4 : value === 'chunks8' ? 8 : 32);
        document.querySelector('#transition-experiment').value = value;
        const url = new URL(location.href);
        if (value === 'recommended') url.searchParams.delete('experiment'); else url.searchParams.set('experiment', value);
        history.replaceState(null, '', url);
    };
    const setSettings = settings => {
        selection.setSettings(settings);
        const state = selection.getSnapshot();
        fields.configureBlend(state.transitionBands); updateSelection(true);
        configureGrassDebugV2TransitionAppearance(appearanceMaterials, state.effectiveDistances);
        state.distances.forEach((distance, i) => {
            document.querySelector('#transition-limit-' + i).value = distance;
            const half = document.querySelector('#transition-half-' + i);
            half.textContent = '½ ' + Number((distance / 2).toFixed(3)) + ' m';
            half.classList.toggle('is-active', state.scale === .5);
        });
        document.querySelector('#transition-movement').value = state.movementThreshold;
        document.querySelector('#transition-interval').value = state.intervalMs;
        document.querySelector('#transition-side-leaves').value = state.sideLeafDistance;
        document.querySelector('#transition-only-side-leaves').value = state.sideLeafDistance;
        document.querySelector('#transition-band').value = state.transitionFraction * 100;
        document.querySelector('#transition-mode').value = state.transitionMode;
        document.querySelector('#transition-band-ranges').textContent = state.transitionFraction
            ? state.transitionBands.map(band => `L${band.from}→${band.to}: ${Number(band.start.toFixed(2))}–${Number(band.end.toFixed(2))} m`).join(' · ')
            : 'Abrupt switches';
        const url = new URL(location.href);
        if (state.transitionMode === 'blend') url.searchParams.delete('transitionMode'); else url.searchParams.set('transitionMode', state.transitionMode);
        if (state.transitionFraction === .5) url.searchParams.delete('transition'); else url.searchParams.set('transition', String(state.transitionFraction * 100));
        history.replaceState(null, '', url);
        document.querySelector('#transition-full').setAttribute('aria-pressed', String(state.scale === 1));
        document.querySelector('#transition-half').setAttribute('aria-pressed', String(state.scale === .5));
    };
    const setDistanceScale = scale => setSettings({ scale });
    const resetBusCamera = () => {
        const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        rotation.x = -THREE.MathUtils.degToRad(GRASS_FIELD_BUS_CAMERA.pitchDegrees); rotation.z = 0;
        camera.position.y = GRASS_FIELD_BUS_CAMERA.heightMeters;
        camera.quaternion.setFromEuler(rotation); camera.updateMatrixWorld(true);
    };
    const setPose = id => {
        const positions = { front: [-16, 24, 0], rear: [16, -24, Math.PI], border: [0, 10, Math.PI / 2], overview: [0, 0, 0] };
        if (!Object.hasOwn(positions, id)) throw new Error('Unknown transition pose: ' + id);
        const [x, z, yaw] = positions[id];
        pose = id; navigation.clear();
        if (id === 'overview') { camera.position.set(0, 70, .01); camera.lookAt(0, 0, 0); }
        else {
            camera.position.set(x, GRASS_FIELD_BUS_CAMERA.heightMeters, z);
            camera.quaternion.setFromEuler(new THREE.Euler(-THREE.MathUtils.degToRad(GRASS_FIELD_BUS_CAMERA.pitchDegrees), yaw, 0, 'YXZ'));
        }
        camera.fov = GRASS_FIELD_BUS_CAMERA.fieldOfViewDegrees; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        document.querySelector('#transition-pose').value = id;
        history.replaceState(null, '', '#' + id); updateSelection(true);
    };
    const resize = () => {
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); lighting.resize(innerWidth, innerHeight);
    };
    const forward = new THREE.Vector3();
    const step = (dt = 1 / 60, now = performance.now()) => {
        const startMs = performance.now();
        navigation.update(dt);
        if (drive) {
            camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
            camera.position.addScaledVector(forward, navigation.getSpeed() * dt);
        }
        if (!soilOnly) updateSelection(false, now);
        gpu.poll(); gpu.beginFrame();
        try { lighting.render(dt); helpers.render(renderer, camera); } finally { gpu.endFrame(); }
        // The postprocessing pipeline and helpers accumulate renderer.info for the complete frame.
        for (const key of Object.keys(frameDraws)) frameDraws[key] = renderer.info.render[key];
        renderedFrames++;
        const cpuMs = performance.now() - startMs;
        frameCpuTotalMs += cpuMs; frameCpuMaxMs = Math.max(frameCpuMaxMs, cpuMs);
        if (now - lastTelemetry >= 500) {
            lastTelemetry = now;
            const state = selection.getSnapshot(), samples = gpu.getSamplesSince(0).slice(-30);
            const mean = samples.length ? samples.reduce((sum, sample) => sum + sample.ms, 0) / samples.length : null;
            document.querySelector('#scene-performance').textContent = 'GPU ' + (mean === null ? '—' : mean.toFixed(2))
                + ' ms total · Triangles ' + frameDraws.triangles.toLocaleString() + ' · Draws ' + frameDraws.calls
                + ' · LOD scan ' + state.averageCpuMs.toFixed(3) + ' ms · ' + state.scans + ' scans · ' + state.skippedStationary + ' reused frames';
            const counts = configuration !== 'distance' ? [0, 0, 0, 0, fields.cells.length] : state.counts;
            document.querySelector('#transition-counts').textContent = counts.map((count, i) => 'L' + i + ': ' + count).join(' · ');
        }
    };
    const loop = now => {
        if (!animating) return;
        if (!document.hidden) step(Math.min(.05, (now - previous) / 1000), now);
        previous = now; frame = requestAnimationFrame(loop);
    };
    const setAnimating = value => {
        animating = value;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null; previous = performance.now();
        if (value) frame = requestAnimationFrame(loop);
    };
    const events = [];
    const setPanelCollapsed = collapsed => {
        document.querySelector('#transition-panel-body').hidden = collapsed;
        document.querySelector('#scene-panel').classList.toggle('is-collapsed', collapsed);
        const toggle = document.querySelector('#transition-panel-toggle');
        toggle.textContent = collapsed ? 'Expand' : 'Collapse';
        toggle.title = collapsed ? 'Expand edit panel' : 'Collapse edit panel';
        toggle.setAttribute('aria-expanded', String(!collapsed));
    };
    const bind = (selector, event, action) => {
        const element = document.querySelector(selector);
        const listener = async () => {
            const error = document.querySelector('#transition-error');
            try { await action(element); error.hidden = true; } catch (e) { error.textContent = e.message; error.hidden = false; }
        };
        element.addEventListener(event, listener); events.push(() => element.removeEventListener(event, listener));
    };
    bind('#transition-pose', 'change', element => setPose(element.value));
    bind('#transition-panel-toggle', 'click', element => setPanelCollapsed(element.getAttribute('aria-expanded') === 'true'));
    bind('#transition-configuration', 'change', element => setConfiguration(element.value));
    bind('#transition-optimization', 'change', element => setOptimization(element.value));
    const experimentSelect = document.querySelector('#transition-experiment');
    for (const [value, label] of Object.entries(GRASS_TRANSITION_EXPERIMENTS)) experimentSelect.add(new Option(label, value));
    bind('#transition-experiment', 'change', element => setExperiment(element.value));
    bind('#transition-reset', 'click', () => setPose(pose));
    bind('#transition-full', 'click', () => setDistanceScale(1));
    bind('#transition-half', 'click', () => setDistanceScale(.5));
    bind('#transition-refresh', 'click', () => updateSelection(true));
    bind('#transition-helpers', 'change', element => setHelpers(element.checked));
    bind('#transition-soil', 'change', element => setSoilOnly(element.checked));
    bind('#transition-shadows', 'change', element => setShadows(element.checked));
    bind('#transition-drive', 'change', element => { drive = element.checked; });
    bind('#transition-speed', 'input', element => navigation.setSpeed(Number(element.value)));
    for (let i = 0; i < 4; i++) bind('#transition-limit-' + i, 'change', () => setSettings({
        distances: Array.from({ length: 4 }, (_, n) => Number(document.querySelector('#transition-limit-' + n).value)) }));
    bind('#transition-movement', 'change', element => setSettings({ movementThreshold: Number(element.value) }));
    bind('#transition-interval', 'change', element => setSettings({ intervalMs: Number(element.value) }));
    bind('#transition-side-leaves', 'change', element => setSettings({ sideLeafDistance: Number(element.value) }));
    bind('#transition-only-side-leaves', 'change', element => setSettings({ sideLeafDistance: Number(element.value) }));
    bind('#transition-mode', 'change', element => setSettings({ transitionMode: element.value }));
    bind('#transition-band', 'change', element => setSettings({ transitionFraction: Number(element.value) / 100 }));
    window.addEventListener('resize', resize);
    resize(); setPose(location.hash.slice(1) || 'front'); setSettings({});
    setConfiguration(new URLSearchParams(location.search).get('configuration') || 'distance');
    setOptimization(new URLSearchParams(location.search).get('optimization') || 'optimized');
    await setExperiment(new URLSearchParams(location.search).get('experiment')
        || (fields.getSnapshot().optimization === 'optimized' ? 'recommended' : 'baseline'));
    loading.textContent = 'Caching field shadows…'; refreshShadows();
    await renderer.compileAsync(scene, camera);
    selection.resetMetrics(); controls.forEach(control => { control.disabled = false; });
    loading.hidden = true; setAnimating(true); canvas.focus();
    return Object.freeze({ renderer, scene, camera, lighting, fields, selection, navigation, step, setAnimating, setPose, canopy: assets.canopy,
        setSettings, setDistanceScale, setSoilOnly, setShadows, setHelpers, setConfiguration, setOptimization, setExperiment, updateSelection, setPanelCollapsed,
        getSnapshot: () => ({ pose, configuration, experiment, soilOnly, helpers: showHelpers, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
            cameraHeight: GRASS_FIELD_BUS_CAMERA.heightMeters, cameraPitch: GRASS_FIELD_BUS_CAMERA.pitchDegrees,
            fields: fields.getSnapshot(), selection: selection.getSnapshot(), lighting: lighting.getSnapshot(),
            shadows: { enabled: renderer.shadowMap.enabled, canopyMode: fields.getSnapshot().optimization === 'original' ? 'general' : 'baked-only', generations: shadowGenerations, cached: !renderer.shadowMap.needsUpdate && !sun.shadow.needsUpdate,
                size: sun.shadow.mapSize.toArray(), canopyPass: assets.canopy.shadowUniforms.grassCanopyShadowPass.value,
                canopyExternalVisibility: 1 },
            performance: { renderedFrames, frameCpuTotalMs, frameCpuMaxMs, draw: { ...frameDraws }, gpuTimer: gpu.getDiagnostics() },
            canopy: assets.canopy.getSnapshot().bake, experiments: experiments.getSnapshot(), glError: renderer.getContext().getError() }),
        dispose() {
            setAnimating(false); events.forEach(remove => remove()); window.removeEventListener('resize', resize);
            gpu.resetSamples(); sun.shadow.dispose();
            navigation.dispose(); helpers.dispose(); fields.dispose(); experiments.dispose(); groundGeometry.dispose(); assets.dispose(); shadowTarget.dispose();
            lighting.dispose(); renderer.dispose();
        }
    });
}
