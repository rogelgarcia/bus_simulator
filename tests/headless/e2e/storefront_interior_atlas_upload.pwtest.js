// Headless browser test: the interior atlas the GPU samples must be the real
// atlas image, not the procedural placeholder the texture starts out with.
//
// AI 500: the storefront shop atlas (1536x1024) was swapped into a texture whose
// immutable GPU storage had already been allocated from the 1024x1024
// placeholder canvas, so the upload was silently rejected and every shopfront
// rendered the placeholder. CPU-side checks cannot see this - `texture.image`
// is the correct image either way - so this test reads the pixels back off the
// GPU and correlates them against the atlas image decoded on the CPU.
import test, { expect } from '@playwright/test';

const CORRELATION_MIN = 0.7;
const CROSS_CORRELATION_MAX = 0.45;

test('Storefront interior atlas: the GPU holds the real shop atlas, not the placeholder', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    await page.evaluate(async () => {
        window.__testHooks.setViewport(960, 540);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: 'storefront_row_2'
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    });

    await page.waitForFunction(() => {
        const textures = window.__testHooks.getMetrics()?.scenario?.textures ?? null;
        return !!textures && textures.total > 0 && textures.ready >= textures.total;
    }, null, { timeout: 60_000, polling: 250 });

    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const eng = window.__testHooks.getEngine();
        const renderer = eng.renderer;
        const SIZE = 48;

        const atlases = new Map();
        eng.scene.traverse((obj) => {
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            for (const mat of mats) {
                if (!mat?.userData?.windowInterior || !mat.map) continue;
                const src = String(mat.map.image?.src ?? '');
                const kind = src.includes('wide_6x4') ? 'shop' : (src.includes('residential') ? 'residential' : 'other');
                if (kind !== 'other' && !atlases.has(kind)) atlases.set(kind, mat.map);
            }
        });

        const rt = new THREE.WebGLRenderTarget(SIZE, SIZE);
        const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10);
        camera.position.z = 1;
        const scene = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }));
        scene.add(quad);

        const srgbToLinear = (v) => {
            const c = v / 255;
            return c <= 0.04045 ? (c / 12.92) : Math.pow((c + 0.055) / 1.055, 2.4);
        };

        // Read what the GPU actually samples. readRenderTargetPixels returns
        // rows bottom-up, so flip to match a 2D canvas' top-down order.
        const gpuLuma = (texture) => {
            quad.material.map = texture;
            quad.material.needsUpdate = true;
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(rt);
            renderer.render(scene, camera);
            const pixels = new Uint8Array(SIZE * SIZE * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels);
            renderer.setRenderTarget(prev);
            const out = new Float64Array(SIZE * SIZE);
            for (let y = 0; y < SIZE; y++) {
                for (let x = 0; x < SIZE; x++) {
                    const i = ((SIZE - 1 - y) * SIZE + x) * 4;
                    out[y * SIZE + x] = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 / 255;
                }
            }
            return out;
        };

        // The same atlas decoded on the CPU, converted to the render target's
        // linear space so the two are directly comparable.
        const imageLuma = (texture) => {
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(texture.image, 0, 0, SIZE, SIZE);
            const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
            const out = new Float64Array(SIZE * SIZE);
            for (let p = 0; p < out.length; p++) {
                const i = p * 4;
                out[p] = (srgbToLinear(data[i]) + srgbToLinear(data[i + 1]) + srgbToLinear(data[i + 2])) / 3;
            }
            return out;
        };

        const correlation = (a, b) => {
            const n = Math.min(a.length, b.length);
            let sa = 0;
            let sb = 0;
            for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
            const ma = sa / n;
            const mb = sb / n;
            let num = 0;
            let da = 0;
            let db = 0;
            for (let i = 0; i < n; i++) {
                const x = a[i] - ma;
                const y = b[i] - mb;
                num += x * y;
                da += x * x;
                db += y * y;
            }
            return num / Math.max(1e-9, Math.sqrt(da * db));
        };

        const out = { atlases: {}, cross: null };
        const luma = {};
        for (const [kind, texture] of atlases) {
            luma[kind] = { gpu: gpuLuma(texture), image: imageLuma(texture) };
            out.atlases[kind] = {
                pending: !!texture.userData?.windowInteriorAtlasPending,
                failed: !!texture.userData?.windowInteriorAtlasFailed,
                imageWidth: Number(texture.image?.naturalWidth ?? texture.image?.width) || 0,
                imageHeight: Number(texture.image?.naturalHeight ?? texture.image?.height) || 0,
                tag: texture.image?.tagName ?? null,
                correlation: correlation(luma[kind].gpu, luma[kind].image)
            };
        }
        if (luma.shop && luma.residential) {
            out.cross = correlation(luma.shop.gpu, luma.residential.image);
        }

        rt.dispose();
        quad.geometry.dispose();
        quad.material.dispose();
        return out;
    });

    expect(result.atlases.shop, 'no shop interior atlas found in the scene').toBeTruthy();
    expect(result.atlases.residential, 'no residential interior atlas found in the scene').toBeTruthy();

    expect(result.atlases.shop.pending).toBe(false);
    expect(result.atlases.shop.failed).toBe(false);
    expect(result.atlases.shop.tag).toBe('IMG');
    expect(result.atlases.shop.imageWidth).toBe(1536);
    expect(result.atlases.shop.imageHeight).toBe(1024);

    // What the GPU samples must match the atlas image...
    expect(result.atlases.shop.correlation).toBeGreaterThan(CORRELATION_MIN);
    expect(result.atlases.residential.correlation).toBeGreaterThan(CORRELATION_MIN);
    // ...and the metric must be able to tell two different atlases apart, so a
    // passing correlation above is not just noise.
    expect(result.cross).toBeLessThan(CROSS_CORRELATION_MAX);
});
