// Build a local comparison from the deterministic lighting captures and paired GPU timings.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lighting');
const measurements=JSON.parse(await readFile(path.join(root,'measurements.json'),'utf8'));
const benchmark=JSON.parse(await readFile(path.join(root,'benchmark.json'),'utf8'));
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const statistics=[];
for(const distance of [14,18,24])for(const candidate of ['old','updated']){
    const pairs=measurements.rows.filter(r=>r.candidate===candidate&&r.lod===3).map(row=>[
        row.sections.find(s=>s.distance===distance),measurements.rows.find(r=>r.candidate===candidate&&r.bearing===row.bearing&&r.lod===4).sections.find(s=>s.distance===distance)]);
    statistics.push({distance,candidate,contrast:mean(pairs.map(([a,b])=>Math.abs(a.gradient-b.gradient))),
        leaf:mean(pairs.flatMap(([a,b])=>a.leafLinear.map((v,i)=>Math.abs(b.leafLinear[i]/v-1))))*100,
        coverage:100*mean(pairs.map(([a,b])=>Math.abs(a.coverage-b.coverage))),
        rgb:Math.sqrt(mean(pairs.flatMap(([a,b])=>a.rgb.map((v,i)=>(v-b.rgb[i])**2))))});
}
const sun=measurements.lighting.actual;
const rows=statistics.map(s=>`<tr><td>${s.distance} m</td><td>${s.candidate==='old'?'Previous':'Updated'}</td><td>${s.rgb.toFixed(2)}</td><td>${s.coverage.toFixed(2)} pp</td><td>${s.contrast.toFixed(2)}</td><td>${s.leaf.toFixed(2)}%</td></tr>`).join('');
const timings=Object.entries(benchmark.poses).map(([pose,r])=>`<tr><td>${pose}</td><td>${r.old.mean.toFixed(3)} ± ${r.old.ci95.toFixed(3)}</td><td>${r.updated.mean.toFixed(3)} ± ${r.updated.ci95.toFixed(3)}</td><td>${r.saved.mean.toFixed(3)} ± ${r.saved.ci95.toFixed(3)}</td></tr>`).join('');
await writeFile(path.join(root,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grass transition lighting</title>
<style>body{font:16px system-ui;color:#e5eee5;background:#14201b;margin:24px auto;padding:0 20px;max-width:1600px}h1{font-size:28px}p{max-width:1100px;line-height:1.6}a{color:#bedfa3}label{display:inline-flex;align-items:center;gap:10px;margin:10px 25px 14px 0}select,input,button{font:inherit}table{border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:9px 20px;border-bottom:1px solid #425448}#compare{position:relative}#compare img{display:block;width:100%}#after{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.tag{position:absolute;top:110px;padding:10px;background:#14201bcc}#old-tag{left:15px}#new-tag{right:15px}.controls{position:sticky;top:0;background:#14201bf5;z-index:2}</style>
<h1>Grass transition lighting · game sun</h1>
<p>The existing light and silhouette filtering now runs across the selected LOD3 range (5–18 m by default, 2.5–9 m for half distances). LOD4 coverage follows the compressed leaf volume. LOD switches remain abrupt. No new texture samples, textures, draw calls or render passes; the canopy coverage adjustment adds only scalar arithmetic.</p>
<p>Both captures use the game lighting to isolate the material change: azimuth 45°, elevation 55°, sun intensity ${sun.sunIntensity.toFixed(3)}, linear RGB [${sun.sunColorLinear.map(n=>n.toFixed(4)).join(', ')}], exposure ${sun.exposure.toFixed(5)}, hemisphere fill ${sun.hemisphereIntensity}, environment ${sun.environmentId}. The old asset's extra hemisphere fill of 12 is removed. Runtime settings use the same resolvers as the game.</p>
<div class="controls"><label>Camera bearing <select id="bearing">${[0,45,90,135,180,225,270,315].map(n=>`<option value="${n}"${n===45?' selected':''}>${n}°</option>`).join('')}</select></label><label>Before / after <input id="split" type="range" min="0" max="100" value="50"></label><a href="/debug_tools/grass_transition_scene.html?revision=transition-lighting-1#front">Open live scene</a></div>
<div id="compare"><img id="before" alt="Previous material response"><img id="after" alt="Updated material response"><span class="tag" id="old-tag">Previous</span><span class="tag" id="new-tag">Updated</span></div>
<p><strong>Remaining limit:</strong> a flat canopy still differs from leaf geometry in silhouette and parallax. This improves the color, coverage and contrast match; it does not make an abrupt geometric switch invisible.</p>
<h2>Multi-angle check</h2><p>32 bearings at the gameplay bus height and tilt; identical 3 × 3 m patches at 14, 18 and 24 m. Sixteen intermediate bearings were held out from tuning. RGB is the patch-mean difference in display values (0–255); coverage uses a separate material-mask pass. Contrast is the mean absolute difference in adjacent-pixel luminance gradients. Leaf lighting is measured in linear diffuse radiance normalized by coverage, with litter excluded. The existing leaf base-color multiplier [1.04, 1.03, 1.02] corrects the small remaining energy deficit without changing litter. <a href="measurements.json">Raw measurements</a> also retain strict pure-pixel samples; those select different subsets of leaves in geometric and filtered representations and are not the calibration average. Lower differences are better.</p>
<table><thead><tr><th>Distance</th><th>Materials</th><th>RGB RMS gap</th><th>Leaf coverage gap</th><th>Contrast gap</th><th>Leaf-light gap</th></tr></thead><tbody>${rows}</tbody></table>
<h2>GPU milliseconds above soil-only</h2><p>${benchmark.metadata.renderer}. 1920 × 1080, DPR 1, switches 1 / 2 / 5 / 18 m. ${benchmark.metadata.method} Values show paired round means ± 95% confidence intervals. Front/rear changes are within measurement uncertainty; no reliable regression was measured. Texture residency is unchanged. <a href="benchmark.json">Raw benchmark</a>.</p>
<table><thead><tr><th>Pose</th><th>Previous</th><th>Updated</th><th>Saved</th></tr></thead><tbody>${timings}</tbody></table>
<script>const bearing=document.querySelector('#bearing'),split=document.querySelector('#split');function update(){document.querySelector('#before').src='old_'+bearing.value+'_transition.png';document.querySelector('#after').src='updated_'+bearing.value+'_transition.png';document.querySelector('#after').style.clipPath='inset(0 0 0 '+split.value+'%)';}bearing.onchange=update;split.oninput=update;update();</script></html>`);
console.log(path.join(root,'index.html'));
