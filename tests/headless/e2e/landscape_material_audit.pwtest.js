// Captures actual retained PBR pages at one tile and four repeats with the production terrain shading pipeline.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d1a/materials/pbr');
const enabled = process.env.LANDSCAPE_MATERIAL_AUDIT === '1';
const source = path.resolve('assets/public/landscape/coastal-city/appearance');
const candidate = path.resolve(process.env.LANDSCAPE_MATERIAL_CANDIDATE ?? path.join(source, 'manifest.json'));
test.use({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, trace: 'off', video: 'off' });

test('Landscape materials: matched old/new production PBR sheets expose homogeneous material repeats', async ({ browser }, testInfo) => {
    test.skip(!enabled, 'Set LANDSCAPE_MATERIAL_AUDIT=1 to capture the explicit local material audit');
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL); expect(new URL(baseURL).port).toBe('8002');
    await mkdir(artifacts, { recursive: true });
    const beforeBytes = await readFile('tests/artifacts/screens/landscape/ai577/d1a/before/appearance-manifest.json'), afterBytes = await readFile(candidate);
    const baselineInputs = JSON.parse(await readFile('tests/artifacts/screens/landscape/ai577/d1a/before/material-inputs.json', 'utf8'));
    for (const config of baselineInputs.configs) expect(createHash('sha256').update(await readFile(config.path)).digest('hex'), `Retained baseline calibration ${config.path}`).toBe(config.sha256);
    const phases = [{ id: 'before', appearance: JSON.parse(beforeBytes), directory: source, hash: createHash('sha256').update(beforeBytes).digest('hex') },
        { id: 'after', appearance: JSON.parse(afterBytes), directory: path.dirname(candidate), hash: createHash('sha256').update(afterBytes).digest('hex') }];
    const resources = new Map(), report = { format: 'landscape-material-production-audit', schemaVersion: 1, complete: false, createdAt: new Date().toISOString(),
        conditions: { tilePixels: 512, repeats: [1, 4], tier: 512, shader: 'production landscape PBR', normalAoRoughness: true, toneMapping: 'ACES', exposure: 1.2,
            lighting: 'unchanged terrain shader fixed directional and hemisphere lighting', textureFiltering: 'production trilinear and anisotropy configuration',
            framing: 'One full calibrated near-period and four-by-four repeats; repeat views start at the production macro-blend threshold where its weight is zero.' },
        phases: [], images: [], errors: [] };
    for (const phase of phases) {
        report.phases.push({ id: phase.id, appearanceRevision: phase.appearance.revision, manifestSha256: phase.hash });
        for (const definition of phase.appearance.materials) {
            const tier = definition.tiers.find(value => value.resolution === 512);
            expect(tier).toBeTruthy();
            for (const [name, channel] of Object.entries(tier.channels)) {
                const bytes = await readFile(path.resolve(phase.directory, channel.url));
                expect(createHash('sha256').update(bytes).digest('hex')).toBe(channel.sha256);
                resources.set(`/__landscape-material-audit/${phase.id}/${definition.soilId}/${name}`, { contentType: 'application/octet-stream', body: bytes });
            }
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
        const result = await page.evaluate(async phases => {
            const { createLandscapeMaterialProbe } = await import('/tests/headless/e2e/fixtures/landscape_material_probe.js');
            const { LandscapeMaterialPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaterialPages.js');
            const probe = createLandscapeMaterialProbe({ toneMapping: true }), images = [];
            try {
                for (const phase of phases) {
                    const owner = new LandscapeMaterialPages({ appearance: phase.appearance, renderer: probe.renderer, uniforms: probe.uniforms, prefix: 'audit' });
                    await owner.initialize();
                    for (let soil = 0; soil < phase.appearance.materials.length; soil++) {
                        const definition = phase.appearance.materials[soil], tier = definition.tiers.find(value => value.resolution === 512);
                        const loaded = await Promise.all(['baseColor', 'normal', 'orm'].map(async name => new Uint8Array(await (await fetch(`/__landscape-material-audit/${phase.id}/${definition.soilId}/${name}`)).arrayBuffer())));
                        const surface = new Uint8Array(512 * 512 * 8); surface.set(loaded[1]); surface.set(loaded[2], loaded[1].length);
                        const baseTexture = probe.texture(loaded[0], 512, 1, true), surfaceTexture = probe.texture(surface, 512, 2);
                        owner.configure(baseTexture, true); owner.configure(surfaceTexture, false);
                        probe.uniforms[`uSoilBase${soil}`].value = baseTexture; probe.uniforms[`uSoilSurface${soil}`].value = surfaceTexture;
                        probe.uniforms.uSoilState.value[soil].y = 512;
                        probe.setCoverage(Array.from({ length: 6 }, (_, index) => index === soil ? 1 : 0));
                        const period = probe.uniforms.uSoilTiling.value[soil].x;
                        for (const repeats of [1, 4]) {
                            const span = period * repeats; probe.setCenter([span / 2, span / 2]); probe.draw({ span });
                            images.push({ id: `${definition.soilId}-${phase.id}-${repeats}x`, phase: phase.id, soilId: definition.soilId, materialId: definition.materialId, repeats,
                                periodMeters: period, spanMeters: span, calibration: owner.materials[soil].pipeline.overrides.effective,
                                channels: tier.channels, dataUrl: probe.snapshot() });
                        }
                    }
                }
                return { renderer: probe.rendererName, images };
            } finally { probe.dispose(); }
        }, phases.map(({ id, appearance }) => ({ id, appearance })));
        report.renderer = result.renderer;
        for (const { dataUrl, ...entry } of result.images) {
            const bytes = Buffer.from(dataUrl.split(',')[1], 'base64'), file = `${entry.id}.png`;
            await writeFile(path.join(artifacts, file), bytes);
            report.images.push({ ...entry, file, sha256: createHash('sha256').update(bytes).digest('hex') });
            resources.set(`/__landscape-material-audit/${file}`, { contentType: 'image/png', body: bytes });
        }
        const stylesheet = await readFile('tests/headless/e2e/fixtures/landscape_material_audit.css');
        await writeFile(path.join(artifacts, 'audit.css'), stylesheet);
        resources.set('/__landscape-material-audit/audit.css', { contentType: 'text/css', body: stylesheet });
        await page.setViewportSize({ width: 2048, height: 600 });
        for (const soilId of phases[0].appearance.materials.map(value => value.soilId)) {
            const entries = ['before', 'after'].flatMap(phase => [1, 4].map(repeats => report.images.find(value => value.soilId === soilId && value.phase === phase && value.repeats === repeats)));
            const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${soilId} production PBR audit</title><link rel="stylesheet" href="audit.css"></head><body><main>${entries.map(entry => `<section><header><h1>${entry.phase.toUpperCase()} · ${soilId} · ${entry.repeats}×${entry.repeats}</h1><p>${entry.materialId} · ${entry.periodMeters} m tile · 512px tier</p></header><img width="512" height="512" src="${entry.file}" alt="${entry.phase} ${soilId} ${entry.repeats} repeats with production PBR"></section>`).join('')}</main></body></html>`;
            resources.set(`/__landscape-material-audit/${soilId}.html`, { contentType: 'text/html', body: html });
            await writeFile(path.join(artifacts, `${soilId}.html`), html);
            await page.goto(`/__landscape-material-audit/${soilId}.html`);
            await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
            expect(await page.locator('img').evaluateAll(images => images.map(image => [image.naturalWidth, image.naturalHeight]))).toEqual(Array(4).fill([512, 512]));
            await page.screenshot({ path: path.join(artifacts, `${soilId}-pbr-audit.png`) });
        }
        expect(report.images).toHaveLength(24); expect(report.errors).toEqual([]); report.complete = true;
    } finally { await context.close(); await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); }
});
