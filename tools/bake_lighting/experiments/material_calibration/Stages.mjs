// @ts-check
// Authenticated material experiment stages; production publication is forbidden.
import path from 'node:path';
import {readFile,mkdir,writeFile,copyFile,access} from 'node:fs/promises';
import {writeJson,listFiles,hashFile} from '../../../baking/Files.mjs';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {verifyFiles} from '../lighting_configurations/Inputs.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {runtimeAudit} from './RuntimeAudit.mjs';
import {TOOL,ARTIFACTS,outputPath,validateProfile} from './Plan.mjs';
import {summarizeInventory} from './Inventory.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
async function finish(ctx,output,stage,files){
    const file=path.join(output,stage+'_receipt.json');const value=await receipt(file,ctx.key,{output,stage},files);return {...resultFiles(value,file),output};
}
async function load(ctx,stage){
    if(ctx.publish)throw new Error('Material experiments cannot publish');
    if(!ctx.options.output)throw new Error('Specify output from the material audit');
    const output=outputPath(ctx.root,ctx.options.output);await authenticated(path.join(output,stage+'_receipt.json'));
    return {output,request:JSON.parse(await readFile(path.join(output,'request.json'),'utf8'))};
}
async function blender(ctx,output,stage){
    const experiment=JSON.parse(await readFile(path.join(output,'experiment.json'),'utf8'));
    for(const item of experiment.scripts)if((await hashFile(path.join(ctx.root,item.file))).sha256!==item.sha256)throw new Error('Prepared material implementation changed; use a new prepared run');
    const file=path.join(output,stage+'_job.json');await writeJson(file,{...experiment,output,stage,device:ctx.config.renderDevice});
    if(ctx.options.mode!=='background')await ctx.process('powershell.exe',['-NoProfile','-Command',"if (@(Get-Process -Name blender -ErrorAction SilentlyContinue).Count) { Write-Error 'Blender occupied; use isolated background mode.'; exit 1 }"]);
    await runBlenderStage(ctx,TOOL+'/blender.py',[file],{background:ctx.options.mode==='background'});
}
export async function prepare(ctx){
    const {output,request}=await load(ctx,'audit'),start=Date.now();
    if(await access(path.join(output,'prepare_receipt.json')).then(()=>true,()=>false))throw new Error('Prepared evidence is immutable; create a new audit output for another candidate');
    const read=async name=>JSON.parse(await readFile(path.join(ctx.root,TOOL,name),'utf8'));
    const defaults=await read('defaults.json'),profiles=await read('profiles.json'),contract=await read('export_contract.json');validateProfile(defaults,profiles);
    const runtime=JSON.parse(await readFile(path.join(output,'runtime_audit.json'),'utf8')),source=JSON.parse(await readFile(path.join(output,'source_materials.json'),'utf8'));
    const inventory=summarizeInventory(runtime,source,defaults,profiles);await writeJson(path.join(output,'inventory.json'),inventory);
    const scripts=await Promise.all(['blender.py','fixtures.py','city_materials.py'].map(async file=>({file:TOOL+'/'+file,...await hashFile(path.join(ctx.root,TOOL,file))})));
    const materials=inventory.rows.map(({fixture,id,label,source})=>({fixture,id,label,source}));
    for(const id of ['grass','glazing','paint','trim','rim','bus_glass']){
        const row=inventory.rows.find(m=>m.id===id),inputs=row.runtime.inputs,fixture={color:row.textureMeanColor,roughness:row.roughnessProduct,metalness:inputs.metalness??0,ior:inputs.ior??1.5,specularIntensity:inputs.specularIntensity??1};
        if(inputs.specular){const peak=Math.max(...inputs.specular);fixture.specularIntensity=peak;fixture.specularColor=inputs.specular.map(v=>v/peak);}
        if(id==='grass')fixture.roughness=profiles.plausible.grassRoughnessRemap[0]+profiles.plausible.grassRoughnessRemap[1]*fixture.roughness;
        materials.push({id:id+(id==='grass'?'_dry':'_exported'),label:row.label+(id==='grass'?' · dry proposal':' · original export'),fixture});
    }
    const experiment={schemaVersion:1,output,daylightRoot:request.daylightRoot,daylightDefaults:request.daylightRequest.defaults,defaults,profiles,contract,materials,inventory,scripts,sourceAuditHash:await hashFile(path.join(output,'runtime_audit.json'))};
    await writeJson(path.join(output,'experiment.json'),experiment);
    await blender(ctx,output,'prepare');await writeJson(path.join(output,'prepare_timing.json'),{seconds:(Date.now()-start)/1000});
    return finish(ctx,output,'prepare',[path.join(output,'experiment.json'),path.join(output,'inventory.json'),path.join(output,'fixtures.blend'),path.join(output,'material_city.blend'),path.join(output,'city_materials.json')]);
}
export async function capture(ctx){
    const {output}=await load(ctx,'prepare');const experiment=JSON.parse(await readFile(path.join(output,'experiment.json'),'utf8'));
    const {captureNative}=await import('./Capture.mjs');const native=await captureNative(ctx,output,experiment);
    return finish(ctx,output,'capture',[path.join(output,'native.json'),...await listFiles(native.directory)]);
}
export async function render(ctx){
    const {output}=await load(ctx,'prepare');await blender(ctx,output,'render');
    return finish(ctx,output,'render',[path.join(output,'renders.json'),...await listFiles(path.join(output,'renders'))]);
}
export async function analyze(ctx){
    const {output}=await load(ctx,'render');await authenticated(path.join(output,'capture_receipt.json'));
    await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'analyze.py'),output]);
    return finish(ctx,output,'analyze',await listFiles(path.join(output,'report')));
}
export async function execute(ctx){
    const start=Date.now(),a=await audit(ctx),next={...ctx,options:{...ctx.options,output:a.output}};
    await prepare(next);await capture(next);await render(next);const result=await analyze(next);
    await writeJson(path.join(a.output,'execution.json'),{seconds:(Date.now()-start)/1000});return result;
}
export async function audit(ctx){
    if(ctx.publish)throw new Error('Material experiments cannot publish');
    if(ctx.options['audit-run']){
        const from=outputPath(ctx.root,ctx.options['audit-run']);await authenticated(path.join(from,'audit_receipt.json'));
        const previous=JSON.parse(await readFile(path.join(from,'request.json'),'utf8'));await verifyFiles(ctx.root,previous.prepared.source.files);
        const output=outputPath(ctx.root,ctx.options.output??`${ARTIFACTS}/runs/${ctx.key.slice(0,16)}-${Date.now()}`);await mkdir(path.dirname(output),{recursive:true});await mkdir(output,{recursive:false});
        for(const name of ['runtime_audit.json','source_materials.json'])await copyFile(path.join(from,name),path.join(output,name));
        await writeJson(path.join(output,'request.json'),{...previous,output,auditReusedFrom:from});await writeJson(path.join(output,'audit_timing.json'),{reused:true,original:from});
        return finish(ctx,output,'audit',['request.json','runtime_audit.json','source_materials.json'].map(name=>path.join(output,name)));
    }
    if(!ctx.options['daylight-run'])throw new Error('Specify the passing AI565 daylight-run');
    const start=Date.now(),daylightRoot=path.resolve(ctx.root,ctx.options['daylight-run']);
    await authenticated(path.join(daylightRoot,'analyze_receipt.json'));await authenticated(path.join(daylightRoot,'prepare_receipt.json'));await authenticated(path.join(daylightRoot,'render_receipt.json'));
    const summary=JSON.parse(await readFile(path.join(daylightRoot,'report/summary.json'),'utf8'));
    if(summary.failed||!summary.passed)throw new Error('Daylight checks must pass');
    const daylightRequest=JSON.parse(await readFile(path.join(daylightRoot,'request.json'),'utf8'));
    const prepared=JSON.parse(await readFile(path.join(daylightRoot,'inputs/prepared.json'),'utf8'));await verifyFiles(ctx.root,prepared.source.files);
    const sourceScene=JSON.parse(await readFile(path.join(daylightRoot,'inputs/scene_manifest.json'),'utf8'));
    const source=JSON.parse(await readFile(sourceScene.sourceManifest,'utf8'));
    const output=outputPath(ctx.root,ctx.options.output??`${ARTIFACTS}/runs/${ctx.key.slice(0,16)}-${start}`);await mkdir(path.dirname(output),{recursive:true});await mkdir(output,{recursive:false});
    const baseline=JSON.parse(await readFile(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/baseline.json'),'utf8'));
    let runtime;
    await withGameBrowser(ctx,{width:1280,height:720},async(page,url,browserVersion)=>{
        const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('AI566 page error: '+e.message);});
        page.on('requestfailed',r=>console.log('AI566 request failed: '+r.url()+' '+r.failure()?.errorText));
        console.log('AI566 opening game');
        await page.addInitScript(storage=>{for(const [key,v] of Object.entries(storage))localStorage.setItem(key,JSON.stringify(v));},baseline.storage);
        await page.goto(url+'/?coreTests=0&gameplayPose='+encodeURIComponent(JSON.stringify(prepared.poses[2].pose)),{timeout:240000});
        console.log('AI566 page loaded');
        try{await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.busAnchor,null,{timeout:60000});}
        catch(error){await writeJson(path.join(output,'startup_failure.json'),{errors,state:await page.evaluate(()=>({text:document.body.innerText.slice(0,4000),busSim:!!window.__busSim,state:window.__busSim?.sm?.current?.constructor?.name}))});throw error;}
        console.log('AI566 bus attached');
        await page.evaluate(async()=>await window.__busSim.sm.current.busModel.userData.readyPromise);
        let illuminationWait=null;
        try{await page.waitForFunction(()=>{const d=window.__busSim.engine.getBakedLightingDebugInfo();return d.status.effectiveMode==='baked'&&d.receiverLightmaps.activationBlend===1&&!d.busLighting.transitionState;},null,{timeout:60000});}
        catch(error){illuminationWait=await page.evaluate(()=>window.__busSim.engine.getBakedLightingDebugInfo());}
        runtime=await page.evaluate(runtimeAudit);runtime.browserVersion=browserVersion;runtime.errors=errors;
        runtime.illuminationWait=illuminationWait;
        if(errors.length)throw new Error(errors.join('\n'));
    });
    await writeJson(path.join(output,'runtime_audit.json'),runtime);await writeJson(path.join(output,'source_materials.json'),source.materials);
    const request={schemaVersion:1,output,daylightRoot,daylightRequest,sourceScene,prepared,sourceHash:sourceScene.source,startedAt:new Date(start).toISOString()};
    await writeJson(path.join(output,'request.json'),request);await writeJson(path.join(output,'audit_timing.json'),{seconds:(Date.now()-start)/1000,materials:runtime.records.length,textures:runtime.textures.length});
    return finish(ctx,output,'audit',[path.join(output,'request.json'),path.join(output,'runtime_audit.json'),path.join(output,'source_materials.json')]);
}
