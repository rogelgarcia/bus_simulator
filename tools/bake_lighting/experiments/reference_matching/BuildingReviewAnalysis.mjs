// Independently assemble pose-grouped images and raw-material diagnostics.
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { withGameBrowser } from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import { listFiles } from '../../../baking/Files.mjs';
import { outputPath, TOOL } from './Baseline.mjs';

export async function buildingReviewAnalysis(ctx) {
    if(ctx.publish||!ctx.options.capture||!ctx.options.reference||!ctx.options.output)throw new Error('capture, reference, new output required; diagnostic only');
    const capture=outputPath(ctx.root,ctx.options.capture),reference=outputPath(ctx.root,ctx.options.reference),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(capture,'capture_receipt.json'));await authenticated(path.join(reference,'building_reference_receipt.json'));
    await mkdir(output);
    const review=JSON.parse(await readFile(path.join(capture,'review.json'),'utf8'));
    const renders=JSON.parse(await readFile(path.join(reference,'full/renders.json'),'utf8'));
    const request=JSON.parse(await readFile(path.join(reference,'full/request.json'),'utf8'));
    if(JSON.stringify(review.poses)!==JSON.stringify(request.poses))throw new Error('Game/reference poses differ');
    for(const run of review.runs)if(Math.abs(run.evidence.renderer.exposure-2**request.exposureEv)>1e-8)throw new Error('Game/reference exposure differs');
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'building_review_analysis.py'),capture,reference,output]);
    await withGameBrowser(ctx,{width:2880,height:586},async page=>{
        const sheet=async(name,panels)=>{
            const images=await Promise.all(panels.map(async([label,file])=>({label,src:'data:image/png;base64,'+(await readFile(file)).toString('base64')})));
            await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;display:flex;background:#101921;color:#d8e0e7;font:23px Arial}section{width:960px}header{height:46px;padding:10px 14px}img{display:block;width:960px;height:540px}</style>${images.map(im=>`<section><header>${im.label}</header><img src="${im.src}"></section>`).join('')}</html>`);
            await page.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
            await page.screenshot({path:path.join(output,name+'.png')});
        };
        for(const pose of review.poses){
            const render=renders.find(r=>r.pose===pose.id);if(!render)throw new Error('Missing Cycles pose');
            await sheet(pose.id,[['Game · original',path.join(capture,pose.id+'-original.png')],['Game · opaque reflections',path.join(capture,pose.id+'-reflections.png')],['Cycles · corrected road coverage',render.image]]);
        }
        if(review.poses.some(p=>p.id==='pose_custom'))await sheet('custom_diffuse',[['Game diffuse · material AO off',path.join(output,'game_diffuse_no_ao.png')],['Cycles · full diffuse',path.join(output,'cycles_diffuse.png')],['Cycles · primary geometric Lambert',path.join(output,'geometric_diffuse.png')]]);
    });
    const table=['| Pose | Reflections | Passes | GPU median ms | GPU p1–p99 ms | CPU median ms | Calls | Triangles | Tex / Geo / Programs |','|---|---|---:|---:|---:|---:|---:|---:|---|',
        ...review.summary.map(r=>`| ${r.pose} | ${r.variant} | ${r.passes} | ${r.gpuMs.median.toFixed(2)} | ${r.gpuMs.p01.toFixed(2)}–${r.gpuMs.p99.toFixed(2)} | ${r.cpuMs.median.toFixed(2)} | ${r.calls.median} | ${r.triangles.median} | ${r.textures.median} / ${r.geometries.median} / ${r.programs.median} |`)];
    const analysis=JSON.parse(await readFile(path.join(output,'analysis.json'),'utf8'));
    const materials=['| Custom-pose opaque material | Pixels | Reflection RGB error reduction | Game diffuse / Cycles full | Game diffuse / geometric control |',
        '|---|---:|---:|---:|---:|',...analysis.materials.map(row=>`| ${row.id} | ${row.pixels} | ${row.beauty.errorReductionPercent.toFixed(1)}% | ${row.gameToFullDiffuse.toFixed(3)} | ${row.gameToGeometricDiffuse.toFixed(3)} |`)];
    await writeFile(path.join(output,'comparison.md'),review.conditions+'\n\n'+table.join('\n')+'\n\n'+review.memoryPolicy
        +'\n\n'+materials.join('\n')+'\n\n'+(analysis.beautyMetric??'No custom-pose material analysis.')
        +' Diffuse ratios use scene-linear luminance with game material AO removed. Image-error reductions are local measurements, not a full-scene parity score.\n');
    const file=path.join(output,'analysis_receipt.json');return resultFiles(await receipt(file,ctx.key,{capture,reference,output,diagnosticOnly:true},await listFiles(output)),file);
}
