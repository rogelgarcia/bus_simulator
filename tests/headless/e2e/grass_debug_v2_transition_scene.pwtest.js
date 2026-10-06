// Validate abrupt grass transitions, bounded selection work, instance coverage and world-continuous surface UVs.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/validation');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

async function inspectCoverage(page) {
    return page.evaluate(() => {
        const s = window.__grassTransitionScene, state = s.getSnapshot();
        const cells = s.fields.cells, byPosition = new Map(cells.map(cell => [cell.centerX + ',' + cell.centerZ, cell.id]));
        const main = new Uint8Array(cells.length), ground = new Uint8Array(cells.length), actual = new Uint8Array(cells.length).fill(255);
        const counts = [0, 0, 0, 0, 0, 0], matrix = s.camera.matrix.clone(), unknown = [], canopyEdges = [];
        s.fields.group.traverse(mesh => {
            if (!mesh.isInstancedMesh || !mesh.visible) return;
            const level = mesh.userData.grassTransitionLevel, isGround = mesh.name.endsWith('-Ground');
            if (level === undefined && !isGround) return;
            for (let i = 0; i < mesh.count; i++) {
                mesh.getMatrixAt(i, matrix);
                const key = matrix.elements[12] + ',' + matrix.elements[14], id = byPosition.get(key);
                if (id === undefined) { unknown.push(key); continue; }
                if (isGround) ground[id]++;
                else {
                    main[id]++; actual[id] = level; counts[level]++;
                    if (level === 5) {
                        const edges = mesh.geometry.attributes.grassTransitionOpenEdges;
                        canopyEdges.push({ id, interior: !!mesh.userData.grassCanopyInterior,
                            triangles: mesh.geometry.index.count / 3,
                            edges: edges ? [edges.getX(i), edges.getY(i), edges.getZ(i), edges.getW(i)] : null });
                    }
                }
            }
        });
        const invalid = [], mismatches = [];
        for (const cell of cells) {
            const distance = Math.hypot(cell.centerX - s.camera.position.x, cell.centerZ - s.camera.position.z);
            let expected = 0;
            while (expected < 5 && distance >= state.selection.effectiveDistances[expected]) expected++;
            if (state.soilOnly) {
                if (main[cell.id] !== 0 || ground[cell.id] !== 1) invalid.push(cell.id);
            } else {
                if (main[cell.id] !== 1 || ground[cell.id] + Number(actual[cell.id] === 5) !== 1) invalid.push(cell.id);
                if (actual[cell.id] !== expected) mismatches.push(cell.id);
            }
        }
        const invalidOpenEdges = [];
        let openEdgeCount = 0;
        for (const record of canopyEdges) {
            const cell = cells[record.id], size = state.fields.fieldSize;
            const neighbors = [cell.x > 0 ? cell.id - 1 : -1, cell.x < size - 1 ? cell.id + 1 : -1,
                cell.z > 0 ? cell.id - size : -1, cell.z < size - 1 ? cell.id + size : -1];
            const expected = neighbors.map(id => Number(id >= 0 && actual[id] < 5));
            openEdgeCount += expected.reduce((sum, value) => sum + value, 0);
            const interior = state.fields.optimization === 'optimized' && !cell.edge && expected.every(value => value === 0);
            if (record.interior !== interior || record.triangles !== (interior ? 2 : 32)
                || (interior ? record.edges !== null : !record.edges || record.edges.some((value, i) => value !== expected[i])))
                invalidOpenEdges.push({ id: cell.id, expected, actual: record.edges, interior: record.interior, triangles: record.triangles });
        }
        return { state, counts, invalid, mismatches, unknown, openEdgeCount, invalidOpenEdges,
            groundInstances: ground.reduce((sum, value) => sum + value, 0) };
    });
}

async function inspectWorldUvs(page) {
    return page.evaluate(async () => {
        const THREE = await import('three');
        const { cloneMaterialShaderContract, registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const s = window.__grassTransitionScene, renderer = s.renderer;
        const savedLevels = new Uint8Array(s.updateSelection(true).levels), savedSoil = s.getSnapshot().soilOnly;
        const target = new THREE.WebGLRenderTarget(64, 64), previousTarget = renderer.getRenderTarget();
        const previousShadowEnabled = renderer.shadowMap.enabled;
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.set(-16, 5, -16); camera.up.set(0, 0, -1); camera.lookAt(-16, 0, -16); camera.updateMatrixWorld(true);
        const results = [];
        try {
            renderer.shadowMap.enabled = false;
            s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(5));
            for (const mode of ['canopy', 'soil']) {
                s.fields.setSoilOnly(mode === 'soil'); s.fields.group.updateMatrixWorld(true);
                const scene = new THREE.Scene(), meshes = [], materials = [], matrices = [];
                s.fields.group.traverse(source => {
                    if (!source.isInstancedMesh || !source.visible || !source.name.startsWith('GrassTransitionField_0-')) return;
                    if (mode === 'canopy' ? source.userData.grassTransitionLevel !== 5 : !source.name.endsWith('-Ground')) return;
                    const material = cloneMaterialShaderContract(source.material);
                    material.toneMapped = false;
                    registerMaterialShaderHook(material, { id: 'test.transition-uv-output', priority: 1000, variantKey: '1',
                        apply(shader) {
                            matrices.push({ world: shader.uniforms.grassTransitionUvMatrix.value.clone(), map: source.material.map.matrix.clone() });
                            shader.fragmentShader = shader.fragmentShader.replace('void main() {',
                                'void main() { gl_FragColor = vec4(fract(vMapUv), 0.0, 1.0); return;');
                        } });
                    const mesh = new THREE.InstancedMesh(source.geometry, material, source.count), matrix = new THREE.Matrix4();
                    for (let i = 0; i < source.count; i++) { source.getMatrixAt(i, matrix); mesh.setMatrixAt(i, matrix); }
                    mesh.matrix.copy(source.matrixWorld); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
                    meshes.push(mesh); materials.push(material); scene.add(mesh);
                });
                try {
                    renderer.setRenderTarget(target); renderer.render(scene, camera);
                    const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
                    if (!matrices.length) throw new Error('World-UV probe did not compile the ' + mode + ' surface.');
                    const samples = [];
                    for (const row of [8, 24, 40, 56]) for (const column of [8, 24, 40, 56]) {
                        const x = -17 + (column + 0.5) / 32, z = -15 - (row + 0.5) / 32;
                        const uv = new THREE.Vector3(x, z, 1).applyMatrix3(matrices[0].world).applyMatrix3(matrices[0].map);
                        const expected = [uv.x, uv.y].map(value => Math.round((value - Math.floor(value)) * 255));
                        const offset = (row * 64 + column) * 4, actual = Array.from(pixels.slice(offset, offset + 4));
                        samples.push({ x, z, expected, actual, error: Math.max(Math.abs(expected[0] - actual[0]), Math.abs(expected[1] - actual[1])) });
                    }
                    results.push({ mode, meshCount: meshes.length, samples, glError: renderer.getContext().getError() });
                } finally {
                    for (const mesh of meshes) mesh.dispose();
                    for (const material of materials) material.dispose();
                }
            }
        } finally {
            renderer.setRenderTarget(previousTarget); renderer.shadowMap.enabled = previousShadowEnabled;
            s.fields.setSoilOnly(savedSoil); s.fields.applyLevels(savedLevels); target.dispose();
        }
        return results;
    });
}

async function inspectInternalRamp(page) {
    return page.evaluate(async () => {
        const THREE = await import('three');
        const { cloneMaterialShaderContract, registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const s = window.__grassTransitionScene, renderer = s.renderer;
        const savedLevels = new Uint8Array(s.updateSelection(true).levels), levels = new Uint8Array(savedLevels.length).fill(5);
        const hole = s.fields.cells.find(cell => cell.centerX === -16 && cell.centerZ === -16);
        if (!hole) throw new Error('Internal ramp probe requires the center cell of the first field.');
        levels[hole.id] = 2;
        const target = new THREE.WebGLRenderTarget(64, 64), previousTarget = renderer.getRenderTarget();
        const previousShadowEnabled = renderer.shadowMap.enabled;
        const scene = new THREE.Scene(), materials = [], meshes = [];
        let shape;
        try {
            s.fields.applyLevels(levels); s.fields.group.updateMatrixWorld(true); renderer.shadowMap.enabled = false;
            s.fields.group.traverse(source => {
                if (!source.isInstancedMesh || !source.visible || source.userData.grassTransitionLevel !== 5
                    || !source.name.startsWith('GrassTransitionField_0-')) return;
                const material = cloneMaterialShaderContract(source.material);
                registerMaterialShaderHook(material, { id: 'test.transition-ramp-height', priority: 1000, variantKey: '1',
                    apply(shader) {
                        if (shader.uniforms.grassTransitionCanopyShape) shape = shader.uniforms.grassTransitionCanopyShape.value.clone();
                        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTransitionProbeHeight;')
                            .replace('#include <project_vertex>', 'vTransitionProbeHeight = transformed.y;\n#include <project_vertex>');
                        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTransitionProbeHeight;')
                            .replace('void main() {', 'void main() { gl_FragColor = vec4(vTransitionProbeHeight / 0.2, 0.0, 0.0, 1.0); return;');
                    } });
                const mesh = new THREE.InstancedMesh(source.geometry, material, source.count), matrix = new THREE.Matrix4();
                for (let i = 0; i < source.count; i++) { source.getMatrixAt(i, matrix); mesh.setMatrixAt(i, matrix); }
                mesh.matrix.copy(source.matrixWorld); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
                scene.add(mesh); meshes.push(mesh); materials.push(material);
            });
            const camera = new THREE.OrthographicCamera(-0.1, 0.1, 0.1, -0.1, 0.1, 10);
            camera.position.set(hole.minX, 5, hole.centerZ); camera.up.set(0, 0, -1);
            camera.lookAt(hole.minX, 0, hole.centerZ); camera.updateMatrixWorld(true);
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
            if (!shape) throw new Error('Internal ramp shader did not compile.');
            const samples = [1, 10, 16, 20, 24, 28, 30].map(column => {
                const inset = 0.1 - (column + 0.5) / 64 * 0.2;
                const expectedHeight = 0.005 + (shape.x - 0.005) * Math.min(1, inset / shape.y);
                const offset = (32 * 64 + column) * 4, actualHeight = pixels[offset] / 255 * 0.2;
                return { inset, expectedHeight, actualHeight, alpha: pixels[offset + 3], errorMeters: Math.abs(expectedHeight - actualHeight) };
            });
            return { samples, height: shape.x, ramp: shape.y, glError: renderer.getContext().getError() };
        } finally {
            renderer.setRenderTarget(previousTarget); renderer.shadowMap.enabled = previousShadowEnabled;
            for (const mesh of meshes) mesh.dispose();
            for (const material of materials) material.dispose();
            target.dispose(); s.fields.applyLevels(savedLevels);
        }
    });
}

async function inspectNavigation(page) {
    const read = () => page.evaluate(() => {
        const s = window.__grassTransitionScene;
        return { position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray(),
            direction: s.camera.getWorldDirection(s.camera.position.clone()).toArray(), speed: s.navigation.getSpeed(),
            busHeight: s.getSnapshot().cameraHeight, busPitch: s.getSnapshot().cameraPitch };
    });
    const move = async (key, seconds = 0.25) => {
        await page.keyboard.down(key);
        try { await page.evaluate(seconds => window.__grassTransitionScene.navigation.update(seconds), seconds); }
        finally { await page.keyboard.up(key); }
        return read();
    };
    await page.evaluate(() => window.__grassTransitionScene.setPose('front'));
    await page.locator('#scene-canvas').focus();
    const initial = await read();
    await page.mouse.move(1200, 430);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(1340, 680, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    const looked = await read();
    expect(looked.position).toEqual(initial.position);
    expect(looked.quaternion).not.toEqual(initial.quaternion);
    expect(looked.direction[1]).toBeLessThan(-0.7);
    const distance = looked.speed * 0.25;
    const length = Math.hypot(looked.direction[0], looked.direction[2]);
    const forward = [looked.direction[0] / length, looked.direction[2] / length];
    const w = await move('w'), backward = await move('s'), a = await move('a'), right = await move('d');
    for (const state of [w, backward, a, right]) {
        expect(state.position[1], 'WASD must preserve altitude despite steep camera pitch').toBeCloseTo(looked.position[1], 9);
        expect(state.quaternion).toEqual(looked.quaternion);
    }
    expect(w.position[0] - looked.position[0]).toBeCloseTo(forward[0] * distance, 8);
    expect(w.position[2] - looked.position[2]).toBeCloseTo(forward[1] * distance, 8);
    expect(Math.hypot(w.position[0] - looked.position[0], w.position[2] - looked.position[2])).toBeCloseTo(distance, 8);
    expect(a.position[0] - looked.position[0]).toBeCloseTo(forward[1] * distance, 8);
    expect(a.position[2] - looked.position[2]).toBeCloseTo(-forward[0] * distance, 8);
    for (const state of [backward, right]) for (const axis of [0, 1, 2]) expect(state.position[axis]).toBeCloseTo(looked.position[axis], 8);

    const up = await move('e'), down = await move('q'), raised = await move('e', 0.5);
    expect(up.position[1] - looked.position[1]).toBeCloseTo(distance, 8);
    expect(down.position[1]).toBeCloseTo(looked.position[1], 8);
    for (const state of [up, down, raised]) for (const axis of [0, 2]) expect(state.position[axis]).toBeCloseTo(looked.position[axis], 8);
    await page.keyboard.press('r');
    const reset = await read();
    expect(reset.position[1]).toBeCloseTo(reset.busHeight, 8);
    expect(reset.direction[1]).toBeCloseTo(-Math.sin(reset.busPitch * Math.PI / 180), 8);
    for (const axis of [0, 2]) expect(reset.position[axis]).toBeCloseTo(raised.position[axis], 8);
    const resetLength = Math.hypot(reset.direction[0], reset.direction[2]);
    expect(reset.direction[0] / resetLength).toBeCloseTo(forward[0], 8);
    expect(reset.direction[2] / resetLength).toBeCloseTo(forward[1], 8);

    const beforeEditing = await move('e');
    await page.locator('#transition-limit-0').focus();
    await page.keyboard.press('r');
    const editing = await read();
    expect(editing.position, 'R must not reset the camera while editing a limit').toEqual(beforeEditing.position);
    expect(editing.quaternion).toEqual(beforeEditing.quaternion);
    await page.locator('#scene-canvas').focus();
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.navigation.clear(); s.setPose('front'); });
    return { initial, looked, w, backward, a, right, up, down, raised, reset, beforeEditing, editing };
}

test('Transition lab selects one abrupt LOD per cell, reuses stationary assignments and shares continuous surface UVs', async ({ page }) => {
    test.setTimeout(240000);
    await mkdir(output, { recursive: true });
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
        await page.goto('/debug_tools/grass_transition_scene.html?transition=0&experiment=baseline&revision=transition-lab-1#front');
        await page.waitForFunction(() => !!window.__grassTransitionReadiness);
        await page.evaluate(async () => {
            await window.__grassTransitionReadiness;
            window.__grassTransitionScene.setAnimating(false); window.__grassTransitionScene.step(0);
        });
        await expect(page.locator('#scene-loading')).toBeHidden();
        expect(await page.evaluate(() => window.__grassTransitionScene.getSnapshot().selection.distances)).toEqual([.6, .8, 1, 16, 32]);
        // Keep the established all-level geometry/seam scenario at its original ranges.
        await page.evaluate(() => window.__grassTransitionScene.setSettings({ distances: [1, 2, 5, 18, 32] }));
        const initial = await inspectCoverage(page); evidence.initial = initial;
        expect(initial.state.fields.cells).toBe(4096);
        expect(initial.state.fields.fields).toHaveLength(4);
        expect(initial.state.fields.fieldSize).toBe(32);
        expect(initial.state.fields.selectionCellMeters).toBe(1);
        expect(initial.state.fields.groundLayersPerCell).toBe(1);
        expect(initial.state.selection.distances).toEqual([1, 2, 5, 18, 32]);
        expect(initial.counts).toEqual(initial.state.selection.counts);
        expect(initial.counts.every(count => count > 0)).toBe(true);
        expect(initial.invalid).toEqual([]); expect(initial.mismatches).toEqual([]); expect(initial.unknown).toEqual([]);
        expect(initial.openEdgeCount).toBeGreaterThan(0); expect(initial.invalidOpenEdges).toEqual([]);
        evidence.canopyShadows = await page.evaluate(() => {
            const s = window.__grassTransitionScene, gl = s.renderer.getContext(), seen = new Set(), materials = [];
            s.fields.group.traverse(mesh => {
                if (!mesh.isMesh || !mesh.visible || !mesh.userData.grassCanopy || seen.has(mesh.material)) return;
                seen.add(mesh.material);
                const properties = s.renderer.properties.get(mesh.material), program = properties.currentProgram;
                if (!program) return;
                const uniform = properties.uniforms, external = uniform.grassCanopyShadowVisibility.value.image;
                const source = gl.getShaderSource(program.fragmentShader), active = program.getUniforms().map;
                materials.push({ pass: uniform.grassCanopyShadowPass.value,
                    gpuPass: active.grassCanopyShadowPass ? gl.getUniform(program.program, active.grassCanopyShadowPass.addr) : null,
                    externalSize: [external.width, external.height], externalData: Array.from(external.data),
                    pcfDefine: /^\s*#define\s+SHADOWMAP_TYPE_PCF\s*$/m.test(source),
                    tileVisibilityActive: !!active.grassCanopyTileVisibility });
            });
            return materials;
        });
        expect(evidence.canopyShadows.length).toBeGreaterThan(0);
        for (const material of evidence.canopyShadows) {
            expect(material.pass).toBe(2); expect(material.gpuPass).toBe(2);
            expect(material.externalSize).toEqual([1, 1]); expect(material.externalData).toEqual([255]);
            expect(material.pcfDefine).toBe(true); expect(material.tileVisibilityActive).toBe(true);
        }

        await page.locator('#transition-half').click();
        const half = await inspectCoverage(page); evidence.half = half;
        expect(half.state.selection.effectiveDistances).toEqual([0.5, 1, 2.5, 9, 16]);
        expect(half.counts[5]).toBeGreaterThan(initial.counts[5]);
        expect(half.invalid).toEqual([]); expect(half.mismatches).toEqual([]);
        expect(half.openEdgeCount).toBeGreaterThan(0); expect(half.invalidOpenEdges).toEqual([]);
        expect(half.state.shadows.generations).toBe(initial.state.shadows.generations);
        await page.evaluate(() => { const s = window.__grassTransitionScene; s.setHelpers(false); s.step(0); });
        await page.screenshot({ path: path.join(output, 'front_half_seam.png') });
        await page.locator('#transition-full').click();
        const full = await inspectCoverage(page); evidence.full = full;
        expect(full.counts).toEqual(initial.counts);

        evidence.gating = await page.evaluate(() => {
            const s = window.__grassTransitionScene, position = s.camera.position.clone(), quaternion = s.camera.quaternion.clone();
            s.selection.resetMetrics(); s.updateSelection(true, 10000);
            const initial = s.selection.getSnapshot();
            for (let i = 1; i <= 60; i++) s.updateSelection(false, 10000 + i * 16);
            const stationary = s.selection.getSnapshot();
            s.camera.rotation.y += 0.4; s.camera.updateMatrixWorld(true); s.updateSelection(false, 12000);
            const rotation = s.selection.getSnapshot();
            s.camera.position.x += 0.1; s.updateSelection(false, 13000);
            const smallMovement = s.selection.getSnapshot();
            s.camera.position.x += 0.2; s.updateSelection(false, 13001);
            const moved = s.selection.getSnapshot();
            s.camera.position.x += 0.4; s.updateSelection(false, 13050);
            const interval = s.selection.getSnapshot();
            s.updateSelection(false, 13101); const elapsed = s.selection.getSnapshot();
            s.camera.position.copy(position); s.camera.quaternion.copy(quaternion); s.camera.updateMatrixWorld(true); s.updateSelection(true);
            return { initial, stationary, rotation, smallMovement, moved, interval, elapsed };
        });
        const gating = evidence.gating;
        expect(gating.stationary.scans).toBe(1); expect(gating.stationary.visitedCells).toBe(4096);
        expect(gating.rotation.scans).toBe(1); expect(gating.smallMovement.scans).toBe(1);
        expect(gating.moved.scans).toBe(2); expect(gating.interval.scans).toBe(2); expect(gating.elapsed.scans).toBe(3);
        expect(gating.interval.skippedInterval).toBe(1);

        const beforeHelpers = await inspectCoverage(page);
        await page.evaluate(() => { const s = window.__grassTransitionScene; s.setHelpers(false); s.step(0); });
        const withoutHelpers = await inspectCoverage(page);
        expect(withoutHelpers.state.helpers).toBe(false);
        expect(withoutHelpers.counts).toEqual(beforeHelpers.counts);
        expect(withoutHelpers.state.fields.triangles).toBe(beforeHelpers.state.fields.triangles);
        expect(withoutHelpers.state.shadows.generations).toBe(initial.state.shadows.generations);
        await page.locator('#transition-soil').check();
        await page.evaluate(() => window.__grassTransitionScene.step(0));
        evidence.soil = await inspectCoverage(page);
        expect(evidence.soil.state.soilOnly).toBe(true);
        expect(evidence.soil.counts).toEqual([0, 0, 0, 0, 0, 0]);
        expect(evidence.soil.groundInstances).toBe(4096);
        expect(evidence.soil.invalid).toEqual([]);
        await page.locator('#transition-soil').uncheck();

        evidence.poses = [];
        for (const pose of ['front', 'rear', 'border', 'overview']) {
            const helperPixels = await page.evaluate(pose => {
                const s = window.__grassTransitionScene; s.setPose(pose); s.setHelpers(true); s.step(0);
                const gl = s.renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let coloredRingPixels = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
                    if (r > 210 && g > 90 && g < 230 && b < 125) coloredRingPixels++;
                }
                return coloredRingPixels;
            }, pose);
            const capture = await inspectCoverage(page);
            const direction = await page.evaluate(() => { const s = window.__grassTransitionScene; return s.camera.getWorldDirection(s.camera.position.clone()).toArray(); });
            evidence.poses.push({ pose, capture, direction, helperPixels });
            expect(capture.invalid).toEqual([]); expect(capture.mismatches).toEqual([]);
            expect(capture.invalidOpenEdges).toEqual([]);
            expect(capture.state.glError).toBe(0); expect(capture.state.helpers).toBe(true);
            expect(capture.state.shadows.generations).toBe(initial.state.shadows.generations + 2);
            if (pose !== 'overview') {
                expect(helperPixels, pose + ' colored distance rings must remain visible after postprocessing').toBeGreaterThan(100);
                expect(capture.state.position[1]).toBeCloseTo(capture.state.cameraHeight, 8);
                expect(direction[1]).toBeCloseTo(-Math.sin(capture.state.cameraPitch * Math.PI / 180), 8);
            }
            await page.screenshot({ path: path.join(output, pose + '_helpers.png') });
        }
        evidence.worldUvs = await inspectWorldUvs(page);
        for (const probe of evidence.worldUvs) {
            expect(probe.glError).toBe(0);
            for (const sample of probe.samples) {
                expect(sample.actual[3]).toBe(255);
                expect(sample.error, probe.mode + ' world UV at ' + sample.x + ',' + sample.z).toBeLessThanOrEqual(2);
            }
        }
        evidence.internalRamp = await inspectInternalRamp(page);
        expect(evidence.internalRamp.glError).toBe(0);
        expect(evidence.internalRamp.ramp).toBeCloseTo(0.05, 6);
        for (const sample of evidence.internalRamp.samples) {
            expect(sample.alpha).toBe(255);
            expect(sample.errorMeters, 'Rendered canopy edge must descend continuously to the litter height').toBeLessThan(0.002);
        }
        expect(evidence.internalRamp.samples.at(-1).actualHeight).toBeLessThan(0.02);
        evidence.navigation = await inspectNavigation(page);
        const inspectSides = () => page.evaluate(() => {
            const s = window.__grassTransitionScene, state = s.getSnapshot(), actual = [], matrix = s.camera.matrix.clone();
            s.fields.group.traverse(mesh => {
                if (!mesh.isInstancedMesh || !mesh.visible || !mesh.name.includes('-Fringe-')) return;
                for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); actual.push(matrix.elements[12] + ',' + matrix.elements[14]); }
            });
            const expected = s.fields.cells.filter(cell => {
                const distance = Math.hypot(cell.centerX - s.camera.position.x, cell.centerZ - s.camera.position.z);
                return cell.edge && distance >= state.selection.effectiveDistances[4] && distance <= state.selection.sideLeafDistance;
            }).map(cell => cell.centerX + ',' + cell.centerZ);
            return { state, actual: actual.sort(), expected: expected.sort() };
        });
        const setSideDistance = async distance => {
            await page.locator('#transition-side-leaves').fill(String(distance));
            await page.locator('#transition-side-leaves').press('Tab');
            const sides = await inspectSides(); expect(sides.actual).toEqual(sides.expected); return sides;
        };
        const normalSides = await inspectSides();
        expect(normalSides.state.selection.sideLeafDistance).toBe(35);
        expect(normalSides.actual).toEqual(normalSides.expected);
        const allSides = await setSideDistance(200), noSides = await setSideDistance(0), restoredSides = await setSideDistance(35);
        expect(allSides.actual.length).toBeGreaterThan(normalSides.actual.length);
        expect(normalSides.actual.length).toBeGreaterThan(0); expect(noSides.actual).toEqual([]);
        expect(noSides.state.fields.sideLeafCells).toBe(0);
        expect(noSides.state.fields.levels).toEqual(allSides.state.fields.levels);
        expect(noSides.state.fields.triangles).toBeLessThan(allSides.state.fields.triangles);
        expect(restoredSides.state.fields.triangles).toBe(normalSides.state.fields.triangles);
        expect(restoredSides.state.shadows.generations).toBe(normalSides.state.shadows.generations);
        evidence.sideLeaves = { normalSides, allSides, noSides, restoredSides };
        await page.locator('#transition-half').click();
        await expect(page.locator('#transition-half')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#transition-half-3')).toHaveText('½ 9 m');
        expect((await inspectSides()).state.selection.sideLeafDistance).toBe(35);
        for (let i = 0; i < 5; i++) {
            const input = await page.locator('#transition-limit-' + i).boundingBox();
            const half = await page.locator('#transition-half-' + i).boundingBox();
            const label = await page.locator('label[for="transition-limit-' + i + '"]').boundingBox();
            expect(input.y).toBeGreaterThanOrEqual(label.y + label.height);
            expect(half.y).toBeGreaterThan(input.y + input.height);
            expect(half.x).toBeCloseTo(input.x, 3); expect(half.width).toBeCloseTo(input.width, 3);
        }
        const fullButton = await page.locator('#transition-full').boundingBox(), halfButton = await page.locator('#transition-half').boundingBox();
        const firstInput = await page.locator('#transition-limit-0').boundingBox(), firstHalf = await page.locator('#transition-half-0').boundingBox();
        expect(fullButton.x).toBeCloseTo(halfButton.x, 3); expect(fullButton.width).toBeCloseTo(halfButton.width, 3);
        expect(fullButton.y).toBeCloseTo(firstInput.y, 3); expect(halfButton.y).toBeCloseTo(firstHalf.y, 3);
        const cutoffOutput = path.join(output, 'side_leaf_cutoff'); await mkdir(cutoffOutput, { recursive: true });
        await page.locator('#scene-panel').screenshot({ path: path.join(cutoffOutput, 'controls_wide.png') });
        await page.setViewportSize({ width: 780, height: 900 });
        expect(await page.locator('#scene-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
        await page.locator('#scene-panel').screenshot({ path: path.join(cutoffOutput, 'controls_narrow.png') });
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.locator('#transition-full').click();
        const beforeFlat = await page.evaluate(() => window.__grassTransitionScene.getSnapshot());
        await page.locator('#transition-configuration').selectOption('lod4-flat');
        await expect(page.locator('#transition-limit-0')).toBeDisabled();
        expect(new URL(page.url()).searchParams.get('configuration')).toBe('lod4-flat');
        evidence.flatLod4 = await page.evaluate(() => {
            const s = window.__grassTransitionScene, invalid = [];
            s.setHelpers(false); s.step();
            const before = s.getSnapshot();
            for (let i = 0; i < 12; i++) {
                s.camera.position.x += .5; s.camera.rotation.y += .02; s.step(1 / 60, performance.now() + i * 100);
            }
            s.fields.group.traverse(mesh => {
                if (!mesh.isMesh || !mesh.visible) return;
                if (!mesh.userData.grassCanopy || mesh.material.defines.GRASS_TRANSITION_CANOPY
                    || mesh.geometry.index.count !== 6) invalid.push(mesh.name);
                const positions = mesh.geometry.attributes.position;
                for (let i = 1; i < positions.count; i++) if (positions.getY(i) !== positions.getY(0)) invalid.push(mesh.name);
            });
            return { before, after: s.getSnapshot(), invalid };
        });
        expect(evidence.flatLod4.invalid).toEqual([]);
        expect(evidence.flatLod4.after.fields.levels).toEqual([0, 0, 0, 0, 0, 4096]);
        expect(evidence.flatLod4.after.fields.triangles).toBe(8192);
        expect(evidence.flatLod4.after.fields.sideLeafCells).toBe(0);
        expect(evidence.flatLod4.after.selection.scans).toBe(evidence.flatLod4.before.selection.scans);
        expect(evidence.flatLod4.after.fields.instanceUploads).toBe(evidence.flatLod4.before.fields.instanceUploads);
        expect(evidence.flatLod4.after.shadows.generations).toBe(evidence.flatLod4.before.shadows.generations);
        await page.locator('#transition-configuration').selectOption('distance');
        await expect(page.locator('#transition-limit-0')).toBeEnabled();
        const returned = await inspectCoverage(page);
        expect(returned.invalid).toEqual([]); expect(returned.mismatches).toEqual([]);
        expect(returned.state.fields.flatLod4).toBe(false);
        expect(returned.state.selection.distances).toEqual(beforeFlat.selection.distances);
        expect(returned.state.selection.sideLeafDistance).toBe(beforeFlat.selection.sideLeafDistance);
        evidence.lod4Factors = await page.evaluate(() => {
            const s = window.__grassTransitionScene, states = [];
            s.setPose('front');
            for (const configuration of ['lod4-ground', 'lod4-flat', 'lod4-elevated', 'lod4-elevated-sides']) {
                s.setConfiguration(configuration); s.step();
                const state = s.getSnapshot(), geometry = [];
                s.fields.group.traverse(mesh => {
                    if (!mesh.userData.grassCanopy || !mesh.visible) return;
                    geometry.push({ triangles: mesh.geometry.index.count / 3, height: mesh.geometry.attributes.position.getY(0),
                        fastShadow: mesh.material.defines.GRASS_CANOPY_BAKED_SHADOW_ONLY,
                        interior: !!mesh.userData.grassCanopyInterior,
                        beveled: !!mesh.material.defines.GRASS_TRANSITION_CANOPY });
                });
                states.push({ configuration, fields: state.fields, geometry, glError: state.glError });
            }
            s.setShadows(false); s.step(); const disabled = s.getSnapshot();
            s.setShadows(true); s.step(); const enabled = s.getSnapshot();
            s.setConfiguration('distance');
            return { states, disabled: disabled.shadows, enabled: enabled.shadows, glError: enabled.glError };
        });
        for (const value of evidence.lod4Factors.states) {
            expect(value.glError).toBe(0); expect(value.fields.levels).toEqual([0, 0, 0, 0, 0, 4096]);
            expect(value.fields.sideLeafCells > 0).toBe(value.configuration === 'lod4-elevated-sides');
            for (const geometry of value.geometry) {
                expect(geometry.fastShadow).toBe(1);
                expect(geometry.triangles).toBe(value.configuration.startsWith('lod4-elevated') && !geometry.interior ? 32 : 2);
                expect(geometry.height).toBeCloseTo(value.configuration === 'lod4-ground' ? 0 : .1, 6);
                expect(geometry.beveled).toBe(value.configuration.startsWith('lod4-elevated') && !geometry.interior);
            }
        }
        expect(evidence.lod4Factors.disabled.enabled).toBe(false);
        expect(evidence.lod4Factors.enabled.enabled).toBe(true); expect(evidence.lod4Factors.glError).toBe(0);
        evidence.versions = [];
        for (const version of ['original', 'shadow', 'optimized']) {
            await page.locator('#transition-optimization').selectOption(version);
            for (const pose of ['front', 'rear', 'border']) {
                await page.evaluate(pose => { const s = window.__grassTransitionScene; s.setPose(pose); s.step(); }, pose);
                const state = await inspectCoverage(page); evidence.versions.push({ version, pose, state });
                expect(state.invalid).toEqual([]); expect(state.mismatches).toEqual([]); expect(state.invalidOpenEdges).toEqual([]);
                expect(state.state.fields.optimization).toBe(version);
                expect(state.state.shadows.canopyMode).toBe(version === 'original' ? 'general' : 'baked-only');
            }
        }
        const fullCanopy = await page.evaluate(() => {
            const s = window.__grassTransitionScene; s.setConfiguration('lod4-elevated');
            const before = s.getSnapshot(); s.setOptimization('original'); const original = s.getSnapshot();
            s.setOptimization('optimized'); s.step(); const optimized = s.getSnapshot();
            return { original: original.fields, optimized: optimized.fields, shadowGenerations: optimized.shadows.generations - before.shadows.generations };
        });
        expect(fullCanopy.original.triangles).toBe(4096 * 32);
        expect(fullCanopy.optimized.lod4InteriorCells).toBe(4 * 30 * 30);
        expect(fullCanopy.optimized.lod4GridCells).toBe(4 * (32 * 32 - 30 * 30));
        expect(fullCanopy.optimized.triangles).toBe(3600 * 2 + 496 * 32);
        expect(fullCanopy.shadowGenerations).toBe(0); evidence.fullCanopy = fullCanopy;
        expect(errors).toEqual([]);
    } finally {
        await writeFile(path.join(output, 'validation.json'), JSON.stringify({ ...evidence, errors }, null, 2));
    }
});
