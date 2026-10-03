// Stage optimized grass positions and exercise the normal loader before publication.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, hashFile, writeJson } from '../../../baking/Files.mjs';
import { withBakeBrowser } from '../../../baking/Browser.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { validateGrassCanopyLayoutAsset, GRASS_CANOPY_LAYOUT_URL } from '../../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyLayoutAsset.js';

async function validate(result) {
    const asset = validateGrassCanopyLayoutAsset(JSON.parse(await readFile(path.join(result.directory, 'layout.json'), 'utf8')));
    const report = JSON.parse(await readFile(path.join(result.directory, 'validation.json'), 'utf8'));
    if (report.sourceHash !== asset.source.hash || report.loadedSourceHash !== asset.source.hash
        || report.mode !== 'compiled' || report.optimizerRequests.length || report.errors.length
        || report.assetSha256 !== (await hashFile(path.join(result.directory, 'layout.json'))).sha256)
        throw new Error('LOD4 layout did not pass the fresh-scene loading gate.');
}

export const grassLod4LayoutJob = {
    id: 'materials/grass/lod4-layout', description: 'Compile two compatible 2 m LOD4 leaf arrangements; skip runtime pattern searches',
    configurationPaths: ['browserExecutable'], codePaths: ['tools/bake_materials/grass/lod4_layout'],
    outputs: ['assets/public/grass/lod4/layout.json'],
    async inputs(ctx) {
        return [ctx.config.browserExecutable, path.join(ctx.root, 'debug_tools/grass_litter_scene.html'),
            path.join(ctx.root, 'tests/headless/e2e/static_server.mjs'),
            ...await listFiles(path.join(ctx.root, 'src')),
            ...await listFiles(path.join(ctx.root, 'assets/public/pbr/dry_litter')),
            ...await listFiles(path.join(ctx.root, 'assets/public/lighting/calibrated')),
            ...['scene.json', '96000_leaves.glb'].map(name => path.join(ctx.root, 'tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m', name))];
    },
    async run(ctx) {
        const directory = ctx.stage, errors = [], optimizerRequests = [];
        const report = await withBakeBrowser(ctx, { width: 1600, height: 1000 }, async (page, baseUrl, browserVersion) => {
            const watch = page => {
                page.on('pageerror', error => errors.push(error.message));
                page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            };
            watch(page);
            page.setDefaultTimeout(780000);
            const start = performance.now();
            await page.goto(baseUrl + '/debug_tools/grass_litter_scene.html?compileLod4Layout=1&lod=LOD4#03_rear');
            await page.waitForFunction(() => !!window.__grassLitterReadiness);
            await page.evaluate(() => window.__grassLitterReadiness);
            const compiled = await page.evaluate(() => ({ asset: window.__grassLitterScene.canopy.getCompiledLayout(),
                snapshot: window.__grassLitterScene.canopy.getSnapshot() }));
            validateGrassCanopyLayoutAsset(compiled.asset);
            const compileMilliseconds = performance.now() - start;
            await writeJson(path.join(directory, 'layout.json'), compiled.asset);
            await writeJson(path.join(directory, 'compilation.json'), compiled.snapshot);
            await page.addStyleTag({ content: '#scene-panel,#scene-performance{visibility:hidden!important}' });
            await page.screenshot({ path: path.join(directory, 'compiled.png') });
            const browser = page.context().browser(); await page.context().close();
            const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
            const loaded = await context.newPage(); loaded.setDefaultTimeout(240000); watch(loaded);
            await loaded.route('**/assets/public/grass/lod4/layout.json', route => route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify(compiled.asset)
            }));
            loaded.on('request', request => {
                if (/GrassDebugV2Canopy(?:PairCompiler|SourceLayout|PatternOptimizer|RenderedOptimizer|PatternProbe|RenderedProbe|RenderedScore)\.js/.test(request.url())) optimizerRequests.push(request.url());
            });
            const loadStart = performance.now();
            await loaded.goto(baseUrl + '/debug_tools/grass_litter_scene.html?lod=LOD4#03_rear');
            await loaded.waitForFunction(() => !!window.__grassLitterReadiness);
            await loaded.evaluate(() => window.__grassLitterReadiness);
            const snapshot = await loaded.evaluate(() => window.__grassLitterScene.canopy.getSnapshot());
            const loadMilliseconds = performance.now() - loadStart;
            await loaded.addStyleTag({ content: '#scene-panel,#scene-performance{visibility:hidden!important}' });
            await loaded.screenshot({ path: path.join(directory, 'loaded.png') });
            return { sourceHash: compiled.asset.source.hash, loadedSourceHash: snapshot.layout.sourceHash,
                mode: snapshot.layout.mode, compileMilliseconds, loadMilliseconds, layoutMilliseconds: snapshot.layout.milliseconds,
                browserVersion, optimizerRequests, errors, assetSha256: (await hashFile(path.join(directory, 'layout.json'))).sha256 };
        });
        await writeJson(path.join(directory, 'validation.json'), report);
        const result = { state: 'validated', directory, files: await listFiles(directory) };
        await validate(result);
        if (ctx.publish) {
            await ctx.assertInputsStable();
            const destination = path.join(ctx.root, GRASS_CANOPY_LAYOUT_URL.slice(1));
            await publishBakeFile(path.join(directory, 'layout.json'), destination);
            result.state = 'published'; result.files.push(destination);
        }
        ctx.log.line(ctx.id, `Layout compiled in ${(report.compileMilliseconds / 1000).toFixed(1)} s; fresh scene loaded in ${(report.loadMilliseconds / 1000).toFixed(1)} s; no optimizer imports.`);
        return result;
    }, validate
};
