// Reproduces facade darkening and shaded cornices at fixed city cameras.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureReceiverCorner } from '../../shared/receiverCornerCapture.js';
import { probeReceiverIrradiance } from '../../shared/receiverIrradianceProbe.js';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Receiver refinement: facade and sidewalk channel comparison', async ({ page }) => {
    test.setTimeout(600000);
    const root = path.resolve('tests/artifacts/screens/illumination_refinement/' + (process.env.RECEIVER_CAPTURE ?? 'before'));
    await mkdir(root, { recursive: true });
    if (process.env.RECEIVER_BAKE_ROOT) {
        const bakeRoot = path.resolve(process.env.RECEIVER_BAKE_ROOT);
        const latest = JSON.parse(await readFile(path.join(bakeRoot, 'latest.json')));
        const directory = path.join(bakeRoot, latest.directory);
        const index = JSON.parse(await readFile(path.join(directory, 'package_index.json')));
        expect(index.mapping.coverage.complete).toBe(true);
        await page.route('**/assets/baked_lighting/receivers/enhanced/**', route => route.fulfill({ status: 302,
            headers: { location: '/' + path.relative(process.cwd(), path.join(directory,
                path.basename(new URL(route.request().url()).pathname))).replaceAll('\\', '/') } }));
    }
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text());
    });
    page.on('request', request => { if (/\.ilpkg\.gz/.test(request.url())) requests.push(request.url()); });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: true, indirect: true } })));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 120000 });
    await page.waitForFunction(() => {
        const d = window.__busSim.engine.getBakedLightingDebugInfo().receiverLightmaps;
        if (d.state === 'fallback') throw new Error(JSON.stringify(d));
        return d.state === 'active' && d.activationBlend === 1;
    }, null, { timeout: 300000 });
    await page.evaluate(async () => {
        const { engine: e, sm } = window.__busSim;
        await e.waitForLightingReady();
        window.refinementBaseFov = e.camera.fov;
        e.stop(); sm.current.gameLoop.paused = true;
        sm.current.update = () => { e.context.city.update(e); e.context.city.updateStaticVisibility(e.camera); };
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        window.refinementMode = async receivers => {
            let done = false;
            const work = e.setBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { enhanced: true, direct: false, indirect: false, debug: 'final', ...receivers } }).finally(() => done = true);
            for (let frame = 0;; frame++) {
                e.updateFrame(0); await new Promise(requestAnimationFrame);
                const d = e.getBakedLightingDebugInfo().receiverLightmaps;
                if (done && d.state === 'fallback') throw new Error(JSON.stringify(d));
                if (done && frame > 12 && (!(receivers.direct || receivers.indirect) || d.activationBlend === 1)) break;
            }
            await work;
        };
    });
    for (const [topic, position, target] of [
        ['lowrise-west', [25, 10, 145], [47, 9, 145]],
        ['lowrise-north', [47, 11, 120], [47, 9, 145]],
        ['lowrise-columns', [41, 10, 132], [45, 9, 140]],
        ['lowrise-east', [66, 11, 152], [53, 9, 145]],
        ['lowrise-reported', [129, 10, 153], [120, 9, 161]],
        ['lowrise-shadow', [18, 15, 120], [43, 1, 143]],
        ['platform', [-35, 18, 39], [-47, 1, 21]],
        ['sidewalk', [-36, 10, 41], [-23, .2, 32]],
        ['sidewalk-mainstreet-west', [6, 14, 40], [15, .2, 31]],
        ['sidewalk-corner-close', [62, 10, 38], [54.9, .2, 30.9]],
        ['sidewalk-mainstreet-east', [65, 14, 40], [55, .2, 31]],
        ['sidewalk-mainstreet-north', [-67, 14, -29], [-59, .2, -38]],
        ['tower', [-191, 12, 45], [-169, 30, 23]],
        ['cornice', [-24, 29, 171], [-24, 41, 191]]
    ]) {
        if (process.env.RECEIVER_TOPICS && !process.env.RECEIVER_TOPICS.split(',').includes(topic)) continue;
        await page.evaluate(({ position, target, topic }) => {
            const e = window.__busSim.engine;
            e.camera.fov = topic === 'lowrise-reported' ? 40 : topic === 'sidewalk-corner-close' ? 35 : window.refinementBaseFov; e.camera.updateProjectionMatrix();
            e.camera.position.fromArray(position); e.camera.lookAt(...target); e.camera.updateMatrixWorld(true);
        }, { position, target, topic });
        const modes = [['off', {}], ['on', { direct: true, indirect: true }], ['indirect', { direct: true, indirect: true, debug: 'indirect' }]];
        if (topic === 'cornice') modes.push(['direct', { direct: true, indirect: true, debug: 'direct' }],
            ['original-direct', { enhanced: false, direct: true }],
            ['original-indirect', { enhanced: false, indirect: true }], ['original', { enhanced: false, direct: true, indirect: true }]);
        for (const [name, mode] of modes) {
            await page.evaluate(mode => window.refinementMode(mode), mode);
            const capture = await page.screenshot({ path: path.join(root, topic + '-' + name + '.png') });
            if (process.env.RECEIVER_WIREFRAME && topic === 'sidewalk-mainstreet-east' && name !== 'indirect') await captureReceiverCorner(page,root,name);
            if ((topic === 'lowrise-north' && name === 'indirect') || (topic === 'cornice' && ['direct', 'indirect'].includes(name))) {
                const pixel = await page.evaluate(async ({ encoded, cornice }) => {
                    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
                    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
                    context.drawImage(bitmap, 0, 0);
                    return [...context.getImageData(bitmap.width * (cornice ? .57 : .5), bitmap.height * (cornice ? .5175 : .5), 1, 1).data];
                }, { encoded: capture.toString('base64'), cornice: topic === 'cornice' });
                await writeFile(path.join(root, topic + '-' + name + '-pixel.json'), JSON.stringify(pixel));
                if (name === 'indirect') expect(Math.min(...pixel.slice(0, 3))).toBeGreaterThan(40);
                else expect(Math.max(...pixel.slice(0, 3))).toBeLessThan(12);
            }
        }
        await page.evaluate(() => window.refinementMode({ direct: true, indirect: true }));
        if (process.env.RECEIVER_FIELD_AUDIT && topic === 'sidewalk-corner-close') {
            const values=await page.evaluate(async()=>{
                const T=await import('three'),e=window.__busSim.engine,u=e._bakedLighting.receiverModes.enhanced.uniforms;
                const camera=new T.OrthographicCamera(-.00005,.00005,.00005,-.00005,.1,10);camera.up.set(0,0,-1);
                const rt=new T.WebGLRenderTarget(16,16,{type:T.FloatType}),oldTarget=e.renderer.getRenderTarget(),tone=e.renderer.toneMapping,debug=u.receiverDebugMode.value;
                const points=[[54.71,30],[54.73,30],[54,30.71],[54,30.73],[54.4,30.4],[55.4,31.4]],result=[],targets=[];
                e.scene.traverseVisible(o=>{if(o.isMesh)targets.push(o);});
                try{
                    e.renderer.toneMapping=T.NoToneMapping;
                    for(const [x,z] of points){
                        const ray=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0));
                        const hit=ray.intersectObjects(targets,false)[0];
                        const o=hit?.object,m=Array.isArray(o?.material)?o.material[hit.face.materialIndex]:o?.material;
                        const item={x,z,name:o?.name,y:hit?.point.y,normal:hit?.face.normal.toArray(),material:{type:m?.type,color:m?.color?.toArray(),roughness:m?.roughness,metalness:m?.metalness,aoMap:!!m?.aoMap,aoMapIntensity:m?.aoMapIntensity,lightMapIntensity:m?.lightMapIntensity}};
                        camera.position.set(x,5,z);camera.lookAt(x,.191,z);camera.updateMatrixWorld(true);
                        for(const mode of [0,2]){
                            u.receiverDebugMode.value=mode;e.renderer.setRenderTarget(rt);e.renderer.render(e.scene,camera);
                            const pixel=new Float32Array(4);e.renderer.readRenderTargetPixels(rt,8,8,1,1,pixel);item[mode?'irradiance':'final']=[...pixel.slice(0,3)];
                        }
                        result.push(item);
                    }
                }finally{u.receiverDebugMode.value=debug;e.renderer.toneMapping=tone;e.renderer.setRenderTarget(oldTarget);rt.dispose();e.updateFrame(0);}
                return result;
            });
            await writeFile(path.join(root,'corner-field-audit.json'),JSON.stringify(values,null,2));
        }
        if (topic === 'sidewalk-mainstreet-east') {
            const fan=await page.evaluate(async()=>{
                const T=await import('three'),{canShareReceiverSurface}=await import('/src/app/illumination/receiver_lightmaps/ReceiverSurfaceCharts.js');
                const e=window.__busSim.engine,triangles=[],layers=new Set();
                e.scene.traverse(o=>{
                    if(!o.isMesh||o.name!=='Sidewalk')return;
                    const g=o.geometry,p=g.attributes.position,a=g.attributes.receiverAtlasCoordinate,index=g.index;
                    if(!a)throw new Error('Sidewalk has no active receiver coordinates');
                    for(let i=0;i<(index?.count??p.count);i+=3){
                        const ids=[0,1,2].map(c=>index?index.getX(i+c):i+c);
                        const points=ids.map(k=>new T.Vector3().fromBufferAttribute(p,k).applyMatrix4(o.matrixWorld));
                        if(!points.every(v=>Math.abs(v.y-.191)<1e-5&&v.x>54.7&&v.x<57&&v.z>30.7&&v.z<33)
                            ||!points.some(v=>Math.hypot(v.x-54.72,v.z-30.72)<1e-4))continue;
                        for(const k of ids){if(a.getW(k)!==1)throw new Error('Unmapped fan vertex');layers.add(a.getZ(k));}
                        triangles.push({offset:i,area:new T.Triangle(...points).getArea(),points:points.map(v=>v.toArray()),uv:ids.map(k=>[a.getX(k),a.getY(k)])});
                    }
                });
                return {triangles,layerCount:layers.size,continuous:canShareReceiverSurface({triangles},t=>t.points)};
            });
            await writeFile(path.join(root,'corner-fan-runtime-mapping.json'),JSON.stringify(fan,null,2));
            expect(fan.triangles.length).toBeGreaterThanOrEqual(12);
            expect(fan.layerCount).toBe(1);expect(fan.continuous).toBe(true);
            const seams = [];
            for (const mip of [0,1]) for (const [x,z,axis] of [[54,30.719999313354492,1],[54.720001220703125,30,0]]) {
                const pair = await probeReceiverIrradiance(page, [-1,1].map(side=>({
                    x:x+(axis===0?side*.0002:0), z:z+(axis===1?side*.0002:0), mip
                })));
                expect(pair.map(p=>p.mesh)).toEqual(['BuildingSlab','Sidewalk']);
                seams.push({mip,point:[x,z],pair,relativeDifference:Math.max(...[0,1,2].map(c=>
                    Math.abs(pair[0].rgb[c]-pair[1].rgb[c])/Math.max(.001,pair[0].rgb[c],pair[1].rgb[c])))});
            }
            await writeFile(path.join(root,'sidewalk-seam-irradiance.json'),JSON.stringify(seams,null,2));
            expect(Math.max(...seams.map(s=>s.relativeDifference))).toBeLessThan(.01);
        }
        if (['lowrise-north', 'lowrise-columns', 'lowrise-reported'].includes(topic)) {
            // Probe flat lintel diagonals and authored wall-strip T-junctions in linear HDR.
            const seams = await page.evaluate(async topic => {
                const reported = topic === 'lowrise-reported', columns = topic !== 'lowrise-north';
                const T = await import('three'), e = window.__busSim.engine;
                const uniforms = e._bakedLighting.receiverModes.enhanced.uniforms;
                const camera = new T.OrthographicCamera(-.00005, .00005, .00005, -.00005, .1, 10);
                const rt = new T.WebGLRenderTarget(16, 16, { type: T.FloatType });
                const oldTarget = e.renderer.getRenderTarget(), tone = e.renderer.toneMapping, debug = uniforms.receiverDebugMode.value;
                const samples = [];
                try {
                    uniforms.receiverDebugMode.value = 2; e.renderer.toneMapping = T.NoToneMapping;
                    for (const t of [.1, .3, .5, .7, .9]) {
                        const pair = [];
                        for (const side of [-1, 1]) {
                            const x = columns ? (reported ? 118.99400329589844 : 43.90599822998047)+side*.0002 : 44.10599899291992+1.5*t;
                            const y = columns ? (reported ? 8.95+.5*t : 8.5+t) : 11.491999809265137+.40000009536743164*t+side*.0002;
                            camera.position.set(x, y, reported ? 158 : 137); camera.lookAt(x, y, reported ? 161 : 139.8939971923828); camera.updateMatrixWorld(true);
                            e.renderer.setRenderTarget(rt); e.renderer.render(e.scene, camera);
                            const pixel = new Float32Array(4); e.renderer.readRenderTargetPixels(rt, 8, 8, 1, 1, pixel);
                            pair.push(Array.from(pixel.slice(0, 3)));
                        }
                        samples.push({ t, pair, relativeDifference: Math.max(...[0,1,2].map(c => Math.abs(pair[0][c]-pair[1][c])/Math.max(.001, pair[0][c], pair[1][c]))) });
                    }
                } finally {
                    uniforms.receiverDebugMode.value = debug; e.renderer.toneMapping = tone;
                    e.renderer.setRenderTarget(oldTarget); rt.dispose(); e.updateFrame(0);
                }
                return samples;
            }, topic);
            await writeFile(path.join(root, topic+'-seam-irradiance.json'), JSON.stringify(seams, null, 2));
            for (const sample of seams) expect(Math.min(...sample.pair.flat())).toBeGreaterThan(.01);
            expect(Math.max(...seams.map(s => s.relativeDifference))).toBeLessThan(.04);
        }
        if (topic === 'lowrise-shadow') {
            const irradiance = await page.evaluate(async () => {
                const T = await import('three'), e = window.__busSim.engine;
                const uniforms = e._bakedLighting.receiverModes.enhanced.uniforms;
                const camera = new T.OrthographicCamera(-.025, .025, .025, -.025, .1, 10);
                camera.up.set(0, 0, -1);
                const rt = new T.WebGLRenderTarget(16, 16, { type: T.FloatType });
                const target = e.renderer.getRenderTarget(), tone = e.renderer.toneMapping;
                const debug = uniforms.receiverDebugMode.value;
                const samples = [];
                try {
                    uniforms.receiverDebugMode.value = 2;
                    e.renderer.toneMapping = T.NoToneMapping;
                    for (const z of [131.875, 132.125, 133]) {
                        camera.position.set(30, 5, z); camera.lookAt(30, 0, z); camera.updateMatrixWorld(true);
                        e.renderer.setRenderTarget(rt); e.renderer.render(e.scene, camera);
                        const pixel = new Float32Array(4);
                        e.renderer.readRenderTargetPixels(rt, 8, 8, 1, 1, pixel);
                        samples.push({ point: [30, z], rgb: [...pixel.slice(0, 3)] });
                    }
                } finally {
                    uniforms.receiverDebugMode.value = debug; e.renderer.toneMapping = tone;
                    e.renderer.setRenderTarget(target); rt.dispose(); e.updateFrame(0);
                }
                return samples;
            });
            await writeFile(path.join(root, 'ground-boundary-irradiance.json'), JSON.stringify(irradiance, null, 2));
            for (let channel = 0; channel < 3; channel++) {
                const ratio = irradiance[0].rgb[channel] / irradiance[1].rgb[channel];
                expect(ratio).toBeGreaterThan(.8); expect(ratio).toBeLessThan(1.25);
            }
        }
        const probes = await page.evaluate(async topic => {
            const T = await import('three'), e = window.__busSim.engine;
            return [[0, 0], [-.4, 0], [.4, 0], ...(topic === 'cornice' ? [[.14, -.035]] : [])].map(([x, y]) => {
                const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(x, y), e.camera);
                const hit = ray.intersectObject(e.scene, true).find(h => h.object.isMesh && h.object.visible);
                if (!hit) return null;
                const o = hit.object, g = o.geometry, m = Array.isArray(o.material) ? o.material[hit.face.materialIndex] : o.material;
                const corners = [hit.face.a, hit.face.b, hit.face.c], a = g.attributes.receiverAtlasCoordinate;
                const p = corners.map(i => new T.Vector3().fromBufferAttribute(g.attributes.position, i));
                const b = T.Triangle.getBarycoord(o.worldToLocal(hit.point.clone()), ...p, new T.Vector3());
                const entry = e._bakedLighting.receiverModes.enhanced.bindings?.geometries.find(item => item.object === o);
                const ancestry=[];for(let parent=o;parent;parent=parent.parent)ancestry.push(parent.name);
                return { name: o.name, ancestry, point: hit.point.toArray(), face: hit.faceIndex, instance: hit.instanceId,
                    normal: hit.face.normal.clone().transformDirection(o.matrixWorld).toArray(), side: m.side,
                    shaderNormal: corners.map(i => new T.Vector3().fromBufferAttribute(g.attributes.normal, i).transformDirection(o.matrixWorld).toArray()),
                    atlas: a ? [0, 1, 2, 3].map(c => corners.reduce((sum, v, i) => sum + a.getComponent(v, c) * b.getComponent(i), 0)) : null,
                    material: { name: m.name, map: m.map?.userData, ao: m.aoMapIntensity, color: m.color?.toArray(), metalness: m.metalness },
                    sourceGeometry: entry?.original.uuid, userData: o.userData };
            });
        }, topic);
        if (topic === 'cornice') expect(probes.at(-1).normal[1]).toBeLessThan(-.99);
        if (topic === 'lowrise-reported') expect(probes[0].ancestry).toContain('building_49_d');
        await writeFile(path.join(root, topic + '.json'), JSON.stringify(probes, null, 2));
    }
    await page.evaluate(() => window.refinementMode({ direct: true, indirect: true }));
    const warmRequests = [...requests], counts = [];
    for (let cycle = 0; cycle < 4; cycle++) {
        await page.evaluate(() => window.refinementMode({}));
        await page.evaluate(() => window.refinementMode({ direct: true, indirect: true }));
        counts.push(await page.evaluate(() => {
            const r = window.__busSim.engine.renderer;
            return { programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries };
        }));
    }
    expect(requests).toEqual(warmRequests);
    expect(new Set(counts.map(value => JSON.stringify(value))).size).toBe(1);
    await writeFile(path.join(root, 'toggles.json'), JSON.stringify({ counts, requests, errors }, null, 2));
    const lighting = await page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo());
    await writeFile(path.join(root, 'lighting-status.json'), JSON.stringify(lighting, null, 2));
    expect(lighting.receiverLightmaps.state).toBe('active');
    expect(lighting.receiverLightmaps.reason).toBeNull();
    expect(lighting.receiverLightmaps.effective).toEqual({ direct: true, indirect: true });
    expect(lighting.status.effectiveMode).toBe('baked');
    expect(errors).toEqual([]);
});
