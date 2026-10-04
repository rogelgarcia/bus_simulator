// Build the before/after evidence for the canopy corner geometry repair.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/boundary');
const measurements = JSON.parse(await readFile(path.join(root, 'measurements.json'), 'utf8'));
const benchmark = JSON.parse(await readFile(path.join(root, 'benchmark.json'), 'utf8'));
const bearings = measurements.rows.filter(row => row.candidate === 'updated').map(row => row.bearing);
const timing = Object.entries(benchmark.poses).map(([pose, r]) => `<tr><td>${pose}</td><td>${r.old.mean.toFixed(3)}</td><td>${r.updated.mean.toFixed(3)}</td><td>${r.saved.mean.toFixed(3)} ± ${r.saved.ci95.toFixed(3)}</td><td>${r.draws.old.calls} → ${r.draws.updated.calls}</td></tr>`).join('');
const seams = bearings.map(bearing => {
    const before = measurements.rows.find(r => r.bearing === bearing && r.candidate === 'old');
    const after = measurements.rows.find(r => r.bearing === bearing && r.candidate === 'updated');
    return `<tr><td>${bearing}°</td><td>${before.crackedEdges}</td><td>${after.crackedEdges}</td><td>${after.sharedEdges}</td></tr>`;
}).join('');
await writeFile(path.join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grass canopy corner repair</title>
<style>body{font:16px system-ui;color:#e5eee5;background:#14201b;margin:24px auto;padding:0 20px;max-width:1600px}p{max-width:1100px;line-height:1.6}a{color:#bedfa3}label{display:inline-flex;align-items:center;gap:10px;margin:10px 25px 14px 0}select,input{font:inherit}table{border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:9px 20px;border-bottom:1px solid #425448}#compare{position:relative;overflow:hidden}#compare img{display:block;width:100%}#after{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.tag{position:absolute;top:12px;padding:10px;background:#14201bcc}#old-tag{left:15px}#new-tag{right:15px}.controls{position:sticky;top:0;background:#14201bf5;z-index:2}#compare.focus{aspect-ratio:40/9}#compare.focus img{position:absolute;inset:auto;top:-116.6667%;left:0}</style>
<h1>Closing the dark gaps at LOD corners</h1>
<p>The old ramp considered only four neighboring cells. At a diagonal LOD boundary, one tile could end at 5 mm while its neighbor stayed at 100 mm, opening a tiny triangular hole. The new corner pieces share matching heights with all neighboring tiles. Their positions are built once and cached by edge/corner shape.</p>
<p>No shader changes, new textures, lighting adjustments, extra passes or transition fades. The existing grass/litter maps continue across the repaired surface. The comparison keeps the same sun, material settings, 4× filtering, bus height and tilt, and 1 / 2 / 5 / 18 m switches.</p>
<div class="controls"><label>Bearing <select id="bearing">${bearings.map(n => `<option value="${n}"${n === 225 ? ' selected' : ''}>${n}°</option>`).join('')}</select></label><label>Before / after <input id="split" type="range" min="0" max="100" value="50"></label><label><input id="focus" type="checkbox" checked> Focus on join</label><a href="/debug_tools/grass_transition_scene.html?revision=transition-corners-1#front">Live scene</a></div>
<div id="compare" class="focus"><img id="before" alt="Previous canopy boundary"><img id="after" alt="Repaired canopy boundary"><span class="tag" id="old-tag">Previous</span><span class="tag" id="new-tag">Repaired</span></div>
<p>The dark corner gaps are removed. The flat canopy still has less parallax and fine silhouette detail than real leaves, so this is a local seam repair, not an invisible LOD switch from every possible viewpoint.</p>
<h2>Geometry continuity</h2><p>All shared LOD4 edges are checked at the union of both meshes’ edge vertices. The largest old height disagreement was 95 mm; all repaired edges agree within 0.01 mm. The retained grid path reproduces the same original corner defect for this visual comparison. <a href="measurements.json">Raw measurements</a>.</p>
<table><tr><th>Bearing</th><th>Old open seams</th><th>Repaired open seams</th><th>Shared edges checked</th></tr>${seams}</table>
<h2>GPU milliseconds above soil-only</h2><p>${benchmark.metadata.renderer}; 1920 × 1080, DPR 1. Timing compares the previous simple strips (reconstructed with their original batching, material and per-instance ramp data) with the repaired corners. ${benchmark.metadata.method} The savings column includes a 95% confidence interval; front and border differences are within uncertainty. No performance regression is demonstrated. <a href="benchmark.json">Raw benchmark</a>.</p>
<table><tr><th>Pose</th><th>Previous strips</th><th>Repaired corners</th><th>Saving ± 95% CI</th><th>Draw calls</th></tr>${timing}</table>
<p>Texture allocation is unchanged. Stationary checks make no instance uploads. The 120-frame movement check performs ${measurements.motion?.scans ?? '—'} selection scans with no shadow regeneration.</p>
<script>const bearing=document.querySelector('#bearing'),split=document.querySelector('#split'),focus=document.querySelector('#focus');function update(){document.querySelector('#before').src='old_'+bearing.value+'.png';document.querySelector('#after').src='updated_'+bearing.value+'.png';document.querySelector('#after').style.clipPath='inset(0 0 0 '+split.value+'%)';document.querySelector('#compare').classList.toggle('focus',focus.checked);}bearing.onchange=update;split.oninput=update;focus.onchange=update;update();</script></html>`);
console.log(path.join(root, 'index.html'));
