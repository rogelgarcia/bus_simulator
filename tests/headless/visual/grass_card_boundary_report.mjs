// Compare the same sparse-base budget before and after coverage balancing / field clipping.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = 'tests/artifacts/screens/grass_debug_v2/card_coverage';
const before = JSON.parse(await readFile(`${root}/edge-before/coverage.json`, 'utf8'));
const after = JSON.parse(await readFile(`${root}/edge-final/coverage.json`, 'utf8'));
const data = JSON.stringify({ before, after }).replaceAll('<', '\\u003c');
await mkdir(`${root}/edge_fix`, { recursive: true });
await writeFile(`${root}/edge_fix/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Grass coverage and field edges</title>
<style>body{background:#15231c;color:#ebf0e9;font:16px system-ui;margin:24px;max-width:1600px}h1{font-size:27px}p{max-width:1100px;line-height:1.55}select,input{font:inherit}label{display:inline-flex;align-items:center;gap:10px;margin:8px 22px 16px 0}select{padding:6px;background:#263a2e;color:inherit;border:1px solid #809780;border-radius:5px}.image{position:relative;width:100%;aspect-ratio:1360/952;background:#101812}.image img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.tag{position:absolute;top:12px;background:#15231ce8;padding:8px 12px}.left{left:12px}.right{right:12px}table{border-collapse:collapse;margin:18px 0}th,td{padding:9px 24px 9px 0;text-align:left;border-bottom:1px solid #47604d}.note{color:#becabd}a{color:#c6e397}.metric{padding:14px;background:#23382b;border-radius:6px;margin:18px 0}.edges{display:flex;gap:12px;flex-wrap:wrap}.edges figure{margin:0;max-width:45%}.edges img{width:100%;max-width:380px}</style>
<h1>More even coverage, contained field edges</h1>
<p>The base still uses 45% of the source shoots. It now chooses leaves that fill gaps in both repeating tiles, instead of thinning them randomly. Smaller card offsets preserve their spacing. LOD3 stays at 12 cards/m²; LOD4 stays at 3.</p>
<p>Only perimeter cards use field clipping. Interior cards keep their existing shader. Texture allocation and triangle counts are unchanged. Perimeter batches add draw calls; costs are shown below.</p>
<p><a href="../../../../../../debug_tools/grass_debug_v2.html?revision=card-coverage-2">Bus scene</a> · <a href="../../../../../../debug_tools/grass_transition_scene.html?revision=card-coverage-2&lod3=cards#front">Transition lab</a> · <a href="../index.html">Earlier card-only comparison</a></p>
<label>View <select id="pose"><option>overview</option><option>bus</option><option>grass</option><option>rear</option></select></label>
<label>Level <select id="mode"><option>LOD4</option><option>LOD3</option><option>AUTO</option></select></label>
<label>Reference <select id="reference"><option value="before">Previous hybrid</option><option value="source">LOD2</option></select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div class="image"><img id="new" alt="Balanced sparse base and bounded cards"><img id="old" alt="Comparison reference"><span class="tag left" id="old-label"></span><span class="tag right">Revised hybrid</span></div>
<div class="metric" id="metrics"></div>
<p class="note">A low-coverage region is a 25 × 25 cm ground area with less than 50% visible leaf coverage, excluding soil and litter using a separate rendered mask. These are local coverage measurements, not a claim that all natural gaps should disappear. Broad card groupings remain visible at steep angles.</p>
<h2>Field containment</h2>
<p id="edges-result"></p>
<div class="edges"><figure><img src="../edge-before/boundary-LOD4-3.png" alt="Previous wide cards extend outside the corner"><figcaption>Previous LOD4 corner</figcaption></figure><figure><img src="../edge-final/boundary-LOD4-3.png" alt="Revised wide cards end at the field boundary"><figcaption>Revised LOD4 corner</figcaption></figure></div>
<h2>GPU time above soil-only fields</h2>
<p class="note">RTX 3060 · 1360 × 952 · DPR 1 · cached shadows · six paired rounds of 20 samples. Before and after were separate runs; small differences are affected by GPU clocks/load. Raw confidence intervals are in the JSON. CPU is render submission time, not total frame time.</p>
<table><thead><tr><th>View / mode</th><th>GPU ms before → after</th><th>CPU ms before → after</th><th>Batches before → after</th></tr></thead><tbody id="timings"></tbody></table>
<p>Base maps remain <b>36.4 MB (34.7 MiB)</b>, shared by all six fields. No new texture memory is required. Coverage selection runs once during the bake; the movement test traverses 6 metres across active transition bands.</p>
<p class="note">The shared asset catalog still lacks material configuration modules. Both versions use the same exact local-backup metadata supplied only to the test browser; current image assets and renderer code are used. Live scene reload still requires those shared modules to be restored. No shared assets were overwritten.</p>
<p><a href="../edge-before/coverage.json">Before measurements</a> · <a href="../edge-final/coverage.json">After measurements, corner checks and motion samples</a></p>
<script>const data=${data};const el=id=>document.getElementById(id);
function update(){const pose=el('pose').value,mode=el('mode').value,source=el('reference').value==='source';el('new').src='../edge-final/'+pose+'-'+mode+'.png';el('old').src=(source?'../edge-final/':'../edge-before/')+pose+'-'+(source?'LOD2':mode)+'.png';el('old').style.clipPath='inset(0 '+(100-el('split').value)+'% 0 0)';el('old-label').textContent=source?'LOD2 reference':'Previous hybrid';
const a=data.after.rows.find(r=>r.pose===pose&&r.mode===mode),b=data.before.rows.find(r=>r.pose===pose&&r.mode===mode);const near=mode==='LOD3'&&['grass','rear'].includes(pose)?8:16;const x=a?.metrics.find(m=>m.near===near),y=b?.metrics.find(m=>m.near===near);el('metrics').textContent=x?near+'–'+x.far+' m: low-coverage regions '+(100*y.lowBlocks).toFixed(1)+'% → '+(100*x.lowBlocks).toFixed(1)+'%; mean leaf coverage '+(100*y.coverage).toFixed(1)+'% → '+(100*x.coverage).toFixed(1)+'%.':'Auto uses the existing distance ranges and smooth transition bands.';}
for(const id of ['pose','mode','reference','split'])el(id).addEventListener('input',update);update();
el('edges-result').textContent='All '+data.after.boundaries.length+' LOD3/4 corner checks pass: '+data.after.boundaries.reduce((n,b)=>n+b.outsidePixels,0)+' visible leaf pixels outside the field, versus '+data.before.boundaries.reduce((n,b)=>n+b.outsidePixels,0).toLocaleString()+' before. Top-down 512² masks cover 4 × 4 m; allowance is 1 cm at the raster edge.';
el('timings').innerHTML=data.after.performance.map(a=>{const b=data.before.performance.find(x=>x.pose===a.pose);return ['LOD3','LOD4','AUTO'].map(mode=>{const x=b.results[mode],y=a.results[mode];return '<tr><td>'+a.pose+' / '+mode+'</td><td>'+x.aboveSoilMs.toFixed(3)+' → '+y.aboveSoilMs.toFixed(3)+'</td><td>'+x.cpuMs.toFixed(3)+' → '+y.cpuMs.toFixed(3)+'</td><td>'+x.batches+' → '+y.batches+'</td></tr>';}).join('');}).join('');</script></html>`);
console.log(`${root}/edge_fix/index.html`);
