// Actual loaded bus materials must match with and without a postprocessing composer.
import {test,expect} from '@playwright/test';

test('city bus retains camera exposure when optional postprocessing is absent',async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    await page.waitForFunction(()=>!!window.__testHooks);
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {createCityBus}=await import('/src/graphics/assets3d/models/buses/CityBus.js');
        const {EffectComposer}=await import('three/addons/postprocessing/EffectComposer.js');
        const {RenderPass}=await import('three/addons/postprocessing/RenderPass.js');
        const {createColorGradingOutputPass}=await import('/src/graphics/visuals/postprocessing/ColorGradingPass.js');
        const bus=createCityBus({id:'city'});await bus.userData.readyPromise;
        const materials=new Map();bus.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.isMaterial)materials.set(m.uuid,m);});
        const paint=[...materials.values()].find(m=>m.name==='paint');
        if(!paint)throw new Error('Actual bus paint missing');
        const renderer=window.__testHooks.getEngine().renderer;
        renderer.setSize(64,64);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.0511001705221839;
        const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
        const material=paint.clone(),geometry=new THREE.PlaneGeometry(2,2);
        material.defines={};scene.add(new THREE.Mesh(geometry,material),new THREE.AmbientLight(0xffffff,100));
        const composer=new EffectComposer(renderer),output=createColorGradingOutputPass();
        composer.addPass(new RenderPass(scene,camera));composer.addPass(output);composer.setSize(64,64);
        const pixel=()=>{const a=new Uint8Array(4),gl=renderer.getContext();gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return [...a.slice(0,3)];};
        const frames=[];
        for(const mode of ['direct','composer','direct','composer']){
            renderer.setRenderTarget(null);
            if(mode==='direct')renderer.render(scene,camera);else composer.render();
            frames.push({mode,rgb:pixel()});
        }
        const result={frames,paint:paint.color.toArray(),untoneMapped:[...materials.values()].filter(m=>m.isMeshPhongMaterial&&!m.toneMapped).map(m=>m.name)};
        material.dispose();geometry.dispose();composer.dispose();output.material.dispose();
        for(const m of materials.values())m.dispose();
        return result;
    });
    expect(result.untoneMapped).toEqual([]);
    expect(result.paint).toEqual([.026241221889696346,.20507873637973145,1]);
    for(const frame of result.frames)for(let i=0;i<3;i++)expect(Math.abs(frame.rgb[i]-result.frames[0].rgb[i])).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
});
