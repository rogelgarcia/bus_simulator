// Installed-city mode, channel, Lighting-tab compatibility and timing evidence.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const output = 'tests/artifacts/screens/illumination_535/final';

test('AI 535: complete modes preserve live lighting and exact indirect compatibility', async ({ page }) => {
    test.setTimeout(1200000);
    await mkdir(output, { recursive: true });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /shader|WebGLProgram|GL_INVALID/i.test(m.text())) errors.push(m.text()); });
    page.on('request', r => { if (r.url().includes('/assets/baked_lighting/')) requests.push(r.url()); });
    await page.setViewportSize({ width: 1280, height: 744 });
    await page.addInitScript(() => {
        localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ mode:'current', shadows:{enabled:true,dynamicResolution:'medium'},receivers:{indirect:true,direct:true,enhanced:false} }));
        localStorage.setItem('bus_sim.ambientOcclusion.v1', JSON.stringify({mode:'off'}));
    });
    await page.goto('/?coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, {timeout:120000});
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, {timeout:120000});
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, {timeout:120000});
    await page.evaluate(async () => {
        const {engine:e,sm}=window.__busSim;
        const {OptionsState}=await import('/src/states/OptionsState.js');
        await Promise.all([e.waitForLightingReady(),sm.current.busModel?.userData?.readyPromise,sm.current.city?.world?.trees?.readyPromise].filter(Boolean));
        e.stop();sm.current.gameLoop.paused=true;
        const city=sm.current.city;
        sm.current.update=()=>{city.update(e);city.updateStaticVisibility(e.camera);};
        e.setViewportSize(1280,720); e.renderer.setPixelRatio(1); e.renderer.setSize(1280,720,false);
        e.camera.aspect=1280/720;e.camera.updateProjectionMatrix();
        e.scene.updateMatrixWorld(true);
        window.mode535={e,city,settings:e.bakedLightingSettings,lighting:structuredClone(e.lightingSettings),atmosphere:structuredClone(e.atmosphereSettings),
            applyLighting(lighting,atmosphere){
                const state=new OptionsState(e,{});
                state._appliedDraft={lighting:e.lightingSettings,atmosphere:e.atmosphereSettings};
                state._applyDraft({lighting,atmosphere});
            },
            async finishRefresh(){let done=false;const work=e.refreshBakedLighting().finally(()=>done=true);const start=performance.now();
                while(!done||e.getBakedLightingDebugInfo().status.state==='loading'){await this.frames();if(performance.now()-start>300000)throw new Error(JSON.stringify(e.getBakedLightingDebugInfo().status));}await work;return e.getBakedLightingDebugInfo();},
            async frames(n=1){for(let i=0;i<n;i++){e.updateFrame(0);await new Promise(requestAnimationFrame);}},
            async measure(){await this.frames(20);const times=[];for(let i=0;i<60;i++){const start=performance.now();e.updateFrame(0);e.renderer.getContext().finish();times.push(performance.now()-start);await new Promise(requestAnimationFrame);}const mean=times.reduce((s,v)=>s+v,0)/times.length;return {meanMs:mean,fps:1000/mean,standardDeviationMs:Math.sqrt(times.reduce((s,v)=>s+(v-mean)**2,0)/times.length),samples:times.length,diagnostics:e.getBakedLightingDebugInfo(),ao:e.getAmbientOcclusionDebugInfo()};},
            start(mode){this.done=false;this.work=e.setBakedLightingSettings({...this.settings,mode}).finally(()=>this.done=true);},
            async settle(){const start=performance.now();while(!this.done||e.getBakedLightingDebugInfo().status.state==='loading'){await this.frames();if(performance.now()-start>300000)throw new Error(JSON.stringify(e.getBakedLightingDebugInfo()));}await this.work;return e.getBakedLightingDebugInfo();}
        };
        await window.mode535.frames(5);
    });
    expect(requests).toEqual([]);
    const records=[];
    async function record(label){console.log('AI535',label);records.push({label,...await page.evaluate(()=>window.mode535.measure())});await page.locator('canvas').first().screenshot({path:`${output}/${label}.png`});await writeFile(`${output}/results.json`,JSON.stringify({records,requests,errors},null,2));}
    await record('current');
    await page.evaluate(()=>window.mode535.start('baked'));
    await record('loading');
    const activated=await page.evaluate(()=>window.mode535.settle());
    await writeFile(`${output}/activation.json`,JSON.stringify(activated,null,2));
    expect(activated.status.effectiveMode,JSON.stringify(activated.status)).toBe('baked');
    expect(activated.receiverLightmaps.effective).toEqual({direct:false,indirect:true});
    await record('baked');
    for(const mode of ['current','auto','current','baked']){
        await page.evaluate(mode=>window.mode535.start(mode),mode);
        await page.evaluate(()=>window.mode535.settle());await record(mode==='auto'?'auto-baked':`${mode}-cached`);
    }

    const lightingChecks=[];
    for(const key of ['exposure','toneMapping','background','sky']){
        const result=await page.evaluate(async key=>{
            const t=window.mode535,l=structuredClone(t.lighting),a=structuredClone(t.atmosphere);
            if(key==='exposure')l.exposure*=.8;
            if(key==='toneMapping')l.toneMapping='agx';
            if(key==='background')l.ibl.setBackground=!l.ibl.setBackground;
            if(key==='sky'){a.sky.horizonColor='#DDDDFF';a.sky.exposure*=.8;}
            const before=t.e._bakedLighting.generation;
            t.applyLighting(l,a);await t.frames(3);
            const status=t.e.getBakedLightingDebugInfo();
            t.applyLighting(t.lighting,t.atmosphere);await t.frames(3);
            return {key,before,after:t.e._bakedLighting.generation,status};
        },key);
        lightingChecks.push(result);
        expect(result.status.status.effectiveMode,key).toBe('baked');expect(result.before,key).toBe(result.after);
    }
    for(const key of ['sunIntensity','hemiIntensity','iblIntensity','iblEnabled','sunDirection']){
        console.log('AI535 lighting',key);
        const result=await page.evaluate(async key=>{
            const t=window.mode535,l=structuredClone(t.lighting),a=structuredClone(t.atmosphere);
            if(key==='sunIntensity')l.sunIntensity+=1;
            if(key==='hemiIntensity')l.hemiIntensity+=.2;
            if(key==='iblIntensity')l.ibl.envMapIntensity+=.1;
            if(key==='iblEnabled')l.ibl.enabled=false;
            if(key==='sunDirection')a.sun.azimuthDeg+=1;
            t.applyLighting(l,a);await t.frames(2);
            const immediate=t.e.getBakedLightingDebugInfo();
            const settled=await t.finishRefresh();
            return {key,immediate,settled};
        },key);
        lightingChecks.push(result);
        expect(result.immediate.status.effectiveMode,key).toBe('current');
        expect(result.immediate.receiverLightmaps.effective.indirect,key).toBe(false);
        expect(result.settled.status.effectiveMode,key).toBe('current');
        if(key==='sunDirection')await record('fallback');
        await writeFile(output+'/lighting-interactions.json',JSON.stringify(lightingChecks,null,2));
        const restored=await page.evaluate(async()=>{const t=window.mode535;t.applyLighting(t.lighting,t.atmosphere);await t.frames(2);return t.finishRefresh();});
        expect(restored.status.effectiveMode,JSON.stringify(restored.status)).toBe('baked');
    }
    await page.route('**/assets/baked_lighting/shadows/package_index.json',r=>r.fulfill({status:404,body:'fixture: absent package'}));
    await page.evaluate(async()=>{const t=window.mode535;await t.e.setBakedLightingSettings({...t.settings,mode:'current'});t.e._bakedLighting.shadows.invalidate();});
    await page.evaluate(()=>window.mode535.start('auto'));await page.evaluate(()=>window.mode535.settle());
    await record('auto-current');
    expect(records.at(-1).diagnostics.status.effectiveMode).toBe('current');
    expect(requests.some(url=>/direct_receiver|direct-/.test(url))).toBe(false);

    await writeFile(`${output}/results.json`,JSON.stringify({records,requests,errors},null,2));
    expect(errors).toEqual([]);
});
