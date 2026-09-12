// Shader readiness must preserve renderer state, cancellation and the last visible frame.
import {test,expect} from '@playwright/test';

test('City shader preparation polls without drawing and restores the target before yielding',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {prepareLightingView}=await import('/src/graphics/illumination/baked_lighting/LightingViewPreparation.js');
        let target='previous',ready=false,polls=0;
        const program={isReady(){polls++;return ready;}};
        const renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,
            compile(){if(target!=='scene-color')throw new Error('Wrong target');return new Set(['material']);},
            properties:{get:()=>({currentProgram:program,programs:new Map([['program',program],['retired',{isReady(){throw new Error('Polled retired shader variant');}}]])})},getContext:()=>({isContextLost:()=>false})};
        const controller=new AbortController();
        const task=prepareLightingView(renderer,{}, {},'scene-color',controller.signal).then(()=>null,e=>e.name);
        const restored=target==='previous';
        await new Promise(resolve=>setTimeout(resolve,35));controller.abort();
        const cancelled=await task,stopped=polls;
        await new Promise(resolve=>setTimeout(resolve,35));
        const stoppedPolling=polls===stopped;ready=true;
        await prepareLightingView(renderer,{}, {},'scene-color',new AbortController().signal);
        return {restored,cancelled,stoppedPolling,target};
    });
    expect(result).toEqual({restored:true,cancelled:'AbortError',stoppedPolling:true,target:'previous'});
});

test('A superseded city compiler cannot release a newer view and equal baked modes do not rebuild',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {BakedLightingRuntime}=await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
        const {sanitizeBakedLightingSettings}=await import('/src/app/illumination/runtime/index.js');
        const tasks=[];
        const engine={prepareLightingView:signal=>new Promise((resolve,reject)=>{
            tasks.push(resolve);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})};
        const r=new BakedLightingRuntime(engine,{bus:{cancelStaging(){},getDiagnostics:()=>({})},shadows:{getDiagnostics:()=>({status:{}})},
            receivers:{settings:{},getDiagnostics:()=>({})}});
        r.settings=sanitizeBakedLightingSettings({mode:'auto',receivers:{indirect:true}});r.started=true;r.ready=true;r.effectiveMode='baked';
        engine.context={city:{}};r.receivers.status={};r.shadows.getSnapshot=()=>({effectiveMode:'baked'});
        r.requestViewPreparation();r.prepareView();r.requestViewPreparation();
        const preparingStatus=r.getStatus().indirect;
        tasks[0]();await new Promise(resolve=>setTimeout(resolve,0));
        const staleHeld=r.shouldHoldView();r.prepareView();tasks[1]();await new Promise(resolve=>setTimeout(resolve,0));
        const ready=!r.shouldHoldView();let rebuilds=0;r.refresh=()=>rebuilds++;
        await r.setSettings({...r.settings,mode:'baked'});
        window.removeEventListener('pagehide',r.onPageHide);
        return {staleHeld,ready,rebuilds,preparingStatus:preparingStatus.state,phase:preparingStatus.phase,finalStatus:r.getStatus().indirect.state};
    });
    expect(result).toEqual({staleHeld:true,ready:true,rebuilds:0,preparingStatus:'loading',phase:'preparing_shaders',finalStatus:'active'});
});
