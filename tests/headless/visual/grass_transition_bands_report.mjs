// Publish paired static/moving views and soil-relative timings for spatial LOD bands.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/bands');
const visual = JSON.parse(await readFile(path.join(root, 'visual.json'), 'utf8'));
const benchmark = JSON.parse(await readFile(path.join(root, 'benchmark.json'), 'utf8'));
const bearings = visual.rows.filter(r => r.fraction === .5).map(r => r.bearing);
const mean = numbers => numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
const timing = Object.values(benchmark.comparisons).map(r => {
    const saved = r.results.band.savedFromAbruptGpu;
    return `<tr><td>${r.pose}</td><td>${r.results.abrupt.aboveSoilGpu.averageMs.toFixed(3)}</td><td>${r.results.band.aboveSoilGpu.averageMs.toFixed(3)}</td><td>${saved.averageMs.toFixed(3)} ± ${((saved.ci95Ms[1] - saved.ci95Ms[0]) / 2).toFixed(3)}</td><td>${r.captures.abrupt.draw.calls} → ${r.captures.band.draw.calls}</td></tr>`;
}).join('');
const cpu = ['oldGates', 'abrupt', 'band'].map(version => {
    const rows = benchmark.cpuMotion.filter(r => r.version === version);
    const sum = key => mean(rows.map(r => r[key]));
    return `<tr><td>${{ oldGates: 'Abrupt, 100 ms / 0.25 m', abrupt: 'Abrupt, 50 ms / 0.2 m', band: '50% band, 50 ms / 0.2 m' }[version]}</td><td>${sum('scans').toFixed(0)}</td><td>${sum('selectionCpuMs').toFixed(2)}</td><td>${sum('batchCpuMs').toFixed(2)}</td><td>${((sum('selectionCpuMs') + sum('batchCpuMs')) / 60).toFixed(3)}</td></tr>`;
}).join('');
const motion = visual.motion.map(r => {
    const changes = r.frames.filter(f => f.scanned);
    return `<tr><td>${r.pose}</td><td>${r.fraction ? '50% band' : 'Abrupt'}</td><td>${changes.length}</td><td>${r.frames.reduce((n,f)=>n+f.changed,0)}</td><td>${Math.max(...changes.map(f=>f.largestCluster))}</td><td>${mean(changes.map(f=>f.largestCluster)).toFixed(2)}</td></tr>`;
}).join('');
await writeFile(path.join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grass transition bands</title>
<style>body{font:16px system-ui;background:#14201b;color:#e5eee5;max-width:1600px;margin:24px auto;padding:0 20px}p{max-width:1150px;line-height:1.6}a{color:#bedfa3}table{border-collapse:collapse;margin:20px 0}th,td{padding:9px 18px;text-align:left;border-bottom:1px solid #425448}label{display:inline-flex;gap:10px;align-items:center;margin:10px 20px 12px 0}select,input,button{font:inherit}button{padding:5px 15px}.controls{position:sticky;top:0;background:#14201bf5;z-index:2}#compare{position:relative;overflow:hidden}#compare img{display:block;width:100%}#after{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.tag{position:absolute;top:12px;padding:10px;background:#14201bcc}#old-tag{left:15px}#new-tag{right:15px}#compare.focus{aspect-ratio:40/9}#compare.focus img{position:absolute;inset:auto;top:-116.6667%;left:0}#helpers{width:min(100%,850px)}[hidden]{display:none!important}</style>
<h1>Grass transitions over the last 50% of each range</h1>
<p>LOD3→LOD4 spreads across <strong>11.5–18 m</strong>. The other bands are 0.5–1 m, 1.5–2 m, and 3.5–5 m. A fixed world-space rank gives each 1 m patch a switch distance inside its band. A smoothstep distribution changes the proportion gradually at each end; ranks do not change as the camera moves or rotates.</p>
<p>Each patch keeps one opaque LOD and one ground surface. There is no extra shader, opacity fade, duplicate LOD draw or texture. This breaks up the continuous transition ring, but it is a spatial mixture: individual 1 m patch switches and silhouette differences remain visible in some views. Earlier use of LOD4 trades some leaf geometry for lower cost.</p>
<div class="controls"><label>View <select id="view">${bearings.map(n=>`<option value="${n}"${n===225?' selected':''}>Bus bearing ${n}°</option>`).join('')}<option value="front">Moving · front</option><option value="rear">Moving · rear</option></select></label><label>Before / after <input id="split" type="range" min="0" max="100" value="50"></label><label><input id="focus" type="checkbox" checked> Focus on band</label><span id="motion-controls" hidden><button id="play">Play</button><label>Position <input id="frame" type="range" min="0" max="19" step="1" value="0"><output id="distance"></output></label></span><a href="/debug_tools/grass_transition_scene.html?revision=transition-band-1#front">Live scene</a></div>
<div id="compare" class="focus"><img id="before" alt="Abrupt distance switches"><img id="after" alt="Stable patch transitions over half of each range"><span class="tag" id="old-tag">Abrupt</span><span class="tag" id="new-tag">50% band</span></div>
<p>Eight bearings at the same bus height and tilt. Moving views cover a 6 m straight drive at 3 m/s, sampled every six simulated 60 Hz frames (10 images/s). Both use 50 ms / 0.2 m gates. Playback exposes patch changes; it is not a frame-rate benchmark. <a href="visual.json">Raw visual and movement checks</a>.</p>
<h2>GPU cost above soil-only</h2><p>${benchmark.metadata.renderer}; 1920 × 1080, DPR 1. ${benchmark.metadata.method} Helpers are excluded. Texture allocation stays at 78.29 MB. More edge shapes increase draw calls, while earlier LOD4 selection lowers submitted triangles. <a href="benchmark.json">Raw timing data</a>.</p>
<table><tr><th>Pose</th><th>Abrupt, ms</th><th>50% band, ms</th><th>Saving ± 95% CI, ms</th><th>Draw calls</th></tr>${timing}</table>
<h2>CPU selection and batch updates</h2><p>Mean of three real production drives, 60 frames and 3 m each, with both movement and elapsed-time gates. Selection uses precomputed squared switch distances: no square roots, random generation or easing calculation in the scan. No shadow regeneration occurs. Stationary rendering performs no selection scans or instance uploads.</p>
<table><tr><th>Configuration</th><th>Scans</th><th>Selection total, ms</th><th>Batch total, ms</th><th>Combined per frame, ms</th></tr>${cpu}</table>
<h2>Change grouping during motion</h2><p>Each 120-frame drive changes approximately the same number of cells overall. The band spreads simultaneous changes apart. Cluster size counts side-connected changed cells across the whole map; it is a structural metric, not a perceptual quality score.</p>
<table><tr><th>Pose</th><th>Mode</th><th>Scans</th><th>Changed cells</th><th>Largest cluster</th><th>Mean largest cluster per scan</th></tr>${motion}</table>
<h2>Controls and limits</h2><p>Set Transition band to 0% to restore abrupt switching; the full/half presets also scale the band starts. Dashed helper rings mark starts, solid rings mark ends. CPU switch storage adds about 160 KiB for 4,096 patches. Existing edge/corner geometry and instance buffers are cached as new arrangements appear. This pass changes only the transition lab.</p><img id="helpers" src="helpers.png" alt="Overhead LOD colors with dashed band starts and solid distance limits">
<script>
const view=document.querySelector('#view'),split=document.querySelector('#split'),focus=document.querySelector('#focus'),frame=document.querySelector('#frame'),play=document.querySelector('#play');let interval=null;
function stop(){clearInterval(interval);interval=null;play.textContent='Play';}
function update(){const moving=['front','rear'].includes(view.value);document.querySelector('#motion-controls').hidden=!moving;document.querySelector('#before').src=moving?'motion_'+view.value+'_abrupt_'+(frame.value*6)+'.jpg':'abrupt_'+view.value+'.png';document.querySelector('#after').src=moving?'motion_'+view.value+'_band_'+(frame.value*6)+'.jpg':'band_'+view.value+'.png';document.querySelector('#after').style.clipPath='inset(0 0 0 '+split.value+'%)';document.querySelector('#compare').classList.toggle('focus',focus.checked);document.querySelector('#distance').textContent=(.05+.3*frame.value).toFixed(2)+' m';}
view.onchange=()=>{stop();update();};split.oninput=update;focus.onchange=update;frame.oninput=()=>{stop();update();};play.onclick=()=>{if(interval){stop();return;}play.textContent='Pause';interval=setInterval(()=>{frame.value=(Number(frame.value)+1)%20;update();},100);};update();
</script></html>`);
console.log(path.join(root, 'index.html'));
