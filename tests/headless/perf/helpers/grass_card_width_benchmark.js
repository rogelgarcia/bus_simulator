// Four neighboring grass rows merge into wider cards without moving or stretching their leaf silhouettes.
import * as THREE from 'three';
import { applyIBLToScene, applyIBLIntensity } from '../../../../src/graphics/lighting/IBL.js';
import { getOrCreateGpuFrameTimer } from '../../../../src/graphics/engine3d/perf/GpuFrameTimer.js';

// First-page extraction preserves texel density and every supplied coverage mip for both layouts.
function repeatablePage(source) {
    const crop = image => {
        const width = image.width / 2, data = new Uint8Array(width * image.height * 4);
        for (let y = 0; y < image.height; y++)
            data.set(image.data.subarray(y * image.width * 4, (y * image.width + width) * 4), y * width * 4);
        return { data, width, height: image.height };
    };
    const page = crop(source.image), texture = new THREE.DataTexture(page.data, page.width, page.height, THREE.RGBAFormat);
    for (const key of ['minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'wrapT', 'flipY', 'colorSpace']) texture[key] = source[key];
    texture.wrapS = THREE.RepeatWrapping;
    if (source.mipmaps.length) texture.mipmaps = source.mipmaps.filter(level => level.width > 1).map(crop);
    texture.needsUpdate = true;
    return texture;
}

export async function createGrassCardWidthBenchmark(study) {
    const { renderer, cards, lighting, plant } = study;
    const width = 1920, height = 1080, columns = 64, rows = 40, instances = 2500, wideInstances = instances / 4;
    const { minX, maxX, minZ, maxZ } = cards.layout.frame, centerX = (minX + maxX) / 2;
    const spacing = [maxX - minX, maxZ - minZ], matrix = new THREE.Matrix4();
    cards.setNormalFacing(true); cards.setAlphaCoverage(true);
    const textures = {
        map: repeatablePage(cards.atlas.coverage), normalMap: repeatablePage(cards.atlas.normal), roughnessMap: repeatablePage(cards.atlas.roughness)
    };
    Object.assign(cards.material, textures); cards.material.needsUpdate = true;
    const narrow = cards.refined.mesh.geometry.clone(), wide = narrow.clone();
    for (const [geometry, scale] of [[narrow, 1], [wide, 4]]) {
        const p = geometry.attributes.position, uv = geometry.attributes.uv;
        for (let i = 0; i < p.count; i++) p.setX(i, centerX + (p.getX(i) - centerX) * scale);
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2 * scale);
        p.needsUpdate = uv.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    const scene = new THREE.Scene(), sun = lighting.sun.clone();
    sun.castShadow = false; scene.add(sun, sun.target, lighting.hemi.clone());
    const meshes = { current: new THREE.InstancedMesh(narrow, cards.material, instances),
        wide: new THREE.InstancedMesh(wide, cards.material, wideInstances) };
    for (let group = 0; group < wideInstances; group++) {
        const column = group % (columns / 4), row = Math.floor(group / (columns / 4));
        const x = (column - (columns / 4 - 1) / 2) * spacing[0] * 4 - centerX;
        const z = (row - (rows - 1) / 2) * spacing[1] - (minZ + maxZ) / 2;
        matrix.makeTranslation(x, 0, z); meshes.wide.setMatrixAt(group, matrix);
        for (let member = 0; member < 4; member++) {
            matrix.makeTranslation(x + (member - 1.5) * spacing[0], 0, z);
            meshes.current.setMatrixAt(group * 4 + member, matrix);
        }
    }
    const originals = {};
    for (const [name, mesh] of Object.entries(meshes)) {
        mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; scene.add(mesh);
        originals[name] = { matrices: mesh.instanceMatrix.array.slice(), version: mesh.instanceMatrix.version };
    }
    const boundsCurrent = new THREE.Box3().setFromObject(meshes.current), boundsWide = new THREE.Box3().setFromObject(meshes.wide);
    const proof = { representedLeaves: 0, sourcePointChecks: 0, maximumLeafPositionErrorMeters: 0,
        maximumFieldBoundsErrorMeters: Math.max(boundsCurrent.min.distanceTo(boundsWide.min), boundsCurrent.max.distanceTo(boundsWide.max)),
        atlasTile: [textures.map.image.width, textures.map.image.height], coverageMipCount: textures.map.mipmaps.length,
        textureRepeatsPerCard: { current: 1, wide: 4 }, sameMaterial: meshes.current.material === meshes.wide.material };
    const currentMatrix = new THREE.Matrix4(), wideMatrix = new THREE.Matrix4(), point = new THREE.Vector3(), expected = new THREE.Vector3();
    for (let group = 0; group < wideInstances; group++) {
        meshes.wide.getMatrixAt(group, wideMatrix);
        for (let member = 0; member < 4; member++) {
            meshes.current.getMatrixAt(group * 4 + member, currentMatrix);
            for (const leaf of plant.leaves) {
                proof.representedLeaves++;
                const p = leaf.geometry.attributes.position;
                for (const index of [0, p.count - 1]) {
                    point.fromBufferAttribute(p, index).add(leaf.position);
                    expected.copy(point).applyMatrix4(currentMatrix);
                    const repeatedU = member + (point.x - minX) / spacing[0];
                    point.x = wide.boundingBox.min.x + repeatedU / 4 * (wide.boundingBox.max.x - wide.boundingBox.min.x);
                    point.applyMatrix4(wideMatrix);
                    proof.maximumLeafPositionErrorMeters = Math.max(proof.maximumLeafPositionErrorMeters, point.distanceTo(expected));
                    proof.sourcePointChecks++;
                }
            }
        }
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
    const fieldBounds = boundsCurrent.clone().union(boundsWide), center = fieldBounds.getCenter(new THREE.Vector3());
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
    for (const name of ['current', 'wide']) { setCase(name); await renderer.compileAsync(scene, camera); render(); }
    for (let i = 0; i < 120; i++) { await raf(); setCase(i % 2 ? 'wide' : 'current'); render(); }
    const metadata = {
        renderer: device, resolution: [width, height], samples: target.samples, target: 'RGBA16F + depth; 4x MSAA',
        leaves: instances * cards.getSnapshot().sourceLeaves, variant: 'LOD3 · 24', corrections: cards.getSnapshot().corrections, proof,
        fieldMeters: [columns * spacing[0], rows * spacing[1]], grid: [columns, rows], poses,
        rowOccupancy: '39 rows of 64 narrow groups plus 4 groups on the final row; identical in both layouts.',
        camera: { type: camera.type, fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
        cases: Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name, {
            instances: mesh.count, leavesPerGroup: name === 'current' ? 20 : 80, leaves: 50000,
            cardWidthMeters: spacing[0] * (name === 'current' ? 1 : 4), cards: mesh.count * 24,
            triangles: mesh.count * mesh.geometry.index.count / 3, drawCalls: 1
        }])),
        material: { alphaTest: cards.material.alphaTest, alphaToCoverage: cards.material.alphaToCoverage, depthTest: cards.material.depthTest, depthWrite: cards.material.depthWrite },
        atlas: cards.getSnapshot().atlas, lighting: lighting.getSnapshot(),
        scope: 'Grass-only pass with game sunlight and environment. Includes render-target clear and resolve, with an empty-pass baseline. No soil, bus, sky, shadows, wind or postprocessing. Shader compilation, baking, uploads and captures excluded. Both corrections enabled. Same field and all leaf positions; four adjacent groups become one group of 4x-wide cards. Identical repeated PBR tile and mip chain, texel density, lighting and cameras. All 50,000 represented leaves remain inside all three cameras. No per-instance culling.'
    };
    async function runRound(pose, round, warmup = 30, samples = 120) {
        setPose(pose);
        const names = ['empty', 'current', 'wide'];
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
        for (const name of ['current', 'wide']) {
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
            Object.values(meshes).forEach(mesh => mesh.dispose()); narrow.dispose(); wide.dispose(); Object.values(textures).forEach(texture => texture.dispose()); } });
}
