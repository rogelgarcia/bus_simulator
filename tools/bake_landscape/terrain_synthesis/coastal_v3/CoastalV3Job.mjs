// Registers the D4 coastal terrain v3 synthesis as the Node-only landscape/synthesis/coastal-v3 bake leaf with the shared planner, input stability and evidence gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../../../baking/Files.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { authoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { COASTAL_V3_FIELDS_RECIPE, COASTAL_V3_FORMAT, COASTAL_V3_OUTPUT, COASTAL_V3_POSES, COASTAL_V3_RECIPE, COASTAL_V3_WORKING_MODES, runCoastalV3 } from './CoastalV3.mjs';
import { LANDSCAPE_CACHE_ROOT } from '../../../../src/app/landscape/LandscapeCache.js';
import { validateLandscapeSynthesisRecipe } from '../../../../src/app/landscape/index.js';

export const COASTAL_V3_RECEIPT = `${COASTAL_V3_OUTPUT}/coastal-v3.json`;
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Coastal v3 paths must name existing files or directories'); return value; };
const choice = (name, values) => value => { if (!values.includes(String(value))) throw new Error(`${name} must be ${values.join(' or ')}`); return String(value); };
const replayOption = value => (String(value) === 'none' ? 'none' : pathOption(value));

export const coastalV3Job = {
    id: 'landscape/synthesis/coastal-v3', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'D4: synthesize coastal terrain v3 from the coastal-v3 recipe (4097² at 0.9765625 m; working=1953 iterates on the 1.953125 m grid), evaluate every declared target and hard constraint, render the review maps and profiles, write the landscape coastal-city-v3 with references, re-baked fields and the geology sidecar; --publish writes it under the landscape cache root, otherwise under the output directory; fails on any failing target or constraint',
    outputs: [COASTAL_V3_RECEIPT],
    defaults: { recipe: COASTAL_V3_RECIPE, 'fields-recipe': COASTAL_V3_FIELDS_RECIPE, output: COASTAL_V3_OUTPUT, working: 'native', 'landscape-root': LANDSCAPE_CACHE_ROOT, fields: 'bake', geology: 'publish', 'replay-edits': 'none', poses: COASTAL_V3_POSES },
    options: { recipe: pathOption, 'fields-recipe': pathOption, output: pathOption, working: choice('working', ['native', ...Object.keys(COASTAL_V3_WORKING_MODES).filter(mode => mode !== 'native')]), 'landscape-root': pathOption, fields: choice('fields', ['bake', 'none']), geology: choice('geology', ['publish', 'none']), 'replay-edits': replayOption, poses: pathOption },
    async inputs(ctx) {
        const recipeFile = path.resolve(ctx.root, ctx.options.recipe), recipe = validateLandscapeSynthesisRecipe(JSON.parse(await readFile(recipeFile, 'utf8')));
        const files = new Set([recipeFile, path.resolve(ctx.root, ctx.options['fields-recipe']), path.resolve(ctx.root, ctx.options.poses), ...Object.values(recipe.inputs.plan).filter(Boolean).map(file => path.resolve(ctx.root, file))]);
        const directory = path.resolve(ctx.root, recipe.inputs.landscape.directory), saved = await readLandscapeFileManifest(directory);
        files.add(path.join(directory, 'manifest.json'));
        for (const chunk of saved.manifest.chunks.filter(entry => entry.level === saved.manifest.grid.maxLevel)) for (const channel of Object.values(chunk.channels)) files.add(authoringFile(directory, channel.url));
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring', 'tools/landscape_review']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js|json)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const outputRoot = path.resolve(ctx.root, ctx.options.output);
        const receipt = await runCoastalV3({ root: ctx.root, recipeFile: ctx.options.recipe, fieldsRecipeFile: ctx.options['fields-recipe'], outputRoot, working: ctx.options.working, landscapeRoot: ctx.publish ? ctx.options['landscape-root'] : null,
            fields: ctx.options.fields, geology: ctx.options.geology, replayEdits: ctx.options['replay-edits'], poseFile: ctx.options.poses, signal: ctx.signal, log: message => ctx.log.line(ctx.id, message) });
        await ctx.assertInputsStable();
        const reportFile = path.join(ctx.stage, 'coastal-v3.json');
        await writeJson(reportFile, receipt);
        const evidence = path.join(ctx.root, COASTAL_V3_RECEIPT);
        await publishBakeFile(reportFile, evidence);
        ctx.log.line(ctx.id, `${receipt.passed ? 'PASS' : 'FAIL'}: ${receipt.targets.rows.filter(entry => entry.passed).length}/${receipt.targets.rows.length} rows; engine ${receipt.engine.totalSeconds.toFixed(1)} s, peak ${(receipt.engine.peakTrackedBytes / 1048576).toFixed(0)} MB; `
            + `${receipt.landscape.directory} (${receipt.landscape.revision}, ${receipt.landscape.manifestSnapshot}); geology ${receipt.geology.status}; failed: ${receipt.failed.join(', ') || 'none'}`);
        if (!receipt.passed) throw new Error(`Coastal v3 targets or constraints failed: ${receipt.failed.join(', ')}`);
        return { state: ctx.publish ? 'published' : 'validated', reportFile, files: [reportFile, evidence, ...Object.values(receipt.images)] };
    },
    async validate(result) {
        const receipt = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (receipt.format !== COASTAL_V3_FORMAT || receipt.passed !== true || !receipt.landscape?.revision || !receipt.landscape?.manifestSnapshot) throw new Error('Coastal v3 receipt does not record a passing, published candidate');
    }
};
