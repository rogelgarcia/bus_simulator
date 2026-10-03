// Validate world-oriented lighting while billboard geometry turns with the camera.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'tests/artifacts/screens/grass_debug_v2/lod3_triads';

test('Billboards preserve source illumination while rotating and respond to moving lights', async ({page}) => {
    test.setTimeout(120000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=lod3-triads-lighting');
    await page.waitForFunction(()=>!!window.__plantCardsReadiness);await page.evaluate(()=>window.__plantCardsReadiness);
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {createGrassDebugV2BillboardMaterial}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BillboardMaterial.js?v=lod3-triads-1');
        const {createGrassDebugV2Material}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js?v=lod3-w-1');
        const renderer=window.__plantCardsStudy.renderer;
        const texture=rgba=>{const t=new THREE.DataTexture(new Uint8Array(rgba),1,1);t.needsUpdate=true;return t;};
        const maps={albedo:texture([102,102,102,255]),normal:texture([128,128,255,255]),roughness:texture([255,173,128,255])};
        const uniforms={grassTriadTurns:{value:new THREE.Vector3()},grassBillboardHeight:{value:.2}};
        const materials=createGrassDebugV2BillboardMaterial(maps,uniforms),geometry=new THREE.InstancedBufferGeometry();
        const plane=new THREE.PlaneGeometry(.2,.2);
        const positions=new Float32Array([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0]);
        geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],3));
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(12).fill(1),3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
        geometry.setAttribute('grassPlateAxis',new THREE.InstancedBufferAttribute(new Float32Array([0]),1));
        geometry.setAttribute('grassPlatePlacement',new THREE.InstancedBufferAttribute(new Float32Array([0,0,.2]),3));
        geometry.setAttribute('grassPlateUvRect',new THREE.InstancedBufferAttribute(new Float32Array([0,0,1,1]),4));
        geometry.setIndex([0,1,2,2,1,3]);geometry.instanceCount=1;
        const card=new THREE.Mesh(geometry,materials.material);card.customDepthMaterial=materials.depth;card.position.y=-.1;card.frustumCulled=false;
        const sourceMaterial=createGrassDebugV2Material({color:new THREE.Color(.4,.4,.4),roughness:173/255,defines:{GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1}});
        const source=new THREE.Mesh(plane,sourceMaterial),scene=new THREE.Scene(),light=new THREE.DirectionalLight(0xffffff,2);
        scene.add(card,source,light,light.target);
        const camera=new THREE.OrthographicCamera(-.15,.15,.15,-.15,.01,3);
        const target=new THREE.WebGLRenderTarget(128,128,{colorSpace:THREE.NoColorSpace});
        const sample=object=>{
            source.visible=object===source;card.visible=object===card;
            renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(null);
            const rgba=new Uint8Array(4);renderer.readRenderTargetPixels(target,64,64,1,1,rgba);return Array.from(rgba).slice(0,3);
        };
        const lighting=[];
        for(const axis of [0,1,2])for(const orientation of [0,.45,.9,-.45]){
            const baseYaw=axis*Math.PI/3;geometry.attributes.grassPlateAxis.setX(0,axis);geometry.attributes.grassPlateAxis.needsUpdate=true;
            source.rotation.y=orientation+baseYaw;
            maps.normal.image.data.set([Math.round((Math.sin(orientation)*.5+.5)*255),128,Math.round((Math.cos(orientation)*.5+.5)*255),255]);maps.normal.needsUpdate=true;
            for(const yaw of [0,.35,1.1,Math.PI+.35])for(const direction of [[1,.3,1],[-1,.3,1],[0,1,-1]]){
                camera.position.set(Math.sin(yaw+baseYaw),0,Math.cos(yaw+baseYaw));camera.lookAt(0,0,0);light.position.fromArray(direction);
                uniforms.grassTriadTurns.value.fromArray([0,1,2].map(a=>5*Math.PI/180*Math.sin(2*(yaw+baseYaw-a*Math.PI/3))));
                const mesh=sample(source),billboard=sample(card);
                lighting.push({axis,orientation,yaw,direction,mesh,billboard,error:Math.max(...mesh.map((v,i)=>Math.abs(v-billboard[i])))});
            }
        }
        source.visible=false;card.visible=true;card.castShadow=true;light.castShadow=true;light.position.set(0,0,1);
        Object.assign(light.shadow.camera,{left:-.3,right:.3,bottom:-.3,top:.3,near:.01,far:3});light.shadow.camera.updateProjectionMatrix();light.shadow.mapSize.set(64,64);
        camera.position.set(0,0,1);camera.lookAt(0,0,0);uniforms.grassTriadTurns.value.set(0,0,0);geometry.attributes.grassPlateAxis.setX(0,0);geometry.attributes.grassPlateAxis.needsUpdate=true;
        renderer.shadowMap.needsUpdate=true;light.shadow.needsUpdate=true;sample(card);
        const shadowPixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(light.shadow.map,0,0,64,64,shadowPixels);
        let shadowCoverage=0;for(let i=0;i<shadowPixels.length;i+=4)if(shadowPixels[i]<254||shadowPixels[i+1]<254||shadowPixels[i+2]<254)shadowCoverage++;
        uniforms.grassTriadTurns.value.set(.07,-.08,.03);renderer.shadowMap.needsUpdate=true;light.shadow.needsUpdate=true;sample(card);
        const turnedShadowPixels=new Uint8Array(shadowPixels.length);renderer.readRenderTargetPixels(light.shadow.map,0,0,64,64,turnedShadowPixels);
        const stableShadows=shadowPixels.every((v,i)=>v===turnedShadowPixels[i]);
        light.shadow.map.dispose();target.dispose();geometry.dispose();plane.dispose();sourceMaterial.dispose();materials.material.dispose();materials.depth.dispose();Object.values(maps).forEach(t=>t.dispose());
        return {lighting,shadowCoverage,stableShadows};
    });
    await mkdir(output,{recursive:true});await writeFile(output+'/billboard_lighting.json',JSON.stringify({result,errors},null,2));
    for(const sample of result.lighting)expect(sample.error,JSON.stringify(sample)).toBeLessThanOrEqual(5);
    expect(new Set(result.lighting.map(s=>s.billboard.join(','))).size).toBeGreaterThan(5);
    expect(result.shadowCoverage).toBeGreaterThan(100);
    expect(result.stableShadows).toBe(true);
    expect(errors).toEqual([]);
});
