// Presents matched camera captures and paired GPU costs above the soil-only baseline.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatMs = value => Number.isFinite(value) ? value.toFixed(3) : '—';
const interval = summary => summary ? `${formatMs(summary.averageMs)} [${formatMs(summary.ci95Ms[0])}, ${formatMs(summary.ci95Ms[1])}]` : '—';
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

export async function writeGrassTransitionReport(output, report) {
    const { metadata, poses, errors } = report;
    const names = Object.keys(poses);
    const rows = names.flatMap(pose => ['full', 'half'].map(treatment => {
        const result = poses[pose].results[treatment];
        return `<tr><td>${escapeHtml(pose)}</td><td>${treatment === 'full' ? 'Requested ranges' : 'Half ranges'}</td><td>${interval(poses[pose].results.soil.totalGpu)}</td><td>${interval(result.totalGpu)}</td><td><strong>${interval(result.aboveSoilGpu)}</strong></td><td>${formatMs(result.gpuSamples.p99Ms)}</td><td>${interval(result.totalCpu)}</td><td>${interval(result.aboveSoilCpu)}</td></tr>`;
    })).join('');
    const counterRows = names.flatMap(pose => ['full', 'half'].map(treatment => {
        const blocks = poses[pose].blocks.filter(block => block.treatment === treatment);
        const counters = Object.keys(blocks[0]?.selectionDelta || {}).filter(key => /scans|checks|skip|chang|cpu|calls|update|distance|evaluat|pass|visited/i.test(key));
        const application = ['calls', 'instanceUploads', 'totalCpuMs'].map(key => `field ${key}: ${formatMs(average(blocks.map(block => block.applicationDelta[key])))}`);
        return `<tr><td>${escapeHtml(pose)}</td><td>${treatment}</td><td>${[...counters.map(key => `${escapeHtml(key)}: ${formatMs(average(blocks.map(block => block.selectionDelta[key])))}`), ...application].join(' · ')}</td></tr>`;
    })).join('');
    const cpuRows = ['full', 'half'].flatMap(treatment => ['cached', 'every-frame'].map(policy => {
        const blocks = (policy === 'cached' ? poses.moving_border.blocks : report.cpuReference).filter(block => block.treatment === treatment);
        const perFrame = key => average(blocks.map(block => block[key].totalCpuMs / metadata.sampleFrames));
        return `<tr><td>${treatment}</td><td>${policy}</td><td>${formatMs(average(blocks.map(block => block.selectionDelta.scans)))}</td><td>${formatMs(perFrame('selectionDelta'))}</td><td>${formatMs(perFrame('applicationDelta'))}</td><td>${formatMs(average(blocks.map(block => average(block.cpu))))}</td></tr>`;
    })).join('');
    const captures = names.filter(name => poses[name].captures?.full);
    await writeFile(path.join(output, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grass transition lab benchmark</title>
<style>
body{max-width:1700px;margin:24px auto;padding:0 24px;background:#17231d;color:#eaf1e9;font:16px/1.5 system-ui}h1{font-size:30px;margin-bottom:6px}a{color:#c3e6a5}p{max-width:1250px}.note{color:#bdcdbf}.scroll{overflow:auto}table{border-collapse:collapse;margin:20px 0;width:100%}th,td{padding:9px 12px;border-bottom:1px solid #496051;text-align:right;white-space:nowrap}th:first-child,td:first-child,td:nth-child(2){text-align:left}select,input{font:inherit}.controls{display:flex;gap:24px;flex-wrap:wrap;align-items:center;margin:20px 0}.controls label{display:flex;gap:8px;align-items:center}.compare{position:relative;line-height:0}.compare img{display:block;width:100%}.overlay{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}.tag{position:absolute;top:28%;padding:9px 14px;line-height:1.4;background:#122a1fe8}.right{right:0}.divider{position:absolute;top:26%;bottom:0;left:50%;border-left:2px solid #ffffff80;pointer-events:none}details{margin:24px 0}code{color:#c3e6a5}.counter td:last-child{white-space:normal;text-align:left}
</style>
<h1>Grass transition lab</h1>
<p>Four large neighboring fields use abrupt distance switches between LOD0–LOD4. Requested cutoffs are <strong>1 / 3 / 6 / 25 m</strong>; the half-range comparison uses <strong>0.5 / 1.5 / 3 / 12.5 m</strong>. LOD1 therefore includes the user's 2 m example. Distance is measured horizontally so camera height does not exclude the close LODs.</p>
<p>The principal result is <strong>GPU milliseconds above soil only</strong>, paired against the soil block in the same round at the same camera. Total frame GPU cost is retained for context. ${metadata.rounds} rotated rounds per case, ${metadata.warmupFrames} warm-up frames and ${metadata.sampleFrames} measured frames per block. No samples or outliers are removed.</p>
${metadata.startupSoakFrames ? `<p class="note">Startup stabilization: before any timed blocks, all three treatments at all three camera poses render for ${metadata.startupSoakFrames} untimed frames each. ${metadata.initialRun ? `<a href="${escapeHtml(metadata.initialRun)}">The complete earlier run without this initial soak</a> is retained: its first soil block caused a broad front-view confidence interval. Both datasets retain every measured sample.` : ''}</p>` : ''}
<div class="scroll"><table><thead><tr><th>Camera / path</th><th>Ranges</th><th>Soil GPU ms [95% CI]</th><th>Total GPU ms [95% CI]</th><th>Above soil GPU ms [95% CI]</th><th>Total GPU P99</th><th>CPU submit ms [95% CI]</th><th>CPU above soil ms [95% CI]</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="note">Estimated confidence intervals use the six round means as the statistical units (Student t), not the correlated individual frame samples. A GPU delta is the difference of paired round means; its P99 cannot be inferred by subtracting frame percentiles. CPU submit time is synchronous scene update and render submission, not GPU execution or frame interval. Negative differences within an interval crossing zero are measurement noise.</p>
<h2>Matching views</h2>
<p>Every measured pose keeps the bus camera height at ${escapeHtml(metadata.settings.cameraHeight)} m and downward tilt at ${formatMs(metadata.settings.cameraPitch)}°. Front and rear change viewing direction; the border view crosses the lane between fields. Screenshot HUD timings are live readings; use the table above for the paired benchmark results.</p>
<div class="controls"><label>Pose <select id="pose">${captures.map(pose => `<option>${escapeHtml(pose)}</option>`).join('')}</select></label><label>Left <select id="left"><option value="full">Requested ranges</option><option value="half">Half ranges</option><option value="soil">Soil only</option><option value="helpers">LOD helpers</option></select></label><label>Right <select id="right"><option value="half">Half ranges</option><option value="full">Requested ranges</option><option value="soil">Soil only</option><option value="helpers">LOD helpers</option></select></label><label>Split <input id="split" aria-label="Comparison split" type="range" min="0" max="100" value="50"></label></div>
<div class="compare"><img id="rightImage" alt="Right treatment"><div class="overlay" id="overlay"><img id="leftImage" alt="Left treatment"></div><span class="tag" id="leftLabel"></span><span class="tag right" id="rightLabel"></span><span class="divider" id="divider"></span></div>
<h2>Selection work</h2><p>Per-block cumulative selector counters, averaged across rounds (${metadata.sampleFrames} frames each). Stationary selection should avoid repeated scans. The moving path translates 3 m at constant bus height and tilt; controls and selection settings are unchanged. Helper rendering is disabled for every timing block.</p>
<div class="scroll"><table class="counter"><tr><th>Camera / path</th><th>Ranges</th><th>Mean counter increments per block</th></tr>${counterRows}</table></div>
<h2>CPU reference: recalculating every frame</h2><p>The same 3 m moving path is also measured with movement and interval thresholds both set to zero. Each policy has six blocks; this separate reference reports descriptive means, without claiming a paired confidence interval. Scan CPU measures distance classification; field CPU includes membership rebuilding and instance-buffer preparation. Both costs are amortized over all 60 rendered frames.</p>
<div class="scroll"><table><tr><th>Ranges</th><th>Selection policy</th><th>Scans / 60 frames</th><th>Scan CPU ms/frame</th><th>Field apply CPU ms/frame</th><th>Total submit CPU ms/frame</th></tr>${cpuRows}</table></div>
<details><summary>Configuration and limits</summary><p>${escapeHtml(metadata.renderer)} · ${escapeHtml(metadata.browser)} · ${metadata.viewport.join(' × ')} · DPR ${metadata.pixelRatio} · ${escapeHtml(metadata.date)}</p><p>${escapeHtml(metadata.description)}</p><p>Shader compilation, texture preparation and initial shadow-cache creation are excluded by warm-up. Cached shadow sampling and post-processing remain included. This is a local desktop run; GPU clocks and other applications' GPU work are not locked. Rotated blocks and paired soil costs limit drift but do not remove that uncertainty. Results are specific to this GPU, viewport, field layout and camera path, not a guaranteed game-frame budget.</p><pre>${escapeHtml(JSON.stringify(metadata.settings, null, 2))}</pre><p>Browser errors: ${errors.length}</p></details>
<p><a href="benchmark.json">Raw samples, counters and configuration</a> · <a href="/debug_tools/grass_transition_scene.html">Open transition scene</a></p>
<script>
const pose=document.querySelector('#pose'),left=document.querySelector('#left'),right=document.querySelector('#right'),split=document.querySelector('#split');
const names={full:'Requested ranges',half:'Half ranges',soil:'Soil only',helpers:'LOD helpers'};
function update(){document.querySelector('#leftImage').src=pose.value+'_'+left.value+'.png';document.querySelector('#rightImage').src=pose.value+'_'+right.value+'.png';document.querySelector('#leftLabel').textContent=names[left.value];document.querySelector('#rightLabel').textContent=names[right.value];document.querySelector('#overlay').style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';document.querySelector('#divider').style.left=split.value+'%';}
pose.onchange=left.onchange=right.onchange=split.oninput=update;update();
</script></html>`);
}
