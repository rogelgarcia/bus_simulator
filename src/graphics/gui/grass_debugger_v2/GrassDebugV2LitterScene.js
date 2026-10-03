// Opens one to nine shared copies of the exported grass field with LOD selection and a free camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { primePbrAssetsAvailability } from '../../content3d/materials/PbrAssetsRuntime.js';
import { resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js?v=cursor-distance-1';
import { createGrassDebugV2CursorDistance } from './GrassDebugV2CursorDistance.js?v=cursor-distance-1';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';
import { applyGrassDebugV2DistanceAppearance, GRASS_FIELD_DISTANCE_APPEARANCE } from './GrassDebugV2DistanceAppearance.js';
import { cloneMaterialShaderContract } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { createGrassDebugV2FreeCamera } from './GrassDebugV2FreeCamera.js';
import { createGrassDebugV2FieldLod } from './GrassDebugV2FieldLod1.js?v=lod3-plates-2';
import { createGrassDebugV2FieldLayout } from './GrassDebugV2FieldLayout.js?v=lod3-bus-detail-1';
import { createGrassDebugV2LitterSoilSurface } from './GrassDebugV2LitterSoilSurface.js?v=lod3-bus-detail-1';
import { createGrassDebugV2FieldDetail } from './GrassDebugV2FieldDetail.js?v=lod3-bus-detail-1';
import { GRASS_FIELD_BUS_VIEWS } from './GrassDebugV2BusCamera.js';

import { createGrassDebugV2FieldCanopy } from './GrassDebugV2FieldCanopy.js?v=lod4-wall-detail-1';
import { createGrassDebugV2FieldShadows, grassFieldShadowSource } from './GrassDebugV2FieldShadows.js?v=lod234-comparison-1';
import { createGrassDebugV2CanopyShadows } from './GrassDebugV2CanopyShadows.js?v=lod4-self-shadow-1';

const ROOT = '/tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/';
const loading = document.querySelector('#scene-loading');
const patternPreview = document.createElement('canvas');
patternPreview.width = patternPreview.height = 384;
patternPreview.className = 'scene-pattern-preview';
patternPreview.setAttribute('aria-label', 'Repeating grass source layout during automatic optimization');
function showPatternPreview({ channels, size, rgba, width, height }) {
    if (rgba) {
        patternPreview.width = width; patternPreview.height = height;
        patternPreview.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
        patternPreview.setAttribute('aria-label', 'Rendered LOD4 candidate with self-shadows');
        loading.append(patternPreview); return;
    }
    patternPreview.width = patternPreview.height = 384;
    const tile = document.createElement('canvas'); tile.width = tile.height = size;
    const context = tile.getContext('2d'), pixels = context.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
        const leaf = channels[0][i], light = .65 + .35 * Math.abs(channels[1][i] * .4 + channels[2][i] * .82 + channels[3][i] * .4);
        const rgb = leaf ? [112 * light, 151 * light, 58 * light] : [80, 69, 51];
        pixels.data.set([...rgb, 255], i * 4);
    }
    context.putImageData(pixels, 0, 0);
    const preview = patternPreview.getContext('2d');
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) preview.drawImage(tile, x * 128, y * 128, 128, 128);
    loading.append(patternPreview);
}
const SCENE_MODES = Object.freeze({
    all: Object.freeze({ grass: true, litter: true }),
    grass: Object.freeze({ grass: true, litter: false }),
    soil: Object.freeze({ grass: false, litter: false })
});

async function start() {
    const query = new URLSearchParams(location.search);
    const response = await fetch(ROOT + 'scene.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Scene manifest unavailable: ' + response.status);
    const manifest = await response.json();
    manifest.views.push(...GRASS_FIELD_BUS_VIEWS);
    const canvas = document.querySelector('#scene-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 150);
    const lighting = new GrassDebugV2Lighting({ renderer, scene, camera, retainSceneDepth: true });
    lighting.settings = { ...lighting.settings, ibl: { ...lighting.settings.ibl, iblId: manifest.lighting.environmentId } };
    lighting.sunRef.direction.fromArray(manifest.lighting.sunDirection);
    lighting.sunRef.color.fromArray(manifest.lighting.sunColorLinear);
    lighting.sunRef.intensity = manifest.lighting.sunIntensity;
    lighting.sun.color.copy(lighting.sunRef.color); lighting.sun.intensity = lighting.sunRef.intensity;
    lighting.hemi.intensity = manifest.lighting.hemisphereIntensity;
    renderer.toneMappingExposure = manifest.lighting.exposure;
    lighting.pipeline?.setToneMapping({ toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure });
    await primePbrAssetsAvailability();
    const litterOrmUrl = new URL(resolvePbrMaterialPipeline('pbr.dry_litter').urls.ormUrl, location.href);
    litterOrmUrl.searchParams.set('v', 'orm-repair-1');
    const [loaded, , litterOrm] = await Promise.all([
        new GLTFLoader().loadAsync(ROOT + '96000_leaves.glb?v=' + manifest.sourceHashes['src/graphics/gui/grass_debugger_v2/GrassDebugV2LitterSubstrate.js'], event => {
            const total = event.total || manifest.exportBytes;
            loading.textContent = 'Loading grass scene · ' + Math.min(100, Math.round(event.loaded / total * 100)) + '%';
        }),
        lighting.loadEnvironment(), new THREE.TextureLoader().loadAsync(litterOrmUrl.href)
    ]);
    const litterOrmTextures = new Set(), oldLitterTextures = new Set(), repairedLitterMaterials = new Set();
    // The older GLB embeds the truncated ORM. Resolve the repaired catalog map
    // for every litter material so LOD2, merged ground and LOD4 use the same data.
    loaded.scene.traverse(mesh => {
        if (!mesh.isMesh || !mesh.material.name.startsWith('DryLitter')) return;
        const material = mesh.material;
        if (repairedLitterMaterials.has(material)) return;
        repairedLitterMaterials.add(material);
        const texture = material.roughnessMap.clone();
        texture.source = litterOrm.source; texture.flipY = litterOrm.flipY;
        texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;
        for (const name of ['roughnessMap', 'metalnessMap', 'aoMap']) { oldLitterTextures.add(material[name]); material[name] = texture; }
        litterOrmTextures.add(texture);
    });
    oldLitterTextures.forEach(texture => texture?.dispose()); litterOrm.dispose();
    loading.textContent = 'Preparing grass and lighting…';
    const field = loaded.scene.getObjectByName('Offline_96000_Leaves');
    if (!field) throw new Error('The exported grass field is missing.');
    let triangles = 0;
    field.traverse(mesh => {
        if (!mesh.isMesh) return;
        const original = mesh.material;
        mesh.material = createGrassDebugV2Material({
            vertexColors: true, color: original.color, roughness: original.roughness,
            normalMap: original.normalMap, normalScale: original.normalScale,
            roughnessMap: original.roughnessMap,
            defines: { GRASS_LEAF_TRANSLUCENCY: 1, USE_UV: 1 }
        });
        original.dispose();
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    });
    const substrate = loaded.scene.getObjectByName('GrassV2DryLitterSubstrate');
    if (!substrate || triangles !== manifest.triangles) throw new Error('Exported field does not match its scene manifest.');
    let sceneTriangles = 0, soilTriangles = 0, mode = 'all', soilMesh;
    loaded.scene.traverse(mesh => {
        if (!mesh.isMesh) return;
        const meshTriangles = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        sceneTriangles += meshTriangles;
        if (mesh.material.name === 'Brown Earth') { soilTriangles += meshTriangles; soilMesh = mesh; }
        mesh.receiveShadow = true;
        mesh.castShadow = mesh.parent === field || !mesh.material.name.startsWith('DryLitter') && mesh.material.name !== 'Brown Earth';
        if (mesh.material.name.startsWith('DryLitter')) {
            mesh.material.alphaToCoverage = true; mesh.material.polygonOffset = true;
            mesh.material.polygonOffsetFactor = -1; mesh.material.polygonOffsetUnits = -1; mesh.renderOrder = 1;
        }
        for (const map of [mesh.material.map, mesh.material.normalMap, mesh.material.roughnessMap, mesh.material.metalnessMap, mesh.material.aoMap]) {
            if (map) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        }
    });
    if (!soilTriangles) throw new Error('The exported soil is missing.');
    const lod0Meshes = field.children.filter(mesh => mesh.isMesh);
    loading.textContent = 'Preparing grass LODs…';
    const makeField = lod => createGrassDebugV2FieldLod({ lod, placements: manifest.placements, seed: manifest.seed, material: lod0Meshes[0].material });
    const fieldLod1 = makeField('LOD1'), fieldLod2 = makeField('LOD2'), smartLod0 = makeField('LOD0_SMART');
    const canopy = await createGrassDebugV2FieldCanopy({ renderer, source: fieldLod2.mesh, lod2: fieldLod2.mesh, soil: soilMesh, litter: substrate,
        width: manifest.widthMeters, depth: manifest.depthMeters, shadowDirection: lighting.sunRef.direction, lighting,
        compileLayout: query.get('compileLod4Layout') === '1',
        mapResolutions: Object.fromEntries(['albedo', 'normal', 'roughness'].filter(name => query.has('canopy' + name))
            .map(name => [name, Number(query.get('canopy' + name))])),
        onProgress: message => { loading.textContent = message; }, onPatternPreview: showPatternPreview });
    const relief = canopy.relief;
    const detail = createGrassDebugV2FieldDetail({ source: fieldLod2.mesh, width: manifest.widthMeters, depth: manifest.depthMeters });
    // Keep the reference, bake inputs and cached shadow geometry unchanged.
    const sourceMaterial = fieldLod2.mesh.material;
    const fieldMaterial = cloneMaterialShaderContract(sourceMaterial);
    fieldMaterial.userData = { ...sourceMaterial.userData };
    fieldMaterial.name = 'GrassField-LOD2-Distance';
    applyGrassDebugV2DistanceAppearance(fieldMaterial);
    applyGrassDebugV2DistanceAppearance(detail.material);
    fieldLod2.mesh.material = fieldMaterial;
    canopy.group.traverse(mesh => { if (mesh.isMesh && mesh.material === sourceMaterial) mesh.material = fieldMaterial; });
    for (const mesh of [...lod0Meshes, fieldLod1.mesh, fieldLod2.mesh, smartLod0.mesh]) {
        mesh.userData.grassLeafCount = manifest.leaves;
        delete mesh.userData.grassLeafRanges;
    }
    fieldLod1.mesh.visible = fieldLod2.mesh.visible = smartLod0.mesh.visible = detail.group.visible = canopy.group.visible = false;
    field.add(fieldLod1.mesh, fieldLod2.mesh, smartLod0.mesh, detail.group, canopy.group);
    let lod = 'LOD0';
    const lods = Object.freeze({
        LOD0: Object.freeze({ leaves: manifest.leaves, triangles, trianglesPerLeaf: manifest.trianglesPerLeaf, maximumTrianglesPerLeaf: 50 }),
        LOD1: Object.freeze(fieldLod1.getSnapshot()), LOD2: Object.freeze(fieldLod2.getSnapshot()),
        get LOD3() { return detail.getSnapshot(); },
        LOD0_SMART: Object.freeze(smartLod0.getSnapshot()), get LOD4() { return canopy.getSnapshot(); },
        'LOD2+4': Object.freeze({ alternating: ['LOD2', 'LOD4'] }),
        'LOD2+3+4': Object.freeze({ alternating: ['LOD2', 'LOD3', 'LOD4'] })
    });
    const fields = createGrassDebugV2FieldLayout({
        parent: loaded.scene, field, substrate, lod1: fieldLod1.mesh, lod2: fieldLod2.mesh, lod3: detail.group, lod4: canopy.group, smartLod0: smartLod0.mesh,
        widthMeters: manifest.widthMeters, depthMeters: manifest.depthMeters, leavesPerField: manifest.leaves
    });
    const litterSurface = createGrassDebugV2LitterSoilSurface({ parent: loaded.scene, soil: soilMesh, fields });
    const syncSurface = () => {
        litterSurface.sync(SCENE_MODES[mode].litter, ['LOD4', 'LOD2+4', 'LOD2+3+4'].includes(lod) && mode !== 'soil' ? canopy.footprint : null);
        loaded.scene.traverse(mesh => {
            if (mesh.isMesh && mesh.userData.grassCanopy) mesh.material = canopy.materials[mode === 'all' ? 'all' : 'grass'];
            if (mesh.isMesh && mesh.userData.grassCanopyWall) mesh.material = canopy.wall.materials[mode === 'all' ? 'all' : 'grass'][mesh.userData.grassCanopyWall-1];
            if (mesh.isMesh && mesh.userData.grassCanopyRelief) mesh.material = canopy.reliefMaterials[mode === 'all' ? 'all' : 'grass'];
        });
    };
    let litterTriangles = 0;
    substrate.traverse(mesh => {
        if (mesh.isMesh) litterTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    });
    const fixedTriangles = sceneTriangles - triangles - litterTriangles;
    const counts = document.querySelector('#scene-counts');
    let visibleCounts;
    counts.title = 'Camera-visible mesh counts for the selected LOD and layers. Partially visible meshes are counted in full; shadow and post-processing passes are excluded. LOD3 counts retained leaves in visible 3 m chunks. LOD4 counts source roots represented by the texture plus live perimeter leaves.';
    const updateCounts = () => {
        visibleCounts = fields.countInView(camera);
        const { count } = fields.getSnapshot();
        const label = (count > 1 ? count + ' fields · ' : '') + manifest.widthMeters + ' × ' + manifest.depthMeters
            + (count > 1 ? ' m each · ' : ' m · ')
            + visibleCounts.visibleLeaves.toLocaleString('en-US') + ' leaves · '
            + visibleCounts.visibleTriangles.toLocaleString('en-US') + ' triangles';
        if (counts.textContent !== label) counts.textContent = label;
    };
    updateCounts();
    scene.add(loaded.scene);
    lighting.applyEnvironment();
    const { halfExtent, far, bias, normalBias, mapSize } = manifest.shadow;
    const sun = lighting.sun;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const canopyShadows = createGrassDebugV2CanopyShadows({ renderer, scene, sun, fields, canopy });
    const fieldShadows = createGrassDebugV2FieldShadows({ renderer, scene, camera, sun, fields, lighting, canopyShadows });
    sun.position.copy(lighting.sunRef.direction).multiplyScalar(20);
    sun.target.position.set(0, 0, 0);
    Object.assign(sun.shadow.camera, { left: -halfExtent, right: halfExtent, bottom: -halfExtent, top: halfExtent, near: 0.05, far });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = bias; sun.shadow.normalBias = normalBias;
    sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
    const fitFieldShadows = () => {
        const { count, bounds } = fields.getSnapshot();
        const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
        const extent = count === 1 ? halfExtent : Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 1;
        const distance = Math.max(20, extent + 5), shadowFar = Math.max(far, distance * 2);
        sun.target.position.copy(center); sun.position.copy(lighting.sunRef.direction).multiplyScalar(distance).add(center);
        Object.assign(sun.shadow.camera, { left: -extent, right: extent, bottom: -extent, top: extent, far: shadowFar });
        sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = bias * (far - 0.05) / (shadowFar - 0.05);
        sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
    };

    let dirty = true, selected = manifest.views.findIndex(view => view.id === location.hash.slice(1));
    if (selected < 0) selected = 5;
    const speed = document.querySelector('#scene-speed'), speedLabel = document.querySelector('#speed-label');
    const navigation = createGrassDebugV2FreeCamera({
        camera, canvas, onChange: () => { dirty = true; },
        onSpeedChange: value => { speed.value = Math.log10(value); speedLabel.textContent = value.toFixed(2) + ' m/s'; }
    });
    const gpuTimer = getOrCreateGpuFrameTimer(renderer);
    const performanceLabel = document.querySelector('#scene-performance');
    let previous = performance.now(), frame, lastRenderedAt = null, sampleFrames = 0, sampleTime = 0;
    let gpuSequence = 0, gpuDisjointCount = 0, gpuSamples = 0, gpuTotalMs = 0;
    const frameStats = { fps: null, gpuTimeMs: null, renderedFrames: 0 };
    const updatePerformanceLabel = () => {
        const gpu = gpuTimer.getDiagnostics(), cursor = cursorDistance.getSnapshot();
        performanceLabel.textContent = 'FPS ' + (frameStats.fps === null ? '—' : frameStats.fps.toFixed(1))
            + (gpu.active ? ' · GPU ' + (frameStats.gpuTimeMs === null ? '—' : frameStats.gpuTimeMs.toFixed(2)) + ' ms' : ' · GPU unavailable')
            + ' · Distance ' + (cursor.error ? 'unavailable' : cursor.distanceMeters === null ? '—' : cursor.distanceMeters.toFixed(2) + ' m');
        performanceLabel.title = gpu.active ? 'Average GPU render time, including post-processing.'
            : 'GPU timer unavailable: ' + gpu.disabledReason;
        performanceLabel.title += ' Distance from the camera to the visible surface under the mouse.';
    };
    const cursorDistance = createGrassDebugV2CursorDistance({ renderer, camera, pipeline: lighting.pipeline, onChange: updatePerformanceLabel });
    const resetTiming = () => {
        previous = performance.now(); lastRenderedAt = null; sampleFrames = 0; sampleTime = 0;
        gpuTimer.resetSamples(); gpuSequence = 0; gpuDisjointCount = 0; gpuSamples = 0; gpuTotalMs = 0;
        frameStats.fps = frameStats.gpuTimeMs = null; navigation.clear();
        cursorDistance.invalidate();
    };
    const lodControl = document.querySelector('#scene-lod');
    let lodSelection = lod;
    const setLod = value => {
        if (value === 'LOD4_1K' || value === 'LOD4_4K') value = 'LOD4';
        if (!Object.hasOwn(lods, value)) throw new Error('Unknown grass LOD: ' + value);
        const previousSource = grassFieldShadowSource(lod);
        lodSelection = value; lodControl.value = value;
        lod = value;
        fields.setLod(lod); syncSurface();
        if (previousSource !== grassFieldShadowSource(lod)) { sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true; }
        updateCounts(); resetTiming();
    };
    const onLodChange = () => { setLod(lodControl.value); canvas.focus(); };
    lodControl.addEventListener('change', onLodChange);
    const borderControl = document.querySelector('#scene-canopy-border');
    const setCanopyBorder = value => {
        canopy.setBorderStrategy(value, loaded.scene); borderControl.value = value;
        updateCounts(); resetTiming();
    };
    const onBorderChange = () => { setCanopyBorder(borderControl.value); canvas.focus(); };
    borderControl.addEventListener('change', onBorderChange);
    const modeControl = document.querySelector('#scene-mode');
    const setMode = value => {
        if (!Object.hasOwn(SCENE_MODES, value)) throw new Error('Unknown scene mode: ' + value);
        mode = value;
        fields.setVisibility(SCENE_MODES[mode]);
        syncSurface();
        modeControl.querySelectorAll('input').forEach(input => { input.checked = input.value === mode; });
        sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
        updateCounts(); resetTiming();
    };
    const onModeChange = event => {
        setMode(event.target.value);
        if (!event.target.matches(':focus-visible')) canvas.focus();
    };
    modeControl.addEventListener('change', onModeChange);
    const litterControl = document.querySelector('#scene-litter');
    const setLitterTreatment = value => {
        litterSurface.setTreatment(value); litterControl.value = value;
        updateCounts(); resetTiming();
    };
    const onLitterChange = () => { setLitterTreatment(litterControl.value); canvas.focus(); };
    litterControl.addEventListener('change', onLitterChange);
    const fieldControl = document.querySelector('#scene-fields');
    fieldControl.replaceChildren(...Array.from({ length: 9 }, (_, index) => new Option(String(index + 1), String(index + 1))));
    const setFieldCount = value => {
        fields.setCount(value); fieldControl.value = String(value);
        syncSurface();
        fitFieldShadows(); updateCounts(); resetTiming();
    };
    const onFieldChange = () => { setFieldCount(Number(fieldControl.value)); canvas.focus(); };
    fieldControl.addEventListener('change', onFieldChange);
    const frameFields = () => {
        const { bounds } = fields.getSnapshot(), view = manifest.views[0];
        const az = THREE.MathUtils.degToRad(view.azimuth), el = THREE.MathUtils.degToRad(view.elevation);
        const target = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0.06, (bounds.minZ + bounds.maxZ) / 2);
        camera.fov = view.fieldOfViewDegrees ?? 35;
        const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
        const limitingAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
        const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
        const distance = 1.05 * radius / Math.sin(limitingAngle);
        camera.position.copy(target).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(distance));
        camera.far = Math.max(150, distance + radius + 10); camera.up.set(0, 1, 0);
        camera.lookAt(target); camera.updateProjectionMatrix(); dirty = true; updateCounts(); resetTiming();
    };
    const frameControl = document.querySelector('#scene-frame-fields');
    const onFrameFields = () => { frameFields(); canvas.focus(); };
    frameControl.addEventListener('click', onFrameFields);
    const views = document.querySelector('#scene-view');
    manifest.views.forEach((view, index) => {
        const option = document.createElement('option'); option.value = String(index); option.textContent = view.label; views.append(option);
    });
    const setView = index => {
        const view = manifest.views[index];
        if (!view) throw new Error('Unknown scene viewpoint.');
        navigation.clear(); selected = index; views.value = String(index);
        const az = THREE.MathUtils.degToRad(view.azimuth), el = THREE.MathUtils.degToRad(view.elevation);
        const target = new THREE.Vector3().fromArray(view.target);
        camera.position.copy(target).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(view.distance));
        camera.up.set(0, view.elevation === 90 ? 0 : 1, view.elevation === 90 ? -1 : 0);
        camera.lookAt(target); camera.fov = view.fieldOfViewDegrees ?? 35; camera.updateProjectionMatrix();
        history.replaceState(null, '', '#' + view.id); dirty = true; updateCounts(); resetTiming();
    };
    views.addEventListener('change', () => { setView(Number(views.value)); canvas.focus(); });
    document.querySelector('#scene-reset').addEventListener('click', () => { setView(selected); canvas.focus(); });
    speed.addEventListener('input', () => navigation.setSpeed(Math.pow(10, Number(speed.value))));
    const resize = () => {
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); lighting.resize(innerWidth, innerHeight); dirty = true; resetTiming();
    };
    window.addEventListener('resize', resize);
    setView(selected); resize();
    const requestedFields = query.get('fields');
    if (requestedFields !== null) setFieldCount(Number(requestedFields));
    const requestedLod = query.get('lod');
    if (requestedLod) setLod(requestedLod);
    setCanopyBorder(query.get('canopyBorder') ?? 'leaves');
    setLitterTreatment(query.get('litter') ?? 'merged');
    await renderer.compileAsync(scene, camera);
    resetTiming();
    document.addEventListener('visibilitychange', resetTiming);
    const update = now => {
        const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
        if (!document.hidden) {
            navigation.update(dt);
            if (dirty) {
                camera.near = THREE.MathUtils.clamp(camera.position.y * 0.015, 0.002, 0.1);
                camera.updateProjectionMatrix(); dirty = false;
            }
            updateCounts();
            gpuTimer.poll();
            const gpu = gpuTimer.getDiagnostics();
            if (!gpu.active || gpu.disjointCount !== gpuDisjointCount) {
                gpuSamples = 0; gpuTotalMs = 0; gpuSequence = gpu.sampleSequence; gpuDisjointCount = gpu.disjointCount;
                frameStats.gpuTimeMs = null; updatePerformanceLabel();
            } else {
                for (const sample of gpuTimer.getSamplesSince(gpuSequence)) {
                    gpuTotalMs += sample.ms; gpuSamples++; gpuSequence = sample.sequence;
                }
            }
            gpuTimer.beginFrame();
            try {
                lighting.render(dt);
            } finally { gpuTimer.endFrame(); }
            frameStats.renderedFrames++;
            if (lastRenderedAt !== null && now > lastRenderedAt) {
                sampleTime += now - lastRenderedAt; sampleFrames++;
                if (sampleTime >= 500) {
                    frameStats.fps = 1000 * sampleFrames / sampleTime;
                    frameStats.gpuTimeMs = gpuSamples ? gpuTotalMs / gpuSamples : null;
                    updatePerformanceLabel();
                    sampleFrames = 0; sampleTime = 0; gpuSamples = 0; gpuTotalMs = 0;
                }
            }
            lastRenderedAt = now;
        }
        frame = requestAnimationFrame(update);
    };
    update(previous);
    loading.hidden = true;
    document.querySelectorAll('#scene-panel select, #scene-panel button, #scene-panel input').forEach(control => { control.disabled = false; });
    canvas.focus();
    return Object.freeze({ camera, scene, renderer, lighting, navigation, canopy, relief, detail, setView, setMode, setLod, setFieldCount, frameFields, setLitterTreatment, setCanopyBorder,
        getSnapshot: () => ({ leaves: fields.getSnapshot().leaves, triangles: fields.getSnapshot().tiles.filter(tile => tile.active).reduce((sum, tile) => sum + lods[tile.lod].triangles, 0),
            sceneTriangles: fixedTriangles - soilTriangles + litterSurface.getSnapshot().soilTriangles
                + litterSurface.getSnapshot().surfaceTriangles
                + fields.getSnapshot().tiles.filter(tile => tile.active).reduce((sum, tile) => sum + lods[tile.lod].triangles, 0),
            litterSurface: litterSurface.getSnapshot(), shadows: fieldShadows.getSnapshot(), distanceAppearance: GRASS_FIELD_DISTANCE_APPEARANCE,
            mode, lod, lodSelection, lods, fields: fields.getSnapshot(), ...visibleCounts,
            cursorDistance: cursorDistance.getSnapshot(),
            performance: { ...frameStats, gpuTimer: gpuTimer.getDiagnostics() }, substrate: manifest.substrate, views: manifest.views.length,
            position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), speed: navigation.getSpeed(),
            lighting: lighting.getSnapshot() }),
        dispose() {
            cancelAnimationFrame(frame); navigation.dispose(); window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', resetTiming); modeControl.removeEventListener('change', onModeChange);
            lodControl.removeEventListener('change', onLodChange);
            fieldControl.removeEventListener('change', onFieldChange); frameControl.removeEventListener('click', onFrameFields);
            litterControl.removeEventListener('change', onLitterChange);
            borderControl.removeEventListener('change', onBorderChange);
            fieldShadows.dispose(); canopyShadows.dispose(); detail.dispose(); canopy.dispose(); fieldMaterial.dispose(); litterSurface.dispose(); cursorDistance.dispose(); fields.dispose(); fieldLod1.dispose(); fieldLod2.dispose(); smartLod0.dispose();
            litterOrmTextures.forEach(texture => texture.dispose());
            gpuTimer.resetSamples(); lighting.dispose(); renderer.dispose();
        }
    });
}

window.__grassLitterReadiness = start().then(viewer => {
    window.__grassLitterScene = viewer;
    return viewer.getSnapshot();
}).catch(error => {
    loading.hidden = false;
    loading.textContent = 'Unable to load this scene. ' + error.message;
    console.error(error);
    throw error;
});
