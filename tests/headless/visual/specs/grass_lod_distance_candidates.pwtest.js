// Compare distance shading and tip compression without changing the bake or cached shadows.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeGrassDistanceReport } from '../grass_distance_report.mjs';

const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod_distance',process.env.GRASS_DISTANCE_PHASE||'candidates');
test.use({viewport:{width:1600,height:1000},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});
test('Compare distant grass light, contrast and silhouette at fixed bus cameras',async({page})=>{
    test.skip(process.env.GRASS_DISTANCE_CANDIDATES!=='1','Opt-in visual experiment.');
    test.setTimeout(300000);await mkdir(output,{recursive:true});const errors=[],rows=[],timings=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const requestFailures=[];page.on('requestfailed',r=>requestFailures.push(r.url()+': '+r.failure()?.errorText));
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod-distance-1&lod=LOD3&fields=9#bus_19m_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness,null,{timeout:30000}).catch(error=>{throw new Error([...errors,...requestFailures].join('\n'),{cause:error});});await page.evaluate(()=>window.__grassLitterReadiness);
    const poses=await page.evaluate(async()=>{
        const s=window.__grassLitterScene,THREE=await import('three');
        s.setLod('LOD4_1K');s.setLod('LOD3');
        const {registerMaterialShaderHook}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const live=[s.scene.getObjectByName('GrassField-LOD2').material,s.detail.material];
        if(live.some(m=>!m.userData.grassFieldDistance))throw Error('Distance appearance is not installed in the scene.');
        if(s.scene.getObjectByName('GrassField-LOD1').material.userData.grassFieldDistance)throw Error('Reference material was modified.');
        const leaf=new Set(live),canopy=new Set([...Object.values(s.canopy.materials),...Object.values(s.canopy.wall.materials).flat()]),probe={value:0};
        const canopyLive=Object.values(s.canopy.materials);
        for(const m of [...leaf,...canopy])registerMaterialShaderHook(m,{id:'grass.distance.audit',priority:100,variantKey:canopy.has(m)?'canopy':'leaf',uniforms:{distanceProbe:probe},apply:shader=>{
            shader.fragmentShader='uniform float distanceProbe;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nif(distanceProbe>0.5)gl_FragColor=vec4(vec3('+(canopy.has(m)?'grassFloorLeafMask':'1.0')+'),1.0);');
        }});
        window.__distanceAudit={THREE,live,probe,canopyLive,materials:new Set([...leaf,...canopy]),target:new THREE.WebGLRenderTarget(1600,1000,{samples:4,colorSpace:THREE.NoColorSpace}),black:new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide})};
        return Array.from(document.querySelector('#scene-view').options).filter(o=>o.text.startsWith('Bus')).map(o=>({id:o.text.toLowerCase().replaceAll(' · ','_').replace('bus_','bus_').replace(' m_','m_'),index:o.value}));
    });
    const candidates=process.env.GRASS_DISTANCE_FINAL==='1'?[['baseline',0,0,0,0],['final',.85,.3,1,.85]]:
        [['baseline',0,0,0],['strong',.85,.3,0],['filtered',.85,.3,1],['shorter',.85,.45,1]];
    if(process.env.GRASS_DISTANCE_VERIFY==='1')for(const azimuth of [0,45,90,135,180,225,270,315])poses.push({id:'holdout_19m_'+azimuth,azimuth,range:19});
    for(const pose of poses){
        if(pose.index!==undefined)await page.selectOption('#scene-view',pose.index);
        else await page.evaluate(async pose=>{
            const s=window.__grassLitterScene,{THREE}=window.__distanceAudit;
            const {GRASS_FIELD_BUS_CAMERA:c}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BusCamera.js');
            const angle=pose.azimuth*Math.PI/180;s.camera.position.set(Math.sin(angle)*pose.range,c.heightMeters,Math.cos(angle)*pose.range);
            s.camera.lookAt(0,c.heightMeters-pose.range*Math.tan(c.pitchDegrees*Math.PI/180),0);s.camera.updateMatrixWorld(true);
        },pose);
        for(const [candidate,filter,height,shadow,canopyFilter=0] of candidates){
            await page.evaluate(({filter,height,shadow,canopyFilter})=>{window.__distanceAudit.canopyLive.forEach(m=>m.userData.grassFieldDistance.value.z=canopyFilter);window.__distanceAudit.live.forEach(m=>{m.userData.grassFieldDistance.value.z=filter;m.userData.grassFieldDistance.value.w=height;m.userData.grassFieldShadowSoftness.value=shadow;});},{filter,height,shadow,canopyFilter});
            for(const lod of ['LOD2','LOD3','LOD4']){
                const row=await page.evaluate(async lod=>{
                    const s=window.__grassLitterScene,a=window.__distanceAudit,{THREE}=a;s.setLod(lod);await new Promise(requestAnimationFrame);s.lighting.render(0);
                    const gl=s.renderer.getContext(),color=new Uint8Array(1600*1000*4);gl.readPixels(0,0,1600,1000,gl.RGBA,gl.UNSIGNED_BYTE,color);
                    const saved=[];s.scene.traverse(o=>{if(o.isMesh&&!a.materials.has(o.material)){saved.push([o,o.material]);o.material=a.black;}});
                    const old={target:s.renderer.getRenderTarget(),tone:s.renderer.toneMapping,background:s.scene.background};
                    a.probe.value=1;s.scene.background=new THREE.Color(0);s.renderer.toneMapping=THREE.NoToneMapping;
                    s.renderer.setRenderTarget(a.target);s.renderer.clear();s.renderer.render(s.scene,s.camera);
                    const mask=new Uint8Array(color.length);s.renderer.readRenderTargetPixels(a.target,0,0,1600,1000,mask);
                    a.probe.value=0;saved.forEach(([o,m])=>o.material=m);s.renderer.setRenderTarget(old.target);s.renderer.toneMapping=old.tone;s.scene.background=old.background;
                    const sections=[];
                    for(const cx of [-4,0,4])for(const cz of [-4,0,4]){
                        if(cx===0&&cz===0)continue;
                        const ids=new Set();for(let x=0;x<100;x++)for(let z=0;z<100;z++){
                            const p=new THREE.Vector3(cx-.7+1.4*x/99,.1,cz-.7+1.4*z/99).project(s.camera),ix=Math.floor((p.x*.5+.5)*1600),iy=Math.floor((p.y*.5+.5)*1000);
                            if(p.z>=-1&&p.z<=1&&ix>0&&ix<1599&&iy>0&&iy<999)ids.add(iy*1600+ix);
                        }
                        if(ids.size<30)continue;const rgb=[0,0,0],grassRgb=[0,0,0],lumas=[];let coverage=0,grass=0,gradient=0;
                        const luminance=i=>color[4*i]*.2126+color[4*i+1]*.7152+color[4*i+2]*.0722;
                        for(const i of ids){coverage+=mask[i*4]/255;const l=luminance(i);lumas.push(l);gradient+=(Math.abs(l-luminance(i+1))+Math.abs(l-luminance(i+1600)))/2;
                            for(let k=0;k<3;k++)rgb[k]+=color[i*4+k];if(mask[i*4]>245){grass++;for(let k=0;k<3;k++)grassRgb[k]+=color[i*4+k];}}
                        lumas.sort((a,b)=>a-b);const quantile=f=>lumas[Math.floor((lumas.length-1)*f)];
                        sections.push({center:[cx,cz],pixels:ids.size,coverage:coverage/ids.size,rgb:rgb.map(v=>v/ids.size),grassPixels:grass,grassRgb:grassRgb.map(v=>v/grass),
                            gradient:gradient/ids.size,q10:quantile(.1),q50:quantile(.5),q90:quantile(.9),q99:quantile(.99)});
                    }
                    s.lighting.render(0);return {sections,shadows:s.getSnapshot().shadows.generations,glError:gl.getError(),position:s.camera.position.toArray()};
                },lod);
                rows.push({pose:pose.id,candidate,lod,...row});
                await page.screenshot({path:path.join(output,pose.id+'_'+candidate+'_'+lod+'.png')});
            }
            if(process.env.GRASS_DISTANCE_BENCHMARK==='1'&&pose.id.startsWith('bus_19m'))timings.push(...await page.evaluate(async({pose,candidate})=>{
                const s=window.__grassLitterScene,gl=s.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
                if(!ext)throw Error('Hardware GPU timer unavailable');
                const {cloneMaterialShaderContract}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
                const saved=[],clones=new Map();
                if(candidate==='baseline'){
                    for(const m of [...window.__distanceAudit.live,...window.__distanceAudit.canopyLive])clones.set(m,cloneMaterialShaderContract(m,['grass.field-distance','grass.canopy-distance']));
                }
                const frame=()=>new Promise(requestAnimationFrame),blocks=[];
                const batch=async()=>{
                    const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);for(let i=0;i<12;i++)s.lighting.render(0);gl.endQuery(ext.TIME_ELAPSED_EXT);
                    for(let i=0;!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++){if(i>120)throw Error('GPU query timed out');await frame();}
                    if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU query disjoint');
                    const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/12e6;gl.deleteQuery(q);return ms;
                };
                const modes=['LOD2','LOD3','LOD4'];for(let i=0;i<5;i++)await batch();
                for(let round=0;round<3;round++)for(let offset=0;offset<3;offset++){
                    const lod=modes[(round+offset)%3];s.setLod(lod);await frame();
                    if(candidate==='baseline')s.scene.traverse(o=>{if(o.isMesh&&clones.has(o.material)){saved.push([o,o.material]);o.material=clones.get(o.material);}});
                    await batch();const generation=s.getSnapshot().shadows.generations,samples=[];
                    for(let i=0;i<6;i++)samples.push(await batch());
                    if(s.getSnapshot().shadows.generations!==generation)throw Error('Shadow regenerated during timing');
                    blocks.push({pose,candidate,lod,round,samples,mean:samples.reduce((a,b)=>a+b,0)/samples.length});
                    saved.splice(0).forEach(([o,m])=>o.material=m);
                }
                clones.forEach(m=>m.dispose());return blocks;
            },{pose:pose.id,candidate}));
        }
        await writeFile(path.join(output,'results.json'),JSON.stringify({rows,timings,errors},null,2));
    }
    expect(errors).toEqual([]);expect(new Set(rows.map(r=>r.shadows)).size).toBe(1);expect(rows.every(r=>r.glError===0)).toBe(true);
    if(process.env.GRASS_DISTANCE_FINAL==='1'){
        const average=values=>values.reduce((a,b)=>a+b,0)/values.length;
        const contrast=row=>row.sections.reduce((n,s)=>n+s.gradient*s.pixels,0)/row.sections.reduce((n,s)=>n+s.pixels,0);
        const gap=candidate=>average(poses.map(p=>Math.abs(contrast(rows.find(r=>r.pose===p.id&&r.candidate===candidate&&r.lod==='LOD3'))-contrast(rows.find(r=>r.pose===p.id&&r.candidate===candidate&&r.lod==='LOD4')))));
        expect(gap('final')).toBeLessThan(gap('baseline')*.7);
        for(const row of rows)expect(row.sections.reduce((n,s)=>n+s.grassPixels,0)).toBeGreaterThan(100);
        await writeGrassDistanceReport(output,{rows,timings,errors});
    }
});
