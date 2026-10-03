// Validate raised LOD4 geometry, one ground layer and reuse of real LOD2 shadows.
import test, { expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_color_height/validation');
test.use({viewport:{width:1920,height:1080},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});
test('LOD4 shares textures, replaces covered ground and keeps LOD2 shadows',async({page})=>{
    test.setTimeout(180000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-color-height-2&lod=LOD4#03_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);
    await page.evaluate(()=>window.__grassLitterReadiness);
    await expect(page.locator('#scene-lod')).toHaveValue('LOD4');
    const initial=await page.evaluate(()=>window.__grassLitterScene.getSnapshot());
    expect(initial.lods.LOD4.bake.resolution).toBe(4096);
    expect(initial.lods.LOD4.bake.footprint).toEqual([2,2]);
    expect(initial.lods.LOD4.textureVariantCount).toBe(2);
    expect(initial.lods.LOD4.bake.variants).toHaveLength(2);
    expect(initial.lods.LOD4.bake.mapResolutions).toEqual({albedo:1024,normal:1024,roughness:1024,visibility:4096});
    expect(initial.lods.LOD4.bake.estimatedTextureBytes).toBe(((1024*1024*4-1)/3*12+(4096*4096*4-1)/3)*4);
    expect(initial.lods.LOD4.bake.shadowResolution).toBe(8192);
    expect(initial.lods.LOD4.bake.selfShadowsBaked).toBe(true);
    expect(initial.lods.LOD4.bake.shadowTargetReleased).toBe(true);
    expect(initial.shadows.canopy.resolution).toBe(2048);
    expect(initial.shadows.canopy.externalOnly).toBe(true);
    expect(initial.shadows.canopy.estimatedTextureBytes).toBe(2048*2048*4/3);
    const shadowSizes=await page.evaluate(()=>{
        const s=window.__grassLitterScene,cache=s.canopy.shadowUniforms.grassCanopyShadowVisibility.value.image;
        return {source:[s.lighting.sun.shadow.map.width,s.lighting.sun.shadow.map.height],cache:[cache.width,cache.height]};
    });
    expect(shadowSizes).toEqual({source:[8192,8192],cache:[2048,2048]});
    expect(initial.lods.LOD4.liveLeaves).toBeGreaterThan(2000);expect(initial.lods.LOD4.liveLeaves).toBeLessThan(5000);
    expect(initial.lods.LOD4.liveLeaves+initial.lods.LOD4.textureLeaves).toBe(96000);
    expect(initial.lods.LOD4.triangles).toBeLessThan(12000);
    const validation=await page.evaluate(async()=>{
        const s=window.__grassLitterScene,THREE=await import('three'),ray=new THREE.Raycaster(),surfaces=[];
        const shadow=()=>{
            const map=s.lighting.sun.shadow.map,pixels=new Uint8Array(map.width*map.height*4);
            s.renderer.readRenderTargetPixels(map,0,0,map.width,map.height,pixels);
            let hash=2166136261,nonwhite=0;
            for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619);if(pixels[i]!==255)nonwhite++;}
            return {hash:hash>>>0,nonwhite,size:[map.width,map.height]};
        };
        s.setLod('LOD2');s.lighting.render(0);const before=shadow(),generation=s.getSnapshot().shadows.generations;
        s.setLod('LOD4');s.lighting.render(0);const after=shadow(),sameGeneration=s.getSnapshot().shadows.generations;
        s.renderer.shadowMap.needsUpdate=true;s.lighting.sun.shadow.needsUpdate=true;s.lighting.render(0);
        const regenerated=shadow(),newGeneration=s.getSnapshot().shadows.generations;
        s.setFieldCount(9);s.frameFields();s.lighting.render(0);
        const external=s.canopy.shadowUniforms.grassCanopyShadowVisibility.value;
        const probeTarget=new THREE.WebGLRenderTarget(2048,2048,{depthBuffer:false,colorSpace:THREE.NoColorSpace});
        const probeScene=new THREE.Scene(),probeCamera=new THREE.Camera(),probeGeometry=new THREE.PlaneGeometry(2,2);
        const probeMaterial=new THREE.MeshBasicMaterial({map:external,depthTest:false,depthWrite:false,toneMapped:false});
        probeScene.add(new THREE.Mesh(probeGeometry,probeMaterial));s.renderer.setRenderTarget(probeTarget);s.renderer.render(probeScene,probeCamera);
        const externalPixels=new Uint8Array(2048*2048*4);s.renderer.readRenderTargetPixels(probeTarget,0,0,2048,2048,externalPixels);s.renderer.setRenderTarget(null);
        let exteriorTotal=0,exteriorSamples=0,externalDark=0;
        for(let y=0;y<2048;y++)for(let x=0;x<2048;x++){
            const value=externalPixels[(y*2048+x)*4];if(value<128)externalDark++;
            if(Math.abs((x/2048-.5)*38)>6||Math.abs((y/2048-.5)*38)>6){exteriorTotal+=value;exteriorSamples++;}
        }
        const externalCheck={exteriorMean:exteriorTotal/exteriorSamples/255,darkFraction:externalDark/(2048*2048)};
        probeTarget.dispose();probeMaterial.dispose();probeGeometry.dispose();
        const root=s.scene.getObjectByName('GrassFieldTile_1').children[0],canopy=root.children.find(m=>m.name==='GrassField-LOD4');
        const clones=[];
        for(let i=1;i<=9;i++){
            const c=s.scene.getObjectByName('GrassFieldTile_'+i).children[0].children.find(m=>m.name==='GrassField-LOD4');
            clones.push(c.children.every((mesh,j)=>mesh.geometry===canopy.children[j].geometry&&mesh.material===canopy.children[j].material));
        }
        const layers=[];
        for(const treatment of ['merged','alpha'])for(const mode of ['all','grass','soil']){
            s.setLitterTreatment(treatment);s.setMode(mode);s.scene.updateMatrixWorld(true);
            surfaces.length=0;
            s.scene.traverseVisible(mesh=>{if(mesh.isMesh&&(mesh.material.name==='Brown Earth'||mesh.userData.grassCanopy||mesh.material.name.startsWith('Merged_DryLitter')||mesh.material.name.startsWith('DryLitter')))surfaces.push(mesh);});
            const hits=[];
            for(const tile of s.getSnapshot().fields.tiles.filter(t=>t.active))for(const [dx,dz] of [[.123,.321],[5.88,.123],[-5.88,.123],[.123,5.88],[.123,-5.88]]){
                ray.set(new THREE.Vector3(tile.x+dx,1,tile.z+dz),new THREE.Vector3(0,-1,0));
                hits.push(ray.intersectObjects(surfaces,false).map(h=>h.point.y));
            }
            layers.push({treatment,mode,hits,snapshot:s.getSnapshot()});
        }
        s.setMode('all');s.setLitterTreatment('merged');s.setFieldCount(1);s.setView(2);s.setLod('LOD4');s.lighting.render(0);
        const generations=s.getSnapshot().shadows.generations,pose=s.camera.quaternion.clone();
        for(let i=0;i<12;i++){s.camera.rotateY(.01);s.lighting.render(0);}
        const turnGenerations=s.getSnapshot().shadows.generations;s.camera.quaternion.copy(pose);
        return {before,after,regenerated,generation,sameGeneration,newGeneration,clones,layers,generations,turnGenerations,externalCheck,glError:s.renderer.getContext().getError()};
    });
    expect(validation.before.hash).toBe(validation.after.hash);expect(validation.before.hash).toBe(validation.regenerated.hash);
    expect(validation.before.nonwhite).toBeGreaterThan(0);
    expect(validation.generation).toBe(validation.sameGeneration);expect(validation.newGeneration).toBe(validation.sameGeneration+1);
    expect(validation.clones.every(Boolean)).toBe(true);
    expect(validation.generations).toBe(validation.turnGenerations);
    expect(validation.glError).toBe(0);
    expect(validation.externalCheck.exteriorMean).toBeGreaterThan(.99);
    expect(validation.externalCheck.darkFraction).toBeGreaterThan(.001);
    for(const layer of validation.layers)for(const hits of layer.hits){
        expect(hits).toHaveLength(1);
        if(layer.mode==='soil')expect(hits[0]).toBeCloseTo(0,6);else expect(hits[0]).toBeGreaterThan(.005);
    }
    const captures=[];
    for(const [view,name] of [[0,'overview'],[2,'rear'],[3,'low_edge'],[5,'closeup']])for(const lod of ['LOD2','LOD4']){
        await page.evaluate(({view,lod})=>{const s=window.__grassLitterScene;s.setView(view);s.setLod(lod);},{view,lod});
        await page.evaluate(async()=>{for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);});
        await page.screenshot({path:path.join(output,name+'_'+lod+'.png')});
        captures.push({view,lod,snapshot:await page.evaluate(()=>window.__grassLitterScene.getSnapshot())});
    }
    await writeFile(path.join(output,'validation.json'),JSON.stringify({initial,validation,captures,errors},null,2));
    expect(errors).toEqual([]);
});
