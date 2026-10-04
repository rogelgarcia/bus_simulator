// Bake and authenticate final packed LOD4 maps before publishing an optional compressed asset.
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { listFiles, hashFile, writeJson } from '../../../baking/Files.mjs';
import { withBakeBrowser } from '../../../baking/Browser.mjs';
import { publishBakeDirectory } from '../../../baking/Publication.mjs';

async function validate(result) {
    const manifest = JSON.parse(await readFile(path.join(result.directory, 'manifest.json'), 'utf8'));
    const gate = JSON.parse(await readFile(path.join(result.directory, 'validation.json'), 'utf8'));
    if (manifest.schema !== 'bus-simulator.grass-canopy-maps' || manifest.maps.length !== 8 || !gate.offline
        || gate.errors.length || gate.bakeRequests.length || gate.glError || gate.residentBytes !== manifest.residentBytes)
        throw new Error('Offline canopy maps failed the fresh-loader gate.');
    for (const entry of manifest.maps) {
        const hash = await hashFile(path.join(result.directory, entry.file));
        if (hash.sha256 !== entry.sha256 || hash.bytes !== entry.diskBytes) throw new Error('Offline canopy map hash mismatch.');
    }
}

export const grassLod4MapsJob = {
    id: 'materials/grass/lod4-maps', description: 'Bake final All canopy maps with mipmapped BC3 material channels and BC1 self-shadow visibility',
    configurationPaths: ['browserExecutable', 'pythonExecutable'], codePaths: ['tools/bake_materials/grass/lod4_maps'],
    outputs: ['assets/public/grass/lod4/maps'],
    async inputs(ctx) {
        return [ctx.config.browserExecutable, ctx.config.pythonExecutable, path.join(ctx.root, 'debug_tools/grass_transition_scene.html'),
            path.join(ctx.root, 'tests/headless/e2e/static_server.mjs'), ...await listFiles(path.join(ctx.root, 'src')),
            ...await listFiles(path.join(ctx.root, 'assets/public/pbr/dry_litter')), ...await listFiles(path.join(ctx.root, 'assets/public/lighting/calibrated')),
            path.join(ctx.root, 'assets/public/grass/lod4/layout.json'),
            ...['scene.json', '96000_leaves.glb'].map(name => path.join(ctx.root, 'tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m', name))];
    },
    async run(ctx) {
        const directory = path.join(ctx.stage, 'maps'); await mkdir(directory, { recursive: true });
        const errors = [], bakeRequests = [];
        const validation = await withBakeBrowser(ctx, { width: 1920, height: 1080 }, async (page, baseUrl, browserVersion) => {
            const watch = page => {
                page.on('pageerror', error => errors.push(error.message));
                page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            };
            watch(page); page.setDefaultTimeout(240000);
            await page.goto(baseUrl + '/debug_tools/grass_transition_scene.html?configuration=lod4-elevated-sides#front');
            await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
            const metadata = await page.evaluate(() => { window.__grassTransitionScene.setAnimating(false); return window.__grassTransitionScene.canopy.getSnapshot(); });
            const textureMetadata = await page.evaluate(() => {
                const m = window.__grassTransitionScene.canopy.materials.all;
                return { albedo: m.map.userData, normal: m.normalMap.userData, roughness: m.roughnessMap.userData, visibility: {} };
            });
            for (let variant = 0; variant < 2; variant++) for (const channel of ['albedo', 'normal', 'roughness', 'visibility']) {
                const base64 = await page.evaluate(async ({ variant, channel }) => {
                    const pixels = window.__grassTransitionScene.canopy.readPixels('all', channel, variant);
                    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob([pixels])); });
                }, { variant, channel });
                await writeFile(path.join(directory, `tile${variant}_${channel}.raw`), Buffer.from(base64, 'base64'));
            }
            await writeJson(path.join(directory, 'capture.json'), { schema: 'bus-simulator.grass-canopy-maps', version: 1,
                definition: metadata.definition, metadata, textureMetadata,
                layoutSha256: (await hashFile(path.join(ctx.root, 'assets/public/grass/lod4/layout.json'))).sha256 });
            await ctx.process(ctx.config.pythonExecutable, [path.join(ctx.root, 'tools/bake_materials/grass/lod4_maps/encode.py'), '--directory', directory]);
            const browser = page.context().browser(); await page.context().close();
            const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
            const loaded = await context.newPage(); loaded.setDefaultTimeout(240000); watch(loaded);
            await loaded.route('**/assets/public/grass/lod4/maps/*', async route => {
                const name = path.basename(new URL(route.request().url()).pathname);
                if (!/^(manifest\.json|tile[01]_(albedo|normal|roughness|visibility)\.dds)$/.test(name)) throw new Error('Unexpected offline map request.');
                await route.fulfill({ status: 200, contentType: name.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: await readFile(path.join(directory, name)) });
            });
            loaded.on('request', request => { if (/GrassDebugV2(?:FieldCanopyBake|CanopyPairCompiler|CanopyRenderedOptimizer)\.js/.test(request.url())) bakeRequests.push(request.url()); });
            const start = performance.now();
            await loaded.goto(baseUrl + '/debug_tools/grass_transition_scene.html?assets=compressed&configuration=lod4-elevated-sides#front');
            await loaded.waitForFunction(() => !!window.__grassTransitionReadiness); await loaded.evaluate(() => window.__grassTransitionReadiness);
            const snapshot = await loaded.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); s.step(); return s.getSnapshot(); });
            const screenshots = path.join(ctx.root, 'tests/artifacts/screens/grass_debug_v2/transition_lab/experiments/compression/offline_validation');
            await mkdir(screenshots, { recursive: true });
            await loaded.addStyleTag({ content: '#scene-panel,#scene-performance{visibility:hidden!important}' });
            for (const pose of ['front', 'rear', 'border']) {
                await loaded.evaluate(pose => { const s = window.__grassTransitionScene; s.setPose(pose); s.step(); }, pose);
                await loaded.screenshot({ path: path.join(screenshots, pose + '.png') });
            }
            return { offline: snapshot.canopy.offline, residentBytes: snapshot.canopy.residentTextureBytes, glError: snapshot.glError,
                loadMilliseconds: performance.now() - start, browserVersion, errors, bakeRequests };
        });
        await writeJson(path.join(directory, 'validation.json'), validation);
        const result = { state: 'validated', directory, files: await listFiles(directory) }; await validate(result);
        if (ctx.publish) {
            await ctx.assertInputsStable();
            const publishDirectory = path.join(ctx.stage, 'publish'); await mkdir(publishDirectory, { recursive: true });
            for (const name of ['manifest.json', 'validation.json', ...JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')).maps.map(entry => entry.file)])
                await writeFile(path.join(publishDirectory, name), await readFile(path.join(directory, name)));
            const destination = path.join(ctx.root, 'assets/public/grass/lod4/maps');
            await publishBakeDirectory(publishDirectory, destination); result.state = 'published'; result.files.push(...await listFiles(destination));
        }
        return result;
    }, validate
};
