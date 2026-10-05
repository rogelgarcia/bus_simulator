// Assemble authenticated three-way images and separate woody/foliage workload measurements.
// @ts-check
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {hashFile, writeJson} from '../../baking/Files.mjs';
import {buildGallery} from './Gallery.mjs';
import {writeTriangleCounts} from './TriangleCounts.mjs';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const names = {london_plane: 'London plane', silver_linden: 'Silver linden', northern_red_oak: 'Northern red oak', american_elm: 'American elm', arrowwood_viburnum: 'Arrowwood viburnum'};
const views = {mature_group: 'All three mature forms', roadside: 'Bus eye height', driveby: 'Opposite driving angle', trunk: 'Trunk and branch union', roots: 'Root-to-ground transition', canopy: 'Canopy underside close-up'};

/** @param {{output: string, source: string, baseline: string, models: string[], placement?: string}} options */
export async function buildRevisionGallery(options) {
    const core = options.placement === 'core';
    const directory = path.join(options.output, 'comparisons');
    const baselineIdentity = await json(path.join(options.baseline, 'reference.json'));
    const identity = await json(path.join(options.output, 'reference.json'));
    if (identity.sha256 !== baselineIdentity.sha256) throw new Error('Three-way comparison requires the same frozen reference');
    const previous = await json(path.join(options.baseline, 'comparisons/renders.json'));
    const current = await json(path.join(directory, 'renders.json'));
    const baselineSummary = await json(path.join(options.baseline, 'summary.json'));
    const reused = [], comparisons = [];
    for (const species of Object.keys(names)) for (const view of Object.keys(views)) {
        const id = species + '_' + view;
        const result = current.renders.find(row => row.camera.id === id && row.representation === 'lod0');
        if (!result) throw new Error('Missing new LOD0 capture: ' + id);
        const rows = previous.renders.filter(row => row.camera.id === id);
        for (const row of rows) {
            if (JSON.stringify(row.camera) !== JSON.stringify(result.camera) || row.samples !== result.samples || row.width !== result.width)
                throw new Error('Three-way comparison settings differ: ' + id);
            const representation = row.representation === 'lod0' ? 'current' : row.representation;
            const file = id + '_' + representation + '.png';
            const source = path.join(options.baseline, 'comparisons', row.file);
            await copyFile(source, path.join(directory, file));
            reused.push({source, file, ...await hashFile(source)});
            if (representation !== 'current') {
                current.renders = current.renders.filter(item => item.file !== file);
                current.renders.push({...row, file});
            }
        }
        comparisons.push({id, camera: result.camera, width: result.width, samples: result.samples,
            files: {reference: id + '_reference.png', current: id + '_current.png', revised: id + '_lod0.png'}});
    }
    await writeJson(path.join(directory, 'renders.json'), current);
    for (const model of options.models) {
        const file = path.join(options.output, model, 'model.json');
        const row = await json(file);
        if (row.placement !== (core ? 'core' : 'spatial')) throw new Error('Revision gallery placement does not match the exported assets');
        if (!core) row.limitations[0] = 'Compact spatial leaf groups are fitted to planes and pruned by multi-view alpha coverage; local parallax and fine spray twigs are lost.';
        else row.limitations[1] = 'Fine spray twigs are omitted; leaf petioles remain in the baked silhouettes.';
        await writeJson(file, row);
    }
    await buildGallery(options);
    const summary = await json(path.join(options.output, 'summary.json'));
    summary.limitations[0] = core ? 'Interior crown projections lose local depth and share front/back tissue color. Exterior cards contain six non-overlapping individual leaves. Larger canopy atlases increase texture memory.' : 'Spatially fitted leaf groups retain less local parallax than individual reference leaves. Fine twig geometry remains omitted.';
    const models = summary.models.map(row => {
        const old = baselineSummary.models.find(candidate => candidate.id === row.id);
        if (!old || (!core && row.woodTriangles !== old.woodTriangles)) throw new Error('Expected preserved baseline wood: ' + row.id);
        return {...row, currentWoodTriangles: old.woodTriangles, currentLeafTriangles: old.canopyTriangles,
            currentCards: old.cards, leafReductionPercent: 100 * (1 - row.canopyTriangles / old.canopyTriangles)};
    });
    const total = key => models.reduce((sum, row) => sum + row[key], 0);
    await writeTriangleCounts(options, models);
    const metrics = summary.fidelity.map(row => ({...row, current: baselineSummary.fidelity.find(old => old.view === row.view)}));
    const revision = {names, views, models, metrics, comparisons, referenceSha256: identity.sha256, baseline: options.baseline,
        core, totals: {wood: total('woodTriangles'), oldWood: total('currentWoodTriangles'), oldLeaves: total('currentLeafTriangles'), newLeaves: total('canopyTriangles'),
            coreTriangles: core ? total('coreTriangles') : null, outerTriangles: core ? total('outerTriangles') : null,
            oldCards: total('currentCards'), newCards: total('cards'), oldTotal: total('currentWoodTriangles') + total('currentLeafTriangles'), newTotal: total('totalTriangles')},
        resourceCosts: {previous: baselineSummary.total, revised: summary.total,
            previousMaterialDraws: baselineSummary.models.reduce((sum, row) => sum + (row.materialDrawsPerModel ?? 2), 0),
            revisedMaterialDraws: models.reduce((sum, row) => sum + (row.materialDrawsPerModel ?? 2), 0)},
        conditions: summary.conditions, reusedCaptures: reused, limitations: summary.limitations,
        strategy: core ? 'Five spatial crown masses, three orthogonal double-sided interior plates per mass, and farthest-point-spaced exterior planes with six separated leaves each. Combined foliage budget: 50,000 triangles. Wood budget: half the preceding LOD0.' : 'Compact position/normal clusters, fitted local planes, shape-matched atlas tiles, then alpha-aware pruning over 24 fixed directions with a 0.25% per-view coverage-loss budget and at least two patches per spray.'};
    await writeJson(path.join(options.output, 'summary.json'), summary);
    await writeJson(path.join(options.output, 'revision.json'), revision);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const payload = JSON.stringify(revision).replaceAll('<', '\\u003c');
    const html = (await readFile(path.join(here, core ? 'core.html' : 'revision.html'), 'utf8')).replace('REVISION_PAYLOAD', payload);
    await writeFile(path.join(options.output, 'index.html'), html);
    for (const file of ['revision.css', 'revision.js']) await copyFile(path.join(here, file), path.join(options.output, file));
    if (core) for (const file of ['core.css', 'core.js']) await copyFile(path.join(here, file), path.join(options.output, file));
    const pictures = path.join(options.output, 'threeway'); await mkdir(pictures, {recursive: true});
    const browser = await chromium.launch({headless: true});
    try {
        const page = await browser.newPage({viewport: {width: 3840, height: 1200}, deviceScaleFactor: 1});
        await page.goto(pathToFileURL(path.join(options.output, 'index.html')).href);
        for (const species of Object.keys(names)) for (const view of Object.keys(views)) {
            await page.selectOption('#species', species); await page.selectOption('#view', view);
            await page.locator('#comparison img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
            await page.locator('#comparison').screenshot({path: path.join(pictures, species + '_' + view + '.jpg'), type: 'jpeg', quality: 95});
        }
        if (core) for (const species of Object.keys(names)) {
            await page.selectOption('#species', species);
            await page.locator('#wire-panel img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
            await page.locator('#wire-panel').screenshot({path: path.join(options.output, 'wireframes', species + '_wireframe.jpg'), type: 'jpeg', quality: 95});
        }
        await page.setViewportSize({width: 2400, height: 1100});
        await page.setContent('<html><style>body{margin:0;background:#101b17}img{display:block;width:2400px}</style>' +
            Object.keys(names).map(species => '<img src="' + pathToFileURL(path.join(pictures, species + '_roadside.jpg')).href + '">').join(''));
        await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
        await page.screenshot({path: path.join(options.output, 'reference-current-new.jpg'), fullPage: true, type: 'jpeg', quality: 95});
    } finally { await browser.close(); }
    console.log('[LOD0] Three-way comparison gallery, 30 labeled images and separate triangle counts completed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await buildRevisionGallery(await json(process.argv[2]));
