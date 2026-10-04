// Renders the production landscape shader across controlled hierarchy seams and staggered mask arrivals.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const artifacts = path.resolve(process.env.LANDSCAPE_EVIDENCE_ROOT ?? 'tests/artifacts/screens/landscape/ai577/d1/seams');
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
            const { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const { LandscapeMaskPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaskPages.js');
            const size = 512, columns = 17, halo = 2, width = columns + halo * 2, capacity = 17;
            const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false, preserveDrawingBuffer: true });
            renderer.setSize(size, size, false); renderer.setPixelRatio(1); renderer.toneMapping = T.NoToneMapping; renderer.outputColorSpace = T.LinearSRGBColorSpace;
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            const coverageSlots = chooseLandscapeCoverageSlots(renderer);
            const appearance = createLandscapeAppearanceUniforms(coverageSlots.total), payload = createLandscapeShaderPayload('terrain', { coverageSlots: coverageSlots.total });
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
                return { renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), coverageSlots, uniformFastPath, reference, endpoints, cornerCases, arrivalReference, arrivals, temporalMaxBytes, snapshots };
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

const detailArtifacts = path.resolve(process.env.LANDSCAPE_DETAIL_SEAMS_ROOT ?? 'tests/artifacts/screens/landscape/ai577/d2/seams');

test('Landscape surface: generated fine slots and the native surface warp keep page borders, corners and arrivals continuous', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port, 'The worktree and isolated fixtures must avoid port 8001').not.toBe('8001');
    await mkdir(detailArtifacts, { recursive: true });
    const report = { format: 'landscape-surface-detail-gpu-seam-probe', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(),
        shaderSha256: createHash('sha256').update(await readFile('src/graphics/shaders/materials/landscape/terrain.frag.glsl')).digest('hex'),
        conditions: { fixture: 'synthetic hierarchy: native levels 0-1, generated levels 2-4 (coastal L3 native, L4-L6 generated); world-anchored soil fields written into every texel and halo',
            routing: 'Production LandscapeMaskPages.updateUniforms with kind detail records, uniform records and the fine slot range',
            warp: 'Current production recipe warp uniforms with fixed fixture seed 4005984422 on native slots only; generated slots are sampled unwarped',
            spatialToleranceBytes: 3, temporalStep: .05, temporalToleranceBytes: 12, frameAdjacentToleranceBytes: 12, warpAlignmentToleranceBytes: 4 }, errors: [], warnings: [] };
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
            const { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots, setLandscapeSurfaceWarpUniforms } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const { LandscapeMaskPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaskPages.js');
            const { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceWarpUniforms } = await import('/src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js');
            const { createLandscapeSurfaceWarp } = await import('/src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js');
            const size = 512, columns = 17, halo = 2, width = columns + halo * 2, capacity = 17, nativeMaxLevel = 1, seed = 4005984422, recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE;
            const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false, preserveDrawingBuffer: true });
            renderer.setSize(size, size, false); renderer.setPixelRatio(1); renderer.toneMapping = T.NoToneMapping; renderer.outputColorSpace = T.LinearSRGBColorSpace;
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            const coverageSlots = chooseLandscapeCoverageSlots(renderer);
            const appearance = createLandscapeAppearanceUniforms(coverageSlots.total), payload = createLandscapeShaderPayload('terrain', { coverageSlots: coverageSlots.total });
            const warpUniforms = landscapeSurfaceWarpUniforms(recipe, seed);
            const jsWarp = createLandscapeSurfaceWarp({ seed, wavelengths: [...recipe.warp.wavelengths], amplitudes: [...recipe.warp.amplitudes], shaping: recipe.warp.shaping }), warpOut = new Float64Array(2);
            const geometry = new T.PlaneGeometry(256, 256).rotateX(-Math.PI / 2);
            geometry.setAttribute('parentHeight', new T.BufferAttribute(new Float32Array(4), 1));
            geometry.setAttribute('parentNormal', geometry.attributes.normal.clone());
            geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(12).fill(1), 3));
            const material = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true,
                uniforms: { ...appearance, uMorph: { value: 1 }, uEdges: { value: new T.Vector4() }, uEdgeMorph: { value: new T.Vector4(1, 1, 1, 1) },
                    uBounds: { value: new T.Vector4(-128, 128, -128, 128) }, uTint: { value: new T.Color(1, 1, 1) }, uLodColor: { value: 0 },
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
            const masks = new T.DataArrayTexture(pixels, width, width, capacity);
            masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false; masks.needsUpdate = true;
            appearance.uMaskPages.value = masks; resources.push(masks);
            const page = (level, column, row, extent = 64) => {
                const span = extent / 2 ** level, minX = -extent / 2 + column * span, maxZ = extent / 2 - row * span;
                const parent = level ? `l${level - 1}/c${column >> 1}/r${row >> 1}` : null;
                return { id: `l${level}/c${column}/r${row}`, level, column, row, parentId: parent, bounds: { minX, maxX: minX + span, minZ: maxZ - span, maxZ } };
            };
            const fill = (slot, descriptor, soilAt) => {
                const spacing = (descriptor.bounds.maxX - descriptor.bounds.minX) / (columns - 1);
                for (let row = 0; row < width; row++) for (let column = 0; column < width; column++) {
                    const soil = soilAt(descriptor.bounds.minX + (column - halo) * spacing, descriptor.bounds.maxZ - (row - halo) * spacing);
                    pixels.set([soil * 17, soil, 0, 240], (slot * width * width + row * width + column) * 4);
                }
            };
            const constant = soil => () => soil;
            const buffer = new Uint8Array(size * size * 4), snapshots = [];
            const difference = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));
            const render = (entries, { center = [0, 0], span = 8, warp = false } = {}) => {
                const records = new Map(entries.map(entry => [entry.descriptor.id, { status: 'resident', progress: 1, kind: entry.descriptor.level > nativeMaxLevel ? 'detail' : 'native', ...entry, id: entry.descriptor.id }]));
                masks.needsUpdate = true;
                setLandscapeSurfaceWarpUniforms(appearance, warpUniforms, warp);
                LandscapeMaskPages.prototype.updateUniforms.call({ records, capacity, slotCount: capacity, nativeMaxLevel, uniforms: appearance });
                camera.left = camera.bottom = -span / 2; camera.right = camera.top = span / 2;
                camera.position.set(center[0], 100, center[1]); camera.lookAt(center[0], 0, center[1]); camera.updateProjectionMatrix();
                material.uniformsNeedUpdate = true; renderer.render(scene, camera);
                gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
                const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`Landscape GPU probe WebGL error ${error}`);
                return { records, center, span };
            };
            const pixelAt = (frame, x, z) => {
                const column = Math.max(0, Math.min(size - 1, Math.floor((x - frame.center[0]) / frame.span * size + size / 2)));
                const row = Math.max(0, Math.min(size - 1, Math.floor((frame.center[1] - z) / frame.span * size + size / 2)));
                return Array.from(buffer.slice((row * size + column) * 4, (row * size + column) * 4 + 3));
            };
            const bilinear = (source, frame, x, z) => {
                const fx = (x - frame.center[0]) / frame.span * size + size / 2 - .5, fy = (frame.center[1] - z) / frame.span * size + size / 2 - .5;
                const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, at = (column, row) => (Math.max(0, Math.min(size - 1, row)) * size + Math.max(0, Math.min(size - 1, column))) * 4;
                return [0, 1, 2].map(channel => (source[at(x0, y0) + channel] * (1 - tx) + source[at(x0 + 1, y0) + channel] * tx) * (1 - ty) + (source[at(x0, y0 + 1) + channel] * (1 - tx) + source[at(x0 + 1, y0 + 1) + channel] * tx) * ty);
            };
            const seam = (entries, options = {}) => {
                const frame = render(entries, options), [cx, cz] = frame.center, halfPixel = frame.span / size / 2, strip = [];
                for (let offset = -3; offset <= 3; offset++) {
                    strip.push({ axis: 'x', offset, negative: pixelAt(frame, cx - halfPixel, cz + offset * frame.span / 8), positive: pixelAt(frame, cx + halfPixel, cz + offset * frame.span / 8) });
                    strip.push({ axis: 'z', offset, negative: pixelAt(frame, cx + offset * frame.span / 8, cz - halfPixel), positive: pixelAt(frame, cx + offset * frame.span / 8, cz + halfPixel) });
                }
                const corner = [-1, 1].flatMap(sx => [-1, 1].map(sz => pixelAt(frame, cx + sx * halfPixel, cz + sz * halfPixel)));
                let excess = 0;
                for (let step = 0; step < 96; step++) {
                    const z = cz + (step / 95 - .5) * frame.span * .9, at = sign => pixelAt(frame, cx + sign * halfPixel, z);
                    excess = Math.max(excess, difference(at(-1), at(1)) - Math.max(difference(at(-3), at(-1)), difference(at(1), at(3))));
                }
                let adjacent = 0;
                for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
                    const index = (row * size + column) * 4;
                    for (const next of [column + 1 < size ? index + 4 : -1, row + 1 < size ? index + size * 4 : -1]) {
                        if (next >= 0) for (let channel = 0; channel < 3; channel++) adjacent = Math.max(adjacent, Math.abs(buffer[index + channel] - buffer[next + channel]));
                    }
                }
                if (options.capture) snapshots.push({ id: options.capture, dataUrl: renderer.domElement.toDataURL('image/png') });
                return { center: frame.center, span: frame.span, warp: options.warp ?? false, strip,
                    verticalJumpBytes: Math.max(...strip.filter(sample => sample.axis === 'x').map(sample => difference(sample.negative, sample.positive))),
                    horizontalJumpBytes: Math.max(...strip.filter(sample => sample.axis === 'z').map(sample => difference(sample.negative, sample.positive))),
                    cornerJumpBytes: Math.max(...corner.flatMap(a => corner.map(b => difference(a, b)))), frameAdjacentBytes: adjacent, borderExcessBytes: excess,
                    centerPixel: pixelAt(frame, cx + halfPixel, cz + halfPixel), probePixel: options.probe ? pixelAt(frame, ...options.probe) : null, neighbors: [...frame.records.values()].filter(record => record.status === 'resident')
                        .map(record => ({ id: record.id, kind: record.kind, progress: record.progress, neighbors: record.neighborProgress })) };
            };
            try {
                const root = page(0, 0, 0), natives = [page(1, 0, 0), page(1, 1, 0), page(1, 0, 1), page(1, 1, 1)];
                const l4 = { west: page(2, 1, 1), east: page(2, 2, 1), southWest: page(2, 1, 2), southEast: page(2, 2, 2) };
                const l5 = { west: page(3, 3, 3), east: page(3, 4, 3), southWest: page(3, 3, 4) };
                const l6 = { west: page(4, 7, 7), east: page(4, 8, 7) };
                const stripes = (period, low, high) => (x, z) => ((Math.floor((x + .37 * z) / period) % 2) + 2) % 2 ? high : low;
                const slot = { root: 0, n0: 1, n1: 2, n2: 3, n3: 4, l4w: 5, l4e: 6, l4sw: 7, l4se: 8, l5w: 9, l5e: 10, l5sw: 11, l6w: 12, l6e: 13 };
                const base = [{ descriptor: root, slot: slot.root }, ...natives.map((descriptor, index) => ({ descriptor, slot: slot[`n${index}`] }))];
                fill(slot.root, root, constant(2)); natives.forEach((descriptor, index) => fill(slot[`n${index}`], descriptor, constant(2)));
                const l4Slots = { west: slot.l4w, east: slot.l4e, southWest: slot.l4sw, southEast: slot.l4se };
                for (const [name, descriptor] of Object.entries(l4)) fill(l4Slots[name], descriptor, constant(2));
                fill(slot.l5w, l5.west, constant(3)); fill(slot.l5e, l5.east, constant(3)); fill(slot.l5sw, l5.southWest, constant(3));
                const generated = [{ descriptor: l4.west, slot: slot.l4w }, { descriptor: l4.east, slot: slot.l4e }, { descriptor: l4.southWest, slot: slot.l4sw }, { descriptor: l4.southEast, slot: slot.l4se }];
                // adjacent L6 pages carrying one world-anchored striped field across their shared border and halos
                const field = stripes(2, 2, 4);
                fill(slot.l6w, l6.west, field); fill(slot.l6e, l6.east, field);
                const fullL5 = [{ descriptor: l5.west, slot: slot.l5w }, { descriptor: l5.east, slot: slot.l5e }, { descriptor: l5.southWest, slot: slot.l5sw }];
                const adjacentL6 = [false, true].map(warp => seam([...base, ...generated, ...fullL5, { descriptor: l6.west, slot: slot.l6w }, { descriptor: l6.east, slot: slot.l6e }],
                    { center: [0, 2], span: 4, warp, capture: warp ? null : '11-adjacent-l6-striped-border' }));
                // mixed L5/L6 corner with unequal arrival: L5 neighbors at 1, p and .35, a missing L5 quadrant and a resident L6 child at the corner
                fill(slot.l6w, l6.west, constant(4));
                const mixedCorner = [0, .25, .5, .75, 1].flatMap(progress => [false, true].map(warp => ({ progress, warp,
                    ...seam([...base, ...generated, { descriptor: l5.west, slot: slot.l5w, progress: 1 }, { descriptor: l5.east, slot: slot.l5e, progress },
                        { descriptor: l5.southWest, slot: slot.l5sw, progress: .35 }, { descriptor: l6.west, slot: slot.l6w, progress: 1 }],
                    { center: [0, 0], span: 8, warp, capture: progress === .5 && !warp ? '12-mixed-l5-l6-corner' : null }) })));
                // native to L4 edge: the east L4 page is missing, so the native hierarchy (warped when enabled) takes the remaining weight
                fill(slot.l4w, l4.west, constant(4)); fill(slot.n0, natives[0], constant(3)); fill(slot.n1, natives[1], constant(3));
                const nativeEdge = Array.from({ length: 21 }, (_, step) => step / 20).flatMap(progress => [false, true].map(warp => ({ progress, warp,
                    ...seam([...base, { descriptor: l4.west, slot: slot.l4w, progress }], { center: [0, 8], span: 16, warp, probe: [-6, 8], capture: progress === .5 && warp ? '13-native-l4-edge-warped' : null }) })));
                const nativeTemporal = [false, true].map(warp => {
                    const frames = nativeEdge.filter(value => value.warp === warp);
                    return { warp, temporalMaxBytes: Math.max(...frames.slice(1).map((frame, index) => difference(frame.probePixel, frames[index].probePixel))),
                        arrivalBytes: difference(frames[0].probePixel, frames.at(-1).probePixel) };
                });
                fill(slot.n0, natives[0], constant(2)); fill(slot.n1, natives[1], constant(2)); fill(slot.l4w, l4.west, constant(2));
                // uniform neighbor: the east L6 page is uniform (no slot) beside a resident L6 page, and a uniform L5 ancestor counts for its descendants
                fill(slot.l6w, l6.west, constant(4)); fill(slot.l5e, l5.east, constant(3));
                const uniformEast = { descriptor: l6.east, slot: -1, status: 'uniform', soil: 4 };
                const uniformNeighbor = { different: seam([...base, ...generated, ...fullL5, { descriptor: l6.west, slot: slot.l6w }, uniformEast], { center: [0, 2], span: 4, capture: '14-uniform-l6-neighbor' }) };
                const interior = pixelAt({ center: [0, 2], span: 4 }, -1, 2);
                render([...base, ...generated, ...fullL5, { descriptor: l6.west, slot: slot.l6w }, uniformEast], { center: [0, 2], span: 4 });
                uniformNeighbor.insideEdge = pixelAt({ center: [0, 2], span: 4 }, -4 / size, 2);
                uniformNeighbor.interior = pixelAt({ center: [0, 2], span: 4 }, -1, 2);
                for (const [target, descriptor] of [[slot.l5e, l5.east], [slot.l5w, l5.west], [slot.l4e, l4.east], [slot.l4w, l4.west]]) fill(target, descriptor, constant(4));
                uniformNeighbor.same = seam([...base, ...generated, ...fullL5, { descriptor: l6.west, slot: slot.l6w }, uniformEast], { center: [0, 2], span: 4, capture: '14b-uniform-l6-neighbor-matching' });
                uniformNeighbor.ancestor = seam([...base, ...generated, { descriptor: l5.west, slot: slot.l5w }, { descriptor: l5.east, slot: -1, status: 'uniform', soil: 4 },
                    { descriptor: l5.southWest, slot: slot.l5sw }, { descriptor: l6.west, slot: slot.l6w }], { center: [0, 2], span: 4 });
                fill(slot.l4e, l4.east, constant(2)); fill(slot.l4w, l4.west, constant(2)); fill(slot.l5w, l5.west, constant(3));
                // warp-enabled native border: two native pages share one striped field; selection by warped containment keeps the border invisible
                const nativeField = stripes(8, 2, 3);
                natives.forEach((descriptor, index) => fill(slot[`n${index}`], descriptor, nativeField)); fill(slot.root, root, nativeField);
                const warpedBorder = [false, true].map(warp => seam([...base], { center: [0, 6], span: 16, warp, capture: warp ? '15-warped-native-border' : null }));
                // GPU warp alignment: warped rendering at p equals unwarped rendering at p + W(p) from the JavaScript recipe warp
                const alignmentFrame = { center: [-14, 14], span: 12 };
                render([...base], { ...alignmentFrame, warp: false });
                const unwarped = buffer.slice();
                render([...base], { ...alignmentFrame, warp: true });
                let alignmentMax = 0, alignmentSum = 0, alignmentCount = 0, warpMax = 0;
                for (let step = 0; step < 400; step++) {
                    const x = -17 + (step % 20) * .3 + .013, z = 11 + Math.floor(step / 20) * .3 + .007;
                    jsWarp.evaluate(x, z, warpOut);
                    warpMax = Math.max(warpMax, Math.hypot(warpOut[0], warpOut[1]));
                    const warped = bilinear(buffer, alignmentFrame, x, z), reference = bilinear(unwarped, alignmentFrame, x + warpOut[0], z + warpOut[1]);
                    const delta = Math.max(...warped.map((value, channel) => Math.abs(value - reference[channel])));
                    alignmentMax = Math.max(alignmentMax, delta); alignmentSum += delta; alignmentCount++;
                }
                snapshots.push({ id: '16-warp-alignment-warped', dataUrl: renderer.domElement.toDataURL('image/png') });
                return { renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), coverageSlots, adjacentL6, mixedCorner, nativeEdge, nativeTemporal, uniformNeighbor, warpedBorder,
                    warpAlignment: { samples: alignmentCount, maxBytes: alignmentMax, meanBytes: alignmentSum / alignmentCount, maxWarpMeters: warpMax }, snapshots };
            } finally {
                for (const resource of resources) resource.dispose();
                geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss();
            }
        });
        const { snapshots, ...measurements } = result;
        Object.assign(report, measurements);
        for (const snapshot of snapshots) await writeFile(path.join(detailArtifacts, `${snapshot.id}.png`), Buffer.from(snapshot.dataUrl.split(',')[1], 'base64'));
        expect(report.errors).toEqual([]);
        const seamless = (sample, label) => {
            expect(sample.verticalJumpBytes, `${label}: vertical border`).toBeLessThanOrEqual(3);
            expect(sample.horizontalJumpBytes, `${label}: horizontal border`).toBeLessThanOrEqual(3);
            expect(sample.cornerJumpBytes, `${label}: corner`).toBeLessThanOrEqual(3);
        };
        for (const sample of report.adjacentL6) {
            expect(sample.borderExcessBytes, `Adjacent L6 border jump beyond the local field gradient (warp ${sample.warp})`).toBeLessThanOrEqual(3);
            expect(sample.frameAdjacentBytes, `Adjacent L6 striped field has no hard edge anywhere (warp ${sample.warp})`).toBeLessThanOrEqual(12);
        }
        expect(report.adjacentL6[0].frameAdjacentBytes, 'generated slots are sampled unwarped').toBe(report.adjacentL6[1].frameAdjacentBytes);
        for (const sample of report.mixedCorner) seamless(sample, `Mixed L5/L6 corner at progress ${sample.progress} (warp ${sample.warp})`);
        for (const sample of report.nativeEdge) expect(sample.verticalJumpBytes, `Native/L4 edge at progress ${sample.progress} (warp ${sample.warp})`).toBeLessThanOrEqual(3);
        for (const sample of report.nativeTemporal) {
            expect(sample.temporalMaxBytes, `Native/L4 arrival steps (warp ${sample.warp})`).toBeLessThanOrEqual(12);
            expect(sample.arrivalBytes, `The L4 page actually fades in over its native parent (warp ${sample.warp})`).toBeGreaterThan(30);
        }
        const east = report.uniformNeighbor.different.neighbors.find(entry => entry.id === 'l4/c7/r7');
        expect(east.neighbors[4], 'a uniform same-level neighbor counts as fully available').toBe(1);
        expect(maxDifference(report.uniformNeighbor.insideEdge, report.uniformNeighbor.interior), 'no fade toward the parent beside a uniform neighbor').toBeLessThanOrEqual(3);
        seamless(report.uniformNeighbor.same, 'Uniform L6 neighbor with matching parent content');
        expect(report.uniformNeighbor.ancestor.neighbors.find(entry => entry.id === 'l4/c7/r7').neighbors[4], 'descendants of a uniform page count as available').toBe(1);
        seamless(report.uniformNeighbor.ancestor, 'Uniform L5 ancestor beside an L6 page');
        for (const sample of report.warpedBorder) {
            expect(sample.borderExcessBytes, `Native border jump beyond the local striped-field gradient (warp ${sample.warp})`).toBeLessThanOrEqual(3);
            expect(sample.frameAdjacentBytes, `Native striped field has no hard edge anywhere (warp ${sample.warp})`).toBeLessThanOrEqual(12);
        }
        expect(report.warpAlignment.maxWarpMeters, 'the recipe warp actually displaces the probe').toBeGreaterThan(.2);
        expect(report.warpAlignment.maxBytes, 'GPU warp matches the JavaScript recipe warp').toBeLessThanOrEqual(4);
        report.complete = true;
    } finally {
        await context.close();
        await writeFile(path.join(detailArtifacts, 'report.json'), JSON.stringify(report, null, 2));
    }
});
