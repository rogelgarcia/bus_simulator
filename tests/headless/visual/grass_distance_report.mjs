// Render the visual experiment's existing captures and measurements as a comparison page.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeGrassDistanceReport(output, { rows, timings, errors }) {
    const poses = [...new Set(rows.map(row => row.pose))];
    const average = values => values.reduce((a, b) => a + b, 0) / values.length;
    const metric = (pose, candidate, lod, key) => {
        const { sections } = rows.find(row => row.pose === pose && row.candidate === candidate && row.lod === lod);
        return sections.reduce((sum, section) => sum + section[key] * section.pixels, 0)
            / sections.reduce((sum, section) => sum + section.pixels, 0);
    };
    const gap = (group, candidate, key) => average(group.map(pose =>
        Math.abs(metric(pose, candidate, 'LOD3', key) - metric(pose, candidate, 'LOD4', key))));
    const summaries = [['Bus cameras', poses.filter(p => p.startsWith('bus'))], ['Independent bearings', poses.filter(p => p.startsWith('holdout'))]]
        .filter(([, group]) => group.length).map(([name, group]) => ({ name,
            contrastBefore: gap(group, 'baseline', 'gradient'), contrastAfter: gap(group, 'final', 'gradient'),
            highlightBefore: gap(group, 'baseline', 'q90'), highlightAfter: gap(group, 'final', 'q90') }));
    const gpu = [...new Set(timings.map(row => row.pose))].flatMap(pose => ['baseline', 'final'].map(candidate => ({ pose, candidate,
        values: ['LOD2', 'LOD3', 'LOD4'].map(lod => average(timings.filter(row => row.pose === pose && row.candidate === candidate && row.lod === lod).map(row => row.mean))) })));
    await writeFile(path.join(output, 'summary.json'), JSON.stringify({ summaries, gpu, errors }, null, 2));
    await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Grass LOD distance continuity</title>
<style>
body{margin:24px auto;max-width:1600px;padding:0 20px;background:#15211c;color:#e6ece6;font:16px/1.5 system-ui}
h1{font-size:28px;margin-bottom:8px}p{max-width:1100px}a{color:#c2e6a5}select,input{font:inherit;max-width:100%}
.controls{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin:20px 0}.controls label{display:flex;gap:8px;align-items:center}
.compare{position:relative;line-height:0}.compare img{display:block;width:100%}.overlay{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}
.tag{position:absolute;top:18%;background:#123d26e8;padding:10px 18px;line-height:1.3;pointer-events:none}.right{right:0}
.divider{position:absolute;top:17%;bottom:0;left:50%;border-left:2px solid #fff8;pointer-events:none}
table{border-collapse:collapse;margin-bottom:24px}td,th{padding:8px 16px;border-bottom:1px solid #4b6557;text-align:right}td:first-child,th:first-child{text-align:left}
.scroll{overflow-x:auto}.note{color:#b7cbbd}summary{cursor:pointer}code{color:#cce6b6}
</style>
<h1>Grass LOD distance continuity</h1>
<p>Lighting and apparent height change gradually from 8 to 30 m. Distant leaf highlights and fine shadow contrast soften; the tallest tips converge from 14.1 cm toward 11.1 cm. LOD4 gets a smaller correction focused on sun-facing grass. Roots, litter color, texture allocations and shadow caches are preserved.</p>
<div class="controls">
<label>Pose <select id="pose">${poses.map(p => '<option>' + p + '</option>').join('')}</select></label>
<label>Compare <select id="pair"><option value="3,4">LOD3 / LOD4</option><option value="2,4">LOD2 / LOD4</option><option value="2,3">LOD2 / LOD3</option><option value="before,2">LOD2 before / after</option><option value="before,3">LOD3 before / after</option><option value="before,4">LOD4 before / after</option></select></label>
<label>Treatment <select id="treatment"><option value="final">After</option><option value="baseline">Before</option></select></label>
<label>Split <input id="split" aria-label="Comparison split" type="range" min="0" max="100" value="50"></label></div>
<div class="compare"><img id="rightImage" alt="Right comparison"><div class="overlay" id="overlay"><img id="leftImage" alt="Left comparison"></div><span class="tag" id="leftLabel"></span><span class="tag right" id="rightLabel"></span><span class="divider" id="divider"></span></div>
<p><strong>Viewing setup:</strong> 1600 × 1000, nine fields, All mode, merged litter, LOD4 1K. Bus camera: 4.5 m height, 13.586° downward pitch, 55° FOV. Bus ranges are 14/19/24 m to the center field; holdouts are 19 m at eight bearings, with the same height and pitch. The in-image preset label is stale for custom holdout bearings; use the pose selector above.</p>
<p><strong>Remaining difference:</strong> LOD4 has a flat top and lacks leaf parallax. Close foreground grass and some side colors still differ; this improves distant continuity but does not eliminate every visible switch.</p>
<div class="scroll"><table><tr><th>Views</th><th>Fine-contrast gap before</th><th>After</th><th>Reduction</th><th>Highlight gap before</th><th>After</th></tr>
${summaries.map(s => '<tr><td>' + s.name + '</td><td>' + s.contrastBefore.toFixed(2) + '</td><td>' + s.contrastAfter.toFixed(2) + '</td><td>' + (100*(1-s.contrastAfter/s.contrastBefore)).toFixed(1) + '%</td><td>' + s.highlightBefore.toFixed(2) + '</td><td>' + s.highlightAfter.toFixed(2) + '</td></tr>').join('')}
</table></div>
<p class="note">Fine contrast is the mean neighboring-pixel luminance difference in eight fixed interior sections; highlights use the 90th percentile. These are image-structure measures, not a claim of equal grass color. Color is measured separately using rendered pure-grass masks, excluding soil/litter. Raw data includes coverage, grass RGB and section statistics.</p>
<div class="scroll"><table><tr><th>19 m pose</th><th>Shader</th><th>LOD2 GPU ms</th><th>LOD3 GPU ms</th><th>LOD4 GPU ms</th></tr>
${gpu.map(g => '<tr><td>'+g.pose+'</td><td>'+(g.candidate==='final'?'After':'Original')+'</td>'+g.values.map(v=>'<td>'+v.toFixed(2)+'</td>').join('')+'</tr>').join('')}</table></div>
<p class="note">Hardware GPU queries include post-processing. Three rotated LOD rounds, six batches of twelve renders per measurement; disjoint results are rejected. The original benchmark removes the new shader hooks. Timings vary; no overall speedup is claimed. No added texture/geometry allocation, capture or shadow redraw. The wider shadow filter uses the existing comparison taps.</p>
<p><a href="results.json">Raw measurements</a> · <a href="summary.json">Summary</a> · <a href="/debug_tools/grass_litter_scene.html?revision=lod-distance-1&lod=LOD2%2B3%2B4&fields=9#bus_19m_front">Open live LOD2+3+4 scene</a></p>
<script>
const pose=document.querySelector('#pose'),pair=document.querySelector('#pair'),treatment=document.querySelector('#treatment'),split=document.querySelector('#split');
function update(){const [a,b]=pair.value.split(','),before=a==='before';treatment.disabled=before;
const left=before?'LOD'+b:'LOD'+a,right='LOD'+b,lc=before?'baseline':treatment.value,rc=before?'final':treatment.value;
document.querySelector('#leftImage').src=pose.value+'_'+lc+'_'+left+'.png';document.querySelector('#rightImage').src=pose.value+'_'+rc+'_'+right+'.png';
document.querySelector('#leftLabel').textContent=left+' · '+(lc==='final'?'After':'Before');document.querySelector('#rightLabel').textContent=right+' · '+(rc==='final'?'After':'Before');
document.querySelector('#overlay').style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';document.querySelector('#divider').style.left=split.value+'%';}
pose.value='bus_19m_front';pose.onchange=pair.onchange=treatment.onchange=split.oninput=update;update();
</script></html>`);
}
