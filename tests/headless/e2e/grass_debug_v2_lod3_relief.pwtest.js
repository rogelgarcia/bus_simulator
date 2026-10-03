// Validate the canopy-plus-single-triangle LOD3 and record matching views.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.skip(true, 'Historical canopy-relief strategy; compact LOD3 is verified by grass_debug_v2_lod3_bus.pwtest.js.');
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_relief_range');
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD3 uses texture-aligned opaque single triangles with the canopy lighting and cached shadows', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [], captures = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod3-relief-range-1&lod=LOD3#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const initial = await page.evaluate(() => window.__grassLitterScene.getSnapshot());
    expect(initial.lods.LOD3.strategy).toBe('canopy-relief');
    expect(initial.lods.LOD3.runtimeCaptures).toBe(false);
    expect(initial.lods.LOD3.extraTextureBytes).toBe(0);
    expect(initial.lods.LOD3.reliefTriangles).toBeGreaterThan(3268 * 1.9);
    expect(initial.lods.LOD3.reliefTriangles).toBeLessThan(3268 * 2.1);
    expect(initial.lods.LOD3.variants.map(v => v.selected)).toEqual([192, 192]);
    expect(initial.lods.LOD3.maximumHeight).toBeLessThanOrEqual(initial.lods.LOD3.sourceHeight);
    expect(initial.lods.LOD3.triangles).toBe(initial.lods.LOD4.triangles + initial.lods.LOD3.reliefTriangles);
    expect(initial.lods.LOD3.minimumSourceVisibility).toBeGreaterThanOrEqual(.8);
    const validation = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        s.setFieldCount(9); s.lighting.render(0);
        const generation = s.getSnapshot().shadows.generations;
        const mesh = s.relief.group.children[0], geometry = mesh.geometry, uv = geometry.attributes.uv, p = geometry.attributes.position;
        const rise = geometry.attributes.grassReliefRise, displacement = geometry.attributes.grassReliefOffset, shapes = [];
        const fullPoint = i => new THREE.Vector2(p.getX(i) + displacement.getX(i), p.getZ(i) + displacement.getY(i));
        const fullHeight = i => p.getY(i) + rise.getX(i);
        for (let i = 0; i < p.count; i += 3) {
            const a = fullPoint(i), b = fullPoint(i + 1), tip = fullPoint(i + 2), edge = b.clone().sub(a), width = edge.length();
            const offset = tip.sub(a.clone().add(b).multiplyScalar(.5));
            const length = Math.abs(edge.cross(offset)) / width;
            shapes.push({ width, length, tipOffset: offset.dot(edge) / (width * width / 2),
                inclination: THREE.MathUtils.radToDeg(Math.atan2(fullHeight(i + 2) - (fullHeight(i) + fullHeight(i + 1)) / 2, length)) });
        }
        const shapeBounds = { minimumWidth: Math.min(...shapes.map(s => s.width)), maximumWidth: Math.max(...shapes.map(s => s.width)),
            maximumTipOffset: Math.max(...shapes.map(s => Math.abs(s.tipOffset))),
            minimumInclination: Math.min(...shapes.map(s => s.inclination)), maximumInclination: Math.max(...shapes.map(s => s.inclination)),
            minimumWidthToLength: Math.min(...shapes.map(s => s.width / s.length)),
            maximumHeight: Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i) + rise.getX(i))),
            minimumRise: Math.min(...rise.array), rotationBins: new Set(s.relief.assignments.map(a => Math.floor(a.rotation / (Math.PI / 4)))).size };
        let maxUvError = 0;
        for (let i = 0; i < p.count; i++) maxUvError = Math.max(maxUvError, Math.abs((uv.getX(i) - .5) * 2 - p.getX(i)), Math.abs((.5 - uv.getY(i)) * 2 - p.getZ(i)));
        const roots = [], rows = [];
        for (const selection of ['LOD4_4K', 'LOD3', 'LOD4_1K', 'LOD3']) {
            s.setLod(selection); s.lighting.render(0);
            const state = s.getSnapshot(), reliefMaterials = s.canopy.reliefMaterials, materials = s.canopy.materials;
            const sameMaps = ['all', 'grass'].every(layer => ['map', 'normalMap', 'roughnessMap'].every(name => reliefMaterials[layer][name] === materials[layer][name])
                && reliefMaterials[layer].userData.grassCanopyTileVisibility.value === materials[layer].userData.grassCanopyTileVisibility.value);
            s.scene.traverseVisible(object => { if (selection === 'LOD3' && object.userData.grassCanopyRelief) roots.push(object.geometry === geometry); });
            rows.push({ selection, sameMaps, leaves: state.visibleLeaves, shadows: state.shadows.generations, ground: state.litterSurface.soilTriangles });
        }
        s.setFieldCount(1); s.setView(5); s.setMode('grass'); s.setLod('LOD3'); s.lighting.render(0);
        const grassMaterial = mesh.material === s.canopy.reliefMaterials.grass;
        const plane = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
        const groundMeshes = [];
        s.scene.traverseVisible(object => { if (object.isMesh) groundMeshes.push(object); });
        const hits = plane.intersectObjects(groundMeshes, false).filter(hit => {
            for (let obj = hit.object; obj; obj = obj.parent) if (!obj.visible) return false;
            return !hit.object.userData.grassCanopyRelief && hit.distance < 1.01;
        });
        s.setMode('all');
        return { maxUvError, shapeBounds, rows, roots, generation, grassMaterial, hits: hits.map(h => h.object.name),
            index: geometry.index, vertices: p.count, opaque: !mesh.material.transparent && mesh.material.alphaTest === 0,
            castsShadow: mesh.castShadow, glError: s.renderer.getContext().getError() };
    });
    expect(validation.maxUvError).toBeLessThan(1e-6);
    expect(validation.shapeBounds.minimumWidth).toBeGreaterThanOrEqual(.06 - 1e-6);
    expect(validation.shapeBounds.maximumWidth).toBeLessThanOrEqual(.09 + 1e-6);
    expect(validation.shapeBounds.minimumWidthToLength).toBeGreaterThanOrEqual(1.5 - .0001);
    expect(validation.shapeBounds.maximumTipOffset).toBeLessThanOrEqual(.7 + .0001);
    expect(validation.shapeBounds.minimumInclination).toBeGreaterThanOrEqual(-5 - .0001);
    expect(validation.shapeBounds.maximumInclination).toBeLessThanOrEqual(5 + .0001);
    expect(validation.shapeBounds.minimumInclination).toBeLessThan(-4.9);
    expect(validation.shapeBounds.maximumInclination).toBeGreaterThan(4.9);
    expect(validation.shapeBounds.rotationBins).toBe(8);
    expect(validation.shapeBounds.minimumRise).toBeGreaterThanOrEqual(0);
    expect(validation.shapeBounds.maximumHeight).toBeLessThanOrEqual(initial.lods.LOD3.sourceHeight + 1e-6);
    expect(validation.vertices).toBe(initial.lods.LOD3.reliefTriangles * 3);
    expect(validation.index).toBeNull(); expect(validation.opaque).toBe(true); expect(validation.castsShadow).toBe(false);
    expect(validation.roots).toHaveLength(18); expect(validation.roots.every(Boolean)).toBe(true);
    expect(validation.rows.every(r => r.sameMaps && r.shadows === validation.generation)).toBe(true);
    expect(new Set(validation.rows.map(r => r.ground)).size).toBe(1);
    expect(validation.grassMaterial).toBe(true); expect(validation.glError).toBe(0);
    expect(validation.hits).toEqual(['GrassField-LOD4-Canopy']);
    const poses = [
        { name: 'near_front', azimuth: 40, elevation: 22, distance: 5, fields: 1 },
        { name: 'near_back', azimuth: 220, elevation: 18, distance: 5, fields: 1 },
        { name: 'near_side', azimuth: 130, elevation: 12, distance: 6, fields: 1 },
        { name: 'overview', azimuth: 40, elevation: 36, distance: 18, fields: 1 },
        { name: 'nine_fields', azimuth: 220, elevation: 26, distance: 45, fields: 9 }
    ];
    for (const pose of poses) for (const lod of ['LOD2', 'LOD3', 'LOD4']) {
        const state = await page.evaluate(async ({ pose, lod }) => {
            const s = window.__grassLitterScene, THREE = await import('three');
            s.setFieldCount(pose.fields); s.setLod(lod); s.setView(2);
            const az = THREE.MathUtils.degToRad(pose.azimuth), el = THREE.MathUtils.degToRad(pose.elevation);
            s.camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(pose.distance);
            s.camera.lookAt(0, .1, 0); s.camera.updateMatrixWorld(true);
            for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
            return s.getSnapshot();
        }, { pose, lod });
        await page.screenshot({ path: path.join(output, pose.name + '_' + lod + '.png') });
        captures.push({ pose, lod, state });
    }
    await page.evaluate(() => {
        const s = window.__grassLitterScene;
        s.setFieldCount(1); s.setLod('LOD3'); s.camera.position.set(3, 2, 4); s.camera.lookAt(0, .1, 0); s.camera.updateMatrixWorld(true);
        const rise = s.relief.group.children[0].geometry.attributes.grassReliefRise;
        window.__reliefSavedRise = rise.array.slice(); rise.array.fill(0); rise.needsUpdate = true;
        const offset = s.relief.group.children[0].geometry.attributes.grassReliefOffset;
        window.__reliefSavedOffset = offset.array.slice(); offset.array.fill(0); offset.needsUpdate = true;
        const material = s.canopy.reliefMaterials.all;
        window.__reliefSavedDefines = { ...material.defines };
        Object.assign(material.defines, { GRASS_RELIEF_NEAR_SCALE: '1.0', GRASS_RELIEF_FLATTEN_START: '100000.0', GRASS_RELIEF_FLATTEN_END: '100001.0' });
        material.needsUpdate = true;
        s.lighting.render(0);
    });
    await page.screenshot({ path: path.join(output, 'flat_relief_color.png') });
    await page.evaluate(() => { const s = window.__grassLitterScene; s.setLod('LOD4'); s.lighting.render(0); });
    await page.screenshot({ path: path.join(output, 'flat_canopy_color.png') });
    await page.evaluate(() => {
        const rise = window.__grassLitterScene.relief.group.children[0].geometry.attributes.grassReliefRise;
        rise.array.set(window.__reliefSavedRise); rise.needsUpdate = true;
        const offset = window.__grassLitterScene.relief.group.children[0].geometry.attributes.grassReliefOffset;
        offset.array.set(window.__reliefSavedOffset); offset.needsUpdate = true;
        const material = window.__grassLitterScene.canopy.reliefMaterials.all;
        material.defines = window.__reliefSavedDefines; material.needsUpdate = true;
    });
    await writeFile(path.join(output, 'validation.json'), JSON.stringify({ initial, validation, captures, errors }, null, 2));
    expect(errors).toEqual([]);
});
