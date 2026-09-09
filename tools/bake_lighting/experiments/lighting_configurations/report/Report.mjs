// Offline pose-first gallery and contact sheets, using only authenticated saved images.
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { authenticated, receipt, codeIdentity, resultFiles } from '../StageInputs.mjs';
import { readJson, TOOL } from '../Inputs.mjs';
import { writeJson, digest, hashFile } from '../../../../baking/Files.mjs';
import {buildGallery} from './Gallery.mjs';
import {writeReview} from './Review.mjs';
import {validateImageHandoff} from '../ImageHandoff.mjs';

export async function reportComparisons(ctx,run) {
    const output=path.join(run.runRoot,'report');await mkdir(output,{recursive:true});
    const stages=[],images=[],analyses=[],timings={},savedLights=new Map();
    for(const quality of ['pilot','final']) {
        const file=path.join(run.runRoot,'postprocess',quality,'postprocess_manifest.json');
        try{const processed=await authenticated(file),renders=await authenticated(path.join(run.runRoot,'linear',quality,'render_manifest.json'));validateImageHandoff(renders,processed,{quality,source:run.source.sha256});for(const record of renders.records){const preset=record.lighting.preset,previous=savedLights.get(record.light);if(previous&&JSON.stringify(previous)!==JSON.stringify(preset))throw new Error('Conflicting saved light configurations');savedLights.set(record.light,preset);}stages.push(processed.key);images.push(...processed.records.map(record=>({...record,quality})));timings[`${quality}PostprocessSeconds`]=processed.seconds;}
        catch(error){if(error.code!=='ENOENT')throw error;}
        try{analyses.push(await authenticated(path.join(run.runRoot,'analysis',quality,'analysis_manifest.json')));}
        catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(!images.length)throw new Error('No processed renders to compare');
    const baselines=[];
    for(const resolution of ['1920x1080','3840x2160']) {
        let baseline;
        try{baseline=await readJson(path.join(run.runRoot,'runtime/G00_existing_baked',resolution,'baseline_manifest.json'));}
        catch(error){if(error.code!=='ENOENT')throw error;continue;}
        if(baseline.status!=='validated'||baseline.source!==run.source.sha256)throw new Error('Invalid game baseline');
        timings[`${resolution}GameCaptureSeconds`]=baseline.captureSeconds;
        for(const record of baseline.images){const file=path.join(run.runRoot,record.image),metadata=path.join(path.dirname(file),`${record.id}.json`);if((await hashFile(file)).sha256!==record.sha256||JSON.stringify(await readJson(metadata))!==JSON.stringify(record))throw new Error('Baseline image or evidence changed');
            const [width,height]=resolution.split('x').map(Number);
            baselines.push({id:`${record.id}_G00_${resolution}`,pose:record.id,light:'G00',label:'Game · existing baked data',quality:resolution==='3840x2160'?'final':'pilot',transform:'game',exposureStops:0,grade:'neutral',gameTone:record.lighting.toneMapping,gameGrade:record.graphics.colorGrading.preset,gameExposure:record.lighting.exposure,gradeIntensity:record.graphics.colorGrading.intensity,file,sha256:record.sha256,renderSeconds:record.seconds,width,height});}
    }
    const originalBaselineCount=baselines.length;
    try{const display=await authenticated(path.join(run.runRoot,'runtime/G01_display_variants/display_manifest.json'));if(display.source!==run.source.sha256)throw new Error('Display reference source mismatch');baselines.push(...display.records);stages.push(display.key);timings.nativeDisplayCaptureSeconds=display.seconds;}catch(error){if(error.code!=='ENOENT')throw error;}
    let verification;try{verification=await authenticated(path.join(run.runRoot,'scene_verification.json'));if(verification.source!==run.source.sha256)throw new Error('Pose verification source mismatch');stages.push(verification.key);}catch(error){if(error.code!=='ENOENT')throw error;}
    const lighting={configurations:[...savedLights.values()].sort((a,b)=>a.id.localeCompare(b.id))};
    const scene=await authenticated((await readJson(path.join(run.runRoot,'scene.json'))).manifest);
    const data={runId:run.runId,poses:run.poses.map(p=>({id:p.id,busId:p.busId})),images:[...baselines,...images].filter(item=>!item.id.startsWith('convergence')).map(item=>({...item,file:path.relative(output,item.file).replaceAll('\\','/')})),
        lights:lighting.configurations,limitations:scene.limitations,analysis:analyses.map(item=>({quality:item.quality,shortlist:item.shortlist,shortlistDiagnostics:item.shortlistDiagnostics,convergence:item.convergence,caveats:item.caveats})),projection:scene.build.projection,
        crops:analyses.flatMap(item=>item.crops??[]).map(item=>({...item,file:path.relative(output,item.file).replaceAll('\\','/')})),
        metrics:analyses.flatMap(item=>item.images.map(image=>({id:image.id,quality:item.quality,metrics:image.metrics}))),
        analysisFiles:analyses.map(item=>({quality:item.quality,csv:`../analysis/${item.quality}/metrics.csv`,json:`../analysis/${item.quality}/analysis.json`}))};
    const html=await buildGallery(data);
    const file=path.join(output,'index.html');await writeFile(file,html);
    const legacy=path.join(output,'diagnostics.html'),legacyData={...data,images:data.images.filter(item=>item.light!=='G01')};
    await writeFile(legacy,(await readFile(path.join(ctx.root,TOOL,'report/gallery.html'),'utf8')).replace('/*DATA*/',JSON.stringify(legacyData).replaceAll('<','\\u003c')));
    const files=[file],browser=await chromium.launch({executablePath:ctx.config.browserExecutable,headless:true,args:['--disable-gpu']});
    const cancel=()=>{void browser.close().catch(()=>{});};ctx.signal.addEventListener('abort',cancel,{once:true});
    try{
        const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});page.setDefaultTimeout(45000);
        for(const quality of ['pilot','final'].filter(q=>images.some(i=>i.quality===q)))for(const pose of run.poses){ctx.signal.throwIfAborted();await page.goto(pathToFileURL(file).href+`?sheet=${pose.id}&quality=${quality}`);await page.evaluate(async()=>{await Promise.all([...document.images].map(image=>image.decode()));});
            const image=path.join(output,`${pose.id}_${quality==='final'?'':quality+'_'}comparison.png`);await page.screenshot({path:image,fullPage:true});files.push(image);}
    } finally {await browser.close();ctx.signal.removeEventListener('abort',cancel);}
    const manifest=path.join(output,'report_manifest.json');
    await writeJson(path.join(run.runRoot,'comparison_summary.json'),{schemaVersion:1,status:images.some(i=>i.quality==='final')?'final_comparisons_generated':'pilot_comparisons_generated',report:manifest,scene:scene.scene,projection:scene.build.projection,limitations:scene.limitations,analyses:data.analysis});
    timings.exportSeconds=scene.seconds;
    for(const analysis of analyses){timings[`${analysis.quality}AnalysisSeconds`]=analysis.seconds;timings[`${analysis.quality}PathTracingSeconds`]=analysis.linear.reduce((sum,image)=>sum+image.seconds,0);}
    const counts={pilotBeauty:analyses.find(a=>a.quality==='pilot')?.linear.filter(i=>!i.id.startsWith('convergence')).length??0,finalBeauty:analyses.find(a=>a.quality==='final')?.linear.filter(i=>!i.id.startsWith('convergence')).length??0,gameBaselines:originalBaselineCount,nativeDisplayReferences:baselines.length-originalBaselineCount,displayVariants:images.length};
    const review=path.join(output,'review.md');await writeReview(review,{analyses,scene,lighting,counts,timings});
    const result=await receipt(manifest,digest({stages,code:await codeIdentity(ctx.root,['report/Report.mjs','report/Gallery.mjs','report/Review.mjs','report/matrix.html','report/matrix.css','report/matrix.js','report/gallery.html'])}),{gallery:file,contactSheets:files.slice(1),grouping:'pose; game reference first, lighting rows and tone columns',poses:run.poses.length,images:images.length,counts},[...files,legacy,review]);
    await writeJson(path.join(run.runRoot,'timings.json'),{...timings,counts,policy:'Measured successful stage/image durations; excludes development retries, includes diagnostic rendering. Offline timings are not runtime frame-time measurements.'});
    const complete=counts.pilotBeauty===30&&counts.finalBeauty===15&&counts.gameBaselines===10&&counts.nativeDisplayReferences===120&&counts.displayVariants===1575&&verification?.poses.length===5&&images.every(i=>i.width===(i.quality==='final'?3840:1920)&&i.height===(i.quality==='final'?2160:1080));
    await writeJson(path.join(run.runRoot,'manifest.json'),{...run,status:complete?'experiment_complete':'partial_comparisons',report:manifest,counts,timings,completedAt:new Date().toISOString(),limitations:scene.limitations});
    return resultFiles(result,manifest);
}
