// Measures a bounded sequence of bus-only switches without a city-wide stress loop.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('tools/baking/blender.local.json', 'utf8'));
const pose = JSON.parse(await readFile('tests/fixtures/lighting/bus_reflection_toggle_pose.json', 'utf8'));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video:'off', trace:'off' });
const output = 'tests/artifacts/screens/bus_lighting_toggle_cost';

test('Bus-only toggles keep baked lighting active and report preparation cost', async ({page}) => {
    test.setTimeout(300_000); await mkdir(output,{recursive:true});
    await page.setViewportSize({width:1000,height:700});
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({mode:'auto',
        shadows:{enabled:true,dynamicResolution:'high'},receivers:{indirect:true},bus:{enabled:false}})));
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(/INVALID_OPERATION|too many errors/i.test(m.text()))errors.push(m.text());});
    await page.goto('/?coreTests=0&gameplayPose='+encodeURIComponent(JSON.stringify(pose)));
    await expect.poll(()=>page.evaluate(()=>window.__busSim?.engine?.getBakedLightingDebugInfo().status.effectiveMode),{timeout:240_000}).toBe('baked');
    await page.evaluate(() => {
        const e=window.__busSim.engine, r=e.renderer;
        window.toggleMaterials=new Set();
        window.toggleCost={compiles:[],commits:[],frames:[],longTasks:[],worldDropouts:[]};
        const compile=r.compile.bind(r);
        r.compile=(scene,camera,target) => {
            let meshes=0;const materials=new Set();scene.traverse(o=>{if(o.isMesh){meshes++;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
            const start=performance.now(), programs=r.info.programs.length;
            const result=compile(scene,camera,target);
            for(const m of materials)window.toggleMaterials.add(m);
            window.toggleCost.compiles.push({ms:performance.now()-start,meshes,materials:materials.size,newPrograms:r.info.programs.length-programs,
                keys:[...materials].map(m=>({name:m.name,keys:[...r.properties.get(m).programs.keys()]}))});
            return result;
        };
        const resync=e.resyncIBL.bind(e);e.resyncIBL=(...args)=>{const start=performance.now();const result=resync(...args);
            window.toggleCost.commits.push(performance.now()-start);return result;};
        window.toggleObserver=new PerformanceObserver(entries=>window.toggleCost.longTasks.push(...entries.getEntries().map(v=>({start:v.startTime,ms:v.duration}))));
        window.toggleObserver.observe({entryTypes:['longtask']});
        let previous=performance.now();
        const frame=now=>{window.toggleCost.frames.push(now-previous);previous=now;
            const state=e.getBakedLightingDebugInfo().status;if(state.effectiveMode!=='baked')window.toggleCost.worldDropouts.push(state);
            window.toggleCostFrame=requestAnimationFrame(frame);};window.toggleCostFrame=requestAnimationFrame(frame);
    });
    const rows=[];
    const cases=[['glass-on',{glassReflections:true}],['glass-off',{}],['glass-on-warm',{glassReflections:true}],
        ['body-on',{glassReflections:true,bodyReflections:true}],
        ['rims-on',{glassReflections:true,bodyReflections:true,rimShine:true}],['all-off',{}],
        ['all-on-warm',{glassReflections:true,bodyReflections:true,rimShine:true}]];
    for(const [name,settings] of cases) {
        const start=Date.now();
        await page.evaluate(async settings=>{const e=window.__busSim.engine;
            await e.setBakedLightingSettings({...e.bakedLightingSettings,bus:{enabled:false,...settings}});},settings);
        await page.waitForFunction(()=>window.__busSim.engine.getBakedLightingDebugInfo().busLighting.transitionState===null,null,{timeout:30_000});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        rows.push({name,elapsedMs:Date.now()-start,...await page.evaluate(()=>({programs:window.__busSim.engine.renderer.info.programs.length,
            materialPrograms:[...window.toggleMaterials].map(m=>({name:m.name,keys:[...window.__busSim.engine.renderer.properties.get(m).programs.keys()]})),
            cost:structuredClone(window.toggleCost)}))});
        await writeFile(`${output}/${process.env.BUS_TOGGLE_CAPTURE ?? 'current'}.json`,JSON.stringify({rows,errors},null,2));
    }
    await page.evaluate(()=>{cancelAnimationFrame(window.toggleCostFrame);window.toggleObserver.disconnect();});
    console.log('[Bus toggle cost] '+JSON.stringify(rows.map(r=>({name:r.name,elapsedMs:r.elapsedMs,programs:r.programs,
        compiles:r.cost.compiles.map(({keys,...cost})=>cost),maxFrameMs:Math.max(...r.cost.frames),longTasks:r.cost.longTasks}))));
    expect(errors).toEqual([]);expect(rows.every(r=>r.cost.worldDropouts.length===0)).toBe(true);
    expect(rows.at(-1).cost.compiles.every(c=>c.materials===1)).toBe(true);
    expect(rows.at(-1).cost.compiles.slice(rows.at(-2).cost.compiles.length).every(c=>c.newPrograms===0)).toBe(true);
    expect(rows.at(-1).cost.commits).toEqual([]);
});
