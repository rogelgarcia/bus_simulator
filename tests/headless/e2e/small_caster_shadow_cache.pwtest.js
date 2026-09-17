// Independent prop layers retain their complete geometry and have one resource owner.
import test, { expect } from '@playwright/test';

test('small-caster cache ignores view culling and releases worker/texture ownership', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { SmallCasterShadowCache, smallCasterUniforms } = await import('/src/graphics/illumination/static_sun_depth/SmallCasterShadowCache.js');
        const renderer = new THREE.WebGLRenderer();
        const geometry = new THREE.BoxGeometry(.5, 2, .06), material = new THREE.MeshBasicMaterial();
        const mesh = new THREE.Mesh(geometry, material); mesh.visible = false;
        const uniforms = { ...smallCasterUniforms(), staticSunDepthFilterPolicy: { value: new THREE.Vector4(0, 0, 0, .005) },
            staticSunDepthWorldToLight: { value: new THREE.Matrix4() }, staticSunDepthDepthRange: { value: new THREE.Vector2(-100, 100) } };
        const cache = new SmallCasterShadowCache({ uniforms }, renderer); await cache.prepare([mesh]);
        const gpuBytes = cache.metrics.gpuBytes, actualBytes = cache.textures.reduce((sum, t) => sum + t.image.data.byteLength, 0);
        const enabled = uniforms.smallSunEnabled.value, occupied = cache.textures[0].image.data.some(v => v !== 255);
        const workerReleased = cache.worker === null;
        const textures = [...cache.textures]; let disposals = 0;
        for (const texture of textures) texture.addEventListener('dispose', () => disposals++);
        cache.dispose(); cache.dispose();
        const released = uniforms.smallSunEnabled.value === 0 && uniforms.smallSunLayers.value === null && uniforms.smallSunData.value === null;
        const second = new SmallCasterShadowCache({ uniforms }, renderer);
        material.alphaTest = .5;
        let rejected = false; try { await second.prepare([mesh]); } catch { rejected = true; } finally { second.dispose(); }
        material.alphaTest = 0;
        const cancelled = new SmallCasterShadowCache({ uniforms }, renderer), abort = new AbortController();
        const preparation = cancelled.prepare([mesh], { signal: abort.signal }); abort.abort();
        let cancellationRejected = false; try { await preparation; } catch { cancellationRejected = true; }
        const cancelledCleanly = cancellationRejected && cancelled.worker === null && cancelled.textures.length === 0 && uniforms.smallSunEnabled.value === 0;
        geometry.dispose(); material.dispose(); renderer.dispose();
        return { enabled, occupied, gpuBytes, actualBytes, workerReleased, released, disposals, rejected, cancelledCleanly };
    });
    expect(result.enabled).toBe(1); expect(result.occupied).toBe(true);
    expect(result.gpuBytes).toBe(result.actualBytes); expect(result.gpuBytes).toBeLessThan(1024 * 1024);
    expect(result.workerReleased).toBe(true); expect(result.released).toBe(true);
    expect(result.disposals).toBe(2); expect(result.rejected).toBe(true);
    expect(result.cancelledCleanly).toBe(true);
});
