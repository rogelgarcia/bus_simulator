// Compare watertight corners with the previous edge strips using frozen production batches.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/boundary');
test.use({viewport:{width:1920,height:1080},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined}});
test('Watertight canopy corners retain a low rendering cost',async({page})=>{
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK!=='1','Opt-in hardware timing.');
    test.setTimeout(240000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_transition_scene.html#front');
    await page.waitForFunction(()=>!!window.__grassTransitionReadiness);await page.evaluate(()=>window.__grassTransitionReadiness);
    const metadata=await page.evaluate(async()=>{
        const s=window.__grassTransitionScene,THREE=await import('three');s.setSettings({ movementThreshold: .25, intervalMs: 100 }); s.setAnimating(false);s.setHelpers(false);

        const {getOrCreateGpuFrameTimer}=await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer=getOrCreateGpuFrameTimer(s.renderer),sun=s.lighting.sun,grassShadow=sun.shadow.map;
        sun.shadow.map=null;s.setSoilOnly(true);const soilShadow=sun.shadow.map,soil=new THREE.Group();
        s.fields.group.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.name.endsWith('-Ground'))return;
            const clone=new THREE.InstancedMesh(mesh.geometry,mesh.material,mesh.count);clone.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0,mesh.count*16));
            clone.instanceMatrix.needsUpdate=true;clone.position.copy(mesh.position);clone.receiveShadow=mesh.receiveShadow;clone.computeBoundingSphere();soil.add(clone);});
        sun.shadow.map=grassShadow;s.setSoilOnly(false);soil.visible=false;s.scene.add(soil);
        const groups=new Map(),ownedGeometry=[];
        const ids=new Map(s.fields.cells.map(c=>[c.centerX+':'+c.centerZ,c]));
        const matrix=new THREE.Matrix4();
        function capture(previous){
            const group=new THREE.Group(),strips=new Map();
            s.fields.group.traverse(source=>{
                if(!source.isInstancedMesh||!source.visible||!source.count)return;
                if(previous&&source.geometry.attributes.grassTransitionOpenEdges){
                    const open=source.geometry.attributes.grassTransitionOpenEdges;
                    for(let i=0;i<source.count;i++){
                        source.getMatrixAt(i,matrix);const cell=ids.get(matrix.elements[12]+':'+matrix.elements[14]);
                        const mask=cell.edge|[1,2,4,8].reduce((n,bit,k)=>n|(open.array[i*4+k]?bit:0),0),key=cell.field+':'+mask;
                        let mesh=strips.get(key);
                        if(!mesh){
                            const xs=[-.5,...(mask&1?[-.45]:[]),...(mask&2?[.45]:[]),.5];
                            const zs=[-.5,...(mask&4?[-.45]:[]),...(mask&8?[.45]:[]),.5];
                            const positions=[],normals=[],uvs=[],indices=[];
                            for(const z of zs)for(const x of xs){positions.push(x,.1,z);normals.push(0,1,0);uvs.push(x+.5,.5-z);}
                            for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){const a=z*xs.length+x,b=a+xs.length;indices.push(a,b,a+1,a+1,b,b+1);}
                            const geometry=new THREE.BufferGeometry();
                            geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
                            geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
                            geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
                            geometry.setAttribute('grassTransitionOpenEdges',new THREE.InstancedBufferAttribute(new Float32Array(1024*4),4));
                            ownedGeometry.push(geometry);mesh=new THREE.InstancedMesh(geometry,source.material,1024);mesh.count=0;mesh.receiveShadow=true;
                            strips.set(key,mesh);group.add(mesh);
                        }
                        mesh.setMatrixAt(mesh.count,matrix);
                        mesh.geometry.attributes.grassTransitionOpenEdges.array.set(open.array.subarray(i*4,i*4+4),mesh.count*4);mesh.count++;
                    }
                }else{
                    const mesh=new THREE.InstancedMesh(source.geometry,source.material,source.count);
                    mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0,source.count*16));
                    mesh.position.copy(source.position);mesh.receiveShadow=source.receiveShadow;group.add(mesh);
                }
            });
            for(const mesh of group.children){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
            group.visible=false;s.scene.add(group);return group;
        }
        const select=version=>{
            s.fields.group.visible=false;soil.visible=version==='soil';sun.shadow.map=version==='soil'?soilShadow:grassShadow;
            for(const [id,group]of groups)group.visible=id===version;
        };
        const frame=()=>new Promise(requestAnimationFrame);
        const render=()=>{timer.poll();timer.beginFrame();try{s.lighting.render(0);}finally{timer.endFrame();}};
        window.__transitionLightingBench={
            async prepare(pose){
                for(const group of groups.values()){group.removeFromParent();group.children.forEach(mesh=>mesh.dispose());}groups.clear();
                ownedGeometry.splice(0).forEach(g=>g.dispose());soil.visible=false;s.fields.group.visible=true;sun.shadow.map=grassShadow;
                s.setPose(pose);s.fields.setEdgeStrips(false);groups.set('old',capture(true));
                s.fields.setEdgeStrips(true);groups.set('updated',capture(false));
                const draws={};
                for(const v of ['old','updated','soil']){select(v);await s.renderer.compileAsync(s.scene,s.camera);for(let i=0;i<90;i++){await frame();render();}draws[v]={...s.renderer.info.render};}
                return draws;
            },
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
            method:'Six paired rounds of 30 GPU samples. Previous strips/watertight corners/soil interleaved per RAF; 90 startup frames per variant, 120 warmup cycles before round one, 8 later. Same game sun, cached matched grass/soil shadows; no helpers, geometry uploads or selection work during timing.'};
    });
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    const report={metadata,poses:{},errors};const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
    const summary=values=>{const m=mean(values),sd=Math.sqrt(mean(values.map(v=>(v-m)**2))*values.length/(values.length-1));return {mean:m,ci95:2.571*sd/Math.sqrt(values.length)};};
    for(const pose of ['front','rear','border']){
        const draws=await page.evaluate(pose=>window.__transitionLightingBench.prepare(pose),pose);const rounds=[];
        for(let i=0;i<6;i++){
            const r=await page.evaluate(i=>window.__transitionLightingBench.round(i),i);rounds.push(r);
            expect(r.shadows).toBe(0);expect(r.uploads).toBe(0);expect(r.glError).toBe(0);
        }
        report.poses[pose]={draws,rounds,old:summary(rounds.map(r=>mean(r.values.old)-mean(r.values.soil))),
            updated:summary(rounds.map(r=>mean(r.values.updated)-mean(r.values.soil))),
            saved:summary(rounds.map(r=>mean(r.values.old)-mean(r.values.updated)))};
        await writeFile(path.join(output,'benchmark.json'),JSON.stringify(report,null,2));
    }
    expect(errors).toEqual([]);
});
