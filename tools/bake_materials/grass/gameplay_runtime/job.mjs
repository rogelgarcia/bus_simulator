// Registered compact runtime publication with authenticated source and a fresh browser loader gate.
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { listFiles, hashFile, writeJson } from '../../../baking/Files.mjs';
import { withBakeBrowser } from '../../../baking/Browser.mjs';
import { publishBakeDirectory } from '../../../baking/Publication.mjs';

async function validate(result) {
    const manifest = JSON.parse(await readFile(path.join(result.directory, 'manifest.json'), 'utf8'));
    const file = await hashFile(path.join(result.directory, 'grass.bin'));
    if (manifest.schema !== 'bus-simulator.gameplay-grass' || manifest.appearance.paletteRevision !== 'canopy-palette-17'
        || file.sha256 !== manifest.sha256 || file.bytes !== manifest.bytes || manifest.bytes > 40 * 1024 * 1024
        || !manifest.validation?.freshLoader || manifest.validation.errors.length) throw new Error('Gameplay grass publication gate failed.');
}

export const grassGameplayRuntimeJob = {
    id: 'materials/grass/gameplay-runtime', description: 'Publish the bus lab detailed grass as compact prepared runtime geometry and color maps',
    configurationPaths: ['browserExecutable'], codePaths: ['tools/bake_materials/grass/gameplay_runtime'],
    outputs: ['assets/public/grass/gameplay'],
    async inputs(ctx) {
        return [ctx.config.browserExecutable, ...await listFiles(path.join(ctx.root, 'src')),
            ...await listFiles(path.join(ctx.root, 'assets/public/pbr/dry_litter')),
            ...await listFiles(path.join(ctx.root, 'assets/public/lighting/calibrated')),
            path.join(ctx.root, 'tools/bake_materials/grass/gameplay_runtime/Capture.js'),
            path.join(ctx.root, 'debug_tools/grass_debug_v2.html'), path.join(ctx.root, 'assets/public/grass/lod4/layout.json'),
            ...['scene.json', '96000_leaves.glb'].map(name => path.join(ctx.root, 'tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m', name))];
    },
    async run(ctx) {
        const directory = path.join(ctx.stage, 'gameplay'); await mkdir(directory, { recursive: true });
        const errors = [];
        const manifest = await withBakeBrowser(ctx, { width: 1280, height: 720 }, async (page, url) => {
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
                const response = await route.fetch();
                await route.fulfill({ response, body: (await response.text()).replace('externalShadows.update(); refreshShadows();', 'externalShadows.update(); refreshShadows(); window.__runtimeBake = bakedAssets;') });
            });
            await page.goto(url + '/debug_tools/grass_debug_v2.html');
            try { await page.waitForFunction(() => !!window.__runtimeBake, null, { timeout: 90000 }); }
            catch (error) { throw new Error(errors.join('\n') + '\n' + await page.locator('body').innerText() + '\n' + error.message); }
            const manifest = await page.evaluate(async () => {
                const { captureGrassRuntime } = await import('/tools/bake_materials/grass/gameplay_runtime/Capture.js');
                window.__runtimePackage = captureGrassRuntime(window.__runtimeBake); return window.__runtimePackage.manifest;
            });
            const base64 = await page.evaluate(() => new Promise(resolve => {
                const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(new Blob([window.__runtimePackage.binary]));
            }));
            await writeFile(path.join(directory, 'grass.bin'), Buffer.from(base64, 'base64'));
            const file = await hashFile(path.join(directory, 'grass.bin')); Object.assign(manifest, { bytes: file.bytes, sha256: file.sha256 });
            await writeJson(path.join(directory, 'manifest.json'), manifest);
            await page.route('**/assets/public/grass/gameplay/*', async route => {
                const name = path.basename(new URL(route.request().url()).pathname);
                if (!['manifest.json', 'grass.bin'].includes(name)) throw new Error('Unexpected grass runtime request.');
                await route.fulfill({ body: await readFile(path.join(directory, name)), contentType: name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
            });
            const gate = await page.evaluate(async () => {
                const THREE = await import('three');
                const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
                const renderer = new THREE.WebGLRenderer();
                const asset = await loadGrassRuntimeAsset({ renderer });
                const { createGrassDebugV2TransitionFields } = await import('/src/graphics/engine3d/grass/runtime/GrassDebugV2TransitionFields.js');
                const fields = createGrassDebugV2TransitionFields({ ...asset, origins: [[0, 0]], fieldSize: 4 });
                const scene = new THREE.Scene(); scene.add(fields.group);
                const camera = new THREE.PerspectiveCamera(50, 1, .01, 100); camera.position.set(2, 2, 6); camera.lookAt(2, 0, 2);
                for (let level = 0; level < 6; level++) { fields.applyLevels(new Uint8Array(16).fill(level)); renderer.render(scene, camera); }
                const glError = renderer.getContext().getError(); fields.dispose(); asset.dispose(); renderer.dispose();
                return { freshLoader: glError === 0, glError };
            });
            manifest.validation = { ...gate, errors };
            manifest.provenance = { job: 'materials/grass/gameplay-runtime', inputFingerprint: ctx.key,
                source: 'Bus lab detailed appearance / retained 96,000-leaf export',
                sources: await Promise.all(['scene.json', '96000_leaves.glb'].map(async name => ({ name,
                    ...await hashFile(path.join(ctx.root, 'tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m', name)) }))) };
            return manifest;
        });
        await writeJson(path.join(directory, 'manifest.json'), manifest);
        const result = { state: 'validated', directory, files: await listFiles(directory) }; await validate(result);
        if (ctx.publish) {
            await ctx.assertInputsStable();
            const destination = path.join(ctx.root, 'assets/public/grass/gameplay'); await publishBakeDirectory(directory, destination);
            result.state = 'published'; result.files.push(...await listFiles(destination));
        }
        return result;
    }, validate
};
