// Human-readable matched-range results, with immutable run folders and latest-first history.
import { readFile, writeFile } from 'node:fs/promises';

const ms = value => value.toFixed(3), signed = value => (value >= 0 ? '+' : '−') + ms(Math.abs(value));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function pair(run, lod) {
    const before = run.results.find(row => row.strategy === 'current' && row.lod === lod);
    const after = run.results.find(row => row.strategy === 'baked' && row.lod === lod);
    const differences = run.measurements.filter(row => row.strategy === 'baked' && row.lod === lod).map(row =>
        row.gpuMs - run.measurements.find(other => other.strategy === 'current' && other.lod === lod && other.round === row.round).gpuMs);
    return { before, after, delta: after.gpuMs - before.gpuMs, low: Math.min(...differences), high: Math.max(...differences) };
}
function timingRow(run, lod, label) {
    const { before, after, delta, low, high } = pair(run, lod);
    return `<tr><th>${escape(label)}</th><td>${ms(before.soilGpuMs)}</td><td>${signed(before.aboveSoilMs)}</td><td>${ms(before.gpuMs)}</td><td>${signed(after.aboveSoilMs)}</td><td>${ms(after.gpuMs)}</td><td class="${high < 0 ? 'faster' : low > 0 ? 'slower' : ''}">${signed(delta)} (${(delta / before.gpuMs * 100).toFixed(1)}%)</td><td>${signed(low)}…${signed(high)}</td></tr>`;
}
const timingHead = '<thead><tr><th>View / LOD</th><th>Soil ms</th><th>Original + grass</th><th>Original total</th><th>V10 + grass</th><th>V10 total</th><th>V10 − original</th><th>Paired Δ range</th></tr></thead>';

export async function writeGrassBakedMatchedBenchmarkReport(output, data) {
    let history = [];
    try { history = JSON.parse(await readFile(`${output}/history.json`, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    history = [{ id: data.id, timestamp: data.timestamp, poses: data.runs.length }, ...history.filter(run => run.id !== data.id)];
    await writeFile(`${output}/history.json`, JSON.stringify(history, null, 2));
    const root = '/' + output, runs = data.runs;
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Original bus grass vs baked v10</title><style>
*{box-sizing:border-box}body{margin:0;background:#17231c;color:#edf4e7;font:15px system-ui}main{max-width:1480px;padding:24px;margin:auto}h1{font-size:28px}h2{font-size:21px;margin-top:30px}p{line-height:1.55;max-width:1100px}a{color:#c1e695}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:10px 8px;border-bottom:1px solid #405044;white-space:nowrap}th:first-child,td:first-child{text-align:left}thead{background:#263c2d}tr:nth-child(even){background:#1d2d22}.scroll{overflow-x:auto}.note{color:#bdcbbb}.faster{color:#a5d895}.slower{color:#ffc699}details{margin:20px 0}summary{cursor:pointer;font-weight:600}.pictures{display:grid;grid-template-columns:1fr 1fr;gap:10px}img{width:100%}figure{margin:0}figcaption{padding:8px 0}nav{display:flex;flex-wrap:wrap;gap:18px}</style>
<main><h1>Original bus grass vs baked v10</h1><nav><a href="${root}/${data.id}/results.json">Raw samples and settings</a><a href="/tests/artifacts/screens/grass_debug_v2/baked_lighting/consistency/index.html?revision=lod-canopy-detail-10">Visual LOD comparison</a><a href="/debug_tools/grass_baked_lighting_scene.html?appearance=detailed&amp;shelter=0">Live comparison</a></nav>
<p><strong>Same distance switches: 0.6 / 0.8 / 20 / 30 / 40 m.</strong> LOD2 reaches 20 m, LOD3 covers 20–30 m, LOD4 30–40 m, and LOD5 beyond 40 m. Both strategies share one selector, 10% blend bands, 35 m side-leaf cutoff, and 50 ms / 0.2 m update caching. Matched LOD assignments and blend candidates are checked for every measured block.</p>
<p><strong>Before:</strong> the original lit leaves, 12/m² LOD3 cards, 6/m² LOD4 cards and LOD5 canopy used by the bus scene. <strong>After:</strong> detailed canopy v10, with baked leaf/root colors, reduced individual blades at LOD3/4, and the corrected LOD5 filtering. This measures the complete strategies, including changed geometry and filtering. The baked version still executes shaders for drawing, texture sampling, fog, blending and cached external shadows; it removes live grass lighting calculations.</p>
<p class="note">${escape(data.hardware.renderer)} · 1360 × 900 · DPR ${data.hardware.pixelRatio} · MSAA ${data.hardware.antialias ? 'on' : 'off'} · 9 × 12 × 12 m fields. Same soil, sky, camera, game sun and exposure. No roof/posts, bus or trees are drawn here, so these are grass-system measurements in the shared lab, not whole bus-scene frame times.</p>
<h2>Automatic distance LODs</h2><p>Soil baseline + grass overhead = total GPU milliseconds. A negative V10 − original value is faster. The range shows all six paired round differences.</p>
<div class="scroll"><table data-summary="AUTO">${timingHead}<tbody>${runs.map(run => timingRow(run, 'AUTO', run.pose)).join('')}</tbody></table></div>
<h2>AUTO geometry and CPU submission</h2><div class="scroll"><table><thead><tr><th>View</th><th>Original triangles</th><th>V10 triangles</th><th>Draw calls old / new</th><th>CPU ms old / new</th><th>CPU above soil old / new</th><th>Selected cells L0…L5</th></tr></thead><tbody>${runs.map(run => {
        const { before, after } = pair(run, 'AUTO'), measurement = run.measurements.find(row => row.lod === 'AUTO' && row.strategy === 'baked');
        return `<tr><th>${run.pose}</th><td>${before.draw.triangles.toLocaleString('en-US')}</td><td>${after.draw.triangles.toLocaleString('en-US')}</td><td>${before.draw.calls} / ${after.draw.calls}</td><td>${ms(before.cpuMs)} / ${ms(after.cpuMs)}</td><td>${signed(before.aboveSoilCpuMs)} / ${signed(after.aboveSoilCpuMs)}</td><td>${measurement.levels.join(' / ')}</td></tr>`;
    }).join('')}</tbody></table></div>
<h2>Forced LODs</h2><p>Each level covers all nine fields, so these rows isolate representation costs. They do not describe the normal distance mix. Forced levels omit side fringes; AUTO uses the same distance-limited fringes for both strategies.</p>
${runs.map(run => `<details open><summary>${run.pose}</summary><div class="scroll"><table>${timingHead}<tbody>${['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5'].map(lod => timingRow(run, lod, lod)).join('')}</tbody></table></div><details><summary>Matched AUTO renders</summary><div class="pictures">${['current', 'baked'].map(strategy => `<figure><img src="${root}/${data.id}/${run.pose}-${strategy}.png" alt="${strategy} ${run.pose}"><figcaption>${strategy === 'current' ? 'Original bus grass' : 'Baked v10'}</figcaption></figure>`).join('')}</div></details></details>`).join('')}
<h2>Protocol and limits</h2><p>Six rounds, 96 GPU samples per measured configuration per round. All shaders and textures are prewarmed before timing. Each level measures soil/original/v10 in all six possible orders; level order alternates. Four separately timed renders are submitted per animation frame. These are milliseconds per render under sustained load, not game FPS. CPU is submission time, not total game CPU. Shadow generation, source captures and texture preparation are excluded.</p>
<p>GPU timer disjoints and incomplete blocks fail the run. Desktop load and GPU clocks are not locked. Inspect round ranges before interpreting small differences. Grass can measure cheaper than soil because the material work differs; large baseline drift also makes small overhead differences unreliable. Both systems remain loaded, so this test does not compare total GPU memory residency.</p>
<div class="scroll"><table><thead><tr><th>View</th><th>Soil block range ms</th><th>Samples per version / LOD</th><th>Timer disjoints</th></tr></thead><tbody>${runs.map(run => {
        const soil = run.measurements.filter(row => row.lod === 'OFF').map(row => row.gpuMs);
        return `<tr><th>${run.pose}</th><td>${ms(Math.min(...soil))}…${ms(Math.max(...soil))}</td><td>${run.results.find(row => row.lod === 'AUTO').samples}</td><td>${run.gpu.disjointCount}</td></tr>`;
    }).join('')}</tbody></table></div>
<h2>Runs, newest first</h2><ul>${history.map(run => `<li><a href="${root}/${run.id}/index.html">${escape(run.timestamp)}</a> · ${run.poses} views</li>`).join('')}</ul></main></html>`;
    await writeFile(`${output}/index.html`, html);
    await writeFile(`${output}/${data.id}/index.html`, html);
}
