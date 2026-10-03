// Present independent flat-canopy ablations with paired confidence intervals and visual evidence.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeGrassLod4DecompositionReport(output, report) {
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const number = value => value.toFixed(3);
    const ci = value => value.ci95Ms.map(number).join(' … ');
    const scenePath = path.relative(output, path.resolve('debug_tools/grass_transition_scene.html')).replaceAll('\\', '/');
    const initialCase = Object.hasOwn(report.metadata.cases, 'aniso4') ? 'aniso4' : 'baked_only';
    const readOptional = async name => {
        try { return JSON.parse(await readFile(path.join(output, name), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    const [followup, imageCheck] = await Promise.all([readOptional('visibility_followup/benchmark.json'), readOptional('visibility_followup/image_equivalence.json')]);
    const followupHtml = followup ? `<h2>Shadow-path follow-up</h2><p>This variant keeps tile self-shadows but compiles out the white external-shadow lookup and unused live-shadow branch. It applies to this scene with no external occluders.</p>
        <table><thead><tr><th>Bus view</th><th>Saved vs full (ms)</th><th>Above soil (ms)</th><th>Changed scene pixels</th></tr></thead><tbody>
        ${Object.entries(followup.poses).map(([pose, value]) => `<tr><th>${pose}</th><td>${number(value.results.baked_only.savedGpu.averageMs)} [${ci(value.results.baked_only.savedGpu)}]</td><td>${number(value.results.baked_only.aboveSoilGpu.averageMs)}</td><td>${imageCheck ? imageCheck.poses[pose].changedPixels + ' / ' + imageCheck.poses[pose].comparedPixels.toLocaleString('en-US') : 'Not measured'}</td></tr>`).join('')}</tbody></table>
        <p>Image comparison excludes the controls and live telemetry. <a href="visibility_followup/index.html">Follow-up captures and timings</a> · <a href="visibility_followup/image_equivalence.json">Pixel comparison</a>. Follow-up measured ${escape(followup.metadata.date)}. This fast path is experimental; the configuration keeps the full reference shader.</p>` : '';
    const sections = Object.entries(report.poses).map(([pose, { results }]) => `<section><h2>${escape(pose)}</h2><div class="scroll"><table><thead><tr>
        <th>Experiment</th><th>Total GPU ms</th><th>Above soil ms</th><th>Saved vs full ms [95% interval]</th><th>Triangles / draws</th><th>Capture</th></tr></thead><tbody>
        ${Object.entries(results).map(([id, value]) => `<tr><th>${escape(report.metadata.cases[id])}</th><td>${number(value.totalGpu.averageMs)}</td>
        <td>${number(value.aboveSoilGpu.averageMs)}</td><td>${number(value.savedGpu.averageMs)} [${ci(value.savedGpu)}]</td>
        <td>${value.draw.triangles.toLocaleString('en-US')} / ${value.draw.calls}</td><td><a href="${pose}_${id}.png">View</a></td></tr>`).join('')}</tbody></table></div></section>`).join('');
    await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Flat LOD4 decomposition</title><style>body{font:16px/1.5 system-ui;background:#15221b;color:#e6eee7;max-width:1450px;margin:32px auto;padding:0 24px}a{color:#c2e795}
        table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px;border-bottom:1px solid #526759}th{max-width:480px}.scroll{overflow:auto}
        select{padding:8px;font:inherit;margin:10px}img{width:100%}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}h2{margin-top:32px}</style></head><body>
        <h1>Flat LOD4: where the GPU time goes</h1><p><a href="${scenePath}?configuration=lod4-flat&revision=lod4-decomposition-1#front">Open LOD4-only configuration</a> · <a href="benchmark.json">All samples and draw audits</a></p>
        <p>Four 32 × 32 m fields. Every cell is LOD4, with a flat horizontal top and no wall, bevel, fringe or geometric leaves. Normal cases have 2 triangles per 1 m cell; the grid control has 32 flat triangles per cell. Both use identical materials and UVs. Soil below the canopy is absent.</p>
        <p>The top remains at its existing height. Open gaps at its perimeter are expected in this diagnostic because the sides have been removed. Switching back to Distance LODs restores the normal field geometry.</p>
        <p>Positive “saved” values mean the diagnostic was faster than full LOD4. Each shader experiment removes one feature from the complete material. Savings overlap through shared computations and compiler elimination; <b>do not add them together</b>. Flat-normal sampling retains alpha coverage, and roughness RGB channels also store litter color, so simply removing those textures would confound multiple features.</p>
        <p>${escape(report.metadata.renderer)} · ${report.metadata.viewport.join(' × ')} · DPR ${report.metadata.pixelRatio} · ${escape(report.metadata.date)}.<br>Original anisotropy: ${escape(JSON.stringify(report.metadata.anisotropy))}.</p>
        <p>${escape(report.metadata.method)} GPU clocks and other desktop activity are not locked. Confidence intervals describe the six measured blocks, not universal hardware guarantees.</p>
        ${followupHtml}
        <label>Pose <select id="pose">${Object.keys(report.poses).map(pose => `<option>${pose}</option>`).join('')}</select></label>
        <label>Compare with full LOD4 <select id="case">${Object.entries(report.metadata.cases).map(([id, label]) => `<option value="${id}">${escape(label)}</option>`).join('')}</select></label>
        <div class="compare"><figure><figcaption>Full LOD4</figcaption><img id="reference" alt="Full LOD4"></figure><figure><figcaption id="caption"></figcaption><img id="variant" alt="Diagnostic variant"></figure></div>
        ${sections}<script>const pose=document.querySelector('#pose'),variant=document.querySelector('#case');function update(){document.querySelector('#reference').src=pose.value+'_full.png';document.querySelector('#variant').src=pose.value+'_'+variant.value+'.png';document.querySelector('#caption').textContent=variant.selectedOptions[0].textContent;}pose.onchange=variant.onchange=update;variant.value=${JSON.stringify(initialCase)};update();</script></body></html>`);
}
