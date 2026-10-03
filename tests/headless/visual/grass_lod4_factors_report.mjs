// Build a three-pose visual and GPU-cost comparison from the hardware factor experiment.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeGrassLod4FactorsReport(output, report) {
    const { metadata, poses } = report;
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const signed = value => (value > 0 ? '+' : '') + value.toFixed(3);
    const metric = value => `${signed(value.averageMs)} <small>[${value.ci95Ms.map(signed).join(', ')}]</small>`;
    const rows = Object.entries(metadata.cases).map(([id, spec]) => `<tr><th>${escape(spec.label)}<small>Compared with: ${escape(metadata.cases[spec.reference].label)}</small></th>${Object.values(poses).map(pose => {
        const value = pose.results[id];
        return `<td>${metric(value.aboveSoilGpu)}<small>Factor Δ: ${metric(value.effectGpu)}</small><small>${value.draw.triangles.toLocaleString()} triangles · ${value.draw.calls} draws</small></td>`;
    }).join('')}</tr>`).join('');
    const options = Object.entries(metadata.cases).map(([id, spec]) => `<option value="${id}">${escape(spec.label)}</option>`).join('');
    const relativeRoot = path.relative(output, process.cwd()).replaceAll('\\', '/');
    await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOD4 · elevation, side grass and shadows</title>
<style>body{background:#15231c;color:#e4eada;font:16px/1.5 system-ui;margin:24px}h1{margin-bottom:8px}p{max-width:1150px}a{color:#c0df91}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #526153;padding:12px}td{white-space:nowrap}small{display:block;font-size:12px;color:#b8c6b7}th{font-weight:500}select,input{font:inherit}label{display:inline-block;margin:10px 18px 10px 0}.comparison{position:relative;aspect-ratio:16/9;background:black}.comparison img{width:100%;height:100%;position:absolute;inset:0}.comparison #candidate{clip-path:inset(0 50% 0 0)}.captions{display:flex;justify-content:space-between}code{color:#c0df91}.scroll{overflow:auto}</style>
<h1>LOD4: elevation, side grass and shadows</h1><p>${escape(metadata.renderer)} · ${metadata.viewport.join(' × ')} · DPR ${metadata.pixelRatio} · ${metadata.rounds} rounds × ${metadata.samples} samples per case and pose.</p>
<p><strong>All main values are GPU milliseconds above matched soil-only.</strong> Brackets show 95% confidence intervals across round means. Factor Δ is the raw paired GPU difference from the named reference. Negative means cheaper. Shadow-disabled cases use shadow-disabled soil; raw totals, CPU submission, and baseline-adjusted factor effects are in <a href="benchmark.json">benchmark.json</a>.</p>
<p><a href="${relativeRoot}/debug_tools/grass_transition_scene.html?configuration=lod4-elevated-sides&revision=lod4-factors-1#front">Open live controls</a>. The production shadow fix retains baked grass self-shadows. Compiled shader equivalence allows at most one 8-bit output level in fewer than 0.01% of pixels; measured counts are retained in the JSON. Scene shadows are cached; zero shadow-map draws occur in measured frames. Disabling scene shadows removes receiving/sampling work, not a per-frame map regeneration.</p>
<label>Pose <select id="pose">${Object.keys(poses).map(pose => `<option>${pose}</option>`).join('')}</select></label>
<label>Left <select id="left">${options}</select></label><label>Right <select id="right">${options}</select></label>
<label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
<div class="captions"><strong id="leftLabel"></strong><strong id="rightLabel"></strong></div><div class="comparison"><img id="reference" alt="Right comparison"><img id="candidate" alt="Left comparison"></div>
<div class="scroll"><table><thead><tr><th>Configuration / paired reference</th>${Object.keys(poses).map(pose => `<th>${pose} · ms above soil</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p><strong>Factor definitions:</strong> Ground vs raised uses the same two-triangle cell at 0 vs 10 cm. Grid adds tessellation at unchanged height and material. Bevel adds the production vertex ramp on the same 32-triangle grid. Side grass adds real border leaves within 35 m; 200 m retains every border. The flat elevated quad intentionally has open edges and is a timing control. No soil is drawn underneath any canopy case.</p>
<p><strong>Shadow definitions:</strong> “Baked off” removes only the repeating tile visibility sample. “Scene off” disables shadow receiving on soil/paths/side leaves while keeping tile visibility. “All off” disables renderer shadow mapping and tile visibility. It retains authored albedo and ambient occlusion. No-shadow cases change appearance.</p>
<p>${escape(metadata.method)} GPU clocks and desktop load are not locked. Results from different runs should not be subtracted. Independent feature deltas are not an exact additive stage breakdown.</p>
<script>const labels=${JSON.stringify(Object.fromEntries(Object.entries(metadata.cases).map(([id, spec]) => [id, spec.label])))};const byId=id=>document.getElementById(id);byId('left').value='side35';byId('right').value='bevel';function update(){const pose=byId('pose').value;byId('candidate').src=pose+'_'+byId('left').value+'.png';byId('reference').src=pose+'_'+byId('right').value+'.png';byId('candidate').style.clipPath='inset(0 '+(100-byId('split').value)+'% 0 0)';byId('leftLabel').textContent=labels[byId('left').value];byId('rightLabel').textContent=labels[byId('right').value];}for(const id of ['pose','left','right','split'])byId(id).addEventListener('input',update);update();</script></html>`);
}
