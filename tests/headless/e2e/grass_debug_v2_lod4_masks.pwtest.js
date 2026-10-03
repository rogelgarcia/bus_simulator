// Separate rendered grass and background contributions using material coverage, never hue.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_color_match','views-'+(process.env.GRASS_VIEW_PHASE||'multiview'));
const compact = process.env.GRASS_LOD4_MASK_COMPACT === '1';
test.use({viewport:{width:1600,height:1600},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});
test('LOD4 masked color remains consistent across camera directions elevations and distances',async({page})=>{
    test.setTimeout(300000);await mkdir(output,{recursive:true});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-multiview-1&lod=LOD2#03_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);await page.evaluate(()=>window.__grassLitterReadiness);
    const data=await page.evaluate(async compact=>{
        const THREE=await import('three'),s=window.__grassLitterScene,probe=new THREE.Vector3();s.setFieldCount(9);
        const width=s.renderer.domElement.width,height=s.renderer.domElement.height;
        const target=new THREE.WebGLRenderTarget(width,height,{samples:4,colorSpace:THREE.NoColorSpace});
        const linearTarget=new THREE.WebGLRenderTarget(width,height,{samples:4,type:THREE.HalfFloatType,colorSpace:THREE.NoColorSpace});
        const linearPixels=new Uint16Array(width*height*4);
        const maskPixels=new Uint8Array(width*height*4);
        const uniform={value:0},cache=new Map(),rows=[];
        const {registerMaterialShaderHook}=await import("/src/graphics/shaders/core/MaterialShaderHookRegistry.js");
        for(const m of Object.values(s.canopy.materials)){
            registerMaterialShaderHook(m,{id:"grass.color-probe",priority:100,uniforms:{grassColorProbe:uniform},
                apply:shader=>{
                shader.uniforms.grassColorProbe=uniform;
                shader.fragmentShader='uniform float grassColorProbe;\n'+shader.fragmentShader;
                const anchor='diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor';
                shader.fragmentShader=shader.fragmentShader.replace(anchor,
                    'if(grassColorProbe == 1.0 || grassColorProbe == 4.0){diffuseColor.rgb=max(diffuseColor.rgb-grassFloorSoilColor,vec3(0.0))/max(grassFloorLeafMask,0.001);grassFloorSoilColor=vec3(0.0);}' +
                    'if(grassColorProbe == 2.0 || grassColorProbe == 5.0){diffuseColor.rgb=grassFloorSoilColor/max(1.0-grassFloorLeafMask,0.001);grassFloorSoilColor=diffuseColor.rgb;}\n'+anchor);
                shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
                    '#include <opaque_fragment>\nif(grassColorProbe == 3.0)gl_FragColor=vec4(grassFloorLeafMask,1.0-grassFloorLeafMask,0.0,1.0);');
            }});
        }
        const originals=new Map();s.scene.traverse(mesh=>{if(mesh.isMesh&&!Array.isArray(mesh.material))originals.set(mesh,mesh.material);});
        // Isolate diffuse grass color; measure the visible background with its full PBR response.
        // Full PBR stays enabled in the visual captures, including isolated litter glints.
        for(const material of new Set([...originals.values(),...Object.values(s.canopy.materials)]))if(material.isMeshStandardMaterial){
            registerMaterialShaderHook(material,{id:'grass.diffuse-color-probe',priority:110,uniforms:{grassColorProbe:uniform},
                apply:shader=>{
                    shader.uniforms.grassColorProbe=uniform;
                    if(!shader.fragmentShader.includes('uniform float grassColorProbe;'))
                        shader.fragmentShader='uniform float grassColorProbe;\n'+shader.fragmentShader;
                    const anchor='vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
                    if(!shader.fragmentShader.includes(anchor))throw Error('Diffuse color probe shader contract changed');
                    shader.fragmentShader=shader.fragmentShader.replace(anchor,
                        'if(grassColorProbe == 1.0)totalSpecular=vec3(0.0);\nif(grassColorProbe >= 4.0)totalDiffuse=vec3(0.0);\n'+anchor);
                }});
        }
        const isGrass=mesh=>mesh.userData.grassCanopy||mesh.userData.grassLeafCount||mesh.geometry.userData.grassLeafCount;
        const isGround=material=>material.name==='Brown Earth'||material.name.startsWith('Merged_DryLitter')||material.name.startsWith('DryLitter');
        function basic(original,color){
            const key=original.uuid+color;
            if(!cache.has(key)){
                const matte=new THREE.MeshBasicMaterial({color,map:original.map,side:original.side,
                    alphaMap:original.alphaMap,alphaTest:original.alphaTest,alphaToCoverage:original.alphaToCoverage,toneMapped:false});
                matte.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=diffuse;');};
                cache.set(key,matte);
            }
            return cache.get(key);
        }
        function replace(part){
            for(const [mesh,material] of originals){
                if(mesh.userData.grassCanopy){mesh.material=material;continue;}
                const leaf=!!isGrass(mesh);
                mesh.material=part==='mask'?basic(material,leaf?0xff0000:isGround(material)?0x00ff00:0):part.startsWith('grass')&&!leaf||part.startsWith('background')&&!isGround(material)?basic(material,0):material;
            }
        }
        const poses=[];
        for(const heldout of [false,true])for(const distance of heldout?[55,110]:[35,80])for(const elevation of heldout?[22,40,70]:[15,30,55])for(const azimuth of heldout?[22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5]:[0,45,90,135,180,225,270,315])
            poses.push({id:'d'+distance+'_e'+elevation+'_a'+azimuth,distance,elevation,azimuth});
        for(const [elevation,azimuth] of [[88,45],[88,225],[90,0]])
            poses.push({id:'d80_e'+elevation+'_a'+azimuth,distance:80,elevation,azimuth});
        if (compact) {
            poses.length = 0;
            for (const [distance,elevation,azimuth] of [[35,15,45],[80,15,225],[80,30,135],[80,55,45],[80,70,292.5],[110,30,225],[35,30,225],[80,88,45]])
                poses.push({id:'d'+distance+'_e'+elevation+'_a'+azimuth,distance,elevation,azimuth});
        }
        const sectionsToCheck=s.getSnapshot().fields.tiles.filter(t=>t.active).flatMap(t=>[[-3,-3],[-3,3],[3,-3],[3,3]].map(([x,z])=>({x:t.x+x,z:t.z+z,tile:t.index})));
        for(const mode of ['all','grass'])for(const pose of poses)for(const lod of ['LOD2','LOD4']){
            // Mode changes replace canopy materials, so remember the selected layer before each probe.
            for(const [mesh,material] of originals)mesh.material=material;
            s.setLod(lod);s.setMode(mode);s.setView(2);
            const az=THREE.MathUtils.degToRad(pose.azimuth),el=THREE.MathUtils.degToRad(pose.elevation);
            s.camera.position.set(Math.sin(az)*Math.cos(el)*pose.distance,Math.sin(el)*pose.distance,Math.cos(az)*Math.cos(el)*pose.distance);
            s.camera.up.set(0,pose.elevation===90?0:1,pose.elevation===90?-1:0);s.camera.lookAt(0,.1,0);s.camera.fov=45;s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld();
            s.scene.traverse(mesh=>{if(mesh.userData.grassCanopy)originals.set(mesh,mesh.material);});
            uniform.value=0;s.lighting.render(0);
            replace('mask');uniform.value=3;
            const previousTarget=s.renderer.getRenderTarget(),colorSpace=s.renderer.outputColorSpace,tone=s.renderer.toneMapping,background=s.scene.background;
            s.scene.background=new THREE.Color(0);s.renderer.toneMapping=THREE.NoToneMapping;
            s.renderer.setRenderTarget(target);s.renderer.render(s.scene,s.camera);s.renderer.readRenderTargetPixels(target,0,0,width,height,maskPixels);
            s.renderer.setRenderTarget(previousTarget);s.renderer.outputColorSpace=colorSpace;s.renderer.toneMapping=tone;s.scene.background=background;
            const probes = [['grass',1],['background',2],...(compact ? [['grass-specular',4],['background-specular',5]] : [])];
            for(const [part,value] of probes){
                replace(part);uniform.value=value;
                s.renderer.toneMapping=THREE.NoToneMapping;s.renderer.setRenderTarget(linearTarget);
                s.renderer.render(s.scene,s.camera);s.renderer.readRenderTargetPixels(linearTarget,0,0,width,height,linearPixels);
                s.renderer.setRenderTarget(previousTarget);s.renderer.toneMapping=tone;
                const sections=[];
                for(const {x,z,tile} of sectionsToCheck){
                    const rgb=[0,0,0];let total=0,coverage=0,count=0,valid=0;const seen=new Set();
                    for(let a=0;a<40;a++)for(let b=0;b<40;b++){
                        probe.set(x-.7+1.4*a/39,.1,z-.7+1.4*b/39).project(s.camera);
                        const px=Math.floor((probe.x*.5+.5)*width),py=Math.floor((.5-probe.y*.5)*height);
                        if(probe.z < -1 || probe.z > 1 || px<0||px>=width||py<0||py>=height)continue;
                        const mi=((height-1-py)*width+px)*4;if(seen.has(mi))continue;seen.add(mi);
                        const m=maskPixels[mi]/255,g=maskPixels[mi+1]/255;
                        if(maskPixels[mi+2]!==0||m+g>1.01)throw Error('Invalid material mask');
                        const weight=part.startsWith('grass')?m:g;coverage+=weight;valid+=m+g;count++;
                        if(weight<.005)continue;
                        for(let c=0;c<3;c++)rgb[c]+=THREE.DataUtils.fromHalfFloat(linearPixels[mi+c])*(lod==='LOD4'?weight:1);
                        total+=weight;
                    }
                    sections.push({x,z,tile,pixels:count,rgb:rgb.map(v=>v/Math.max(total,1)),coverage:coverage/Math.max(valid,1),visibleFraction:valid/count,sampleWeight:total});
                }
                rows.push({pose,mode,lod,part,sections});
            }
        }
        uniform.value=0;for(const [mesh,m] of originals)mesh.material=m;
        cache.forEach(m=>m.dispose());target.dispose();linearTarget.dispose();
        return {rows,definition:s.canopy.getSnapshot().definition};
    }, compact);
    await writeFile(path.join(output,'sections.json'),JSON.stringify({...data,errors},null,2));
    expect(errors).toEqual([]);
    for(const row of data.rows)for(const section of row.sections)expect(section.rgb.every(Number.isFinite)).toBe(true);
    const comparisons=[];
    for(const result of data.rows.filter(row=>row.lod==='LOD4')){
        const source=data.rows.find(row=>row.lod==='LOD2'&&row.pose.id===result.pose.id&&row.mode===result.mode&&row.part===result.part);
        result.sections.forEach((section,i)=>{
            const reference=source.sections[i];
            if(Math.min(reference.visibleFraction,section.visibleFraction)<.95||Math.min(reference.pixels,section.pixels)<120
                ||Math.min(reference.sampleWeight,section.sampleWeight)<15)return;
            const error=section.rgb.map((value,c)=>value/Math.max(reference.rgb[c],.001)-1);
            const luminance=.2126*reference.rgb[0]+.7152*reference.rgb[1]+.0722*reference.rgb[2];
            const normalizedError=section.rgb.map((value,c)=>(value-reference.rgb[c])/Math.max(luminance,.001));
            comparisons.push({pose:result.pose,mode:result.mode,part:result.part,x:section.x,z:section.z,tile:section.tile,source:reference.rgb,canopy:section.rgb,error,normalizedError,coverage2:reference.coverage,coverage4:section.coverage,coverageError:section.coverage-reference.coverage});
        });
    }
    await writeFile(path.join(output,'comparisons.json'),JSON.stringify(comparisons,null,2));
    expect(comparisons.length).toBeGreaterThan(compact ? 500 : 10000);
    const summary=[];
    for(const pose of new Set(comparisons.map(row=>row.pose.id)))for(const mode of ['all','grass'])for(const part of ['grass','background',...(compact ? ['grass-specular','background-specular'] : [])]){
        const rows=comparisons.filter(row=>row.pose.id===pose&&row.mode===mode&&row.part===part);
        expect(rows.length,pose+' '+mode+' '+part).toBeGreaterThan(3);
        const mean=[0,1,2].map(c=>rows.reduce((sum,row)=>sum+row.normalizedError[c],0)/rows.length);
        const absolute=rows.map(row=>Math.max(...row.normalizedError.map(Math.abs))).sort((a,b)=>a-b);
        const coverageError=rows.reduce((sum,row)=>sum+row.coverageError,0)/rows.length;
        const source=[0,1,2].map(c=>rows.reduce((sum,row)=>sum+row.source[c],0)/rows.length);
        const canopy=[0,1,2].map(c=>rows.reduce((sum,row)=>sum+row.canopy[c],0)/rows.length);
        summary.push({pose,mode,part,sections:rows.length,source,canopy,mean,p95:absolute[Math.floor(absolute.length*.95)],coverageError});
    }
    await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
    expect(summary).toHaveLength(compact ? 8*8 : 99*4);
    // HDR errors are normalized by reference material luminance, preserving low-energy blue channels.
    // Each camera must pass independently; opposite errors in different views cannot cancel.
    for(const row of summary){
        if(row.part.endsWith('-specular'))continue;
        expect(Math.max(...row.mean.map(Math.abs)),JSON.stringify(row)).toBeLessThan(.15);
        // Background glints are recorded but are not leaf-color failures. A top capture cannot
        // reproduce individual litter highlight locations; its per-camera background mean is gated.
        if(row.part==='grass')expect(row.p95,JSON.stringify(row)).toBeLessThan(.30);
        expect(Math.abs(row.coverageError),JSON.stringify(row)).toBeLessThan(.07);
    }
});
