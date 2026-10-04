// Publish paired moving views and soil-relative timings for per-patch blending.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/blending');
const visual = JSON.parse(await readFile(path.join(root, 'visual.json'), 'utf8'));
const benchmark = JSON.parse(await readFile(path.join(root, 'benchmark.json'), 'utf8'));
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const timing = Object.values(benchmark.comparisons).map(row => {
    const added = row.results.blend.addedToPatchesGpu;
    return `<tr><td>${row.pose}</td>${['abrupt','patches','blend'].map(v=>`<td>${row.results[v].aboveSoilGpu.averageMs.toFixed(3)}</td>`).join('')}<td>${added.averageMs.toFixed(3)} ± ${((added.ci95Ms[1]-added.ci95Ms[0])/2).toFixed(3)}</td><td>${row.captures.patches.draw.calls} / ${row.captures.blend.draw.calls}</td></tr>`;
}).join('');
const cpu = ['abrupt','patches','blend'].map(version => {
    const rows = benchmark.cpuMotion.filter(r => r.version === version);
    return `<tr><td>${version}</td><td>${mean(rows.map(r=>r.scans)).toFixed(1)}</td><td>${mean(rows.map(r=>r.selectionCpuMs)).toFixed(2)}</td><td>${mean(rows.map(r=>r.batchCpuMs)).toFixed(2)}</td><td>${mean(rows.map(r=>(r.selectionCpuMs+r.batchCpuMs)/60)).toFixed(3)}</td></tr>`;
}).join('');
const motion = ['front','rear'].map(pose => {
    const pixels = mode => visual.motion.find(r=>r.pose===pose&&r.mode===mode).frames.reduce((sum,f)=>sum+(f.rebuildChangedPixels||0),0);
    return `<tr><td>${pose}</td><td>${pixels('patches').toLocaleString('en-US')}</td><td>${pixels('blend').toLocaleString('en-US')}</td><td>${(100*(1-pixels('blend')/pixels('patches'))).toFixed(1)}%</td></tr>`;
}).join('');
await writeFile(path.join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grass patch blending</title>
<style>body{font:16px system-ui;background:#14201b;color:#e5eee5;max-width:1600px;margin:24px auto;padding:0 20px}p{max-width:1150px;line-height:1.6}a{color:#bedfa3}table{border-collapse:collapse;margin:20px 0}th,td{padding:9px 18px;text-align:left;border-bottom:1px solid #425448}label{display:inline-flex;gap:10px;align-items:center;margin:10px 20px 12px 0}select,input,button{font:inherit}button{padding:5px 15px}.controls{position:sticky;top:0;background:#14201bf5;z-index:2}#compare{position:relative;overflow:hidden}#compare img{display:block;width:100%}#after{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.tag{position:absolute;top:12px;padding:10px;background:#14201bcc}#old-tag{left:15px}#new-tag{right:15px}#compare.focus{aspect-ratio:40/9}#compare.focus img{position:absolute;inset:auto;top:-116.6667%;left:0}[hidden]{display:none!important}</style>
<h1>Blend within each grass patch</h1>
<p>LOD3 → LOD4 blends across <strong>11.5–18 m</strong>. Each patch progressively changes to the next LOD using complementary opaque pixel samples. The fade follows the camera every frame; CPU selection remains gated at 50 ms / 0.2 m. All four boundaries use the latter half of the preceding range.</p>
<p>Only patches in the band and its safety margin submit multiple LODs. Litter remains underneath the raised canopy to prevent holes at oblique angles. Texture maps and cached scene shadows are unchanged. Intermediate coverage has visible fine stippling; flat LOD4 still has less parallax. Blending costs more than whole-patch switching.</p>
<div class="controls"><label>View <select id="view"><option value="front">Moving · front</option><option value="rear">Moving · rear</option>${visual.rows.filter(r=>r.mode==='blend').map(r=>`<option value="${r.bearing}">Bus bearing ${r.bearing}°</option>`).join('')}</select></label><label>Before / after <input id="split" type="range" min="0" max="100" value="50"></label><label><input id="focus" type="checkbox" checked> Focus on band</label><span id="motion-controls"><button id="play">Play</button><label>Position <input id="frame" type="range" min="0" max="39" step="1" value="0"><output id="distance"></output></label></span><a href="/debug_tools/grass_transition_scene.html?revision=transition-blend-1#front">Live scene</a></div>
<div id="compare" class="focus"><img id="before" alt="Previous whole-patch switches"><img id="after" alt="Pixel blending inside each patch"><span class="tag" id="old-tag">Previous patches</span><span class="tag" id="new-tag">Pixel blend</span></div>
<p>Eight bearings at the same bus height/tilt. Moving views cover 6 m at 3 m/s, sampled every three simulated 60 Hz frames (20 images/s). Playback demonstrates the transition and is not a frame-rate benchmark.</p>
<h2>Changes caused by batch updates</h2><p>At 24 checkpoints per drive, render the same camera pose before and after refreshing cached batches. Count pixels changing by more than 3/255. This isolates update discontinuities from camera movement. It does not measure all visible aliasing. A separate GPU probe checks four LOD pairs, five fractions and both draw orders: no missing samples or order-dependent output. <a href="visual.json">Raw visual checks</a>.</p>
<table><tr><th>Drive</th><th>Previous patches, summed pixels</th><th>Blend, summed pixels</th><th>Reduction</th></tr>${motion}</table>
<h2>GPU milliseconds above soil-only</h2><p>${benchmark.metadata.renderer}; 1920 × 1080, DPR 1. ${benchmark.metadata.method} Texture maps remain at 78.29 MB; new material variants and instance buffers are cached. <a href="benchmark.json">Raw timings</a>.</p>
<table><tr><th>Pose</th><th>Abrupt</th><th>Previous patches</th><th>Pixel blend</th><th>Added vs patches ± 95% CI</th><th>Draw calls, patches / blend</th></tr>${timing}</table>
<h2>CPU selection and batch updates</h2><p>Mean of three real 60-frame, 3 m drives. Stationary timed blocks had no scans, uploads or shadow regeneration. The conservative 1.45 m candidate margin supports the maximum 25 m/s lab movement; teleports beyond it force a safety update.</p>
<table><tr><th>Method</th><th>Scans</th><th>Selection total, ms</th><th>Batch total, ms</th><th>Combined per frame, ms</th></tr>${cpu}</table>
<p>The Method control retains previous patch switches. Setting Transition band to 0% restores abrupt switching. Helpers show dominant LOD colors; the triangle counter includes both candidates where they overlap.</p>
<script>
const view=document.querySelector('#view'),split=document.querySelector('#split'),focus=document.querySelector('#focus'),frame=document.querySelector('#frame'),play=document.querySelector('#play');let interval=null;
function stop(){clearInterval(interval);interval=null;play.textContent='Play';}
function update(){const moving=['front','rear'].includes(view.value);document.querySelector('#motion-controls').hidden=!moving;document.querySelector('#before').src=moving?'motion_'+view.value+'_patches_'+(frame.value*3)+'.jpg':'patches_'+view.value+'.png';document.querySelector('#after').src=moving?'motion_'+view.value+'_blend_'+(frame.value*3)+'.jpg':'blend_'+view.value+'.png';document.querySelector('#after').style.clipPath='inset(0 0 0 '+split.value+'%)';document.querySelector('#compare').classList.toggle('focus',focus.checked);document.querySelector('#distance').textContent=(.05+.15*frame.value).toFixed(2)+' m';}
view.onchange=()=>{stop();update();};split.oninput=update;focus.onchange=update;frame.oninput=()=>{stop();update();};play.onclick=()=>{if(interval){stop();return;}play.textContent='Pause';interval=setInterval(()=>{frame.value=(Number(frame.value)+1)%40;update();},50);};update();
</script></html>`);
console.log(path.join(root, 'index.html'));
