// Loads the live shared modules in Chromium and verifies that planar rendering survives the spatial extension.
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
test('current source runs both adapters and keeps the planar SVG and leader control usable',async({page})=>{
    test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const baked='tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/review_v4';
    await page.route('**/tools/bake_vegetation/branching_study/study-data.json',route=>route.fulfill({path:baked+'/study-data.json',contentType:'application/json'}));
    await page.route('**/tools/bake_vegetation/branching_study/references/**',async route=>route.fulfill({body:await fs.readFile(baked+'/references/'+new URL(route.request().url()).pathname.split('/').at(-1))}));
    await page.goto('/tools/bake_vegetation/branching_study/index.html');
    await page.waitForFunction(()=>window.branchStudy?.audit.passed);
    const results=await page.evaluate(async()=>{
        const planar=await import('/tools/bake_vegetation/branching_study/model.mjs');
        const spatial=await import('/tools/bake_vegetation/branching_study/model3d.mjs');
        const ids=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
        return ids.map(id=>{
            const a=planar.generate(planar.presets[id]),b=spatial.generate3D(spatial.presets[id]);
            return {id,planar:a.audit.passed,spatial:b.audit.passed,dimensions:b.dimensions,omissions:b.stopped.budget};
        });
    });
    expect(results).toHaveLength(5);for(const result of results){expect(result.planar).toBe(true);expect(result.spatial).toBe(true);expect(result.dimensions).toBe(3);expect(result.omissions).toBe(0);}
    await page.locator('#preset').selectOption('silver_linden');
    const before=await page.evaluate(()=>window.branchStudy.paths.length);
    await page.locator('#leaderLaterals').evaluate(input=>{input.value='4';input.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(await page.evaluate(()=>window.branchStudy.audit.passed)).toBe(true);
    expect(await page.evaluate(()=>window.branchStudy.paths.length)).toBeGreaterThan(before);
    await expect(page.locator('#tree polygon[data-branch]').first()).toBeVisible();
    expect(errors).toEqual([]);
});
