// Isolate near-field canopy highlights from albedo and material roughness.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_glints', process.env.GRASS_GLINT_PHASE || 'paired-2m');
test.use({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 has no zero-roughness litter band in either viewing direction', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true }); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD4');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness); await page.evaluate(()=>window.__grassLitterReadiness);
    await page.addStyleTag({content:'#scene-panel,#scene-performance {visibility:hidden}'});
    const setup = await page.evaluate(async()=>{
        const s=window.__grassLitterScene,THREE=await import('three');s.setFieldCount(1);s.setLod('LOD4');s.setMode('all');
        const {registerMaterialShaderHook}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const probe={value:0};window.__glintProbe=probe;
        for(const material of Object.values(s.canopy.materials))registerMaterialShaderHook(material,{
            id:'test.canopy.glint',priority:100,uniforms:{glintProbe:probe},apply:shader=>{
                shader.fragmentShader='uniform float glintProbe;\n'+shader.fragmentShader;
                shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
                    'if(glintProbe==5.0)roughnessFactor=max(roughnessFactor,0.85);\n#include <lights_physical_fragment>');
                shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
                    'if(glintProbe==1.0)totalSpecular=vec3(0.0);\nvec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\n'+
                    'if(glintProbe==2.0)outgoingLight=diffuseColor.rgb;\nif(glintProbe==3.0)outgoingLight=vec3(roughnessFactor);\nif(glintProbe==4.0)outgoingLight=vec3(grassFloorLeafMask);\nif(glintProbe==6.0)outgoingLight=totalSpecular;');
            }});
        const maps={};for(const layer of ['all','grass']){
            const normal=s.canopy.readPixels(layer,'normal'),roughness=s.canopy.readPixels(layer,'roughness');
            let grass=0,ground=0,lowGrass=0,lowGround=0;const bins=Array(10).fill(0);
            for(let i=0;i<normal.length;i+=4){const mask=normal[i+3]/255,r=roughness[i+1]/255;grass+=mask;ground+=1-mask;if(r<.4){lowGrass+=mask;lowGround+=1-mask;}bins[Math.min(9,Math.floor(r*10))]++;}
            maps[layer]={grass,ground,lowGrass:lowGrass/grass,lowGround:lowGround/ground,bins};
        }
        s.setLitterTreatment('alpha');
        const materials=new Set();s.scene.traverse(mesh=>{
            if(mesh.isMesh&&mesh.material.name.startsWith('DryLitter'))materials.add(mesh.material);
        });
        const sources=[...materials].map(material=>{
            const texture=material.roughnessMap,canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
            const context=canvas.getContext('2d');context.drawImage(texture.image,0,0);
            const pixels=context.getImageData(0,0,1024,1024).data;let minimum=255,maximum=0,metallic=0;
            for(let i=0;i<pixels.length;i+=4){minimum=Math.min(minimum,pixels[i+1]);maximum=Math.max(maximum,pixels[i+1]);metallic=Math.max(metallic,pixels[i+2]);}
            return {minimum,maximum,metallic,flipY:texture.flipY,colorSpace:texture.colorSpace,
                sharedChannels:texture===material.aoMap&&texture===material.metalnessMap,url:texture.image.src};
        });
        s.setLitterTreatment('merged');
        return {snapshot:s.canopy.getSnapshot(),maps,sources};
    });
    for(const sign of [-1,1]) for(const [name,probe] of [['full',0],['diffuse',1],['albedo',2],['roughness',3],['mask',4],['rough-clamp',5],['specular',6]]){
        await page.evaluate(({sign,probe})=>{
            const s=window.__grassLitterScene;window.__glintProbe.value=probe;
            s.camera.position.set(sign*7,1.7,sign*7);s.camera.lookAt(sign*5.4,.08,sign*5.4);s.camera.fov=45;
            s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld();s.lighting.render(0);
        },{sign,probe});
        await page.screenshot({path:path.join(output,sign+'-'+name+'.png')});
    }
    await writeFile(path.join(output,'validation.json'),JSON.stringify({setup,errors},null,2));
    expect(setup.sources.length).toBeGreaterThan(0);
    for(const source of setup.sources){
        expect(source.minimum).toBe(221);expect(source.maximum).toBe(255);expect(source.metallic).toBe(0);
        expect(source.flipY).toBe(true);expect(source.colorSpace).toBe('');expect(source.sharedChannels).toBe(true);
        expect(source.url).toContain('/pbr/dry_litter/arm.png');
    }
    // The damaged input produced 6.7% low-roughness ground pixels. Allow only
    // the small real soil contribution after replacing the source texture.
    expect(setup.maps.all.lowGround).toBeLessThan(.002);
    expect(setup.maps.all.lowGrass).toBeLessThan(.002);
    expect(errors).toEqual([]);
});
