// Registers the D2 synthesis fixture gate as the Node-only landscape/synthesis/fixture bake leaf.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../../../baking/Files.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { FIXTURE_RECIPE, runSynthesisFixture } from './SynthesisFixture.mjs';

export const FIXTURE_RECEIPT = 'tests/artifacts/screens/landscape/ai596/d2/fixture/fixture-gate.json';
const FIXTURE_OUTPUT = 'tests/artifacts/screens/landscape/ai596/d2/fixture';
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Fixture paths must name existing files or directories'); return value; };

export const fixtureJob = {
    id: 'landscape/synthesis/fixture', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'D2 gate: run the synthetic 1 x 1 km plateau/road/shoreline fixture through every synthesis operator and verify determinism, plan constraints, relief, geology, seams and the interchange round trip',
    outputs: [FIXTURE_RECEIPT],
    defaults: { recipe: FIXTURE_RECIPE, output: FIXTURE_OUTPUT },
    options: { recipe: pathOption, output: pathOption },
    async inputs(ctx) {
        const files = new Set([path.resolve(ctx.root, ctx.options.recipe)]);
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring', 'tools/bake_landscape/terrain_synthesis/fixture/plan']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js|json)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const outputRoot = path.resolve(ctx.root, ctx.options.output);
        const receipt = await runSynthesisFixture({ root: ctx.root, recipeFile: ctx.options.recipe, outputRoot, landscapeDirectory: path.join(outputRoot, 'landscape'), signal: ctx.signal, log: message => ctx.log.line(ctx.id, message) });
        await ctx.assertInputsStable();
        const reportFile = path.join(ctx.stage, 'fixture-gate.json');
        await writeJson(reportFile, receipt);
        const evidence = path.join(ctx.root, FIXTURE_RECEIPT);
        await publishBakeFile(reportFile, evidence);
        ctx.log.line(ctx.id, `${receipt.passed ? 'PASS' : 'FAIL'}: ${receipt.checks.filter(entry => entry.passed).length}/${receipt.checks.length} checks; engine ${receipt.engine.totalSeconds.toFixed(1)} s; failed: ${receipt.checks.filter(entry => !entry.passed).map(entry => entry.id).join(', ') || 'none'}`);
        if (!receipt.passed) throw new Error(`Synthesis fixture gate failed: ${receipt.checks.filter(entry => !entry.passed).map(entry => entry.id).join(', ')}`);
        return { state: 'validated', reportFile, files: [reportFile, evidence, ...Object.values(receipt.images)] };
    },
    async validate(result) {
        const receipt = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (receipt.format !== 'landscape-synthesis-fixture-gate' || receipt.passed !== true) throw new Error('Synthesis fixture receipt does not record a passing gate');
    }
};
