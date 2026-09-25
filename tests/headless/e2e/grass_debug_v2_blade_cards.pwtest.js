// Blade edge normals and grounded card heights must agree with the 3D source.
import test, { expect } from '@playwright/test';

for (const pixelRatio of [1, 1.5, 2]) test(`LOD3 preserves narrow blade tips at pixel ratio ${pixelRatio}`, async ({ page }) => {
    await page.route('**/grass-tip-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>' }));
    await page.goto('/grass-tip-check');
    const tops = await page.evaluate(async pixelRatio => {
        const THREE = await import('three');
        const { createGrassDebugV2Cards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Cards.js');
        const renderer = new THREE.WebGLRenderer();
        renderer.setPixelRatio(pixelRatio);
        const geometry = new THREE.BufferGeometry();
        const roots = [-0.12, 0, 0.12];
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(roots.flatMap(x => [x - 0.004, 0, 0, x + 0.004, 0, 0, x, 0.1, 0.1]), 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array(9).fill([0.1, 0.4, 0.02]).flat(), 3));
        geometry.computeVertexNormals(); geometry.computeBoundingBox();
        const cards = createGrassDebugV2Cards(renderer, [{ geometry, rootCenter: new THREE.Vector3(), facing: 0, incline: Math.PI / 4 }]);
        const material = new THREE.MeshBasicMaterial({ map: cards.material.map, alphaTest: cards.material.alphaTest, side: THREE.DoubleSide });
        const scene = new THREE.Scene();
        scene.add(new THREE.Mesh(cards.geometry, material));
        const camera = new THREE.OrthographicCamera(-0.16, 0.16, 0.112, -0.002, 0.01, 3);
        camera.position.z = -1; camera.lookAt(0, 0, 0);
        const target = new THREE.WebGLRenderTarget(1024, 512);
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.render(scene, camera);
        const pixels = new Uint8Array(1024 * 512 * 4);
        renderer.readRenderTargetPixels(target, 0, 0, 1024, 512, pixels);
        const tops = roots.map(root => {
            let top = 0;
            for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) {
                if (Math.abs((x + 0.5) / 1024 * 0.32 - 0.16 - root) < 0.008 && pixels[(y * 1024 + x) * 4 + 3] > 0) top = (y + 0.5) / 512 * 0.114 - 0.002;
            }
            return top;
        });
        material.dispose(); cards.material.dispose(); cards.geometry.dispose(); cards.dispose(); geometry.dispose(); target.dispose(); renderer.dispose();
        return tops;
    }, pixelRatio);
    for (const top of tops) {
        expect(top, 'Every narrow blade must retain at least 95% of its source height').toBeGreaterThan(0.095);
        expect(top, 'Transparent headroom must not stretch the visible blade').toBeLessThan(0.1005);
    }
});

test('Grass blades have lit edges and their cards preserve grounded roots and height', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass-shape-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>' }));
    await page.goto('/grass-shape-check');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Tuft } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Tuft.js');
        const { createGrassDebugV2Cards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Cards.js');
        const tuft = createGrassDebugV2Tuft();
        const renderer = new THREE.WebGLRenderer();
        const cards = createGrassDebugV2Cards(renderer, tuft.slices);
        const normals = tuft.geometry.attributes.normal;
        const cardPositions = cards.geometry.attributes.position;
        const heights = [];
        for (let i = 0; i < cardPositions.count; i += 4) {
            heights.push({ bottom: Math.min(...Array.from({ length: 4 }, (_, j) => cardPositions.getY(i + j))), top: Math.max(...Array.from({ length: 4 }, (_, j) => cardPositions.getY(i + j))) });
        }
        const result = { minNormalY: Math.min(...Array.from({ length: normals.count }, (_, i) => normals.getY(i))), sourceTop: tuft.geometry.boundingBox.max.y, sourceBottom: tuft.geometry.boundingBox.min.y, heights };
        cards.dispose(); cards.geometry.dispose(); cards.material.dispose();
        tuft.geometry.dispose(); tuft.slices.forEach(slice => slice.geometry.dispose()); renderer.dispose();
        return result;
    });
    expect(errors).toEqual([]);
    expect(result.minNormalY, 'Thin blade edges must not average with an underside into a dark outline').toBeGreaterThan(0.45);
    expect(result.sourceBottom).toBeCloseTo(0, 6);
    for (const card of result.heights) {
        expect(card.bottom, 'Each card root edge must touch the ground').toBeCloseTo(0, 6);
        expect(card.top, 'Proxy headroom must stay within 1% of source height').toBeLessThanOrEqual(result.sourceTop * 1.01);
    }
});

test('Thin grass receives light through its back face without glowing in darkness', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass-lighting-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js"}}</script>' }));
    await page.goto('/grass-lighting-check');
    const pixels = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const renderer = new THREE.WebGLRenderer();
        const target = new THREE.WebGLRenderTarget(32, 32);
        renderer.setRenderTarget(target);
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5);
        camera.position.z = 2;
        const color = new THREE.Color().setRGB(0.07, 0.25, 0.03);
        const grass = createGrassDebugV2Material({ color });
        const opaque = new THREE.MeshStandardMaterial({ color, roughness: 0.68, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), grass);
        const light = new THREE.DirectionalLight(0xffffff, Math.PI);
        scene.add(mesh, light);
        const pixel = new Uint8Array(4);
        const sample = (material, z, intensity = Math.PI) => {
            mesh.material = material; light.position.set(0, 0, z); light.intensity = intensity;
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            return pixel[1];
        };
        const result = { opaqueBack: sample(opaque, -3), front: sample(grass, 3), back: sample(grass, -3), dark: sample(grass, -3, 0) };
        grass.dispose(); opaque.dispose(); mesh.geometry.dispose(); target.dispose(); renderer.dispose();
        return result;
    });
    expect(pixels.opaqueBack).toBe(0);
    expect(pixels.front).toBeGreaterThan(40);
    expect(pixels.back).toBeGreaterThan(pixels.front * 0.2);
    expect(pixels.back).toBeLessThan(pixels.front * 0.45);
    expect(pixels.dark).toBe(0);
    expect(errors).toEqual([]);
});

test('Grass canopy shades buried blades and transmission while preserving sky and sunward edges', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass-canopy-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js"}}</script>' }));
    await page.goto('/grass-canopy-check');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const renderer = new THREE.WebGLRenderer();
        const target = new THREE.WebGLRenderTarget(32, 32);
        renderer.setRenderTarget(target);
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-.01, .01, .01, -.01, .001, 10);
        const canopy = {
            grassCanopyBounds: { value: new THREE.Vector4(-1, -1, 1, 1) },
            grassCanopyHeight: { value: .12 }, grassCanopyOpticalDepth: { value: 8 }
        };
        const material = createGrassDebugV2Material({ color: new THREE.Color().setRGB(.3, .3, .3), roughness: 1 }, canopy);
        const geometry = new THREE.PlaneGeometry(.015, .015).rotateX(-Math.PI / 2);
        const mesh = new THREE.InstancedMesh(geometry, material, 1);
        mesh.frustumCulled = false;
        const sun = new THREE.DirectionalLight(0xffffff, Math.PI);
        const sky = new THREE.AmbientLight(0xffffff, 0);
        scene.add(mesh, sun, sky);
        const pixel = new Uint8Array(4);
        const sample = (x, y, side = 1, sunX = 1) => {
            mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, y, 0));
            mesh.instanceMatrix.needsUpdate = true;
            camera.position.set(x, y + side, .001); camera.lookAt(x, y, 0);
            sun.position.set(sunX, 1, 0);
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            return pixel[1];
        };
        const result = {
            root: sample(0, .005), middle: sample(0, .06), tip: sample(0, .121),
            edge: sample(.995, .02), interior: sample(0, .02),
            edgeReversed: sample(.995, .02, 1, -1), otherEdgeReversed: sample(-.995, .02, 1, -1),
            backBuried: sample(0, .02, -1), backExposed: sample(0, .121, -1),
            seamLeft: sample(-.001, .06), seamRight: sample(.001, .06)
        };
        sun.intensity = 0; sky.intensity = .7;
        result.skyShaded = sample(0, .02);
        canopy.grassCanopyOpticalDepth.value = 0;
        result.skyUnshaded = sample(0, .02);
        sky.intensity = 0; result.dark = sample(0, .02);
        material.dispose(); geometry.dispose(); mesh.dispose(); target.dispose(); renderer.dispose();
        return result;
    });
    expect(result.middle).toBeGreaterThan(result.root + 5);
    expect(result.tip).toBeGreaterThan(result.middle * 2);
    expect(result.edge).toBeGreaterThan(result.interior + 20);
    expect(result.edgeReversed).toBeLessThan(result.edge * .25);
    expect(result.otherEdgeReversed).toBeGreaterThan(result.edgeReversed + 20);
    expect(result.backBuried).toBeLessThan(result.backExposed * .25);
    expect(Math.abs(result.seamLeft - result.seamRight)).toBeLessThanOrEqual(1);
    expect(result.skyShaded).toBeGreaterThan(10);
    expect(result.skyShaded).toBe(result.skyUnshaded);
    expect(result.dark).toBe(0);
    expect(errors).toEqual([]);
});
