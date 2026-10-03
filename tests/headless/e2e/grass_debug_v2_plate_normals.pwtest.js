// Preserve world-space leaf normals through atlas packing and live card lighting.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_four_reuse');
test.use({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Plate normals retain the source tangent-space detail after atlas packing', async ({page}) => {
    test.setTimeout(120000);
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=normal-check');
    await page.waitForFunction(()=>!!window.__plantCardsReadiness);
    await page.evaluate(()=>window.__plantCardsReadiness);
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {createGrassDebugV2DynamicPlates}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2DynamicPlates.js?v=lod3-plates-2');
        const renderer=window.__plantCardsStudy.renderer;
        const {createGrassDebugV2Material}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js?v=lod3-w-1');
        const normalMap=new THREE.DataTexture(new Uint8Array([218,128,218,255]),1,1);normalMap.needsUpdate=true;
        const roughnessMap=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);roughnessMap.needsUpdate=true;
        const material=createGrassDebugV2Material({normalMap,roughnessMap,roughness:.68,vertexColors:true,
            defines:{GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1}});
        const geometry=new THREE.PlaneGeometry(.2,.1);geometry.translate(0,.05,0);geometry.rotateY(Math.PI/10);
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(12).fill(.4),3));
        const source=new THREE.Mesh(geometry,material);
        const referenceMaterial=new THREE.MeshNormalMaterial({normalMap,side:THREE.DoubleSide,toneMapped:false});
        const referenceScene=new THREE.Scene(),referenceMesh=new THREE.Mesh(geometry,referenceMaterial);
        referenceScene.add(referenceMesh);
        const camera=new THREE.OrthographicCamera(-.15,.15,.15,-.15,.01,2);camera.position.set(0,.05,1);
        const target=new THREE.WebGLRenderTarget(64,64,{colorSpace:THREE.NoColorSpace}),pixel=new Uint8Array(4);
        const samples=[],lighting=[];
        for(const orientation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        source.rotation.y=referenceMesh.rotation.y=orientation;
        camera.position.set(Math.sin(orientation),.05,Math.cos(orientation));camera.lookAt(0,.05,0);
        renderer.setRenderTarget(target);renderer.clear();renderer.render(referenceScene,camera);renderer.setRenderTarget(null);
        renderer.readRenderTargetPixels(target,32,32,1,1,pixel);
        const expected=new THREE.Vector3(pixel[0]/127.5-1,pixel[1]/127.5-1,pixel[2]/127.5-1).normalize();

        for(const study of [false,true]){
            const plates=await createGrassDebugV2DynamicPlates({renderer,meshes:[source],material,study});
            const data=plates.sets[0].maps.normal.image.data,mean=new THREE.Vector3();let count=0;
            for(let i=0;i<data.length;i+=4)if(data[i+3]===255){mean.add(new THREE.Vector3(data[i]/127.5-1,data[i+1]/127.5-1,data[i+2]/127.5-1));count++;}
            mean.divideScalar(count).normalize();samples.push({study,orientation,mean:mean.toArray(),expected:expected.toArray(),error:mean.distanceTo(expected),count});
            const litScene=new THREE.Scene(),light=new THREE.DirectionalLight(0xffffff,2);
            litScene.add(source,plates.group,light,light.target);
            const litTarget=new THREE.WebGLRenderTarget(128,128,{colorSpace:THREE.NoColorSpace});
            const renderPixel=object=>{
                source.visible=object===source;plates.group.visible=object===plates.group;
                renderer.setRenderTarget(litTarget);renderer.clear();renderer.render(litScene,camera);renderer.setRenderTarget(null);
                const rgba=new Uint8Array(4);renderer.readRenderTargetPixels(litTarget,64,64,1,1,rgba);return Array.from(rgba).slice(0,3);
            };
            for(const yaw of [0,.35,Math.PI,Math.PI+.35])for(const direction of [[1,.3,1],[-1,.3,1],[0,1,-1]]){
                camera.position.set(Math.sin(yaw+orientation),.05,Math.cos(yaw+orientation));camera.lookAt(0,.05,0);light.position.fromArray(direction);
                const mesh=renderPixel(source),card=renderPixel(plates.group);
                lighting.push({study,orientation,yaw,direction,mesh,card,error:Math.max(...mesh.map((v,i)=>Math.abs(v-card[i])))});
            }
            litTarget.dispose();source.removeFromParent();source.visible=true;plates.dispose();
        }
        }
        target.dispose();referenceMaterial.dispose();
        geometry.dispose();material.dispose();normalMap.dispose();roughnessMap.dispose();
        return {samples,lighting,normalVertex:THREE.ShaderLib.normal.vertexShader,normalFragment:THREE.ShaderLib.normal.fragmentShader,
            begin:THREE.ShaderChunk.normal_fragment_begin,maps:THREE.ShaderChunk.normal_fragment_maps,pars:THREE.ShaderChunk.normalmap_pars_fragment};
    });
    await mkdir(output,{recursive:true});await writeFile(path.join(output,'normal_check.json'),JSON.stringify({result,errors},null,2));
    for(const sample of result.samples)expect(sample.error).toBeLessThan(.02);
    for(const sample of result.lighting)expect(sample.error,JSON.stringify(sample)).toBeLessThanOrEqual(5);
    expect(new Set(result.lighting.map(sample=>sample.card.join(','))).size).toBeGreaterThan(4);
    expect(errors).toEqual([]);
});
