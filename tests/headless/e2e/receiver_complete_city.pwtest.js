// Validates an unpublished complete bake at the user's reported locations before publication.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.use({launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}});

test('Complete receiver candidate: coverage, channel isolation, cached toggles and fixed-camera captures',async({page})=>{
    test.setTimeout(1_800_000);
    const installed=process.env.AI553_INSTALLED==='1';
    const root=path.resolve('tests/artifacts/screens/illumination_553/'+(installed?'validation-installed':'validation-final')); await mkdir(root,{recursive:true});
    const bakeRoot=path.resolve('tests/artifacts/screens/illumination_553/bake');
    const latest=JSON.parse(await readFile(path.join(bakeRoot,'latest.json')));
    const directory=path.join(bakeRoot,latest.directory);
    const index=JSON.parse(await readFile(path.join(directory,'package_index.json')));
    expect(index.mapping.coverage.complete).toBe(true);
    if(!installed)await page.route('**/assets/baked_lighting/receivers/enhanced/**',async route=>{
        const name=path.basename(new URL(route.request().url()).pathname);
        await route.fulfill({status:302,headers:{location:'/'+path.relative(process.cwd(),path.join(directory,name)).replaceAll('\\','/')}});
    });
    const errors=[], requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
    page.on('request',r=>{if(/\.ilpkg\.gz/.test(r.url()))requests.push(r.url());});
    await page.setViewportSize({width:1600,height:900});
    await page.addInitScript(()=>localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({shadows:{enabled:true,dynamicResolution:'high'},receivers:{enhanced:true,direct:true,indirect:true}})));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(()=>window.__busSim?.sm?.currentName==='welcome',null,{timeout:120000}); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__busSim?.sm?.currentName==='bus_select'); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__busSim?.sm?.currentName==='game_mode',null,{timeout:120000});
    await page.waitForFunction(()=>{
        const state=window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps;
        if(state.state==='fallback')throw new Error(JSON.stringify(state));
        return state.state==='active'&&state.activationBlend===1&&state.effective.direct&&state.effective.indirect;
    },null,{timeout:300000});
    const context=await page.evaluate(async()=>{
        const {engine:e,sm}=window.__busSim; await e.waitForLightingReady();
        for(let i=0;i<120;i++)await new Promise(requestAnimationFrame);
        e.stop(); sm.current.gameLoop.paused=true;
        sm.current.update=()=>{e.context.city.update(e);e.context.city.updateStaticVisibility(e.camera);};
        for(const id of ['hud-game','ui-perf-bar'])document.getElementById(id).style.visibility='hidden';
        window.completeMode=async receivers=>{
            let done=false,frames=0;const start=performance.now();
            const work=e.setBakedLightingSettings({shadows:{enabled:true,dynamicResolution:'high'},receivers:{enhanced:false,direct:false,indirect:false,debug:'final',...receivers}}).finally(()=>done=true);
            while(true){
                e.updateFrame(0);await new Promise(requestAnimationFrame);frames++;
                const d=e.getBakedLightingDebugInfo().receiverLightmaps;
                if(done&&d.state==='fallback')throw new Error(JSON.stringify(d));
                if(performance.now()-start>300000)throw new Error('Activation timeout '+JSON.stringify(d));
                if(done&&frames>10&&(!(receivers.direct||receivers.indirect)||(d.state==='active'&&d.activationBlend===1)))break;
            }
            await work;return e.getBakedLightingDebugInfo().receiverLightmaps;
        };
        const gl=e.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
        return {gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),browser:navigator.userAgent,
            viewport:[innerWidth,innerHeight],pixelRatio:e.renderer.getPixelRatio(),lighting:e.lightingSettings,startup:e.getBakedLightingDebugInfo().receiverLightmaps};
    });
    expect(context.startup.state).toBe('active'); expect(context.startup.activationBlend).toBe(1);
    expect(context.startup.profileId).toBe(index.profileId);
    if(installed)await page.evaluate(async()=>{
        const e=window.__busSim.engine,{EnhancedReceiverLightmapRuntime}=await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
        window.installedCompleteBank=e._bakedLighting.receiverModes.enhanced;
        window.historicalBank=new EnhancedReceiverLightmapRuntime(e);
        window.historicalBank.indexUrl='/tests/artifacts/screens/illumination_optimization/bake/41ee1d3ead9e50419a590ce2445490a438e8033adf3bd18aafa95dd283e0d8bb/package_index.json';
    });
    const results=[];
    for(const [topic,position,target] of [['platform',[-35,18,39],[-47,1,21]],['grass',[-195,12,3],[-176,1,15]],['curb',[-149,6,44],[-161,.1,29]]]){
        await page.evaluate(({position,target})=>{const e=window.__busSim.engine;e.camera.position.fromArray(position);e.camera.lookAt(...target);e.camera.updateMatrixWorld(true);e.updateFrame(0);},{position,target});
        for(const [name,receivers] of [
            ['live',{}],['original',{direct:true,indirect:true}],['complete-direct',{enhanced:true,direct:true}],
            ['complete-indirect',{enhanced:true,indirect:true}],['complete',{enhanced:true,direct:true,indirect:true}],
            ['coverage',{enhanced:true,direct:true,indirect:true,debug:'unmapped'}]
        ]){
            console.log('COMPLETE_CAPTURE '+topic+' '+name);
            const diagnostics=await page.evaluate(r=>window.completeMode(r),receivers);
            if(receivers.enhanced){expect(diagnostics.state).toBe('active');expect(diagnostics.runtimeCoverage.omittedTriangles).toBe(0);}
            if(receivers.direct)expect(diagnostics.effective.direct).toBe(true);
            if(receivers.indirect)expect(diagnostics.effective.indirect).toBe(true);
            await page.screenshot({path:path.join(root,`${topic}-${name}.png`)});
            results.push({topic,name,diagnostics});
            await writeFile(path.join(root,'captures.json'),JSON.stringify({context,results,errors},null,2));
        }
        if(installed) {
            const diagnostics=await page.evaluate(async()=>{
                const e=window.__busSim.engine;
                await window.completeMode({enhanced:true,direct:false,indirect:false});
                e._bakedLighting.receiverModes.enhanced=window.historicalBank;
                return window.completeMode({enhanced:true,direct:true,indirect:true});
            });
            await page.screenshot({path:path.join(root,`${topic}-before.png`)});
            results.push({topic,name:'before',diagnostics});
            await page.evaluate(async()=>{
                const e=window.__busSim.engine;
                await window.completeMode({enhanced:true,direct:false,indirect:false});
                e._bakedLighting.receiverModes.enhanced=window.installedCompleteBank;
                await window.completeMode({enhanced:true,direct:true,indirect:true});
            });
            await writeFile(path.join(root,'captures.json'),JSON.stringify({context,results,errors},null,2));
        }
    }
    const sidewalk=await page.evaluate(async()=>{
        const T=await import('three'),bank=window.__busSim.engine._bakedLighting.receiverModes.enhanced;
        const entry=bank.bindings.geometries.find(e=>e.object.name==='Sidewalk');
        if(!entry)throw new Error('Reported Sidewalk receiver not found');
        const source=new T.Mesh(entry.original,entry.object.material);source.matrixWorld.copy(entry.object.matrixWorld);
        const ray=new T.Raycaster(new T.Vector3(-155.9087267051931,2.191,31.390964459648604),new T.Vector3(0,-1,0));
        const hits=object=>ray.intersectObject(object,false).filter(h=>Math.abs(h.point.y-.191)<1e-4).map(h=>h.faceIndex);
        return {before:hits(source),after:hits(entry.object),coverage:bank.bindings.coverage};
    });
    await writeFile(path.join(root,'sidewalk-ownership.json'),JSON.stringify(sidewalk,null,2));
    expect(sidewalk.before.length).toBeGreaterThan(1);expect(sidewalk.after).toHaveLength(1);
    expect(sidewalk.coverage.overlappingTriangles).toBeGreaterThan(0);
    const residentRequests=[...requests],cycles=[];
    for(let cycle=0;cycle<6;cycle++){
        for(const enabled of [false,true])await page.evaluate(r=>window.completeMode(r),{enhanced:true,direct:enabled,indirect:enabled});
        cycles.push(await page.evaluate(()=>{const e=window.__busSim.engine;return {programs:e.renderer.info.programs.length,textures:e.renderer.info.memory.textures,geometries:e.renderer.info.memory.geometries,
            diagnostics:e.getBakedLightingDebugInfo().receiverLightmaps};}));
    }
    await writeFile(path.join(root,'toggles.json'),JSON.stringify({cycles,requests,errors},null,2));
    expect(requests).toEqual(residentRequests);
    expect(new Set(cycles.slice(1).map(c=>c.programs)).size).toBe(1);
    expect(new Set(cycles.slice(1).map(c=>c.textures)).size).toBe(1);
    expect(new Set(cycles.slice(1).map(c=>c.geometries)).size).toBe(1);
    if(installed){expect(errors).toEqual([]);return;}
    await page.setViewportSize({width:3520,height:1624});
    await page.evaluate(async()=>{
        const e=window.__busSim.engine;
        e.camera.position.set(-35,18,39);e.camera.lookAt(-47,1,21);e.camera.updateMatrixWorld(true);
        const {EnhancedReceiverLightmapRuntime}=await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
        window.completeBank=e._bakedLighting.receiverModes.enhanced;
        window.beforeBank=new EnhancedReceiverLightmapRuntime(e);
        window.beforeBank.indexUrl='/tests/artifacts/screens/illumination_optimization/bake/41ee1d3ead9e50419a590ce2445490a438e8033adf3bd18aafa95dd283e0d8bb/package_index.json';
    });
    const measurements=[];
    for(let round=0;round<3;round++)for(const mode of round%2?['complete','before','original']:['original','before','complete']){
        console.log('COMPLETE_BENCHMARK '+round+' '+mode);
        const measurement=await page.evaluate(async mode=>{
            const e=window.__busSim.engine;
            await window.completeMode({enhanced:e._bakedLighting.settings.receivers.enhanced,direct:false,indirect:false});
            e._bakedLighting.receiverModes.enhanced=mode==='before'?window.beforeBank:window.completeBank;
            await window.completeMode({enhanced:mode!=='original',direct:true,indirect:true});
            const cpu=[],intervals=[],timer=e._gpuFrameTimer;let previous=performance.now();
            for(let frame=0;frame<300;frame++){
                if(frame===60)timer?.resetSamples();
                const before=performance.now();e.updateFrame(0);
                if(frame>=60)cpu.push(performance.now()-before);
                const now=await new Promise(requestAnimationFrame);
                if(frame>=60)intervals.push(now-previous);previous=now;
            }
            timer?.poll();
            return {cpu,intervals,gpu:timer?.getSamplesSince(0).map(s=>s.ms)??[],gpuDiagnostics:timer?.getDiagnostics(),
                viewport:[innerWidth,innerHeight],pixelRatio:e.renderer.getPixelRatio(),camera:e.camera.position.toArray(),draw:{...e.renderer.info.render},
                programs:e.renderer.info.programs.length,diagnostics:e.getBakedLightingDebugInfo().receiverLightmaps};
        },mode);
        measurements.push({round,mode,...measurement});
        expect(measurement.diagnostics.state).toBe('active');
        expect(measurement.gpuDiagnostics.disjointCount).toBe(0);
        await writeFile(path.join(root,'benchmark.json'),JSON.stringify({context,measurements,errors},null,2));
        if(round===0)await page.screenshot({path:path.join(root,'wide-'+mode+'.png')});
    }
    expect(errors).toEqual([]);
});
