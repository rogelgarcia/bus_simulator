// Builds the review gallery and measurable workload/fidelity summary from completed assets.
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodePng} from './Png.mjs';

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const names = {london_plane: 'London plane', silver_linden: 'Silver linden', northern_red_oak: 'Northern red oak', american_elm: 'American elm', arrowwood_viburnum: 'Arrowwood viburnum'};
export async function buildGallery(options) {
    const directory = options.output, inspection = await readJson(path.join(directory, 'inspection.json'));
    for (const file of ['sources.json', 'material-approximations.json']) await copyFile(path.join(options.source, file), path.join(directory, 'reference-' + file));
    const models = [], textures = new Map(), fidelity = [];
    for (const row of inspection) {
        const stats = await readJson(path.join(directory, row.id, 'model.json'));
        const compression = await readJson(path.join(directory, row.id, 'compression.json'));
        for (const texture of compression.textures) textures.set(texture.sha256, texture);
        models.push(stats);
    }
    const report = await readJson(path.join(directory, 'comparisons/renders.json'));
    for (const species of Object.keys(names)) for (const view of ['mature_group', 'roadside', 'driveby', 'trunk', 'roots', 'canopy']) {
        const pair = report.renders.filter(row => row.camera.id === `${species}_${view}` && row.representation !== 'background');
        if (pair.length !== 2 || new Set(pair.map(row => row.representation)).size !== 2 || JSON.stringify(pair[0].camera) !== JSON.stringify(pair[1].camera)) throw new Error(`Incomplete matched comparison: ${species}/${view}`);
        if (pair.some(row => row.samples !== report.samples || row.width !== report.size[0])) throw new Error(`Mixed render settings: ${species}/${view}`);
    }
    for (const row of report.renders.filter(row => row.representation === 'background')) {
        const images = await Promise.all(['reference', 'lod0', 'background'].map(async representation =>
            decodePng(await readFile(path.join(directory, 'comparisons', `${row.camera.id}_${representation}.png`)))));
        let intersection = 0, union = 0, reference = 0, lod0 = 0, skyPixels = 0;
        for (let i = 0; i < images[0].data.length; i += 4) {
            const sky = images[2].data;
            if (sky[i + 2] < sky[i] + 5 || sky[i] < 100) continue;
            skyPixels++;
            const a = [0, 1, 2].some(c => Math.abs(images[0].data[i + c] - sky[i + c]) > 18);
            const b = [0, 1, 2].some(c => Math.abs(images[1].data[i + c] - sky[i + c]) > 18);
            reference += a; lod0 += b; intersection += a && b; union += a || b;
        }
        const available = reference >= images[0].width * images[0].height * .005;
        fidelity.push({view: row.camera.id, available, skyPixels, referencePixels: reference, lod0Pixels: lod0,
            silhouetteIoU: available ? intersection / union : null, coverageRatio: available ? lod0 / reference : null,
            unavailableReason: available ? null : 'Insufficient tree silhouette against sky; low shrubs are largely against the ground.',
            method: 'Pixels against blue/bright background-only sky; 18/255 maximum-channel foreground threshold. Excludes ground/shadows; diagnostic, not perceptual equivalence.'});
    }
    const sum = key => models.reduce((total, row) => total + row[key], 0);
    const summary = {models, fidelity, total: {referenceTriangles: sum('referenceWoodTriangles') + sum('referenceFoliageTriangles'),
        lod0Triangles: sum('totalTriangles'), referenceWoodTriangles: sum('referenceWoodTriangles'), lod0WoodTriangles: sum('woodTriangles'),
        uniqueTextureCount: textures.size, rgbaTextureBytesWithMips: [...textures.values()].reduce((s, t) => s + t.rgbaGpuBytes, 0),
        compressedTextureBytesWithMips: [...textures.values()].reduce((s, t) => s + t.blockGpuBytes, 0),
        independentGlbTextureBytesWithMips: sum('textureGpuBytes'), glbBytes: sum('glbBytes')},
        conditions: {...report, renders: undefined, hardware: 'NVIDIA GeForce RTX 3060 / Blender 5.2.1 OPTIX',
            frameTimeMs: null, fps: null, reason: 'Offline asset bake/review, not integrated into the gameplay renderer. No runtime frame-rate claim.'},
        limitations: ['Leaf depth inside each of three spray patches becomes a normal map; close-up parallax and edge-on leaf thickness are reduced.',
            'Fine twig geometry inside sprays is omitted; petiole silhouettes are captured where visible.',
            'Current gameplay loader needs diffuse leaf transmission and shared canopy texture integration; staged assets do not replace existing trees.',
            'ASTC4x4/BC7 memory totals assume a supporting device; other GPU formats or uncompressed fallback differ. Independent GLB loads duplicate shared canopy maps unless the loader deduplicates.',
            'Wind and lower LODs remain separate work. Small terminal atlas mip levels may lose coverage; levels 1–5 carry per-tile coverage correction.']};
    await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    const payload = JSON.stringify({names, models, fidelity, total: summary.total}).replaceAll('<', '\\u003c');
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mature trees · LOD0 review</title>
<style>body{margin:0;background:#101b17;color:#edf1e8;font:16px system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:28px}h1{font-size:34px;margin:12px 0}p{color:#b8c8be;line-height:1.6;max-width:1050px}.eyebrow{color:#b1d596;font-size:12px;letter-spacing:.16em;text-transform:uppercase}.controls{display:flex;gap:16px;flex-wrap:wrap;margin:25px 0}label{display:grid;gap:8px;font-size:13px}select{font:16px system-ui;padding:12px;background:#21352b;color:white;border:1px solid #607766;border-radius:6px}.stage{position:relative;aspect-ratio:16/9;overflow:hidden;background:#25302b;border:1px solid #415447;border-radius:10px}.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.stage .tag{position:absolute;top:16px;padding:8px 12px;background:#0e1d16dc;border-radius:4px;pointer-events:none}.tag.left{left:16px}.tag.right{right:16px}#divider{position:absolute;top:0;bottom:0;width:2px;background:#c8e6ae;left:50%}input{width:100%;accent-color:#b8d898;margin:20px 0}.numbers{display:flex;gap:35px;flex-wrap:wrap;background:#1d2e25;padding:22px;border-radius:8px}.numbers b{font-size:26px;display:block}.numbers span{font-size:13px;color:#bfd0c3}table{border-collapse:collapse;width:100%;margin-top:26px;text-align:left}td,th{padding:15px;border-bottom:1px solid #34483a}th{font-size:12px;text-transform:uppercase;color:#a8c0ad}a{color:#c8e3a7}small{color:#b6c8b9}details{margin:28px 0}summary{cursor:pointer}footer{margin:30px 0;color:#b6c8b9;font-size:14px}button{font:inherit;padding:8px 14px;background:#344b38;color:white;border:0;border-radius:5px;cursor:pointer}@media(max-width:700px){main{padding:16px}table{font-size:12px}td,th{padding:9px}.numbers{gap:20px}}</style>
<main><div class="eyebrow">Vegetation study / 15 mature models</div><h1>Reference → LOD0</h1><p>The original trees stay intact. These separate derivatives retain the mature forms, bake detailed bark into PBR maps, and replace solid leaves with small, tilted alpha cards. Drag the divider to compare identical cameras and lighting.</p>
<div class="controls"><label>Species<select id="species"></select></label><label>View<select id="view"><option value="mature_group">Three mature forms</option><option value="roadside">Bus eye height · 55° vertical field of view</option><option value="driveby">Drive-by · opposite side</option><option value="trunk">Bark and branch union</option><option value="roots">Roots and ground transition</option><option value="canopy">Canopy underside close-up</option></select></label></div>
<div class="stage"><img id="reference" alt="High-detail reference"><img id="lod0" alt="LOD0 using decompressed final UASTC textures"><div id="divider"></div><span class="tag left">High-detail reference</span><span class="tag right">LOD0</span></div><label>Comparison divider<input id="slider" type="range" min="0" max="100" value="50"></label>
<div class="numbers" id="numbers"></div><p id="note"></p><p><a id="fullRef" target="_blank">Open reference render</a> · <a id="fullLod" target="_blank">Open LOD0 render</a></p>
<table><thead><tr><th>Mature form</th><th>Reference triangles</th><th>LOD0 triangles</th><th>Package</th><th>Downloads</th></tr></thead><tbody id="models"></tbody></table>
<details><summary>What changed and what to inspect</summary><p>Each original leaf spray becomes three cards with different facing directions. Front and underside are captured separately. Albedo stays unlit; normal and roughness maps preserve the leaf surface response. Trunks keep 3D roots, branch unions and bends. Bark color, normals and cavity/roughness maps are baked from the detailed reference.</p><p>Close-ups reveal the trade-off: flattened leaf groups lose some parallax, very fine twig geometry is omitted, and normal-mapped bark cannot reproduce deep relief at a grazing angle. These are LOD0 review assets, with wind and lower LODs still to come.</p><p>The primary GLBs contain KTX2/UASTC textures and embedded mipmaps. Blender comparisons use the exact decompressed texels from those packages. Leaf lighting reconstructs the exported diffuse-transmission factor; the current game loader requires that support before integration. The editable Blender and uncompressed source GLBs remain available.</p></details>
<footer>Matched Cycles ray tracing · ${report.size.join(' × ')} · ${report.samples} samples · RTX 3060 / OPTIX · original HDRI, sun and ground. Roadside height 2.2 m is a review assumption; drive-by height is 3.2 m. The elevated group camera is 6.6 m. These are offline quality comparisons, not FPS measurements. <a href="summary.json">Measurements</a> · <a href="reference.json">Reference fingerprint</a> · <a href="reference-sources.json">CC0 texture credits</a> · <a href="reference-material-approximations.json">Inherited material approximations</a></footer></main>
<script>const data=${payload}; const $=id=>document.getElementById(id);const format=n=>n.toLocaleString('en-US');const mb=n=>(n/1048576).toFixed(1)+' MiB';
for(const [id,name] of Object.entries(data.names)) $('species').add(new Option(name,id));
function refresh(){const species=$('species').value,view=$('view').value,prefix='comparisons/'+species+'_'+view;
$('reference').src=prefix+'_reference.png';$('lod0').src=prefix+'_lod0.png';$('fullRef').href=$('reference').src;$('fullLod').href=$('lod0').src;
const rows=data.models.filter(row=>row.id.startsWith(species+'/'));const min=Math.min(...rows.map(r=>r.totalTriangles)),max=Math.max(...rows.map(r=>r.totalTriangles));
$('numbers').innerHTML='<div><b>'+format(min)+'–'+format(max)+'</b><span>triangles per mature model</span></div><div><b>2</b><span>material draws per model</span></div><div><b>'+Math.round(rows[0].meanCardCoverage*100)+'%</b><span>opaque coverage inside card rectangles</span></div><div><b>'+mb(rows[0].textureGpuBytes)+'</b><span>ASTC4×4 / BC7 textures per model, with mips</span></div>';
const quality=data.fidelity.find(row=>row.view===species+'_'+view);$('note').textContent=quality?.available?'Sky-region coverage: '+(quality.coverageRatio*100).toFixed(1)+'% of reference; silhouette overlap '+(quality.silhouetteIoU*100).toFixed(1)+'%. This diagnostic excludes the ground and shadows.':quality?'Sky-only measurements are unavailable here because the shrub sits mainly against the ground. Compare its outline in the matched renders.':'Matched close-up. Inspect bark relief, root continuity, card edges and leaf undersides.';
$('models').innerHTML=rows.map(row=>{const variant=row.id.split('/')[1],base=row.id+'/'+variant+'_lod0';return '<tr><td>'+variant.replace('_',' ')+'</td><td>'+format(row.referenceWoodTriangles+row.referenceFoliageTriangles)+'</td><td>'+format(row.totalTriangles)+'</td><td>'+mb(row.glbBytes)+'</td><td><a href="'+base+'.glb" download>LOD0 GLB</a> · <a href="'+base+'.blend" download>Blender</a> · <a href="'+base+'_source.glb" download>PNG master</a></td></tr>'}).join('');}
function slide(){const v=$('slider').value;$('lod0').style.clipPath='inset(0 0 0 '+v+'%)';$('divider').style.left=v+'%';}
$('species').onchange=refresh;$('view').onchange=refresh;$('slider').oninput=slide;refresh();slide();</script></html>`;
    await writeFile(path.join(directory, 'index.html'), html);
    console.log('[LOD0] Gallery and measurements saved: ' + path.join(directory, 'index.html'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await buildGallery(await readJson(process.argv[2]));
