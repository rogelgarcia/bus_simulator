// Verifies coastal planning aids, native reports, bookmarks, reload, and resource release.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LANDSCAPE_SURFACE_SOIL_COLORS, landscapeColorBytes } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainDiagnostics.js';

const artifacts = path.resolve(`tests/artifacts/screens/landscape/ai576/${process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'd6'}/planning`);
const source = path.resolve('assets/public/landscape/coastal-city/manifest.json');
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const canvasGrid = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.getElementById('game-canvas'), gl = canvas.getContext('webgl2'), pixel = new Uint8Array(4), samples = [];
    for (let row = 1; row < 10; row++) for (let column = 1; column < 16; column++) {
        gl.readPixels(Math.floor(canvas.width * column / 16), Math.floor(canvas.height * row / 10), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.push([...pixel.slice(0, 3)]);
    }
    resolve(samples);
})));
async function settle(page) {
    await expect.poll(async () => { const state = await snapshot(page); return state.streaming?.settled && state.appearance?.settled && state.planning?.settled; }, { timeout: 45000 }).toBe(true);
    return snapshot(page);
}

test('Landscape D6: retained references, diagnostic modes, native report, persistent bookmark, and disposal', async ({ page }) => {
    test.setTimeout(180000);
    await mkdir(artifacts, { recursive: true });
    const beforeBytes = await readFile(source), errors = [], captures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 60000 });
    await expect.poll(async () => (await snapshot(page)).planning?.ready, { timeout: 20000 }).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.setPlanning({ districts: true, roads: true, shoreline: true, points: true, corridors: true }));
    await page.evaluate(() => window.__landscapeTestHooks.preset('top'));
    const planned = await settle(page); captures.push({ phase: 'planning', state: planned });
    expect(planned.planning.errors).toEqual([]);
    expect(planned.planning.gpuBytes).toBeGreaterThan(0);
    expect(planned.planning.features.filter(feature => feature.kind === 'district')).toHaveLength(7);
    expect(planned.planning.features.some(feature => feature.id === 'point/bus-stop-reservation')).toBe(true);
    expect(planned.planning.features.filter(feature => feature.kind === 'road').every(feature => Number.isFinite(feature.firstPoint.y))).toBe(true);
    await page.screenshot({ path: path.join(artifacts, '01-coastal-planning-overview.png') });
    expect(planned.terrainProgramVariant, 'AI577 D6: the default terrain program carries no inspection code').toMatchObject({ diagnostics: false, pending: false });
    for (const diagnostic of ['elevation', 'slope', 'water', 'surface-level', 'surface-coverage']) {
        await page.evaluate(diagnostic => window.__landscapeTestHooks.setPlanning({ diagnostic }), diagnostic);
        const state = await settle(page); expect(state.planning.diagnostic).toBe(diagnostic);
        expect(state.terrainProgramVariant, 'streaming settles once the diagnostics program is linked and bound').toMatchObject({ diagnostics: true, pending: false });
        captures.push({ phase: diagnostic, state });
        await page.screenshot({ path: path.join(artifacts, `02-diagnostic-${diagnostic}.png`) });
    }
    await expect(page.locator('[data-field="diagnostic-legend"]')).toContainText('before height competition');
    const palette = Object.entries(LANDSCAPE_SURFACE_SOIL_COLORS).map(([soilId, color]) => ({ soilId, bytes: landscapeColorBytes(color.hex) }));
    await page.evaluate(() => window.__landscapeTestHooks.setWater(false));
    const exactSoils = new Set((await canvasGrid(page)).flatMap(rgb => palette.filter(entry => entry.bytes.every((byte, channel) => byte === rgb[channel])).map(entry => entry.soilId)));
    await page.evaluate(() => window.__landscapeTestHooks.setWater(true));
    expect(exactSoils.size, `Pure coverage regions without the translucent water reference reproduce review colors exactly: ${[...exactSoils].join(', ')}`).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__landscapeTestHooks.setPlanning({ diagnostic: 'none' }));
    await page.evaluate(() => window.__landscapeTestHooks.focusReference('point/bus-stop-reservation'));
    expect((await settle(page)).terrainProgramVariant, 'returning to none rebinds the default program').toMatchObject({ diagnostics: false, pending: false });
    await page.evaluate(() => window.__landscapeTestHooks.saveBookmark('Beach planning study'));
    const saved = await snapshot(page), bookmark = saved.bookmarks.find(item => item.name === 'Beach planning study');
    expect(bookmark).toBeTruthy();
    await page.evaluate(() => window.__landscapeTestHooks.preset('home'));
    await page.evaluate(id => window.__landscapeTestHooks.focusBookmark(id), bookmark.id);
    const returned = await snapshot(page);
    for (const field of ['position', 'target']) returned.camera[field].forEach((value, index) => expect(value).toBeCloseTo(saved.camera[field][index], 9));
    await page.evaluate(async () => { window.__landscapeTestHooks.setSelectionRadius(80); await window.__landscapeTestHooks.select(1750, 1750); });
    await expect.poll(async () => (await snapshot(page)).selection?.editingReady).toBe(true);
    await page.evaluate(() => window.__landscapeTestHooks.reportSelection());
    const reported = await snapshot(page), report = reported.report.result;
    expect(reported.report.pending).toBe(false); expect(reported.report.error).toBeNull(); expect(report.status).toBe('ready');
    expect(report.sampling.nativeSpacingMeters).toBe(1.953125); expect(report.sampling.unknown).toBe(0);
    expect(report.resources.maxDecodedChunks).toBe(1); expect(report.elevation.min).toBeLessThanOrEqual(report.elevation.max);
    captures.push({ phase: 'report', state: reported });
    await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
    captures.push({ phase: 'report-focused', state: await settle(page) });
    await page.screenshot({ path: path.join(artifacts, '03-native-terrain-report.png') });
    await page.reload();
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready, null, { timeout: 60000 });
    expect((await snapshot(page)).bookmarks.some(item => item.id === bookmark.id)).toBe(true);
    await page.evaluate(id => window.__landscapeTestHooks.focusBookmark(id), bookmark.id);
    await settle(page);
    await page.evaluate(() => window.__landscapeTestHooks.setMode('combined'));
    await settle(page);
    await page.screenshot({ path: path.join(artifacts, '04-bookmark-wireframe.png') });
    await page.evaluate(id => window.__landscapeTestHooks.removeBookmark(id), bookmark.id);
    expect((await snapshot(page)).bookmarks.some(item => item.id === bookmark.id)).toBe(false);
    expect(await readFile(source)).toEqual(beforeBytes);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0); expect(errors).toEqual([]);
    await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ captures, report, disposed, errors }, null, 2));
    await page.goto('about:blank');
});
