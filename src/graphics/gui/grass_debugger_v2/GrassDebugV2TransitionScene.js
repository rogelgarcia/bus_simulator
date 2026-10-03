// Interactive abrupt grass transitions with cached spatial selection and a soil-only baseline.
import * as THREE from 'three';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { createGrassDebugV2FreeCamera } from './GrassDebugV2FreeCamera.js?v=transition-navigation-1';
import { GRASS_FIELD_BUS_CAMERA } from './GrassDebugV2BusCamera.js';
import { loadGrassDebugV2TransitionAssets } from './GrassDebugV2TransitionAssets.js?v=lod4-shadow-fast-1';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js?v=lod4-interior-quads-1';
import { createGrassDebugV2TransitionHelpers } from './GrassDebugV2TransitionHelpers.js?v=lod4-flat-1';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js?v=side-leaf-cutoff-1';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';

const loading = document.querySelector('#scene-loading');
const controls = document.querySelectorAll('#scene-panel input, #scene-panel select, #scene-panel button');
controls.forEach(control => { control.disabled = true; });

async function start() {
    const canvas = document.querySelector('#scene-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .02, 250);
    const lighting = new GrassDebugV2Lighting({ renderer, scene, camera, retainSceneDepth: true });
    const assets = await loadGrassDebugV2TransitionAssets({ renderer, lighting, onProgress: message => { loading.textContent = message; } });
    const fields = createGrassDebugV2TransitionFields({ ...assets, fieldSize: 32, gap: 1 });
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
    const selection = new GrassDebugV2TransitionSelection({ cells: fields.cells });
    const helpers = createGrassDebugV2TransitionHelpers({ cells: fields.cells });
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
    let levels, shadowGenerations = 0, soilOnly = false, showHelpers = true, pose = 'front';
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
            levels = flatLevels;
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
        levels = result.levels;
        if (force || result.changedCount || result.sideLeavesChangedCount) fields.applyLevels(levels, result.sideLeaves);
        if (result.scanned && showHelpers) helpers.update(levels, camera.position, selection.getSnapshot().effectiveDistances);
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
            if (!soilOnly) fields.applyLevels(levels);
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
        if (value && levels) helpers.update(levels, camera.position, configuration !== 'distance' ? null : selection.getSnapshot().effectiveDistances);
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
    const setSettings = settings => {
        selection.setSettings(settings); updateSelection(true);
        const state = selection.getSnapshot();
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
    const bind = (selector, event, action) => {
        const element = document.querySelector(selector);
        const listener = () => {
            const error = document.querySelector('#transition-error');
            try { action(element); error.hidden = true; } catch (e) { error.textContent = e.message; error.hidden = false; }
        };
        element.addEventListener(event, listener); events.push(() => element.removeEventListener(event, listener));
    };
    bind('#transition-pose', 'change', element => setPose(element.value));
    bind('#transition-configuration', 'change', element => setConfiguration(element.value));
    bind('#transition-optimization', 'change', element => setOptimization(element.value));
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
    window.addEventListener('resize', resize);
    resize(); setPose(location.hash.slice(1) || 'front'); setSettings({});
    setConfiguration(new URLSearchParams(location.search).get('configuration') || 'distance');
    setOptimization(new URLSearchParams(location.search).get('optimization') || 'optimized');
    loading.textContent = 'Caching field shadows…'; refreshShadows();
    await renderer.compileAsync(scene, camera);
    selection.resetMetrics(); controls.forEach(control => { control.disabled = false; });
    loading.hidden = true; setAnimating(true); canvas.focus();
    return Object.freeze({ renderer, scene, camera, lighting, fields, selection, navigation, step, setAnimating, setPose,
        setSettings, setDistanceScale, setSoilOnly, setShadows, setHelpers, setConfiguration, setOptimization, updateSelection,
        getSnapshot: () => ({ pose, configuration, soilOnly, helpers: showHelpers, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
            cameraHeight: GRASS_FIELD_BUS_CAMERA.heightMeters, cameraPitch: GRASS_FIELD_BUS_CAMERA.pitchDegrees,
            fields: fields.getSnapshot(), selection: selection.getSnapshot(),
            shadows: { enabled: renderer.shadowMap.enabled, canopyMode: fields.getSnapshot().optimization === 'original' ? 'general' : 'baked-only', generations: shadowGenerations, cached: !renderer.shadowMap.needsUpdate && !sun.shadow.needsUpdate,
                size: sun.shadow.mapSize.toArray(), canopyPass: assets.canopy.shadowUniforms.grassCanopyShadowPass.value,
                canopyExternalVisibility: 1 },
            performance: { renderedFrames, frameCpuTotalMs, frameCpuMaxMs, draw: { ...frameDraws }, gpuTimer: gpu.getDiagnostics() },
            canopy: assets.canopy.getSnapshot().bake, glError: renderer.getContext().getError() }),
        dispose() {
            setAnimating(false); events.forEach(remove => remove()); window.removeEventListener('resize', resize);
            gpu.resetSamples(); sun.shadow.dispose();
            navigation.dispose(); helpers.dispose(); fields.dispose(); groundGeometry.dispose(); assets.dispose(); shadowTarget.dispose();
            lighting.dispose(); renderer.dispose();
        }
    });
}

window.__grassTransitionReadiness = start().then(viewer => {
    window.__grassTransitionScene = viewer; return viewer.getSnapshot();
}).catch(error => {
    loading.hidden = false; loading.textContent = 'Unable to load transition lab. ' + error.message;
    console.error(error); throw error;
});
