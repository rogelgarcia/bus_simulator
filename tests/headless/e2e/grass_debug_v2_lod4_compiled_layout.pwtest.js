// Ordinary scene startup must load the published positions without importing either optimizer.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_compiled_layout');
const optimizer = /GrassDebugV2Canopy(?:PairCompiler|SourceLayout|PatternOptimizer|RenderedOptimizer|PatternProbe|RenderedProbe|RenderedScore)\.js/;
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined } });

test('LOD4 loads compiled positions and preserves both layer modes and alternating fields', async ({page}) => {
    test.setTimeout(180000); await mkdir(out, {recursive:true}); const requests=[],errors=[];
    page.on('request', request => { if(optimizer.test(request.url()))requests.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    const started=performance.now();
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-compiled-layout-1&lod=LOD2%2B4&fields=9#03_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);await page.evaluate(()=>window.__grassLitterReadiness);
    const milliseconds=performance.now()-started;
    const snapshot=await page.evaluate(()=>window.__grassLitterScene.getSnapshot());
    expect(snapshot.lod).toBe('LOD2+4');expect(snapshot.lods.LOD4.layout.mode).toBe('compiled');
    expect(snapshot.lods.LOD4.layout.leaves).toBeGreaterThan(2500);
    expect(snapshot.lods.LOD4.layout.variants).toBe(2);
    expect(snapshot.lods.LOD4.layout.compatibility.changedShoots).toBeGreaterThan(100);
    expect(snapshot.lods.LOD4.definition.tileMeters).toBe(2);
    expect(snapshot.lods.LOD4.bake.renderedOptimization.verificationResolution).toBe(4096);
    expect(await page.evaluate(()=>window.__grassLitterScene.canopy.getCompiledLayout())).toBeNull();
    await page.addStyleTag({content:'#scene-panel,#scene-performance{visibility:hidden!important}'});
    for(const view of [0,2])for(const mode of ['all','grass']) {
        await page.evaluate(({view,mode})=>{const s=window.__grassLitterScene;s.setView(view);s.setMode(mode);s.setLod('LOD4');s.lighting.render(0);},{view,mode});
        await page.screenshot({path:path.join(out,`view-${view}-${mode}.png`)});
    }
    expect(requests).toEqual([]);expect(errors).toEqual([]);
    await writeFile(path.join(out,'validation.json'),JSON.stringify({milliseconds,layout:snapshot.lods.LOD4.layout,requests,errors},null,2));
});

test('Missing LOD4 layout fails clearly instead of rerunning pattern searches', async ({page}) => {
    test.setTimeout(180000);const requests=[];
    page.on('request',request=>{if(optimizer.test(request.url()))requests.push(request.url());});
    await page.route('**/assets/public/grass/lod4/layout.json',route=>route.fulfill({status:404,body:'missing'}));
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD4');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);
    const error=await page.evaluate(()=>window.__grassLitterReadiness.then(()=>null,error=>error.message));
    expect(error).toContain('materials/grass/lod4-layout --publish');expect(requests).toEqual([]);
});
