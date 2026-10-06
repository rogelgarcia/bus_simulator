// Build the local before/after viewer from reproducible grass captures.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/card_continuity');
const capture = JSON.parse(await readFile(path.join(dir,'final.json'),'utf8'));
const motion = JSON.parse(await readFile(path.join(dir,'blending/visual.json'),'utf8'));
const foreground = capture.rows.filter(r=>['low','down'].includes(r.pose)&&r.mode==='blend').flatMap(row=>
    row.coverage.filter(b=>b.far<=2).map(b=>{
        const reference=capture.rows.find(r=>r.pose===row.pose&&r.mode==='lod2').coverage.find(c=>c.near===b.near);
        return `<tr><td>${row.pose}</td><td>${b.near}–${b.far} m</td><td>${(100*b.coverage).toFixed(1)}%</td><td>${(100*reference.coverage).toFixed(1)}%</td></tr>`;
    })).join('');
const updates=['front','rear'].map(pose=>{
    const count=mode=>motion.motion.find(r=>r.pose===pose&&r.mode===mode).frames.reduce((n,f)=>n+(f.rebuildChangedPixels||0),0);
    return `<tr><td>${pose}</td><td>${count('patches').toLocaleString()}</td><td>${count('blend').toLocaleString()}</td></tr>`;
}).join('');
await writeFile(path.join(dir,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grass card continuity</title><style>
body{font:16px/1.5 system-ui;color:#e4eddf;background:#16251e;margin:24px auto;padding:0 24px;max-width:1440px}h1{font-size:28px}h2{font-size:21px;margin-top:32px}p{max-width:1100px}a{color:#bcde91}label{display:inline-flex;gap:10px;align-items:center;margin:0 20px 14px 0}select{font:inherit;background:#263f30;color:inherit;padding:6px;border:1px solid #8fa582}input{width:220px}.compare{position:relative;aspect-ratio:14/11;overflow:hidden}.compare img{position:absolute;width:100%;height:100%}.after{clip-path:inset(0 50% 0 0)}.tag{position:absolute;top:8px;padding:8px 14px;background:#10261edb}.right{right:8px}.left{left:8px}table{border-collapse:collapse;max-width:850px;width:100%;margin:12px 0}th,td{text-align:left;padding:8px 16px;border-bottom:1px solid #49604b}.note{border-left:3px solid #b8d895;padding:12px;background:#263b2c}.motion{width:100%}</style>
<h1>Grass cards · coverage, placement and blending</h1>
<p>The fade follows rendered grass positions instead of whole metre cells. Cached selection includes card overhangs. World-seeded placement and varied card angles break up repeated rows; LOD4 captures a deeper source strip while keeping four 75 cm cards/m².</p>
<p><a href="/debug_tools/grass_transition_scene.html?revision=card-continuity-1&lod3=cards#front">Open the dynamic lab</a> · Distances remain 0.6 / 0.8 / 1 / 16 / 32 m.</p>
<h2>Matched before / after</h2>
<label>Pose <select id="pose"><option>front</option><option>rear</option><option>close</option><option>down</option><option>low</option></select></label>
<label>View <select id="mode"><option value="blend">Actual transitions</option><option value="lod3">Isolated LOD3</option><option value="lod4">Isolated LOD4</option></select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div class="compare"><img id="before"><img id="after" class="after"><span class="tag left">Updated</span><span class="tag right">Previous</span></div>
<p>Front/rear use bus height and pitch. Close and down keep the bus height with a steeper tilt; low uses a 65 cm camera. Isolated LOD4 intentionally shows its close-range limits: larger cards still form groups when used too close.</p>
<h2>Foreground coverage below 2 m</h2><table><thead><tr><th>Pose</th><th>Distance</th><th>Blend</th><th>LOD2 reference</th></tr></thead><tbody>${foreground}</tbody></table>
<p>Fixed green-pixel classifier, excluding litter and paths. These checks pass without a bare camera-centred hole. The exact camera pose in the user's screenshot was unavailable; initial static captures did not reproduce that large hole.</p>
<h2>Movement and cached selection</h2><table><thead><tr><th>Drive</th><th>Patch-switch changes</th><th>Blended changes</th></tr></thead><tbody>${updates}</tbody></table>
<p>Pixels changing by more than 3/255 when rebuilding at the same camera position, summed over 24 checkpoints during a 6 m drive. Over 99% fewer update discontinuities. This does not measure all camera-motion aliasing.</p>
<label>Drive <select id="drive"><option>front</option><option>rear</option></select></label><label>Frame <input id="frame" type="range" min="0" max="117" step="3" value="0"></label><img id="motion" class="motion">
<h2>Performance and memory</h2><p class="note">The paired GPU rerun was too variable to support a speed claim. GPU load remained 100% after the test exited. The unchanged canopy also varied substantially. Raw results are retained for inspection; do not compare these means with the prior run.</p>
<p>Texture memory is unchanged: 67.1 MB per card population including mipmaps. No extra fragment texture samples or runtime rebakes. Expanded cached support increases submitted geometry near bands; the extra work needs a quiet GPU benchmark.</p>
<p><a href="final.json">Capture measurements</a> · <a href="blending/visual.json">Motion checks</a> · <a href="performance/benchmark.json">Raw GPU run (inconclusive)</a></p>
<script>const $=id=>document.getElementById(id);function update(){const suffix=$('pose').value+'_'+$('mode').value+'.png';$('before').src='before_'+suffix;$('after').src='final_'+suffix;$('after').style.clipPath='inset(0 '+(100-$('split').value)+'% 0 0)';$('motion').src='blending/motion_'+$('drive').value+'_blend_'+$('frame').value+'.jpg';}document.querySelectorAll('input,select').forEach(e=>e.addEventListener('input',update));update();</script>`);
console.log(path.join(dir,'index.html'));
