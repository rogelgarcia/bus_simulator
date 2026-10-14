// Sweep geometric exit curves against matched endpoint LODs before choosing lab settings.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/transition_calibration';
test('Calibrate geometric height and ground appearance from matched bus-camera views', async ({ page }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/GrassPatchMaterials.js', async route => {
        const response = await route.fetch();
        const body = (await response.text())
            .replace('grassPatchCamera: camera,', 'grassPatchCamera: camera, grassPatchCurveBias: window.__grassSweep.bias, grassPatchCompress: window.__grassSweep.compress,')
            .replace('grassPatchHeightBand: { value: new THREE.Vector2(distances[3], distances[4]) }', 'grassPatchHeightBand: window.__grassSweep.height')
            .replace(/grassPatchHandoffBand: \{ value: new THREE.Vector2\(distances\[3\], .*?\) \}/, 'grassPatchHandoffBand: window.__grassSweep.ground');
        await route.fulfill({ response, body });
    });
    await page.route('**/grass_patch.frag.glsl*', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace('uniform float grassPatchBladeHeight;', 'uniform float grassPatchBladeHeight;\nuniform float grassPatchCurveBias;')
            .replace('float grassPatchCeiling = grassPatchBladeHeight * (1.0 - smoothstep(grassPatchHeightBand.x, grassPatchHeightBand.y, grassPatchDistance));',
                'float t = clamp((grassPatchDistance - grassPatchHeightBand.x) / (grassPatchHeightBand.y - grassPatchHeightBand.x), 0.0, 1.0);\n' +
                'float grassPatchCeiling = grassPatchBladeHeight * (1.0 - smoothstep(0.0, 1.0, t + grassPatchCurveBias * t * (1.0 - t)));');
        await route.fulfill({ response, body });
    });
    await page.route('**/grass_patch.vert.glsl*', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace('uniform float grassPatchBladeHeight;', 'uniform float grassPatchBladeHeight;\nuniform float grassPatchCurveBias;\nuniform float grassPatchCompress;')
            .replace('transformed.y -= grassPatchBladeHeight * smoothstep(grassPatchHeightBand.x, grassPatchHeightBand.y, grassRiseDistance);',
                'float t = clamp((grassRiseDistance - grassPatchHeightBand.x) / (grassPatchHeightBand.y - grassPatchHeightBand.x), 0.0, 1.0);\n' +
                'float q = smoothstep(0.0, 1.0, t + grassPatchCurveBias * t * (1.0 - t));\n' +
                'transformed.y = mix(transformed.y - grassPatchBladeHeight * q, transformed.y * (1.0 - q), grassPatchCompress);');
        await route.fulfill({ response, body });
    });
    await page.goto('/tests/headless/harness/index.html');
    await page.evaluate(async () => {
        const THREE = await import('three');
        window.__grassSweep = { bias: { value: 0 }, compress: { value: 0 }, height: { value: new THREE.Vector2(16, 24) }, ground: { value: new THREE.Vector2(16, 21.6) } };
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        const width = 960, height = 640;
        renderer.setSize(width, height); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer }), bounds = { minX: -24, maxX: 24, minZ: -24, maxZ: 72 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -24, z: -24 }, { x: 24, z: -24 }, { x: 24, z: 72 }, { x: -24, z: 72 }], exclusions: [], resolution: 256 });
        const variants = Object.fromEntries(['trim', 'rise'].map(terminalTransition => [terminalTransition, createGrassPatchRenderer({ asset, coverage, bounds, terminalTransition })]));
        const scene = new THREE.Scene(); Object.values(variants).forEach(grass => scene.add(grass.group));
        const camera = new THREE.PerspectiveCamera(55, width / height, .1, 150), gl = renderer.getContext();
        const poses = [['bus', 6.883, -8, .34836, 0], ['close', 4.5, -8, .5, 0], ['forward', 6.883, 4, .34836, 0],
            ['lower', 3.5, -8, .34836, 0], ['reverse', 6.883, 24, .34836, Math.PI], ['diagonal', 6.883, -8, .34836, .65]];
        const data = [];
        function poseCamera(pose) {
            const [, elevation, z, tilt, yaw] = pose;
            camera.position.set(0, elevation, z); camera.lookAt(Math.sin(yaw) * 20, elevation - tilt * 20, z + Math.cos(yaw) * 20); camera.updateMatrixWorld(true);
        }
        function draw(variant, mode) {
            for (const [name, grass] of Object.entries(variants)) grass.group.visible = name === variant;
            const grass = variants[variant]; grass.setMode(mode); grass.update(camera); renderer.render(scene, camera);
            const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
        }
        function measure(pixels, indices) {
            const bins = Array.from({ length: 28 }, (_, i) => ({ distance: 12 + i * .5, n: 0, mean: 0, square: 0 }));
            for (let i = 0; i < indices.length; i++) {
                const index = indices[i]; if (index < 0) continue;
                const p = i * 4, luma = .2126 * pixels[p] + .7152 * pixels[p + 1] + .0722 * pixels[p + 2];
                const bin = bins[index]; bin.n++; bin.mean += luma; bin.square += luma * luma;
            }
            return bins.map(bin => ({ distance: bin.distance, n: bin.n, mean: bin.mean / bin.n, sd: Math.sqrt(Math.max(0, bin.square / bin.n - (bin.mean / bin.n) ** 2)) }));
        }
        for (const pose of poses) {
            poseCamera(pose);
            const indices = new Int16Array(width * height).fill(-1), point = new THREE.Vector3();
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, .5).unproject(camera).sub(camera.position);
                if (point.y >= 0) continue;
                point.multiplyScalar((.005 - camera.position.y) / point.y).add(camera.position);
                const distance = point.distanceTo(camera.position), bin = Math.floor((distance - 12) / .5);
                const side = point.x * Math.cos(pose[4]) - (point.z - pose[2]) * Math.sin(pose[4]);
                if (bin < 0 || bin >= 28 || Math.abs(side) > 6 || point.x < -22 || point.x > 22 || point.z < -22 || point.z > 70) continue;
                indices[y * width + x] = bin;
            }
            data.push({ pose, indices, LOD4: measure(draw('trim', 'LOD4'), indices), LOD5: measure(draw('trim', 'LOD5'), indices) });
        }
        window.__calibrate = config => {
            window.__grassSweep.bias.value = config.bias;
            window.__grassSweep.compress.value = config.variant === 'shorten' ? 1 : 0;
            window.__grassSweep.height.value.set(config.cutStart ?? 16, 24);
            window.__grassSweep.ground.value.set(config.groundStart, config.groundEnd);
            const result = [];
            for (const row of data) {
                poseCamera(row.pose);
                const measured = measure(draw(config.variant === 'shorten' ? 'rise' : config.variant ?? 'trim', 'AUTO'), row.indices);
                result.push({ name: row.pose[0], bins: measured.map((bin, i) => ({ ...bin, LOD4: row.LOD4[i].mean, LOD5: row.LOD5[i].mean,
                    contrast4: row.LOD4[i].sd, contrast5: row.LOD5[i].sd })) });
            }
            return { ...config, poses: result, glError: gl.getError() };
        };
        window.__capture = (config, poseName) => {
            window.__grassSweep.bias.value = config.bias; window.__grassSweep.height.value.set(config.cutStart ?? 16, 24);
            window.__grassSweep.compress.value = config.variant === 'shorten' ? 1 : 0;
            window.__grassSweep.ground.value.set(config.groundStart, config.groundEnd);
            poseCamera(data.find(row => row.pose[0] === poseName).pose); draw(config.variant === 'shorten' ? 'rise' : config.variant ?? 'trim', 'AUTO');
            return renderer.domElement.toDataURL('image/png');
        };
    });
    const configs = [{ id: 'original-trim', bias: 0, groundStart: 16, groundEnd: 21.6 }, { id: 'original-rise', variant: 'rise', bias: 0, groundStart: 16, groundEnd: 21.6 }];
    const refine = process.env.GRASS_TRANSITION_SWEEP === 'refine';
    for (const variant of (refine ? ['shorten'] : ['trim', 'rise', 'shorten']))
        for (const bias of (refine ? [-.45, -.3, -.15, 0] : [-.6, -.3, 0, .3, .6]))
            for (const groundStart of (refine ? [15, 16, 17, 18] : [14, 16, 18]))
                for (const groundEnd of (refine ? [22, 23, 24] : [20, 21.6, 24])) {
        configs.push({ id: `${variant}-${bias}-${groundStart}-${groundEnd}`, variant, bias, groundStart, groundEnd });
    }
    const results = [];
    for (const config of configs) {
        const row = await page.evaluate(config => window.__calibrate(config), config);
        let square = 0, count = 0, overshoot = 0, undershoot = 0, worstResidual = 0;
        for (const pose of row.poses) for (const bin of pose.bins.filter(bin => bin.distance >= 16 && bin.distance < 24)) {
            const t = (bin.distance + .25 - 16) / 8, fade = t * t * (3 - 2 * t), target = bin.LOD4 * (1 - fade) + bin.LOD5 * fade;
            const residual = bin.mean / target - 1;
            square += residual * residual; count++; worstResidual = Math.max(worstResidual, Math.abs(residual));
            overshoot = Math.max(overshoot, bin.mean / Math.max(bin.LOD4, bin.LOD5) - 1);
            undershoot = Math.max(undershoot, 1 - bin.mean / Math.min(bin.LOD4, bin.LOD5));
        }
        row.metrics = { rms: Math.sqrt(square / count), worstResidual, overshoot, undershoot };
        results.push(row);
        console.log(config.id, JSON.stringify(row.metrics));
        expect(row.glError).toBe(0);
    }
    results.sort((a, b) => a.metrics.rms - b.metrics.rms);
    await mkdir(output, { recursive: true });
    await writeFile(`${output}/${refine ? 'refine' : 'sweep'}.json`, JSON.stringify({ results, errors }, null, 2));
    for (const config of [...results.slice(0, 3), ...results.filter(row => row.id.startsWith('original'))]) for (const pose of ['bus', 'close', 'forward']) {
        const image = await page.evaluate(({ config, pose }) => window.__capture(config, pose), { config, pose });
        await writeFile(`${output}/${config.id}-${pose}.png`, Buffer.from(image.split(',')[1], 'base64'));
    }
    expect(errors).toEqual([]);
});
