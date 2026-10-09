// Present matched card-only, sparse-base, and LOD2 captures with paired GPU costs.
import { readFile, writeFile } from 'node:fs/promises';
const root = 'tests/artifacts/screens/grass_debug_v2/card_coverage';
const before = JSON.parse(await readFile(`${root}/before/coverage.json`, 'utf8'));
const after = JSON.parse(await readFile(`${root}/final/coverage.json`, 'utf8'));
const data = JSON.stringify({ before, after }).replaceAll('<', '\\u003c');
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Grass · sparse base + cards</title>
<style>body{background:#15231c;color:#ebf0e9;font:16px system-ui;margin:24px;max-width:1500px}h1{font-size:26px}p{max-width:1000px;line-height:1.5}select,input{font:inherit}label{display:inline-flex;align-items:center;gap:10px;margin:8px 22px 16px 0}select{padding:6px;background:#263a2e;color:inherit;border:1px solid #809780;border-radius:5px}.image{position:relative;width:100%;aspect-ratio:1360/952;background:#101812}.image img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.tag{position:absolute;top:12px;background:#15231ce8;padding:8px 12px}.left{left:12px}.right{right:12px}table{border-collapse:collapse;margin:18px 0}th,td{padding:9px 20px 9px 0;text-align:left;border-bottom:1px solid #47604d}.note{color:#becabd}a{color:#c6e397}.metric{padding:14px;background:#23382b;border-radius:6px;margin:18px 0}</style>
<h1>Sparse grass base + cards</h1>
<p>A 45% shoot subset supplies continuous grass and litter beneath the cards. LOD3 uses 12 cards/m² instead of 20; LOD4 uses 3 instead of 4, with deeper captures and irregular placement. The full LOD5 texture is unchanged.</p>
<p><a href="../../../../../debug_tools/grass_debug_v2.html?revision=card-base-1">Bus scene</a> · <a href="../../../../../debug_tools/grass_transition_scene.html?revision=card-base-1&lod3=cards#front">Transition lab</a></p>
<label>View <select id="pose"><option>bus</option><option>overview</option><option>grass</option><option>rear</option></select></label>
<label>Level <select id="mode"><option>LOD3</option><option>LOD4</option><option>AUTO</option></select></label>
<label>Reference <select id="reference"><option value="before">Previous cards</option><option value="source">LOD2</option></select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div class="image"><img id="new" alt="Sparse grass base and cards"><img id="old" alt="Comparison reference"><span class="tag left" id="old-label"></span><span class="tag right">New hybrid</span></div>
<div class="metric" id="metrics"></div>
<h2>GPU time above soil-only fields</h2><p class="note">RTX 3060 · 1360 × 952 · DPR 1 · six paired rounds of 20 samples · cached shadows. Each cell is previous → hybrid milliseconds. LOD4 and Auto confidence intervals overlap; their small changes are inconclusive.</p>
<table><thead><tr><th>View</th><th>LOD3</th><th>LOD4</th><th>Auto</th></tr></thead><tbody id="timings"></tbody></table>
<p>Two shared 1K base tiles add <b>36.4 MB (34.7 MiB)</b>, including mipmaps. They replace the litter floor in pure card cells. The existing transition shader exchanges identical base pixels at the LOD3/4 handoff; no new shader operations were added.</p>
<p class="note">Limits: the base fills gaps but cannot supply parallax. Wide cards can still look grouped outside their intended distance, and the far LOD5 is flatter. Material configuration files were supplied from a local backup for both versions because 72 modules were missing from the shared asset catalog. Images and renderer code came from the current workspace.</p>
<p><a href="before/coverage.json">Previous measurements</a> · <a href="final/coverage.json">Hybrid measurements and confidence intervals</a></p>
<script>const data=${data};const byId=id=>document.getElementById(id);const modes=['LOD3','LOD4','AUTO'];
function update(){const pose=byId('pose').value,mode=byId('mode').value,source=byId('reference').value==='source';byId('new').src='final/'+pose+'-'+mode+'.png';byId('old').src=(source?'final/':'before/')+pose+'-'+(source?'LOD2':mode)+'.png';byId('old').style.clipPath='inset(0 '+(100-byId('split').value)+'% 0 0)';byId('old-label').textContent=source?'LOD2 reference':'Previous cards';
const a=data.after.rows.find(r=>r.pose===pose&&r.mode===mode),b=data.before.rows.find(r=>r.pose===pose&&r.mode===mode),ref=data.after.rows.find(r=>r.pose===pose&&r.mode==='LOD2');byId('metrics').textContent=a?a.metrics.filter(x=>mode==='LOD3'?x.near<16:x.near===16).map(x=>{const old=b.metrics.find(y=>y.near===x.near),r=ref.metrics.find(y=>y.near===x.near);return x.near+'–'+x.far+' m leaf coverage: '+(old.coverage*100).toFixed(1)+'% → '+(x.coverage*100).toFixed(1)+'% (LOD2 '+(r.coverage*100).toFixed(1)+'%)';}).join(' · ')||'Forced-level comparison outside its intended distance; see along-grass and rear views for the near range.':'Auto: 0.6 / 0.8 / 1 / 16 / 32 m switches, existing 50% transition bands.';}
for(const id of ['pose','mode','reference','split'])byId(id).addEventListener('input',update);update();
byId('timings').innerHTML=data.after.performance.map(a=>{const b=data.before.performance.find(x=>x.pose===a.pose);return '<tr><td>'+a.pose+'</td>'+modes.map(mode=>'<td>'+b.results[mode].aboveSoilMs.toFixed(3)+' → '+a.results[mode].aboveSoilMs.toFixed(3)+'</td>').join('')+'</tr>';}).join('');</script></html>`);
console.log(`${root}/index.html`);
