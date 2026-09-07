// Verifies actual material output, complete contact coverage, participant movement and restoration.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('Dynamic contact affects ambient only and follows parked, moving and off-screen participants', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { DynamicAoRuntime } = await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const { sanitizeAmbientOcclusionSettings } = await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true }); renderer.setSize(256,256); renderer.toneMapping=T.NoToneMapping;
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(45,1,.1,100);
        camera.position.set(0,12,9); camera.lookAt(0,0,0);
        const floor = new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:0xffffff,roughness:1}));
        floor.rotation.x=-Math.PI/2; scene.add(floor);
        const vehicle = new T.Group(), body = new T.Mesh(new T.BoxGeometry(2,2,8),new T.MeshPhongMaterial({color:0x4080ff}));
        body.position.y=1.3; vehicle.add(body); scene.add(vehicle);
        const originalGeometry=body.geometry;
        const ambient=new T.HemisphereLight(0xffffff,0xffffff,2); scene.add(ambient);
        const sun=new T.DirectionalLight(0xffffff,2); sun.position.set(0,10,2); scene.add(sun);
        const runtime=new DynamicAoRuntime(), settings=sanitizeAmbientOcclusionSettings({scope:'dynamic'});
        const participants=[{id:'vehicle',root:vehicle,cast:true,receive:true,aoUnderbody:{min:[-1,.3,-4],max:[1,.3,4]}}];
        const target=new T.WebGLRenderTarget(256,256,{type:T.FloatType}); renderer.setRenderTarget(target);
        const read = (x=0,z=0,y=0) => {
            const uv=new T.Vector3(x,y,z).project(camera), pixel=new Float32Array(4);
            renderer.readRenderTargetPixels(target,Math.floor((uv.x*.5+.5)*256),Math.floor((uv.y*.5+.5)*256),1,1,pixel);return pixel[0];
        };
        const render = (enabled, direct=true) => {
            vehicle.visible=true; sun.visible=direct;
            runtime.update({renderer,scene,camera,participants,settings,enabled});
            vehicle.visible=false; renderer.render(scene,camera);
            return [-3,0,3].map(z=>read(0,z));
        };
        const baseline=render(false), contact=render(true), ambientContact=render(true,false), ambientBaseline=render(false,false);
        vehicle.visible=true; vehicle.position.x=8; const moved=render(true,false);
        vehicle.position.x=0; const restored=render(true,false);
        const away=read(6,0);
        vehicle.rotation.y=Math.PI/2; const rotated=render(true,false); const rotatedTip=read(3,0);
        vehicle.rotation.y=0;
        body.position.y=1;
        participants[0].aoUnderbody={min:[-1,0,-4],max:[1,0,4]};
        const touching=render(true,false), shoulder=read(1.3,0), beyondReach=read(2.6,0);
        body.position.y=1.3;participants[0].aoUnderbody={min:[-1,.3,-4],max:[1,.3,4]};
        vehicle.position.y=.7;const elevated=render(true,false);vehicle.position.y=0;
        camera.position.set(1.2,.2,0);camera.lookAt(4,0,0);camera.updateMatrixWorld(true);
        render(true,false);const offscreen=read(1.6,0);
        const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const offscreenCaster=!frustum.intersectsBox(new T.Box3().setFromObject(body));
        participants[0].cast=false;render(true,false);const noCaster=read(1.6,0);
        camera.position.set(0,12,9);camera.lookAt(0,0,0);participants[0].cast=true;
        const wall=new T.Mesh(new T.PlaneGeometry(8,6),new T.MeshStandardMaterial({color:0xffffff,roughness:1}));
        wall.rotation.y=-Math.PI/2;wall.position.set(1.3,3,0);scene.add(wall);
        render(false,false);const wallBaseline=read(1.3,0,1);
        render(true,false);const wallContact=read(1.3,0,1);
        wall.position.x=2;render(false,false);const farWallBaseline=read(2,0,1);
        render(true,false);const farWallContact=read(2,0,1);wall.visible=false;
        const methodA=render(true,false);
        settings.dynamic.busMethod='gtao';const methodB=render(true,false), genericMethod=runtime.diagnostics.method;
        settings.dynamic.busMethod='analytic';const methodRestored=render(true,false);
        const programs=[];for(let i=0;i<4;i++){render(false);render(true);programs.push(renderer.info.programs.length);}
        const diagnostics={...runtime.diagnostics};
        vehicle.visible=true; runtime.dispose(); const geometryRestored=body.geometry===originalGeometry;
        const glError=renderer.getContext().getError(); renderer.dispose();target.dispose();
        return {baseline,contact,ambientContact,ambientBaseline,moved,restored,away,rotated,rotatedTip,touching,shoulder,beyondReach,elevated,offscreen,offscreenCaster,noCaster,wallBaseline,wallContact,farWallBaseline,farWallContact,methodA,methodB,methodRestored,genericMethod,programs,diagnostics,geometryRestored,glError};
    });
    await mkdir('tests/artifacts/screens/illumination_534',{recursive:true});
    await writeFile('tests/artifacts/screens/illumination_534/dynamic-contact.json',JSON.stringify({result,errors},null,2));
    expect(errors).toEqual([]); expect(result.glError).toBe(0); expect(result.geometryRestored).toBe(true);
    for(let i=0;i<3;i++) {
        expect(result.ambientContact[i]).toBeLessThan(result.ambientBaseline[i]*.75);
        // Adding sunlight must add the same direct energy with AO on or off.
        expect(result.contact[i]-result.ambientContact[i]).toBeCloseTo(result.baseline[i]-result.ambientBaseline[i],4);
        expect(result.elevated[i]).toBeGreaterThan(result.ambientContact[i]);
        expect(result.restored[i]).toBeCloseTo(result.ambientContact[i],5);
        expect(result.moved[i]).toBeCloseTo(result.ambientBaseline[i],5);
    }
    expect(result.away).toBeCloseTo(result.ambientBaseline[0],5);
    expect(result.rotatedTip).toBeLessThan(result.ambientBaseline[0]*.75);
    expect(result.touching.every(v=>v<result.ambientBaseline[0]*.25)).toBe(true);
    expect(result.shoulder).toBeGreaterThan(result.touching[1]);
    expect(result.beyondReach).toBeCloseTo(result.ambientBaseline[0],5);
    expect(result.offscreenCaster).toBe(true);expect(result.offscreen).toBeLessThan(result.noCaster*.99);
    expect(result.wallContact).toBeLessThan(result.wallBaseline*.8);
    expect(result.farWallContact/result.farWallBaseline).toBeGreaterThan(result.wallContact/result.wallBaseline);
    expect(result.genericMethod).toBe('generic-dynamic-gtao');
    expect(Math.max(...result.methodA.map((v,i)=>Math.abs(v-result.methodB[i])))).toBeGreaterThan(.05);
    result.methodA.forEach((v,i)=>expect(result.methodRestored[i]).toBeCloseTo(v,5));
    expect(new Set(result.programs).size).toBe(1);
});
