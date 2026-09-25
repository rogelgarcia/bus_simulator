// Hardware GPU benchmark for 100,000 instances of the current twenty-leaf card study.
import * as THREE from 'three';
import { applyIBLToScene, applyIBLIntensity } from '../../../../src/graphics/lighting/IBL.js';
import { getOrCreateGpuFrameTimer } from '../../../../src/graphics/engine3d/perf/GpuFrameTimer.js';
import { createLegacySplitPlantGeometry } from './grass_legacy_split_geometry.js';

export async function createPlantCardBenchmark(study) {
    const { renderer, cards, lighting } = study;
    const splitGeometry = createLegacySplitPlantGeometry(cards.layout);
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
    renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    study.controls.enabled = false;
    const scene = new THREE.Scene(), sun = lighting.sun.clone();
    sun.castShadow = false; scene.add(sun, sun.target, lighting.hemi.clone());
    const instances = 100_000, columns = 400, rows = 250;
    const { minX, maxX, minZ, maxZ } = cards.layout.frame;
    const tileWidth = maxX - minX, tileDepth = maxZ - minZ;
    const layouts = Object.fromEntries([['side_by_side', 1], ['overlap_50', Math.SQRT1_2]].map(([name, scale]) => {
        const width = columns * tileWidth * scale, depth = rows * tileDepth * scale;
        return [name, { fieldMeters: [width, depth], areaSquareMeters: width * depth,
            spacingMeters: [(width - tileWidth) / (columns - 1), (depth - tileDepth) / (rows - 1)] }];
    }));
    const matrices = new Float32Array(instances * 16), matrix = new THREE.Matrix4();
    const meshes = {};
    for (const [layout, definition] of Object.entries(layouts)) {
        const [spacingX, spacingZ] = definition.spacingMeters;
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
            matrix.makeTranslation((col - (columns - 1) / 2) * spacingX - (minX + maxX) / 2, 0, row * spacingZ - minZ);
            matrix.toArray(matrices, (row * columns + col) * 16);
        }
        for (const name of ['joined', 'split']) {
            const mesh = new THREE.InstancedMesh(name === 'split' ? splitGeometry : cards.joined.mesh.geometry, cards.material, instances);
            mesh.instanceMatrix.array.set(matrices); mesh.instanceMatrix.needsUpdate = true;
            mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); meshes[`${layout}:${name}`] = mesh;
        }
    }
    let activeLayout = 'side_by_side';
    const setLayout = name => { activeLayout = name; };
    applyIBLToScene(scene, lighting.environment, lighting.settings.ibl);
    applyIBLIntensity(scene, lighting.settings.ibl, { force: true }); scene.background = null;
    const target = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    const camera = new THREE.PerspectiveCamera(55, 1920 / 1080, 0.005, 400);
    const poses = Object.freeze({
        bus_height: { position: [0, 6.883, -2], target: [0, 0.06, 18] },
        low: { position: [0, 0.2, -0.2], target: [0, 0.06, 9.8] },
        overview: { position: [65, 105, 125], target: [0, 0, 50] },
        interior_bus_height: { position: [0, 6.883, 30], target: [0, 0.06, 36.823] },
        interior_low: { position: [0, 0.2, 35], target: [0, 0.06, 35.2] },
        interior_top: { position: [0, 12, 35], target: [0, 0, 35], up: [0, 0, -1] }
    });
    const setPose = name => { camera.position.fromArray(poses[name].position); camera.up.fromArray(poses[name].up ?? [0, 1, 0]); camera.lookAt(...poses[name].target); camera.updateMatrixWorld(); };
    const setCase = name => {
        const selected = name.includes(':') ? name : `${activeLayout}:${name}`;
        for (const [key, mesh] of Object.entries(meshes)) mesh.visible = key === selected;
    };
    const render = () => { renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.setRenderTarget(null); };
    const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
    const timer = getOrCreateGpuFrameTimer(renderer);
    if (!timer.isSupported) throw new Error('This benchmark requires hardware GPU timer queries.');
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (/swiftshader|llvmpipe|software/i.test(device)) throw new Error(`Hardware GPU required; received ${device}`);
    setPose('bus_height');
    for (const name of Object.keys(meshes)) { setCase(name); await renderer.compileAsync(scene, camera); render(); }
    for (let i = 0; i < 180; i++) { await raf(); setCase(i % 2 ? 'joined' : 'split'); render(); }
    const metadata = Object.freeze({
        renderer: device, resolution: [1920, 1080], devicePixelRatio: 1, msaa: target.samples,
        target: 'RGBA16F + depth, 4x MSAA', instances, sourceLeaves: instances * 20,
        columns, rows, layouts, tuftFootprintMeters: [tileWidth, tileDepth],
        atlas: [cards.atlas.albedo.image.width, cards.atlas.albedo.image.height], atlasChannels: ['albedo/alpha', 'object-space normals', 'roughness'],
        sharedMaterialAndTextures: true, light: lighting.getSnapshot(), poses,
        source: cards.getSnapshot(),
        cases: Object.fromEntries(['joined', 'split'].map(name => { const mesh = meshes[`side_by_side:${name}`]; return [name, { instances,
            cards: instances * (name === 'joined' ? 3 : 4), triangles: mesh.geometry.index.count / 3 * instances,
            vertices: mesh.geometry.attributes.position.count * instances, calls: 1 }]; })),
        scope: 'Grass-only GPU pass including target clear and MSAA resolve. No ground, bus, sky, postprocessing, shadows or wind. All 100,000 instances submitted in one draw; no per-instance culling. No rotation or per-frame buffer uploads.'
    });
    async function runBlock(pose, name, warmup = 24, samples = 120) {
        setPose(pose); setCase(name);
        for (let i = 0; i < warmup; i++) { await raf(); render(); }
        if (!timer.resetSamples()) throw new Error('Previous GPU query is still active.');
        const before = timer.getDiagnostics(), values = [], cpu = [], frame = [];
        if (!before.active) throw new Error(`GPU timer unavailable: ${before.disabledReason}`);
        let cursor = 0, lastFrame;
        const collect = () => {
            timer.poll();
            for (const sample of timer.getSamplesSince(cursor)) { values.push(sample.ms); cursor = sample.sequence; }
        };
        for (let i = 0; i < samples; i++) {
            const now = await raf(); collect();
            if (lastFrame !== undefined) frame.push(now - lastFrame); lastFrame = now;
            timer.beginFrame(); const start = performance.now(); render(); cpu.push(performance.now() - start); timer.endFrame();
        }
        const deadline = performance.now() + 5000;
        while (values.length < samples && performance.now() < deadline) { await raf(); collect(); }
        const after = timer.getDiagnostics(), info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
        if (after.disjointCount || values.length !== samples || after.submissionSequence !== samples || after.pendingQueryCount) {
            throw new Error(`Incomplete GPU measurements: ${values.length}/${samples}; ${JSON.stringify(after)}`);
        }
        const expected = name === 'off' ? { calls: 0, triangles: 0 } : metadata.cases[name];
        if (info.calls !== expected.calls || info.triangles !== expected.triangles) throw new Error(`Unexpected rendering counts: ${JSON.stringify(info)}`);
        return { pose, name, warmup, samples, gpu: values, cpu, frame, info, diagnostics: after,
            averageMs: values.reduce((sum, ms) => sum + ms, 0) / values.length };
    }
    async function runPairedBlock(pose, order, warmup = 24, samples = 120) {
        setPose(pose);
        const drawOrder = i => {
            const names = i % 2 ? [...order].reverse() : [...order];
            return names.slice(i % order.length).concat(names.slice(0, i % order.length));
        };
        for (let i = 0; i < warmup; i++) { await raf(); for (const name of drawOrder(i)) { setCase(name); render(); } }
        if (!timer.resetSamples() || !timer.getDiagnostics().active) throw new Error('GPU timer is not ready for paired measurements.');
        const records = Object.fromEntries(order.map(name => [name, { pose, name, warmup, samples, gpu: [], cpu: [], frame: [] }]));
        const owners = []; let cursor = 0, lastFrame;
        const collect = () => {
            timer.poll();
            for (const sample of timer.getSamplesSince(cursor)) { records[owners[sample.submissionSequence - 1]].gpu.push(sample.ms); cursor = sample.sequence; }
        };
        for (let i = 0; i < samples; i++) {
            let now = await raf(); collect();
            const waitStart = performance.now();
            while (timer.getDiagnostics().pendingQueryCount > 21 - order.length) {
                now = await raf(); collect();
                if (performance.now() - waitStart > 5000) throw new Error('Paired GPU query queue did not drain.');
            }
            for (const name of drawOrder(i)) {
                const record = records[name]; setCase(name); owners.push(name);
                if (lastFrame !== undefined) record.frame.push(now - lastFrame);
                timer.beginFrame(); const start = performance.now(); render(); record.cpu.push(performance.now() - start); timer.endFrame();
                record.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
                const expected = name === 'off' ? { calls: 0, triangles: 0 } : metadata.cases[name.split(':').at(-1)];
                if (record.info.calls !== expected.calls || record.info.triangles !== expected.triangles) throw new Error('Unexpected paired rendering counts.');
            }
            lastFrame = now;
        }
        const deadline = performance.now() + 5000;
        while (cursor < samples * order.length && performance.now() < deadline) { await raf(); collect(); }
        const diagnostics = timer.getDiagnostics();
        if (diagnostics.disjointCount || diagnostics.pendingQueryCount || diagnostics.submissionSequence !== samples * order.length) {
            throw new Error(`Incomplete paired GPU measurements: ${JSON.stringify(diagnostics)}`);
        }
        return order.map(name => {
            const record = records[name];
            if (record.gpu.length !== samples) throw new Error(`Missing paired GPU samples for ${name}: ${record.gpu.length}/${samples}; ${JSON.stringify(diagnostics)}`);
            return { ...record, diagnostics, averageMs: record.gpu.reduce((sum, ms) => sum + ms, 0) / samples };
        });
    }
    const capture = (pose, name) => {
        setPose(pose); setCase(name); renderer.setRenderTarget(null); renderer.setClearColor('#20252b', 1);
        renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[lighting.settings.toneMapping];
        renderer.render(scene, camera); const data = renderer.domElement.toDataURL('image/png');
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0); return data;
    };
    function measureProxyOverdraw(pose, name) {
        if (!gl.getExtension('EXT_float_blend')) return { unavailable: 'EXT_float_blend unavailable' };
        const countTarget = new THREE.WebGLRenderTarget(960, 540, { type: THREE.FloatType, depthBuffer: false });
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide,
            depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false, forceSinglePass: true });
        setPose(pose); setCase(name); scene.overrideMaterial = material;
        const pixels = new Float32Array(960 * 540 * 4);
        try {
            renderer.setRenderTarget(countTarget); renderer.render(scene, camera);
            renderer.readRenderTargetPixels(countTarget, 0, 0, 960, 540, pixels);
            let sum = 0, covered = 0, maximum = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                const value = pixels[i]; sum += value; if (value > 0) covered++; maximum = Math.max(maximum, value);
            }
            if (!covered || !Number.isFinite(sum)) throw new Error('Invalid additive proxy-overdraw capture.');
            return { resolution: [960, 540], meanLayersFullFrame: sum / (960 * 540), meanLayersCoveredPixels: sum / covered,
                coveredFraction: covered / (960 * 540), maxLayers: maximum,
                scope: 'Additive proxy raster coverage with depth/alpha tests disabled. Potential layers including transparent texels; not measured shader invocations.' };
        } finally { renderer.setRenderTarget(null); scene.overrideMaterial = null; countTarget.dispose(); material.dispose(); }
    }
    const getGroundFootprint = pose => {
        setPose(pose);
        const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        return [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([x, y]) => {
            ray.setFromCamera(new THREE.Vector2(x, y), camera);
            const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
            if (!point) throw new Error('Controlled camera must see ground at every screen corner.');
            return point.toArray();
        });
    };
    const getInstanceState = () => Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name,
        { count: mesh.count, matrixVersion: mesh.instanceMatrix.version, matrixBytes: mesh.instanceMatrix.array.byteLength }]));
    return Object.freeze({ metadata, setLayout, runBlock, runPairedBlock, capture, measureProxyOverdraw, getGroundFootprint, getInstanceState,
        dispose: () => { timer.resetSamples(); target.dispose(); Object.values(meshes).forEach(mesh => mesh.dispose()); splitGeometry.dispose(); }
    });
}
