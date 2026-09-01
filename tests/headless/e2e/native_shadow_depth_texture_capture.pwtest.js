// Chrome/ANGLE GPU proof for native depth-texture transform-feedback capture.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test, {expect} from '@playwright/test';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../..'
);
const artifactPath = path.join(
    repoRoot,
    'tests/artifacts/static_sun_depth/native_shadow_depth_capture',
    'phase1_webgl2_gpu_fixture.json'
);

test('native shadow depth texture capture preserves values, identity, and renderer state', async ({page}, testInfo) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/tests/headless/e2e/fixtures/native_shadow_depth_texture_capture.html');
    const result = await page.evaluate(async () => {
        const fixture = await import(
            '/tests/headless/e2e/fixtures/NativeShadowDepthTextureFixture.js'
        );
        try {
            return fixture.runNativeShadowDepthTextureCaptureFixture();
        } catch (error) {
            const diagnostics = JSON.stringify(error?.diagnostics ?? {});
            throw new Error(`${error?.code ?? 'CAPTURE_FAILED'}: ${error?.message ?? error}; ${diagnostics}`);
        }
    });
    result.browserVersion = page.context().browser()?.version() ?? null;

    expect(result.schema).toBe('ai531-native-shadow-depth-texture-gpu-fixture-v1');
    expect(result.method).toBe(
        'three-r183-native-shadow-depth-texture-transform-feedback-v1'
    );
    expect(
        `${result.implementation.renderer} ${result.implementation.unmaskedRenderer}`
    ).toMatch(/ANGLE/i);
    expect(result.attachmentDepthBits).toEqual({depth24: 24, depth32f: 32});
    expect(result.sourceTextureCompareMode.depth24).not.toBe(0);
    expect(result.sourceTextureCompareMode.depth32f).not.toBe(0);

    expect(result.depth32f.capturedBits).toEqual(result.depth32f.expectedBits);
    expect(result.depth24.capturedIntegers).toEqual(result.depth24.expectedIntegers);
    expect(result.depth24.capturedFloatBits).toEqual(result.depth24.expectedFloatBits);
    expect(result.subregion32f.capturedBits).toEqual([
        result.depth32f.expectedBits[5],
        result.depth32f.expectedBits[6],
        result.depth32f.expectedBits[9],
        result.depth32f.expectedBits[10]
    ]);

    expect(result.transfer.pixelPackBuffer).toBe('not-used');
    expect(result.transfer.synchronization).toBe('blocking-get-buffer-sub-data-v1');
    expect(result.restoration.helper).toEqual({gl: 'verified', renderer: 'verified'});
    expect(result.restoration.afterFullState).toEqual([]);
    expect(result.restoration.afterSubregionState).toEqual([]);
    expect(result.restoration.afterDepth24State).toEqual([]);
    expect(result.restoration.afterMismatchState).toEqual([]);
    expect(result.mismatchError).toEqual({
        code: 'DEPTH_ATTACHMENT_IDENTITY_MISMATCH',
        message: 'Provided depth texture is not the framebuffer DEPTH_ATTACHMENT object',
        stateRestoration: {gl: 'verified', renderer: 'verified'}
    });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    await fs.mkdir(path.dirname(artifactPath), {recursive: true});
    await fs.writeFile(artifactPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await testInfo.attach('native-shadow-depth-texture-gpu-fixture', {
        path: artifactPath,
        contentType: 'application/json'
    });
});
