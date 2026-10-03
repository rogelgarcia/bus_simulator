// Verify the single 1K canopy option, legacy links and shared comparison-mode resources.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_single_1k');
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 uses only 1K maps across standalone and mixed selections without changing the camera or shadow cache', async ({ page }) => {
    test.setTimeout(180000);
    await mkdir(output, { recursive: true });
    const errors = [], captures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-single-1k-1&lod=LOD4_4K&fields=9#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const selector = page.locator('#scene-lod');
    await expect(selector).toHaveValue('LOD4');
    await expect(selector.locator('option[value^="LOD4"]')).toHaveCount(1);
    await expect(selector.locator('[value="LOD4"]')).toHaveText('LOD4');
    const inspect = () => page.evaluate(() => {
        const s = window.__grassLitterScene;
        s.lighting.render(0);
        const state = s.getSnapshot(), meshes = [];
        s.scene.traverse(mesh => {
            if (!mesh.isMesh || !mesh.userData.grassCanopy) return;
            const m = mesh.material, uniforms = s.renderer.properties.get(m).uniforms;
            meshes.push({ geometry: mesh.geometry.uuid, maps: [m.map, m.normalMap, m.roughnessMap].map(t => [t.image.width, t.image.height]),
                mapsB: ['grassCanopyAlbedoB', 'grassCanopyNormalB', 'grassCanopyRoughnessB'].map(name => uniforms[name].value.image.width),
                selfShadow: m.userData.grassCanopyTileVisibility.value.uuid,
                selfShadowB: uniforms.grassCanopyVisibilityB.value.uuid });
        });
        return { selection: state.lodSelection, lod: state.lod, position: state.position, quaternion: state.quaternion,
            shadows: state.shadows, meshes, bake: state.lods.LOD4.bake,
            externalShadow: s.canopy.shadowUniforms.grassCanopyShadowVisibility.value.uuid,
            textures: s.renderer.info.memory.textures, glError: s.renderer.getContext().getError() };
    });
    for (const [view, name] of [[0, 'overview'], [2, 'rear'], [5, 'closeup']]) {
        await page.evaluate(view => window.__grassLitterScene.setView(view), view);
        await selector.selectOption('LOD2+3+4');
        const before = await inspect();
        await selector.selectOption('LOD4');
        const after = await inspect();
        await page.screenshot({ path: path.join(output, name + '_1k.png') });
        captures.push({ view, before, after });
        expect(after.lod).toBe('LOD4');
        expect(after.selection).toBe('LOD4');
        for (const capture of [before, after]) {
            expect(capture.bake.mapResolutions).toEqual({ albedo: 1024, normal: 1024, roughness: 1024, visibility: 4096 });
            expect(capture.bake.residentTextureBytes).toBe(capture.bake.estimatedTextureBytes);
            expect(capture.bake.shadowResolution).toBe(8192);
            expect(capture.meshes).toHaveLength(9);
            for (const mesh of capture.meshes) {
                expect(mesh.maps).toEqual(Array.from({ length: 3 }, () => [1024, 1024]));
                expect(mesh.mapsB).toEqual([1024, 1024, 1024]);
            }
            expect(capture.glError).toBe(0);
        }
        expect(after.position).toEqual(before.position);
        expect(after.quaternion).toEqual(before.quaternion);
        expect(after.shadows).toEqual(before.shadows);
        expect(after.externalShadow).toBe(before.externalShadow);
        expect(after.meshes.map(m => [m.geometry, m.selfShadow, m.selfShadowB])).toEqual(before.meshes.map(m => [m.geometry, m.selfShadow, m.selfShadowB]));
        expect(after.bake.residentTextureBytes).toBe(before.bake.residentTextureBytes);
        expect(after.textures).toBe(before.textures);
    }
    await page.evaluate(() => { const s = window.__grassLitterScene; s.setMode('grass'); s.setLod('LOD4_4K'); s.setLod('LOD2+4'); });
    const mixed = await page.evaluate(() => {
        const s = window.__grassLitterScene;s.lighting.render(0);
        const state = s.getSnapshot(), valid = [];
        s.scene.traverse(mesh => { if (mesh.isMesh && mesh.userData.grassCanopy) valid.push(mesh.material === s.canopy.materials.grass && mesh.material.map.image.width === 1024); });
        s.setMode('all'); s.setLod('LOD4_1K');
        return { tiles: state.fields.tiles.filter(tile => tile.active).map(tile => tile.lod), valid, legacy: s.getSnapshot().lodSelection };
    });
    expect(new Set(mixed.tiles)).toEqual(new Set(['LOD2', 'LOD4']));
    expect(mixed.valid).toEqual(Array(9).fill(true));
    expect(mixed.legacy).toBe('LOD4');
    await expect(selector).toHaveValue('LOD4');
    await writeFile(path.join(output, 'validation.json'), JSON.stringify({ captures, mixed, errors }, null, 2));
    expect(errors).toEqual([]);
});
