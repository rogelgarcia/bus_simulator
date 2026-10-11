// Present matched static and moving-camera captures for the detailed grass transition bands.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = 'tests/artifacts/screens/grass_debug_v2/blend_motion';
const versions = await Promise.all(['before', 'after'].map(async name => JSON.parse(await readFile(`${root}/${name}/results.json`, 'utf8'))));
const mean = (data, key) => data.samples.reduce((sum, row) => sum + row.draw[key], 0) / data.samples.length;
const counts = versions.map(data => ({ triangles: Math.round(mean(data, 'triangles')).toLocaleString('en-US'), calls: mean(data, 'calls').toFixed(1) }));
const [lab, narrow] = await Promise.all(['lab', 'lab_narrow'].map(async name => JSON.parse(await readFile(`${root}/${name}/results.json`, 'utf8'))));
const coverage = lab.rows.filter(row => row.lod === 'AUTO').map(row => {
    const endpoints = ['LOD4', 'LOD5'].map(lod => lab.rows.find(other => other.pose === row.pose && other.lod === lod));
    endpoints.forEach(endpoint => assert.deepEqual(endpoint.bins, narrow.rows.find(other => other.pose === endpoint.pose && other.lod === endpoint.lod).bins));
    const bins = row.bins.flatMap((bin, i) => bin.pixels > 100 ? [{
        lumaRatio: bin.luma / Math.min(...endpoints.map(endpoint => endpoint.bins[i].luma)),
        extraDark: bin.dark - Math.max(...endpoints.map(endpoint => endpoint.bins[i].dark))
    }] : []);
    const result = { pose: row.pose, minLumaRatio: Math.min(...bins.map(bin => bin.lumaRatio)), maxExtraDark: Math.max(...bins.map(bin => bin.extraDark)) };
    assert.ok(result.minLumaRatio > .98, `${row.pose}: no dark stripe below either endpoint`);
    assert.ok(result.maxExtraDark <= .02, `${row.pose}: no new coverage holes`);
    return result;
});
await writeFile(`${root}/coverage-validation.json`, JSON.stringify({ coverage, endpointsUnchanged: true,
    knownFailure: 'Historical endpoint palette/detail gate fails identically at both widths: 3.544 luma difference at bus_19m_front; LOD5 detail ratio 0.78–0.81 versus 0.90 target.' }, null, 2));
await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grass transition bands</title><style>
body{margin:24px;background:#132119;color:#e4ebdf;font:17px system-ui}main{max-width:1600px;margin:auto}h1{font-size:26px}
label{display:inline-flex;align-items:center;gap:12px;margin:0 20px 16px 0}select,button{font:inherit;color:inherit;background:#293e2b;border:1px solid #829377;padding:10px}a{color:#bdd795}
.comparison{position:relative;width:100%;aspect-ratio:1040/752;background:#0b130d;overflow:hidden}.comparison img{position:absolute;width:100%;height:100%;object-fit:contain}
#before{clip-path:inset(0 50% 0 0)}#line{position:absolute;left:50%;top:0;bottom:0;border-left:1px solid white}.tag{position:absolute;top:16px;background:#132119d9;padding:10px}.right{right:16px}.left{left:16px}
table{border-collapse:collapse;margin:16px 0}th,td{padding:8px 20px 8px 0;text-align:left}p{max-width:1100px;line-height:1.5}
</style><main><h1>Grass transition bands</h1>
<p>The same opaque dissolve now spreads the distant handoffs over 14.24–20, 27–30 and 37–40 metres. Switch distances, shaders, colors and selection frequency are unchanged.</p>
<label>View <select id="view"><option value="grass">Along the grass</option><option value="overview">Overview</option><option value="bus">Bus</option><option value="motion-20">Moving: +3 m</option><option value="motion-40">Moving: +6 m</option><option value="motion-60">Moving: +9 m</option><option value="motion-80">Moving: +12 m</option></select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div class="comparison"><img id="after" src="after/grass.png" alt="Wider transition bands"><img id="before" src="before/grass.png" alt="Previous narrow transition bands"><div id="line"></div><span class="tag left">Before · 10% bands</span><span class="tag right">After · 30% bands</span></div>
<table><tr><th>12 m flight average</th><th>Before</th><th>After</th></tr><tr><td>Submitted triangles</td><td>${counts[0].triangles}</td><td>${counts[1].triangles}</td></tr><tr><td>Draw calls</td><td>${counts[0].calls}</td><td>${counts[1].calls}</td></tr></table>
<p>Both runs used 17 selection scans over 80 moving-camera frames. Forcing a fresh selection changed fewer than 0.007% of pixels by more than eight RGB levels. Wider overlap costs about 8.8% more submitted triangles on this flight; these counts are not a GPU timing benchmark.</p>
<p>Four nine-field views pass the coverage checks: the blend introduces no dark stripe or extra holes. The older endpoint appearance test still fails identically with both band widths: LOD5 has a 3.54-level brightness mismatch in one view and less fine contrast than LOD4. The wider fade does not change those endpoint materials.</p>
<p><a href="/debug_tools/grass_debug_v2.html?grass=baked&revision=bus-blend-12">Open the updated bus scene</a> · <a href="/debug_tools/grass_baked_lighting_scene.html?appearance=detailed&shelter=0&strategy=baked&lod=AUTO&revision=bus-blend-12">Open the nine-field LOD scene</a></p>
<script>
const view=document.getElementById('view'),split=document.getElementById('split'),before=document.getElementById('before'),after=document.getElementById('after');
view.onchange=()=>{before.src='before/'+view.value+'.png';after.src='after/'+view.value+'.png';};
split.oninput=()=>{before.style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';document.getElementById('line').style.left=split.value+'%';};
</script></main></html>`);
console.log(`${root}/index.html`);
