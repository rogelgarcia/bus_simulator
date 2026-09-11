// Bounded, isolated diagnosis; this receipt never certifies a production candidate.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {resolvePoses} from '../lighting_configurations/Inputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {candidateInputs} from './CandidateInputs.mjs';
import {outputPath} from './Baseline.mjs';

export async function transportDiagnostics(ctx) {
    if(ctx.publish||!ctx.options.output)throw new Error('New diagnostic output required; no publication');
    const output=outputPath(ctx.root,ctx.options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
    const candidate=await candidateInputs(ctx,ctx.options['candidate-run']);
    const poses=resolvePoses(JSON.parse(await readFile(path.join(ctx.root,'tools/bake_lighting/experiments/lighting_configurations/config/poses.json'),'utf8')));
    const events=[];let writes=Promise.resolve();
    const record=event=>{events.push({time:new Date().toISOString(),...event});writes=writes.then(()=>writeJson(path.join(output,'events.json'),events));return writes;};
    await withGameBrowser(ctx,{width:1920,height:1080},async(page,url)=>{
        await candidate.configurePage(page,url);
        page.on('pageerror',error=>{void record({error:error.stack});});
        page.on('console',message=>{if(message.type()==='error')void record({console:message.text()});});
        await page.addInitScript(()=>{
            localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({mode:'baked',busAppearanceVersion:2,shadows:{enabled:true},receivers:{indirect:true},bus:{enabled:false,glassReflections:false,bodyReflections:false,rimShine:false}}));
            localStorage.setItem('bus_sim.colorGrading.v1',JSON.stringify({preset:'off',intensity:0}));
            localStorage.setItem('bus_sim.sunBloom.v1',JSON.stringify({enabled:false}));
        });
        await page.goto(`${url}/?coreTests=0&gameplayPose=${encodeURIComponent(JSON.stringify(poses[0].pose))}`);
        await page.waitForFunction(()=>{
            const state=window.__busSim?.engine?.getBakedLightingDebugInfo();
            return state?.status.effectiveMode==='baked'&&state.receiverLightmaps.effective.indirect&&state.receiverLightmaps.activationBlend===1;
        });
        await page.evaluate(()=>{
            const e=window.__busSim.engine,c=e.canvas;
            for(const el of document.body.querySelectorAll('*'))if(el!==c&&!el.contains(c)&&!['SCRIPT','STYLE','LINK'].includes(el.tagName))el.style.visibility='hidden';c.style.visibility='visible';
            window.__ai562Render=e._renderAoFrame;
        });
        const profiling=ctx.options['profile-modes']==='true';
        const profiler=profiling?await page.context().newCDPSession(page):null;
        if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
        for(const mode of profiling?['current','auto','baked']:['original','no_post','ambient','sun','current']){
            await record({mode,state:'requested'});
            let timer;
            try {
                await Promise.race([page.evaluate(async mode=>{
                    const e=window.__busSim.engine;
                    if(mode==='original')return;
                    if(['current','auto','baked'].includes(mode)){
                        e._renderAoFrame=window.__ai562Render;
                        await e.setBakedLightingSettings({...e.bakedLightingSettings,mode});
                        while(!e.getBakedLightingDebugInfo().view?.ready) await new Promise(requestAnimationFrame);
                    } else e._renderAoFrame=function(){
                        const lights=[],scene=this.scene;
                        if(mode==='ambient')scene.traverse(o=>{if(o.isDirectionalLight){lights.push([o,o.intensity]);o.intensity=0;}});
                        const env=scene.environment;
                        if(mode==='sun')scene.environment=null;
                        try {this.renderer.setRenderTarget(null);this.renderer.render(scene,this.camera);}
                        finally{scene.environment=env;for(const [light,value]of lights)light.intensity=value;}
                    };
                    for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);
                },mode),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(mode+' exceeded 90 seconds')),90000);})]);
                const data=await page.evaluate(async()=>{
                    const e=window.__busSim.engine,THREE=await import('three'),lights=[],materials=[];
                    e.scene.traverse(o=>{if(o.isLight){const p=new THREE.Vector3(),t=new THREE.Vector3();o.getWorldPosition(p);o.target?.getWorldPosition(t);lights.push({type:o.type,visible:o.visible,color:o.color.toArray(),intensity:o.intensity,direction:p.sub(t).normalize().toArray(),shadow:o.castShadow});}});
                    window.__busSim.sm.current.busModel.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m||materials.some(v=>v.uuid===m.uuid))continue;const p=e.renderer.properties.get(m),u=p.uniforms??{};materials.push({uuid:m.uuid,name:m.name,type:m.type,color:m.color?.toArray(),toneMapped:m.toneMapped,defines:m.defines,exposure:u.toneMappingExposure?.value,emissive:u.emissive?.value,lightColors:u.directionalLights?.value?.map(l=>({color:l.color,direction:l.direction})),program:p.currentProgram?.id});}});
                    return {lights,materials,rendererExposure:e.renderer.toneMappingExposure,baked:e.getBakedLightingDebugInfo().status};
                });
                await writeJson(path.join(output,mode+'.json'),data);
                await page.locator('canvas').first().screenshot({path:path.join(output,mode+'.png')});
                await record({mode,state:'captured'});
            }catch(error){await record({mode,state:'failed',error:error.message});break;}
            finally{clearTimeout(timer);}
        }
        if(profiler){const {profile}=await profiler.send('Profiler.stop');await writeJson(path.join(output,'modes.cpuprofile'),profile);await profiler.detach();}
    });
    await writes;
    const file=path.join(output,'diagnostics_receipt.json');return resultFiles(await receipt(file,ctx.key,{output,diagnosticOnly:true},await listFiles(output)),file);
}
