// Verify front/back alpha captures, live source-normal lighting and disposal without loading the full field.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_border_cards');
test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined } });

test('fixed canopy border cards preserve alpha from both sides and respond to changing illumination', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/debug_tools/canopy_border_probe.html', route => route.fulfill({ contentType: 'text/html', body:
        '<!doctype html><html><head><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script></head><body></body></html>' }));
    await page.goto('/debug_tools/canopy_border_probe.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2CanopyBorderCards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyBorderCards.js');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(1280, 720);
        renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; document.body.append(renderer.domElement);
        const dataTexture = rgba => {
            const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1); texture.needsUpdate = true; return texture;
        };
        const roughness = dataTexture([200, 200, 200, 255]), normal = dataTexture([128, 128, 255, 255]);
        const material = createGrassDebugV2Material({ vertexColors: true, normalMap: normal, roughnessMap: roughness,
            defines: { GRASS_LEAF_TRANSLUCENCY: 1, USE_UV: 1 } });
        const p = [], n = [], c = [], uv = [], indices = [], ranges = [];
        for (let i = 0; i < 240; i++) {
            const x = -5.975 + .05 * i, first = p.length / 3;
            const angle = .3 * Math.sin(i * 1.7), dx = .024 * Math.cos(angle), dz = .024 * Math.sin(angle);
            const height = .12 + .08 * ((i * 7 % 17) / 17), z = 5.96;
            for (const [sx, y, u, v] of [[-1, 0, 0, 0], [1, 0, 1, 0], [-.15, height, 0, 1], [.15, height, 1, 1]]) {
                p.push(x + sx * dx, y, z + sx * dz); n.push(-Math.sin(angle), 0, Math.cos(angle));
                c.push(.20, .42, .055); uv.push(u, v);
            }
            ranges.push({ start: indices.length, count: 6 });
            indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
        }
        const geometry = new THREE.BufferGeometry();
        for (const [name, array, size] of [['position', p, 3], ['normal', n, 3], ['color', c, 3], ['uv', uv, 2]])
            geometry.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
        geometry.setIndex(indices); geometry.computeBoundingBox();
        const source = new THREE.Mesh(geometry, material); source.userData.grassLeafRanges = ranges;
        const initialState = { tone: renderer.toneMapping, alpha: renderer.getClearAlpha(), target: renderer.getRenderTarget(), auto: renderer.autoClear };
        const cards = await createGrassDebugV2CanopyBorderCards({ renderer, lod2: source, edgeIds: ranges.map((_, id) => id), width: 12, depth: 12 });
        const restored = initialState.tone === renderer.toneMapping && initialState.alpha === renderer.getClearAlpha()
            && initialState.target === renderer.getRenderTarget() && initialState.auto === renderer.autoClear;
        const scene = new THREE.Scene(); scene.add(cards.group);
        const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(1, 2, 10); scene.add(sun);
        const ambient = new THREE.AmbientLight(0xffffff, .15); scene.add(ambient);
        const camera = new THREE.PerspectiveCamera(28, 1280 / 720, .01, 100);
        const target = new THREE.WebGLRenderTarget(1280, 720, { samples: 4 });
        function sample(back, lightBack) {
            camera.position.set(0, .3, back ? -11 : 22); camera.lookAt(0, .10, 5.96);
            sun.position.z = lightBack ? -10 : 10;
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            const pixels = new Uint8Array(1280 * 720 * 4); renderer.readRenderTargetPixels(target, 0, 0, 1280, 720, pixels);
            let coverage = 0, red = 0, green = 0, blue = 0;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) {
                coverage++; red += pixels[i]; green += pixels[i + 1]; blue += pixels[i + 2];
            }
            renderer.setRenderTarget(null); renderer.render(scene, camera);
            return { coverage, color: [red / coverage, green / coverage, blue / coverage] };
        }
        const front = sample(false, false), back = sample(true, false), movedLight = sample(false, true);
        const snapshot = cards.getSnapshot(), beforeDispose = { ...renderer.info.memory };
        cards.dispose(); renderer.render(scene, camera);
        const afterDispose = { ...renderer.info.memory };
        target.dispose(); geometry.dispose(); material.dispose(); normal.dispose(); roughness.dispose(); renderer.dispose();
        return { restored, front, back, movedLight, snapshot, beforeDispose, afterDispose, sourceVertices: source.geometry.attributes.position.count };
    });
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'capture_lighting.json'), JSON.stringify(result, null, 2));
    expect(errors).toEqual([]);
    expect(result.restored).toBe(true);
    expect(result.snapshot).toMatchObject({ source: 'LOD2', lightingBaked: false, largeCards: 5, smallCards: 1, cards: 6 });
    expect(result.snapshot.liveLeaves + result.snapshot.cardLeaves).toBe(240);
    expect(result.front.coverage).toBeGreaterThan(2000);
    expect(result.back.coverage / result.front.coverage).toBeGreaterThan(.7);
    expect(result.back.coverage / result.front.coverage).toBeLessThan(1.3);
    expect(Math.abs(result.movedLight.color[1] - result.front.color[1])).toBeGreaterThan(5);
    expect(result.afterDispose.textures).toBe(result.beforeDispose.textures - 3);
    expect(result.afterDispose.geometries).toBeLessThan(result.beforeDispose.geometries);
    expect(result.sourceVertices).toBe(960);
});
