// Registers the D1 relief study as the Node-only landscape/synthesis/relief-study bake leaf with the shared planner, input stability and evidence gates.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listFiles, writeJson } from '../../../baking/Files.mjs';
import { publishBakeFile } from '../../../baking/Publication.mjs';
import { readLandscapeFileManifest } from '../../../landscape_authoring/LandscapeFileIO.mjs';
import { authoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { runReliefStudy } from './ReliefStudy.mjs';
import { LANDSCAPE_CACHE_ROOT, LANDSCAPE_DEFAULT_DIRECTORY } from '../../../../src/app/landscape/LandscapeCache.js';

export const RELIEF_STUDY_RECEIPT = 'tests/artifacts/screens/landscape/ai596/d1/relief-study.json';
export const RELIEF_STUDY_RECIPES = Object.freeze(['relief-a-v2-sharpened', 'relief-b-raised-80', 'relief-c-dramatic-160'].map(name => `tools/bake_landscape/terrain_synthesis/relief_study/recipes/${name}.json`));
export const RELIEF_STUDY_POSES = 'tools/landscape_review/poses/natural-world-v1.json';
const RELIEF_STUDY_OUTPUT = 'tests/artifacts/screens/landscape/ai596/d1';
// the reported road limit per variant: the dramatic crest needs the 8 percent short-section allowance on its ascents (D1 exception)
const RELIEF_STUDY_CONSTRAINTS = Object.freeze({ 'relief-b-raised-80': { highCityTargetMeters: 80 }, 'relief-c-dramatic-160': { highCityTargetMeters: 160, maxSustainedGradePercent: 8 } });

const pathOption = value => { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Relief study paths must name existing files or directories'); return value; };
const listOption = value => { const files = String(value).split(',').map(entry => entry.trim()).filter(Boolean); if (!files.length) throw new Error('recipes must list at least one recipe file'); files.forEach(pathOption); return files.join(','); };
const fieldsOption = value => { if (!['bake', 'none'].includes(String(value))) throw new Error('fields must be bake or none'); return String(value); };

export const reliefStudyJob = {
    id: 'landscape/synthesis/relief-study', configurationPaths: [], codePaths: ['tools/bake_landscape', 'tools/landscape_review'],
    description: 'D1 relief study: diagnose the current coastal terrain, synthesize the coarse relief variants from their recipes, measure constraints and render review maps; --publish also writes each variant as a saved landscape beside the cache',
    outputs: [RELIEF_STUDY_RECEIPT],
    defaults: { directory: LANDSCAPE_DEFAULT_DIRECTORY, recipes: RELIEF_STUDY_RECIPES.join(','), poses: RELIEF_STUDY_POSES, 'landscape-root': LANDSCAPE_CACHE_ROOT, fields: 'bake' },
    options: { directory: pathOption, recipes: listOption, poses: pathOption, 'landscape-root': pathOption, fields: fieldsOption },
    async inputs(ctx) {
        const directory = path.resolve(ctx.root, ctx.options.directory), saved = await readLandscapeFileManifest(directory);
        const files = new Set([path.join(directory, 'manifest.json'), path.resolve(ctx.root, ctx.options.poses), ...ctx.options.recipes.split(',').map(file => path.resolve(ctx.root, file))]);
        for (const chunk of saved.manifest.chunks.filter(entry => entry.level === saved.manifest.grid.maxLevel)) for (const channel of Object.values(chunk.channels)) files.add(authoringFile(directory, channel.url));
        for (const folder of ['src/app/landscape', 'tools/landscape_authoring', 'tools/landscape_review']) for (const file of await listFiles(path.join(ctx.root, folder))) if (/\.(m?js|json)$/.test(file)) files.add(file);
        return [...files];
    },
    async run(ctx) {
        const study = await runReliefStudy({ root: ctx.root, sourceDirectory: ctx.options.directory, recipeFiles: ctx.options.recipes.split(','), outputRoot: path.join(ctx.root, RELIEF_STUDY_OUTPUT), poseFile: ctx.options.poses,
            landscapeRoot: ctx.publish ? ctx.options['landscape-root'] : null, fields: ctx.options.fields, constraints: RELIEF_STUDY_CONSTRAINTS, signal: ctx.signal, log: message => ctx.log.line(ctx.id, message) });
        await ctx.assertInputsStable();
        const reportFile = path.join(ctx.stage, 'relief-study.json');
        await writeJson(reportFile, study);
        const evidence = path.join(ctx.root, RELIEF_STUDY_RECEIPT);
        await publishBakeFile(reportFile, evidence);
        for (const variant of study.variants) {
            const summary = variant.summary;
            ctx.log.line(ctx.id, `${variant.id}: heights ${summary.heights.min.toFixed(1)}..${summary.heights.max.toFixed(1)} m; natural slope p90 ${summary.slope.p90.toFixed(2)} deg, max ${summary.slope.max.toFixed(1)} deg; `
                + `roads ${summary.constraints.maxSustainedGradePercent.toFixed(2)}% sustained; constraints ${summary.constraints.passed ? 'pass' : `fail (${summary.constraints.failedChecks.join(', ')})`}`
                + (variant.published ? `; published ${variant.published.directory} (${variant.published.revision})` : ''));
        }
        return { state: ctx.publish ? 'published' : 'validated', reportFile, files: [reportFile, evidence, ...study.variants.flatMap(variant => Object.values(variant.images))] };
    },
    async validate(result) {
        const study = JSON.parse(await readFile(result.reportFile, 'utf8'));
        if (study.format !== 'landscape-relief-study' || !Array.isArray(study.variants) || !study.variants.length) throw new Error('Relief study receipt is incomplete');
        for (const variant of study.variants) if (!variant.identity || !variant.heightsSha256 || !variant.summary?.constraints) throw new Error(`Relief study variant ${variant.id} lacks its identity or constraint report`);
    }
};
