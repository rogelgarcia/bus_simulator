// Test exporter boundaries against native Three material semantics.
import test,{expect} from '@playwright/test';

test('dry grass export remaps roughness without changing shared maps or other materials',async({page})=>{
    await page.goto('tests/headless/harness/index.html?ibl=0&grade=off');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {translateDryGrass}=await import('/tools/bake_lighting/experiments/lighting_configurations/export_city/MaterialEquivalence.js');
        const c=await fetch('/tools/bake_lighting/experiments/material_calibration/export_contract.json').then(r=>r.json());
        const canvas=document.createElement('canvas');canvas.width=2;canvas.height=1;
        const context=canvas.getContext('2d'),pixels=context.createImageData(2,1);pixels.data.set([11,0,33,255,44,255,66,255]);context.putImageData(pixels,0,0);
        const texture=new THREE.CanvasTexture(canvas);texture.repeat.set(4,7);texture.offset.set(.2,.3);texture.flipY=false;
        const source=new THREE.MeshStandardMaterial({roughness:.5,roughnessMap:texture,aoMap:texture,metalnessMap:texture,color:0x397638});
        const before=JSON.stringify(source.toJSON()),target=source.clone(),other=source.clone(),otherBefore=JSON.stringify(other.toJSON());
        const skipped=translateDryGrass(other,source,'authored',c),id=translateDryGrass(target,source,'dry-grass',c);
        return {id,skipped,unchanged:before===JSON.stringify(source.toJSON()),otherUnchanged:otherBefore===JSON.stringify(other.toJSON()),
            sourcePixels:Array.from(context.getImageData(0,0,2,1).data),targetPixels:Array.from(target.roughnessMap.image.getContext('2d').getImageData(0,0,2,1).data),
            repeat:target.roughnessMap.repeat.toArray(),offset:target.roughnessMap.offset.toArray(),flipY:target.roughnessMap.flipY,
            roughness:target.roughness,metalness:target.metalness,metalnessMap:target.metalnessMap,color:target.color.equals(source.color),aoPreserved:target.aoMap===texture};
    });
    expect(result.id).toBe('city-dry-grass-aggregate-v1');expect(result.skipped).toBeNull();
    expect(result.unchanged&&result.otherUnchanged&&result.color&&result.aoPreserved).toBe(true);
    expect(result.sourcePixels).toEqual([11,0,33,255,44,255,66,255]);expect(result.targetPixels).toEqual([11,230,33,255,44,242,66,255]);
    expect(result.repeat).toEqual([4,7]);expect(result.offset).toEqual([.2,.3]);expect(result.flipY).toBe(false);
    expect(result.roughness).toBe(1);expect(result.metalness).toBe(0);expect(result.metalnessMap).toBeNull();
});

test('Phong reflectance and opaque city interior translations preserve source materials',async({page})=>{
    await page.goto('tests/headless/harness/index.html?ibl=0&grade=off');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {translatePhongF0,createInteriorTexture,translateWindowInterior}=await import('/tools/bake_lighting/experiments/lighting_configurations/export_city/MaterialEquivalence.js');
        const c=await fetch('/tools/bake_lighting/experiments/material_calibration/export_contract.json').then(r=>r.json());
        const source=new THREE.MeshPhongMaterial();source.specular.setRGB(.04,.02,.01);
        const target=new THREE.MeshPhysicalMaterial();translatePhongF0(target,source);
        const f0=((target.ior-1)/(target.ior+1))**2;
        const actual=target.specularColor.toArray().map(v=>v*f0*target.specularIntensity);
        const texture=createInteriorTexture(c),windowSource=new THREE.MeshStandardMaterial({color:0xcccccc});
        windowSource.userData.windowFakeDepth={strength:1};const city=windowSource.clone(),bus=windowSource.clone();
        const cityId=translateWindowInterior(city,windowSource,'city',c,texture),busId=translateWindowInterior(bus,windowSource,'bus',c,texture);
        return {actual,source:source.specular.toArray(),cityId,busId,city:{transparent:city.transparent,opacity:city.opacity,emission:city.emissive.toArray(),colorSpace:city.map.colorSpace},sourceMap:windowSource.map,busMap:bus.map};
    });
    for(let i=0;i<3;i++)expect(result.actual[i]).toBeCloseTo([.04,.02,.01][i],10);
    expect(result.source).toEqual([.04,.02,.01]);
    expect(result.cityId).toBe('gray-beige-silhouette-v1');expect(result.busId).toBeNull();
    expect(result.city).toEqual({transparent:false,opacity:1,emission:[0,0,0],colorSpace:'srgb'});
    expect(result.sourceMap).toBeNull();expect(result.busMap).toBeNull();
});

test('export retains live material UV scaling, offset and rotation without shader objects',async({page})=>{
    await page.goto('tests/headless/harness/index.html?ibl=0&grade=off');
    const captured=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {applyUvTilingToMeshStandardMaterial}=await import('/src/graphics/assets3d/materials/MaterialUvTilingSystem.js');
        const {captureUvTiling}=await import('/tools/bake_lighting/experiments/lighting_configurations/export_city/MaterialEquivalence.js');
        const material=new THREE.MeshStandardMaterial();
        applyUvTilingToMeshStandardMaterial(material,{scaleU:4,scaleV:3,offsetU:.2,offsetV:-.1,rotationDegrees:30});
        const copy=material.clone();
        const result=[captureUvTiling(material),captureUvTiling(copy)];material.dispose();copy.dispose();return result;
    });
    expect(captured).toEqual(Array(2).fill({tiling:[4,3],offset:[.2,-.1],rotation:Math.PI/6}));
});

test('legacy bus export keeps color and gray rims while preventing mirror-like paint and trim',async({page})=>{
    await page.goto('tests/headless/harness/index.html?ibl=0&grade=off');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
        const {translatePhongF0,translateLegacyBus}=await import('/tools/bake_lighting/experiments/lighting_configurations/export_city/MaterialEquivalence.js');
        const contract=await fetch('/tools/bake_lighting/experiments/material_calibration/export_contract.json').then(r=>r.json());
        const scene=new THREE.Scene(),records=[];
        for(const name of ['paint','glossy','plastic','tire','rimmetal','glass']){
            const source=new THREE.MeshPhongMaterial({name,shininess:500});
            source.color.setRGB(...(name==='paint'?[.02624,.20508,1]:name==='rimmetal'?[.13425,.13425,.13425]:[0,0,0]));
            source.specular.setRGB(.214,.214,.214);
            const original=source.toJSON(),target=new THREE.MeshPhysicalMaterial({name,roughness:.12,color:source.color});
            translatePhongF0(target,source);
            const city=target.clone(),cityBefore=city.toJSON();
            const cityProxy=translateLegacyBus(city,source,'city',contract);
            const proxy=translateLegacyBus(target,source,'bus',contract);
            const authored=new THREE.MeshPhysicalMaterial({name,roughness:.11,metalness:.7});
            const authoredBefore=authored.toJSON(),authoredProxy=translateLegacyBus(authored,authored,'bus',contract);
            records.push({name,proxy,roughness:target.roughness,f0:((target.ior-1)/(target.ior+1))**2*target.specularIntensity,
                color:target.color.toArray(),sourceUnchanged:JSON.stringify(source.toJSON())===JSON.stringify(original),
                cityUnchanged:cityProxy===null&&JSON.stringify(city.toJSON())===JSON.stringify(cityBefore),
                authoredUnchanged:authoredProxy===null&&JSON.stringify(authored.toJSON())===JSON.stringify(authoredBefore)});
            scene.add(new THREE.Mesh(new THREE.BoxGeometry(),target));
        }
        const gltf=await new GLTFExporter().parseAsync(scene,{binary:false});
        return {records,serialized:gltf.materials.map(m=>({name:m.name,pbr:m.pbrMetallicRoughness,extensions:m.extensions}))};
    });
    for(const r of result.records){expect(r.sourceUnchanged).toBe(true);expect(r.cityUnchanged).toBe(true);expect(r.authoredUnchanged).toBe(true);}
    const paint=result.records.find(r=>r.name==='paint'),trim=result.records.find(r=>r.name==='glossy');
    expect(paint.roughness).toBe(.34);expect(paint.f0).toBeCloseTo(.025,10);expect(paint.color).toEqual([.02624,.20508,1]);
    expect(trim.roughness).toBe(.62);expect(trim.f0).toBeCloseTo(.006,10);
    expect(result.records.find(r=>r.name==='rimmetal').color).toEqual([.13425,.13425,.13425]);
    expect(result.records.find(r=>r.name==='glass').proxy).toBeNull();
    const exported=result.serialized.find(m=>m.name==='paint');
    expect(exported.pbr.roughnessFactor).toBe(.34);expect(exported.pbr.metallicFactor).toBe(0);
    expect(exported.extensions.KHR_materials_specular.specularFactor).toBe(.625);
});
