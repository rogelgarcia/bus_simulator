// Register the optional directional missing-leaf asset with authentication and publication gates.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { listFiles, hashFile, writeJson } from '../../../baking/Files.mjs';
import { withBakeBrowser } from '../../../baking/Browser.mjs';
import { publishBakeDirectory } from '../../../baking/Publication.mjs';

async function validate(result, ctx) {
    const m = JSON.parse(await readFile(path.join(result.directory, 'manifest.json'), 'utf8'));
    const file = await hashFile(path.join(result.directory, 'leaves.rgba'));
    const source = JSON.parse(await readFile(path.join(ctx.root, 'assets/public/grass/gameplay/manifest.json'), 'utf8'));
    const bytes = await readFile(path.join(result.directory, 'leaves.rgba'));
    const layers = Array.from({ length: 8 }, (_, i) => createHash('sha256').update(bytes.subarray(i * 1048576, (i + 1) * 1048576)).digest('hex'));
    if (m.schema !== 'bus-simulator.grass-leaf-fill' || m.version !== 1 || m.sourceHash !== source.sha256 || m.sha256 !== file.sha256 || m.bytes !== file.bytes
        || m.size !== 512 || m.elevation !== 20 || m.tileSize !== 2 || !(m.extent > 1 && m.extent < 2)
        || m.encoding !== 'linear-premultiplied-rgba8' || m.coordinateSystem !== 'tile-local-x-negative-z'
        || file.bytes !== 512 * 512 * 4 * 8 || m.views !== 8 || m.counts.length !== 4 || !m.counts.every(c => c.lod3 === c.lod4 + c.omitted && c.omitted > 0)
        || m.coverage.length !== 8 || m.coverage.some(v => v <= .001 || v >= .5)
        || new Set(layers).size !== 8 || !m.validation?.freshLoader || m.validation.errors.length) throw new Error('Directional leaf-fill publication gate failed.');
}

export const grassLeafFillJob = {
    id: 'materials/grass/lod4-leaf-fill', description: 'Bake eight directional projections of omitted LOD3 leaves for the opt-in LOD4 experiment',
    configurationPaths: ['browserExecutable'], codePaths: ['tools/bake_materials/grass/lod4_leaf_fill'], outputs: ['assets/public/grass/lod4_leaf_fill'],
    async inputs(ctx) { return [ctx.config.browserExecutable, ...await listFiles(path.join(ctx.root, 'src/graphics/engine3d/grass/runtime')),
        ...await listFiles(path.join(ctx.root, 'tools/bake_materials/grass/lod4_leaf_fill')),
        ...await listFiles(path.join(ctx.root, 'src/graphics/shaders')), ...await listFiles(path.join(ctx.root, 'assets/public/grass/gameplay')),
        path.join(ctx.root, 'tests/headless/harness/index.html')]; },
    async run(ctx) {
        const directory = path.join(ctx.stage, 'leaf-fill'); await mkdir(directory, { recursive: true });
        const output = path.join(ctx.root, 'tests/artifacts/screens/grass/lod4_offline_leaf_fill'); await mkdir(output, { recursive: true });
        const errors = [];
        const manifest = await withBakeBrowser(ctx, { width: 960, height: 640 }, async (page, url) => {
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
            await page.goto(url + '/tests/headless/harness/index.html');
            const result = await page.evaluate(async () => {
                const THREE = await import('three');
                const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
                const { captureGrassLeafFill } = await import('/tools/bake_materials/grass/lod4_leaf_fill/Capture.js');
                const renderer = new THREE.WebGLRenderer(), asset = await loadGrassRuntimeAsset({ renderer });
                try {
                    const result = captureGrassLeafFill(asset, renderer);
                    const binary = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob([result.binary])); });
                    return { manifest: result.manifest, previews: result.previews, binary };
                } finally { asset.dispose(); renderer.dispose(); }
            });
            await writeFile(path.join(directory, 'leaves.rgba'), Buffer.from(result.binary, 'base64'));
            const manifest = { ...result.manifest, ...await hashFile(path.join(directory, 'leaves.rgba')), provenance: { job: ctx.id, inputFingerprint: ctx.key } };
            await writeJson(path.join(directory, 'manifest.json'), manifest);
            for (const [i, png] of result.previews.entries()) await writeFile(path.join(output, `baked-direction-${i}.png`), Buffer.from(png, 'base64'));
            await page.route('**/assets/public/grass/lod4_leaf_fill/*', async route => {
                const name = path.basename(new URL(route.request().url()).pathname);
                if (!['manifest.json', 'leaves.rgba'].includes(name)) throw new Error('Unexpected leaf-fill request.');
                await route.fulfill({ body: await readFile(path.join(directory, name)), contentType: name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
            });
            const gate = await page.evaluate(async () => {
                const THREE = await import('three');
                const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
                const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
                const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
                const renderer = new THREE.WebGLRenderer(), asset = await loadGrassRuntimeAsset({ renderer, leafFill: true });
                const bounds = { minX: -4, maxX: 4, minZ: -4, maxZ: 4 };
                const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: -4, z: 4 }], exclusions: [], resolution: 64 });
                const grass = createGrassPatchRenderer({ asset, coverage, bounds }), scene = new THREE.Scene(); scene.add(grass.group);
                const camera = new THREE.PerspectiveCamera(50, 1, .1, 100); camera.position.set(0, 6, 17); camera.lookAt(0, 0, 0);
                for (let i = 0; i < 6; i++) { grass.setMode('LOD' + i); grass.update(camera); renderer.render(scene, camera); }
                const glError = renderer.getContext().getError(), programs = renderer.info.programs.every(p => p.diagnostics?.runnable !== false);
                grass.dispose(); coverage.dispose(); asset.dispose(); renderer.dispose(); return { freshLoader: glError === 0 && programs, glError };
            });
            manifest.validation = { ...gate, errors }; return manifest;
        });
        await writeJson(path.join(directory, 'manifest.json'), manifest);
        const result = { state: 'validated', directory, files: await listFiles(directory) }; await validate(result, ctx);
        if (ctx.publish) { await ctx.assertInputsStable(); const destination = path.join(ctx.root, 'assets/public/grass/lod4_leaf_fill');
            await publishBakeDirectory(directory, destination); result.state = 'published'; result.files.push(...await listFiles(destination)); }
        return result;
    }, validate
};
