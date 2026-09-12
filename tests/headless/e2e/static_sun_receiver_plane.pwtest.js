// Exercise the actual finite-sun shader against an exactly known sloping receiver.
import test, { expect } from '@playwright/test';

for (const streamed of [false, true]) test(`finite sun preserves clear slopes and fine contact shadows (${streamed ? 'detail' : 'parent'})`, async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const results = await page.evaluate(async streamed => {
        const THREE = await import('three');
        const source = await fetch('/src/graphics/shaders/materials/static_sun_depth.frag.glsl').then(r => r.text());
        const uniformsSource = source.slice(0, source.indexOf('void dynamicSunShadowApplyDirectional'))
            .replace('varying highp vec3 vStaticSunWorldPosition;', '');
        let functions = source.slice(source.indexOf('highp vec2 staticSunDepthDecodedDepth'), source.indexOf('highp float staticSunDepthMaxComponent'));
        if (streamed) functions = functions.replace('highp vec4 staticSunDepthLookup(', 'highp vec4 staticSunDepthLookupBase(')
            + await fetch('/src/graphics/shaders/materials/streamed_sun_depth.frag.glsl').then(r => r.text());
        const renderer = new THREE.WebGLRenderer();
        const size = 128, pitch = 0.05, depthMin = -100, depthMax = 100;
        const bytes = new Uint8Array(size * size * 2);
        const texture = new THREE.DataArrayTexture(bytes, size, size, 1);
        Object.assign(texture, { format: THREE.RGFormat, type: THREE.UnsignedByteType,
            internalFormat: 'RG8', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
        const table = new THREE.DataTexture(new Float32Array([1, 1, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType); table.needsUpdate = true;
        const uniforms = {
            staticSunDepthTiles: { value: texture }, staticSunDepthWorldToLight: { value: new THREE.Matrix4() },
            staticSunDepthPointDirectionWorld: { value: new THREE.Vector3(0, 0, -1) },
            staticSunDepthGridOrigin: { value: new THREE.Vector2(-3.15, -3.15) },
            staticSunDepthTileCount: { value: new THREE.Vector2(1, 1) },
            staticSunDepthDepthRange: { value: new THREE.Vector2(depthMin, depthMax) },
            staticSunDepthEncodingMode: { value: 0 }, staticSunDepthLayout: { value: new THREE.Vector4(size-2, size-2, 1, pitch) },
            staticSunDepthBiasPolicy: { value: new THREE.Vector4(.005, 0, 0, 0) },
            staticSunDepthFilterPolicy: { value: new THREE.Vector4(1, 1, 0, Math.tan(.53 * Math.PI / 360)) },
            staticSunDepthDebugMode: { value: 0 }, slope: { value: new THREE.Vector2() },
            staticSunStreamTiles: { value: texture }, staticSunStreamTable: { value: table },
            staticSunStreamTileCount: { value: new THREE.Vector2(1, 1) }, staticSunStreamTime: { value: 3 },
            staticSunStreamEnabled: { value: 1 }, staticSunStreamLayout: { value: new THREE.Vector4(size-2, size-2, 1, pitch) }
        };
        const material = new THREE.ShaderMaterial({ uniforms,
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}',
            fragmentShader: '#include <common>\nvarying vec2 vUv; uniform vec2 slope;\n' + uniformsSource + functions +
                '\nvoid main(){vec2 xy=(vUv-0.5)*3.0;vec3 p=vec3(xy,dot(xy,slope));float v=staticSunDepthLookup(p,vec3(0,0,-1)).x;gl_FragColor=vec4(vec3(v),1.0);}' });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), scene = new THREE.Scene(); scene.add(quad);
        const target = new THREE.WebGLRenderTarget(192, 192), pixels = new Uint8Array(192 * 192 * 4);
        const results = [];
        for (const slope of [[0, 0], [1, .3], [-.7, 1.8]]) {
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const z = ((x + .5) * pitch - 3.2) * slope[0] + ((y + .5) * pitch - 3.2) * slope[1];
                const q = Math.round((z - depthMin) / (depthMax - depthMin) * 65534), i = (y * size + x) * 2;
                bytes[i] = q >> 8; bytes[i + 1] = q & 255;
            }
            texture.needsUpdate = true; uniforms.slope.value.set(...slope);
            renderer.setRenderTarget(target); renderer.render(scene, new THREE.Camera());
            renderer.readRenderTargetPixels(target, 0, 0, 192, 192, pixels);
            let minimum = 255, mean = 0;
            for (let i = 0; i < pixels.length; i += 4) { minimum = Math.min(minimum, pixels[i]); mean += pixels[i]; }
            results.push({ slope, minimum, mean: mean / (192 * 192) });
        }
        uniforms.slope.value.set(0, 0);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const worldX = (x + .5) * pitch - 3.2;
            const z = worldX < -.2 ? -40 : worldX < 0 ? -.2 : 0;
            const q = Math.round((z - depthMin) / (depthMax - depthMin) * 65534), i = (y * size + x) * 2;
            bytes[i] = q >> 8; bytes[i + 1] = q & 255;
        }
        texture.needsUpdate = true;
        renderer.render(scene, new THREE.Camera());
        renderer.readRenderTargetPixels(target, 0, 0, 192, 192, pixels);
        let contactMaximum = 0;
        for (let y = 32; y < 160; y++) for (let x = 88; x <= 90; x++) contactMaximum = Math.max(contactMaximum, pixels[(y * 192 + x) * 4]);
        let clearMinimum = 255;
        for (let y = 32; y < 160; y++) for (let x = 98; x <= 112; x++) clearMinimum = Math.min(clearMinimum, pixels[(y * 192 + x) * 4]);
        const transitionWidth = () => {
            let count = 0;
            for (let x = 80; x < 112; x++) { const v = pixels[(96 * 192 + x) * 4]; if (v > 2 && v < 253) count++; }
            return count;
        };
        const contactWidth = transitionWidth();
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const z = x < size / 2 ? -40 : 0, q = Math.round((z - depthMin) / (depthMax - depthMin) * 65534), i = (y * size + x) * 2;
            bytes[i] = q >> 8; bytes[i + 1] = q & 255;
        }
        texture.needsUpdate = true; renderer.render(scene, new THREE.Camera());
        renderer.readRenderTargetPixels(target, 0, 0, 192, 192, pixels);
        const distantWidth = transitionWidth();
        target.dispose(); quad.geometry.dispose(); material.dispose(); texture.dispose(); table.dispose(); renderer.dispose();
        return { planes: results, contactMaximum, clearMinimum, contactWidth, distantWidth };
    }, streamed);
    for (const result of results.planes) expect(result.minimum, JSON.stringify(result)).toBeGreaterThanOrEqual(253);
    expect(results.contactMaximum, 'A nearby blocker remains opaque regardless of distant blockers behind its edge').toBeLessThanOrEqual(2);
    expect(results.clearMinimum, 'A distant blocker outside the solar cone cannot spread the nearby contact shadow onto clear ground').toBeGreaterThanOrEqual(253);
    expect(results.distantWidth, 'A distant blocker still produces a broader physical penumbra').toBeGreaterThan(results.contactWidth + 4);
});
