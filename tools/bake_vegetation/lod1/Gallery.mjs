// Builds full-tree comparison boards from authenticated camera-matched Cycles renders.
import path from 'node:path';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {writeJson, hashFile} from '../../baking/Files.mjs';

const options = JSON.parse(await readFile(process.argv[2], 'utf8'));
const report = JSON.parse(await readFile(path.join(options.output, 'comparisons/renders.json'), 'utf8'));
const names = {london_plane: 'London plane', silver_linden: 'Silver linden', northern_red_oak: 'Northern red oak', american_elm: 'American elm', arrowwood_viburnum: 'Arrowwood viburnum'};
const format = number => number.toLocaleString('en-US');
const records = [];
const directory = path.join(options.output, 'boards'); await mkdir(directory, {recursive: true});
for (const file of ['comparison.css', 'gallery.css']) await writeFile(path.join(options.output, file), await readFile(new URL(file, import.meta.url)));
const browser = await chromium.launch({headless: true, ...(options.browserExecutable ? {executablePath: options.browserExecutable} : {}), args: ['--allow-file-access-from-files']});
const page = await browser.newPage({viewport: {width: report.width*2, height: report.height+130}, deviceScaleFactor: 1});
try {
    for (const model of options.models) {
        const stats = JSON.parse(await readFile(path.join(options.output, model, 'model.json'), 'utf8'));
        const coverage = JSON.parse(await readFile(path.join(options.output, model, 'coverage.json'), 'utf8'));
        const [species, variant] = model.split('/');
        for (const view of [...new Set(report.renders.filter(row => row.model === model).map(row => row.view))]) {
            const rows = ['lod0', 'lod1'].map(lod => report.renders.find(row => row.model === model && row.view === view && row.lod === lod));
            if (rows.some(row => !row) || JSON.stringify(rows[0].camera) !== JSON.stringify(rows[1].camera)) throw new Error('Unmatched comparison cameras');
            for (const row of rows) {
                const root = row.lod === 'lod0' ? options.source : options.output;
                const source = path.join(root, model, variant+'_'+row.lod+'_review.glb');
                if (row.sourceGlbSha256 !== (await hashFile(source)).sha256) throw new Error('Comparison predates final model: '+model);
            }
            const title = `${names[species]} · Mature ${variant.slice(-2)} · ${view === 'front' ? 'bus-height view' : 'reverse view'}`;
            const counts = [[stats.lod0WoodTriangles, stats.lod0LeafTriangles], [stats.woodTriangles, stats.canopyTriangles]];
            const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="../comparison.css"><h1>${title}</h1><main>${rows.map((row,i)=>`<figure><figcaption>${i?'LOD1 · 40% budget':'LOD0'} — ${format(counts[i][0])} wood + ${format(counts[i][1])} leaf triangles</figcaption><img src="../comparisons/${row.file}"></figure>`).join('')}</main>`;
            const stem = model.replace('/', '_')+'_'+view;
            await writeFile(path.join(directory, stem+'.html'), html);
            await page.goto(pathToFileURL(path.join(directory, stem+'.html')).href);
            await page.evaluate(async () => Promise.all([...document.images].map(image => image.decode())));
            await page.screenshot({path: path.join(directory, stem+'.png'), fullPage: true});
            records.push({model, view, title, board: 'boards/'+stem+'.png', ...stats,
                minimumCoverageRatio: Math.min(...coverage.views.map(row => row.coverageRatio)), maximumCoverageRatio: Math.max(...coverage.views.map(row => row.coverageRatio))});
        }
    }
    const representatives = records.filter(row=>row.view==='front' && row.model.endsWith('mature_01'));
    await writeFile(path.join(options.output, 'overview.html'), `<!doctype html><meta charset="utf-8"><title>LOD0 and LOD1 species overview</title><link rel="stylesheet" href="gallery.css"><body class="overview"><h1>LOD0 → LOD1 · Species overview</h1><p>Mature 01 of each species. LOD0 left; LOD1 right. Full-tree views from 2.2 m eye height.</p>${representatives.map(row=>`<img src="${row.board}" alt="${row.title}">`).join('')}</body>`);
    await page.setViewportSize({width: 1480, height: 900});
    await page.goto(pathToFileURL(path.join(options.output, 'overview.html')).href);
    await page.evaluate(async () => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({path: path.join(options.output, 'overview.png'), fullPage: true});
} finally { await browser.close(); }
const totals = Object.fromEntries(['woodTriangles','canopyTriangles','lod0WoodTriangles','lod0LeafTriangles'].map(key=>[key, records.filter(row=>row.view==='front').reduce((sum,row)=>sum+row[key],0)]));
const resources = {};
for (const [lod, root] of [['lod0', options.source], ['lod1', options.output]]) {
    const textures = new Map(); let standaloneGlbBytes = 0, independentTextureBlockBytes = 0;
    for (const model of options.models) {
        const compression = JSON.parse(await readFile(path.join(root, model, 'compression.json'), 'utf8'));
        standaloneGlbBytes += compression.compressedBytes;
        for (const texture of compression.textures) {
            textures.set(texture.sha256, texture); independentTextureBlockBytes += texture.blockGpuBytes;
        }
    }
    resources[lod] = {standaloneGlbBytes, independentTextureBlockBytes,
        sharedTextureBlockBytes: [...textures.values()].reduce((sum, texture) => sum+texture.blockGpuBytes, 0)};
}
await writeFile(path.join(options.output, 'triangle-counts.csv'), 'model,lod0_wood,lod0_leaves,lod1_wood,lod1_leaves,lod1_total\n'+
    records.filter(row=>row.view==='front').map(row=>[row.model,row.lod0WoodTriangles,row.lod0LeafTriangles,row.woodTriangles,row.canopyTriangles,row.totalTriangles].join(',')).join('\n')+'\n');
const selectedRenders = report.renders.filter(row=>options.models.includes(row.model));
await writeJson(path.join(options.output, 'summary.json'), {models: records, totals, render: {...report, renders: undefined,
    device: [...new Set(selectedRenders.map(row=>row.device))].join(' / '),
    sampleCounts: [...new Set(selectedRenders.map(row=>row.samples))],
    sourceResolutions: [...new Set(selectedRenders.map(row=>row.width+'×'+row.height))]},
    resources,
    runtime: {frameTime: null, fps: null, reason: 'Offline LOD1 asset review; no gameplay integration or frame-time benchmark'},
    source: options.source});
await writeFile(path.join(options.output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>LOD1 tree comparisons</title><link rel="stylesheet" href="gallery.css"><h1>LOD0 → LOD1 · Full-tree comparisons</h1><p>${options.models.length} mature forms. 40% triangle budget. Same cameras, HDRI, sunlight and ground. No close-ups.</p><p><a href="overview.png">Species overview</a> · <a href="triangle-counts.csv">Triangle counts</a></p>${records.map(row=>`<article><h2>${row.title}</h2><p><a href="${row.model}/${row.model.split('/')[1]}_lod1.glb" download>LOD1 GLB</a> · <a href="${row.model}/${row.model.split('/')[1]}_lod1.blend" download>Blender source</a></p><a href="${row.board}"><img src="${row.board}" loading="lazy"></a></article>`).join('')}`);
console.log(`[LOD1] Wrote ${records.length} full-tree comparison boards`);
