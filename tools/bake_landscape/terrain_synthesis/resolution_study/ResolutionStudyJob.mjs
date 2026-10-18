// Registers the D3 resolution study as the Node-only landscape/synthesis/resolution-study bake leaf with the shared planner, input stability and evidence gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../../../baking/Files.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { RESOLUTION_CITY_RECIPES, RESOLUTION_STUDY_FORMAT, RESOLUTION_STUDY_RECIPES, runResolutionStudy } from './ResolutionStudy.mjs';
import { LANDSCAPE_CACHE_ROOT } from '../../../../src/app/landscape/LandscapeCache.js';

export const RESOLUTION_STUDY_OUTPUT = 'tests/artifacts/screens/landscape/ai596/d3/resolution';
export const RESOLUTION_STUDY_RECEIPT = `${RESOLUTION_STUDY_OUTPUT}/resolution-study.json`;
const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Resolution study paths must name existing files or directories'); return value; };
const listOption = value => { const files = String(value).split(',').map(entry => entry.trim()).filter(Boolean); if (!files.length) throw new Error('recipes must list at least one recipe file'); files.forEach(pathOption); return files.join(','); };
const fieldsOption = value => { if (!['bake', 'none'].includes(String(value))) throw new Error('fields must be bake or none'); return String(value); };
const cityOption = value => { if (!['true', 'false', 'only'].includes(String(value))) throw new Error('city-extent must be true, false or only'); return String(value); };

export const resolutionStudyJob = {
    id: 'landscape/synthesis/resolution-study', always: true, configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'D3 resolution study: synthesize the fixture recipe at 1.953125, 0.9765625 and 0.48828125 m, write each as a standalone saved landscape and measure size, cost, relief and feature sharpness with hillshade composites; city-extent=true adds the 4 x 4 km pair (2049² and 4097²), city-extent=only re-runs that pair alone into the existing receipt; --publish writes the landscapes under the cache root',
    outputs: [RESOLUTION_STUDY_RECEIPT],
    defaults: { recipes: RESOLUTION_STUDY_RECIPES.join(','), output: RESOLUTION_STUDY_OUTPUT, 'landscape-root': LANDSCAPE_CACHE_ROOT, fields: 'none', 'city-extent': 'false', 'city-recipes': RESOLUTION_CITY_RECIPES.join(',') },
    options: { recipes: listOption, output: pathOption, 'landscape-root': pathOption, fields: fieldsOption, 'city-extent': cityOption, 'city-recipes': listOption },
    async inputs(ctx) {
        const files = new Set(ctx.options.recipes.split(',').map(file => path.resolve(ctx.root, file)));
        if (ctx.options['city-extent'] !== 'false') for (const file of ctx.options['city-recipes'].split(',')) files.add(path.resolve(ctx.root, file));
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring', 'tools/bake_landscape/terrain_synthesis/fixture/plan']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js|json)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const study = await runResolutionStudy({ root: ctx.root, recipeFiles: ctx.options.recipes.split(','), outputRoot: path.resolve(ctx.root, ctx.options.output), landscapeRoot: ctx.publish ? ctx.options['landscape-root'] : null,
            fields: ctx.options.fields, cityExtent: ctx.options['city-extent'] === 'only' ? 'only' : ctx.options['city-extent'] === 'true', cityRecipeFiles: ctx.options['city-recipes'].split(','), signal: ctx.signal, log: message => ctx.log.line(ctx.id, message) });
        await ctx.assertInputsStable();
        const reportFile = path.join(ctx.stage, 'resolution-study.json');
        await writeJson(reportFile, study);
        const evidence = path.join(ctx.root, RESOLUTION_STUDY_RECEIPT);
        await publishBakeFile(reportFile, evidence);
        for (const spacing of study.spacings) {
            ctx.log.line(ctx.id, `${spacing.label}: ${spacing.hierarchy.nodes} nodes, ${(spacing.bytes.total / 1048576).toFixed(1)} MB, synthesis ${spacing.synthesis.totalSeconds.toFixed(1)} s, hierarchy ${spacing.landscape.timing.hierarchySeconds.toFixed(1)} s, `
                + `peak ${(spacing.synthesis.peakTrackedBytes / 1048576).toFixed(0)} MB; slope > 20 deg ${(spacing.relief.slope.above20Fraction * 100).toFixed(1)}%, incision p90 ${spacing.relief.incision.p90.toFixed(2)} m; ${spacing.landscape.directory} (${spacing.landscape.revision})`);
        }
        for (const city of study.cityExtent?.spacings ?? []) {
            if (city.failed) { ctx.log.line(ctx.id, `${city.label}: FAILED after ${city.elapsedSeconds.toFixed(1)} s (peak ${(city.synthesis.peakTrackedBytes / 1048576).toFixed(0)} MB): ${city.error}`, 'failed'); continue; }
            ctx.log.line(ctx.id, `${city.label}: ${city.hierarchy.nodes} nodes, ${(city.bytes.total / 1048576).toFixed(1)} MB, synthesis ${city.synthesis.totalSeconds.toFixed(1)} s, hierarchy ${city.landscape.timing.hierarchySeconds.toFixed(1)} s, peak ${(city.synthesis.peakTrackedBytes / 1048576).toFixed(0)} MB; ${city.landscape.directory} (${city.landscape.revision})`);
        }
        return { state: ctx.publish ? 'published' : 'validated', reportFile, files: [reportFile, evidence, ...Object.values(study.composites), ...study.spacings.flatMap(spacing => Object.values(spacing.images)), ...(study.cityExtent?.spacings ?? []).filter(city => !city.failed).flatMap(city => Object.values(city.images))] };
    },
    async validate(result) {
        const study = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (study.format !== RESOLUTION_STUDY_FORMAT || !Array.isArray(study.spacings) || !study.spacings.length) throw new Error('Resolution study receipt is incomplete');
        for (const spacing of study.spacings) if (!spacing.identity || !spacing.heightsSha256 || !spacing.landscape?.revision || !spacing.sharpness) throw new Error(`Resolution study spacing ${spacing.tag} lacks its identity, landscape revision or measurements`);
    }
};
