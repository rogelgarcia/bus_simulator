// Protects the canonical bake source from temporary AO attributes and shader hooks.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(existsSync(chrome))test.use({launchOptions:{executablePath:chrome}});
test('Dynamic AO preserves bake material hashes and restores source geometry every frame',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const T=await import('three');
        const{DynamicAoRuntime}=await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const{createEnhancedSourceWatch}=await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverFreshness.js');
        const{createBakeMaterialCatalog}=await import('/src/graphics/illumination/bake_source/BakeSourceMaterials.js');
        const{sanitizeAmbientOcclusionSettings}=await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        const scene=new T.Scene(),renderer=new T.WebGLRenderer(),camera=new T.PerspectiveCamera();renderer.setSize(32,32);
        camera.position.set(0,3,8);camera.lookAt(0,0,0);
        const material=new T.MeshStandardMaterial();const floor=new T.Mesh(new T.BoxGeometry(20,.1,20),material);scene.add(floor);
        const excluded=new T.Mesh(new T.BoxGeometry(1,1,1),material);excluded.position.set(3,.5,0);excluded.userData.excludeFromAmbientOcclusionReceiver=true;scene.add(excluded);
        const roots=[{id:'floor',root:floor},{id:'excluded',root:excluded}];scene.updateMatrixWorld(true);
        const before=await createBakeMaterialCatalog(roots);
        const bus=new T.Mesh(new T.BoxGeometry(2,2,8),new T.MeshPhongMaterial());bus.position.y=1.3;scene.add(bus);
        const watch=createEnhancedSourceWatch(new Map([['floor',floor],['excluded',excluded]]));
        const runtime=new DynamicAoRuntime(),settings=sanitizeAmbientOcclusionSettings({scope:'dynamic'});
        const checks=[];
        for(let i=0;i<5;i++){
            runtime.update({renderer,scene,camera,participants:[{id:'bus',root:bus,cast:true,receive:true}],settings,enabled:true});
            renderer.render(scene,camera);runtime.restoreBindings();checks.push({valid:watch(),change:watch.lastChange});
        }
        const after=await createBakeMaterialCatalog(roots);
        const hashesMatch=JSON.stringify(before.materials)===JSON.stringify(after.materials);
        runtime.dispose();renderer.dispose();return{checks,hashesMatch};
    });
    expect(result.hashesMatch).toBe(true);expect(result.checks.every(c=>c.valid),JSON.stringify(result.checks)).toBe(true);
});
