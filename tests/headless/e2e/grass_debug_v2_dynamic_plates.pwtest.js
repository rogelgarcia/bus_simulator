// Verify the retained Leaf Growth triads; field runtime captures are covered in grass_debug_v2_runtime_impostors.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_triads');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
const inspect = plates => {
    const plan = plates.getPlan(), ids = plan.plates.flatMap(p => p.leafIds).concat(plan.fallback);
    let assignmentErrors = 0, depthErrors = 0;
    for (const plate of plan.plates) {
        if (![.2, .1].includes(plate.width)) throw Error('Unexpected card width');
        if (plate.variant < 0 || plate.variant >= 10) throw Error('Unexpected texture variant');
        depthErrors = Math.max(depthErrors, Math.abs(plate.angle - plate.axis * Math.PI / 3));
        for (const id of plate.leafIds) if (plan.assignments[id] !== plate.id) assignmentErrors++;
    }
    for (const id of plan.fallback) if (plan.assignments[id] !== -1) assignmentErrors++;
    return { snapshot: plates.getSnapshot(), unique: new Set(ids).size, total: ids.length, assignmentErrors, depthErrors,
        materialSide: plates.bakeMeshes[0].material.side, cardInstances: plates.bakeMeshes[0].geometry.instanceCount,
        fallbackDrawCount: plates.bakeMeshes[1].geometry.drawRange.count };
};
function validate(result, leaves) {
    expect(result.snapshot).toMatchObject({ leaves, widthMeters: .2, smallWidthMeters: .1, depthMeters: .1, textureVariants: 10,
        atlasSets: 1, estimatedTextureBytes: leaves === 3 ? 67108864 : 8388608, lightingBaked: false, worldOrientedNormals: true });
    expect(result.unique).toBe(leaves); expect(result.total).toBe(leaves); expect(result.assignmentErrors).toBe(0);
    expect(result.depthErrors).toBeLessThan(1e-7); expect(result.materialSide).toBe(2);
    expect(result.snapshot.maximumRotationDegrees).toBe(5);
    expect(Math.max(...result.snapshot.axisTurns.map(Math.abs))).toBeLessThanOrEqual(5*Math.PI/180+1e-8);
    expect(result.snapshot.triangles).toBe(result.cardInstances * 2 + result.fallbackDrawCount / 3);
}

test('Leaf Growth renders rotating shared cards and original fallback leaves', async ({page}) => {
    test.setTimeout(120000); await mkdir(output, { recursive: true }); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=lod3-triads-1&lod=LOD3');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const poses = [];
    for (const pose of ['front', 'three_quarter', 'side', 'ten_meters_rear']) {
        await page.evaluate(pose => { const s = window.__plantCardsStudy; s.setPose(pose); s.setMode('LOD3'); }, pose);
        const result = await page.evaluate(code => (0,eval)('(' + code + ')')(window.__plantCardsStudy.dynamicPlates), inspect.toString());
        validate(result, 3); poses.push({ pose, result }); await page.screenshot({ path: path.join(output, 'study_' + pose + '.png') });
    }
    await page.evaluate(() => { const s = window.__plantCardsStudy; s.setPose('front'); s.setWireframe(true); });
    await page.screenshot({ path: path.join(output, 'study_wireframe.png') });
    const invariant = await page.evaluate(async () => {
        const s = window.__plantCardsStudy, before = s.dynamicPlates.atlas.maps.albedo.image.data;
        const {createGrassDebugV2BillboardPlates} = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BillboardPlates.js?v=lod3-triads-1');
        const ratio = s.renderer.getPixelRatio(), exposure = s.renderer.toneMappingExposure;
        s.renderer.setPixelRatio(1.5); s.renderer.toneMappingExposure = 3.7;
        const repeated = await createGrassDebugV2BillboardPlates({renderer:s.renderer,meshes:s.shootLods.LOD0_SMART.bakeMeshes,
            lod2Meshes:s.shootLods.LOD2.bakeMeshes,material:s.plant.leaves[0].material,study:true});
        const same = ['albedo','normal','roughness'].every(key => repeated.atlas.maps[key].image.data.every((v,i) => v === s.dynamicPlates.atlas.maps[key].image.data[i]));
        repeated.dispose();s.renderer.setPixelRatio(ratio);s.renderer.toneMappingExposure=exposure;return same;
    });
    expect(invariant).toBe(true); expect(new Set(poses.map(p => p.result.snapshot.cameraYaw.toFixed(2))).size).toBeGreaterThan(2);
    expect(new Set(poses.map(p => p.result.snapshot.cards)).size).toBe(1);
    await writeFile(path.join(output, 'study.json'), JSON.stringify({ poses, invariant, errors }, null, 2)); expect(errors).toEqual([]);
});
