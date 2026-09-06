// Bakes the existing grass V2 asset family while preserving its review-only release policy.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { hashFile, listFiles } from '../../baking/Files.mjs';
import { runHeadlessBake } from '../../baking/Blender.mjs';

export const grassJob = {
    id: 'materials/grass', description: 'Maintained grass V2 far maps, card atlases and AO; validated asset proposal',
    blender: true, outputs: ['materials/grass-v2'],
    async inputs(ctx) { return [path.join(ctx.root, 'tools/grass_material_baker/blender_bake.py'),
        ...await listFiles(path.join(ctx.root, 'assets/public/pbr/grass_004'))]; },
    async run(ctx) {
        const directory = path.join(ctx.stage, 'grass-v2');
        await runHeadlessBake(ctx, 'tools/grass_material_baker/blender_bake.py', [path.join(ctx.root, 'assets/public/pbr/grass_004'), directory]);
        ctx.log.line(ctx.id, 'Grass V2 remains a validated proposal; gameplay installation requires the existing grass asset review.');
        return { state: 'validated', directory, files: await listFiles(directory) };
    },
    async validate(result) {
        const manifest = JSON.parse(await readFile(path.join(result.directory, 'asset.manifest.json'), 'utf8'));
        if (manifest.schema !== 'bus-simulator.low-cut-grass-asset-family' || manifest.version !== 2) throw new Error('Invalid grass manifest');
        for (const [name, expected] of Object.entries(manifest.files)) {
            if (path.basename(name) !== name) throw new Error('Unsafe grass manifest path');
            const actual = await hashFile(path.join(result.directory, name));
            if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error(`Grass artifact mismatch: ${name}`);
        }
    }
};
