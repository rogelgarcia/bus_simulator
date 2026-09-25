// Orthographic pair-overlap experiment: every tuft stays in frame at unchanged projected size.
import * as THREE from 'three';
import { applyIBLToScene, applyIBLIntensity } from '../../../../src/graphics/lighting/IBL.js';
import { getOrCreateGpuFrameTimer } from '../../../../src/graphics/engine3d/perf/GpuFrameTimer.js';
import { createLegacySplitPlantGeometry } from './grass_legacy_split_geometry.js';

export async function createGrassPairOverlapBenchmark(study, { instances, variant, view, stackLayers = 2 }) {
    if (![2, 10].includes(stackLayers) || ![stackLayers, 100000].includes(instances) || !['joined', 'split'].includes(variant) || !['top', 'inclined'].includes(view)) {
        throw new Error('Unsupported pair-overlap configuration.');
    }
    const { renderer, cards, lighting } = study;
    const geometry = variant === 'split' ? createLegacySplitPlantGeometry(cards.layout) : cards.joined.mesh.geometry;
    renderer.shadowMap.enabled = false; renderer.autoClear = true;
    renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
    renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0);
    const scene = new THREE.Scene(), sun = lighting.sun.clone();
    sun.castShadow = false; scene.add(sun, sun.target, lighting.hemi.clone());
    const direction = new THREE.Vector3(0, 1, view === 'top' ? 0 : 1).normalize();
    const up = new THREE.Vector3(0, direction.z, -direction.y), right = new THREE.Vector3(1, 0, 0);
    const bounds = new THREE.Box3(), vertex = new THREE.Vector3(), attribute = geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) {
        vertex.fromBufferAttribute(attribute, i);
        bounds.expandByPoint(new THREE.Vector3(vertex.dot(right), vertex.dot(up), vertex.dot(direction)));
    }
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const columns = instances === stackLayers ? 1 : stackLayers === 2 ? 250 : 100;
    const rows = instances / stackLayers / columns;
    const cellWidth = size.x * 2.06, cellHeight = size.y * 1.06;
    const fieldWidth = columns * cellWidth, fieldHeight = rows * cellHeight;
    const fitScale = Math.min(1920 / fieldWidth, 1080 / fieldHeight) / 1.1;
    const tuftPixelWidth = Math.floor(size.x * fitScale / 2) * 2;
    if (tuftPixelWidth < 2) throw new Error('Insufficient resolution for integer-pixel overlap offsets.');
    const halfHeight = 540 * size.x / tuftPixelWidth;
    const camera = new THREE.OrthographicCamera(-halfHeight * 1920 / 1080, halfHeight * 1920 / 1080, halfHeight, -halfHeight, 0.01, 1000);
    camera.position.copy(direction).multiplyScalar(300); camera.up.copy(up); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const configurations = stackLayers === 2 ? {
        adjacent: { overlap: 0, nearFirst: true },
        half_near_first: { overlap: 0.5, nearFirst: true },
        half_far_first: { overlap: 0.5, nearFirst: false },
        full_near_first: { overlap: 1, nearFirst: true },
        full_far_first: { overlap: 1, nearFirst: false },
        visible_only: { overlap: 1, nearFirst: true, visibleOnly: true }
    } : {
        pair_near_first: { overlap: 1, nearFirst: true, layers: 2 },
        pair_far_first: { overlap: 1, nearFirst: false, layers: 2 },
        full_near_first: { overlap: 1, nearFirst: true, layers: stackLayers },
        full_far_first: { overlap: 1, nearFirst: false, layers: stackLayers },
        visible_only: { overlap: 1, nearFirst: true, visibleOnly: true }
    };
    const meshes = {}, proofs = {}, matrix = new THREE.Matrix4(), translation = new THREE.Vector3();
    for (const [name, configuration] of Object.entries(configurations)) {
        const membersPerPair = configuration.visibleOnly ? 1 : (configuration.layers ?? 2), caseInstances = columns * rows * membersPerPair;
        const mesh = new THREE.InstancedMesh(geometry, cards.material, caseInstances);
        mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); meshes[name] = mesh;
        let contained = 0, minDepth = Infinity, maxDepth = -Infinity;
        const allBounds = new THREE.Box2();
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) for (let order = 0; order < membersPerPair; order++) {
            const member = configuration.nearFirst ? order : membersPerPair - 1 - order;
            const x = (column - (columns - 1) / 2) * cellWidth + (member - 0.5 - member * configuration.overlap) * size.x;
            const y = (row - (rows - 1) / 2) * cellHeight;
            translation.set(x - center.x, 0, (y - center.y) / up.z).addScaledVector(direction, 0.002 - member * 0.004);
            matrix.makeTranslation(translation.x, translation.y, translation.z);
            mesh.setMatrixAt((row * columns + column) * membersPerPair + order, matrix);
            const screenX = translation.dot(right), screenY = translation.dot(up), depth = translation.dot(direction);
            const left = bounds.min.x + screenX, rightEdge = bounds.max.x + screenX;
            const bottom = bounds.min.y + screenY, top = bounds.max.y + screenY;
            if (left > camera.left && rightEdge < camera.right && bottom > camera.bottom && top < camera.top
                && 300 - bounds.max.z - depth > camera.near && 300 - bounds.min.z - depth < camera.far) contained++;
            allBounds.expandByPoint(new THREE.Vector2(left, bottom)); allBounds.expandByPoint(new THREE.Vector2(rightEdge, top));
            minDepth = Math.min(minDepth, depth); maxDepth = Math.max(maxDepth, depth);
        }
        mesh.instanceMatrix.needsUpdate = true;
        proofs[name] = { instances: caseInstances, fullyInFrustum: contained, projectedTuftPixels: [size.x * 1080 / (2 * halfHeight), size.y * 1080 / (2 * halfHeight)],
            depthRange: [minDepth, maxDepth], projectedBounds: { min: allBounds.min.toArray(), max: allBounds.max.toArray() }, matrixVersion: mesh.instanceMatrix.version };
        if (contained !== caseInstances) throw new Error(`${name}: only ${contained}/${caseInstances} tufts fully inside the camera.`);
    }
    applyIBLToScene(scene, lighting.environment, lighting.settings.ibl); applyIBLIntensity(scene, lighting.settings.ibl, { force: true }); scene.background = null;
    const target = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    const alphaPixels = new Uint8Array(cards.atlas.albedo.image.data);
    for (let i = 0; i < alphaPixels.length; i += 4) alphaPixels[i] = alphaPixels[i + 1] = alphaPixels[i + 2] = 255;
    const alphaMask = new THREE.DataTexture(alphaPixels, cards.atlas.albedo.image.width, cards.atlas.albedo.image.height, THREE.RGBAFormat);
    for (const key of ['minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'wrapS', 'wrapT', 'flipY', 'colorSpace']) alphaMask[key] = cards.atlas.albedo[key];
    alphaMask.needsUpdate = true;
    const setCase = name => { for (const [key, mesh] of Object.entries(meshes)) mesh.visible = name === key; };
    const render = () => { renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.setRenderTarget(null); };
    const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
    const timer = getOrCreateGpuFrameTimer(renderer), gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (!timer.isSupported || /swiftshader|llvmpipe|software/i.test(device)) throw new Error('Hardware GPU timer queries required.');
    for (const name of Object.keys(meshes)) { setCase(name); await renderer.compileAsync(scene, camera); render(); }
    for (let i = 0; i < 60; i++) { await raf(); render(); }
    const metadata = { instances, stackLayers, stacks: columns * rows, sourceLeaves: instances * 20, variant, view, renderer: device, configurations, proofs,
        cases: Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name, { instances: mesh.count, sourceLeaves: mesh.count * 20,
            cards: mesh.count * (variant === 'joined' ? 3 : 4), triangles: geometry.index.count / 3 * mesh.count }])),
        resolution: [1920, 1080], msaa: target.samples, triangles: geometry.index.count / 3 * instances,
        measurementSchedule: 'Every case occupies every submission slot equally often; reverse only after a complete rotation cycle.',
        cards: instances * (variant === 'joined' ? 3 : 4), pairGrid: [columns, rows], camera: { type: 'orthographic', position: camera.position.toArray(), up: up.toArray(), halfHeight },
        material: { alphaTest: cards.material.alphaTest, alphaToCoverage: cards.material.alphaToCoverage, depthTest: cards.material.depthTest, depthWrite: cards.material.depthWrite },
        depthSeparationMeters: 0.004, integerPixelOverlapOffsets: [0, tuftPixelWidth / 2, tuftPixelWidth], light: lighting.getSnapshot(), source: cards.getSnapshot(),
        scope: 'Identical tuft identities, orientation, size, depth, camera and material. Cases change overlap, stack count or explicit instance order; visible_only retains the exact front member. Entire projected geometry stays in frame. Successive stack members have 4 mm camera-depth separation to avoid coplanar surfaces. Independent stacks do not overlap. Empty screen area is intentional. No ground, shadow, sky, bus, wind or postprocessing.' };
    async function runRound(order, warmup = 30, samples = 120) {
        const drawOrder = i => {
            const names = Math.floor(i / order.length) % 2 ? [...order].reverse() : [...order], offset = i % order.length;
            return names.slice(offset).concat(names.slice(0, offset));
        };
        for (let i = 0; i < warmup; i++) { await raf(); for (const name of drawOrder(i)) { setCase(name); render(); } }
        if (!timer.resetSamples() || !timer.getDiagnostics().active) throw new Error('GPU timer unavailable.');
        const records = Object.fromEntries(order.map(name => [name, { name, gpu: [] }])), owners = [];
        const positionCounts = Object.fromEntries(order.map(name => [name, new Array(order.length).fill(0)]));
        let cursor = 0;
        const collect = () => {
            timer.poll();
            for (const sample of timer.getSamplesSince(cursor)) { records[owners[sample.submissionSequence - 1]].gpu.push(sample.ms); cursor = sample.sequence; }
        };
        for (let i = 0; i < samples; i++) {
            await raf(); collect(); const started = performance.now();
            while (timer.getDiagnostics().pendingQueryCount > 21 - order.length) {
                await raf(); collect(); if (performance.now() - started > 5000) throw new Error('GPU queries did not drain.');
            }
            for (const [position, name] of drawOrder(i).entries()) {
                positionCounts[name][position]++;
                setCase(name); owners.push(name); timer.beginFrame(); render(); timer.endFrame();
                const { calls, triangles } = renderer.info.render;
                if (calls !== (name === 'off' ? 0 : 1) || triangles !== (name === 'off' ? 0 : metadata.cases[name].triangles)) throw new Error('Incorrect submitted geometry.');
            }
        }
        const deadline = performance.now() + 5000;
        while (cursor < samples * order.length && performance.now() < deadline) { await raf(); collect(); }
        const diagnostics = timer.getDiagnostics();
        if (diagnostics.disjointCount || diagnostics.pendingQueryCount || diagnostics.submissionSequence !== samples * order.length) throw new Error(`Invalid queries: ${JSON.stringify(diagnostics)}`);
        for (const record of Object.values(records)) if (record.gpu.length !== samples) throw new Error(`Incomplete samples: ${record.name}`);
        for (const [name, positions] of Object.entries(positionCounts)) {
            if (positions.some(count => Math.abs(count - samples / order.length) >= 1)) throw new Error(`Unbalanced measurement order: ${name}`);
        }
        return { records, diagnostics, positionCounts };
    }
    function diagnose(name) {
        if (!gl.getExtension('EXT_float_blend')) throw new Error('EXT_float_blend required for raster diagnostics.');
        setCase(name);
        const countTarget = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.FloatType, depthBuffer: false });
        const pixels = new Float32Array(1920 * 1080 * 4);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
            transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
            blendEquation: THREE.AddEquation, forceSinglePass: true, toneMapped: false });
        const measure = () => {
            scene.overrideMaterial = material; renderer.setRenderTarget(countTarget); renderer.render(scene, camera);
            renderer.readRenderTargetPixels(countTarget, 0, 0, 1920, 1080, pixels);
            let sum = 0, covered = 0, extra = 0, maximum = 0;
            for (let i = 0; i < pixels.length; i += 4) { const value = pixels[i]; sum += value; if (value > 0) covered++; extra += Math.max(0, value - 1); maximum = Math.max(maximum, value); }
            return { layerPixels: sum, uniquePixels: covered, coveredFraction: covered / (1920 * 1080), layersPerCoveredPixel: sum / covered,
                redundantLayerPixels: extra, redundantFraction: extra / sum, maxLayers: maximum };
        };
        try {
            const cardFootprints = measure();
            material.map = alphaMask; material.alphaTest = cards.material.alphaTest; material.needsUpdate = true;
            return { cardFootprints, alphaLeaves: measure(), scope: 'Untimed additive potential raster layers, depth disabled, no MSAA. Alpha diagnostic uses the same cutoff but not alpha-to-coverage. These are not measured fragment-shader invocations.' };
        } finally { scene.overrideMaterial = null; renderer.setRenderTarget(null); material.dispose(); countTarget.dispose(); }
    }
    const capture = name => {
        setCase(name); renderer.setClearColor('#20252b', 1);
        renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[lighting.settings.toneMapping];
        renderer.setRenderTarget(null); renderer.render(scene, camera); const image = renderer.domElement.toDataURL('image/jpeg', 0.94);
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0); return image;
    };
    const compareVisibleImages = (names = ['full_near_first', 'full_far_first']) => {
        const pixels = name => {
            capture(name);
            const result = new Uint8Array(1920 * 1080 * 4); gl.readPixels(0, 0, 1920, 1080, gl.RGBA, gl.UNSIGNED_BYTE, result);
            return result;
        };
        const visible = pixels('visible_only'), comparisons = {};
        for (const name of names) {
            const full = pixels(name); let changed = 0, changedOverTwo = 0, sum = 0, maximum = 0;
            for (let i = 0; i < full.length; i += 4) {
                let largest = 0;
                for (let channel = 0; channel < 3; channel++) { const delta = Math.abs(full[i + channel] - visible[i + channel]); sum += delta; largest = Math.max(largest, delta); }
                if (largest > 0) changed++; if (largest > 2) changedOverTwo++; maximum = Math.max(maximum, largest);
            }
            comparisons[name] = { changedPixels: changed, changedOverTwoLevelsFraction: changedOverTwo / (1920 * 1080),
                meanAbsoluteChannelDifference: sum / (1920 * 1080 * 3), maximumChannelDifference: maximum };
        }
        return comparisons;
    };
    const verifyVisibleSubset = () => {
        const visible = meshes.visible_only.instanceMatrix.array, full = meshes.full_near_first.instanceMatrix.array;
        return visible.every((value, index) => value === full[Math.floor(index / 16) * 16 * stackLayers + index % 16]);
    };
    return Object.freeze({ metadata, runRound, diagnose, capture, compareVisibleImages, verifyVisibleSubset,
        verifyStatic: () => Object.entries(meshes).every(([name, mesh]) => mesh.count === proofs[name].instances && mesh.instanceMatrix.version === proofs[name].matrixVersion),
        dispose: () => { timer.resetSamples(); target.dispose(); alphaMask.dispose(); for (const mesh of Object.values(meshes)) mesh.dispose();
            if (variant === 'split') geometry.dispose(); }
    });
}
