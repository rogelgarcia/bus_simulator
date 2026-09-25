// Compare the live 24-card and 6-card LODs with the same 50,000 source leaves and instance transforms.
import * as THREE from 'three';
import { applyIBLToScene, applyIBLIntensity } from '../../../../src/graphics/lighting/IBL.js';
import { getOrCreateGpuFrameTimer } from '../../../../src/graphics/engine3d/perf/GpuFrameTimer.js';

export async function createGrassLodComparisonBenchmark(study) {
    const { renderer, cards, lighting } = study;
    const width = 1920, height = 1080, columns = 64, rows = 40, instances = 2500;
    const { minX, maxX, minZ, maxZ } = cards.layout.frame;
    const spacing = [maxX - minX, maxZ - minZ], matrix = new THREE.Matrix4();
    cards.setNormalFacing(true); cards.setAlphaCoverage(true);
    const scene = new THREE.Scene(), sun = lighting.sun.clone();
    sun.castShadow = false; scene.add(sun, sun.target, lighting.hemi.clone());
    const meshes = {
        lod24: new THREE.InstancedMesh(cards.refined.mesh.geometry, cards.material, instances),
        lod6: new THREE.InstancedMesh(cards.curved.mesh.geometry, cards.material, instances)
    };
    for (let index = 0; index < instances; index++) {
        const column = index % columns, row = Math.floor(index / columns);
        matrix.makeTranslation((column - (columns - 1) / 2) * spacing[0] - (minX + maxX) / 2,
            0, (row - (rows - 1) / 2) * spacing[1] - (minZ + maxZ) / 2);
        for (const mesh of Object.values(meshes)) mesh.setMatrixAt(index, matrix);
    }
    const originals = {};
    for (const [name, mesh] of Object.entries(meshes)) {
        mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; scene.add(mesh);
        originals[name] = { matrices: mesh.instanceMatrix.array.slice(), version: mesh.instanceMatrix.version };
    }
    const bounds24 = new THREE.Box3().setFromObject(meshes.lod24), bounds6 = new THREE.Box3().setFromObject(meshes.lod6);
    const proof = {
        representedLeaves: instances * cards.getSnapshot().sourceLeaves,
        identicalInstanceMatrices: originals.lod24.matrices.every((value, index) => value === originals.lod6.matrices[index]),
        sameMaterial: meshes.lod24.material === meshes.lod6.material,
        originalProductionGeometry: meshes.lod24.geometry === cards.refined.mesh.geometry && meshes.lod6.geometry === cards.curved.mesh.geometry,
        originalProductionAtlas: cards.material.map === cards.atlas.coverage && cards.material.normalMap === cards.atlas.normal
            && cards.material.roughnessMap === cards.atlas.roughness,
        proxyBounds: { lod24: { min: bounds24.min.toArray(), max: bounds24.max.toArray() },
            lod6: { min: bounds6.min.toArray(), max: bounds6.max.toArray() } },
        cardAreaPerGroupMetersSquared: {}
    };
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const [name, mesh] of Object.entries(meshes)) {
        const geometry = mesh.geometry, p = geometry.attributes.position, indices = geometry.index;
        let area = 0;
        for (let i = 0; i < indices.count; i += 3) {
            a.fromBufferAttribute(p, indices.getX(i)); b.fromBufferAttribute(p, indices.getX(i + 1));
            c.fromBufferAttribute(p, indices.getX(i + 2));
            area += b.sub(a).cross(c.sub(a)).length() / 2;
        }
        proof.cardAreaPerGroupMetersSquared[name] = area;
    }
    applyIBLToScene(scene, lighting.environment, lighting.settings.ibl);
    applyIBLIntensity(scene, lighting.settings.ibl, { force: true }); scene.background = null;
    renderer.shadowMap.enabled = false; renderer.autoClear = true;
    renderer.setPixelRatio(1); renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0); study.controls.enabled = false;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    const captureTarget = new THREE.WebGLRenderTarget(width, height, { samples: 4, depthBuffer: true });
    captureTarget.texture.colorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 500);
    const fieldBounds = bounds24.clone().union(bounds6), center = fieldBounds.getCenter(new THREE.Vector3());
    const corners = [];
    for (const x of [fieldBounds.min.x, fieldBounds.max.x]) for (const y of [fieldBounds.min.y, fieldBounds.max.y])
        for (const z of [fieldBounds.min.z, fieldBounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const poses = {}, definitions = { top: 90, oblique: 45, grazing: 8 };
    for (const [name, elevation] of Object.entries(definitions)) {
        const radians = THREE.MathUtils.degToRad(elevation), direction = new THREE.Vector3(0, Math.sin(radians), Math.cos(radians));
        camera.position.copy(center).add(direction); camera.up.set(0, elevation === 90 ? 0 : 1, elevation === 90 ? -1 : 0);
        camera.lookAt(center); camera.updateMatrixWorld();
        const inverse = camera.quaternion.clone().invert(), tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let distance = 0;
        for (const point of corners) {
            const local = point.clone().sub(center).applyQuaternion(inverse);
            distance = Math.max(distance, local.z + 1.08 * Math.max(Math.abs(local.x) / (tanY * camera.aspect), Math.abs(local.y) / tanY));
        }
        camera.position.copy(center).addScaledVector(direction, distance); camera.lookAt(center); camera.updateMatrixWorld();
        const projectedBounds = new THREE.Box3();
        for (const point of corners) projectedBounds.expandByPoint(point.clone().project(camera));
        const inFrame = projectedBounds.min.x > -1 && projectedBounds.max.x < 1 && projectedBounds.min.y > -1
            && projectedBounds.max.y < 1 && projectedBounds.min.z > -1 && projectedBounds.max.z < 1;
        if (!inFrame) throw new Error('The entire grass field must remain inside each camera.');
        poses[name] = { elevation, position: camera.position.toArray(), target: center.toArray(), up: camera.up.toArray(),
            projectedBounds: { min: projectedBounds.min.toArray(), max: projectedBounds.max.toArray() }, fullyInFrustum: instances };
    }
    const setPose = pose => {
        camera.position.fromArray(poses[pose].position); camera.up.fromArray(poses[pose].up);
        camera.lookAt(center); camera.updateMatrixWorld();
    };
    const setCase = name => { for (const [key, mesh] of Object.entries(meshes)) mesh.visible = name === key; };
    const render = () => { renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.setRenderTarget(null); };
    const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const timer = getOrCreateGpuFrameTimer(renderer);
    if (!timer.isSupported || /swiftshader|llvmpipe|software/i.test(device)) throw new Error('Hardware GPU timer queries required.');
    setPose('oblique');
    for (const name of ['lod24', 'lod6']) { setCase(name); await renderer.compileAsync(scene, camera); render(); }
    for (let i = 0; i < 120; i++) { await raf(); setCase(i % 2 ? 'lod6' : 'lod24'); render(); }
    const metadata = {
        renderer: device, resolution: [width, height], samples: target.samples, target: 'RGBA16F + depth; 4x MSAA',
        leaves: instances * cards.getSnapshot().sourceLeaves, variants: ['LOD3 · 24', 'LOD3 · 6'], corrections: cards.getSnapshot().corrections, proof,
        fieldMeters: [columns * spacing[0], rows * spacing[1]], grid: [columns, rows], poses,
        rowOccupancy: '39 rows of 64 tufts plus 4 tufts on the final row; identical in both LODs.',
        camera: { type: camera.type, fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
        cases: Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name, {
            instances: mesh.count, leavesPerGroup: 20, leaves: 50000,
            cardWidthMeters: spacing[0], cardsPerGroup: mesh.geometry.index.count / 6, cards: mesh.count * mesh.geometry.index.count / 6,
            triangles: mesh.count * mesh.geometry.index.count / 3, drawCalls: 1
        }])),
        material: { alphaTest: cards.material.alphaTest, alphaToCoverage: cards.material.alphaToCoverage, depthTest: cards.material.depthTest, depthWrite: cards.material.depthWrite },
        atlas: cards.getSnapshot().atlas, lighting: lighting.getSnapshot(),
        scope: 'Grass-only pass with game sunlight and environment. Includes render-target clear and resolve, with an empty-pass baseline. No soil, bus, sky, shadows, wind or postprocessing. Shader compilation, baking, uploads and captures excluded. Both corrections enabled. Same 2,500 transforms and source leaves in each case; unmodified live 24-card versus 6-card geometry. Identical material, original PBR atlas and mip chain, lighting and cameras. All 50,000 represented leaves remain inside all three cameras. No per-instance culling. Proxy surface shape and projected coverage can differ; this measures the practical LOD switch, not a triangle-only microbenchmark.'
    };
    async function runRound(pose, round, warmup = 30, samples = 120) {
        setPose(pose);
        const names = ['empty', 'lod24', 'lod6'];
        const order = i => {
            const base = Math.floor(i / names.length) % 2 ? [...names].reverse() : [...names];
            const offset = (i + round) % names.length;
            return base.slice(offset).concat(base.slice(0, offset));
        };
        for (let i = 0; i < warmup; i++) { await raf(); for (const name of order(i)) { setCase(name); render(); } }
        const programCount = renderer.info.programs.length;
        if (!timer.resetSamples() || !timer.getDiagnostics().active) throw new Error('GPU timer unavailable.');
        const records = Object.fromEntries(names.map(name => [name, { gpu: [], cpuSubmission: [], slots: [0, 0, 0] }]));
        const owners = []; let cursor = 0;
        const collect = () => {
            timer.poll();
            for (const sample of timer.getSamplesSince(cursor)) {
                records[owners[sample.submissionSequence - 1]].gpu.push(sample.ms); cursor = sample.sequence;
            }
        };
        for (let i = 0; i < samples; i++) {
            await raf(); collect(); const start = performance.now();
            while (timer.getDiagnostics().pendingQueryCount > 18) {
                await raf(); collect(); if (performance.now() - start > 5000) throw new Error('GPU query drain timeout.');
            }
            for (const [slot, name] of order(i).entries()) {
                setCase(name); owners.push(name); records[name].slots[slot]++;
                timer.beginFrame(); const cpuStart = performance.now(); render();
                records[name].cpuSubmission.push(performance.now() - cpuStart); timer.endFrame();
                if (renderer.info.render.calls !== (name === 'empty' ? 0 : 1)
                    || renderer.info.render.triangles !== (name === 'empty' ? 0 : metadata.cases[name].triangles)) throw new Error('Incorrect submitted grass counts.');
            }
        }
        const deadline = performance.now() + 5000;
        while (cursor < samples * names.length && performance.now() < deadline) { await raf(); collect(); }
        const diagnostics = timer.getDiagnostics();
        if (diagnostics.disjointCount || diagnostics.pendingQueryCount || diagnostics.submissionSequence !== samples * names.length) throw new Error('Invalid GPU query results.');
        for (const record of Object.values(records)) {
            if (record.gpu.length !== samples || record.slots.some(count => count !== samples / names.length)) throw new Error('Incomplete or unbalanced samples.');
        }
        if (renderer.info.programs.length !== programCount) throw new Error('A shader program compiled during timing.');
        return { pose, round, records, diagnostics, programCount };
    }
    function capture(pose, name) {
        setPose(pose); setCase(name);
        renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[lighting.settings.toneMapping];
        renderer.setRenderTarget(captureTarget); renderer.render(scene, camera); renderer.setRenderTarget(null);
        const pixels = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(captureTarget, 0, 0, width, height, pixels);
        let coverage = 0, coveredPixels = 0;
        for (let i = 3; i < pixels.length; i += 4) {
            const alpha = pixels[i] / 255; coverage += alpha; if (alpha) coveredPixels++;
        }
        // Three.js tone maps the display framebuffer; the offscreen target above is only the alpha diagnostic.
        renderer.setClearColor('#20252b', 1); renderer.render(scene, camera);
        const image = renderer.domElement.toDataURL('image/jpeg', 0.94);
        renderer.setClearColor(0, 0); renderer.toneMapping = THREE.NoToneMapping;
        return { image, alphaPixelEquivalents: coverage, coveredPixels,
            coveredFraction: coveredPixels / (width * height), alphaCoverageFraction: coverage / (width * height) };
    }
    const compareImages = pose => {
        const snapshots = [];
        for (const name of ['lod24', 'lod6']) {
            setPose(pose); setCase(name); renderer.setRenderTarget(captureTarget); renderer.render(scene, camera); renderer.setRenderTarget(null);
            const pixels = new Uint8Array(width * height * 4); renderer.readRenderTargetPixels(captureTarget, 0, 0, width, height, pixels);
            snapshots.push(pixels);
        }
        let rgbError = 0, alphaError = 0, changedOverTwo = 0, changedOverSixteen = 0, occupied = 0;
        for (let i = 0; i < snapshots[0].length; i += 4) {
            let peak = 0;
            for (let c = 0; c < 3; c++) {
                const delta = Math.abs(snapshots[0][i + c] - snapshots[1][i + c]); rgbError += delta; peak = Math.max(peak, delta);
            }
            const deltaAlpha = Math.abs(snapshots[0][i + 3] - snapshots[1][i + 3]); alphaError += deltaAlpha;
            if (Math.max(peak, deltaAlpha) > 2) changedOverTwo++;
            if (Math.max(peak, deltaAlpha) > 16) changedOverSixteen++;
            if (snapshots[0][i + 3] || snapshots[1][i + 3]) occupied++;
        }
        return { occupiedPixels: occupied, changedOverTwoLevels: changedOverTwo,
            changedOverTwoFraction: changedOverTwo / occupied, changedOverSixteenFraction: changedOverSixteen / occupied, meanRgbError: rgbError / (occupied * 3),
            meanAlphaError: alphaError / occupied };
    };
    const verifyStatic = () => Object.entries(meshes).every(([name, mesh]) =>
        mesh.instanceMatrix.version === originals[name].version && originals[name].matrices.every((value, i) => value === mesh.instanceMatrix.array[i]));
    return Object.freeze({ metadata, runRound, capture, compareImages, verifyStatic,
        dispose: () => { timer.resetSamples(); target.dispose(); captureTarget.dispose();
            Object.values(meshes).forEach(mesh => mesh.dispose()); } });
}
