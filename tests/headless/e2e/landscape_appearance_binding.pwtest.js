// Verifies that pinned older terrain revisions still resolve their authenticated matching appearance after material rebinds, and how they meet the
// later sidecars: the AI577 D4 multiscale companion extends only the current appearance (explicit schema-1 fallback), while the AI577 D5 terrain
// fields bind by native channel hashes, which a material-only revision shares, so they stay active and fresh.
import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCoastalLandscapeCitySpec } from '../../../src/app/city/specs/CoastalLandscapeCitySpec.js';
import { landscapeAppearanceBindingKey } from '../../../src/app/landscape/index.js';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

const binding = createCoastalLandscapeCitySpec().landscape;
const directory = binding.manifestUrl.slice(0, binding.manifestUrl.lastIndexOf('/'));
const artifacts = path.resolve('tests/artifacts/screens/landscape', process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'nature', 'pinned-appearance');
const multiscale = JSON.parse(await readFile(path.resolve(directory, 'appearance/multiscale.json'), 'utf8'));
const fields = JSON.parse(await readFile(path.resolve(directory, 'fields/manifest.json'), 'utf8'));
const pinned = [
    { id: 'city-pin', url: binding.manifestUrl, sand: 'pbr.coast_sand_rocks_02' },
    { id: 'nature-pass', url: `${directory}/manifest.12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b.json`, sand: 'pbr.aerial_beach_01' }
];
const shore = { position: [1030, 14.2, 1390], target: [1102, .2, 1445], projection: 'perspective', fov: 55, zoom: 1 };

for (const revision of pinned) {
    test(`Landscape appearance binding: the ${revision.id} revision loads its retained material pages, falls back from the companion explicitly, keeps fresh terrain fields and releases resources`, async ({ page }) => {
        test.setTimeout(150000);
        const manifest = JSON.parse(await readFile(path.resolve(revision.url), 'utf8')), key = await landscapeAppearanceBindingKey(manifest);
        const errors = [], aliases = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/\/appearance\/binding\.[a-f0-9]{64}\.json$/.test(request.url())) aliases.push(request.url()); });
        page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
        await mkdir(artifacts, { recursive: true });
        await page.setViewportSize({ width: 1920, height: 1080 });
        try {
            await page.goto(landscapeViewerUrl(`/screens/landscape_fabrication.html?landscape=${encodeURIComponent(`/${revision.url}`)}`));
            await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 60000 });
            await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), shore);
            await expect.poll(() => page.evaluate(() => {
                const state = window.__landscapeTestHooks.snapshot();
                return state.appearance?.ready && state.appearance?.settled && state.streaming?.settled;
            }), { timeout: 90000 }).toBe(true);
            const loaded = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
            expect(loaded.revision).toBe(manifest.revision);
            expect(loaded.appearance.errors).toEqual([]);
            expect(loaded.appearance.materials.find(material => material.soilId === 'sand').materialId).toBe(revision.sand);
            expect(aliases).toHaveLength(1);
            expect(aliases[0]).toContain(`/appearance/binding.${key}.json`);
            // the companion names the current appearance and binding key: an older binding falls back to the schema-1 tiers with an explicit reason
            expect(key).not.toBe(multiscale.bindingKey);
            expect(loaded.appearance.multiscale).toMatchObject({ status: 'invalid', active: false, maxResolution: 512 });
            expect(loaded.appearance.multiscale.reason).toMatch(/^multiscale-binding-mismatch: .*multiscale extends appearance /);
            expect(loaded.appearance.materials.every(material => material.maps === 3 && material.micro === null && material.tiers.join(',') === '32,128,512')).toBe(true);
            // the fields sidecar binds the current revision, but staleness compares native channel hashes: a material-only revision is fresh everywhere
            expect(fields.terrain.revision).not.toBe(manifest.revision);
            expect(loaded.appearance.terrainFields).toMatchObject({ status: 'active', bound: false, staleChunks: [], terrainRevision: fields.terrain.revision, currentTerrainRevision: manifest.revision });
            expect(loaded.appearance.terrainFields.residentPages.length).toBeGreaterThan(0);
            expect(loaded.appearance.terrainFields.appearanceLayerState.status).toBe('resident');
            expect(loaded.appearance.presentation).toMatchObject({ status: 'active', policy: 'natural-terrain-inference-v1', natives: { total: 64, terrain: 64, overview: 0 } });
            expect(loaded.lighting.status).toBe('ready');
            expect(await page.evaluate(() => window.__testFatals ?? [])).toEqual([]);
            expect(loaded.budget.peakCpuBytes).toBeLessThanOrEqual(loaded.budget.limits.cpuBytes);
            expect(loaded.budget.peakGpuBytes).toBeLessThanOrEqual(loaded.budget.limits.gpuBytes);
            expect(errors).toEqual([]);
            await page.screenshot({ path: path.join(artifacts, `${revision.id}-shore.png`) });
            await page.evaluate(() => window.__landscapeTestHooks.dispose());
            const disposed = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
            expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
            await writeFile(path.join(artifacts, `${revision.id}-verification.json`), JSON.stringify({ revision, key, aliases, loaded, disposed, errors }, null, 2));
        } finally { await page.close(); }
    });
}
