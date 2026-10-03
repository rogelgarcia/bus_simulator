// Distance transitions must mix final linear light, never averaged material inputs.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_paired_sampling');
test.use({ viewport:{width:256,height:256}, video:'off', trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined} });

test('LOD4 alternates complete materials and blends near/far linear radiance without color bands',async({page})=>{
    test.setTimeout(120000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/tests/canopy-distance-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js"}}</script>'}));
    await page.goto('/tests/canopy-distance-fixture');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {createGrassDebugV2CanopyMaterials}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyMaterial.js');
        const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(64,64);renderer.toneMapping=THREE.NoToneMapping;
        const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,10);
        camera.position.set(0,4,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
        scene.add(new THREE.HemisphereLight(0xffffff,0x555555,1));
        const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(2,4,1);scene.add(sun);
        function texture(channel,variant){
            const values=new Uint8Array(16*16*4);
            for(let y=0;y<16;y++)for(let x=0;x<16;x++){
                const stripe=(x+y)%4<2,offset=(y*16+x)*4;
                const color=channel==='albedo'?(variant?[48,105,18,255]:[110,160,30,255])
                    :channel==='normal'?(stripe?[180,140,235,210]:[70,200,215,210])
                    :channel==='roughness'?[12,variant?230:155,9,4]:[255,255,255,255];
                values.set(color,offset);
            }
            const map=new THREE.DataTexture(values,16,16,THREE.RGBAFormat);map.wrapS=map.wrapT=THREE.RepeatWrapping;
            map.minFilter=map.magFilter=THREE.NearestFilter;map.needsUpdate=true;
            if(channel==='albedo')map.userData.grassCanopyHeight=true;
            if(channel==='roughness')map.userData.grassSoilContributions=true;
            return map;
        }
        const makeSet=variant=>Object.fromEntries(['albedo','normal','roughness','visibility'].map(channel=>[channel,texture(channel,variant)]));
        const a=makeSet(0),b=makeSet(1),material=createGrassDebugV2CanopyMaterials({texturesByLayer:{all:a},secondaryTexturesByLayer:{all:b},shadowUniforms:{},resolution:16,tileMeters:2,filterFootprint:0,sourceHeight:.25}).all;
        const geometry=new THREE.PlaneGeometry(4,4);geometry.rotateX(-Math.PI/2);
        const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2,uv.getY(i)*2);
        scene.add(new THREE.Mesh(geometry,material));
        const target=new THREE.WebGLRenderTarget(64,64,{type:THREE.FloatType,colorSpace:THREE.NoColorSpace});
        function render(start,end){
            material.userData.grassCanopyDistance.value.set(start,end,2);renderer.setRenderTarget(target);renderer.render(scene,camera);
            const pixels=new Float32Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);return pixels;
        }
        const near=render(100,101),far=render(0,.01),mixed=render(0,8);
        let maximumError=0,meanError=0,minimum=Infinity,maximum=-Infinity,nearFarDifference=0;
        for(let y=0;y<64;y++)for(let x=0;x<64;x++){
            const distance=Math.hypot((x+.5)/16-2,4,(y+.5)/16-2),t=distance/8,weight=t*t*(3-2*t);
            for(let c=0;c<3;c++){
                const i=(y*64+x)*4+c,expected=near[i]*(1-weight)+far[i]*weight,error=Math.abs(expected-mixed[i]);
                maximumError=Math.max(maximumError,error);meanError+=error;minimum=Math.min(minimum,mixed[i]);maximum=Math.max(maximum,mixed[i]);nearFarDifference+=Math.abs(near[i]-far[i]);
            }
        }
        renderer.setRenderTarget(null);target.dispose();geometry.dispose();material.dispose();Object.values(a).forEach(t=>t.dispose());Object.values(b).forEach(t=>t.dispose());renderer.dispose();
        return {maximumError,meanError:meanError/(64*64*3),nearFarDifference:nearFarDifference/(64*64*3),minimum,maximum};
    });
    await writeFile(path.join(output,'radiance-blend.json'),JSON.stringify({result,errors},null,2));
    expect(errors).toEqual([]);expect(result.maximumError).toBeLessThan(.001);
    expect(result.nearFarDifference).toBeGreaterThan(.01);expect(result.minimum).toBeGreaterThanOrEqual(0);expect(result.maximum).toBeGreaterThan(.1);
});
