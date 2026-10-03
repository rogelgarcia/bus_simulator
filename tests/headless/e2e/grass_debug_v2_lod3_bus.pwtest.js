// Verify LOD3 fidelity at fixed gameplay camera height/pitch, with optional sustained GPU timing.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2', process.env.GRASS_LOD3_BUS_OUTPUT || 'lod3_bus_detail');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD3 preserves bus-view leaf lighting and depth with compact geometry and cached shadows', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true });
    const errors = [], frames = [], timings = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod3-bus-detail-1&lod=LOD3&fields=9#bus_19m_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const initial = await page.evaluate(async () => {
        const s=window.__grassLitterScene,THREE=await import('three');
        const {GRASS_FIELD_BUS_VIEWS,GRASS_FIELD_BUS_CAMERA}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BusCamera.js');
        const {grassFieldDistanceShader,grassFieldDistanceParsShader}=await import('/src/graphics/shaders/materials/grass/GrassFieldDistanceShaderLoader.js');
        const source=s.scene.getObjectByName('GrassField-LOD2'),input=source.geometry,detail=s.detail;
        s.lighting.render(0);
        const chunks=detail.group.children.map(mesh=>{
            const g=mesh.geometry,p=g.attributes.position;
            let maxHeight=-Infinity,outside=0;
            for(let i=0;i<p.count;i++){
                const vertex=new THREE.Vector3().fromBufferAttribute(p,i).multiply(detail.decode);
                maxHeight=Math.max(maxHeight,vertex.y);
                if(!g.boundingBox.containsPoint(vertex))outside++;
            }
            return {outside,maxHeight,vertices:p.count,types:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,a.array.constructor.name])),
                opaque:!mesh.material.transparent&&mesh.material.alphaTest===0,shadow:mesh.castShadow,receive:mesh.receiveShadow};
        });
        window.__busValidation={THREE,views:GRASS_FIELD_BUS_VIEWS,distanceVertex:grassFieldDistanceShader.vertexSource,distancePars:grassFieldDistanceParsShader.vertexSource};
        const originalBytes=Object.values(input.attributes).reduce((n,a)=>n+a.array.byteLength,0)+input.index.array.byteLength;
        return {state:s.getSnapshot(),chunks,originalBytes,camera:GRASS_FIELD_BUS_CAMERA,
            material:{normal:!!detail.material.normalMap,roughness:!!detail.material.roughnessMap},
            views:GRASS_FIELD_BUS_VIEWS.map(v=>({id:v.id,index:Array.from(document.querySelector('#scene-view').options).find(o=>o.text===v.label).value}))};
    });
    const info=initial.state.lods.LOD3;
    expect(info.strategy).toBe('compact-leaf-detail');expect(info.leaves).toBe(81600);expect(info.triangles).toBe(163200);
    expect(info.chunks).toBe(16);expect(info.runtimeCaptures).toBe(false);expect(info.extraTextureBytes).toBe(0);
    expect(info.geometryBytes).toBeLessThan(initial.originalBytes*.3);
    expect(initial.material).toEqual({normal:false,roughness:false});
    for(const chunk of initial.chunks){expect(chunk.outside).toBe(0);expect(chunk.maxHeight).toBeLessThanOrEqual(info.sourceHeight+.00001);
        expect(chunk.opaque).toBe(true);expect(chunk.shadow).toBe(false);expect(chunk.receive).toBe(true);
        expect(chunk.types).toEqual({position:'Int16Array',normal:'Int8Array',color:'Uint8Array',uv:'Uint16Array'});}
    for(const view of initial.views){
        await page.selectOption('#scene-view',view.index);
        for(const lod of ['LOD2','LOD3','LOD4']){
            const metrics=await page.evaluate(lod=>{
                const s=window.__grassLitterScene,p=window.__busValidation,{THREE}=p;
                s.setLod(lod);s.lighting.render(0);
                const gl=s.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
                const read=()=>{const rgba=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return rgba;};
                const rgba=read();
                if(lod==='LOD2'){
                    p.reference=rgba;p.mask=new Uint8Array(w*h);
                    const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.06),hit=new THREE.Vector3();
                    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
                        ray.setFromCamera(new THREE.Vector2((x+.5)*2/w-1,(y+.5)*2/h-1),s.camera);
                        if(ray.ray.intersectPlane(plane,hit)&&Math.abs(hit.x)<5.8&&Math.abs(hit.z)<5.8)p.mask[y*w+x]=1;
                    }
                }
                // A separate white-leaf pass identifies pure grass pixels. Soil and litter never enter the color metric.
                let leafMask=null;
                if(lod!=='LOD4'){
                    const black=new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide,toneMapped:false}),white=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
                    const distanceMask=shader=>{
                        shader.uniforms.grassFieldDistance=s.detail.material.userData.grassFieldDistance;
                        shader.vertexShader=p.distancePars+'\n'+shader.vertexShader.replace('#include <project_vertex>',p.distanceVertex+'\n#include <project_vertex>');
                    };
                    white.onBeforeCompile=distanceMask;white.customProgramCacheKey=()=> 'bus-leaf-mask-distance';
                    const packed=white.clone();packed.onBeforeCompile=shader=>{
                        shader.uniforms.grassDetailDecode={value:s.detail.decode};
                        shader.vertexShader='uniform vec3 grassDetailDecode;\n'+shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=position*grassDetailDecode;');
                        distanceMask(shader);
                    };packed.customProgramCacheKey=()=> 'bus-leaf-mask';
                    const saved=[];s.scene.traverse(o=>{if(o.isMesh){saved.push([o,o.material]);o.material=o.userData.grassFieldDetail?packed:o.name==='GrassField-LOD2'?white:black;}});
                    const target=s.renderer.getRenderTarget(),background=s.scene.background;
                    s.scene.background=new THREE.Color(0);s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);leafMask=read();
                    saved.forEach(([o,m])=>{o.material=m;});s.scene.background=background;s.renderer.setRenderTarget(target);
                    black.dispose();white.dispose();packed.dispose();s.lighting.render(0);
                    if(lod==='LOD2')p.referenceLeaf=leafMask;
                }
                let pixels=0,error=0,leafPixels=0;const leaf=[0,0,0],referenceLeaf=[0,0,0];
                for(let i=0;i<p.mask.length;i++)if(p.mask[i]){
                    pixels++;for(let k=0;k<3;k++)error+=Math.abs(rgba[4*i+k]-p.reference[4*i+k]);
                    if(leafMask&&leafMask[4*i]>245&&p.referenceLeaf[4*i]>245){leafPixels++;for(let k=0;k<3;k++){leaf[k]+=rgba[4*i+k];referenceLeaf[k]+=p.reference[4*i+k];}}
                }
                const forward=s.camera.getWorldDirection(new THREE.Vector3());
                return {mae:error/(pixels*3),pixels,leafPixels,leafMean:leaf.map(v=>v/leafPixels),referenceLeafMean:referenceLeaf.map(v=>v/leafPixels),
                    position:s.camera.position.toArray(),pitchDegrees:Math.asin(-forward.y)*180/Math.PI,fov:s.camera.fov,
                    shadows:s.getSnapshot().shadows.generations,visibleTriangles:s.getSnapshot().visibleTriangles};
            },lod);
            frames.push({view:view.id,lod,metrics});
            expect(metrics.position[1]).toBeCloseTo(initial.camera.heightMeters,8);
            expect(metrics.pitchDegrees).toBeCloseTo(initial.camera.pitchDegrees,8);expect(metrics.fov).toBe(55);
            if(lod==='LOD3'){
                expect(metrics.mae).toBeLessThan(7);expect(metrics.leafPixels).toBeGreaterThan(3000);
                metrics.leafMean.forEach((v,k)=>expect(Math.abs(v-metrics.referenceLeafMean[k])).toBeLessThan(3));
            }
            await page.screenshot({path:path.join(output,view.id+'_'+lod+'.png')});
        }
        if(process.env.GRASS_LOD3_BUS_BENCHMARK==='1')timings.push(...await page.evaluate(async view=>{
            const s=window.__grassLitterScene,gl=s.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const frame=()=>new Promise(requestAnimationFrame),blocks=[];
            const batch=async()=>{
                const query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
                for(let i=0;i<12;i++)s.lighting.render(0);
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                for(let i=0;!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);i++){if(i>120)throw Error('GPU query timed out');await frame();}
                if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('GPU query disjoint');
                const value=gl.getQueryParameter(query,gl.QUERY_RESULT)/12e6;gl.deleteQuery(query);return value;
            };
            for(let i=0;i<6;i++)await batch();
            const modes=['LOD2','LOD3','LOD4'];
            for(let round=0;round<3;round++)for(let offset=0;offset<3;offset++){
                const lod=modes[(offset+round)%3];s.setLod(lod);for(let i=0;i<3;i++)await frame();await batch();
                const generation=s.getSnapshot().shadows.generations,samples=[];
                for(let i=0;i<6;i++)samples.push(await batch());
                if(generation!==s.getSnapshot().shadows.generations)throw Error('Unexpected shadow regeneration');
                blocks.push({view,lod,round,samples,mean:samples.reduce((a,b)=>a+b,0)/samples.length});
            }
            return blocks;
        },view.id));
        await writeFile(path.join(output,'results.json'),JSON.stringify({initial,frames,timings,errors},null,2));
    }
    expect(new Set(frames.map(f=>f.metrics.shadows)).size).toBe(1);expect(errors).toEqual([]);
    await page.selectOption('#scene-view',initial.views.find(v=>v.id==='bus_19m_rear').index);
    await page.selectOption('#scene-lod','LOD2+3+4');
    await page.screenshot({path:path.join(output,'bus_19m_rear_comparison.png')});
    const rows=initial.views.map(view=>{
        const averages=Object.fromEntries(['LOD2','LOD3','LOD4'].map(lod=>{
            const blocks=timings.filter(t=>t.view===view.id&&t.lod===lod);
            return [lod,blocks.length?blocks.reduce((n,b)=>n+b.mean,0)/blocks.length:null];
        }));
        const metrics=frames.find(f=>f.view===view.id&&f.lod==='LOD3').metrics;
        return {id:view.id,...averages,mae:metrics.mae,grassDifference:Math.max(...metrics.leafMean.map((v,k)=>Math.abs(v-metrics.referenceLeafMean[k])))};
    });
    await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>LOD3 bus camera comparison</title>
        <style>body{background:#14201b;color:#e7ede7;font:16px system-ui;margin:28px auto;max-width:1400}h1{font-size:26px}select,input,button{font:inherit}label{margin-right:24px}.compare{position:relative;line-height:0;margin:20px 0}.compare img{width:100%}.overlay{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}.tag{position:absolute;top:18%;background:#122b;padding:12px;line-height:1;color:white}.right{right:0}table{border-collapse:collapse}td,th{padding:8px 22px;border-bottom:1px solid #53645a;text-align:right}th:first-child,td:first-child{text-align:left}a{color:#c9eda8}p{line-height:1.5}</style>
        <h1>LOD3 at the gameplay bus camera</h1><p>Nine fields · 1600 × 1000 · camera 4.5 m high · downward pitch 13.586° · FOV 55°.
        Ranges are horizontal distance to the center field. All layers, merged litter, cached LOD2 shadows.</p>
        <label>Pose <select id="pose">${rows.map(r=>'<option>'+r.id+'</option>').join('')}</select></label>
        <label>Compare with <select id="level"><option>LOD3</option><option>LOD4</option></select></label>
        <label>Split <input id="split" type="range" min="0" max="100" value="50"></label>
        <div class="compare"><img id="candidate" alt="Comparison LOD"><div class="overlay" id="overlay"><img id="reference" alt="LOD2 reference"></div><span class="tag">LOD2 reference</span><span class="tag right" id="tag">LOD3</span></div>
        <p>LOD3 retains 81,600 leaves / 163,200 triangles per complete field, with 16 independently culled chunks.
        Compact geometry: ${(info.geometryBytes/1048576).toFixed(2)} MiB, shared by all fields; no additional textures.
        Leaf normals, root positions, height and thin-leaf lighting come from LOD2. Smallest leaves are omitted; remaining widths increase 4%.</p>
        <table><thead><tr><th>Pose</th><th>LOD2 GPU ms</th><th>LOD3 GPU ms</th><th>LOD4 GPU ms</th><th>LOD3 faster</th><th>Image MAE / 255</th><th>Grass RGB Δ / 255</th></tr></thead><tbody>
        ${rows.map(r=>'<tr><td>'+r.id+'</td><td>'+ (r.LOD2?.toFixed(2)??'—')+'</td><td>'+(r.LOD3?.toFixed(2)??'—')+'</td><td>'+(r.LOD4?.toFixed(2)??'—')+'</td><td>'+(r.LOD2?(100*(1-r.LOD3/r.LOD2)).toFixed(1)+'%':'—')+'</td><td>'+r.mae.toFixed(2)+'</td><td>'+r.grassDifference.toFixed(2)+'</td></tr>').join('')}
        </tbody></table><p>GPU values include post-processing. Sustained timing: three rotated rounds, six batches of twelve renders per measurement, disjoint-query rejection, and unchanged shadow-generation checks.
        Image error uses a central-field footprint; grass color uses separate white-leaf masks and excludes soil/litter. These are different metrics.</p>
        <p><a href="results.json">Raw measurements</a> · <a href="/debug_tools/grass_litter_scene.html?revision=lod3-bus-detail-1&lod=LOD2%2B3%2B4&fields=9#bus_19m_rear">Open live LOD2+3+4 scene</a></p>
        <script>const pose=document.querySelector('#pose'),level=document.querySelector('#level'),split=document.querySelector('#split');
        function update(){document.querySelector('#reference').src=pose.value+'_LOD2.png';document.querySelector('#candidate').src=pose.value+'_'+level.value+'.png';document.querySelector('#tag').textContent=level.value;document.querySelector('#overlay').style.clipPath='inset(0 '+(100-split.value)+'% 0 0)';}
        pose.value='bus_19m_rear';pose.onchange=level.onchange=split.oninput=update;update();</script></html>`);
});
