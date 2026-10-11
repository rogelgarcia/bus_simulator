// Exercise cached LOD handoffs against freshly selected geometry at the same moving-camera pose.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass_debug_v2/blend_motion/' + (process.env.GRASS_BLEND_PHASE || 'after');
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('bus LOD bands stay smooth through cached and freshly rebuilt selections', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mkdir(output, { recursive: true });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__blendView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const settings = selection.getSnapshot();',
            'window.__blendTest = { fields, selection };\nconst settings = selection.getSnapshot();') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const settings = await page.evaluate(async () => {
        const view = window.__blendView, { selection, fields } = window.__blendTest;
        view.renderer.setAnimationLoop(null);
        const { GrassDebugV2TransitionSelection } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionSelection.js');
        const state = selection.getSnapshot();
        window.__blendTest.reference = new GrassDebugV2TransitionSelection({ cells: fields.cells, distances: state.distances, transitionFraction: state.transitionFraction });
        window.__blendTest.state = state;
        return state;
    });
    const poses = [];
    for (const pose of ['bus', 'overview', 'grass']) {
        poses.push(await page.evaluate(pose => {
            const view = window.__blendView;
            view.setCamera(pose); view.lighting.render(0);
            return { pose, grass: view.grass.getSnapshot(), draw: { ...view.renderer.info.render } };
        }, pose));
        await page.locator('#game-canvas').screenshot({ path: `${output}/${pose}.png` });
    }
    const samples = [];
    await page.evaluate(() => {
        const view = window.__blendView, { selection } = window.__blendTest;
        view.setCamera('grass'); window.__blendTest.origin = view.camera.position.clone();
        selection.resetMetrics(); view.grass.update(view.camera.position, 10000, true);
    });
    for (let frame = 1; frame <= 80; frame++) {
        const sample = await page.evaluate(frame => {
            const view = window.__blendView, { fields, selection, reference, origin } = window.__blendTest;
            view.camera.position.copy(origin); view.camera.position.z += frame * .15; view.camera.updateMatrixWorld(true);
            const now = 10000 + frame * 10;
            const cached = selection.update(view.camera.position, now);
            fields.applyLevels(cached.levels, cached.sideLeaves, cached.renderMasks);
            view.lighting.render(0);
            if (frame % 8) return null;
            const gl = view.renderer.getContext(), { width, height } = view.renderer.domElement;
            const a = new Uint8Array(width * height * 4), b = new Uint8Array(a.length);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, a);
            const fresh = reference.update(view.camera.position, now, { force: true });
            fields.applyLevels(fresh.levels, fresh.sideLeaves, fresh.renderMasks); view.lighting.render(0);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, b);
            let changed = 0, sum = 0, maximum = 0;
            for (let i = 0; i < a.length; i += 4) {
                const difference = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
                changed += Number(difference > 8); sum += difference; maximum = Math.max(maximum, difference);
            }
            fields.applyLevels(cached.levels, cached.sideLeaves, cached.renderMasks); view.lighting.render(0);
            return { frame, meters: frame * .15, changedFraction: changed / (width * height), meanDifference: sum / (width * height), maximum,
                selection: selection.getSnapshot(), draw: { ...view.renderer.info.render } };
        }, frame);
        if (sample) samples.push(sample);
        if (frame % 20 === 0) await page.locator('#game-canvas').screenshot({ path: `${output}/motion-${frame}.png` });
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ settings, poses, samples, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const sample of samples) expect(sample.changedFraction, `cache rebuild at ${sample.meters}m does not pop`).toBeLessThan(.001);
    expect(samples.at(-1).selection.scans).toBeLessThan(40);
    for (const band of settings.transitionBands.slice(2)) expect(band.end - band.start, `LOD${band.from}/${band.to} has at least one second at 3m/s`).toBeGreaterThanOrEqual(3);
    expect(settings.distances).toEqual([.6, .8, 20, 30, 40]);
});
