// Source-input probes and native renderer measurements in disposable browser contexts.
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {writeJson} from '../../../baking/Files.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {TOOL} from './Plan.mjs';

export async function captureNative(ctx,output,experiment){
    const start=Date.now(),directory=path.join(output,'native',ctx.key.slice(0,12)+'-'+start);await mkdir(directory,{recursive:true});
    const baseline=JSON.parse(await readFile(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/baseline.json'),'utf8'));
    const request=JSON.parse(await readFile(path.join(output,'request.json'),'utf8'));
    let parameters,fixtures,browserVersion;
    await withGameBrowser(ctx,{width:1280,height:720},async(page,url,version)=>{
        browserVersion=version;const errors=[];page.on('pageerror',e=>errors.push(e.message));
        page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|program not valid/.test(m.text()))errors.push(m.text());});
        await page.addInitScript(storage=>{for(const [k,v] of Object.entries(storage))localStorage.setItem(k,JSON.stringify(v));},baseline.storage);
        await page.goto(url+'/?coreTests=0&gameplayPose='+encodeURIComponent(JSON.stringify(request.prepared.poses[2].pose)),{timeout:120000});
        await page.waitForFunction(()=>!!window.__busSim?.sm.current?.busAnchor,null,{timeout:120000});
        await page.evaluate(()=>window.__busSim.sm.current.busModel.userData.readyPromise);
        await page.waitForFunction(()=>{const d=window.__busSim.engine.getBakedLightingDebugInfo();return d.status.effectiveMode==='baked'&&d.receiverLightmaps.activationBlend===1&&!d.busLighting.transitionState;},null,{timeout:180000});
        console.log('AI566 native runtime ready');
        parameters=await page.evaluate(async ({module,ids})=>{
            const {runtimeAudit}=await import(module);await runtimeAudit({statistics:false});
            const {probeRuntime}=await import('/tests/headless/harness/material_runtime_probes.js');return probeRuntime(ids);
        },{module:'/'+TOOL+'/RuntimeAudit.mjs',ids:experiment.materials.filter(m=>m.source).map(m=>m.source)});
        parameters.errors=errors.slice();if(errors.length)throw new Error(errors.join('\n').slice(0,6000));
        for(const record of parameters.results){const file=path.join(directory,record.id+'_'+record.mode+'.rgba32f');await writeFile(file,Buffer.from(record.raw,'base64'));record.raw=file;}
        await writeJson(path.join(directory,'parameters.json'),parameters);
        await page.goto(url+'/tests/headless/harness/index.html',{timeout:120000});await page.waitForFunction(()=>!!window.__testHooks);
        await page.exposeFunction('__writeMaterialFixture',async record=>{const file=path.join(directory,record.id+'.rgba32f');await writeFile(file,Buffer.from(record.raw,'base64'));return {...record,raw:file};});
        fixtures=await page.evaluate(async options=>{
            const {neutralFixtures}=await import('/tests/headless/harness/material_neutral_fixtures.js');return neutralFixtures(window.__testHooks.getEngine(),options);
        },{materials:experiment.materials,angles:experiment.defaults.angles});
        if(errors.length)throw new Error(errors.join('\n').slice(0,6000));
        await writeJson(path.join(directory,'fixtures.json'),fixtures);
    });
    const result={schemaVersion:1,directory,parameters:path.join(directory,'parameters.json'),fixtures:path.join(directory,'fixtures.json'),browserVersion,seconds:(Date.now()-start)/1000};
    await writeJson(path.join(output,'native.json'),result);return result;
}
