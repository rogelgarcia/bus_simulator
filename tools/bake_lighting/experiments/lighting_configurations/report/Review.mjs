// Describe measured diagnostics and their limits without inventing a realism score.
import {writeFile} from 'node:fs/promises';

export async function writeReview(file,{analyses,scene,lighting,counts,timings}) {
    const pilot=analyses.find(a=>a.quality==='pilot'),final=analyses.find(a=>a.quality==='final');
    const label=id=>lighting.configurations.find(p=>p.id===id)?.label??id;
    const lines=['# Lighting comparison review','',
        'Open `index.html` for comparisons grouped by pose, with the actual game baseline first. The 1080p gallery contains all six lights; the 4K gallery contains the provisional shortlist and L00.','',
        '## Provisional selection','',
        'The automatic rule penalizes near-clipping and strong saturation across all five poses. It selects candidates for closer review, not the most photorealistic image. In particular, extra sky fill can improve this score by reducing saturation while flattening contrast.','',
        '| Rank | Setup | Near clipping | Strong saturation |','| --- | --- | ---: | ---: |'];
    for(const [index,item] of (pilot?.shortlistDiagnostics??[]).entries())lines.push(`| ${index+1} | ${item.light} · ${label(item.light)} | ${(100*item.clipping).toFixed(5)}% | ${(100*item.saturation).toFixed(3)}% |`);
    lines.push('',`4K selections: ${(pilot?.shortlist??[]).join(', ')} plus L00. Overcast is a different weather condition and is excluded from the sunny shortlist.`,'',
        '## Review criteria','',
        '- Compare L01 and L03 at the same exposure: L01 preserves more sun-to-shade contrast; L03 provides more sky fill. Check bus paint, facade depth and shaded road detail in every view.',
        '- L02 tests stronger contrast; L04 changes the environment distribution and photographed background. L05 is useful as an overcast alternative, not a matching sunny reference.',
        '- AgX, exact Three.js ACESFilmic and ACES 2.0 are separate display treatments. Each column has independent exposure; only AgX has a look selector. Keep the neutral look as the reference.',
        '- Custom window interiors, smart material groups and runtime material remapping are export limitations. Pale signs/windows and unusually glossy terrain must not be explained away as exposure or promoted as a lighting improvement.','',
        '## Numerical checks','');
    for(const analysis of analyses){const valid=analysis.linear.filter(i=>!i.id.startsWith('convergence'));
        lines.push(`- ${analysis.quality}: ${valid.length} beauty EXRs; ${analysis.images.length} display images; ${valid.reduce((n,i)=>n+i.metrics.nonfiniteComponents,0)} nonfinite beauty components; maximum raw-pass reconstruction RMS ${Math.max(...valid.map(i=>i.metrics.recombinationRmsVsNoisy??0)).toExponential(3)}.`);}
    for(const check of pilot?.convergence??[])lines.push(`- ${check.reference}: higher-bounce/doubled-budget/independent-seed diagnostic differs by ${(check.relativeRms*100).toFixed(2)}% relative RMS; average luminance change ${check.meanLuminanceChange.toExponential(3)}. This combines noise, denoising and bounce differences; it does not establish convergence for every final view.`);
    lines.push('',`Camera projection error: ${scene.build.projection.maximumPixelError.toFixed(6)} px maximum at 1080p. Source material masks, fixed crops, source-light groups, CSV and JSON diagnostics accompany the images.`,'',
        'Hue fidelity, semantic lit-to-shadow/contact profiles, and a calibrated automatic shadow-leak classifier are not supplied by the current histogram analysis. Dark trim and bright metal can legitimately trigger threshold warnings.','',
        'The separate `../pose_validation.json` reopens the saved scene and evaluates each camera view layer. It is the authoritative bus/camera transform check. Early render receipts could read stale identity matrices from buses excluded in the active UI view layer; those original receipts and pixels are preserved, while subsequent renders evaluate the layer before recording metadata.','',
        '## Applying a later preference to the game','',
        '- Exposure, view transform and creative grading are display changes. Do not bake them into linear lightmaps.',
        '- Sun, sky, hemisphere or diffuse IBL changes require matching authenticated lighting bakes. Do not keep an incompatible package active.',
        '- Ray-traced city reflections on the bus and custom-material parity are separate engine/export work. This comparison makes no real-time performance claim and changes no production assets.','',
        '## Counts and timing','',
        '```json',JSON.stringify({counts,timings},null,2),'```','',
        'Times are measured offline stage/image durations. See the framework run summary for complete invocation wall time and cache reuse; development attempts are separate. GPU memory snapshots are not peak-memory measurements.','',
        '## Scene limitations','',...scene.limitations.map(value=>'- '+value),'');
    if(!final)lines.push('Final-quality comparisons are not present in this report.');
    await writeFile(file,lines.join('\n'));
}
