// Inspect the canopy perimeter independently from the top and its live border leaves.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const phase=process.env.GRASS_WALL_PHASE||'after';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_wall_detail',phase);
test.use({viewport:{width:1600,height:1000},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});
test('Canopy wall retains grass on the bevel, detailed litter and gentle base shading without gaps',async({page})=>{
    test.setTimeout(180000);await mkdir(output,{recursive:true});const errors=[],rows=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-wall-detail-1&lod=LOD4_1K&fields=9#bus_14m_front');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness,null,{timeout:30000});await page.evaluate(()=>window.__grassLitterReadiness);
    const initial=await page.evaluate(async()=>{
        const s=window.__grassLitterScene,THREE=await import('three');
        const {registerMaterialShaderHook}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const probe={value:0},materials=new Set(Object.values(s.canopy.wall.materials).flat());
        for(const material of materials)registerMaterialShaderHook(material,{id:'grass.wall-bevel.audit',priority:100,variantKey:'wall-height-mask',uniforms:{wallProbe:probe},apply:shader=>{
            shader.fragmentShader='uniform float wallProbe;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nif(wallProbe>0.5)gl_FragColor=vec4(vGrassWallHeight,grassFloorLeafMask,grassWallLitterWeight,0.5);\nif(wallProbe>1.5)gl_FragColor=vec4(grassFloorSoilColor/max(1.0-grassFloorLeafMask,0.0001),0.5);');
        }});
        window.__wallAudit={THREE,probe,materials,target:new THREE.WebGLRenderTarget(1600,1000,{samples:4,colorSpace:THREE.NoColorSpace}),black:new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide})};
        return {wall:s.canopy.wall.getSnapshot(),shadows:s.getSnapshot().shadows.generations,
            linearMagnification:[...materials].every(m=>m.map.magFilter===THREE.LinearFilter&&m.normalMap.magFilter===THREE.LinearFilter)};
    });
    const poses=[
        {id:'front_edge',position:[0,.35,6.65],target:[0,.07,5.9]},
        {id:'rear_edge',position:[0,.35,-6.65],target:[0,.07,-5.9]},
        {id:'front_corner',position:[6.7,.45,6.7],target:[5.86,.07,5.86]},
        {id:'rear_corner',position:[-6.7,.45,-6.7],target:[-5.86,.07,-5.86]},
        {id:'near_oblique',position:[8,2,8],target:[3,.07,3]},
        {id:'bus_14m_front'},{id:'bus_14m_rear'},{id:'bus_19m_rear'},{id:'bus_24m_side'}
    ];
    for(const pose of poses){
        await page.evaluate(p=>{
            const s=window.__grassLitterScene;
            if(p.position){s.camera.position.fromArray(p.position);s.camera.lookAt(...p.target);s.camera.updateMatrixWorld(true);}
            else{s.setView(s.getSnapshot().views-9+({bus_14m_front:0,bus_14m_rear:1,bus_19m_rear:4,bus_24m_side:8}[p.id]));}
            s.setLod('LOD4_1K');s.lighting.render(0);
        },pose);
        const row=await page.evaluate(()=>{
            const s=window.__grassLitterScene,a=window.__wallAudit,{THREE}=a,gl=s.renderer.getContext();
            s.lighting.render(0);const color=new Uint8Array(1600*1000*4);gl.readPixels(0,0,1600,1000,gl.RGBA,gl.UNSIGNED_BYTE,color);
            const saved=[];s.scene.traverse(o=>{if(o.isMesh&&!a.materials.has(o.material)){saved.push([o,o.material]);o.material=a.black;}});
            const old={target:s.renderer.getRenderTarget(),tone:s.renderer.toneMapping,background:s.scene.background};
            a.probe.value=1;s.scene.background=new THREE.Color(0);s.renderer.toneMapping=THREE.NoToneMapping;
            s.renderer.setRenderTarget(a.target);s.renderer.clear();s.renderer.render(s.scene,s.camera);
            const mask=new Uint8Array(color.length);s.renderer.readRenderTargetPixels(a.target,0,0,1600,1000,mask);
            a.probe.value=2;s.renderer.setRenderTarget(null);s.renderer.setRenderTarget(a.target);s.renderer.clear();s.renderer.render(s.scene,s.camera);
            const background=new Uint8Array(color.length);s.renderer.readRenderTargetPixels(a.target,0,0,1600,1000,background);
            a.probe.value=0;saved.forEach(([o,m])=>o.material=m);s.renderer.setRenderTarget(old.target);s.renderer.toneMapping=old.tone;s.scene.background=old.background;
            const bands={lower:[],middle:[],upper:[]};
            for(let i=0;i<mask.length;i+=4){if(Math.abs(mask[i+3]-128)>1)continue;const h=mask[i]/255;
                const band=h>.05&&h<.25?'lower':h>.4&&h<.6?'middle':h>.98?'upper':null;if(band)bands[band].push(i);}
            const stats=Object.fromEntries(Object.entries(bands).map(([name,ids])=>[name,{pixels:ids.length,
                rgb:[0,1,2].map(c=>ids.reduce((n,i)=>n+color[i+c],0)/ids.length),
                leafCoverage:ids.reduce((n,i)=>n+mask[i+1]/255,0)/ids.length,litterWeight:ids.reduce((n,i)=>n+mask[i+2]/255,0)/ids.length}]));
            const luminance=(image,i)=>image[i]*.2126+image[i+1]*.7152+image[i+2]*.0722;
            const variance=ids=>{const mean=ids.reduce((n,i)=>n+luminance(background,i),0)/ids.length;
                return Math.sqrt(ids.reduce((n,i)=>n+(luminance(background,i)-mean)**2,0)/ids.length);};
            const backgroundStd=Object.fromEntries(Object.entries(bands).map(([band,ids])=>[band,variance(ids.filter(i=>mask[i+1]<26))]));
            let baseTintProbe=null;
            if([...a.materials].every(m=>m.userData.grassWallBaseTint)){
                for(const m of a.materials)m.userData.grassWallBaseTint.value.set(1,1);
                s.lighting.render(0);const untinted=new Uint8Array(color.length);gl.readPixels(0,0,1600,1000,gl.RGBA,gl.UNSIGNED_BYTE,untinted);
                const tint=s.canopy.wall.getSnapshot().baseTint;
                for(const m of a.materials)m.userData.grassWallBaseTint.value.set(tint.leaves,tint.litter);
                baseTintProbe=Object.fromEntries(['leaves','litter'].map(kind=>{const ids=bands.lower.filter(i=>kind==='leaves'?mask[i+1]>245:mask[i+1]<10);
                    return [kind,{pixels:ids.length,delta:ids.reduce((n,i)=>n+luminance(untinted,i)-luminance(color,i),0)/ids.length}];}));
            }
            let selfShadowProbe=null;
            if([...a.materials].every(m=>m.userData.grassWallSelfShadowStrength)){
                for(const m of a.materials)m.userData.grassWallSelfShadowStrength.value=1;
                s.lighting.render(0);const full=new Uint8Array(color.length);gl.readPixels(0,0,1600,1000,gl.RGBA,gl.UNSIGNED_BYTE,full);
                for(const m of a.materials)m.userData.grassWallSelfShadowStrength.value=s.canopy.wall.getSnapshot().selfShadowStrength;
                const ids=bands.lower;selfShadowProbe={pixels:ids.length,after:ids.reduce((n,i)=>n+luminance(color,i),0)/ids.length,before:ids.reduce((n,i)=>n+luminance(full,i),0)/ids.length};
            }
            s.lighting.render(0);return {bands:stats,backgroundStd,baseTintProbe,selfShadowProbe,shadows:s.getSnapshot().shadows.generations,glError:gl.getError()};
        });
        rows.push({pose:pose.id,...row});await page.screenshot({path:path.join(output,pose.id+'.png')});
    }
    const structure=await page.evaluate(()=>{
        const s=window.__grassLitterScene,{THREE}=window.__wallAudit,root=s.scene.getObjectByName('GrassFieldTile_1'),canopy=root.getObjectByName('GrassField-LOD4');s.scene.updateMatrixWorld(true);
        const surfaces=[];canopy.traverse(o=>{if(o.userData.grassCanopy||o.userData.grassCanopyWall)surfaces.push(o);});
        const ray=new THREE.Raycaster(),hits=[];
        for(const sign of [-1,1])for(const z of [-5.949,-5.925,-5.9,-5.4,0,5.4,5.9,5.925,5.949])for(const x of [5.8999,5.9001,5.9125,5.925,5.9375,5.949]){
            ray.set(new THREE.Vector3(x*sign,1,z),new THREE.Vector3(0,-1,0));const found=ray.intersectObjects(surfaces,false);hits.push({x:x*sign,z,ys:found.map(h=>h.point.y)});
        }
        return {hits,levels:[...new Set(Array.from(s.canopy.wall.group.children[0].geometry.attributes.grassWallHeight.array))],wall:s.canopy.wall.getSnapshot()};
    });
    await writeFile(path.join(output,'results.json'),JSON.stringify({initial,rows,structure,errors},null,2));
    expect(errors).toEqual([]);expect(new Set(rows.map(r=>r.shadows))).toEqual(new Set([initial.shadows]));expect(rows.every(r=>r.glError===0)).toBe(true);
    for(const h of structure.hits){expect(h.ys.length,JSON.stringify(h)).toBeGreaterThan(0);expect(Math.max(...h.ys)-Math.min(...h.ys)).toBeLessThan(.00001);}
    if(phase!=='before'){
        expect(structure.levels).toHaveLength(3);expect(structure.wall.triangles).toBe(416);expect(structure.wall.textureBytes).toBe(initial.wall.textureBytes);
        expect(structure.wall.textureSize).toEqual([1024,2048]);expect(structure.wall.textureBytes).toBeLessThan(49*1048576);expect(initial.linearMagnification).toBe(true);
        for(const r of rows.filter(r=>r.pose.endsWith('edge')||r.pose.endsWith('corner'))){
            expect(r.bands.upper.pixels).toBeGreaterThan(20);expect(r.bands.upper.leafCoverage).toBeGreaterThan(.4);expect(r.bands.upper.litterWeight).toBeLessThan(.15);
            expect(r.backgroundStd.lower).toBeGreaterThan(2);expect(r.backgroundStd.upper).toBeGreaterThan(2);
            for(const p of Object.values(r.baseTintProbe)){expect(p.pixels).toBeGreaterThan(20);expect(p.delta).toBeGreaterThan(.2);expect(p.delta).toBeLessThan(10);}
            expect(r.selfShadowProbe.pixels).toBeGreaterThan(100);expect(r.selfShadowProbe.after).toBeGreaterThan(r.selfShadowProbe.before+2);
        }
    }
});
