// Separate leaf color from ground coverage and measure the relief fade without camera motion.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.skip(true, 'Historical canopy-relief fade; current leaf lighting is verified by grass_debug_v2_lod3_bus.pwtest.js.');
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_relief_range');

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD3 keeps masked leaf lighting close to LOD4 and fades over a broad continuous range', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod3-relief-range-1&lod=LOD3');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const result = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const probe = { value: 0 }, distance = { value: -1 }, filter = { value: 1 };
        s.setFieldCount(1); s.setMode('all'); s.setLod('LOD4_1K'); s.setLod('LOD3'); s.lighting.render(0);
        for (const material of [s.canopy.materials.all, s.canopy.reliefMaterials.all]) {
            const relief = material.name.endsWith('-Relief');
            registerMaterialShaderHook(material, { id: 'grass.relief-color-probe', priority: 100,
                uniforms: { reliefProbe: probe, reliefProbeDistance: distance, reliefProbeFilter: filter },
                apply: shader => {
                    Object.assign(shader.uniforms, { reliefProbe: probe, reliefProbeDistance: distance, reliefProbeFilter: filter });
                    shader.fragmentShader = 'uniform float reliefProbe;\nuniform float reliefProbeFilter;\n' + shader.fragmentShader;
                    const anchor = 'diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor';
                    if (!shader.fragmentShader.includes(anchor)) throw Error('Relief color probe anchor changed');
                    shader.fragmentShader = shader.fragmentShader.replace(anchor,
                        'if(reliefProbe == 2.0){diffuseColor.rgb=max(diffuseColor.rgb-grassFloorSoilColor,vec3(0.0))/max(grassFloorLeafMask,0.001);grassFloorSoilColor=vec3(0.0);}\n' + anchor)
                        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif(reliefProbe == 1.0)gl_FragColor=vec4(grassFloorLeafMask,1.0-grassFloorLeafMask,0.0,1.0);\n'
                            + 'if(reliefProbe == 4.0)gl_FragColor=vec4(' + (relief ? '1.0' : '0.0') + ',0.0,0.0,1.0);')
                        .replace('grassCanopyUvDx *= max', 'if(reliefProbeFilter > 0.5) grassCanopyUvDx *= max')
                        .replace('grassCanopyUvDy *= max', 'if(reliefProbeFilter > 0.5) grassCanopyUvDy *= max');
                    if (relief) {
                        shader.vertexShader = 'uniform float reliefProbeDistance;\n' + shader.vertexShader;
                        shader.vertexShader = shader.vertexShader.replace('float grassReliefDistance = distance(cameraPosition, grassReliefWorldCenter);',
                            'float grassReliefDistance = reliefProbeDistance >= 0.0 ? reliefProbeDistance : distance(cameraPosition, grassReliefWorldCenter);');
                    }
                } });
        }
        s.scene.traverse(mesh => { if (mesh.isMesh && !mesh.userData.grassCanopy && !mesh.userData.grassCanopyRelief) mesh.visible = false; });
        s.scene.background = new THREE.Color(0);
        const width = 960, height = 540, target = new THREE.WebGLRenderTarget(width, height,
            { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace });
        s.renderer.toneMapping = THREE.NoToneMapping;
        const read = part => {
            probe.value = part; s.renderer.setRenderTarget(target); s.renderer.render(s.scene, s.camera);
            const raw = new Uint16Array(width * height * 4);
            s.renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);
            return Float32Array.from(raw, value => THREE.DataUtils.fromHalfFloat(value));
        };
        const setPose = (azimuth, elevation, meters) => {
            const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
            s.camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(meters);
            s.camera.lookAt(0, .1, 0); s.camera.updateMatrixWorld(true);
        };
        const summarize = (mask, color) => {
            const sections = Array.from({ length: 6 }, () => ({ grass: 0, ground: 0, pixels: 0, rgb: [0, 0, 0] }));
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4, leaf = mask[i], soil = mask[i + 1];
                if (leaf < 0 || soil < 0 || leaf + soil > 1.002 || mask[i + 2] > .002) throw Error('Material mask probe did not render normalized coverage');
                if (leaf + soil < .99) continue;
                const section = sections[Math.floor(y / (height / 2)) * 3 + Math.floor(x / (width / 3))];
                section.pixels++; section.grass += leaf; section.ground += soil;
                for (let k = 0; k < 3; k++) section.rgb[k] += color[i + k] * leaf;
            }
            return sections.map(s => ({ ...s, coverage: s.grass / Math.max(s.pixels, 1), rgb: s.rgb.map(v => v / Math.max(s.grass, 1)) }));
        };
        const rows = [];
        for (const pose of [[40, 22, 5], [220, 18, 5], [130, 12, 6], [40, 36, 18], [220, 26, 30], [220, 26, 45]]) {
            setPose(...pose);
            const modes = [];
            for (const [lod, filtering] of [['LOD4', 1], ['LOD3', 1], ['LOD3', 0]]) {
                s.setLod(lod); filter.value = filtering;
                modes.push({ lod, filtering, sections: summarize(read(1), read(2)) });
            }
            rows.push({ pose, modes });
        }
        const fade = []; setPose(130, 18, 8); s.setLod('LOD3'); filter.value = 1;
        for (let meters = 12; meters <= 66; meters++) {
            distance.value = meters;
            const pixels = read(4); let coverage = 0;
            for (let i = 0; i < pixels.length; i += 4) coverage += pixels[i];
            fade.push({ meters, pixels: coverage });
        }
        s.renderer.setRenderTarget(null); target.dispose();
        return { rows, fade, glError: s.renderer.getContext().getError() };
    });
    const comparisons = result.rows.map(({ pose, modes }) => ({ pose,
        sections: modes[0].sections.flatMap((reference, i) => {
            const actual = modes[1].sections[i]; if (reference.grass < 100 || actual.grass < 100) return [];
            const luminance = reference.rgb[0] * .2126 + reference.rgb[1] * .7152 + reference.rgb[2] * .0722;
            return [{ section: i, relativeColor: actual.rgb.map((v, k) => (v - reference.rgb[k]) / Math.max(luminance, .0001)),
                coverageDifference: actual.coverage - reference.coverage }];
        }) }));
    await writeFile(path.join(output, 'masked_color_transition.json'), JSON.stringify({ ...result, comparisons, errors }, null, 2));
    expect(errors).toEqual([]); expect(result.glError).toBe(0);
    expect(comparisons.every(row => row.sections.length > 0)).toBe(true);
    for (const row of comparisons) for (const section of row.sections) {
        expect(Math.max(...section.relativeColor.map(Math.abs)), JSON.stringify({ pose: row.pose, section })).toBeLessThan(.02);
        expect(Math.abs(section.coverageDifference), JSON.stringify({ pose: row.pose, section })).toBeLessThan(.025);
    }
    const total = result.fade[0].pixels;
    expect(total).toBeGreaterThan(100);
    expect(result.fade.find(row => row.meters === 24).pixels).toBe(total);
    expect(result.fade.find(row => row.meters === 30).pixels).toBeGreaterThan(total * .8);
    expect(result.fade.find(row => row.meters === 48).pixels).toBeGreaterThan(total * .05);
    expect(result.fade.find(row => row.meters === 64).pixels).toBe(0);
    for (let i = 1; i < result.fade.length; i++) {
        expect(Math.abs(result.fade[i].pixels - result.fade[i - 1].pixels) / total).toBeLessThan(.09);
        expect(result.fade[i].pixels).toBeLessThanOrEqual(result.fade[i - 1].pixels + total * .003);
    }
});
