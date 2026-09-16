// Builds validated CPU city plans without republishing sunlight or illumination packages.
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gzipSync } from 'node:zlib';
import { planBuildingSlabs } from '../../../src/app/city/BuildingSlabPlan.js';
import { planReceiverCoplanarOwnership } from '../../../src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js';
import { CITY_INPUT_SCHEMA, CITY_INPUT_ALGORITHMS, slabInputKey, coplanarInputKey } from '../../../src/app/city/precomputed/CityInputPlans.js';
import { listFiles, hashFile, writeJson } from '../../baking/Files.mjs';
import { publishBakeFile } from '../../baking/Publication.mjs';
import { captureCityInputs } from './Capture.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function compileCityInputs(captured) {
    if (!captured.slabs.length || !captured.coplanar.length) throw new Error('Incomplete city planner capture');
    const catalog = { schema: CITY_INPUT_SCHEMA, slabs: [], coplanar: [] };
    for (const record of captured.slabs) {
        const key = slabInputKey(record.input), plan = planBuildingSlabs(record.input);
        if (key !== record.key || !isDeepStrictEqual(plan, record.plan)) throw new Error('Independent slab calculation differs');
        catalog.slabs.push({ key, plan });
    }
    for (const record of captured.coplanar) {
        const positions = new Float32Array(record.positions), groups = new Int32Array(record.groups);
        const key = await coplanarInputKey(positions, groups), plan = planReceiverCoplanarOwnership(positions, groups);
        if (key !== record.key || plan.removedArea !== record.removedArea || !isDeepStrictEqual([...plan.patches], record.patches)) {
            throw new Error('Independent coplanar calculation differs');
        }
        catalog.coplanar.push({ key, patches: [...plan.patches], removedArea: plan.removedArea });
    }
    return catalog;
}

export const cityInputsJob = {
    id: 'lighting/city-inputs', always: true, configurationPaths: ['browserExecutable'],
    codePaths: ['tools/bake_lighting/city_inputs', 'tools/bake_lighting/experiments/lighting_configurations/capture_baselines/GameBrowser.mjs'],
    description: 'Precompute exact city slab and receiver ownership plans; validate fresh runtime parity before publication',
    outputs: ['src/app/city/precomputed/bakes/bigcity2.index.json'],
    async inputs(ctx) {
        return (await listFiles(path.join(ctx.root, 'src'))).filter(file => /\.(js|json|glsl)$/.test(file)
            && !file.includes(`${path.sep}precomputed${path.sep}bakes${path.sep}`));
    },
    async run(ctx) {
        const before = await captureCityInputs(ctx);
        await writeJson(path.join(ctx.stage, 'inputs.json'), before.captured);
        ctx.log.line(ctx.id, `Captured ${before.captured.slabs.length} slab and ${before.captured.coplanar.length} ownership inputs`);
        const catalog = await compileCityInputs(before.captured), decoded = Buffer.from(JSON.stringify(catalog) + '\n');
        const bytes = gzipSync(decoded, { level: 9 });
        const hash = sha256(bytes), algorithms = {};
        for (const file of CITY_INPUT_ALGORITHMS) algorithms[file] = (await hashFile(path.join(ctx.root, file))).sha256;
        const index = { schema: CITY_INPUT_SCHEMA, file: `bigcity2.${hash}.json.gz`, sha256: hash, bytes: bytes.length, decodedBytes: decoded.length, algorithms };
        const output = path.join(ctx.stage, index.file), indexFile = path.join(ctx.stage, 'bigcity2.index.json');
        await writeFile(output, bytes); await writeJson(indexFile, index);
        const after = await captureCityInputs(ctx, { candidate: { index, bytes } });
        if (before.geometryHash !== after.geometryHash || !isDeepStrictEqual(before.source, after.source)
            || after.diagnostics.state !== 'ready' || after.diagnostics.slabHits !== before.diagnostics.slabMisses
            || after.diagnostics.coplanarHits !== before.diagnostics.coplanarMisses
            || after.diagnostics.slabMisses || after.diagnostics.coplanarMisses) throw new Error('Fresh city cache parity or complete reuse failed');
        delete before.captured;
        const report = path.join(ctx.stage, 'validation.json');
        await writeJson(report, { passed: true, before, after, outputHash: hash });
        await ctx.assertInputsStable();
        const result = { state: 'validated', output, indexFile, report, files: [output, indexFile, report] };
        if (ctx.publish) {
            const directory = path.join(ctx.root, 'src/app/city/precomputed/bakes');
            await publishBakeFile(output, path.join(directory, index.file));
            await publishBakeFile(indexFile, path.join(directory, 'bigcity2.index.json'));
            result.state = 'published';
        }
        return result;
    },
    async validate(result) {
        const index = JSON.parse(await readFile(result.indexFile, 'utf8'));
        const report = JSON.parse(await readFile(result.report, 'utf8'));
        if (!report.passed || sha256(await readFile(result.output)) !== index.sha256 || report.outputHash !== index.sha256) throw new Error('City input validation failed');
    }
};
