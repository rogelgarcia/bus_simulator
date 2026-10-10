// Separate nine-field comparison with one camera, matched rendering and independent material strategies.
// @ts-check
import * as THREE from 'three';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { loadGrassDebugV2TransitionAssets } from './GrassDebugV2TransitionAssets.js';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js';
import { createGrassDebugV2ViewCards } from './GrassDebugV2ViewCards.js';
import { createGrassDebugV2BakedLightingAssets } from './GrassDebugV2BakedLightingAssets.js';
import { createGrassDebugV2CanopyShadows } from './GrassDebugV2CanopyShadows.js';
import { createGrassDebugV2FreeCamera } from './GrassDebugV2FreeCamera.js';
import { GRASS_FIELD_BUS_CAMERA, GRASS_FIELD_BUS_VIEWS } from './GrassDebugV2BusCamera.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { benchmarkGrassBakedLighting } from './GrassDebugV2BakedLightingBenchmark.js';
import { configureGrassDebugV2TransitionAppearance } from './GrassDebugV2DistanceAppearance.js';

const el = id => document.getElementById(id);
const origins = [-19, -6, 7].flatMap(z => [-19, -6, 7].map(x => [x, z]));
const busViews = [...GRASS_FIELD_BUS_VIEWS, ...[20, 25, 30, 35, 40, 45, 32, 48, 64].flatMap(range => GRASS_FIELD_BUS_VIEWS.slice(0, 3).map(view => ({ ...view,
    id: view.id.replace('14m', range + 'm'), label: view.label.replace('14 m', range + ' m'), horizontalRangeMeters: range,
    target: [0, GRASS_FIELD_BUS_CAMERA.heightMeters - range * Math.tan(THREE.MathUtils.degToRad(GRASS_FIELD_BUS_CAMERA.pitchDegrees)), 0] })))];

function surroundingGround(assets) {
    const axis = [-120, -19, -7, -6, 6, 7, 19, 120], positions = [], uv = [], indices = [];
    const coordinate = new THREE.Vector3();
    for (const z of axis) for (const x of axis) {
        positions.push(x, 0, z); coordinate.set(x, z, 1).applyMatrix3(assets.soilUv); uv.push(coordinate.x, coordinate.y);
    }
    for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) {
        if ([1, 3, 5].includes(x) && [1, 3, 5].includes(z)) continue;
        const a = z * 8 + x, b = a + 8; indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, assets.soilMaterial); mesh.receiveShadow = true; return mesh;
}

/** Mount the independent lab in grass_baked_lighting_scene.html. */
export async function createGrassDebugV2BakedLightingScene() {
    const params = new URLSearchParams(location.search);
    const onProgress = message => { el('scene-loading').textContent = message; };
    const canvas = el('scene-canvas'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .02, 300);
    const lighting = new GrassDebugV2Lighting({ renderer, scene, camera });
    lighting.pipeline?.dispose(); lighting.pipeline = null;
    const assets = await loadGrassDebugV2TransitionAssets({ renderer, lighting, externalShadows: true, extraCardBaseDensity: .6, onProgress });
    const currentCards = [];
    for (const profile of ['near', 'bridge']) currentCards.push(await createGrassDebugV2ViewCards({ renderer, source: assets.sources.LOD2, profile, onProgress }));
    onProgress('Preparing baked colors and coverage…');
    const bakedAssets = await createGrassDebugV2BakedLightingAssets({ renderer, assets, lighting, onProgress, appearance: params.get('appearance') || 'detailed' });
    const bakedRepresentations = bakedAssets.blades ?? bakedAssets.cards;
    const representation = card => ({ templates: card.templates.cards, material: card.material, textureBytes: card.getSnapshot().textureBytes });
    const current = createGrassDebugV2TransitionFields({ ...assets, origins, fieldSize: 12, bridge: representation(currentCards[1]) });
    const baked = createGrassDebugV2TransitionFields({ ...assets, ...bakedAssets, origins, fieldSize: 12, bridge: representation(bakedRepresentations[1]) });
    current.setLod3Representation(representation(currentCards[0])); baked.setLod3Representation(representation(bakedRepresentations[0]));
    const sets = { current, baked };
    for (const fields of Object.values(sets)) { fields.setEdgeStrips(true); fields.setFadeStyle('dissolve'); scene.add(fields.group); }
    baked.group.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
    const ground = surroundingGround(assets); scene.add(ground);
    const structure = new THREE.Group(), structureMaterial = new THREE.MeshStandardMaterial({ color: 0xbcc0a4, roughness: .85 });
    for (const [size, position] of [[[4, .08, 4], [0, 2.4, 0]], ...[-1.9, 1.9].flatMap(x => [-1.9, 1.9].map(z => [[.07, 2.4, .07], [x, 1.2, z]]))]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), structureMaterial); mesh.position.fromArray(position); mesh.castShadow = mesh.receiveShadow = true; structure.add(mesh);
    }
    structure.visible = params.get('shelter') !== '0'; scene.add(structure); lighting.applyEnvironment();
    lighting.sunBloom.group.visible = lighting.sunRays.group.visible = lighting.sunFlare.group.visible = false;
    lighting.sun.position.copy(lighting.sunRef.direction).multiplyScalar(100);
    Object.assign(lighting.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: .1, far: 180 });
    lighting.sun.shadow.mapSize.set(4096, 4096); lighting.sun.shadow.normalBias = .001;
    lighting.sun.shadow.camera.updateProjectionMatrix();
    const shadowReceivers = { getSnapshot: () => ({ bounds: { minX: -19, minZ: -19, maxX: 19, maxZ: 19 } }),
        getCanopyMeshes: () => { const receivers = []; current.group.traverseVisible(mesh => { if (mesh.isMesh && mesh.userData.grassCanopy) receivers.push(mesh); }); return receivers; } };
    const cachedShadows = createGrassDebugV2CanopyShadows({ renderer, scene, sun: lighting.sun, fields: shadowReceivers, canopy: assets.canopy });
    const noSides = new Uint8Array(current.cells.length);
    baked.group.visible = false; current.applyLevels(new Uint8Array(current.cells.length).fill(5), noSides); cachedShadows.update();
    const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
    current.applyLevels(new Uint8Array(current.cells.length).fill(2));
    renderer.shadowMap.needsUpdate = lighting.sun.shadow.needsUpdate = true;
    renderer.setRenderTarget(shadowTarget); renderer.render(scene, camera);
    const referenceShadowMap = lighting.sun.shadow.map;
    lighting.sun.shadow.map = null; current.setSoilOnly(true);
    renderer.shadowMap.needsUpdate = lighting.sun.shadow.needsUpdate = true; renderer.render(scene, camera);
    const externalShadowMap = lighting.sun.shadow.map;
    current.setSoilOnly(false); renderer.setRenderTarget(null); shadowTarget.dispose();
    const cachedVisibility = assets.canopy.shadowUniforms.grassCanopyShadowVisibility.value;
    const whiteVisibility = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); whiteVisibility.needsUpdate = true;
    const selection = new GrassDebugV2TransitionSelection({ cells: current.cells,
        ...(bakedAssets.blades ? { distances: [.6, .8, 20, 30, 40], transitionFraction: .1 } : {}) });
    const gpu = getOrCreateGpuFrameTimer(renderer), draw = { triangles: 0, calls: 0 };
    let strategy = 'split', lod = 'AUTO', pose = 'bus_19m_front', animating = false, frame = null, previous = performance.now(), drive = false, busy = false;
    let cpuMs = 0, lastTelemetry = 0, split = .5, externalShadows = true;
    const navigation = createGrassDebugV2FreeCamera({ camera, canvas, horizontal: true, lookButtons: [1], onChange() {}, onSpeedChange() {},
        onReset() {
            const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); rotation.x = -THREE.MathUtils.degToRad(GRASS_FIELD_BUS_CAMERA.pitchDegrees); rotation.z = 0;
            camera.position.y = GRASS_FIELD_BUS_CAMERA.heightMeters; camera.quaternion.setFromEuler(rotation); updateSelection(true);
        } });
    navigation.setSpeed(3);
    function updateSelection(force = false) {
        if (lod !== 'AUTO') return;
        const result = selection.update(camera.position, performance.now(), { force });
        if (force || result.changedCount || result.sideLeavesChangedCount || result.renderChangedCount)
            for (const fields of Object.values(sets)) fields.applyLevels(result.levels, result.sideLeaves, result.renderMasks);
    }
    function setLod(value) {
        if (!['AUTO', 'OFF', 'LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5'].includes(value)) throw new Error('Unknown LOD: ' + value);
        lod = value; el('lod').value = value;
        for (const fields of Object.values(sets)) {
            fields.setSoilOnly(value === 'OFF');
            if (value !== 'AUTO' && value !== 'OFF') fields.applyLevels(new Uint8Array(fields.cells.length).fill(Number(value.slice(3))), noSides);
        }
        updateSelection(true);
    }
    function setStrategy(value) {
        if (!['split', 'current', 'baked'].includes(value)) throw new Error('Unknown strategy: ' + value);
        strategy = value; el('strategy').value = value; el('split-labels').hidden = value !== 'split';
    }
    function setPose(id) {
        navigation.clear(); pose = id;
        if (id === 'overview') { camera.position.set(27, 28, 35); camera.lookAt(0, 0, 0); }
        else {
            const view = busViews.find(view => view.id === id);
            if (!view) throw new Error('Unknown camera pose: ' + id);
            const angle = THREE.MathUtils.degToRad(view.azimuth), range = view.horizontalRangeMeters;
            camera.position.set(Math.sin(angle) * range, GRASS_FIELD_BUS_CAMERA.heightMeters, Math.cos(angle) * range);
            camera.lookAt(...view.target);
        }
        camera.updateMatrixWorld(true); updateSelection(true); el('pose').value = id;
    }
    function setExternalShadows(value) {
        if (typeof value !== 'boolean') throw new Error('External shadow setting must be boolean.');
        externalShadows = value; bakedAssets.settings.shadows.value = Number(value);
        assets.canopy.shadowUniforms.grassCanopyShadowVisibility.value = value ? cachedVisibility : whiteVisibility;
        lighting.sun.shadow.intensity = Number(value);
        el('external-shadows').checked = value;
    }
    function resize() {
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    }
    const forward = new THREE.Vector3();
    function step(dt = 1 / 60) {
        const start = performance.now(); navigation.update(dt);
        if (drive && !busy) { camera.getWorldDirection(forward); forward.y = 0; camera.position.addScaledVector(forward.normalize(), navigation.getSpeed() * dt); }
        updateSelection(); camera.updateMatrixWorld(true); lighting.sky.position.copy(camera.position);
        gpu.poll(); gpu.beginFrame(); renderer.info.reset(); renderer.info.autoReset = false;
        try {
            if (strategy === 'split') {
                renderer.setScissorTest(true);
                for (const [name, x, width] of [['current', 0, innerWidth * split], ['baked', innerWidth * split, innerWidth * (1 - split)]]) {
                    current.group.visible = name === 'current'; baked.group.visible = name === 'baked';
                    lighting.sun.shadow.map = name === 'current' && lod !== 'OFF' ? referenceShadowMap : externalShadowMap;
                    renderer.setScissor(x, 0, width, innerHeight); renderer.render(scene, camera);
                }
                renderer.setScissorTest(false);
            } else {
                current.group.visible = strategy === 'current'; baked.group.visible = strategy === 'baked';
                lighting.sun.shadow.map = strategy === 'current' && lod !== 'OFF' ? referenceShadowMap : externalShadowMap;
                renderer.render(scene, camera);
            }
        } finally { gpu.endFrame(); renderer.info.autoReset = true; }
        draw.triangles = renderer.info.render.triangles; draw.calls = renderer.info.render.calls; cpuMs = performance.now() - start;
        if (performance.now() - lastTelemetry > 400) {
            el('scene-performance').textContent = `${strategy} · ${lod} · GPU ${gpu.getLastMs()?.toFixed(2) ?? '—'} ms · CPU ${cpuMs.toFixed(2)} ms · ${draw.triangles.toLocaleString()} triangles · ${draw.calls} draws`;
            lastTelemetry = performance.now();
        }
    }
    function tick(now) { if (!animating) return; const dt = Math.min(.05, (now - previous) / 1000); previous = now; step(dt); frame = requestAnimationFrame(tick); }
    function setAnimating(value) { animating = value; if (frame !== null) cancelAnimationFrame(frame); frame = null; if (value) { previous = performance.now(); frame = requestAnimationFrame(tick); } }
    const listeners = [];
    const listen = (target, event, callback) => { target.addEventListener(event, callback); listeners.push(() => target.removeEventListener(event, callback)); };
    el('pose').innerHTML = [...busViews.map(view => `<option value="${view.id}">${view.label}</option>`), '<option value="overview">Overview</option>'].join('');
    listen(el('strategy'), 'change', event => setStrategy(event.target.value)); listen(el('lod'), 'change', event => setLod(event.target.value));
    listen(el('pose'), 'change', event => setPose(event.target.value)); listen(el('reset'), 'click', () => setPose(pose));
    listen(el('split'), 'input', event => { split = Number(event.target.value) / 100; });
    listen(el('drive'), 'change', event => { drive = event.target.checked; });
    listen(el('brightness'), 'input', event => { bakedAssets.settings.brightness.value = Number(event.target.value); el('brightness-value').textContent = Number(event.target.value).toFixed(2); });
    listen(el('external-shadows'), 'change', event => setExternalShadows(event.target.checked));
    listen(el('panel-toggle'), 'click', () => { el('panel-body').hidden = !el('panel-body').hidden; el('panel-toggle').textContent = el('panel-body').hidden ? 'Expand' : 'Collapse'; el('panel-toggle').setAttribute('aria-expanded', String(!el('panel-body').hidden)); });
    listen(window, 'resize', resize);
    const api = Object.freeze({ gpu, step, setAnimating, setLod, setStrategy, setPose, setExternalShadows,
        setCamera(position, target) { camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld(true); updateSelection(true); },
        setSunIntensity(value) { if (!(value >= 0 && Number.isFinite(value))) throw new Error('Invalid sun intensity.'); lighting.sun.intensity = value; },
        getSnapshot: () => ({ strategy, lod, pose, animating, externalShadows, shelter: structure.visible, brightness: bakedAssets.settings.brightness.value,
            camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() }, width: canvas.width, height: canvas.height,
            fields: { current: current.getSnapshot(), baked: baked.getSnapshot() }, selection: selection.getSnapshot(),
            appearance: bakedAssets.getSnapshot(), lighting: lighting.getSnapshot(), shadows: cachedShadows.getSnapshot(), draw: { ...draw }, cpuMs }),
        benchmark: options => benchmarkGrassBakedLighting(api, options),
        dispose() { setAnimating(false); listeners.forEach(remove => remove()); navigation.dispose();
            Object.values(sets).forEach(fields => fields.dispose()); cachedShadows.dispose(); bakedAssets.dispose(); currentCards.forEach(card => card.dispose());
            ground.geometry.dispose(); structure.traverse(mesh => { if (mesh.isMesh) mesh.geometry.dispose(); }); structureMaterial.dispose();
            referenceShadowMap.dispose(); externalShadowMap.dispose(); whiteVisibility.dispose(); assets.dispose(); lighting.dispose(); renderer.dispose(); }
    });
    listen(el('benchmark'), 'click', async () => {
        if (busy) return; busy = true;
        const controls = [...el('panel-body').querySelectorAll('button,input,select')]; controls.forEach(control => { control.disabled = true; });
        try {
            const result = await api.benchmark({ onProgress: message => { el('benchmark').textContent = message; } });
            const section = document.createElement('section'); section.className = 'benchmark-run';
            section.innerHTML = `<p>${new Date(result.timestamp).toLocaleTimeString()} · ${result.pose} · ${result.rounds} paired rounds · before: original lighting, after: baked colors</p><table><tr><th>Version</th><th>LOD</th><th>Soil ms</th><th>+ Grass ms</th><th>= GPU ms</th><th>Round range</th><th>CPU ms</th></tr>${result.results.map(row => `<tr><td>${row.strategy === 'current' ? 'Before' : 'After'}</td><td>${row.lod}</td><td>${row.soilGpuMs.toFixed(3)}</td><td>${row.aboveSoilMs.toFixed(3)}</td><td>${row.gpuMs.toFixed(3)}</td><td>${row.roundRangeMs.map(value => value.toFixed(3)).join('…')}</td><td>${row.cpuMs.toFixed(3)}</td></tr>`).join('')}</table>`;
            el('benchmark-results').prepend(section);
        } catch (error) { el('scene-performance').textContent = error.message; console.error(error); }
        finally { busy = false; controls.forEach(control => { control.disabled = false; }); el('benchmark').textContent = 'Benchmark vs soil'; }
    });
    const selectionState = selection.getSnapshot();
    Object.values(sets).forEach(fields => fields.configureBlend(selectionState.transitionBands, selectionState.bridgeEnabled));
    const referenceMaterials = new Set(); current.group.traverse(mesh => { if (mesh.isMesh) referenceMaterials.add(mesh.material); });
    configureGrassDebugV2TransitionAppearance(referenceMaterials, selectionState.effectiveDistances);
    resize(); setPose(params.get('pose') || 'bus_19m_front');
    setLod(params.get('lod') || 'AUTO'); setStrategy(params.get('strategy') || 'split'); step(0);
    el('scene-loading').hidden = true; setAnimating(true);
    return api;
}
