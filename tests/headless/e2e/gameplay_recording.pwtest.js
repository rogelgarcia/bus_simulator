// Verifies recording UI, GPU attribution, clipboard recovery, and actual gameplay capture cost.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { decodeFrameRecording } from '../../../src/app/gameplay/recording/FrameRecording.js';
const artifacts='tests/artifacts/screens/gameplay_recording';
test.use({video:'off',trace:'off',viewport:{width:1500,height:950}});

test('recording docks, joins delayed GPU samples, saves changed settings and retries the clipboard', async ({page}) => {
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(()=>window.__testHooks?.getEngine());
    await page.addStyleTag({url:'/src/graphics/gui/gameplay/debug_panel.css'});
    await page.evaluate(async () => {
        const THREE=await import('three');
        const {GameplayDebugPanel}=await import('/src/graphics/gui/gameplay/GameplayDebugPanel.js');
        const {GameplayFrameRecorder}=await import('/src/graphics/gui/gameplay/GameplayFrameRecorder.js');
        const {captureRecordingSettings}=await import('/src/graphics/gui/gameplay/RecordingSettings.js');
        const {EventBus}=await import('/src/app/core/EventBus.js');
        const defaults=captureRecordingSettings(window.__testHooks.getEngine()).defaults;
        const listeners=new Set(), samples=[], events=new EventBus();
        let submission=0;
        const bus=new THREE.Group(), camera=new THREE.PerspectiveCamera(55,1.5,.1,1500);
        bus.position.set(-170.123456789,1.7,42);bus.updateMatrixWorld(true);
        camera.position.set(-150,9,45); camera.rotation.set(.1,.3,.02); camera.updateMatrixWorld(true);
        const state={busAnchor:bus,city:{cityId:'bigcity2',getStaticVisibilityStatus:()=>({state:'active'})},gameLoop:{paused:false}};
        const engine={scene:new THREE.Scene(),context:{selectedBusId:'city'},simulation:{events},frameIndex:240,camera,
            renderer:{domElement:{width:1500,height:902},info:{render:{calls:1179,triangles:662000},memory:{geometries:100,textures:25},programs:[]},
                getContext:()=>({getExtension:()=>null,getParameter:()=> 'TEST GPU'})},
            addFrameListener(fn){listeners.add(fn);return()=>listeners.delete(fn);},
            _gpuFrameTimer:{getDiagnostics:()=>({active:true,submissionSequence:submission,sampleSequence:samples.length,disjointCount:0}),
                getSamplesSince:seq=>samples.filter(s=>s.sequence>seq)},
            _bakedLighting:{generation:2,effectiveMode:'baked',shouldHoldView:()=>false},
            getBakedLightingStatus:()=>({indirect:{state:'active'}}),getBakedLightingDebugInfo:()=>({status:{}})};
        for(const [key,value] of Object.entries(defaults))engine[`${key}Settings`]=value;
        engine.shadowSettings=defaults.shadows;
        const recorder=new GameplayFrameRecorder({engine,state}),panel=new GameplayDebugPanel({events,recorder,getGameplayPose:()=>({})});
        state._debugPanel=panel;panel.attach();
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.recordedText=text;}}});
        window.fixture={engine,state,recorder,panel,listeners,samples,events,tick(submit=true){
            engine.frameIndex++;
            if(submit)submission++;
            for(const fn of listeners)fn({frameIndex:engine.frameIndex,rawDt:.016,cpuMs:7.5,rendered:true,gpuSubmitted:true});
        }};
    });
    const record=page.getByRole('button',{name:'Record',exact:true});
    expect((await record.boundingBox()).x).toBeLessThan((await page.getByRole('button',{name:'Copy camera position',exact:true}).boundingBox()).x);
    await record.click();
    await expect(page.locator('#hud-gameplay-debug')).toHaveClass(/is-minimized/);
    await expect(page.getByRole('button',{name:'Stop recording',exact:true})).toBeVisible();
    await page.evaluate(()=>{
        const f=window.fixture; f.tick();
        f.samples.push({sequence:1,submissionSequence:1,ms:27.125});
        f.engine.lightingSettings={...f.engine.lightingSettings,exposure:.333};
        f.events.emit('options:applied',{}); f.tick();
    });
    const widget=await page.locator('.gpd-recording').boundingBox(), dock=await page.locator('#hud-gameplay-debug').boundingBox();
    expect(widget.y+widget.height).toBeLessThan(dock.y);
    await mkdir(artifacts,{recursive:true}); await page.screenshot({path:`${artifacts}/recording-widget.png`});
    await page.getByRole('button',{name:'Stop recording',exact:true}).click();
    await page.evaluate(()=>{
        window.fixture.samples.push({sequence:2,submissionSequence:2,ms:18.625});window.fixture.tick();
    });
    await expect(page.locator('.gpd-recording-status')).toContainText('Copied');
    const decoded=await decodeFrameRecording(await page.evaluate(()=>window.recordedText));
    expect(decoded.count).toBe(2);expect([...decoded.columns.frame]).toEqual([241,242]);
    expect([...decoded.columns.gpuMs]).toEqual([27.125,18.625]);
    expect(decoded.columns.busX[0]).toBe(-170.123456789);
    expect(decoded.metadata.configurations[0].usesDefaultValues).toBe(true);
    expect(decoded.metadata.configurations.map(event=>event.sampleIndex)).toEqual([0,1]);
    expect(decoded.metadata.configurations[1].settings.lighting.exposure).toBe(.333);
    await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Blocked');};document.execCommand=()=>false;});
    await page.getByRole('button',{name:'Copy again',exact:true}).click();
    await expect(page.locator('.gpd-recording-status')).toContainText('Copy blocked');
    await expect(page.getByRole('button',{name:'Download',exact:true})).toBeVisible();
    await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.recordedText=text;};});
    await page.getByRole('button',{name:'Copy again',exact:true}).click();
    await expect(page.locator('.gpd-recording-status')).toContainText('Copied');
    await page.getByRole('button',{name:'Restore debug panel',exact:true}).click();
    await record.click();await page.evaluate(()=>{window.fixture.tick();window.fixture.tick(false);});
    await page.getByRole('button',{name:'Stop recording',exact:true}).click();
    await page.evaluate(()=>{
        window.fixture.samples.push({sequence:3,submissionSequence:4,ms:11});window.fixture.tick(false);
    });
    await expect(page.locator('.gpd-recording-status')).toContainText('Copied');
    const skipped=await decodeFrameRecording(await page.evaluate(()=>window.recordedText));
    expect([...skipped.columns.gpuMs]).toEqual([11,NaN]);
    expect([...skipped.columns.gpuSubmission]).toEqual([4,0]);
    await page.setViewportSize({width:390,height:800});
    const bounds=await page.locator('.gpd-recording').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
    await page.getByRole('button',{name:'Restore debug panel',exact:true}).click();
    await record.click();await page.evaluate(()=>window.fixture.tick());
    await page.evaluate(()=>window.fixture.panel.destroy());
    expect(await page.evaluate(()=>window.fixture.listeners.size)).toBe(0);
    expect(await page.evaluate(()=>window.fixture.recorder._chunks.length)).toBe(0);
});

test('real debug gameplay records every frame with low sampling overhead and a matching stats counter', async ({page}) => {
    test.setTimeout(180000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.recordedText=text;}}}));
    await page.goto('/?pose=civic_center_curve_front&debug=true&coreTests=0');
    await page.waitForFunction(()=>window.__busSim?.sm?.current?.busModel?.userData?.readyPromise && !document.querySelector('.gameplay-loading'),null,{timeout:120000});
    await page.evaluate(async()=>await window.__busSim.sm.current.busModel.userData.readyPromise);
    await expect(page.locator('.ui-perf-debug-line')).toContainText(/Frame: 0x[0-9A-F]+\s+Camera:/);
    const height=await page.locator('#ui-perf-bar').evaluate(el=>el.getBoundingClientRect().height);expect(height).toBe(48);
    await page.getByRole('button',{name:'Record',exact:true}).click();
    await page.waitForFunction(()=>window.__busSim.sm.current._frameRecorder.count>=140);
    await mkdir(artifacts,{recursive:true}); await page.screenshot({path:`${artifacts}/gameplay-recording.png`});
    const correlation=await page.evaluate(()=>{
        const recorder=window.__busSim.sm.current._frameRecorder, i=(recorder.count-1)%1024;
        return {last:recorder._chunks.at(-1).frame[i],text:document.querySelector('.ui-perf-debug-line').textContent};
    });
    expect(correlation.text).toContain(`0x${correlation.last.toString(16).toUpperCase().padStart(8,'0')}`);
    await page.getByRole('button',{name:'Stop recording',exact:true}).click();
    await expect(page.locator('.gpd-recording-status')).toContainText('Copied',{timeout:10000});
    const text=await page.evaluate(()=>window.recordedText), decoded=await decodeFrameRecording(text);
    await writeFile(`${artifacts}/gameplay.busrec`,text);
    for(let i=1;i<decoded.count;i++)expect(decoded.columns.frame[i]).toBe(decoded.columns.frame[i-1]+1);
    expect([...decoded.columns.cpuMs].every(Number.isFinite)).toBe(true);
    expect([...decoded.columns.gpuMs].some(Number.isFinite)).toBe(true);
    const overhead=[...decoded.columns.recorderCpuMs].sort((a,b)=>a-b);
    expect(overhead[Math.floor(overhead.length/2)]).toBeLessThan(2);
    console.log(JSON.stringify({frames:decoded.count,clipboardBytes:text.length,recorderMedianMs:overhead[Math.floor(overhead.length/2)],
        usesDefaultValues:decoded.metadata.configurations[0].usesDefaultValues,missingGpu:[...decoded.columns.gpuMs].filter(v=>!Number.isFinite(v)).length}));
    await page.evaluate(()=>window.__busSim.sm.go('welcome'));
    await expect(page.locator('.ui-perf-debug-line')).toBeHidden();
    expect(await page.locator('#ui-perf-bar').evaluate(el=>el.getBoundingClientRect().height)).toBe(24);
    expect(errors).toEqual([]);
});
