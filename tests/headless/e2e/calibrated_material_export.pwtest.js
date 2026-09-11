// Test exporter boundaries against native Three material semantics.
import test,{expect} from '@playwright/test';

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
