// Profiles per-pass GPU work at repeatable poses around the low-rise district.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ viewport: { width: 1600, height: 760 }, video: 'off', trace: 'off' });

test('Calibrated route records GPU passes without changing baked lighting', async ({ page }) => {
    test.setTimeout(300_000);
    const output = `tests/artifacts/screens/calibrated_performance/${process.env.PERF_CAPTURE_NAME || 'route'}`;
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => {
        const b = window.__busSim?.engine?._bakedLighting;
        return b?.effectiveMode === 'baked' && !b.shouldHoldView();
    }, null, { timeout: 150_000 });
    console.log('Baked scene ready for route profiling');
    await page.evaluate(() => {
        const {engine: e, sm} = window.__busSim;
        sm.current.gameLoop.pause();
        sm.current._applyGameplayPoseCamera = () => {};
        const gl = e.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) throw new Error('GPU timer unavailable');
        const timer = e._gpuFrameTimer; e._gpuFrameTimer = null;
        const original = e.renderer.render, records = [], pending = [], restore = [];
        let label = 'main', recording = false, passIndex = 0;
        const phase = (object, method, name) => {
            const fn = object[method];
            object[method] = function (...args) { const previous = label; label = name;
                try { return fn.apply(this, args); } finally { label = previous; } };
            restore.push(() => object[method] = fn);
        };
        phase(e, '_prepareDynamicAo', 'dynamicAO');
        phase(e._illuminationPipeline, 'shadowPrepare', 'shadows');
        phase(e._post.pipeline, '_renderSunBloom', 'sunBloom');
        phase(e._post.pipeline, '_renderGlobalBloom', 'globalBloom');
        e.renderer.render = function (...args) {
            if (!recording) return original.apply(this, args);
            const q = gl.createQuery(), target = this.getRenderTarget();
            const record = { label, pass: passIndex++, target: target ? `${target.width}x${target.height}` : 'screen',
                scene: args[0].name || args[0].type, material: args[0].material?.type,
                beforeCalls: this.info.render.calls, t: performance.now() };
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            try { return original.apply(this, args); }
            finally { gl.endQuery(ext.TIME_ELAPSED_EXT); record.cpu = performance.now() - record.t;
                record.calls = this.info.autoReset ? this.info.render.calls : this.info.render.calls - record.beforeCalls;
                pending.push({q, record}); }
        };
        const frame = () => new Promise(requestAnimationFrame);
        const poll = () => {
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) throw new Error('Disjoint GPU samples');
            while (pending.length && gl.getQueryParameter(pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
                const {q,record} = pending.shift(); record.gpu = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
                gl.deleteQuery(q); records.push(record);
            }
        };
        window.routeGpu = { async capture(pose) {
            const s = sm.current, bus = s.busAnchor;
            bus.position.set(pose.x, 1.70357861618941, pose.z); bus.rotation.set(0, pose.yaw, 0); bus.updateMatrixWorld(true);
            const dx = Math.sin(pose.yaw), dz = Math.cos(pose.yaw);
            e.camera.position.set(pose.x - dx*22, 13, pose.z-dz*22);
            e.camera.lookAt(pose.x+dx*4, 2.7, pose.z+dz*4); e.camera.updateMatrixWorld(true);
            for (let i=0;i<90;i++) await frame();
            records.length = 0; recording = true;
            for (let i=0;i<90;i++) { await frame(); poll(); }
            recording = false;
            for (let i=0;i<10;i++) { await frame(); poll(); }
            return { pose: s._captureGameplayPose(), records: [...records], visibility: s.city.getStaticVisibilityStatus(),
                bloom: e.getSunBloomDebugInfo(), ao: e.getAmbientOcclusionDebugInfo(),
                programs: e.renderer.info.programs.length, mode: e._bakedLighting.effectiveMode,
                generation: e._bakedLighting.generation };
        }, finish() { recording = false; e.renderer.render = original; e._gpuFrameTimer = timer;
            restore.reverse().forEach(fn => fn()); for (const {q} of pending) gl.deleteQuery(q); } };
    });
    const poses = [
        {x:78,z:80,yaw:0}, {x:78,z:115,yaw:0}, {x:85,z:145,yaw:.35},
        {x:105,z:175,yaw:.6}, {x:140,z:114,yaw:Math.PI/2}, {x:180,z:160,yaw:0}
    ];
    const results = [];
    for (const [index, pose] of poses.entries()) {
        const data = await page.evaluate(pose => window.routeGpu.capture(pose), pose);
        results.push(data);
        await page.screenshot({path: `${output}/pose-${index}.png`});
        const grouped = {};
        for (const r of data.records) (grouped[`${r.label}:${r.target}:${r.scene}`] ??= []).push(r);
        const summary = Object.entries(grouped).map(([label, rs]) => ({label, n:rs.length,
            gpu: +(rs.reduce((s,r)=>s+r.gpu,0)/rs.length).toFixed(3),
            cpu: +(rs.reduce((s,r)=>s+r.cpu,0)/rs.length).toFixed(3), calls:rs[0].calls}));
        console.log(JSON.stringify({index,pose,summary,visibility:data.visibility}));
    }
    await page.evaluate(() => window.routeGpu.finish());
    await writeFile(`${output}/passes.json`, JSON.stringify(results));
    expect(errors).toEqual([]);
    expect(results.every(r => r.mode === 'baked')).toBe(true);
});
