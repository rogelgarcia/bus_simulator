// Compare the material retune with the previous appearance under identical game lighting.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lighting');
test.use({viewport:{width:1920,height:1080},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined}});
test('Transition material tuning keeps the same rendering budget',async({page})=>{
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK!=='1','Opt-in hardware timing.');
    test.setTimeout(240000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_transition_scene.html#front');
    await page.waitForFunction(()=>!!window.__grassTransitionReadiness);await page.evaluate(()=>window.__grassTransitionReadiness);
    const metadata=await page.evaluate(async()=>{
        const s=window.__grassTransitionScene,THREE=await import('three');s.setAnimating(false);s.setHelpers(false);
        const {cloneMaterialShaderContract}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const {getOrCreateGpuFrameTimer}=await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer=getOrCreateGpuFrameTimer(s.renderer),sun=s.lighting.sun,grassShadow=sun.shadow.map;
        sun.shadow.map=null;s.setSoilOnly(true);const soilShadow=sun.shadow.map,soil=new THREE.Group();
        s.fields.group.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.name.endsWith('-Ground'))return;
            const clone=new THREE.InstancedMesh(mesh.geometry,mesh.material,mesh.count);clone.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0,mesh.count*16));
            clone.instanceMatrix.needsUpdate=true;clone.position.copy(mesh.position);clone.receiveShadow=mesh.receiveShadow;clone.computeBoundingSphere();soil.add(clone);});
        sun.shadow.map=grassShadow;s.setSoilOnly(false);soil.visible=false;s.scene.add(soil);
        const meshMaterials=[],oldMaterials=new Map(),uniforms=new Set(),seenMeshes=new Set();
        const collectMaterials=()=>s.fields.group.traverse(mesh=>{if(!mesh.isMesh||seenMeshes.has(mesh))return;seenMeshes.add(mesh);const material=mesh.material;
            if(material.userData.grassFieldDistance)uniforms.add(material.userData.grassFieldDistance);
            if(!mesh.userData.grassCanopy)return;
            if(!oldMaterials.has(material)){const clone=cloneMaterialShaderContract(material);delete clone.defines.GRASS_TRANSITION_CANOPY_COVERAGE;oldMaterials.set(material,clone);}
            meshMaterials.push([mesh,material,oldMaterials.get(material)]);
        });
        const select=version=>{
            s.fields.group.visible=version!=='soil';soil.visible=version==='soil';sun.shadow.map=version==='soil'?soilShadow:grassShadow;
            for(const [mesh,current,old] of meshMaterials){
                mesh.material=version==='old'?old:current;
                current.userData.grassFloorLeafColorScale.value.set(...(version==='old'?[1,1,1]:[1.04,1.03,1.02]));
            }
            for(const u of uniforms){u.value.x=version==='old'?8:5;u.value.y=version==='old'?30:18;}
        };
        const frame=()=>new Promise(requestAnimationFrame);
        const render=()=>{timer.poll();timer.beginFrame();try{s.lighting.render(0);}finally{timer.endFrame();}};
        window.__transitionLightingBench={
            async prepare(pose){select('updated');s.setPose(pose);collectMaterials();for(const v of ['old','updated','soil']){select(v);await s.renderer.compileAsync(s.scene,s.camera);for(let i=0;i<90;i++){await frame();render();}}},
            async round(round){
                const versions=['old','updated','soil'],records=[];
                const submit=async(measure,i)=>{await frame();for(let j=0;j<3;j++){
                    const v=versions[(i+j+round)%3];select(v);render();if(measure)records.push({version:v,sequence:timer.getDiagnostics().submissionSequence});}};
                for(let i=0;i<(round===0?120:8);i++)await submit(false,i);
                const before=timer.getDiagnostics(),start=s.getSnapshot();
                for(let i=0;i<30;i++)await submit(true,i);
                const last=timer.getDiagnostics().submissionSequence;
                const read=()=>timer.getSamplesSince(0).filter(x=>x.submissionSequence>before.submissionSequence&&x.submissionSequence<=last);
                for(let i=0;i<120&&read().length<90;i++){await frame();timer.poll();}
                const samples=read(),end=s.getSnapshot();
                if(samples.length!==90||timer.getDiagnostics().disjointCount!==before.disjointCount)throw Error('Invalid GPU timing block');
                const lookup=new Map(samples.map(x=>[x.submissionSequence,x.ms]));
                return {round,values:Object.fromEntries(versions.map(v=>[v,records.filter(r=>r.version===v).map(r=>lookup.get(r.sequence))])),
                    shadows:end.shadows.generations-start.shadows.generations,uploads:end.fields.instanceUploads-start.fields.instanceUploads,glError:end.glError};
            }
        };
        const gl=s.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
        return {renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),lighting:s.lighting.getSnapshot(),
            distances:s.getSnapshot().selection.effectiveDistances,resolution:[innerWidth,innerHeight],pixelRatio:s.renderer.getPixelRatio(),
            method:'Six paired rounds of 30 GPU samples. Old/updated/soil interleaved per RAF; 90 startup frames per variant, 120 warmup cycles before round one, 8 later. Same game sun, cached matched grass/soil shadows; no helpers, geometry uploads or selection work during timing.'};
    });
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    const report={metadata,poses:{},errors};const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
    const summary=values=>{const m=mean(values),sd=Math.sqrt(mean(values.map(v=>(v-m)**2))*values.length/(values.length-1));return {mean:m,ci95:2.571*sd/Math.sqrt(values.length)};};
    for(const pose of ['front','rear','border']){
        await page.evaluate(pose=>window.__transitionLightingBench.prepare(pose),pose);const rounds=[];
        for(let i=0;i<6;i++){
            const r=await page.evaluate(i=>window.__transitionLightingBench.round(i),i);rounds.push(r);
            expect(r.shadows).toBe(0);expect(r.uploads).toBe(0);expect(r.glError).toBe(0);
        }
        report.poses[pose]={rounds,old:summary(rounds.map(r=>mean(r.values.old)-mean(r.values.soil))),
            updated:summary(rounds.map(r=>mean(r.values.updated)-mean(r.values.soil))),
            saved:summary(rounds.map(r=>mean(r.values.old)-mean(r.values.updated)))};
        await writeFile(path.join(output,'benchmark.json'),JSON.stringify(report,null,2));
    }
    expect(errors).toEqual([]);
});
