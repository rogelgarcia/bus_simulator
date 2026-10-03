// Renders the production landscape shader across controlled hierarchy seams and staggered mask arrivals.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d1/seams');
const maxDifference = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));
test.use({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, trace: 'off', video: 'off' });

test('Landscape surface: actual shader preserves mixed-LOD corners and unequal arrival progress without root-only fallback', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'The worktree and isolated fixtures must avoid port 8001').not.toBe('8001');
    await mkdir(artifacts, { recursive: true });
    const report = { format: 'landscape-surface-gpu-seam-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(),
        shaderSha256: createHash('sha256').update(await readFile('src/graphics/shaders/materials/landscape/terrain.frag.glsl')).digest('hex'),
        conditions: { fixture: 'synthetic homogeneous fields with intentionally different root, parent and child soils', width: 512, height: 512,
            color: 'Linear-sRGB framebuffer, no tone mapping, constant 1-pixel PBR textures, zero normal strength, no antialiasing',
            routing: 'Production LandscapeMaskPages.updateUniforms derives parent and eight-neighbor availability from the controlled records',
            maskEncoding: 'RGBA8 homogeneous fields: 0xf000 reference and 0xf001 exact constant-region shortcut; subsequent hierarchy probes use 0xf001',
            spatialToleranceBytes: 3, temporalStep: .05, temporalToleranceBytes: 12 }, errors: [], warnings: [] };
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 }), page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
        if (!['error', 'warning'].includes(message.type()) || !/shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) return;
        const value = message.text();
        const target = message.type() === 'error' || /\berrors?(?:\s+X\d+|\s*:)|compil(?:ation|e).*fail|GL_INVALID|VALIDATE_STATUS\s*[:=]?\s*false/i.test(value) ? report.errors : report.warnings;
        if (!target.includes(value)) target.push(value);
    });
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_surface_probe.html', async route => route.fulfill({
            contentType: 'text/html', body: await readFile('tests/headless/e2e/fixtures/landscape_surface_probe.html', 'utf8')
        }));
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async () => {
            const T = await import('three');
            const { createLandscapeShaderPayload } = await import('/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js');
            const { createLandscapeAppearanceUniforms } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const { LandscapeMaskPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaskPages.js');
            const size = 512, columns = 17, halo = 2, width = columns + halo * 2, capacity = 17;
            const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false, preserveDrawingBuffer: true });
            renderer.setSize(size, size, false); renderer.setPixelRatio(1); renderer.toneMapping = T.NoToneMapping; renderer.outputColorSpace = T.LinearSRGBColorSpace;
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            const appearance = createLandscapeAppearanceUniforms(), payload = createLandscapeShaderPayload('terrain');
            const geometry = new T.PlaneGeometry(64, 64).rotateX(-Math.PI / 2);
            geometry.setAttribute('parentHeight', new T.BufferAttribute(new Float32Array(4), 1));
            geometry.setAttribute('parentNormal', geometry.attributes.normal.clone());
            geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(12).fill(1), 3));
            const material = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true,
                uniforms: { ...appearance, uMorph: { value: 1 }, uEdges: { value: new T.Vector4() }, uEdgeMorph: { value: new T.Vector4(1, 1, 1, 1) },
                    uBounds: { value: new T.Vector4(-32, 32, -32, 32) }, uTint: { value: new T.Color(1, 1, 1) }, uLodColor: { value: 0 },
                    uDiagnostic: { value: 0 }, uDiagnosticRange: { value: new T.Vector3(0, 1, 0) } } });
            const scene = new T.Scene(), mesh = new T.Mesh(geometry, material), camera = new T.OrthographicCamera(-4, 4, 4, -4, .1, 200);
            mesh.frustumCulled = false; scene.add(mesh); camera.up.set(0, 0, -1);
            const resources = [], colors = [[30, 30, 30], [30, 30, 30], [107, 8, 5], [5, 102, 10], [6, 8, 112], [30, 30, 30]];
            const bases = colors.map(rgb => {
                const texture = new T.DataTexture(new Uint8Array([...rgb, 255]), 1, 1, T.RGBAFormat);
                texture.colorSpace = T.NoColorSpace; texture.needsUpdate = true; resources.push(texture); return texture;
            });
            const surface = new T.DataArrayTexture(new Uint8Array([128, 128, 255, 255, 255, 255, 0, 255]), 1, 1, 2);
            surface.colorSpace = T.NoColorSpace; surface.needsUpdate = true; resources.push(surface);
            for (let soil = 0; soil < 6; soil++) {
                appearance[`uSoilBase${soil}`].value = bases[soil]; appearance[`uSoilSurface${soil}`].value = surface;
                appearance.uSoilScale.value[soil].set(4, 0, 1, 0);
            }
            appearance.uBlendBase.value = bases[0]; appearance.uBlendSurface.value = surface;
            appearance.uAppearanceReady.value = 1; appearance.uMaskDimensions.value.set(columns, columns);
            const pixels = new Uint8Array(width * width * 4 * capacity);
            for (let slot = 0; slot < capacity; slot++) {
                const soil = slot === 0 ? 2 : slot === 4 ? 4 : 3;
                for (let index = 0; index < width * width; index++) pixels.set([soil * 17, soil, 0, 240], (slot * width * width + index) * 4);
            }
            const masks = new T.DataArrayTexture(pixels, width, width, capacity);
            masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false; masks.needsUpdate = true;
            appearance.uMaskPages.value = masks; resources.push(masks);
            const descriptor = (id, level, column, row, minX, maxX, minZ, maxZ, parentId) => ({ id, level, column, row, parentId, bounds: { minX, maxX, minZ, maxZ } });
            const descriptors = [descriptor('l0/c0/r0', 0, 0, 0, -32, 32, -32, 32, null),
                descriptor('l1/c0/r0', 1, 0, 0, -32, 0, 0, 32, 'l0/c0/r0'), descriptor('l1/c1/r0', 1, 1, 0, 0, 32, 0, 32, 'l0/c0/r0'),
                descriptor('l1/c0/r1', 1, 0, 1, -32, 0, -32, 0, 'l0/c0/r0'), descriptor('l2/c1/r1', 2, 1, 1, -16, 0, 0, 16, 'l1/c0/r0')];
            const records = specifications => new Map(specifications.map(([slot, progress]) => [descriptors[slot].id, { id: descriptors[slot].id, descriptor: descriptors[slot], slot, progress, status: 'resident' }]));
            const buffer = new Uint8Array(size * size * 4), snapshots = [];
            const difference = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));
            const draw = (specifications, { center = [0, 0], span = 8, capture = null, referenceSoil = null } = {}) => {
                for (let soil = 0; soil < 6; soil++) appearance[`uSoilBase${soil}`].value = bases[referenceSoil ?? soil];
                const current = records(specifications);
                LandscapeMaskPages.prototype.updateUniforms.call({ records: current, capacity, uniforms: appearance });
                camera.left = camera.bottom = -span / 2; camera.right = camera.top = span / 2;
                camera.position.set(center[0], 100, center[1]); camera.lookAt(center[0], 0, center[1]); camera.updateProjectionMatrix();
                material.uniformsNeedUpdate = true; renderer.render(scene, camera);
                gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
                const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`Landscape GPU probe WebGL error ${error}`);
                const pixel = (x, z) => {
                    const column = Math.max(0, Math.min(size - 1, Math.floor((x - center[0]) / span * size + size / 2)));
                    const row = Math.max(0, Math.min(size - 1, Math.floor((center[1] - z) / span * size + size / 2)));
                    return Array.from(buffer.slice((row * size + column) * 4, (row * size + column) * 4 + 3));
                };
                const halfPixel = span / size / 2, strip = [];
                for (let offset = -3; offset <= 3; offset++) {
                    strip.push({ axis: 'x', offset, negative: pixel(center[0] - halfPixel, center[1] + offset), positive: pixel(center[0] + halfPixel, center[1] + offset) });
                    strip.push({ axis: 'z', offset, negative: pixel(center[0] + offset, center[1] - halfPixel), positive: pixel(center[0] + offset, center[1] + halfPixel) });
                }
                const corner = [-1, 1].flatMap(sx => [-1, 1].map(sz => pixel(center[0] + sx * halfPixel, center[1] + sz * halfPixel)));
                const value = { specifications, center, span, pixelMeters: span / size, strip, corner,
                    verticalJumpBytes: Math.max(...strip.filter(sample => sample.axis === 'x').map(sample => difference(sample.negative, sample.positive))),
                    horizontalJumpBytes: Math.max(...strip.filter(sample => sample.axis === 'z').map(sample => difference(sample.negative, sample.positive))),
                    cornerJumpBytes: Math.max(...corner.flatMap(a => corner.map(b => difference(a, b)))),
                    interior: pixel(-8, 8), centerPixel: pixel(center[0] + halfPixel, center[1] + halfPixel),
                    neighbors: [...current.values()].map(record => ({ id: record.id, progress: record.progress, neighbors: record.neighborProgress })) };
                if (capture) snapshots.push({ id: capture, dataUrl: renderer.domElement.toDataURL('image/png') });
                return value;
            };
            try {
                const root = [[0, 1]], full = [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]];
                draw(full, { span: 48 });
                const referenceFrame = buffer.slice();
                for (let offset = 2; offset < pixels.length; offset += 4) pixels[offset] = 1;
                masks.needsUpdate = true;
                draw(full, { span: 48 });
                const uniformFastPath = { referencePackedValue: 0xf000, shortcutPackedValue: 0xf001, comparedBytes: buffer.length, differentBytes: 0, maxDifferenceBytes: 0 };
                for (let index = 0; index < buffer.length; index++) {
                    const delta = Math.abs(referenceFrame[index] - buffer[index]);
                    if (delta) uniformFastPath.differentBytes++;
                    uniformFastPath.maxDifferenceBytes = Math.max(uniformFastPath.maxDifferenceBytes, delta);
                }
                const reference = Object.fromEntries([2, 3, 4].map(soil => [soil, draw(root, { span: 48, referenceSoil: soil }).interior]));
                const endpoints = { root: draw(root, { span: 48 }), parent: draw([[0, 1], [1, 1], [2, 1], [3, 1], [4, 0]], { span: 48 }),
                    child: draw(full, { span: 48, capture: '01-fully-resident-child' }) };
                const cornerCases = [0, .25, .5, .75, 1].map(progress => ({ progress,
                    ...draw([[0, 1], [1, 1], [2, progress], [3, .35], [4, 1]], { capture: progress === .5 ? '02-mixed-lod-corner' : null }) }));
                const arrivalReference = Object.fromEntries([2, 3].map(soil => [soil, draw(root, { center: [0, 16], referenceSoil: soil }).centerPixel]));
                const arrivals = Array.from({ length: 21 }, (_, step) => {
                    const progress = step / 20;
                    return { progress, ...draw([[0, 1], [1, 1], [2, progress]], { center: [0, 16], capture: step === 10 ? '03-unequal-arrival-progress' : null }) };
                });
                const temporalMaxBytes = Math.max(...arrivals.slice(1).map((frame, index) => difference(frame.centerPixel, arrivals[index].centerPixel)));
                return { renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), uniformFastPath, reference, endpoints, cornerCases, arrivalReference, arrivals, temporalMaxBytes, snapshots };
            } finally {
                for (const resource of resources) resource.dispose();
                geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss();
            }
        });
        const { snapshots, ...measurements } = result;
        Object.assign(report, measurements);
        for (const snapshot of snapshots) await writeFile(path.join(artifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        expect(report.errors).toEqual([]);
        expect(report.uniformFastPath.differentBytes, 'Exact constant-region shortcut preserves every rendered RGBA byte').toBe(0);
        for (const sample of report.cornerCases) {
            expect(sample.verticalJumpBytes, `Mixed-level vertical seam at neighbor progress ${sample.progress}`).toBeLessThanOrEqual(3);
            expect(sample.horizontalJumpBytes, `Mixed-level horizontal seam at neighbor progress ${sample.progress}`).toBeLessThanOrEqual(3);
            expect(sample.cornerJumpBytes, `Mixed-level corner at neighbor progress ${sample.progress}`).toBeLessThanOrEqual(3);
        }
        for (const sample of report.arrivals) expect(sample.verticalJumpBytes, `Equal-level seam at neighbor progress ${sample.progress}`).toBeLessThanOrEqual(3);
        expect(report.temporalMaxBytes).toBeLessThanOrEqual(12);
        for (const [name, soil] of [['root', 2], ['parent', 3], ['child', 4]]) expect(maxDifference(report.endpoints[name].interior, report.reference[soil]), `${name} interior uses its intended hierarchy field`).toBeLessThanOrEqual(3);
        expect(maxDifference(report.endpoints.child.interior, report.endpoints.root.interior), 'A root-only implementation must fail this fixture').toBeGreaterThan(60);
        expect(maxDifference(report.arrivals[0].centerPixel, report.arrivalReference[2])).toBeLessThanOrEqual(3);
        expect(maxDifference(report.arrivals.at(-1).centerPixel, report.arrivalReference[3])).toBeLessThanOrEqual(3);
        report.complete = true;
    } finally {
        await context.close();
        await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
    }
});
