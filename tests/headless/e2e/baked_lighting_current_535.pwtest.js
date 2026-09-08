// Compares Current rendering against the committed pre-535 implementation.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(existsSync(chrome))test.use({launchOptions:{executablePath:chrome,args:['--use-angle=d3d11']}});
const output='tests/artifacts/screens/illumination_535/current-compatibility';

test('AI 535: Current with absent bakes matches the committed Current engine',async({browser})=>{
    test.setTimeout(300000);await mkdir(output,{recursive:true});const results=[];let paired=[];
    const baseline=execFileSync('git',['show','HEAD:src/graphics/illumination/baked_lighting/BakedLightingRuntime.js'],{encoding:'utf8'});
    const baselineSettings=execFileSync('git',['show','HEAD:src/app/illumination/runtime/BakedLightingSettings.js'],{encoding:'utf8'});
    for(const variant of ['before','after']){
        const page=await browser.newPage({viewport:{width:1280,height:744}});
        let bakeFetches=0;
        await page.route('**/assets/baked_lighting/**',r=>{bakeFetches++;return r.fulfill({status:404,body:'fixture: no bakes'});});
        if(variant==='before'){
            await page.route('**/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js',r=>r.fulfill({contentType:'text/javascript',body:baseline}));
            await page.route('**/src/app/illumination/runtime/BakedLightingSettings.js',r=>r.fulfill({contentType:'text/javascript',body:baselineSettings}));
        }
        await page.addInitScript(()=>{
            localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({mode:'current',shadows:{enabled:false},receivers:{direct:false,indirect:false}}));
            localStorage.setItem('bus_sim.ambientOcclusion.v1',JSON.stringify({mode:'off'}));
        });
        await page.goto('http://127.0.0.1:4173/?coreTests=0&visibilityMap=0');
        await page.waitForFunction(()=>window.__busSim?.sm?.currentName==='welcome',null,{timeout:120000});
        await page.locator('#btn-start').click();await page.waitForFunction(()=>window.__busSim.sm.currentName==='bus_select',null,{timeout:120000});
        await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__busSim.sm.currentName==='game_mode',null,{timeout:120000});
        const result=await page.evaluate(async()=>{
            const {engine:e,sm}=window.__busSim;
            await Promise.all([e.waitForLightingReady(),sm.current.busModel?.userData?.readyPromise,sm.current.city?.world?.trees?.readyPromise].filter(Boolean));
            e.stop();sm.current.gameLoop.paused=true;const city=sm.current.city;
            sm.current.update=()=>{city.update(e);city.updateStaticVisibility(e.camera);};
            const bus=sm.current.busAnchor;bus.position.set(0,0,0);bus.rotation.set(0,0,0);
            e.setViewportSize(1280,720);e.renderer.setPixelRatio(1);e.renderer.setSize(1280,720,false);
            e.camera.position.set(30,12,95);e.camera.lookAt(30,6,125);e.camera.aspect=1280/720;e.camera.updateProjectionMatrix();
            for(const element of document.querySelectorAll('#hud-game,#ui-perf-bar'))element.style.visibility='hidden';
            const times=[];for(let i=0;i<120;i++){const start=performance.now();e.updateFrame(0);e.renderer.getContext().finish();if(i>=60)times.push(performance.now()-start);await new Promise(requestAnimationFrame);}
            const mean=times.reduce((s,v)=>s+v,0)/times.length;
            return{meanMs:mean,standardDeviationMs:Math.sqrt(times.reduce((s,v)=>s+(v-mean)**2,0)/times.length),samples:times.length,
                camera:e.camera.position.toArray(),renderer:e.renderer.info.render,settings:e.lightingSettings};
        });
        await page.locator('canvas').first().screenshot({path:`${output}/${variant}.png`});
        results.push({variant,bakeFetches,...result});expect(bakeFetches).toBe(0);
        if(variant==='after'){
            await page.route('**/src/graphics/illumination/baked_lighting/BakedLightingRuntimeBaseline.js',r=>r.fulfill({contentType:'text/javascript',body:baseline}));
            paired=await page.evaluate(async()=>{
                const {BakedLightingRuntime}=await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntimeBaseline.js');
                const e=window.__busSim.engine,current=e._bakedLighting,previous=new BakedLightingRuntime(e),records=[];
                previous.settings.receivers.enhanced=false;
                for(const label of ['before','after','after','before','after','before']){
                    e._bakedLighting=label==='before'?previous:current;
                    const times=[];for(let i=0;i<90;i++){const start=performance.now();e.updateFrame(0);e.renderer.getContext().finish();if(i>=30)times.push(performance.now()-start);await new Promise(requestAnimationFrame);}
                    const mean=times.reduce((s,v)=>s+v,0)/times.length;
                    records.push({label,meanMs:mean,standardDeviationMs:Math.sqrt(times.reduce((s,v)=>s+(v-mean)**2,0)/times.length),samples:times.length});
                }
                e._bakedLighting=current;previous.dispose();return records;
            });
        }
        await page.close();
    }
    const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/tests/headless/harness/index.html');
    const pixels=await page.evaluate(async()=>{
        async function read(name){const image=new Image();image.src='/tests/artifacts/screens/illumination_535/current-compatibility/'+name+'.png';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);return c.getImageData(0,0,image.width,image.height).data;}
        const a=await read('before'),b=await read('after');let changed=0,total=0,max=0;
        for(let i=0;i<a.length;i+=4){let pixel=false;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);total+=d;max=Math.max(max,d);if(d)pixel=true;}if(pixel)changed++;}
        return{changedPixels:changed,pixels:a.length/4,meanAbsoluteError:total/(a.length/4*3),max};
    });
    await writeFile(output+'/result.json',JSON.stringify({results,pixels,paired},null,2));await page.close();
    expect(pixels.meanAbsoluteError).toBeLessThan(.1);
});
