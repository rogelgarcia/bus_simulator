// Renders every layers-companion material at one tile and four repeats through the production terrain shading with its landscape calibration.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const enabled = process.env.LANDSCAPE_MATERIAL_AUDIT === '1';
const directory = path.resolve(process.env.LANDSCAPE_LAYERS_DIRECTORY ?? 'assets/public/landscape/coastal-city-v3/appearance');
const artifacts = path.resolve(process.env.LANDSCAPE_LAYERS_AUDIT_OUTPUT ?? 'tests/artifacts/screens/landscape/ai598/d2/audit');
const tiers = (process.env.LANDSCAPE_LAYERS_AUDIT_TIERS ?? '512,1024').split(',').map(Number);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
test.use({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, trace: 'off', video: 'off' });

test('Landscape layers: every companion material renders homogeneous repeats with the production shading and its own calibration and response', async ({ browser }, testInfo) => {
    test.skip(!enabled, 'Set LANDSCAPE_MATERIAL_AUDIT=1 to capture the explicit local layers material audit');
    test.setTimeout(900000);
    const baseURL = String(testInfo.project.use.baseURL); expect(new URL(baseURL).port).toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const layersBytes = await readFile(path.join(directory, 'layers.json')), layers = JSON.parse(layersBytes.toString('utf8'));
    const resources = new Map(), report = { format: 'landscape-material-layers-audit', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(), directory, layersRevision: layers.revision,
        layersSha256: hash(layersBytes), appearanceRevision: layers.appearanceRevision,
        conditions: { tilePixels: 512, repeats: [1, 4], tiers, shader: 'production landscape PBR (lighting tier low, terrain appearance off)', toneMapping: 'ACES', exposure: 1.2,
            lighting: 'fixed reference probe illumination of the material probe', sampling: 'single unrotated lattice sample (stochastic tiling off) so the raw repeats show',
            calibration: 'landscape material calibration (albedo gain, mean normal de-leaning) and the material response of LANDSCAPE_SURFACE_MATERIALS',
            framing: 'one calibrated period and four-by-four repeats, orthographic nadir view' },
        materials: [], images: [], errors: [] };
    for (const material of layers.materials) for (const tier of tiers) {
        const definition = material.tiers.find(value => value.resolution === tier);
        expect(definition, `${material.classId} has a ${tier} tier`).toBeTruthy();
        for (const [name, channel] of Object.entries(definition.channels)) {
            const bytes = await readFile(path.join(directory, channel.url));
            expect(hash(bytes)).toBe(channel.sha256);
            resources.set(`/__landscape-layers-audit/${material.classId}/${tier}/${name}`, { contentType: 'application/octet-stream', body: bytes });
        }
    }
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 }), page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) report.errors.push(message.text()); });
    try {
        for (const file of ['landscape_surface_probe.html', 'landscape_material_probe.js']) resources.set(`/tests/headless/e2e/fixtures/${file}`, {
            contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: await readFile(`tests/headless/e2e/fixtures/${file}`, 'utf8') });
        await page.route('**/*', request => {
            const resource = resources.get(new URL(request.request().url()).pathname);
            return resource ? request.fulfill(resource) : request.fallback();
        });
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const result = await page.evaluate(async ({ materials, tiers }) => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const { LandscapeMaterialPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaterialPages.js');
            const { landscapeSurfaceMaterialDefinition } = await import('/src/graphics/engine3d/landscape/LandscapeSurfaceMaterials.js');
            const probe = createLandscapeMaterialProbe({ toneMapping: true }), images = [], records = [];
            try {
                for (const material of materials) {
                    // one stand-in soil slot per material: the pages owner resolves the catalog calibration and the landscape calibration of the material id itself
                    const appearance = { materials: [{ ...material, soilId: 'loam', tiers: material.tiers.filter(tier => tier.resolution <= 512) }] };
                    const owner = new LandscapeMaterialPages({ appearance, renderer: probe.renderer, uniforms: probe.uniforms, prefix: 'layers-audit' });
                    await owner.initialize();
                    const definition = landscapeSurfaceMaterialDefinition(material.materialId), slot = owner.materials[0];
                    probe.uniforms.uSoilResponse.value[0].set(definition.response.diffuseRoughness, definition.response.specularShadowing, ...slot.calibration.meanNormalSlope);
                    probe.uniforms.uSoilState.value[0].w = definition.response.opposition;
                    records.push({ classId: material.classId, materialId: material.materialId, calibration: slot.pipeline.overrides.effective, landscapeCalibration: slot.calibration,
                        response: definition.response, albedoBrightness: probe.uniforms.uSoilAlbedo.value[0].x });
                    for (const tier of tiers) {
                        const loaded = await Promise.all(['baseColor', 'normal', 'orm'].map(async name => new Uint8Array(await (await fetch(`/__landscape-layers-audit/${material.classId}/${tier}/${name}`)).arrayBuffer())));
                        const surface = new Uint8Array(tier * tier * 8); surface.set(loaded[1]); surface.set(loaded[2], loaded[1].length);
                        const baseTexture = probe.texture(loaded[0], tier, 1, true), surfaceTexture = probe.texture(surface, tier, 2);
                        owner.configure(baseTexture, true); owner.configure(surfaceTexture, false);
                        probe.uniforms.uSoilBase0.value = baseTexture; probe.uniforms.uSoilSurface0.value = surfaceTexture;
                        probe.uniforms.uSoilState.value[0].y = tier;
                        probe.setCoverage([1, 0, 0, 0, 0, 0]);
                        const period = probe.uniforms.uSoilTiling.value[0].x;
                        for (const repeats of [1, 4]) {
                            const span = period * repeats; probe.setCenter([span / 2, span / 2]); probe.draw({ span });
                            images.push({ id: `${material.materialId}${tier === 512 ? '' : `-${tier}`}-${repeats}x`, classId: material.classId, kind: material.kind, materialId: material.materialId, tier, repeats,
                                periodMeters: period, spanMeters: span, dataUrl: probe.snapshot() });
                        }
                        baseTexture.dispose(); surfaceTexture.dispose();
                    }
                }
                return { renderer: probe.rendererName, images, records };
            } finally { probe.dispose(); }
        }, { materials: layers.materials, tiers });
        report.renderer = result.renderer; report.materials = result.records;
        for (const { dataUrl, ...entry } of result.images) {
            const bytes = Buffer.from(dataUrl.split(',')[1], 'base64'), file = `${entry.id}.png`;
            await writeFile(path.join(artifacts, file), bytes);
            report.images.push({ ...entry, file, sha256: hash(bytes) });
            resources.set(`/__landscape-layers-audit/${file}`, { contentType: 'image/png', body: bytes });
        }
        const stylesheet = await readFile('tests/headless/e2e/fixtures/landscape_material_audit.css');
        await writeFile(path.join(artifacts, 'audit.css'), stylesheet);
        resources.set('/__landscape-layers-audit/audit.css', { contentType: 'text/css', body: stylesheet });
        await page.setViewportSize({ width: 2048, height: 600 });
        for (const material of layers.materials) {
            const entries = tiers.flatMap(tier => [1, 4].map(repeats => report.images.find(value => value.materialId === material.materialId && value.tier === tier && value.repeats === repeats)));
            const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${material.classId} layers material audit</title><link rel="stylesheet" href="audit.css"></head><body><main>${entries.map(entry => `<section><header><h1>${material.classId} · ${entry.tier} px · ${entry.repeats}×${entry.repeats}</h1><p>${entry.materialId} · ${entry.periodMeters} m tile · ${material.kind}</p></header><img width="512" height="512" src="${entry.file}" alt="${material.classId} ${entry.tier} tier ${entry.repeats} repeats with production PBR"></section>`).join('')}</main></body></html>`;
            resources.set(`/__landscape-layers-audit/${material.materialId}.html`, { contentType: 'text/html', body: html });
            await writeFile(path.join(artifacts, `${material.materialId}.html`), html);
            await page.goto(`/__landscape-layers-audit/${material.materialId}.html`);
            await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
            expect(await page.locator('img').evaluateAll(images => images.map(image => [image.naturalWidth, image.naturalHeight]))).toEqual(Array(entries.length).fill([512, 512]));
            await page.screenshot({ path: path.join(artifacts, `${material.materialId}-sheet.png`) });
        }
        expect(report.images).toHaveLength(layers.materials.length * tiers.length * 2); expect(report.errors).toEqual([]); report.complete = true;
    } finally { await context.close(); await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); }
});
