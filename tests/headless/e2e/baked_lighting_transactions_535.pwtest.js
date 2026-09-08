// Exercises delayed channels, failure rollback, cancellation and Options transactions.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(existsSync(chrome))test.use({launchOptions:{executablePath:chrome}});

test('AI 535: an index failure after a previous bake retains its actual fallback reason',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const status=await page.evaluate(async()=>{
        const {BakedShadowRuntime}=await import('/src/graphics/illumination/baked_lighting/BakedShadowRuntime.js');
        const engine={renderer:{isWebGLRenderer:true},context:{city:{cityId:'fixture',group:{}}}};
        const shadows=new BakedShadowRuntime(engine,{fetchIndex:async()=>{throw new Error('Package index HTTP 404');}});
        const controller={effectiveMode:'current',state:'fallback',reason:'current_requested'};
        shadows._pipeline={getDiagnostics:()=>({runtime:{controller}}),deactivate:reason=>controller.reason=reason};
        await shadows.setSettings({...shadows.getSettings(),shadows:{...shadows.getSettings().shadows,enabled:true}});
        return shadows.getDiagnostics().status;
    });
    expect(status.reason).toBe('Package index HTTP 404');
});

test('AI 535: delayed channels and stale requests never produce a partial baked frame',async({page})=>{
    await page.setViewportSize({width:1280,height:900});
    await page.goto('/tests/headless/harness/index.html');
    await page.addStyleTag({url:'/src/graphics/gui/shared/styles.css'});
    await page.addStyleTag({url:'/src/graphics/gui/options/styles.css'});
    const result=await page.evaluate(async()=>{
        const { BakedLightingRuntime }=await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
        const events=[];
        let resolveIndirect,indirectReady=false,loads=0,valid=true,shadowFailure=null;
        const state={effectiveMode:'current',pendingTransition:null};
        const shadows={
            _pipeline:{runtime:{getSnapshot:()=>state,commitFrameBoundary(){if(state.pendingTransition==='current'||shadows.canActivate()){
                if(state.pendingTransition)state.effectiveMode=state.pendingTransition;state.pendingTransition=null;
            }}}},
            getSnapshot:()=>state,commitCurrent(){if(state.pendingTransition==='current')this._pipeline.runtime.commitFrameBoundary();},
            async setSettings(s){if(s.shadows.enabled&&!shadowFailure)state.pendingTransition='baked';},
            suspend(){state.pendingTransition='current';},invalidate(){this.suspend();},dispose(){events.push('shadow-disposed');},
            getDiagnostics(){return{status:{reason:shadowFailure},pipeline:{runtime:{controller:state}}};}
        };
        const receivers={settings:{},status:{state:'current'},active:false,pending:false,resources:{},
            async refresh(){loads++;const generation=runtime.generation;if(!indirectReady)await new Promise(resolve=>resolveIndirect=resolve);if(generation===runtime.generation){this.pending=true;this.status={state:'loading'};}},
            suspend(reason){this.active=false;this.pending=false;this.status={state:'current',reason};},invalidate(){this.suspend();this.resources={};},dispose(){events.push('receiver-disposed');},
            validateFrame(){return valid;},frameBegin(now,allow){if(this.pending&&allow){this.active=true;this.pending=false;}},
            getDiagnostics(){return{...this.status,effective:{direct:false,indirect:this.active},channels:{}};}
        };
        const engine={context:{city:{}},atmosphereSettings:{sun:{azimuthDeg:45,elevationDeg:35}}};
        const runtime=new BakedLightingRuntime(engine,{shadows,receivers});
        const settings={mode:'baked',shadows:{enabled:true},receivers:{indirect:true,direct:true,enhanced:false}};
        const frame=()=>{runtime.prepareFrame();shadows._pipeline.runtime.commitFrameBoundary();runtime.frameBegin();events.push([state.effectiveMode,receivers.active]);};
        let work=runtime.setSettings(settings);await Promise.resolve();frame();
        const loading=runtime.getDiagnostics();
        resolveIndirect();await work;frame();
        const active=runtime.getDiagnostics();
        await runtime.setSettings({...settings,mode:'current'});frame();
        const current=runtime.getDiagnostics();
        work=runtime.setSettings({...settings,mode:'auto'});await Promise.resolve();
        await runtime.setSettings({...settings,mode:'current'});resolveIndirect();await work;frame();
        const cancelled=runtime.getDiagnostics();
        indirectReady=true;await runtime.setSettings(settings);frame();
        valid=false;frame();const stale=runtime.getDiagnostics();valid=true;
        shadowFailure='unsupported_device';await runtime.refresh();frame();const unsupported=runtime.getDiagnostics();
        shadowFailure='corrupt_payload';await runtime.reload();frame();const corrupt=runtime.getDiagnostics();
        runtime.dispose(); runtime.dispose();
        return {events,loading,active,current,cancelled,stale,unsupported,corrupt,loads};
    });
    expect(result.loading.status.state).toBe('loading');
    expect(result.active.status.effectiveMode).toBe('baked');
    expect(result.active.settings.receivers).toMatchObject({direct:false,indirect:true,enhanced:true});
    expect(result.current.settings.receivers.indirect).toBe(true);
    expect(result.cancelled.status.effectiveMode).toBe('current');
    expect(result.stale.status.causeState).toBe('stale');
    expect(result.unsupported.status.causeState).toBe('unavailable');
    expect(result.corrupt.status.causeState).toBe('failed');
    expect(result.events.filter(Array.isArray).every(([shadow,indirect])=>(shadow==='baked')===indirect)).toBe(true);
    expect(result.events.slice(-2)).toEqual(['receiver-disposed','shadow-disposed']);
    const output='tests/artifacts/screens/illumination_535/status';
    await mkdir(output,{recursive:true});
    for(const [name,diagnostics] of Object.entries({loading:result.loading,active:result.active,current:result.current,
        stale:result.stale,unavailable:result.unsupported,failed:result.corrupt})){
        await page.evaluate(async diagnostics=>{
            const {OptionsUI}=await import('/src/graphics/gui/options/OptionsUI.js');
            window.status535?.unmount();
            const ui=new OptionsUI({initialBakedLighting:diagnostics.settings,getBakedLightingDebugInfo:()=>diagnostics});
            window.status535=ui;ui.mount();
            [...document.querySelectorAll('.options-tab')].find(b=>/baked lighting/i.test(b.textContent)).click();
        },diagnostics);
        await page.locator('#ui-options').screenshot({path:`${output}/${name}.png`});
    }
});

test('AI 535: Options mode transactions retain separate preferences and remove retired preview controls',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {OptionsUI}=await import('/src/graphics/gui/options/OptionsUI.js');
        const {OptionsState}=await import('/src/states/OptionsState.js');
        const settings=await import('/src/app/illumination/runtime/index.js');
        let reloads=0;
        const original=settings.sanitizeBakedLightingSettings({mode:'baked',shadows:{enabled:true,dynamicResolution:'high'},receivers:{indirect:true,direct:true,enhanced:false}});
        const ui=new OptionsUI({initialBakedLighting:original,reloadBakedLighting:()=>reloads++,getBakedLightingDebugInfo:()=>({status:{state:'active',effectiveMode:'baked',requestedMode:'baked'},receiverLightmaps:{effective:{indirect:true}}})});
        ui.mount();ui._tab='bakedLighting';ui._renderTab();
        // Select the public tab ID used by the UI, then dispatch its real controls.
        const tab=[...document.querySelectorAll('.options-tab')].find(b=>/baked lighting/i.test(b.textContent));tab.click();
        const labels=ui.body.textContent;
        const mode=[...ui.body.querySelectorAll('.options-row')].find(r=>r.textContent.includes('Illumination mode'));
        [...mode.querySelectorAll('button')].find(b=>b.textContent==='Current').click();
        const edited=ui.getDraft();
        settings.saveBakedLightingSettings(edited.bakedLighting);
        const saved=settings.getResolvedBakedLightingSettings();
        let restored;
        const state=new OptionsState({setBakedLightingSettings:s=>restored=s},{popOverlay(){}});
        state._overlay=true;state._original={bakedLighting:original};state._initialDraft={bakedLighting:original};state._appliedDraft={bakedLighting:edited.bakedLighting};state._cancel();
        ui.body.querySelector('details').open=true;
        [...ui.body.querySelectorAll('button')].find(b=>b.textContent==='Reload / revalidate').click();
        await Promise.resolve();ui.unmount();
        return{labels,edited:edited.bakedLighting,saved,restored,reloads};
    });
    expect(result.labels).not.toContain('AI 548');expect(result.labels).not.toContain('Enable baked direct');expect(result.labels).not.toContain('buggy');
    expect(result.edited).toMatchObject({mode:'current',shadows:{enabled:true},receivers:{indirect:true,direct:false,enhanced:true}});
    expect(result.saved).toEqual(result.edited);expect(result.restored.mode).toBe('baked');expect(result.reloads).toBe(1);
});
