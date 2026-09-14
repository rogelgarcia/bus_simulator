// Same-page, balanced prototype timing. The temporary hook never persists settings.
import {collectShadowFrameSamples,summarizeShadowFrames} from '../../shadows/streamed/FrameSamples.mjs';
import {settleGameFrames} from '../lighting_configurations/capture_baselines/GameEvidence.mjs';

export async function environmentBenchmark(page,config){
    await page.evaluate(async config=>{
        const {referenceEnvironmentControl,buildingReferenceMaterials}=await import('/tools/bake_lighting/experiments/reference_matching/ReferenceEnvironmentControl.js');
        window.__environmentBenchmark=referenceEnvironmentControl(buildingReferenceMaterials(window.__busSim.sm.current.city.buildings.group),config.whiteCells,config.samples);
    },config);
    const runs=[];
    try{
        for(let repeat=0;repeat<3;repeat++)for(const enabled of repeat%2?[true,false]:[false,true]){
            await page.evaluate(enabled=>window.__environmentBenchmark.setEnabled(enabled),enabled);
            await page.evaluate(settleGameFrames,60);
            const samples=await page.evaluate(collectShadowFrameSamples,{sampleFrames:120,warmupFrames:60});
            runs.push({repeat,enabled,...samples,summary:summarizeShadowFrames(samples.frames)});
        }
    }finally{await page.evaluate(()=>{window.__environmentBenchmark.dispose();delete window.__environmentBenchmark;});}
    return {runs,policy:'Three balanced same-pose repeats, 120 measured frames each after shader warmup; submission-matched GPU times. Native uses the same installed hook with the uniform Off.',
        lutGpuBytes:7*8*4*4,unknown:'Driver shader allocations; other GPU consumers are not measured.'};
}
