// Use published positions as a fixture; evaluate their actual HDR display output without recompiling layouts.
import test, { expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_probe_exposure');
test.use({viewport:{width:1024,height:768},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined}});
test('Rendered LOD4 feedback preserves HDR until the scene display transform',async({page})=>{
    test.setTimeout(180000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/tests/canopy-probe-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>'}));
    await page.goto('/tests/canopy-probe-fixture');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
        const {GrassDebugV2Lighting}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Lighting.js');
        const {createGrassDebugV2Material}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const {createGrassDebugV2FieldLod}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldLod1.js');
        const {createGrassDebugV2CanopyRenderedProbe}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyRenderedProbe.js');
        const {primePbrAssetsAvailability}=await import('/src/graphics/content3d/materials/PbrAssetsRuntime.js');
        const {resolvePbrMaterialPipeline}=await import('/src/graphics/content3d/materials/PbrTexturePipeline.js');
        const root='/tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/';
        const [manifest,asset]=await Promise.all([fetch(root+'scene.json').then(r=>r.json()),fetch('/assets/public/grass/lod4/layout.json').then(r=>r.json())]);
        const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1024,768);renderer.outputColorSpace=THREE.SRGBColorSpace;
        renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
        const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,4/3,.01,150),lighting=new GrassDebugV2Lighting({renderer,scene,camera,retainSceneDepth:true});
        lighting.settings={...lighting.settings,ibl:{...lighting.settings.ibl,iblId:manifest.lighting.environmentId}};
        lighting.sunRef.direction.fromArray(manifest.lighting.sunDirection);lighting.sunRef.color.fromArray(manifest.lighting.sunColorLinear);
        lighting.sunRef.intensity=manifest.lighting.sunIntensity;lighting.sun.color.copy(lighting.sunRef.color);lighting.sun.intensity=lighting.sunRef.intensity;
        lighting.hemi.intensity=manifest.lighting.hemisphereIntensity;renderer.toneMappingExposure=manifest.lighting.exposure;
        lighting.pipeline.setToneMapping({toneMapping:renderer.toneMapping,exposure:manifest.lighting.exposure});
        await primePbrAssetsAvailability();
        const ormUrl=new URL(resolvePbrMaterialPipeline('pbr.dry_litter').urls.ormUrl,location.href);ormUrl.searchParams.set('v','orm-repair-1');
        const [loaded,,litterOrm]=await Promise.all([new GLTFLoader().loadAsync(root+'96000_leaves.glb'),lighting.loadEnvironment(),new THREE.TextureLoader().loadAsync(ormUrl.href)]);
        const repaired=new Set();
        loaded.scene.traverse(mesh=>{
            if(!mesh.isMesh)return;
            if(mesh.material.name.startsWith('DryLitter')&&!repaired.has(mesh.material)){
                repaired.add(mesh.material);const texture=mesh.material.roughnessMap.clone();texture.source=litterOrm.source;texture.flipY=litterOrm.flipY;
                texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
                for(const key of ['roughnessMap','metalnessMap','aoMap'])mesh.material[key]=texture;
            }
            for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(mesh.material[key])mesh.material[key].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
        });
        const original=loaded.scene.getObjectByName('Offline_96000_Leaves').children.find(m=>m.isMesh).material;
        const material=createGrassDebugV2Material({vertexColors:true,color:original.color,roughness:original.roughness,normalMap:original.normalMap,
            normalScale:original.normalScale,roughnessMap:original.roughnessMap,defines:{GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1}});
        const field=createGrassDebugV2FieldLod({lod:'LOD2',placements:manifest.placements,seed:manifest.seed,material}).mesh;
        const indices=[],ranges=[];
        for(const id of asset.source.tileIds){const range=field.userData.grassLeafRanges[id];ranges.push({start:indices.length,count:range.count});for(let i=range.start;i<range.start+range.count;i++)indices.push(field.geometry.index.getX(i));}
        const vertices=[...new Set(indices)],remap=new Map(vertices.map((v,i)=>[v,i])),geometry=new THREE.BufferGeometry();
        for(const [name,original] of Object.entries(field.geometry.attributes)){
            const attribute=new THREE.BufferAttribute(new original.array.constructor(vertices.length*original.itemSize),original.itemSize,original.normalized);
            vertices.forEach((v,i)=>attribute.copyAt(i,original,v));geometry.setAttribute(name,attribute);
        }
        geometry.setIndex(indices.map(v=>remap.get(v)));
        if(asset.variants[0].positions.length!==geometry.attributes.position.array.length)throw Error('Published fixture topology changed.');
        geometry.attributes.position.array.set(asset.variants[0].positions);geometry.attributes.position.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
        const mesh=new THREE.Mesh(geometry,material);mesh.userData.grassLeafRanges=ranges;
        let soil;loaded.scene.traverse(m=>{if(m.isMesh&&m.material.name==='Brown Earth')soil=m;});
        const sourceHeight=field.geometry.boundingBox.max.y,shadowDirection=lighting.sunRef.direction;
        const probe=createGrassDebugV2CanopyRenderedProbe({renderer,soil,litter:loaded.scene.getObjectByName('GrassV2DryLitterSubstrate'),lighting,shadowDirection,
            shadowPadding:sourceHeight*Math.hypot(shadowDirection.x,shadowDirection.z)/shadowDirection.y+.01,sourceHeight,periodMeters:2,filterFootprint:0});
        const before={toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,viewport:renderer.getViewport(new THREE.Vector4()).toArray()};
        const runs=[];
        for(const [resolution,shadowResolution] of [[512,2048],[4096,8192]]){
            const r=await probe.evaluate(mesh,resolution,shadowResolution),canvas=document.createElement('canvas');canvas.width=r.preview.width;canvas.height=r.preview.height;
            canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.preview.rgba),r.preview.width,r.preview.height),0,0);
            runs.push({resolution,shadowResolution,renderPipeline:r.renderPipeline,views:r.views.map(({heat,...view})=>view),png:canvas.toDataURL().split(',')[1]});
        }
        const after={toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,viewport:renderer.getViewport(new THREE.Vector4()).toArray()};
        probe.dispose();geometry.dispose();field.geometry.dispose();material.dispose();lighting.dispose();renderer.dispose();
        return {before,after,runs};
    });
    for(const run of result.runs){await writeFile(path.join(output,'preview-'+run.resolution+'.png'),Buffer.from(run.png,'base64'));delete run.png;}
    await writeFile(path.join(output,'validation.json'),JSON.stringify({result,errors},null,2));
    expect(errors).toEqual([]);expect(result.after).toEqual(result.before);
    for(const run of result.runs){expect(run.renderPipeline.profile).toBe('hdr-display-v1');expect(run.renderPipeline.exposure).toBe(result.before.exposure);expect(run.views).toHaveLength(48);
        for(const view of run.views){expect(view.clippedFraction).toBeLessThan(.02);expect(view.blackFraction).toBeLessThan(.02);expect(view.mean).toBeGreaterThan(2);expect(view.mean).toBeLessThan(250);expect(view.sampleCount).toBeGreaterThan(1000);}}
});
