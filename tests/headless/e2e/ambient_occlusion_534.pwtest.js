// Captures current and baked AO compositions with real assets, scope transitions and complete frame costs.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const root = 'tests/artifacts/screens/illumination_534/city_contact';
test('AI 534 real city: GI, scope, AO Off, parked/moving bus and restoration', async ({ page }) => {
    test.setTimeout(600000);
    await mkdir(root,{recursive:true});
    const errors=[], requests=[]; page.on('pageerror',e=>{ errors.push(e.message); console.log(e.message); });
    page.on('request',r=>{if(/\.ilpkg/.test(r.url()))requests.push(r.url());});
    page.on('console',m=>{ if(m.type()==='error' && /shader|GL_INVALID|WebGLProgram/i.test(m.text())) errors.push(m.text()); });
    await page.setViewportSize({width:1280,height:744});
    await page.addInitScript(()=>{
        localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({shadows:{enabled:false},receivers:{direct:false,indirect:false,enhanced:false}}));
        localStorage.setItem('bus_sim.ambientOcclusion.v1',JSON.stringify({mode:'off'}));
    });
    await page.goto('/?coreTests=0&visibilityMap=0');
    await page.waitForFunction(()=>window.__busSim?.sm?.currentName==='welcome',null,{timeout:120000});
    await page.locator('#btn-start').click();
    await page.waitForFunction(()=>window.__busSim.sm.currentName==='bus_select',null,{timeout:120000});
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__busSim.sm.currentName==='game_mode',null,{timeout:120000});
    const context=await page.evaluate(async()=>{
        const {engine:e,sm}=window.__busSim;
        await Promise.all([e.waitForLightingReady(),sm.current.busModel?.userData?.readyPromise,sm.current.city?.world?.trees?.readyPromise].filter(Boolean));
        e.stop(); sm.current.gameLoop.paused=true;
        sm.current.update=()=>{e.context.city.update(e);e.context.city.updateStaticVisibility(e.camera);};
        e.setViewportSize(1280,720); e.renderer.setPixelRatio(1);e.renderer.setSize(1280,720,false);
        e.camera.aspect=1280/720;e.camera.updateProjectionMatrix();
        for(const id of ['hud-game','ui-perf-bar']) document.getElementById(id).style.visibility='hidden';
        const bus=sm.current.busAnchor, p=bus.position;
        e.camera.position.set(p.x+18,p.y+9,p.z+16);e.camera.lookAt(p.x,p.y+1.5,p.z);e.camera.updateMatrixWorld(true);
        window.ao534={e,sm,bus,originalPose:p.clone(),async bake(indirect,direct=true){
            let done=false;const work=e.setBakedLightingSettings({shadows:{enabled:true,dynamicResolution:'high'},receivers:{enhanced:true,indirect,direct,linked:false}}).finally(()=>done=true);
            const start=performance.now();
            while(true){e.updateFrame(0);await new Promise(requestAnimationFrame);
                const d=e.getBakedLightingDebugInfo().receiverLightmaps;
                if(done&&d.state==='fallback') throw new Error(d.reason);
                if(done&&d.state==='active'&&d.effective.indirect===indirect&&d.activationBlend===1) break;
                if(performance.now()-start>300000) throw new Error('Lighting activation timeout');
            } await work;
        },async measure(id){
            const samples=[],gpu=e._gpuFrameTimer;let dynamic=[];
            for(let f=0;f<45;f++){
                if(f===15)gpu?.resetSamples();
                const t=performance.now();e.updateFrame(0);e.renderer.getContext().finish();
                if(f>=15){samples.push(performance.now()-t);dynamic.push(e._dynamicAo?.diagnostics.cpuMs??0);}
                await new Promise(requestAnimationFrame);
            }
            return{id,samples,dynamicCpu:dynamic,gpu:gpu?.getSamplesSince(0).map(s=>s.ms)??[],gpuDiagnostics:gpu?.getDiagnostics(),
                draw:{...e.renderer.info.render},memory:{...e.renderer.info.memory,programs:e.renderer.info.programs.length},
                ao:e.getAmbientOcclusionDebugInfo(),receivers:e.getBakedLightingDebugInfo().receiverLightmaps.effective,
                receiverState:e.getBakedLightingDebugInfo().receiverLightmaps};
        }};
        const gl=e.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return{gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),browser:navigator.userAgent,
            camera:e.camera.position.toArray(),bus:p.toArray(),resolution:[1280,720],aa:e.antiAliasingSettings};
    });
    const measures=[];
    for(const mode of ['off','gtao']){
        await page.evaluate(mode=>{const{e}=window.ao534;e.setAmbientOcclusionSettings({...e.ambientOcclusionSettings,mode});},mode);
        measures.push(await page.evaluate(id=>window.ao534.measure(id),'current-'+mode));
        await page.screenshot({path:`${root}/current-${mode}.png`});
    }
    console.log('AI534 loading accepted indirect bake');
    await page.evaluate(()=>window.ao534.bake(true));
    const warmRequestCount=requests.length;
    expect(await page.evaluate(()=>window.ao534.e.getAmbientOcclusionDebugInfo().scope)).toBe('dynamic');
    for(let round=0;round<2;round++)for(const mode of ['off','dynamic','generic','all']){
        await page.evaluate(mode=>{const{e}=window.ao534;e.setAmbientOcclusionSettings({...e.ambientOcclusionSettings,
            mode:mode==='off'?'off':'gtao',indirectScope:mode==='all'?'all':'dynamic',
            dynamic:{...e.ambientOcclusionSettings.dynamic,busMethod:mode==='generic'?'gtao':'analytic'}});},mode);
        measures.push(await page.evaluate(id=>window.ao534.measure(id),`gi-${mode}-${round}`));
        await page.screenshot({path:`${root}/gi-${mode}.png`});
        await writeFile(`${root}/measurements.json`,JSON.stringify({context,measures,errors},null,2));
        expect(measures.at(-1).receiverState.state, JSON.stringify(measures.at(-1).receiverState.timings)).toBe('active');
    }
    const lifecycle=await page.evaluate(async()=>{
        const{e,bus}=window.ao534;
        const original=JSON.stringify(e.ambientOcclusionSettings.gtao);
        e.setAmbientOcclusionSettings({...e.ambientOcclusionSettings,mode:'gtao',indirectScope:'dynamic'});
        const moving=[];
        for(let i=0;i<8;i++){bus.position.x+=.2;e.updateFrame(1/60);moving.push(e.getAmbientOcclusionDebugInfo());}
        const saved=e.ambientOcclusionSettings;
        e.setAmbientOcclusionSettings({...saved,mode:'off'});e.updateFrame(0);
        const off=e.getAmbientOcclusionDebugInfo();
        e.setAmbientOcclusionSettings(saved);e.updateFrame(0);
        const returned=e.getAmbientOcclusionDebugInfo();
        const aa=[];
        for(const mode of ['fxaa','msaa','taa','off']){
            e.setAntiAliasingSettings({...e.antiAliasingSettings,mode,msaa:{samples:2}});
            for(let i=0;i<8;i++){e.camera.position.x+=.01;e.updateFrame(0);}
            aa.push({mode,scope:e.getAmbientOcclusionDebugInfo().scope,error:e.renderer.getContext().getError()});
        }
        await window.ao534.bake(false);
        const directOnly=e.getAmbientOcclusionDebugInfo();
        await window.ao534.bake(true);
        return{moving,off,returned,directOnly,aa,final:e.getAmbientOcclusionDebugInfo(),parametersPreserved:original===JSON.stringify(e.ambientOcclusionSettings.gtao),
            baked:e.getBakedLightingDebugInfo().receiverLightmaps.effective};
    });
    expect(lifecycle.off.mode).toBe('off');expect(lifecycle.returned.mode).toBe('dynamic-contact');
    expect(lifecycle.directOnly.scope).toBe('all');expect(lifecycle.final.scope).toBe('dynamic');
    expect(lifecycle.parametersPreserved).toBe(true);expect(lifecycle.baked).toEqual({direct:true,indirect:true});
    expect(lifecycle.moving.every(d=>d.dynamic.enabled&&d.dynamic.participants>0)).toBe(true);
    expect(lifecycle.aa.every(a=>a.scope==='dynamic'&&a.error===0)).toBe(true);
    expect(requests.length).toBe(warmRequestCount);
    await page.evaluate(()=>{const{e,bus}=window.ao534;const p=bus.position;e.camera.position.set(p.x+9,p.y+2,p.z+8);e.camera.lookAt(p.x,p.y+.6,p.z);
        for(let i=0;i<8;i++)e.updateFrame(0);});
    await page.screenshot({path:`${root}/bus-grounding.png`});
    await page.evaluate(()=>{const{e,bus}=window.ao534;const p=bus.position;
        e.camera.position.set(p.x,p.y+20,p.z+1);e.camera.lookAt(p.x,p.y,p.z);
        e.setAmbientOcclusionSettings({...e.ambientOcclusionSettings,dynamic:{...e.ambientOcclusionSettings.dynamic,debugView:true}});
        e.updateFrame(0);e._prepareDynamicAo();bus.visible=false;e.renderer.shadowMap.autoUpdate=false;
        e.renderer.render(e.scene,e.camera);e._dynamicAo.restoreBindings();});
    await page.screenshot({path:`${root}/dynamic-footprint-debug.png`});
    await writeFile(`${root}/result.json`,JSON.stringify({context,measures,lifecycle,requests,errors},null,2));
    expect(errors).toEqual([]);
});
