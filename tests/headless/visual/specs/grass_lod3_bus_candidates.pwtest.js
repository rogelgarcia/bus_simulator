// Opt-in fidelity and GPU comparison with the Grass Lab gameplay camera held at a fixed height and pitch.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_bus_candidates');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Compare LOD3 candidates at a fixed bus camera height and pitch', async ({ page }) => {
    test.skip(process.env.GRASS_LOD3_BUS_CANDIDATES !== '1', 'Opt-in hardware experiment.');
    test.setTimeout(300000); await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD2#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const setup = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        const { GRASS_LAB_CAMERA_PRESETS } = await import('/src/app/grass/GrassLabValidationContract.js');
        const bus = GRASS_LAB_CAMERA_PRESETS.find(p => p.id === 'gameplay_bus');
        const pitch = Math.atan2(bus.heightMeters - bus.targetHeightMeters, bus.distanceMeters);
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const source = s.scene.getObjectByName('GrassField-LOD2'), geometry = source.geometry, original = source.material;
        const flat = createGrassDebugV2Material({ vertexColors:true, color:original.color, roughness:original.roughness,
            defines: {GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1} });
        flat.envMapIntensity = original.envMapIntensity;
        const flatRough = createGrassDebugV2Material({ vertexColors:true, color:original.color, roughness:1,
            defines: {GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1} });
        flatRough.envMapIntensity=original.envMapIntensity;
        const diffuse = createGrassDebugV2Material({ vertexColors:true, color:original.color, roughness:1,
            defines: {GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1} });
        diffuse.envMapIntensity=original.envMapIntensity;
        diffuse.onBeforeCompile=shader=>{
            shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',`
                struct PhysicalMaterial { vec3 diffuseColor; float roughness; vec3 specularColor; float specularF90; };
                void RE_Direct_Bus(const in IncidentLight light, const in vec3 p, const in vec3 n, const in vec3 v, const in vec3 cn,
                    const in PhysicalMaterial m, inout ReflectedLight r) {
                    float blade=smoothstep(.12,.28,vUv.y),margin=smoothstep(.1,.8,abs(2.*vUv.x-1.));
                    float transmission=mix(.35,mix(.50,.64,margin),blade);
                    r.directDiffuse+=light.color*BRDF_Lambert(m.diffuseColor)*(.72*saturate(dot(n,light.direction))+
                        transmission*saturate(dot(-n,light.direction))*mix(vec3(1.),vec3(1.12,1.,.70),blade));
                }
                void RE_IndirectDiffuse_Bus(const in vec3 irradiance,const in vec3 p,const in vec3 n,const in vec3 v,const in vec3 cn,
                    const in PhysicalMaterial m,inout ReflectedLight r){r.indirectDiffuse+=irradiance*BRDF_Lambert(m.diffuseColor);}
                void RE_IndirectSpecular_Bus(const in vec3 radiance,const in vec3 irradiance,const in vec3 cc,const in vec3 p,const in vec3 n,
                    const in vec3 v,const in vec3 cn,const in PhysicalMaterial m,inout ReflectedLight r){
                    r.indirectDiffuse+=irradiance*BRDF_Lambert(m.diffuseColor)*.96;}
                #define RE_Direct RE_Direct_Bus
                #define RE_IndirectDiffuse RE_IndirectDiffuse_Bus
                #define RE_IndirectSpecular RE_IndirectSpecular_Bus
            `).replace('#include <lights_physical_fragment>', 'PhysicalMaterial material; material.diffuseColor=diffuseColor.rgb; material.roughness=1.; material.specularColor=vec3(.04); material.specularF90=1.;');
        };
        diffuse.customProgramCacheKey=()=> 'bus-diffuse-experiment';
        const point = id => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,id);
        const ranked = Array.from({length:geometry.index.count/6},(_,leaf)=>{
            let area=0;for(let j=0;j<6;j+=3){const ids=[0,1,2].map(k=>geometry.index.getX(leaf*6+j+k));const a=point(ids[0]);area+=point(ids[1]).sub(a).cross(point(ids[2]).sub(a)).length();}
            return {leaf,area};
        }).sort((a,b)=>b.area-a.area);
        const candidates = {};
        for (const [name, fraction, scale, material] of [['full_flat',1,1,flat],['full_rough',1,1,flatRough],
            ['area75_flat',.75,1.12,flat],['area60_flat',.6,1.3,flat],['area50_flat',.5,1.4,flat],['area75',.75,1.12,original],
            ['full_diffuse',1,1,diffuse],['area75_diffuse',.75,1.12,diffuse],['area60_diffuse',.6,1.3,diffuse],
            ['full_packed',1,1,flat],['full_chunks',1,1,flat],['area85_packed',.85,1.04,flat]]) {
            const selected=new Set(ranked.slice(0,Math.round(ranked.length*fraction)).map(x=>x.leaf));
            const arrays=Object.fromEntries(Object.keys(geometry.attributes).map(k=>[k,[]]));
            for(let offset=0;offset<geometry.index.count;offset+=6) {
                if(!selected.has(offset/6))continue;
                const ids=Array.from({length:6},(_,i)=>geometry.index.getX(offset+i));
                const a=point(ids[0]),b=point(ids[2]),c=point(ids[1]),d=point(ids[5]);
                const root=a.clone().add(b).multiplyScalar(.5),top=c.clone().add(d).multiplyScalar(.5),axis=b.clone().sub(a).normalize();
                for(const id of ids) {
                    const position=point(id),v=(geometry.attributes.uv.getY(id)-.18)/.82;
                    position.addScaledVector(axis,position.clone().sub(root.clone().lerp(top,v/.9)).dot(axis)*(scale-1));
                    for(const [key,attribute] of Object.entries(geometry.attributes)) {
                        if(key==='position')arrays[key].push(...position.toArray());
                        else for(let j=0;j<attribute.itemSize;j++)arrays[key].push(attribute.array[id*attribute.itemSize+j]);
                    }
                }
            }
            const result=new THREE.BufferGeometry();
            for(const [key,values] of Object.entries(arrays))result.setAttribute(key,new THREE.Float32BufferAttribute(values,geometry.attributes[key].itemSize));
            result.computeBoundingBox();result.computeBoundingSphere();
            let actualMaterial=material;
            if(name.endsWith('packed')||name.endsWith('chunks')) {
                actualMaterial=createGrassDebugV2Material({vertexColors:true,color:original.color,roughness:original.roughness,defines:{GRASS_LEAF_TRANSLUCENCY:1,USE_UV:1}});
                actualMaterial.envMapIntensity=original.envMapIntensity;
                const prior=actualMaterial.onBeforeCompile;
                actualMaterial.onBeforeCompile=(shader,renderer)=>{prior(shader,renderer);shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=position*vec3(8.,.25,8.);');};
                actualMaterial.customProgramCacheKey=()=> 'bus-packed-experiment';
            }
            const parts=name.endsWith('chunks')?new Map():new Map([[0,Array.from({length:result.attributes.position.count},(_,i)=>i)]]);
            if(name.endsWith('chunks'))for(let i=0;i<result.attributes.position.count;i+=6){
                const p=result.attributes.position,key=Math.floor((p.getX(i)+6)/3)+100*Math.floor((p.getZ(i)+6)/3);
                if(!parts.has(key))parts.set(key,[]);for(let j=0;j<6;j++)parts.get(key).push(i+j);
            }
            const group=new THREE.Group();
            for(const ids of parts.values()) {
                const g=new THREE.BufferGeometry();
                for(const [key,attr] of Object.entries(result.attributes)){
                    if(key==='grassFacingNormal')continue;
                    const values=ids.flatMap(id=>Array.from({length:attr.itemSize},(_,k)=>attr.array[id*attr.itemSize+k]));
                    g.setAttribute(key,new THREE.Float32BufferAttribute(values,attr.itemSize));
                }
                g.computeBoundingBox();g.computeBoundingSphere();
                if(name.endsWith('packed')||name.endsWith('chunks')) {
                    const pos=g.attributes.position,norm=g.attributes.normal,col=g.attributes.color,uv=g.attributes.uv;
                    g.setAttribute('position',new THREE.Int16BufferAttribute(Array.from(pos.array,(v,i)=>Math.round(v/[8,.25,8][i%3]*32767)),3,true));
                    g.setAttribute('normal',new THREE.Int8BufferAttribute(Array.from(norm.array,v=>Math.round(v*127)),3,true));
                    g.setAttribute('color',new THREE.Uint8BufferAttribute(Array.from(col.array,v=>Math.round(v*255)),3,true));
                    g.setAttribute('uv',new THREE.Uint16BufferAttribute(Array.from(uv.array,v=>Math.round(v*65535)),2,true));
                }
                const mesh=new THREE.Mesh(g,actualMaterial);mesh.receiveShadow=true;group.add(mesh);
            }
            result.dispose();group.visible=false;source.parent.add(group);candidates[name]=group;
        }
        s.camera.fov=55;s.camera.updateProjectionMatrix();
        const instances=Object.fromEntries(Object.entries(candidates).map(([key,group])=>[key,[group]]));
        for(let tile=2;tile<=9;tile++)for(const [name,group] of Object.entries(candidates)) {
            const clone=group.clone(true);s.scene.getObjectByName('GrassFieldTile_'+tile).children[0].add(clone);instances[name].push(clone);
        }
        const probe={s,THREE,source,candidates,bus,pitch};window.__lod3Bus=probe;
        probe.pose=(distance,azimuth)=>{
            const az=azimuth*Math.PI/180;
            s.camera.position.set(Math.sin(az)*distance,bus.heightMeters,Math.cos(az)*distance);
            s.camera.lookAt(s.camera.position.clone().add(new THREE.Vector3(-Math.sin(az)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(az)*Math.cos(pitch))));
            s.camera.updateMatrixWorld(true);
        };
        probe.mode=mode=>{
            s.setLod(mode.startsWith('LOD')?mode:'LOD2');
            s.scene.traverse(o=>{if(o.name==='GrassField-LOD2')o.visible=mode==='LOD2';});
            for(const [key,groups] of Object.entries(instances))for(const group of groups)group.visible=key===mode;
        };
        return {camera: {...bus,pitchDegrees:pitch*180/Math.PI,fov:55},material:{roughness:original.roughness,normalScale:original.normalScale.toArray(),envMapIntensity:original.envMapIntensity},
            triangles:Object.fromEntries(Object.entries(candidates).map(([k,m])=>[k,m.children.reduce((n,c)=>n+c.geometry.attributes.position.count/3,0)]))};
    });
    const results=[], timings=[];
    const modes=(process.env.GRASS_LOD3_BUS_MODES||'LOD2,LOD3,LOD4,full_flat,full_rough,area75_flat,area60_flat,area50_flat,area75').split(',');
    const fields=Number(process.env.GRASS_LOD3_BUS_FIELDS||1);
    await page.evaluate(fields=>window.__grassLitterScene.setFieldCount(fields),fields);
    for(const [name,distance,azimuth] of [['front14',14,40],['rear19',19,220],['side24',24,130]]) {
        for(const mode of modes) {
            const metrics=await page.evaluate(({mode,distance,azimuth})=>{
                const p=window.__lod3Bus,{s,THREE}=p;p.pose(distance,azimuth);p.mode(mode);s.lighting.render(0);
                const gl=s.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,rgba=new Uint8Array(w*h*4);
                gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
                if(mode==='LOD2') {
                    p.reference=rgba;p.mask=new Uint8Array(w*h);
                    const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.06),hit=new THREE.Vector3();
                    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
                        ray.setFromCamera(new THREE.Vector2((x+.5)*2/w-1,(y+.5)*2/h-1),s.camera);
                        if(ray.ray.intersectPlane(plane,hit)&&Math.abs(hit.x)<5.8&&Math.abs(hit.z)<5.8)p.mask[y*w+x]=1;
                    }
                }
                let count=0,error=0;const mean=[0,0,0];
                for(let i=0;i<p.mask.length;i++)if(p.mask[i]){count++;for(let k=0;k<3;k++){error+=Math.abs(rgba[4*i+k]-p.reference[4*i+k]);mean[k]+=rgba[4*i+k];}}
                return {mae:error/(count*3),mean:mean.map(v=>v/count),pixels:count};
            },{mode,distance,azimuth});
            results.push({name,mode,metrics});
            await page.screenshot({path:path.join(output,name+'_'+mode+'.png')});
        }
        timings.push(...await page.evaluate(async({modes,distance,azimuth})=>{
            const p=window.__lod3Bus,{s}=p;p.pose(distance,azimuth);
            const gl=s.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const frame=()=>new Promise(requestAnimationFrame),blocks=[];
            const batch=async()=>{
                const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
                for(let i=0;i<12;i++)s.lighting.render(0);
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                for(let wait=0;!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);wait++){if(wait>120)throw Error('GPU query timed out');await frame();}
                if(gl.getParameter(ext.GPU_DISJOINT_EXT))throw Error('Disjoint GPU query');
                const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6/12;gl.deleteQuery(q);return ms;
            };
            for(let round=0;round<3;round++)for(const mode of round%2?[...modes].reverse():modes){
                p.mode(mode);for(let i=0;i<3;i++)await frame();
                await batch();await batch();
                const generation=s.getSnapshot().shadows.generations,samples=[];
                for(let i=0;i<6;i++)samples.push(await batch());
                if(s.getSnapshot().shadows.generations!==generation)throw Error('Unexpected shadow redraw');
                blocks.push({mode,round,distance,azimuth,samples,mean:samples.reduce((a,b)=>a+b,0)/samples.length});
            }
            return blocks;
        },{modes,distance,azimuth}));
        await writeFile(path.join(output,'results.json'),JSON.stringify({setup,fields,results,timings,errors},null,2));
    }
    expect(errors).toEqual([]);
});
