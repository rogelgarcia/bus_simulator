// Registers the D5 far-field surround synthesis as the Node-only landscape/synthesis/surround bake leaf with the shared planner, input stability and evidence gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../../../baking/Files.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { authoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { SURROUND_FORMAT, SURROUND_LANDSCAPE, SURROUND_OUTPUT, SURROUND_RECIPE, runSurround } from './Surround.mjs';
import { validateLandscapeSynthesisRecipe } from '../../../../src/app/landscape/index.js';

export const SURROUND_RECEIPT = `${SURROUND_OUTPUT}/surround.json`;
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Surround paths must name existing files or directories'); return value; };

export const surroundJob = {
    id: 'landscape/synthesis/surround', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'D5: synthesize the far-field surround of coastal-city-v3 from the coastal-v3-surround recipe (2049² at 15.625 m over 32 x 32 km with v3 embedded and decimated inside the city extent), require the embed to equal v3 decimated bit for bit, measure the extent-edge steps, land/sea fractions and far-shoreline continuity, render the 32 km maps with the extent outlined and write the render-only surround document coastal-city-v3-surround; --publish installs it under <landscape>/surround/ (refusing a stale v3 and the canonical v2), otherwise under the output directory; fails on a non-zero seam inside the extent',
    outputs: [SURROUND_RECEIPT],
    defaults: { recipe: SURROUND_RECIPE, landscape: SURROUND_LANDSCAPE, output: SURROUND_OUTPUT },
    options: { recipe: pathOption, landscape: pathOption, output: pathOption },
    async inputs(ctx) {
        const recipeFile = path.resolve(ctx.root, ctx.options.recipe), recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(recipeFile, 'utf8')));
        const files = new Set([recipeFile, ...Object.values(recipe.inputs.plan ?? {}).filter(Boolean).map(file => path.resolve(ctx.root, file))]);
        const directory = path.resolve(ctx.root, ctx.options.landscape), saved = await readLandscapeFileManifest(directory);
        files.add(path.join(directory, 'manifest.json'));
        for (const chunk of saved.manifest.chunks.filter(entry => entry.level === saved.manifest.grid.maxLevel)) for (const channel of Object.values(chunk.channels)) files.add(authoringFile(directory, channel.url));
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js|json)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const outputRoot = path.resolve(ctx.root, ctx.options.output);
        const receipt = await runSurround({ root: ctx.root, recipeFile: ctx.options.recipe, landscapeDirectory: ctx.options.landscape, outputRoot, publish: ctx.publish, signal: ctx.signal, log: message => ctx.log.line(ctx.id, message) });
        await ctx.assertInputsStable();
        const reportFile = path.join(ctx.stage, 'surround.json');
        await writeJson(reportFile, receipt);
        const evidence = path.join(ctx.root, SURROUND_RECEIPT);
        await publishBakeFile(reportFile, evidence);
        ctx.log.line(ctx.id, `${receipt.passed ? 'PASS' : 'FAIL'}: inside-extent mismatches ${receipt.seam.inside.heightMismatches}, edge step max ${receipt.seam.maxOutsideStepMeters} m, land ${(receipt.landSea.outside.landFraction * 100).toFixed(1)}% outside; engine ${receipt.engine.totalSeconds.toFixed(1)} s, peak ${(receipt.engine.peakTrackedBytes / 1048576).toFixed(0)} MB; `
            + `${receipt.surround.directory} (${receipt.surround.revision}, ${receipt.surround.nodes} nodes, ${(receipt.surround.bytes.total / 1048576).toFixed(2)} MB); failed: ${receipt.failed.join('; ') || 'none'}`);
        if (!receipt.passed) throw new Error(`Surround seam failed: ${receipt.failed.join('; ')}`);
        return { state: ctx.publish ? 'published' : 'validated', reportFile, files: [reportFile, evidence, ...Object.values(receipt.images)] };
    },
    async validate(result) {
        const receipt = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (receipt.format !== SURROUND_FORMAT || receipt.passed !== true || !receipt.surround?.revision || !receipt.surround?.block?.boundaryHash) throw new Error('Surround receipt does not record a passing, written surround document');
    }
};
