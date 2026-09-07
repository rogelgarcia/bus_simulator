// Measures self/world contact and exclusion independently from dynamic-to-ground proxies.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(existsSync(chrome))test.use({launchOptions:{executablePath:chrome,args:['--use-angle=d3d11']}});
test('Dynamic self and world interactions preserve static receivers and cutout holes',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const T=await import('three');
        const{DynamicAoRuntime}=await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const{sanitizeAmbientOcclusionSettings}=await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        const renderer=new T.WebGLRenderer();renderer.setSize(256,256);renderer.toneMapping=T.NoToneMapping;
        const target=new T.WebGLRenderTarget(256,256,{type:T.FloatType});renderer.setRenderTarget(target);
        const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,40);camera.position.set(4,3,6);camera.lookAt(0,1,0);
        scene.add(new T.HemisphereLight(0xffffff,0xffffff,Math.PI));
        const root=new T.Group();scene.add(root);
        const mat=new T.MeshStandardMaterial({color:0xffffff,roughness:1});
        const panel=new T.Mesh(new T.BoxGeometry(3,3,.2),mat);panel.position.y=1.5;root.add(panel);
        const shelf=new T.Mesh(new T.BoxGeometry(3,.2,1),mat);shelf.position.set(0,1.5,.5);root.add(shelf);
        const worldShelf=shelf.clone();worldShelf.position.y=2.5;scene.add(worldShelf);
        const settings=sanitizeAmbientOcclusionSettings({scope:'dynamic',dynamic:{quality:'high',radius:1.5}});
        const runtime=new DynamicAoRuntime();const participants=[{id:'parked',root,cast:true,receive:true}];
        const pixels=()=>{const p=new Float32Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,p);return p;};
        const render=(self,world)=>{shelf.visible=self;worldShelf.visible=world;runtime.update({renderer,scene,camera,participants,settings,enabled:true});
            settings.dynamic.debugView=true;runtime.uniforms.dynamicAoDebug.value=1;renderer.render(scene,camera);return pixels();};
        const plain=render(false,false),self=render(true,false),world=render(false,true),both=render(true,true);
        const sample=(data,x,y,z)=>{const p=new T.Vector3(x,y,z).project(camera);const ix=Math.floor((p.x*.5+.5)*256),iy=Math.floor((p.y*.5+.5)*256);return data[(iy*256+ix)*4];};
        const results={plain:sample(plain,0,1.35,.11),self:sample(self,0,1.35,.11),
            worldPlain:sample(plain,0,2.3,.11),world:sample(world,0,2.3,.11),both:sample(both,0,2.3,.11)};
        const beforeExcluded=render(false,true);panel.userData.excludeFromAmbientOcclusionReceiver=true;const excluded=render(false,true);
        results.excluded=sample(excluded,0,2.3,.11);results.beforeExcluded=sample(beforeExcluded,0,2.3,.11);
        panel.userData.excludeFromAmbientOcclusionReceiver=false;
        const texture=new T.DataTexture(new Uint8Array([255,255,255,0]),1,1,T.RGBAFormat);texture.needsUpdate=true;
        worldShelf.material=new T.MeshStandardMaterial({map:texture,alphaTest:.5,side:T.DoubleSide});settings.alpha.handling='alpha_test';
        const cutout=render(false,true);results.cutout=sample(cutout,0,2.3,.11);
        results.materialPatched=runtime.materials.size;results.glError=renderer.getContext().getError();
        runtime.dispose();target.dispose();renderer.dispose();return results;
    });
    await mkdir('tests/artifacts/screens/illumination_534',{recursive:true});
    await writeFile('tests/artifacts/screens/illumination_534/interactions.json',JSON.stringify({result,errors},null,2));
    expect(errors).toEqual([]);expect(result.glError).toBe(0);
    expect(result.plain).toBeGreaterThan(.99);expect(result.self).toBeLessThan(result.plain-.01);
    expect(result.world).toBeLessThan(result.worldPlain-.01);expect(result.excluded).toBeGreaterThan(.99);
    expect(result.cutout).toBeCloseTo(result.worldPlain,3);
});
