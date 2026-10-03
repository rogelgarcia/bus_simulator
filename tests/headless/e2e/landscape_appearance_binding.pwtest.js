// Verifies that a pinned original terrain still resolves its authenticated matching appearance after a material rebind.
import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCoastalLandscapeCitySpec } from '../../../src/app/city/specs/CoastalLandscapeCitySpec.js';
import { landscapeAppearanceBindingKey } from '../../../src/app/landscape/index.js';

const binding = createCoastalLandscapeCitySpec().landscape;
const manifest = JSON.parse(await readFile(path.resolve(binding.manifestUrl), 'utf8'));
const key = await landscapeAppearanceBindingKey(manifest);
const artifacts = path.resolve('tests/artifacts/screens/landscape', process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'nature', 'pinned-appearance');

test('Landscape appearance binding: original city terrain pin loads its retained material pages and releases resources', async ({ page }) => {
    test.setTimeout(90000);
    const errors = [], aliases = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/appearance\/binding\.[a-f0-9]{64}\.json$/.test(request.url())) aliases.push(request.url()); });
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
    await mkdir(artifacts, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    try {
        await page.goto(`/screens/landscape_fabrication.html?landscape=${encodeURIComponent(`/${binding.manifestUrl}`)}`);
        await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 60000 });
        await expect.poll(() => page.evaluate(() => {
            const state = window.__landscapeTestHooks.snapshot();
            return state.appearance?.ready && state.appearance?.settled && state.streaming?.settled;
        }), { timeout: 60000 }).toBe(true);
        const loaded = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
        expect(loaded.revision).toBe(manifest.revision);
        expect(loaded.appearance.errors).toEqual([]);
        expect(loaded.appearance.materials.find(material => material.soilId === 'sand').materialId).toBe('pbr.coast_sand_rocks_02');
        expect(aliases).toHaveLength(1);
        expect(aliases[0]).toContain(`/appearance/binding.${key}.json`);
        expect(loaded.budget.peakCpuBytes).toBeLessThanOrEqual(loaded.budget.limits.cpuBytes);
        expect(loaded.budget.peakGpuBytes).toBeLessThanOrEqual(loaded.budget.limits.gpuBytes);
        expect(errors).toEqual([]);
        await page.evaluate(() => window.__landscapeTestHooks.dispose());
        const disposed = await page.evaluate(() => window.__landscapeTestHooks.snapshot());
        expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
        await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ aliases, loaded, disposed, errors }, null, 2));
    } finally { await page.close(); }
});
