// Isolate distance-driven grass changes from perspective motion at the reported seam poses.
// The 0.267 m uniform step represents one 30 Hz frame at 8 m/s; pixel sensitivity is not perceptual proof.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/motion_seam';
test.use({ viewport: { width: 1440, height: 1048 }, deviceScaleFactor: 1, video: 'off' });

test('Isolate shortening, ground blending and incoming dissolve at the reported camera poses', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [], results = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => { window.__seam = { dynamic: { value: { x: 0, y: 0, z: 0 } }, fixed: { value: { x: 0, y: 0, z: 0 } }, height: { value: 0 }, ground: { value: 0 }, uniforms: [] }; });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassPatchMaterials.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        expect(source).toContain('grassPatchCamera: camera,');
        await route.fulfill({ response, body: source.replace('grassPatchCamera: camera,',
            'grassPatchCamera: window.__seam.dynamic, seamFixedCamera: window.__seam.fixed, seamFreezeHeight: window.__seam.height, seamFreezeGround: window.__seam.ground,')
            .replace('attachShaderMetadata(material, grassPatchShader);', 'window.__seam.uniforms.push(uniforms);\nattachShaderMetadata(material, grassPatchShader);') });
    });
    for (const stage of ['vert', 'frag']) await page.route(`**/grass_patch.${stage}.glsl*`, async route => {
        const response = await route.fetch();
        let source = (await response.text()).replace('// @section pars', '// @section pars\nuniform vec3 seamFixedCamera;\nuniform float seamFreezeHeight;\nuniform float seamFreezeGround;');
        if (stage === 'vert') source = source
            .replace('grassPatchGroundY, grassRiseWorld.y), grassPatchCamera)',
            'grassPatchGroundY, grassRiseWorld.y), seamFreezeHeight > 0.5 ? seamFixedCamera : grassPatchCamera)');
        else source = source.replace('grassPatchGroundY, grassPatchGround.y), grassPatchCamera)) : 0.0;',
            'grassPatchGroundY, grassPatchGround.y), seamFreezeGround > 0.5 ? seamFixedCamera : grassPatchCamera)) : 0.0;');
        await route.fulfill({ response, body: source });
    });
    await mkdir(output, { recursive: true });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=patches&handoff=shorten');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    for (const pose of [{ name: 'bus', position: [-12.668, 6.883, -1.296] }, { name: 'high', position: [-12.668, 10.654, 34.478] }]) {
        const result = await page.evaluate(async pose => {
            const THREE = await import('three'), view = window.__grassTestView, state = window.__seam;
            view.renderer.setAnimationLoop(null); view.controls.enabled = false; view.keyboard.clear();
            const { camera, renderer, grass } = view, gl = renderer.getContext();
            camera.position.fromArray(pose.position); camera.rotation.set(THREE.MathUtils.degToRad(-19.206), Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
            Object.assign(state.fixed.value, camera.position);
            const width = renderer.domElement.width, height = renderer.domElement.height, samples = [], captures = {};
            const pixels = () => { const result = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result); return result; };
            let offset = 0;
            const draw = () => { state.dynamic.value = { x: camera.position.x, y: camera.position.y, z: camera.position.z + offset }; view.render(performance.now()); };
            const bands = new Int8Array(width * height).fill(-1), point = new THREE.Vector3();
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, .5).unproject(camera).sub(camera.position);
                if (point.y >= 0) continue;
                point.multiplyScalar(-camera.position.y / point.y).add(camera.position);
                const bin = Math.floor((point.distanceTo(camera.position) - 12) / .5);
                if (bin >= 0 && bin < 32 && Math.abs(point.x - camera.position.x) < 6 && grass.coverage.sample(point.x, point.z)) bands[y * width + x] = bin;
            }
            try {
                for (const [name, heightFrozen, groundFrozen, mode] of [
                    ['normal', 0, 0, 'AUTO'], ['height-frozen', 1, 0, 'AUTO'], ['ground-frozen', 0, 1, 'AUTO'], ['both-frozen', 1, 1, 'AUTO'],
                    ['forced-lod4', 0, 0, 'LOD4'], ['forced-lod5', 0, 0, 'LOD5']
                ]) {
                    state.height.value = heightFrozen; state.ground.value = groundFrozen; grass.setMode(mode);
                    offset = -.133333; draw(); const before = pixels();
                    offset = .133333; draw(); const after = pixels();
                    const bins = Array.from({ length: 32 }, (_, index) => ({ distance: 12 + index * .5, count: 0, change: 0, brightness: 0, changed: 0 }));
                    const delta = new Uint8ClampedArray(before.length);
                    for (let i = 0; i < bands.length; i++) {
                        const j = i * 4, difference = Math.abs(before[j] - after[j]) * .2126 + Math.abs(before[j + 1] - after[j + 1]) * .7152 + Math.abs(before[j + 2] - after[j + 2]) * .0722;
                        if (bands[i] >= 0) { const bin = bins[bands[i]]; bin.count++; bin.change += difference; bin.brightness += .2126 * before[j] + .7152 * before[j + 1] + .0722 * before[j + 2]; bin.changed += Number(difference > 4); }
                        const dest = ((height - 1 - Math.floor(i / width)) * width + i % width) * 4;
                        delta[dest] = delta[dest + 1] = delta[dest + 2] = Math.min(255, difference * 12); delta[dest + 3] = 255;
                    }
                    for (const bin of bins) { bin.relative = bin.change / bin.brightness; bin.changed /= bin.count; }
                    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').putImageData(new ImageData(delta, width, height), 0, 0);
                    captures[name + '-delta'] = canvas.toDataURL('image/png');
                    offset = 0; draw(); captures[name] = renderer.domElement.toDataURL('image/png');
                    const middle = pixels(); bins.forEach(bin => { bin.mean = 0; });
                    for (let i = 0; i < bands.length; i++) if (bands[i] >= 0) bins[bands[i]].mean += .2126 * middle[i * 4] + .7152 * middle[i * 4 + 1] + .0722 * middle[i * 4 + 2];
                    bins.forEach(bin => { bin.mean /= bin.count; });
                    samples.push({ name, bins });
                }
            } finally { offset = 0; }
            return { pose, samples, captures, uniformCount: state.uniforms.length, glError: gl.getError() };
        }, pose);
        for (const [name, image] of Object.entries(result.captures)) await writeFile(`${output}/${pose.name}-${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
        delete result.captures; results.push(result);
        await writeFile(`${output}/isolation.json`, JSON.stringify({ results, errors }, null, 2));
        expect(result.glError).toBe(0);
        expect(result.uniformCount).toBe(6);
        expect(result.samples.find(sample => sample.name === 'normal').bins.reduce((sum, bin) => sum + bin.change, 0)).toBeGreaterThan(1000);
        expect(result.samples.find(sample => sample.name === 'forced-lod4').bins.every(bin => bin.change === 0)).toBe(true);
        const moving = result.samples.find(sample => sample.name === 'normal').bins.filter(bin => bin.distance >= 16 && bin.distance < 24);
        expect(Math.max(...moving.map(bin => bin.relative)), `${pose.name}: concentrated moving transition`).toBeLessThan(.06);
    }
    await writeFile(`${output}/isolation.json`, JSON.stringify({ results, errors }, null, 2));
    expect(errors).toEqual([]);
});
