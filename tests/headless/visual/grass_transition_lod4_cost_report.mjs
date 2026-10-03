// Keep diagnostic material swaps separate from the unchanged scene's visual output.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeGrassTransitionLod4CostReport(output, report) {
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const number = value => value.toFixed(3);
    const interval = summary => summary.ci95Ms.map(number).join(' to ');
    const rows = Object.entries(report.poses).map(([pose, { results }]) => `<tr><th>${escape(pose)}</th>
        <td>${number(results.soil.totalGpu.averageMs)}</td>
        ${['lod4', 'single_scale', 'soil_shader'].map(treatment => `<td title="95% interval: ${interval(results[treatment].aboveSoilGpu)} ms">${number(results[treatment].aboveSoilGpu.averageMs)}</td>`).join('')}
        <td>${results.lod4.draw.triangles.toLocaleString('en-US')} / ${results.soil.draw.triangles.toLocaleString('en-US')}</td>
        <td>${results.lod4.draw.calls} / ${results.soil.draw.calls}</td></tr>`).join('');
    const captures = Object.entries(report.poses).map(([pose, { captures }]) => `<details><summary>${escape(pose)} — captures and audit</summary>
        <p>${captures.lod4.invalidGroundCells} cells with duplicate/missing ground; ${captures.lod4.shadowDraws} shadow-map draws in the audited steady frame.</p>
        <div class="images">${Object.entries(report.metadata.treatments).map(([treatment, description]) => `<figure>
        <figcaption><b>${escape(treatment)}</b> · ${escape(description)}</figcaption>
        <a href="${pose}_${treatment}.png"><img loading="lazy" src="${pose}_${treatment}.png" alt="${escape(pose + ' ' + description)}"></a>
        </figure>`).join('')}</div></details>`).join('');
    await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1"><title>LOD4 cost audit</title>
        <style>body{font:16px/1.5 system-ui,sans-serif;background:#15221b;color:#e6eee7;max-width:1300px;margin:32px auto;padding:0 24px}
        a{color:#c2e795}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid #526759}
        .scroll{overflow:auto}details{border-top:1px solid #526759;margin-top:24px;padding-top:16px}summary{cursor:pointer;font-size:20px}
        .images{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:20px}figure{margin:12px 0}img{width:100%;height:auto}figcaption{min-height:3em}</style>
        </head><body><h1>LOD4 cost audit</h1>
        <p>The screenshot configuration uses 0.1 / 0.2 / 0.3 / 0.4 m switches, the half preset, and a fixed 5 m side-leaf cutoff. Helpers are off.</p>
        <p><b>No duplicate ground layers or alpha blending on the canopy.</b> The front view submits 4,095 canopy cells, each with 32 triangles. The nearby LOD0 cell and fringe batches are outside that camera's frustum. Shadows stay cached.</p>
        <p>The material substitution saves about 1.7–2.1 ms with the same instance/triangle counts. This points to material shading as the main added cost. Disabling only the distance texture-scale blend has no measurable benefit in these views. These substitutions are diagnostics, not visual changes to the scene.</p>
        <div class="scroll"><table><thead><tr><th>Bus view</th><th>Soil total (ms)</th><th>LOD4 extra (ms)</th><th>Single-scale extra (ms)</th><th>Soil shader extra (ms)</th><th>Triangles LOD4 / soil</th><th>Draws LOD4 / soil</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p>All “extra” columns subtract the matching soil-only round. Hover over a value for its 95% interval. The soil-shader diagnostic retains the canopy geometry/instances, but does not apply its vertex bevel. It is not a pure measurement of geometry alone.</p>
        <p>${escape(report.metadata.renderer)} · ${report.metadata.viewport.join(' × ')} · DPR ${report.metadata.pixelRatio} · ${escape(report.metadata.date)}</p>
        <p>${escape(report.metadata.method)} Desktop GPU load and clocks were not locked; front-view timings show noticeable variation. The shader comparison is stronger than small differences between cases.</p>
        <p><a href="benchmark.json">Raw samples and draw audit</a> · <a href="../../../../../../debug_tools/grass_transition_scene.html?revision=transition-draw-count-1#front">Transition scene</a></p>
        ${captures}</body></html>`);
}
