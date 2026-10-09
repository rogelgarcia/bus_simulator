// Compare real leaf coverage, excluding litter, from matched bus and overview cameras.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { measureGrassCardHybrid } from '../perf/grass_card_hybrid_metrics.mjs';
import { captureGrassCardBoundaries } from '../visual/grass_card_boundaries.mjs';

const trial = process.env.GRASS_CARD_TRIAL || 'final';
const output = `tests/artifacts/screens/grass_debug_v2/card_coverage/${trial}`;
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('card captures preserve leaf coverage across the bus scene', async ({ page }) => {
    test.setTimeout(process.env.GRASS_CARD_PERF ? 600000 : 120000); await mkdir(output, { recursive: true });
    const rows = [], errors = [], performance = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (process.env.GRASS_MATERIAL_BACKUP) await page.route('**/assets/public/pbr/**/*.config.js*', async route => {
        const relative = new URL(route.request().url()).pathname.split('/assets/public/pbr/')[1];
        let body;
        try { body = await readFile('assets/public/pbr/' + relative, 'utf8'); }
        catch { body = await readFile(process.env.GRASS_MATERIAL_BACKUP + '/' + relative, 'utf8'); }
        await route.fulfill({ contentType: 'text/javascript', body });
    });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassCoverageView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text())
            .replace('const representation = cards =>', 'window.__grassCoverageAssets = { nearCards, bridgeCards, assets };\nconst representation = cards =>')
            .replace('fields.setLod3Representation(representation(nearCards));', 'window.__grassCoverageFields = fields;\nfields.setLod3Representation(representation(nearCards));') });
    });
    if (process.env.GRASS_CARD_PROFILE_TRIAL || process.env.GRASS_CARD_SOURCE_BEFORE) await page.route('**/GrassDebugV2ViewCards.js*', async route => {
        const response = await route.fetch();
        let body = process.env.GRASS_CARD_SOURCE_BEFORE ? await readFile(process.env.GRASS_CARD_SOURCE_BEFORE, 'utf8') : await response.text();
        if (process.env.GRASS_CARD_PROFILE_TRIAL) body = body.replace('const shape = PROFILES[profile];', `const shape = { ...PROFILES[profile], ...${JSON.stringify(JSON.parse(process.env.GRASS_CARD_PROFILE_TRIAL))}[profile] };`);
        await route.fulfill({ response, body });
    });
    if (process.env.GRASS_CARD_CODE_BASELINE) for (const name of ['ViewCards', 'CardBase', 'TransitionFields'])
        await page.route(`**/GrassDebugV2${name}.js*`, async route => {
            await route.fulfill({ contentType: 'text/javascript', body: await readFile(`${process.env.GRASS_CARD_CODE_BASELINE}/GrassDebugV2${name}.js`, 'utf8') });
        });
    await page.goto('/debug_tools/grass_debug_v2.html' + (process.env.GRASS_CARD_BASE_OFF ? '?base=off' : ''));
    await page.waitForFunction(() => !!window.__grassDebugV2, null, { timeout: 30000 });
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const metadata = await page.evaluate(async () => {
        const THREE = await import('three');
        const { cloneMaterialShaderContract, registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const view = window.__grassCoverageView;
        if (new URLSearchParams(location.search).get('base') === 'off') window.__grassCoverageFields.setCardBaseEnabled(false);
        view.renderer.setAnimationLoop(null); view.canvas.dataset.studyCanvas = 'true';
        const saved = [], materials = new Map(); let background;
        window.__grassCoverageMask = enabled => {
            if (!enabled) {
                for (const [mesh, material, visible] of saved) { mesh.material = material; mesh.visible = visible; }
                saved.length = 0; view.scene.background = background; return;
            }
            background = view.scene.background; view.scene.background = new THREE.Color(0);
            view.scene.traverse(mesh => {
                if (!mesh.isMesh) return;
                saved.push([mesh, mesh.material, mesh.visible]);
                if (!/-LOD[234]-/.test(mesh.name)) { mesh.visible = false; return; }
                if (!materials.has(mesh.material)) {
                    const material = cloneMaterialShaderContract(mesh.material);
                    const sparse = mesh.userData.grassCardBase;
                    registerMaterialShaderHook(material, { id: 'test.leaf-mask', priority: 1000, variantKey: sparse ? 'base' : 'leaf',
                        apply(shader) { shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = vec3(' + (sparse ? 'grassFloorLeafMask' : '1.0') + ');'); } });
                    materials.set(mesh.material, material);
                }
                mesh.material = materials.get(mesh.material);
            });
        };
        return { cards: view.grass.getSnapshot().cards, base: window.__grassCoverageFields.getSnapshot().cardBase,
            viewport: view.getSnapshot().viewport, gpu: view.gpuTimer.getDiagnostics() };
    });
    const poses = (process.env.GRASS_CARD_POSES || 'bus,overview,grass,rear').split(',');
    for (const pose of poses) {
        await page.evaluate(async pose => {
            const view = window.__grassCoverageView, THREE = await import('three');
            if (pose !== 'rear') view.setCamera(pose);
            else {
                const p = view.grass.getSnapshot().placement;
                view.controls.setLookAt({ position: new THREE.Vector3((p.minX + p.maxX) / 2, 4.5, p.maxZ + 2),
                    target: new THREE.Vector3((p.minX + p.maxX) / 2, 4.5 - Math.tan(13.586 * Math.PI / 180) * 20, p.maxZ - 18) });
            }
            view.camera.updateMatrixWorld(true);
        }, pose);
        for (const mode of ['LOD2', 'LOD3', 'LOD4']) {
            const state = await page.evaluate(async mode => {
                const view = window.__grassCoverageView; view.grass.setMode(mode);
                await view.renderer.compileAsync(view.scene, view.camera);
                view.lighting.render(0); await new Promise(requestAnimationFrame); view.lighting.render(0);
                return view.getSnapshot();
            }, mode);
            const layers = await page.evaluate(() => {
                const fields = window.__grassCoverageFields; let ground = 0, base = 0;
                fields.group.traverseVisible(mesh => { if (mesh.isInstancedMesh) {
                    if (mesh.userData.grassTransitionGround) ground += mesh.count;
                    if (mesh.userData.grassCardBase) base += mesh.count;
                } });
                return { ground, base, count: fields.cells.length, enabled: fields.getSnapshot().cardBase.enabled };
            });
            const usesBase = mode !== 'LOD2' && layers.enabled;
            expect(layers.base).toBe(usesBase ? layers.count : 0);
            expect(layers.ground).toBe(usesBase ? 0 : layers.count);
            const color = await page.locator('[data-study-canvas]').screenshot({ path: `${output}/${pose}-${mode}.png` });
            await page.evaluate(async () => {
                const view = window.__grassCoverageView; window.__grassCoverageMask(true);
                await view.renderer.compileAsync(view.scene, view.camera); view.renderer.render(view.scene, view.camera);
            });
            const mask = await page.locator('[data-study-canvas]').screenshot({ path: `${output}/${pose}-${mode}-mask.png` });
            const metrics = await page.evaluate(async ({ color, mask }) => {
                const view = window.__grassCoverageView;
                const read = async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
                    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
                    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
                    return { width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data }; };
                const rgb = await read(color), leaf = await read(mask), camera = view.camera;
                const m = camera.matrixWorld.elements, tangent = Math.tan(camera.fov * Math.PI / 360), bounds = view.grass.getSnapshot().placements;
                const bands = [[2,8],[8,16],[16,32],[32,64]].map(([near,far]) => ({near,far,count:0,leaf:0,rgb:[0,0,0],blocks:new Map()}));
                for (let y=0;y<leaf.height;y+=2) for (let x=0;x<leaf.width;x+=2) {
                    const vx=(2*(x+.5)/leaf.width-1)*tangent*camera.aspect, vy=(1-2*(y+.5)/leaf.height)*tangent;
                    const dx=m[0]*vx+m[4]*vy-m[8], dy=m[1]*vx+m[5]*vy-m[9], dz=m[2]*vx+m[6]*vy-m[10], t=(.07-camera.position.y)/dy;
                    if(t<=0) continue;
                    const wx=camera.position.x+dx*t,wz=camera.position.z+dz*t,d=Math.hypot(dx,dz)*t;
                    if(!bounds.some(p=>wx>p.minX+.5&&wx<p.maxX-.5&&wz>p.minZ+.5&&wz<p.maxZ-.5)) continue;
                    const band=bands.find(b=>d>=b.near&&d<b.far); if(!band) continue;
                    const i=(y*leaf.width+x)*4,a=leaf.pixels[i]/255;
                    band.count++; band.leaf+=a; for(let k=0;k<3;k++) band.rgb[k]+=rgb.pixels[i+k]*a;
                    const key=`${Math.floor(wx*4)}:${Math.floor(wz*4)}`, block=band.blocks.get(key)||[0,0]; block[0]++;block[1]+=a;band.blocks.set(key,block);
                }
                return bands.filter(b=>b.count>100).map(b=>{ const blocks=[...b.blocks.values()].filter(v=>v[0]>=8).map(v=>v[1]/v[0]).sort((a,b)=>a-b);
                    return {near:b.near,far:b.far,samples:b.count,coverage:b.leaf/b.count,leafRgb:b.rgb.map(v=>v/b.leaf),
                        blockMeters:.25,blockCount:blocks.length,lowDecile:blocks[Math.floor(blocks.length*.1)],lowBlocks:blocks.filter(v=>v<.5).length/blocks.length}; });
            }, {color:color.toString('base64'),mask:mask.toString('base64')});
            await page.evaluate(() => window.__grassCoverageMask(false));
            rows.push({pose,mode,metrics,triangles:state.grass.triangles});
        }
        await page.evaluate(() => { const view = window.__grassCoverageView; view.grass.setMode('AUTO'); view.lighting.render(0); });
        await page.locator('[data-study-canvas]').screenshot({ path: `${output}/${pose}-AUTO.png` });
        if (process.env.GRASS_CARD_PERF) performance.push({pose, ...await page.evaluate(measureGrassCardHybrid)});
    }
    const boundaries = process.env.GRASS_CARD_BOUNDARIES ? await captureGrassCardBoundaries(page, output) : [];
    const motion = await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__grassCoverageView, fields = window.__grassCoverageFields;
        view.setCamera('grass'); view.grass.setMode('AUTO');
        const origin = view.camera.position.clone(), direction = view.camera.getWorldDirection(new THREE.Vector3());
        const samples = [];
        for (let step = 0; step <= 30; step++) {
            const position = origin.clone().addScaledVector(new THREE.Vector3(direction.x, 0, direction.z).normalize(), step * .2);
            view.controls.setLookAt({ position, target: position.clone().add(direction) });
            view.camera.updateMatrixWorld(true); view.grass.update(position, performance.now() + step * 60, true);
            await view.renderer.compileAsync(view.scene, view.camera); view.lighting.render(0);
            const state = fields.getSnapshot();
            samples.push({ triangles: state.triangles, blended: state.blendCandidateCells, boundaryBatches: state.cardBoundaryBatches });
        }
        return samples;
    });
    expect(motion.every(frame => frame.triangles > 0 && frame.blended > 0)).toBe(true);
    await page.locator('[data-study-canvas]').screenshot({ path: `${output}/motion-end.png` });
    await writeFile(`${output}/coverage.json`,JSON.stringify({metadata,rows,performance,boundaries,motion,errors},null,2));
    expect(errors).toEqual([]);
    if (!process.env.GRASS_CARD_CODE_BASELINE) for (const edge of boundaries) expect(edge.outsidePixels, JSON.stringify(edge)).toBe(0);
    if(trial==='final') for(const pose of poses) {
        const reference=rows.find(r=>r.pose===pose&&r.mode==='LOD2').metrics;
        for(const row of rows.filter(r=>r.pose===pose&&r.mode!=='LOD2')) for(const band of row.metrics) {
            // Compare each representation in its actual production range.
            if (row.mode === 'LOD3' ? band.near >= 16 : band.near !== 16) continue;
            const match=reference.find(b=>b.near===band.near);
            expect(band.coverage,`${pose}/${row.mode}/${band.near}m`).toBeGreaterThan(match.coverage*.89);
        }
    }
});
