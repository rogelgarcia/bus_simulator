// Verify geometry continuation and compatible material boundaries of the compiled two-metre tile pair.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2',process.env.GRASS_TILE_CAPTURE||'lod4_tile_pair_2m');
const optimizer=/GrassDebugV2Canopy(?:SourceLayout|PatternOptimizer|RenderedOptimizer|PatternProbe|RenderedProbe|RenderedScore|PairCompiler)\.js/;
test.use({viewport:{width:1600,height:1200},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});

test('LOD4 compiled variants preserve all side and corner continuations with compatible PBR seams',async({page})=>{
    test.setTimeout(300000);await mkdir(output,{recursive:true});const errors=[],searchRequests=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('request',request=>{if(optimizer.test(request.url()))searchRequests.push(request.url());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-paired-2m-1&lod=LOD2%2B4&fields=9&canopyalbedo=4096&canopynormal=4096&canopyroughness=4096#03_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);await page.evaluate(()=>window.__grassLitterReadiness);
    const result=await page.evaluate(async()=>{
        const THREE=await import('three'),s=window.__grassLitterScene;
        const {mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');
        const {createGrassDebugV2PeriodicSource}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PeriodicSource.js');
        const {grassCanopyLayoutIdentity,applyGrassCanopyLayoutAsset,validateGrassCanopyLayoutAsset}=await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyLayoutAsset.js');
        const asset=validateGrassCanopyLayoutAsset(await(await fetch('/assets/public/grass/lod4/layout.json')).json());
        const snapshot=s.canopy.getSnapshot(),period=snapshot.definition.tileMeters,size=snapshot.bake.resolution;
        const fixtures=[];
        for(const period of [1,2]){
            const geometries=[],ranges=[];let start=0;
            for(const [x,z] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
                const geometry=new THREE.BoxGeometry(.12,.1,.12).translate(x*(period/2-.01),.05,z*(period/2-.01));
                geometries.push(geometry);ranges.push({start,count:geometry.index.count});start+=geometry.index.count;
            }
            const geometry=mergeGeometries(geometries),material=new THREE.MeshBasicMaterial(),source=new THREE.Mesh(geometry,material);
            source.userData.grassLeafRanges=ranges;
            const periodic=period===1?createGrassDebugV2PeriodicSource(source):createGrassDebugV2PeriodicSource(source,0,period);
            const exact=periodic.group.children.every(mesh=>{
                const e=mesh.matrix.elements;
                return mesh.geometry.attributes.position===geometry.attributes.position
                    && Math.abs(e[12]/period-Math.round(e[12]/period))<1e-9
                    && Math.abs(e[14]/period-Math.round(e[14]/period))<1e-9
                    && [0,5,10,15].every(i=>e[i]===1)&&[1,2,3,4,6,7,8,9,11,13].every(i=>e[i]===0);
            });
            fixtures.push({...periodic.getSnapshot(),exact,indices:periodic.group.children.reduce((sum,mesh)=>sum+mesh.geometry.index.count,0)});
            periodic.dispose();geometry.dispose();geometries.forEach(g=>g.dispose());material.dispose();
        }
        // Select source leaves independently from soil-plane roots, not the compiler's tileIds.
        const field=s.scene.getObjectByName('GrassField-LOD2'),p=field.geometry.attributes.position,index=field.geometry.index;
        const indices=[],ranges=[],tileIds=[];
        if(index.count!==field.userData.grassLeafCount*6)throw Error('Expected two triangles per LOD2 leaf.');
        for(let start=0;start<index.count;start+=6){
            const roots=new Set();
            for(let i=start;i<start+6;i++){const v=index.getX(i);if(Math.abs(p.getY(v))<1e-6)roots.add(v);}
            if(!roots.size)throw Error('LOD2 leaf has no soil-plane root.');
            const rootX=[...roots].reduce((sum,v)=>sum+p.getX(v),0)/roots.size;
            const rootZ=[...roots].reduce((sum,v)=>sum+p.getZ(v),0)/roots.size;
            if(rootX < -period/2 || rootX >= period/2 || rootZ < -period/2 || rootZ >= period/2)continue;
            ranges.push({start:indices.length,count:6});tileIds.push(start/6);
            for(let i=start;i<start+6;i++)indices.push(index.getX(i));
        }
        const vertices=[...new Set(indices)],remap=new Map(vertices.map((v,i)=>[v,i])),selected=new THREE.BufferGeometry();
        for(const [name,original] of Object.entries(field.geometry.attributes)){
            const attribute=new THREE.BufferAttribute(new original.array.constructor(vertices.length*original.itemSize),original.itemSize,original.normalized);
            vertices.forEach((vertex,i)=>attribute.copyAt(i,original,vertex));selected.setAttribute(name,attribute);
        }
        selected.setIndex(indices.map(v=>remap.get(v)));selected.computeBoundingBox();selected.computeBoundingSphere();
        const white=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}),originalTile=new THREE.Mesh(selected,white);
        originalTile.userData.grassLeafRanges=ranges;
        const {hash,vertices:sourceVertices,leaves,...context}=asset.source;
        const independentIdentity=await grassCanopyLayoutIdentity(originalTile,context);
        const tiles=asset.variants.map(variant=>{
            const mesh=new THREE.Mesh(selected.clone(),white);mesh.userData.grassLeafRanges=ranges;
            applyGrassCanopyLayoutAsset(mesh,variant,independentIdentity);return mesh;
        });
        let shapeError=0,boundaryChanged=0,changedShoots=0;const shoots=new Map();
        for(const [leaf,range] of ranges.entries()){
            const shoot=Math.floor(tileIds[leaf]/2);if(!shoots.has(shoot))shoots.set(shoot,new Set());
            for(let i=range.start;i<range.start+range.count;i++)shoots.get(shoot).add(selected.index.getX(i));
            for(const tile of tiles){
                const next=tile.geometry.attributes.position,first=selected.index.getX(range.start);
                const dx=next.getX(first)-selected.attributes.position.getX(first),dz=next.getZ(first)-selected.attributes.position.getZ(first);
                for(let i=range.start;i<range.start+range.count;i++){
                    const v=selected.index.getX(i);
                    shapeError=Math.max(shapeError,Math.abs(next.getX(v)-selected.attributes.position.getX(v)-dx),
                        Math.abs(next.getY(v)-selected.attributes.position.getY(v)),Math.abs(next.getZ(v)-selected.attributes.position.getZ(v)-dz));
                }
            }
        }
        // Independently protect both actual geometry and its projected sun-shadow footprint.
        const limit=period/2-snapshot.definition.boundaryBandMeters,sun=asset.source.sun;
        for(const points of shoots.values()){
            let edge=false,same=true;
            for(const v of points){
                const a=tiles[0].geometry.attributes.position,b=tiles[1].geometry.attributes.position;
                same &&= a.getX(v)===b.getX(v)&&a.getY(v)===b.getY(v)&&a.getZ(v)===b.getZ(v);
                for(const p of [a,b]){
                    const x=p.getX(v),y=p.getY(v),z=p.getZ(v),sx=x-y*sun[0]/sun[1],sz=z-y*sun[2]/sun[1];
                    edge ||= Math.abs(x)>=limit||Math.abs(z)>=limit||Math.abs(sx)>=limit||Math.abs(sz)>=limit;
                }
            }
            if(!same)changedShoots++;if(edge&&!same)boundaryChanged++;
        }
        const completion=[],continuations=[],target=new THREE.WebGLRenderTarget(1024,1024),previous=s.renderer.getRenderTarget();
        for(const [variant,tile] of tiles.entries())for(const padding of [0,snapshot.bake.shadowPeriodic.paddingMeters]){
            const culled=createGrassDebugV2PeriodicSource(tile,padding,period),full=new THREE.Group(),half=period/2+padding;
            for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){const mesh=new THREE.Mesh(tile.geometry,white);mesh.position.set(x*period,0,z*period);full.add(mesh);}
            const camera=new THREE.OrthographicCamera(-half,half,half,-half,.01,4),scene=new THREE.Scene();
            camera.position.set(0,2,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);scene.background=new THREE.Color(0);
            const pixels=[];
            for(const root of [culled.group,full]){
                scene.add(root);const data=new Uint8Array(1024*1024*4);s.renderer.setRenderTarget(target);s.renderer.render(scene,camera);
                s.renderer.readRenderTargetPixels(target,0,0,1024,1024,data);pixels.push(data);scene.remove(root);
            }
            let changed=0;for(let i=0;i<pixels[0].length;i+=4)if(pixels[0][i]!==pixels[1][i])changed++;
            completion.push({variant,padding,changedPixels:changed,...culled.getSnapshot()});continuations.push(culled);
        }
        s.renderer.setRenderTarget(previous);target.dispose();continuations.forEach(source=>source.dispose());tiles.forEach(tile=>tile.geometry.dispose());selected.dispose();white.dispose();
        const maps=[];
        for(const layer of ['all','grass'])for(const name of ['albedo','normal','roughness','visibility']){
            const data=[0,1].map(variant=>s.canopy.readPixels(layer,name,variant)),stride=name==='visibility'?1:4;
            const edge=Array(stride).fill(0),interior=Array(stride).fill(0);
            let sharedEdgeMaximum=0,changedInterior=0,interiorSamples=0;
            for(let i=0;i<size;i++){
                for(const [left,right] of [[i*size,i*size+size-1],[i,(size-1)*size+i]])for(let c=0;c<stride;c++){
                    edge[c]+=Math.abs(data[0][left*stride+c]-data[1][right*stride+c])+Math.abs(data[1][left*stride+c]-data[0][right*stride+c]);
                }
                for(let band=0;band<4;band++)for(const pixel of [i*size+band,i*size+size-1-band,band*size+i,(size-1-band)*size+i])
                    for(let c=0;c<stride;c++)sharedEdgeMaximum=Math.max(sharedEdgeMaximum,Math.abs(data[0][pixel*stride+c]-data[1][pixel*stride+c]));
                for(const k of [size/4,size/2,size*3/4])for(const [left,right] of [[i*size+k,i*size+k-1],[k*size+i,(k-1)*size+i]])
                    for(let c=0;c<stride;c++)for(const pixels of data)interior[c]+=Math.abs(pixels[left*stride+c]-pixels[right*stride+c]);
            }
            for(let y=size/4;y<size*3/4;y+=4)for(let x=size/4;x<size*3/4;x+=4){
                const pixel=(y*size+x)*stride;interiorSamples++;
                if(Array.from({length:stride},(_,c)=>Math.abs(data[0][pixel+c]-data[1][pixel+c])).some(v=>v>2))changedInterior++;
            }
            const coverage=[];
            if(name==='normal')for(const pixels of data){
                const band=Math.round(.0625/period*size),borderSides=[0,0,0,0],borderCounts=[0,0,0,0];let center=0,centerCount=0;
                for(let y=0;y<size;y+=4)for(let x=0;x<size;x+=4){
                    const value=pixels[(y*size+x)*4+3]/255,sides=[x<band,x>=size-band,y<band,y>=size-band];
                    sides.forEach((inside,i)=>{if(inside){borderSides[i]+=value;borderCounts[i]++;}});
                    if(!sides.some(Boolean)){center+=value;centerCount++;}
                }
                coverage.push({sides:borderSides.map((v,i)=>v/borderCounts[i]),center:center/centerCount});
            }
            const visibility=name==='visibility'?data.map(pixels=>{
                let sum=0,dark=0;for(let i=0;i<pixels.length;i+=16){sum+=pixels[i];if(pixels[i]<128)dark++;}
                return {mean:sum/(pixels.length/16)/255,darkFraction:dark/(pixels.length/16)};
            }):null;
            const texture=s.canopy.materials[layer][{albedo:'map',normal:'normalMap',roughness:'roughnessMap'}[name]]
                ??s.canopy.materials[layer].userData.grassCanopyTileVisibility.value;
            maps.push({layer,name,repeat:texture.wrapS===THREE.RepeatWrapping&&texture.wrapT===THREE.RepeatWrapping,
                crossEdge:edge.map(v=>v/(size*4)),interior:interior.map(v=>v/(size*12)),sharedEdgeMaximum,
                changedInteriorFraction:changedInterior/interiorSamples,coverage,visibility});
        }
        const top=s.canopy.group.children[0],position=top.geometry.attributes.position,uv=top.geometry.attributes.uv;let uvError=0;
        for(let i=0;i<position.count;i++)uvError=Math.max(uvError,Math.abs(uv.getX(i)-(.5+position.getX(i)/period)),Math.abs(uv.getY(i)-(.5-position.getZ(i)/period)));
        return {snapshot,fixtures,completion,maps,uvError,layout:{shapeError,boundaryChanged,changedShoots,
            tileIdsMatch:JSON.stringify(tileIds)===JSON.stringify(asset.source.tileIds),sourceHash:independentIdentity.hash,publishedHash:hash,sourceVertices,
            feedbackProfile:context.feedbackProfile,variants:asset.variants.length,leaves:ranges.length,loadedPositions:tiles.length}};
    });
    await writeFile(path.join(output,'validation.json'),JSON.stringify({...result,errors,searchRequests},null,2));
    expect(searchRequests).toEqual([]);expect(errors).toEqual([]);
    for(const fixture of result.fixtures){
        expect(fixture.exact).toBe(true);expect(fixture.originalInstances).toBe(4);expect(fixture.renderedInstances).toBe(16);
        expect(fixture.indices).toBe(16*36);expect(fixture.neighbors.filter(n=>n.instances>0)).toHaveLength(9);
    }
    expect(result.snapshot.bake.footprint).toEqual([2,2]);expect(result.snapshot.bake.resolution).toBe(4096);
    expect(result.snapshot.bake.estimatedTextureBytes).toBe((4096*4096*4-1)/3*26*2);expect(result.uvError).toBeLessThan(1e-6);
    expect(result.snapshot.bake.shadowResolution).toBe(8192);expect(result.snapshot.bake.selfShadowsBaked).toBe(true);
    expect(result.layout.variants).toBe(2);expect(result.layout.loadedPositions).toBe(2);expect(result.layout.tileIdsMatch).toBe(true);
    expect(result.layout.feedbackProfile).toBe('hdr-display-v1');
    expect(result.layout.sourceHash).toBe(result.layout.publishedHash);expect(result.layout.shapeError).toBeLessThan(2e-6);
    expect(result.layout.boundaryChanged).toBe(0);expect(result.layout.changedShoots).toBeGreaterThan(0);
    expect(result.layout.leaves).toBeGreaterThan(2400);expect(result.layout.leaves).toBeLessThan(2900);
    for(const completion of result.completion){
        expect(completion.originalInstances).toBe(result.layout.leaves);expect(completion.changedPixels,JSON.stringify(completion)).toBe(0);
        expect(completion.neighbors).toHaveLength(9);
        expect(completion.neighbors.filter(n=>(n.x===0||n.z===0)&&n.instances>0)).toHaveLength(5);
    }
    for(const map of result.maps){
        expect(map.repeat).toBe(true);expect(map.sharedEdgeMaximum,map.layer+'/'+map.name+' shared boundary strip').toBeLessThanOrEqual(2);
        for(let c=0;c<map.crossEdge.length;c++)expect(map.crossEdge[c],map.layer+'/'+map.name+' seam channel'+c).toBeLessThan(map.interior[c]*1.5+.5);
        for(const coverage of map.coverage)for(const side of coverage.sides)expect(side,map.layer+' independent edge coverage').toBeGreaterThan(coverage.center*.75);
        if(['albedo','normal'].includes(map.name))expect(map.changedInteriorFraction).toBeGreaterThan(.01);
        for(const visibility of map.visibility??[]){expect(visibility.mean).toBeGreaterThan(.3);expect(visibility.mean).toBeLessThan(.95);expect(visibility.darkFraction).toBeGreaterThan(.03);}
    }
    for(const [azimuth,elevation,distance] of [[225,20,55],[45,35,60],[135,55,70]]){
        await page.evaluate(({azimuth,elevation,distance})=>{
            const s=window.__grassLitterScene,a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
            s.setFieldCount(9);s.setLod('LOD2+4');s.camera.position.set(Math.sin(a)*Math.cos(e)*distance,Math.sin(e)*distance,Math.cos(a)*Math.cos(e)*distance);
            s.camera.lookAt(0,.1,0);s.camera.updateMatrixWorld();s.lighting.render(0);
        },{azimuth,elevation,distance});
        await page.screenshot({path:path.join(output,'mixed-'+azimuth+'.png')});
    }
    expect(errors).toEqual([]);
});
