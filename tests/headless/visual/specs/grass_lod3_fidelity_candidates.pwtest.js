// Compare silhouette-preserving LOD3 candidates against the same LOD2 field at twenty metres.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_twenty_meters');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Compare LOD3 geometry candidates with the reference field at twenty metres', async ({ page }) => {
    test.skip(process.env.GRASS_LOD3_FIDELITY_CANDIDATES !== '1' && process.env.GRASS_LOD3_FIDELITY_BENCHMARK !== '1',
        'Opt in to the experimental LOD3 comparison or hardware benchmark.');
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD3#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const setup = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        const source = s.scene.getObjectByName('GrassField-LOD2'), geometry = source.geometry;
        const canopy = s.scene.getObjectByName('GrassField-LOD4-Canopy'), originalCanopy = canopy.geometry;
        const lowCanopy = originalCanopy.clone();
        for (let i = 0; i < lowCanopy.attributes.position.count; i++) lowCanopy.attributes.position.setY(i, lowCanopy.attributes.position.getY(i) * .2);
        lowCanopy.computeBoundingBox(); lowCanopy.computeBoundingSphere();
        const p = geometry.attributes.position, indices = geometry.index;
        const point = i => new THREE.Vector3().fromBufferAttribute(p, i);
        const ranked = Array.from({length: indices.count/6},(_,leaf)=>{
            let area=0; for(let j=0;j<6;j+=3){const o=leaf*6+j,a=point(indices.getX(o)),b=point(indices.getX(o+1)),c=point(indices.getX(o+2));area+=b.sub(a).cross(c.sub(a)).length()/2;}
            return {leaf,area};
        }).sort((a,b)=>b.area-a.area);
        const candidates = {};
        for (const [name, fraction, single, widthScale] of [['single', 1, true, 1.85], ['half', .5, false, 2], ['three_quarters', .75, false, 1.3333],
            ['half_narrow', .5, false, 1.1], ['two_thirds', 2/3, false, 1.1], ['three_quarters_narrow', .75, false, 1.05], ['full_source', 1, false, 1],
            ['area60',.6,false,1.3],['area70',.7,false,1.2],['area75',.75,false,1.12],['upper',1,'upper',1],['upper_wide',1,'upper',1.4]]) {
            const arrays = Object.fromEntries(Object.keys(geometry.attributes).map(key => [key, []]));
            const selected = name.startsWith('area') ? new Set(ranked.slice(0,Math.round(ranked.length*fraction)).map(x=>x.leaf)) : null;
            for (let offset = 0; offset < indices.count; offset += 6) {
                const leaf = offset / 6, random = (Math.imul(leaf + 1, 1597334677) >>> 0) / 4294967296;
                if (selected ? !selected.has(leaf) : random >= fraction) continue;
                const ids = Array.from({ length: 6 }, (_, i) => indices.getX(offset + i));
                const a = point(ids[0]), b = point(ids[2]), c = point(ids[1]), d = point(ids[5]);
                const root = a.clone().add(b).multiplyScalar(.5), top = c.clone().add(d).multiplyScalar(.5);
                const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, ids[0])
                    .add(new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, ids[5])).normalize();
                const corners = single === 'upper' ? [3, 4, 5] : single ? [0, 1, 2] : [0, 1, 2, 3, 4, 5];
                for (const corner of corners) {
                    const id = ids[corner], position = point(id), v = (geometry.attributes.uv.getY(id) - .18) / .82;
                    if (single && single !== 'upper') {
                        if (corner === 1) position.copy(top).add(new THREE.Vector3(0, Math.max(c.y, d.y) - top.y, 0));
                        else position.sub(root).multiplyScalar(widthScale).add(root);
                    } else {
                        const center = root.clone().lerp(top, v / .9);
                        const axis = b.clone().sub(a).normalize();
                        position.addScaledVector(axis, position.clone().sub(center).dot(axis) * (widthScale - 1));
                    }
                    for (const [key, attribute] of Object.entries(geometry.attributes)) {
                        if (key === 'position') arrays[key].push(...position.toArray());
                        else if (single && single !== 'upper' && (key === 'normal' || key === 'grassFacingNormal')) arrays[key].push(...normal.toArray());
                        else for (let j = 0; j < attribute.itemSize; j++) arrays[key].push(attribute.array[id * attribute.itemSize + j]);
                    }
                }
            }
            const result = new THREE.BufferGeometry();
            for (const [key, values] of Object.entries(arrays)) result.setAttribute(key, new THREE.Float32BufferAttribute(values, geometry.attributes[key].itemSize));
            result.computeBoundingBox(); result.computeBoundingSphere();
            const mesh = new THREE.Mesh(result, source.material); mesh.visible = false; mesh.receiveShadow = true;
            source.parent.add(mesh); candidates[name] = mesh;
        }
        s.setLod('LOD2'); s.lighting.render(0);
        const probe = { s, THREE, candidates, canopy, originalCanopy, lowCanopy, reference: null, mask: null };
        window.__lod3Fidelity = probe;
        return Object.fromEntries(Object.entries(candidates).map(([key, mesh]) => [key, mesh.geometry.attributes.position.count / 3]));
    });
    const results = [];
    for (const [name, azimuth, elevation] of [['front',40,22], ['back',220,22], ['side_low',130,10], ['top',310,55]]) {
        for (const mode of ['LOD2','LOD3','LOD4','upper','upper_soil','upper_wide','upper_wide_soil','area75_soil']) {
            const metrics = await page.evaluate(({ mode, azimuth, elevation }) => {
                const { s, THREE, candidates, canopy, originalCanopy, lowCanopy } = window.__lod3Fidelity;
                const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
                s.camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(20);
                s.camera.lookAt(0,.06,0); s.camera.updateMatrixWorld(true);
                const soil = mode.endsWith('_soil');
                s.setLod(mode.startsWith('LOD') ? mode : soil ? 'LOD2' : 'LOD4');
                if (soil) s.scene.getObjectByName('GrassField-LOD2').visible = false;
                for (const [key, mesh] of Object.entries(candidates)) mesh.visible = mode.replace('_soil','') === key;
                canopy.geometry = mode.startsWith('LOD') ? originalCanopy : lowCanopy;
                s.lighting.render(0);
                const gl = s.renderer.getContext(), width=gl.drawingBufferWidth, height=gl.drawingBufferHeight;
                const pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                const probe = window.__lod3Fidelity;
                if (mode === 'LOD2') {
                    probe.reference = pixels;
                    probe.mask = new Uint8Array(width * height);
                    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0,1,0),-.06), hit = new THREE.Vector3();
                    for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
                        ray.setFromCamera(new THREE.Vector2((x+.5)/(width/2)-1,(y+.5)/(height/2)-1),s.camera);
                        if(ray.ray.intersectPlane(plane,hit) && Math.abs(hit.x)<5.8 && Math.abs(hit.z)<5.8) probe.mask[y*width+x]=1;
                    }
                }
                let samples=0,error=0,squared=0;const mean=[0,0,0],referenceMean=[0,0,0];
                for(let i=0;i<probe.mask.length;i++) if(probe.mask[i]) {
                    samples++;for(let k=0;k<3;k++){const a=pixels[i*4+k],b=probe.reference[i*4+k];mean[k]+=a;referenceMean[k]+=b;error+=Math.abs(a-b);squared+=(a-b)**2;}
                }
                return {samples,mae:error/(samples*3),rmse:Math.sqrt(squared/(samples*3)),mean:mean.map(v=>v/samples),referenceMean:referenceMean.map(v=>v/samples)};
            },{mode,azimuth,elevation});
            results.push({name,mode,metrics});
            await page.screenshot({path:path.join(output,name+'_'+mode+'.png')});
        }
    }
    const timings = process.env.GRASS_LOD3_FIDELITY_BENCHMARK === '1' ? await page.evaluate(async () => {
        const { s, candidates, canopy, originalCanopy } = window.__lod3Fidelity;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer), frame = () => new Promise(requestAnimationFrame), blocks = [];
        canopy.geometry = originalCanopy;
        for (const [name, azimuth, elevation] of [['front',40,22],['back',220,22],['side_low',130,10]]) {
            const az=azimuth*Math.PI/180,el=elevation*Math.PI/180;
            s.camera.position.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(20);
            s.camera.lookAt(0,.06,0);s.camera.updateMatrixWorld(true);
            for(let round=0;round<3;round++) for(const mode of round%2?['candidate','LOD2']:['LOD2','candidate']) {
                s.setLod('LOD2');s.scene.getObjectByName('GrassField-LOD2').visible=mode==='LOD2';
                for(const [key,mesh] of Object.entries(candidates))mesh.visible=mode==='candidate'&&key==='area75';
                for(let i=0;i<30;i++)await frame();
                const before=timer.getDiagnostics(),first=before.submissionSequence,generation=s.getSnapshot().shadows.generations;
                for(let i=0;i<90;i++)await frame();
                const last=timer.getDiagnostics().submissionSequence;
                for(let i=0;i<60&&timer.getSamplesSince(0).filter(x=>x.submissionSequence>first&&x.submissionSequence<=last).length<last-first;i++)await frame();
                const after=timer.getDiagnostics(),samples=timer.getSamplesSince(0).filter(x=>x.submissionSequence>first&&x.submissionSequence<=last).map(x=>x.ms);
                if(!before.active||after.disjointCount!==before.disjointCount||samples.length!==90||last-first!==90||s.getSnapshot().shadows.generations!==generation)throw Error('Invalid fidelity GPU benchmark block');
                blocks.push({name,mode,round,samples,mean:samples.reduce((a,b)=>a+b,0)/samples.length});
            }
        }
        return blocks;
    }) : [];
    await writeFile(path.join(output,'candidates.json'),JSON.stringify({setup,results,timings,errors},null,2));
    expect(errors).toEqual([]);
});
