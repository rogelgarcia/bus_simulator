// Mixed LOD fields preserve neighboring alternation, ground coverage, counters and cached shadows.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_color_match/mixed-validation');
test.use({viewport:{width:1600,height:1000},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined}});
for (const comparison of ['LOD2+4', 'LOD2+3+4']) test(comparison+' alternates neighboring fields and keeps one opaque ground layer',async({page})=>{
    test.setTimeout(180000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod234-comparison-1&lod='+encodeURIComponent(comparison)+'&fields=9#03_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);await page.evaluate(()=>window.__grassLitterReadiness);
    await expect(page.locator('#scene-lod')).toHaveValue(comparison);await expect(page.locator('#scene-fields')).toHaveValue('9');
    const result=await page.evaluate(async comparison=>{
        const THREE=await import('three'),s=window.__grassLitterScene,ray=new THREE.Raycaster();
        const initial=s.getSnapshot(),layouts=[],layers=[];
        const hash=()=>{
            const map=s.lighting.sun.shadow.map,pixels=new Uint8Array(map.width*map.height*4);
            s.renderer.readRenderTargetPixels(map,0,0,map.width,map.height,pixels);
            let value=2166136261;for(const pixel of pixels)value=Math.imul(value^pixel,16777619);
            return value>>>0;
        };
        s.lighting.render(0);const generation=s.getSnapshot().shadows.generations,shadows=[hash()];
        for(const lod of ['LOD2','LOD3','LOD4',comparison]){s.setLod(lod);s.lighting.render(0);shadows.push(hash());}
        for(let i=0;i<5;i++){s.camera.rotateY(.01);s.lighting.render(0);}
        const unchangedGeneration=s.getSnapshot().shadows.generations;
        s.setView(2);
        for(const count of [1,2,5,9,1,9]){
            s.setFieldCount(count);s.scene.updateMatrixWorld(true);const state=s.getSnapshot();
            const visible=state.fields.tiles.filter(t=>t.active).map(tile=>{
                const root=s.scene.getObjectByName('GrassFieldTile_'+(tile.index+1));
                return {tile,meshes:root.children[0].children.filter(m=>m.visible).map(m=>m.name)};
            });
            layouts.push({state,visible});
        }
        for(const treatment of ['merged','alpha'])for(const mode of ['all','grass','soil']){
            s.setLitterTreatment(treatment);s.setMode(mode);s.scene.updateMatrixWorld(true);
            const surfaces=[];s.scene.traverseVisible(mesh=>{
                if(mesh.isMesh&&(mesh.userData.grassCanopy||mesh.material.name==='Brown Earth'
                    ||mesh.material.name.startsWith('Merged_DryLitter')||mesh.material.name.startsWith('DryLitter')))surfaces.push(mesh);
            });
            const hits=s.getSnapshot().fields.tiles.filter(t=>t.active).map(tile=>{
                ray.set(new THREE.Vector3(tile.x+.123,1,tile.z+.321),new THREE.Vector3(0,-1,0));
                return {lod:tile.lod,y:ray.intersectObjects(surfaces,false).map(h=>h.point.y)};
            });
            layers.push({treatment,mode,hits});
        }
        s.setMode('all');s.setLitterTreatment('merged');s.setLod(comparison);s.frameFields();s.lighting.render(0);
        const full=s.getSnapshot();return {initial,layouts,layers,full,generation,unchangedGeneration,shadows};
    },comparison);
    expect(result.initial.fields.count).toBe(9);expect(result.initial.lod).toBe(comparison);
    expect(new Set(result.shadows).size).toBe(1);expect(result.unchangedGeneration).toBe(result.generation);
    for(const {state,visible} of result.layouts){
        const tiles=state.fields.tiles.filter(t=>t.active);
        expect(visible.every(v=>v.meshes.length===1)).toBe(true);
        expect(tiles[0].lod).toBe('LOD2');
        const cycle=comparison==='LOD2+4'?['LOD2','LOD4']:['LOD2','LOD3','LOD4'];
        for(const tile of tiles){
            expect(tile.lod).toBe(cycle[((tile.x/13+tile.z/13)%cycle.length+cycle.length)%cycle.length]);
            for(const other of tiles)if(Math.abs(tile.x-other.x)+Math.abs(tile.z-other.z)===13)expect(tile.lod).not.toBe(other.lod);
        }
        expect(state.triangles).toBe(tiles.reduce((sum,t)=>sum+state.lods[t.lod].triangles,0));
    }
    expect(result.full.fields.tiles.filter(t=>t.lod==='LOD2')).toHaveLength(comparison==='LOD2+4'?5:3);
    expect(result.full.fields.tiles.filter(t=>t.lod==='LOD3')).toHaveLength(comparison==='LOD2+4'?0:3);
    expect(result.full.fields.tiles.filter(t=>t.lod==='LOD4')).toHaveLength(comparison==='LOD2+4'?4:3);
    expect(result.full.visibleFields).toBe(9);
    expect(result.full.visibleLeaves).toBe(comparison==='LOD2+4'?864000:3*(96000*2+81600));
    expect(result.full.visibleTriangles).toBe(result.full.sceneTriangles);
    for(const layer of result.layers)for(const hit of layer.hits){
        const alphaOverSoil=layer.treatment==='alpha'&&layer.mode==='all'&&hit.lod!=='LOD4';
        expect(hit.y).toHaveLength(alphaOverSoil?2:1);
        if(layer.mode==='soil'||layer.mode==='grass'&&hit.lod!=='LOD4')expect(hit.y[0]).toBeCloseTo(0,6);
        else expect(hit.y[0]).toBeGreaterThan(.004);
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(output,comparison+'-validation.json'),JSON.stringify({...result,errors},null,2));
    await page.screenshot({path:path.join(output,'nine_fields_'+comparison+'.png')});
});
