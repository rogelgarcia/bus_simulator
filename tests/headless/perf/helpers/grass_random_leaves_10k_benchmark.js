// Capture and measure full-density LOD0 and LOD3 leaves with identical randomized placements.
import * as THREE from 'three';
import { createGrassDebugV2SingleLeaf, GRASS_V2_SINGLE_LEAF } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2SingleLeaf.js';
import { createGrassDebugV2PlantCards } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantCards.js';
import { registerMaterialShaderHook } from '../../../../src/graphics/shaders/core/MaterialShaderHookRegistry.js';
import { getOrCreateGpuFrameTimer } from '../../../../src/graphics/engine3d/perf/GpuFrameTimer.js';

const COUNT = 10000, SEED = 9262026, BENDS = [0.6, 0.8, 1, 1.2, 1.4];
const raf = () => new Promise(resolve => requestAnimationFrame(resolve));

function varyBend(plant, factor) {
    const definition = GRASS_V2_SINGLE_LEAF;
    const curve = new THREE.CubicBezierCurve3(...definition.curve.map(p => new THREE.Vector3(...p)));
    const changed = new THREE.CubicBezierCurve3(...definition.curve.map(([x, y, z]) => new THREE.Vector3(x, y, z * factor)));
    const root = curve.v0, correction = curve.getLength() / changed.getLength();
    for (const point of [changed.v1, changed.v2, changed.v3]) point.sub(root).multiplyScalar(correction).add(root);
    changed.updateArcLengths();
    const point = new THREE.Vector3(), oldCenter = new THREE.Vector3(), center = new THREE.Vector3(), quaternion = new THREE.Quaternion();
    for (const mesh of plant.bakeMeshes) {
        const geometry = mesh.geometry, p = geometry.attributes.position, uv = geometry.attributes.uv;
        for (let i = 0; i < p.count; i++) {
            const t = mesh === plant.leaves[0] ? uv.getY(i) : definition.shootCenterT;
            curve.getPoint(t, oldCenter); changed.getPoint(t, center);
            quaternion.setFromUnitVectors(curve.getTangent(t).normalize(), changed.getTangent(t).normalize());
            point.fromBufferAttribute(p, i); point.x *= -1; point.z *= -1;
            point.sub(oldCenter).applyQuaternion(quaternion).add(center); point.x *= -1; point.z *= -1;
            p.setXYZ(i, point.x, point.y, point.z);
        }
        p.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const facing = geometry.attributes.grassFacingNormal, normal = geometry.attributes.normal;
        const stride = definition.acrossSegments + 1;
        for (let i = 0; i < p.count; i++) {
            const row = Math.floor(i / stride);
            const index = mesh === plant.leaves[0] ? Math.min(row * stride + definition.acrossSegments / 2, p.count - 1) : i;
            facing.setXYZ(i, normal.getX(index), normal.getY(index), normal.getZ(index));
        }
        facing.needsUpdate = true;
    }
    return { factor, lengthMeters: changed.getLength(), tip: changed.v3.toArray() };
}

function correctInstancedAtlasNormals(material) {
    // Test-only hook: Three's object-space normal maps need the per-instance rotation for this experiment.
    registerMaterialShaderHook(material, { id: 'grass.benchmark.instance_normals', priority: 100, variantKey: 'random-leaf-instance-normals-v1',
        apply: shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <common>',
                '#include <common>\nvarying mat3 vGrassBenchmarkNormal;')
                .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
                mat3 grassInstanceNormal = mat3(instanceMatrix);
                grassInstanceNormal[0] /= dot(grassInstanceNormal[0], grassInstanceNormal[0]);
                grassInstanceNormal[1] /= dot(grassInstanceNormal[1], grassInstanceNormal[1]);
                grassInstanceNormal[2] /= dot(grassInstanceNormal[2], grassInstanceNormal[2]);
                vGrassBenchmarkNormal = normalMatrix * grassInstanceNormal;`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps)
                .replace(/\bnormalMatrix\b/g, 'vGrassBenchmarkNormal')
                .replace('#include <common>', '#include <common>\nvarying mat3 vGrassBenchmarkNormal;');
        } });
}

export async function createGrassRandomLeaves10kBenchmark(study) {
    const { renderer, scene, camera, lighting, plant, controls } = study;
    study.setMode('LOD0'); plant.group.visible = false; study.soil.group.visible = false; study.squareBounds.visible = false;
    const ground = scene.getObjectByName('GrassV2DirtTerrain');
    if (!ground) throw new Error('Expected the study soil surface.');
    ground.visible = true; controls.enabled = false;
    renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false); lighting.resize(1920, 1080);
    camera.aspect = 1920 / 1080; camera.updateProjectionMatrix();
    const groups = Object.fromEntries(['lod0', 'lod10', 'lod5'].map(name => [name, new THREE.Group()]));
    Object.entries(groups).forEach(([name, group]) => { group.name = 'RandomLeaves10k:' + name; scene.add(group); });
    const sources = [], placements = [], bends = [];
    let state = SEED >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const between = (a, b) => THREE.MathUtils.lerp(a, b, random());
    const transform = new THREE.Object3D(), box = new THREE.Box3(), bounds = new THREE.Box3(), positions = new THREE.Vector3();
    const terrain = { width: 20, depth: 20, centerX: 0, centerZ: 0.1 };
    for (let variant = 0; variant < BENDS.length; variant++) {
        const source = createGrassDebugV2SingleLeaf({ material: plant.leaves[0].material });
        bends.push(varyBend(source, BENDS[variant]));
        const cards = createGrassDebugV2PlantCards(renderer, source, { nested: true, rootSoil: { material: ground.material, terrain } });
        correctInstancedAtlasNormals(cards.material); sources.push({ plant: source, cards });
        const meshes = [
            ...source.bakeMeshes.map(mesh => ['lod0', new THREE.InstancedMesh(mesh.geometry, mesh.material, COUNT / BENDS.length)]),
            ['lod10', new THREE.InstancedMesh(cards.refined.mesh.geometry, cards.material, COUNT / BENDS.length)],
            ['lod5', new THREE.InstancedMesh(cards.detailed.mesh.geometry, cards.material, COUNT / BENDS.length)]
        ];
        const sourceBounds = new THREE.Box3().setFromObject(source.group);
        sourceBounds.union(cards.refined.mesh.geometry.boundingBox).union(cards.detailed.mesh.geometry.boundingBox);
        for (let i = 0; i < COUNT / BENDS.length; i++) {
            const yaw = between(0, 360), pitch = between(-15, 20), roll = between(-12, 12), scale = between(0.8, 1.15), burial = between(0, 0.003);
            transform.position.set(0, -burial, 0); transform.rotation.set(THREE.MathUtils.degToRad(pitch),
                THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(roll), 'YXZ');
            transform.scale.setScalar(scale); transform.updateMatrix();
            box.copy(sourceBounds).applyMatrix4(transform.matrix);
            positions.set(between(-0.5 - box.min.x, 0.5 - box.max.x), -burial, between(-0.5 - box.min.z, 0.5 - box.max.z));
            transform.position.copy(positions); transform.updateMatrix();
            const worldBounds = box.clone().translate(new THREE.Vector3(positions.x, 0, positions.z)); bounds.union(worldBounds);
            for (const [, mesh] of meshes) mesh.setMatrixAt(i, transform.matrix);
            placements.push({ variant, position: positions.toArray(), yaw, pitch, roll, scale, burial, matrix: transform.matrix.toArray() });
        }
        for (const [name, mesh] of meshes) {
            mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
            groups[name].add(mesh);
        }
        await raf();
    }
    lighting.applyEnvironment();
    const sun = lighting.sun; sun.target.position.set(0, 0, 0);
    sun.position.copy(sun.target.position).addScaledVector(lighting.sunRef.direction, 2);
    Object.assign(sun.shadow.camera, { left: -0.9, right: 0.9, bottom: -0.9, top: 0.9, near: 0.01, far: 4 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.autoUpdate = false;
    const center = bounds.getCenter(new THREE.Vector3()), corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [0, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new THREE.Vector3(x, y, z));
    const poses = {};
    for (const [name, direction] of [['three_quarter', new THREE.Vector3(0.72, 0.68, 1).normalize()], ['top', new THREE.Vector3(0, 1, 0)]]) {
        camera.up.set(0, name === 'top' ? 0 : 1, name === 'top' ? -1 : 0);
        camera.position.copy(center).add(direction); camera.lookAt(center);
        const inverse = camera.quaternion.clone().invert(), tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let distance = 0;
        for (const point of corners) {
            const local = point.clone().sub(center).applyQuaternion(inverse);
            distance = Math.max(distance, local.z + 1.12 * Math.max(Math.abs(local.x) / (tanY * camera.aspect), Math.abs(local.y) / tanY));
        }
        camera.position.copy(center).addScaledVector(direction, distance); camera.lookAt(center); camera.updateMatrixWorld();
        const projected = new THREE.Box3().setFromPoints(corners.map(p => p.clone().project(camera)));
        if (projected.min.x < -1 || projected.max.x > 1 || projected.min.y < -1 || projected.max.y > 1) throw new Error('Patch outside camera.');
        poses[name] = { position: camera.position.toArray(), up: camera.up.toArray(), target: center.toArray(),
            projectedBounds: { min: projected.min.toArray(), max: projected.max.toArray() } };
    }
    const setPose = name => { camera.position.fromArray(poses[name].position); camera.up.fromArray(poses[name].up);
        camera.lookAt(center); camera.updateMatrixWorld(); };
    const render = (refreshShadows = false) => {
        sun.shadow.needsUpdate = refreshShadows; renderer.shadowMap.needsUpdate = refreshShadows;
        renderer.info.reset(); lighting.render(0);
        return { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
    };
    const setCase = name => { for (const [key, group] of Object.entries(groups)) group.visible = name === key; };
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const timer = getOrCreateGpuFrameTimer(renderer);
    if (!timer.isSupported || /swiftshader|llvmpipe|software/i.test(device)) throw new Error('Hardware GPU timing required.');
    const cases = Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, {
        leaves: COUNT, cards: name === 'lod0' ? 0 : COUNT * (name === 'lod10' ? 10 : 5),
        triangles: group.children.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0),
        grassDrawCalls: group.children.length
    }]));
    const metadata = { seed: SEED, leaves: COUNT, squareMeters: 1, renderer: device, resolution: [1920, 1080],
        variation: { yawDegrees: [0, 360], inclinationDegrees: [-15, 20], rollDegrees: [-12, 12], uniformScale: [0.8, 1.15],
            burialMeters: [0, 0.003], bendFactors: BENDS, bends },
        cases, poses, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, lighting: lighting.getSnapshot(),
        corrections: { normalFacing: true, alphaCoverage: true, instancedAtlasNormals: true },
        scope: 'Full study scene: grass, flat Brown Earth terrain, game lighting/environment, 4096px sun shadows, sky and configured postprocessing. Root soil mounds omitted in every case. Stationary view; overlaps allowed, all geometry inside the 1m square. Identical instance matrices across LODs. Five source bends rebaked into their own original-resolution PBR atlases; full LOD0 geometry. Cached and refreshed shadow timings measured separately. Setup, baking, compilation and screenshots excluded.' };
    setPose('three_quarter');
    for (const name of ['empty', 'lod0', 'lod10', 'lod5']) {
        setCase(name); await renderer.compileAsync(scene, camera); render(true); await raf(); render();
    }
    const countChecks = {};
    for (const name of ['empty', 'lod0', 'lod10', 'lod5']) { setCase(name); render(true); countChecks[name] = render(); }
    metadata.submitted = countChecks;
    metadata.identicalPlacements = BENDS.every((_, v) => {
        const a = groups.lod0.children[v * 2].instanceMatrix.array;
        return [groups.lod0.children[v * 2 + 1], groups.lod10.children[v], groups.lod5.children[v]].every(mesh =>
            a.every((value, i) => value === mesh.instanceMatrix.array[i]));
    });
    async function runBlock(name, refreshShadows, samples = 100, warmup = 20) {
        setPose('three_quarter'); setCase(name); render(true);
        for (let i = 0; i < warmup; i++) { await raf(); render(refreshShadows); }
        timer.resetSamples();
        const gpu = [], cpuSubmission = [], frameInterval = [];
        let cursor = 0, previous = null;
        const collect = () => { timer.poll(); for (const sample of timer.getSamplesSince(cursor)) { gpu.push(sample.ms); cursor = sample.sequence; } };
        const programs = renderer.info.programs.length;
        let submitted;
        for (let i = 0; i < samples; i++) {
            const now = await raf(); if (previous !== null) frameInterval.push(now - previous); previous = now;
            collect();
            const deadline = performance.now() + 10000;
            while (timer.getDiagnostics().pendingQueryCount > 4) {
                await raf(); collect(); if (performance.now() > deadline) throw new Error('GPU query backlog.');
            }
            timer.beginFrame(); const start = performance.now(); submitted = render(refreshShadows);
            cpuSubmission.push(performance.now() - start); timer.endFrame();
        }
        const deadline = performance.now() + 15000;
        while (cursor < samples && performance.now() < deadline) { await raf(); collect(); }
        const diagnostics = timer.getDiagnostics();
        if (gpu.length !== samples || diagnostics.disjointCount || diagnostics.pendingQueryCount || !diagnostics.active)
            throw new Error('Incomplete or disjoint GPU samples: ' + JSON.stringify(diagnostics));
        if (renderer.info.programs.length !== programs) throw new Error('Shader compilation during sampling.');
        return { name, refreshShadows, samples, gpu, cpuSubmission, frameInterval, submitted, diagnostics };
    }
    function capture(name, pose) {
        setPose(pose); setCase(name); render(true); render();
        return renderer.domElement.toDataURL('image/png');
    }
    return Object.freeze({ metadata, placements, runBlock, capture });
}
