// Compare material coverage at matching bus views; never infer grass from its hue.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const phase=process.env.GRASS_COVERAGE_PHASE||'after';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_coverage',phase);
test.use({viewport:{width:1600,height:1000},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});
test('LOD4 represents overlapping grass in oblique views and along its wall',async({page})=>{
    test.setTimeout(240000);await mkdir(output,{recursive:true});const errors=[],rows=[],timings=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-wall-litter-1&lod=LOD4&fields=9#bus_19m_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness,null,{timeout:30000}).catch(error=>{
        throw new Error('Grass scene startup failed: '+errors.join('\n'),{cause:error});
    });await page.evaluate(()=>window.__grassLitterReadiness);
    const initial=await page.evaluate(async()=>{
        const s=window.__grassLitterScene,THREE=await import('three');
        const {registerMaterialShaderHook}=await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const {grassFieldDistanceShader,grassFieldDistanceParsShader}=await import('/src/graphics/shaders/materials/grass/GrassFieldDistanceShaderLoader.js');
        const probe={value:0};
        for(const material of [...Object.values(s.canopy.materials),...Object.values(s.canopy.wall?.materials??{}).flat()])registerMaterialShaderHook(material,{id:'grass.coverage-audit',priority:100,uniforms:{coverageProbe:probe},apply:shader=>{
            shader.fragmentShader='uniform float coverageProbe;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('grassWallLitterBlend.z * smoothstep','(coverageProbe > 1.5 ? 0.0 : grassWallLitterBlend.z) * smoothstep');
            shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nif(coverageProbe>0.5)gl_FragColor=vec4(vec3(grassFloorLeafMask),1.0);');
        }});
        const black=new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide,toneMapped:false}),white=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
        const distanceMask=shader=>{
            shader.uniforms.grassFieldDistance=s.detail.material.userData.grassFieldDistance;
            shader.vertexShader=grassFieldDistanceParsShader.vertexSource+'\n'+shader.vertexShader.replace('#include <project_vertex>',grassFieldDistanceShader.vertexSource+'\n#include <project_vertex>');
        };
        white.onBeforeCompile=distanceMask;white.customProgramCacheKey=()=> 'grass-coverage-distance';
        const packed=white.clone();packed.onBeforeCompile=shader=>{
            shader.uniforms.decode={value:s.detail.decode};shader.vertexShader='uniform vec3 decode;\n'+shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=position*decode;');
            distanceMask(shader);
        };packed.customProgramCacheKey=()=> 'grass-coverage-packed';
        const target=new THREE.WebGLRenderTarget(1600,1000,{samples:4,colorSpace:THREE.NoColorSpace});
        window.__coverageAudit={THREE,probe,black,white,packed,target};
        return s.getSnapshot();
    });
    // The canonical bus preset fixes height and tilt; low side views expose the perimeter separately.
    const poses=await page.evaluate(async()=>{
        const {GRASS_FIELD_BUS_VIEWS}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BusCamera.js');
        return GRASS_FIELD_BUS_VIEWS.map(v=>({id:v.id,index:Array.from(document.querySelector('#scene-view').options).find(o=>o.text===v.label).value}));
    });
    poses.push({id:'low_front',bearing:40},{id:'low_rear',bearing:220},{id:'low_side',bearing:130},{id:'top',bearing:0},
        {id:'edge_close',position:[0,.4,7],target:[0,.1,5.8]},{id:'corner_close',position:[7,.5,7],target:[5.8,.1,5.8]});
    for(const pose of poses){
        if(pose.index)await page.selectOption('#scene-view',pose.index);
        else await page.evaluate(p=>{const s=window.__grassLitterScene,{THREE}=window.__coverageAudit,a=p.bearing*Math.PI/180;
            if(p.position){s.camera.position.fromArray(p.position);s.camera.lookAt(...p.target);}else{s.camera.position.set(19*Math.sin(a),p.id==='top'?40:1.2,19*Math.cos(a));s.camera.lookAt(0,.06,0);}s.camera.updateMatrixWorld();},pose);
        for(const lod of ['LOD2','LOD3','LOD4']){
            const row=await page.evaluate(async({lod,pose})=>{
                const s=window.__grassLitterScene,a=window.__coverageAudit,{THREE}=a;s.setLod(lod);
                for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);s.lighting.render(0);
                const gl=s.renderer.getContext(),color=new Uint8Array(1600*1000*4);gl.readPixels(0,0,1600,1000,gl.RGBA,gl.UNSIGNED_BYTE,color);
                const saved=[];s.scene.traverse(o=>{if(o.isMesh){saved.push([o,o.material]);if(!o.userData.grassCanopy&&!o.userData.grassCanopyWall)o.material=o.userData.grassFieldDetail?a.packed:
                    (o.name==='GrassField-LOD2'||o.name==='GrassField-LOD4-Edges')?a.white:a.black;}});
                const old={target:s.renderer.getRenderTarget(),tone:s.renderer.toneMapping,background:s.scene.background};
                a.probe.value=1;s.scene.background=new THREE.Color(0);s.renderer.toneMapping=THREE.NoToneMapping;
                s.renderer.setRenderTarget(a.target);s.renderer.clear();s.renderer.render(s.scene,s.camera);
                const pixels=new Uint8Array(1600*1000*4);s.renderer.readRenderTargetPixels(a.target,0,0,1600,1000,pixels);
                // Retain the original coverage gate on the unblended side capture,
                // then separately verify the requested upper-wall background blend.
                let unblended=pixels;
                if(lod==='LOD4'){
                    a.probe.value=2;
                    try{
                        // Rebind the multisampled draw buffer after reading its resolved texture.
                        s.renderer.setRenderTarget(null);s.renderer.setRenderTarget(a.target);s.renderer.clear();s.renderer.render(s.scene,s.camera);
                        unblended=new Uint8Array(pixels.length);s.renderer.readRenderTargetPixels(a.target,0,0,1600,1000,unblended);
                    }
                    finally{a.probe.value=1;}
                }
                a.probe.value=0;saved.forEach(([o,m])=>o.material=m);s.renderer.setRenderTarget(old.target);s.renderer.toneMapping=old.tone;s.scene.background=old.background;
                const sample=(points,mask=pixels)=>{const seen=new Set();let sum=0;const rgb=[0,0,0],leafRgb=[0,0,0];let pure=0;
                    for(const xyz of points){const p=new THREE.Vector3(...xyz).project(s.camera),x=Math.floor((p.x*.5+.5)*1600),y=Math.floor((p.y*.5+.5)*1000);
                        if(p.z<-1||p.z>1||x<0||x>=1600||y<0||y>=1000)continue;const i=y*1600+x;if(seen.has(i))continue;seen.add(i);sum+=mask[4*i]/255;
                        for(let c=0;c<3;c++)rgb[c]+=color[i*4+c];if(mask[4*i]>245){pure++;for(let c=0;c<3;c++)leafRgb[c]+=color[i*4+c];}}
                    return {coverage:sum/seen.size,pixels:seen.size,rgb:rgb.map(v=>v/seen.size),pureGrassPixels:pure,pureGrassRgb:leafRgb.map(v=>v/pure)};};
                const sections=[];for(const cx of [-3,0,3])for(const cz of [-3,0,3]){
                    const points=[];for(let x=0;x<64;x++)for(let z=0;z<64;z++)points.push([cx-1+2*x/63,.1,cz-1+2*z/63]);
                    sections.push(sample(points));
                }
                const bevel=s.canopy.wall.getSnapshot().bevel;
                const edgeAt=height=>{
                    const fraction=height/.1;
                    const inward=bevel?(fraction<bevel.heightFraction?fraction/bevel.heightFraction*bevel.insetFraction:
                        bevel.insetFraction+(fraction-bevel.heightFraction)/(1-bevel.heightFraction)*(1-bevel.insetFraction)):fraction;
                    return 5.95-.05*inward;
                };
                const wall=[],bands={lower:[],upper:[]};for(const axis of ['x','z']){const sign=Math.sign(s.camera.position[axis]);if(Math.abs(s.camera.position[axis])<1)continue;
                    for(let t=-5.7;t<=5.7;t+=.02){
                        for(let y=.025;y<=.08;y+=.006){const edge=sign*edgeAt(y);wall.push(axis==='x'?[edge,y,t]:[t,y,edge]);}
                        for(const [band,height] of [['lower',.01],['upper',.085]]){const edge=sign*edgeAt(height);bands[band].push(axis==='x'?[edge,height,t]:[t,height,edge]);}
                    }}
                s.lighting.render(0);
                return {pose:pose.id,lod,interior:sections.reduce((n,r)=>n+r.coverage*r.pixels,0)/sections.reduce((n,r)=>n+r.pixels,0),sections,wall:sample(wall),
                    wallUnblendedCoverage:sample(wall,unblended).coverage,
                    wallBackgroundIncrease:Object.fromEntries(Object.entries(bands).map(([band,points])=>[band,sample(points,unblended).coverage-sample(points).coverage])),
                    triangles:s.getSnapshot().visibleTriangles,shadows:s.getSnapshot().shadows.generations};
            },{lod,pose});rows.push(row);
            await page.screenshot({path:path.join(output,pose.id+'_'+lod+'.png')});
        }
        if(process.env.GRASS_COVERAGE_BENCHMARK==='1'&&pose.index)timings.push(...await page.evaluate(async pose=>{
            const s=window.__grassLitterScene,gl=s.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const frame=()=>new Promise(requestAnimationFrame),blocks=[];
            const batch=async()=>{const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);for(let i=0;i<12;i++)s.lighting.render(0);gl.endQuery(ext.TIME_ELAPSED_EXT);
                for(let i=0;!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++){if(i>120)throw Error('GPU query timed out');await frame();}
                if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU query disjoint');const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/12e6;gl.deleteQuery(q);return ms;};
            for(let i=0;i<6;i++)await batch();const lods=['LOD2','LOD3','LOD4'];
            for(let round=0;round<3;round++)for(let offset=0;offset<3;offset++){
                const lod=lods[(round+offset)%3];s.setLod(lod);await frame();await batch();const samples=[];
                for(let i=0;i<6;i++)samples.push(await batch());blocks.push({pose,lod,round,samples,mean:samples.reduce((a,b)=>a+b,0)/samples.length});
            }return blocks;
        },pose.id));
        await writeFile(path.join(output,'results.json'),JSON.stringify({initial,rows,timings,errors},null,2));
    }
    expect(errors).toEqual([]);expect(new Set(rows.map(r=>r.shadows)).size).toBe(1);
    for(const row of rows.filter(r=>!r.pose.endsWith('close')))expect(Number.isFinite(row.interior)).toBe(true);
    for(const row of rows.filter(r=>r.lod==='LOD4'&&r.pose.startsWith('bus_'))){
        const source=rows.find(r=>r.pose===row.pose&&r.lod==='LOD2'),detail=rows.find(r=>r.pose===row.pose&&r.lod==='LOD3');
        expect(Math.abs(row.wallUnblendedCoverage-source.wall.coverage),row.pose+' captured wall coverage').toBeLessThan(.025);
        expect(row.wall.coverage).toBeLessThan(row.wallUnblendedCoverage);
        expect(row.wallBackgroundIncrease.upper,row.pose+' upper background blend').toBeGreaterThan(row.wallBackgroundIncrease.lower);
        expect(Math.abs(row.interior-detail.interior),row.pose+' LOD3 interior coverage').toBeLessThan(.035);
    }
    const structure=await page.evaluate(async()=>{
        const s=window.__grassLitterScene,{THREE}=window.__coverageAudit;s.setLod('LOD4');s.scene.updateMatrixWorld(true);
        const root=s.scene.getObjectByName('GrassFieldTile_1'),canopy=root.getObjectByName('GrassField-LOD4'),ray=new THREE.Raycaster();
        const surfaces=[];canopy.traverse(o=>{if(o.userData.grassCanopy||o.userData.grassCanopyWall)surfaces.push(o);});
        const hits=[];for(const z of [-5.9,-5.4,-3.1,0,2.3,5.7])for(const x of [5.8999,5.9001,5.925]){
            ray.set(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0));const intersections=ray.intersectObjects(surfaces,false);
            hits.push({x,z,count:intersections.length,heights:intersections.map(h=>h.point.y)});
        }
        return {hits,wall:s.canopy.wall.getSnapshot(),opaque:s.canopy.wall.group.children.every(m=>!m.material.transparent&&m.material.alphaTest===0),
            glError:s.renderer.getContext().getError()};
    });
    await writeFile(path.join(output,'structure.json'),JSON.stringify(structure,null,2));
    expect(structure.opaque).toBe(true);expect(structure.glError).toBe(0);expect(structure.wall.textureBytes).toBeLessThan(49*1048576);
    for(const hit of structure.hits){expect(hit.count,JSON.stringify(hit)).toBeGreaterThan(0);expect(Math.max(...hit.heights)-Math.min(...hit.heights)).toBeLessThan(.00001);}
});
