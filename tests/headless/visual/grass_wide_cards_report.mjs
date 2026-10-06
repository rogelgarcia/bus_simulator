// Build a local comparison from rendered evidence and paired hardware timings.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/wide_cards');
const visual = JSON.parse(await readFile(path.join(output, 'visual.json'), 'utf8'));
const benchmark = JSON.parse(await readFile(path.join(output, 'benchmark.json'), 'utf8'));
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const views = Object.values(benchmark.comparisons);
const names = { direct: 'Direct to canopy', bridge: 'With wide-card bridge', lod3: 'Only LOD3 · 25 cm cards', lod4: 'Only LOD4 · 75 cm cards', lod5: 'Only LOD5 · canopy' };
const timings = Object.keys(names).map(mode => `<tr><th>${names[mode]}</th>${views.map(view => {
    const value = view.results[mode].aboveSoilGpu;
    return `<td title="95% interval: ${value.ci95Ms.map(v => v.toFixed(3)).join('–')} ms">${value.averageMs.toFixed(3)} ms</td>`;
}).join('')}<td>${mean(views.map(v => v.results[mode].aboveSoilGpu.averageMs)).toFixed(3)} ms</td></tr>`).join('');
const cost = mean(views.map(v => -v.results.bridge.savedFromDirectGpu.averageMs));
const coverage = ['lod3', 'cards', 'lod5'].map(mode => {
    const rows = visual.rows.filter(r => r.mode === mode).flatMap(r => r.coverage.filter(b => b.near >= 14 && b.far <= 24));
    return `<tr><th>${mode === 'cards' ? 'LOD4' : mode.toUpperCase()}</th><td>${(100 * mean(rows.map(b => b.coverage))).toFixed(1)}%</td><td>${[0, 1, 2].map(i => mean(rows.map(b => b.leafRgb[i])).toFixed(1)).join(' / ')}</td></tr>`;
}).join('');
const cpuRows = ['direct', 'bridge'].map(mode => {
    const samples = benchmark.cpuMotion.filter(row => row.version === mode);
    return `<tr><th>${names[mode]}</th><td>${mean(samples.map(r => r.selectionCpuMs / 60)).toFixed(3)} ms</td><td>${mean(samples.map(r => r.batchCpuMs / 60)).toFixed(3)} ms</td></tr>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grass · wide-card bridge</title><style>
body{font:16px/1.5 system-ui;background:#14231d;color:#eaf0e7;margin:24px auto;padding:0 24px;max-width:1400px}h1{font-size:28px}h2{font-size:21px;margin-top:32px}a{color:#b9e694}p{max-width:1000px}label{display:inline-flex;align-items:center;gap:10px;margin:0 24px 16px 0}select,button{font:inherit;background:#294234;color:inherit;border:1px solid #718873;border-radius:6px;padding:6px 12px}.split{position:relative;aspect-ratio:1.6;overflow:hidden;background:#111}.split img{position:absolute;width:100%;height:100%;object-fit:contain}.split .new{clip-path:inset(0 50% 0 0)}.tag{position:absolute;top:8px;background:#12271dcc;padding:8px 12px}.tag.right{right:8px}.tag.left{left:8px}table{border-collapse:collapse;margin:16px 0;width:100%;max-width:1100px}th,td{text-align:left;padding:9px 14px;border-bottom:1px solid #425b48}thead{background:#263c2e}small{color:#bfd0bd}.motion{width:100%;display:block}input[type=range]{width:220px}code{color:#bfdba8}.note{padding:14px;background:#23392c;border-left:3px solid #afd48c}
</style>
<h1>LOD4 · larger cards between LOD3 and the canopy</h1>
<p>75 cm cards, four per m², each capturing 126–141 source leaves including edge padding. LOD3 keeps its 25 cm cards at 20/m²; the former 1K canopy is now LOD5. Captures use the game bus pitch, live game lighting and unchanged leaf height.</p>
<p><a href="/debug_tools/grass_transition_scene.html?revision=lod4-wide-1&lod3=cards#front">Open the dynamic lab</a> · <a href="/debug_tools/grass_transition_scene.html?revision=lod4-wide-1&lod3=cards&bridge=off#front">Direct-to-canopy comparison</a></p>
<p>Switches: <b>0.6 / 0.8 / 1 / 16 / 32 m</b>. LOD3→4 blends over 8.5–16 m; LOD4→5 over 24–32 m. CPU selection stays at 50 ms and 0.2 m. Helpers remain off.</p>
<h2>Matched before / after</h2>
<label>Pose <select id="pose"><option>front</option><option>rear</option><option>border</option></select></label><label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div class="split"><img id="before" src="before_front.png"><img id="after" class="new" src="new_front.png"><span class="tag left">New bridge + canopy calibration</span><span class="tag right">Previous direct transition</span></div>
<p><small>Both are actual renders at 1600 × 1000. Previous source is served from the preserved local snapshot. Different leaf detail remains visible; this is an improvement, not an identical image.</small></p>
<h2>Isolated neighbouring levels</h2>
<label>Direction <select id="bearing"><option>0</option><option>90</option><option>180</option><option>270</option></select></label>
<label>Reference <select id="reference"><option value="lod3">LOD3</option><option value="lod5">LOD5</option></select></label>
<label>LOD4 density <select id="density"><option value="cards">4 cards/m² · chosen</option><option value="cards-sparse">3 cards/m²</option><option value="cards-full">6 cards/m²</option></select></label>
<div class="split"><img id="ref" src="bus_0_lod3.png"><img id="wide" class="new" src="bus_0_cards.png"><span class="tag left">LOD4</span><span id="refTag" class="tag right">LOD3</span></div>
<p>These force one level across every field, including distances where it would normally be replaced. Three cards left conspicuous gaps; six were too dense. Four gave the closest coverage around the intended handoff. The wider grouping is visible when forced close.</p>
<h2>Color and coverage · 14–24 m</h2><table><thead><tr><th>Level</th><th>Green-classified pixels</th><th>Leaf-only RGB / 255</th></tr></thead><tbody>${coverage}</tbody></table>
<small>Four bus bearings; paths, sky and field edges excluded. Fixed green classifier, not a semantic grass ID mask. Color excludes pixels classified as litter/soil. At very long distance, mixed mip pixels limit this metric.</small>
<h2>GPU cost above matched soil</h2><table><thead><tr><th>Representation</th><th>Front</th><th>Rear</th><th>Border</th><th>Mean</th></tr></thead><tbody>${timings}</tbody></table>
<p class="note">The full bridge adds <b>${cost.toFixed(3)} ms</b> over direct-to-canopy rendering. Isolated LOD4 is cheaper than LOD3, but extending card detail and adding another blend band costs more than flattening at 16 m.</p>
<p><small>1920 × 1080, DPR 1, RTX 3060, shadows enabled and cached. Six paired rounds × 30 samples per variant, interleaved with soil in rotating order. Hover timing cells for 95% intervals. Batches were uploaded before timing; each version has independent blend uniforms. The timer queue is drained between paired cycles. No discarded samples, shadow rebakes or selection scans inside measured blocks. GPU clocks were not locked. Isolated canopy includes the retained side-leaf state shown in the raw snapshots.</small></p>
<h2>CPU during movement</h2><table><thead><tr><th>Representation</th><th>Selection / frame</th><th>Batch rebuild / frame</th></tr></thead><tbody>${cpuRows}</tbody></table>
<small>Three repeats of 60 moving frames; twelve selection scans each. Extra blend batches account for the increased update cost.</small>
<h2>Memory and limits</h2><p>The new three-channel capture atlas adds <b>67.1 MB (64 MiB)</b>, including mipmaps. LOD3 + LOD4 card atlases total 134.2 MB. This is texture storage calculated from uploaded dimensions/formats, excluding the existing canopy, source maps, shadow targets and driver overhead. The comparison toggle keeps both atlases cached; it does not free memory.</p>
<p>Cards rotate continuously in the vertex shader. Images are captured once at startup; no per-card CPU update or periodic rebake. The canopy uses its existing maps, with revised leaf tint and a capped oblique coverage correction; it adds no texture fetch. Far canopy still lacks leaf parallax, wide cards retain visible grouping, and finite sample coverage can vary slightly during movement.</p>
<h2>Motion through the bands</h2><label>Frame <input id="frame" type="range" min="0" max="40" step="5" value="0"></label><img id="motion" class="motion" src="move_0.png">
<p><a href="visual.json">Capture measurements</a> · <a href="benchmark.json">Raw paired timings and draw calls</a></p>
<script>
const $=id=>document.getElementById(id);function update(){ $('before').src='before_'+$('pose').value+'.png';$('after').src='new_'+$('pose').value+'.png';$('ref').src='bus_'+$('bearing').value+'_'+$('reference').value+'.png';$('wide').src='bus_'+$('bearing').value+'_'+$('density').value+'.png';$('refTag').textContent=$('reference').value.toUpperCase();document.querySelectorAll('.new').forEach(e=>e.style.clipPath='inset(0 '+(100-$('split').value)+'% 0 0)');$('motion').src='move_'+$('frame').value+'.png';}document.querySelectorAll('select,input').forEach(e=>e.addEventListener('input',update));update();
</script>`;
await writeFile(path.join(output, 'index.html'), html);
console.log(output);
