// Checks preparation against ordinary rendering and camera changes without altering quality.
import { test, expect } from '@playwright/test';

test('Shared image residency respects source versions, sampler differences and disposal', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const {TextureResidency}=await import('/src/graphics/visuals/preparation/TextureResidency.js');
        const {canStageImageTexture}=await import('/src/graphics/visuals/preparation/StagedImageTexture.js');
        const renderer = new T.WebGLRenderer(), residency = new TextureResidency(renderer);
        const image=document.createElement('canvas'); image.width=image.height=8;
        const first=new T.CanvasTexture(image), alias=first.clone();
        renderer.initTexture(first); residency.remember(first,true);
        const shared=residency.ready(alias);
        alias.wrapS=T.RepeatWrapping; alias.needsUpdate=true;
        const changedSampler=residency.ready(alias);
        renderer.initTexture(alias); residency.remember(alias);
        first.needsUpdate=true;
        const changedPixels=residency.ready(alias);
        renderer.initTexture(first); residency.remember(first);
        const canvasStageable=canStageImageTexture(first);
        first.dispose();
        const disposed=residency.ready(first);
        alias.dispose(); renderer.dispose();
        return {shared,changedSampler,changedPixels,disposed,canvasStageable};
    });
    expect(result).toEqual({shared:true,changedSampler:false,changedPixels:false,disposed:false,canvasStageable:false});
});

test('Nearby preparation warms shared borrowed geometry with bounded work and safe lifecycle', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { NearbyGpuPreparation } = await import('/src/graphics/visuals/preparation/NearbyGpuPreparation.js');
        const renderer = new T.WebGLRenderer(); renderer.setSize(32, 32);
        const originalDraw = renderer.renderBufferDirect;
        const preparation = new NearbyGpuPreparation(renderer);
        const scene = new T.Scene(), group = new T.Group(); scene.add(group);
        const city = { group }, camera = new T.PerspectiveCamera(55, 1, .1, 1000);
        camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0);
        const geometry = new T.BoxGeometry(1, 1, 1), material = new T.MeshBasicMaterial({color:0x987654});
        let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
        for (let i = 0; i < 4; i++) { const mesh = new T.Mesh(geometry, material); mesh.position.x = 30 + i; group.add(mesh); }
        scene.updateMatrixWorld(true); preparation.syncCity(city);
        for (let i = 0; i < 30; i++) {
            renderer.render(scene, camera);
            const calls = renderer.info.render.calls;
            preparation.update(city, camera, {elapsedMs:0, ready:true});
            if (calls !== renderer.info.render.calls) throw new Error('Preparation polluted visible draw statistics');
            await new Promise(requestAnimationFrame);
        }
        const before = preparation.diagnostics();
        camera.position.set(32,0,5); camera.lookAt(32,0,0); renderer.render(scene,camera);
        const after = preparation.diagnostics();
        preparation.update(city,camera,{elapsedMs:100,ready:true});
        const heavyFrame = preparation.frame.steps;
        const loss=renderer.getContext().getExtension('WEBGL_lose_context');
        const lost=new Promise(resolve=>renderer.domElement.addEventListener('webglcontextlost',resolve,{once:true}));
        loss.loseContext(); await lost;
        const cancelledOnLoss=preparation.queue.jobs.size===0 && preparation.city===null;
        const restoredEvent=new Promise(resolve=>renderer.domElement.addEventListener('webglcontextrestored',resolve,{once:true}));
        await new Promise(resolve=>setTimeout(resolve,100)); loss.restoreContext(); await restoredEvent;
        preparation.syncCity(city); renderer.render(scene,camera);
        const restoredCalls=renderer.info.render.calls;
        preparation.reset(null); const reset = preparation.diagnostics(); preparation.dispose();
        const restored = renderer.renderBufferDirect === originalDraw;
        const borrowedAlive = disposed === 0; renderer.render(scene,camera);
        geometry.dispose(); material.dispose(); renderer.dispose();
        return {before,after,heavyFrame,reset,restored,borrowedAlive,cancelledOnLoss,restoredCalls};
    });
    expect(result.before.geometries).toBe(1);
    expect(result.before.extraBytes).toBeGreaterThan(0);
    expect(result.after.extraBytes).toBe(0);
    expect(result.heavyFrame).toBe(0);
    expect(result.reset.frame.pending).toBeLessThanOrEqual(128);
    expect(result).toMatchObject({restored:true,borrowedAlive:true,cancelledOnLoss:true});
    expect(result.restoredCalls).toBeGreaterThan(0);
});

test('Prepared geometry still uploads edits on its very next visible draw', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const pixel = await page.evaluate(async () => {
        const T = await import('three');
        const { NearbyGpuPreparation } = await import('/src/graphics/visuals/preparation/NearbyGpuPreparation.js');
        const renderer = new T.WebGLRenderer(), prep = new NearbyGpuPreparation(renderer);
        const scene = new T.Scene(), group = new T.Group(); scene.add(group);
        const camera = new T.PerspectiveCamera(55, 1, .1, 100); camera.position.z = 5;
        const geometry = new T.PlaneGeometry(2, 2); geometry.translate(30, 0, 0);
        const material = new T.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new T.Mesh(geometry, material); mesh.frustumCulled = false; group.add(mesh);
        scene.updateMatrixWorld(true); const city = { group };
        for (let i = 0; i < 100 && !prep.diagnostics().geometries; i++) {
            prep.update(city, camera, { elapsedMs: 0, ready: true }); await new Promise(requestAnimationFrame);
        }
        if (!prep.diagnostics().geometries) throw new Error('No preparation happened');
        geometry.translate(-30, 0, 0);
        const target = new T.WebGLRenderTarget(16, 16); renderer.setRenderTarget(target); renderer.render(scene, camera);
        const pixel = new Uint8Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel);
        prep.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose();
        return [...pixel];
    });
    expect(pixel).toEqual([255, 0, 0, 255]);
});

test('Bloom preparation warms real dependencies incrementally and survives resize', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off&sunBloom=1&sunBloomRays=0&grade=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { SunBloomRig } = await import('/src/graphics/visuals/sun/SunBloomRig.js');
        const engine = window.__testHooks.getEngine(); engine.clearScene();
        const sun = {direction:new T.Vector3(0,0,-1)}, rig = new SunBloomRig({sun,settings:engine.sunBloomSettings});
        const group = new T.Group(); engine.scene.add(group,rig.group);
        const city = {group,sunRef:sun,sunBloom:rig}; engine.context.city = city;
        // Within the preparation margin, but outside the visible camera frustum.
        engine.camera.position.set(0,0,0); engine.camera.lookAt(1.3,0,-1); engine.camera.updateMatrixWorld(true);
        const prep=engine._nearbyGpuPreparation;
        for(let i=0;i<100;i++) { prep.update(city,engine.camera,{elapsedMs:0,ready:true,pipeline:engine._post.pipeline,scene:engine.scene}); await new Promise(requestAnimationFrame); }
        const initial=prep.diagnostics(), programs=engine.renderer.info.programs.length;
        engine.camera.lookAt(0,0,-1); engine.renderFrame();
        const addedPrograms=engine.renderer.info.programs.length-programs;
        const bloom=engine.getSunBloomDebugInfo().occlusionFiltering;
        engine._post.pipeline.setSize(320,200);
        for(let i=0;i<60;i++) { prep.update(city,engine.camera,{elapsedMs:0,ready:true,pipeline:engine._post.pipeline,scene:engine.scene}); await new Promise(requestAnimationFrame); }
        engine.renderFrame();
        const final=prep.diagnostics(), error=engine.renderer.getContext().getError();
        engine.context.city=null; prep.reset(null); rig.dispose();
        return {initial,final,addedPrograms,bloom,error};
    });
    expect(result.initial.bloom.targets).toBe(13);
    expect(result.initial.bloom.programs).toBeGreaterThanOrEqual(9);
    expect(result.initial.failures).toBe(0);
    expect(result.final.failures).toBe(0);
    expect(result.final.bloom.targets).toBeGreaterThan(13);
    expect(result.error).toBe(0);
    expect(result.bloom.rendered).toBe(true);
    expect(result.addedPrograms).toBeLessThanOrEqual(2);
});

test('Private image staging preserves pixels, mipmaps and visible misses', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { createStagedImageTexture } = await import('/src/graphics/visuals/preparation/StagedImageTexture.js');
        const renderer = new T.WebGLRenderer(); renderer.setSize(64, 64);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            ctx.fillStyle = `rgba(${x * 4},${y * 4},${(x + y) * 2},${.25 + ((x + y) % 4) * .25})`;
            ctx.fillRect(x, y, 1, 1);
        }
        const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10);
        camera.position.z = 2;
        const material = new T.MeshBasicMaterial({ toneMapped: false });
        const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material); scene.add(mesh);
        const target = new T.WebGLRenderTarget(64, 64);
        const read = texture => {
            material.map = texture; material.needsUpdate = true;
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
            return pixels;
        };
        const delta = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
        const cases = [], tasks = [];
        for (const colorSpace of [T.SRGBColorSpace, T.NoColorSpace, T.LinearSRGBColorSpace]) {
            for (const flipY of [false, true]) for (const premultiplyAlpha of [false, true]) {
                const ordinary = new T.CanvasTexture(canvas), prepared = new T.CanvasTexture(canvas);
                for (const texture of [ordinary, prepared]) Object.assign(texture, { colorSpace, flipY, premultiplyAlpha });
                const expected = read(ordinary);
                let completed = 0, maximumBytes = 0;
                const work = createStagedImageTexture(renderer, prepared, () => completed++); tasks.push(work);
                for (let step = 0; step < 1000; step++) {
                    const part = work.step(1024); maximumBytes = Math.max(maximumBytes, part.bytes || 0);
                    if (part.done) break;
                    await new Promise(requestAnimationFrame);
                }
                const actual = read(prepared);
                mesh.scale.setScalar(.125); const mipDelta = delta(read(ordinary), read(prepared)); mesh.scale.setScalar(1);
                cases.push({ colorSpace, flipY, premultiplyAlpha, completed, maximumBytes, delta: delta(expected, actual), mipDelta });
                work.cancel(); ordinary.dispose(); prepared.dispose();
            }
        }
        for (const file of ['basecolor.jpg','arm.png','normal_gl.png']) {
            const image = new Image(); image.src = '/assets/public/pbr/rustic_stone_wall_02/' + file; await image.decode();
            const ordinary = new T.Texture(image), prepared = new T.Texture(image);
            ordinary.colorSpace = prepared.colorSpace = file === 'basecolor.jpg' ? T.SRGBColorSpace : T.NoColorSpace;
            ordinary.needsUpdate = true; prepared.needsUpdate = true;
            const expected = read(ordinary); let completed = 0;
            const work = createStagedImageTexture(renderer, prepared, () => completed++);
            for (let i = 0; i < 500; i++) { if (work.step(256*1024).done) break; await new Promise(requestAnimationFrame); }
            const difference = delta(expected,read(prepared));
            cases.push({file,completed,delta:difference,mipDelta:difference,maximumBytes:1024});
            work.cancel(); ordinary.dispose(); prepared.dispose();
        }
        const ordinary = new T.CanvasTexture(canvas), missed = new T.CanvasTexture(canvas);
        const missExpected = read(ordinary), missWork = createStagedImageTexture(renderer, missed, () => { throw new Error('Partial texture published'); });
        missWork.step(1024); missWork.step(1024);
        await new Promise(requestAnimationFrame); missWork.step(1024);
        const missDelta = delta(missExpected, read(missed)), missedDone = missWork.step(1024).done;
        missWork.cancel(); missed.dispose(); ordinary.dispose();
        const cancelled = new T.CanvasTexture(canvas), cancelWork = createStagedImageTexture(renderer, cancelled, () => { throw new Error('Cancelled texture published'); });
        cancelWork.step(1024); cancelWork.step(1024); cancelled.dispose();
        await new Promise(requestAnimationFrame);
        const cancelledDone = cancelWork.step(1024).done;
        const stale = new T.CanvasTexture(canvas), staleWork = createStagedImageTexture(renderer, stale, () => { throw new Error('Stale texture published'); });
        staleWork.step(1024); stale.needsUpdate = true;
        const staleDone = staleWork.step(1024).done; staleWork.cancel(); stale.dispose();
        const error = renderer.getContext().getError();
        mesh.geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose();
        return { cases, missDelta, missedDone, cancelledDone, staleDone, error };
    });
    expect(result).toMatchObject({ missDelta: 0, missedDone: true, cancelledDone: true, staleDone: true, error: 0 });
    for (const item of result.cases) {
        expect(item.completed, JSON.stringify(item)).toBe(1);
        // Browser ImageBitmap alpha unpremultiplication can round an 8-bit channel by one unit.
        expect(item.delta, JSON.stringify(item)).toBeLessThanOrEqual(1);
        expect(item.mipDelta, JSON.stringify(item)).toBeLessThanOrEqual(1);
        expect(item.maximumBytes).toBeLessThanOrEqual(1024);
    }
});

test('Sun bloom uses the final render camera after world updates and direct pose restores', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off&sunBloom=1&sunBloomRays=0&grade=off');
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { SunBloomRig } = await import('/src/graphics/visuals/sun/SunBloomRig.js');
        const engine = window.__testHooks.getEngine();
        engine.clearScene();
        const direction = new T.Vector3(0, 0, -1);
        const rig = new SunBloomRig({ sun: { direction }, settings: engine.sunBloomSettings });
        engine.scene.add(rig.group);
        engine.context.city = { sunBloom: rig };
        engine.camera.position.set(0, 0, 0); engine.camera.lookAt(0, 0, -1);
        rig.update(engine);
        engine.camera.position.set(4, 2, 3); engine.camera.lookAt(4, 2, 4);
        engine.renderFrame();
        const aligned = rig._mesh.quaternion.angleTo(engine.camera.quaternion) < 1e-7;
        const position = rig._mesh.position.clone().sub(engine.camera.position).normalize().distanceTo(direction);
        const offscreen = engine.getSunBloomDebugInfo().occlusionFiltering.outcome;
        engine.camera.lookAt(4, 2, 2); engine.renderFrame();
        const onscreen = engine.getSunBloomDebugInfo().occlusionFiltering;
        engine.context.city = null; rig.dispose();
        return { aligned, position, offscreen, onscreen: onscreen.outcome, rendered: onscreen.rendered };
    });
    expect(result).toMatchObject({ aligned: true, offscreen: 'irrelevant', onscreen: 'clear', rendered: true });
    expect(result.position).toBeLessThan(1e-7);
});
