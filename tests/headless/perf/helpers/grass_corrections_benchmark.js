// Paired hardware timings for the current 24-card grass row with both grazing corrections on or off.
import * as THREE from 'three';
import { applyIBLToScene, applyIBLIntensity } from '../../../../src/graphics/lighting/IBL.js';
import { getOrCreateGpuFrameTimer } from '../../../../src/graphics/engine3d/perf/GpuFrameTimer.js';

export async function createGrassCorrectionsBenchmark(study) {
    const { renderer, cards, lighting } = study;
    const width = 1920, height = 1080, columns = 50, rows = 50, instances = columns * rows;
    const geometry = cards.refined.mesh.geometry;
    const { minX, maxX, minZ, maxZ } = cards.layout.frame;
    const spacing = [maxX - minX, maxZ - minZ], matrix = new THREE.Matrix4();
    const scene = new THREE.Scene(), sun = lighting.sun.clone();
    sun.castShadow = false; scene.add(sun, sun.target, lighting.hemi.clone());
    const mesh = new THREE.InstancedMesh(geometry, cards.material, instances);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        matrix.makeTranslation((col - (columns - 1) / 2) * spacing[0] - (minX + maxX) / 2,
            0, (row - (rows - 1) / 2) * spacing[1] - (minZ + maxZ) / 2);
        mesh.setMatrixAt(row * columns + col, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; scene.add(mesh);
    const originalMatrices = mesh.instanceMatrix.array.slice(), matrixVersion = mesh.instanceMatrix.version;
    applyIBLToScene(scene, lighting.environment, lighting.settings.ibl);
    applyIBLIntensity(scene, lighting.settings.ibl, { force: true }); scene.background = null;
    renderer.shadowMap.enabled = false; renderer.autoClear = true;
    renderer.setPixelRatio(1); renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0); study.controls.enabled = false;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    const captureTarget = new THREE.WebGLRenderTarget(width, height, { samples: 4, depthBuffer: true });
    captureTarget.texture.colorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 500);
    const fieldBounds = new THREE.Box3().setFromObject(mesh), center = fieldBounds.getCenter(new THREE.Vector3());
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
    let active = null;
    const setCase = name => {
        mesh.visible = name !== 'empty';
        if (name !== 'empty' && active !== name) {
            cards.setNormalFacing(name === 'enabled'); cards.setAlphaCoverage(name === 'enabled'); active = name;
        }
    };
    const render = () => { renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.setRenderTarget(null); };
    const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const timer = getOrCreateGpuFrameTimer(renderer);
    if (!timer.isSupported || /swiftshader|llvmpipe|software/i.test(device)) throw new Error('Hardware GPU timer queries required.');
    setPose('oblique');
    for (const name of ['disabled', 'enabled']) { setCase(name); await renderer.compileAsync(scene, camera); render(); }
    for (let i = 0; i < 120; i++) { await raf(); setCase(i % 2 ? 'enabled' : 'disabled'); render(); }
    const metadata = {
        renderer: device, resolution: [width, height], samples: target.samples, target: 'RGBA16F + depth; 4x MSAA',
        instances, leavesPerTuft: cards.getSnapshot().sourceLeaves, leaves: instances * cards.getSnapshot().sourceLeaves,
        variant: 'LOD3 · 24', cards: instances * 24, triangles: geometry.index.count / 3 * instances, drawCalls: 1,
        fieldMeters: [columns * spacing[0], rows * spacing[1]], grid: [columns, rows], matrixVersion, poses,
        camera: { type: camera.type, fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
        cases: { disabled: { normalFacing: false, alphaCoverage: false }, enabled: { normalFacing: true, alphaCoverage: true } },
        material: { alphaTest: cards.material.alphaTest, alphaToCoverage: cards.material.alphaToCoverage, depthTest: cards.material.depthTest, depthWrite: cards.material.depthWrite },
        atlas: cards.getSnapshot().atlas, lighting: lighting.getSnapshot(),
        scope: 'Grass-only pass with game sunlight and environment. Includes render-target clear and resolve, with an empty-pass baseline. No soil, bus, sky, shadows, wind or postprocessing. Shader compilation, baking, uploads and captures excluded. Each pose frames the whole fixed field; cameras and all transforms are identical between feature states. Alpha coverage can change visible coverage, which is measured separately.'
    };
    async function runRound(pose, round, warmup = 30, samples = 120) {
        setPose(pose);
        const names = ['empty', 'disabled', 'enabled'];
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
                    || renderer.info.render.triangles !== (name === 'empty' ? 0 : metadata.triangles)) throw new Error('Incorrect submitted grass counts.');
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
    const verifyStatic = () => mesh.instanceMatrix.version === matrixVersion && originalMatrices.every((value, i) => value === mesh.instanceMatrix.array[i]);
    return Object.freeze({ metadata, runRound, capture, verifyStatic,
        dispose: () => { timer.resetSamples(); target.dispose(); captureTarget.dispose(); mesh.dispose(); } });
}
