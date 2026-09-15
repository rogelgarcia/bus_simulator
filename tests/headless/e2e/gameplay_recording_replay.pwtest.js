// Replays recorded camera/bus frames repeatedly with matching pixels and diagnostic CPU phases.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { decodeFrameRecording, recordingFramePose } from '../../../src/app/gameplay/recording/FrameRecording.js';

test.use({ video: 'off', trace: 'off', deviceScaleFactor: 2 });

test('Recorded route: repeated exact visual poses retain baked lighting and expose frame costs', async ({ page }) => {
    test.skip(!process.env.REPLAY_INPUT, 'Set REPLAY_INPUT to a captured .busrec file.');
    test.setTimeout(600_000);
    const recording = await decodeFrameRecording(await readFile(process.env.REPLAY_INPUT, 'utf8'));
    const c = recording.columns;
    const settingsPolicy = process.env.REPLAY_SETTINGS || 'recorded';
    expect(['recorded', 'current-defaults']).toContain(settingsPolicy);
    const first = Number(process.env.REPLAY_FIRST || '0xA80'), last = Number(process.env.REPLAY_LAST || '0xE20');
    const indices = Array.from({length:recording.count}, (_,i) => i).filter(i => c.frame[i] >= first && c.frame[i] <= last);
    expect(indices.length).toBeGreaterThan(0);
    const output = `tests/artifacts/screens/recorded_slowdown/${process.env.REPLAY_NAME || 'replay'}`;
    await mkdir(output, {recursive:true});
    if (process.env.REPLAY_SHADER_BASELINE === '1') {
        const root='tests/artifacts/screens/baked_shader_loading/before-src/';
        const files=JSON.parse(await readFile(root+'files.json','utf8'));
        for(const file of files) await page.route('**/'+file,async route=>route.fulfill({
            contentType:file.endsWith('.js')?'text/javascript':'text/plain',body:await readFile(root+file,'utf8')}));
    }
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.log('Page error:',error.message); });
    page.on('console', message => { if (message.type()==='error' || message.text().startsWith('Replay lap')) console.log('Browser:',message.text().slice(0,500)); });
    const profiler = process.env.REPLAY_PROFILE_STARTUP === '1' ? await page.context().newCDPSession(page) : null;
    if (profiler) {
        await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
        await page.addInitScript(() => {
            window.startupLongTasks = [];
            window.startupPhases = []; let previous = '';
            window.startupPhaseTimer = setInterval(() => {
                const e = window.__busSim?.engine, b = e?._bakedLighting; if (!b) return;
                const phase = [b.generation,b.loading,b.ready,b.effectiveMode,b.viewRevision,b.viewPreparing,b.viewDirty,b.receivers.status.reason];
                const key = phase.join('|'); if (key === previous) return; previous = key;
                window.startupPhases.push({now:performance.now(),phase,renderFrame:e.renderer.info.render.frame});
            }, 25);
            new PerformanceObserver(list => window.startupLongTasks.push(...list.getEntries().map(e => ({start:e.startTime,ms:e.duration}))))
                .observe({type:'longtask',buffered:true});
        });
    }
    await page.setViewportSize({width:c.width[indices[0]]/2, height:c.height[indices[0]]/2+48});
    const pose = recordingFramePose(recording, indices[0]);
    await page.goto('/?debug=true&coreTests=0&gameplayPose='+encodeURIComponent(JSON.stringify(pose)));
    await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.busAnchor,null,{timeout:60_000}).catch(async error=>{
        await writeFile(`${output}/startup-failure.json`,JSON.stringify(await page.evaluate(()=>({url:location.href,state:window.__busSim?.sm?.currentName,text:document.body.innerText,baked:window.__busSim?.engine?.getBakedLightingDebugInfo()}))));
        throw error;
    });
    const readiness = await page.waitForFunction(allowRetry => {
        const b = window.__busSim?.engine?._bakedLighting;
        if (allowRetry && b?.viewError==='lighting_view_preparation_timeout' && !b.viewPreparing && !window.replayPreparationRetried) {
            window.replayPreparationRetried={at:performance.now(),reason:b.viewError};
            b.requestViewPreparation();
        }
        return b?.failure || (b?.viewError && (!allowRetry || window.replayPreparationRetried))
            || (b?.effectiveMode === 'baked' && !b.shouldHoldView() && !document.querySelector('.gameplay-loading'));
    }, process.env.REPLAY_RETRY_PREPARATION==='1', {timeout:process.env.REPLAY_RETRY_PREPARATION==='1'?280_000:150_000});
    await readiness.dispose();
    if (profiler) {
        const profile = await profiler.send('Profiler.stop'); await profiler.detach();
        await writeFile(`${output}/startup.cpuprofile`, JSON.stringify(profile.profile));
        await writeFile(`${output}/startup.json`, JSON.stringify(await page.evaluate(() => {
            clearInterval(window.startupPhaseTimer);
            return {longTasks: window.startupLongTasks, phases:window.startupPhases,baked: window.__busSim.engine._bakedLighting.getDiagnostics()};
        })));
    }
    const startupState = await page.evaluate(() => window.__busSim.engine._bakedLighting.getDiagnostics());
    if (!startupState.view.ready || startupState.status.effectiveMode !== 'baked') await writeFile(`${output}/startup-failure.json`,JSON.stringify(startupState,null,2));
    expect({ready:startupState.view.ready,mode:startupState.status.effectiveMode}, JSON.stringify(startupState)).toEqual({ready:true,mode:'baked'});
    if (process.env.REPLAY_SHADER_LOGS === '1') {
        const shaders = await page.evaluate(() => {
            const renderer = window.__busSim.engine.renderer, gl = renderer.getContext();
            const translator = gl.getExtension('WEBGL_debug_shaders');
            return renderer.info.programs.map(program => ({id:program.id, log:gl.getProgramInfoLog(program.program),
                shaders:(gl.getAttachedShaders(program.program) || []).map(shader => ({type:gl.getShaderParameter(shader,gl.SHADER_TYPE),
                    log:gl.getShaderInfoLog(shader), source:gl.getShaderSource(shader), translated:translator?.getTranslatedShaderSource(shader)}))}));
        });
        await writeFile(`${output}/shaders.json`, JSON.stringify(shaders));
        if (process.env.REPLAY_ASSERT_SHADER_LOGS === '1') expect(shaders.flatMap(p=>[p.log,...p.shaders.map(s=>s.log)]).filter(s=>/X3595|X4000/.test(s))).toEqual([]);
    }
    const holdIndex = process.env.REPLAY_HOLD_FRAME ? Array.from(c.frame).indexOf(Number(process.env.REPLAY_HOLD_FRAME)) : null;
    if (holdIndex !== null) expect(holdIndex).toBeGreaterThanOrEqual(0);
    const input = indices.map(index => { const i = holdIndex ?? index; return {frame:c.frame[i],
        bus:[c.busX[i],c.busY[i],c.busZ[i],c.busQx[i],c.busQy[i],c.busQz[i],c.busQw[i]],
        camera:[c.cameraX[i],c.cameraY[i],c.cameraZ[i],c.cameraQx[i],c.cameraQy[i],c.cameraQz[i],c.cameraQw[i]],
        projection:[c.fov[i],c.zoom[i],c.near[i],c.far[i]]}; });
    const stationaryAfterFirst=process.env.REPLAY_STATIONARY_AFTER_FIRST?Number(process.env.REPLAY_STATIONARY_AFTER_FIRST):null;
    if(stationaryAfterFirst!==null)expect(input.some(p=>p.frame===stationaryAfterFirst)).toBe(true);
    const initial = await page.evaluate(async ({input,laps,diagnostics,profileResources,stationaryAfterFirst}) => {
        const {engine:e,sm} = window.__busSim, s = sm.current;
        const gl = e.renderer.getContext(), debugGpu = gl.getExtension('WEBGL_debug_renderer_info');
        const gpuRenderer = gl.getParameter(debugGpu ? debugGpu.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
        if (/swiftshader|llvmpipe|software/i.test(gpuRenderer)) throw new Error('Hardware GPU required: '+gpuRenderer);
        const {captureRecordingSettings} = await import('/src/graphics/gui/gameplay/RecordingSettings.js');
        const configuration = captureRecordingSettings(e);
        const settings = configuration.settings;
        s._debugPanel.setMinimized(true); s.gameLoop.pause();
        const originalCamera = s._applyGameplayPoseCamera; s._applyGameplayPoseCamera = () => {};
        const originalFrame = e.updateFrame, restore = [], phases = {}, frames = [], samples = [];
        const wrap = (object,key,label) => {
            const fn = object[key];
            object[key] = function(...args) {const t=performance.now(); try{return fn.apply(this,args);}
                finally {phases[label]=(phases[label]||0)+performance.now()-t;}};
            restore.push(()=>object[key]=fn);
        };
        wrap(s,'update','state');
        wrap(e._bakedLighting,'prepareFrame','bake');
        wrap(e._bakedLighting.receivers,'validateFrame','validation');
        wrap(e._illuminationPipeline,'shadowPrepare','shadow');
        wrap(e,'_renderAoFrame','render');
        wrap(e,'_prepareDynamicAo','ao');
        wrap(e._post.pipeline,'_renderSunBloom','sunBloom');
        const detail = e._illuminationPipeline._active?.binding?.streamedDetail;
        if (detail) wrap(detail,'update','streaming');
        let passes = [], resourceEvents = [];
        if(profileResources)for(const key of ['bufferData','bufferSubData','texImage2D','texSubImage2D','texImage3D','texSubImage3D','generateMipmap','compileShader','linkProgram','getProgramParameter','getShaderParameter','getParameter','getQueryParameter']) {
            const original=gl[key];
            gl[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}
                finally{resourceEvents.push({operation:key,ms:performance.now()-t,bytes:args.find(v=>ArrayBuffer.isView(v))?.byteLength??null});}};
            restore.push(()=>gl[key]=original);
        }
        if (diagnostics) {
            wrap(gl,'getError','glError');
            const roots = new Map();
            e.scene.traverse(object => {
                let root = object;
                while (root.parent && !root.userData.staticVisibility) root = root.parent;
                roots.set(object.id,root.userData.staticVisibility?.id || root.name || root.type);
            });
            const render = e.renderer.render, shadows = e.renderer.shadowMap.render;
            e.renderer.shadowMap.render = function(...args) {
                const before = e.renderer.info.render.calls, t = performance.now();
                const result = shadows.apply(this,args);
                passes.push({type:'shadows',calls:e.renderer.info.render.calls-before,cpu:performance.now()-t});
                return result;
            };
            e.renderer.render = function(scene,camera,...args) {
                const before = this.info.render.calls, beforeFrame = this.info.render.frame, t = performance.now();
                const result = render.call(this,scene,camera,...args);
                const pass = {type:scene===e.scene?'city':scene.type,camera:camera===e.camera?'game':camera.type,
                    override:scene.overrideMaterial?.name || scene.overrideMaterial?.type || null,
                    calls:this.info.render.calls-(this.info.render.frame===beforeFrame?before:0),cpu:performance.now()-t};
                if (scene===e.scene) {
                    const groups = {};
                    const list = this.renderLists.get(scene,0);
                    for (const item of [...list.opaque,...list.transmissive,...list.transparent]) {
                        const root = roots.get(item.object.id);
                        groups[root] = (groups[root] || 0) + 1;
                    }
                    pass.roots = groups;
                }
                passes.push(pass);
                return result;
            };
            restore.push(()=>{e.renderer.render=render;e.renderer.shadowMap.render=shadows;});
        }
        const initialTimer = e._gpuFrameTimer.getDiagnostics(), longTasks = [];
        const stationaryPose = stationaryAfterFirst === null ? null : input.find(p=>p.frame===stationaryAfterFirst);
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(task => ({start:task.startTime,ms:task.duration}))));
        observer.observe({type:'longtask'});
        let cursor=0, seq=initialTimer.sampleSequence, warmup=90, previousStart=0;
        const apply = p => {
            s.busAnchor.position.fromArray(p.bus); s.busAnchor.quaternion.fromArray(p.bus,3);
            e.camera.position.fromArray(p.camera); e.camera.quaternion.fromArray(p.camera,3);
            [e.camera.fov,e.camera.zoom,e.camera.near,e.camera.far]=p.projection;
            e.camera.updateProjectionMatrix();
        };
        const drain = () => {
            const fresh=e._gpuFrameTimer.getSamplesSince(seq); samples.push(...fresh);
            if(fresh.length)seq=fresh.at(-1).sequence;
        };
        e.updateFrame = function(dt,options) {
            if (cursor>=input.length*laps) {const result=originalFrame.call(this,dt,options);drain();return result;}
            const p=stationaryPose&&cursor>=input.length?stationaryPose:input[cursor%input.length]; apply(p);
            passes = []; resourceEvents = [];
            for(const key in phases)phases[key]=0;
            const t=performance.now(), result=originalFrame.call(this,dt,options);
            const cpu=performance.now()-t; drain();
            const frameMs=previousStart?t-previousStart:null; previousStart=t;
            if(warmup>0) {warmup--; return result;}
            const bloom=e._post.pipeline._sunBloomOcclusion.frameStats;
            frames.push({sourceFrame:p.frame,lap:Math.floor(cursor/input.length),startMs:t,frameMs,cpu,...phases,
                calls:e.renderer.info.render.calls,triangles:e.renderer.info.render.triangles,
                programs:e.renderer.info.programs.length,textures:e.renderer.info.memory.textures,
                geometries:e.renderer.info.memory.geometries,
                submission:e._gpuFrameTimer.getDiagnostics().submissionSequence,
                bloom:bloom.outcome,bloomCalls:bloom.passCalls,bloomCandidates:bloom.retainedOccluderCount,
                mode:e._bakedLighting.effectiveMode,generation:e._bakedLighting.generation,hidden:document.hidden,
                streamingRequests:detail?.metrics.requests,streamingUploads:detail?.metrics.uploadMs,
                streamingEvictions:detail?.residency.evictions,
                ...(profileResources?{resourceEvents}:{}),
                ...(diagnostics ? {passes,visibilityKey:s.city.staticVisibility._runtime?._lastKey,
                    visibility:s.city.staticVisibility.getStatus()} : {})});
            cursor++;
            if(cursor%input.length===0) console.log('Replay lap',cursor/input.length,'complete');
            return result;
        };
        window.recordedReplay = {frames,input,done:()=>cursor>=input.length*laps,
            show(frame){apply(input.find(p=>p.frame===frame));},
            finish(){e.updateFrame=originalFrame;restore.reverse().forEach(fn=>fn());s._applyGameplayPoseCamera=originalCamera;observer.disconnect();
                return {frames,samples,longTasks,initialTimer,finalTimer:e._gpuFrameTimer.getDiagnostics(),baked:e._bakedLighting.getDiagnostics(),visibility:s.city.getStaticVisibilityDiagnostics(),settings:{lighting:e.lightingSettings,
                    shadows:e.shadowSettings,ao:e.ambientOcclusionSettings,aa:e.antiAliasingSettings,baked:e.bakedLightingSettings},
                    width:e.renderer.domElement.width,height:e.renderer.domElement.height};}};
        return {width:e.renderer.domElement.width,height:e.renderer.domElement.height,gpuRenderer,settings,defaults:configuration.defaults};
    }, {input,laps:Number(process.env.REPLAY_LAPS || 3),diagnostics:process.env.REPLAY_DIAGNOSTICS==='1',profileResources:process.env.REPLAY_PROFILE_RESOURCES==='1',stationaryAfterFirst});
    expect(initial).toMatchObject({width:c.width[indices[0]],height:c.height[indices[0]]});
    const normalize = value => JSON.parse(JSON.stringify(value, (key,v) => typeof v==='string' && /^https?:/.test(v) ? new URL(v).pathname : v));
    const config = recording.metadata.configurations.findLast(event=>event.sampleIndex<=indices[0]);
    const recordedSettings=config.usesDefaultValues ? recording.metadata.defaults : config.settings;
    expect(normalize(initial.settings)).toEqual(normalize(settingsPolicy==='current-defaults'?initial.defaults:recordedSettings));
    initial.settingsPolicy=settingsPolicy;
    initial.shaderSourceSnapshot=process.env.REPLAY_SHADER_BASELINE==='1'?'baked_shader_loading/before-src':'working-tree';
    initial.recordedSettings=recordedSettings;
    initial.heldSourceFrame=holdIndex===null?null:c.frame[holdIndex];
    initial.stationaryAfterFirst=stationaryAfterFirst;
    initial.profileResources=process.env.REPLAY_PROFILE_RESOURCES==='1';
    initial.preparationRetry=await page.evaluate(()=>window.replayPreparationRetried??null);
    await writeFile(`${output}/environment.json`,JSON.stringify(initial,null,2));
    console.log('Replaying',input.length,'poses at',initial.width,initial.height);
    await page.waitForFunction(()=>window.recordedReplay.done(),null,{timeout:300_000});
    await page.waitForTimeout(500);
    if (process.env.REPLAY_COMPARE_VISIBILITY) {
        const cases = JSON.parse(await readFile(process.env.REPLAY_COMPARE_VISIBILITY,'utf8'));
        const comparisons = [];
        for (const entry of cases) {
            const result = await page.evaluate(entry => {
                const {engine:e,sm} = window.__busSim, s = sm.current;
                window.recordedReplay.show(entry.frame);
                e.scene.updateMatrixWorld(true);
                const bridge = s.city.staticVisibility._bridge, gl = e.renderer.getContext();
                const width=e.renderer.domElement.width,height=e.renderer.domElement.height;
                const render = flags => {
                    flags.forEach((v,i)=>bridge.setColorVisibility(i,!!v));
                    e.renderFrame();
                    const pixels = new Uint8Array(width*height*4);
                    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                    return {pixels,png:e.renderer.domElement.toDataURL('image/png'),calls:e.renderer.info.render.calls};
                };
                render(entry.before); // Warm both paths before the paired capture.
                render(entry.after);
                const before=render(entry.before),after=render(entry.after);
                let changed=0,maxDelta=0;
                for(let i=0;i<before.pixels.length;i+=4){
                    const d=Math.max(...[0,1,2].map(c=>Math.abs(before.pixels[i+c]-after.pixels[i+c])));
                    if(d>2)changed++;
                    maxDelta=Math.max(maxDelta,d);
                }
                return {frame:entry.frame,before:before.png,after:after.png,changedPixels:changed,
                    changedFraction:changed/(width*height),maxDelta,callsBefore:before.calls,callsAfter:after.calls};
            },entry);
            for(const mode of ['before','after']) {
                await writeFile(`${output}/${entry.frame.toString(16)}-${mode}.png`,Buffer.from(result[mode].split(',')[1],'base64'));
                delete result[mode];
            }
            comparisons.push(result);
        }
        await writeFile(`${output}/visibility-comparison.json`,JSON.stringify(comparisons,null,2));
        expect(comparisons.every(row=>row.changedFraction<0.001),JSON.stringify(comparisons)).toBe(true);
    }
    const result=await page.evaluate(()=>window.recordedReplay.finish());
    if (process.env.REPLAY_CAPTURE_FINAL === '1') await page.locator('canvas').first().screenshot({path:`${output}/final.png`});
    const gpu=new Map(result.samples.map(s=>[s.submissionSequence,s.ms]));
    for(const f of result.frames)f.gpu=gpu.get(f.submission)??null;
    await writeFile(`${output}/frames.json`,JSON.stringify(result));
    const summaries=[];
    const regions = [...new Set(input.map(f=>Math.floor(f.frame/256)*256))];
    for(const lap of [...new Set(result.frames.map(f=>f.lap))])for(const region of regions){
        const frames=result.frames.filter(f=>f.lap===lap&&f.sourceFrame>=region&&f.sourceFrame<region+256);
        if (!frames.length) continue;
        const q=(key,p)=>{const a=frames.map(f=>f[key]).filter(Number.isFinite).sort((a,b)=>a-b);return a[Math.floor(a.length*p)];};
        summaries.push({lap,region:region.toString(16),gpu:q('gpu',.5),gpuP95:q('gpu',.95),cpu:q('cpu',.5),
            validation:q('validation',.5),render:q('render',.5),shadow:q('shadow',.5),sunBloom:q('sunBloom',.5),calls:q('calls',.5)});
    }
    await writeFile(`${output}/summary.json`,JSON.stringify(summaries,null,2));
    console.log(JSON.stringify(summaries));
    expect(errors).toEqual([]);
    expect(result.frames.every(f=>f.mode==='baked')).toBe(true);
    expect(new Set(result.frames.map(f=>f.generation)).size).toBe(1);
    expect(result.finalTimer.disjointCount).toBe(result.initialTimer.disjointCount);
    expect(result.finalTimer.active).toBe(true);
    expect(new Set(result.frames.map(f=>f.submission)).size).toBe(result.frames.length);
    expect(result.frames.every(f=>!f.hidden)).toBe(true);
    expect(result.frames.filter(f=>f.gpu!==null).length/result.frames.length).toBeGreaterThan(.95);
});
