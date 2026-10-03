// Captures actual coastal natural presentation and verifies source authority, display overrides and bounded residency.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLandscapeNaturalPresentation } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalPresentation.js';
import { landscapeMaterialMacroWeight } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialTiling.js';

const root = path.resolve('.'), source = path.join(root, 'assets/public/landscape/coastal-city');
const artifacts = path.join(root, 'tests/artifacts/screens/landscape', process.env.LANDSCAPE_EVIDENCE_PHASE ?? 'nature');
const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const descriptor = manifest.chunks.find(chunk => chunk.id === manifest.overviewId);
const landCover = await readFile(path.join(source, descriptor.channels.landCover.url));
const heights = await readFile(path.join(source, descriptor.channels.height.url));
const inference = createLandscapeNaturalPresentation(manifest, { descriptor, landCover });
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());
const sample = (page, point) => page.evaluate(({ x, z }) => window.__landscapeTestHooks.appearanceSample(x, z), point);

function referencePoint(coverId) {
    const candidates = [];
    for (let row = 8; row < 249; row++) for (let column = 8; column < 249; column++) {
        const index = row * 257 + column;
        if (landCover[index] !== coverId) continue;
        const x = column * 15.625, z = 4000 - row * 15.625, height = heights.readFloatLE(index * 4);
        const interior = [-258, -257, -256, -1, 1, 256, 257, 258].filter(offset => landCover[index + offset] === coverId).length;
        const displaySoilId = manifest.soil.catalog[inference.sample(x, z, coverId) >> 4].id;
        const priority = interior + (coverId === 6 && displaySoilId === 'forest' ? 20 : 0) + (height > 0 ? 1 : 0);
        candidates.push({ x, z, height, coverId, displaySoilId, priority, distance: Math.hypot(column - 128, row - 128) });
    }
    const point = candidates.sort((a, b) => b.priority - a.priority || a.distance - b.distance)[0];
    if (!point) throw new Error(`No coastal reference for cover ${coverId}`);
    return point;
}

const beach = referencePoint(1), grass = referencePoint(2), road = referencePoint(6);
const wide = { position: [4400, 6000, -4300], target: [2000, 0, 2000], projection: 'perspective', fov: 70, zoom: 1 };

test.beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
});

async function settle(page) {
    await page.waitForTimeout(180);
    await expect.poll(async () => {
        const state = await snapshot(page);
        return state.streaming?.settled && state.appearance?.settled;
    }, { timeout: 60000 }).toBe(true);
    const state = await snapshot(page);
    expect(state.lastError).toBeNull();
    expect(state.appearance.ready).toBe(true);
    expect(state.appearance.errors).toEqual([]);
    expect(state.budget.peakCpuBytes).toBeLessThanOrEqual(state.budget.limits.cpuBytes);
    expect(state.budget.peakGpuBytes).toBeLessThanOrEqual(state.budget.limits.gpuBytes);
    expect(state.peakUploadedBytesPerFrame).toBeLessThanOrEqual(state.streaming.uploadLimitBytes);
    return state;
}

async function open(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/screens/landscape_fabrication.html');
    await page.waitForFunction(() => window.__landscapeTestHooks?.snapshot().ready || window.__landscapeTestHooks?.snapshot().lastError, null, { timeout: 60000 });
    await settle(page);
    return errors;
}

async function close(page) {
    try {
        await page.evaluate(() => window.__landscapeTestHooks?.dispose());
        const state = await snapshot(page);
        expect(state.budget.cpuBytes).toBe(0); expect(state.budget.gpuBytes).toBe(0);
    } finally { await page.close(); }
}

test('Landscape nature: actual coast, clean sand, inferred planning ground and footprint transitions retain native authority', async ({ page }) => {
    test.setTimeout(180000);
    try {
        const errors = await open(page), overview = await snapshot(page), references = [];
        expect(overview.appearance.presentation.policy).toBe('natural-overview-infill-v1');
        expect(overview.appearance.presentation.inferredSpacingMeters).toBe(15.625);
        expect(overview.appearance.materials.find(item => item.soilId === 'unknown').refCount).toBe(0);
        for (const cover of manifest.landCover.catalog) {
            const point = referencePoint(cover.id), displayed = await sample(page, point);
            expect(displayed.coverId).toBe(cover.id); expect(displayed.soilId).toBe(cover.soilId);
            expect(displayed.displaySoilId).toBe(point.displaySoilId);
            references.push({ point, displayed });
        }
        await page.screenshot({ path: path.join(artifacts, '01-natural-coastal-overview.png') });
        await page.evaluate(point => window.__landscapeTestHooks.setCamera({ position: [point.x + 24, point.height + 18, point.z - 32], target: [point.x, point.height, point.z], projection: 'perspective', fov: 55, zoom: 1 }), beach);
        const sand = await settle(page);
        expect(sand.appearance.materials.some(item => item.materialId === 'pbr.aerial_beach_01' && item.refCount > 0)).toBe(true);
        expect(sand.appearance.materialTiling.sand.nearTileMeters).toBe(30);
        await page.screenshot({ path: path.join(artifacts, '02-clean-beach-sand.png') });
        await page.evaluate(async point => { window.__landscapeTestHooks.setSelectionRadius(0); await window.__landscapeTestHooks.select(point.x, point.z); await window.__landscapeTestHooks.preset('pov'); }, beach);
        const gamePov = await settle(page);
        expect(gamePov.camera.fov).toBe(55); expect(gamePov.camera.position[1]).toBeCloseTo(gamePov.selection.position.y + 4.5, 5);
        await page.screenshot({ path: path.join(artifacts, '03-beach-game-pov.png') });
        await page.evaluate(point => window.__landscapeTestHooks.setCamera({ position: [point.x + 60, point.height + 45, point.z - 80], target: [point.x, point.height, point.z], projection: 'perspective', fov: 55, zoom: 1 }), road);
        const forest = await settle(page), roadDisplay = await sample(page, road);
        expect(roadDisplay.coverId).toBe(6); expect(roadDisplay.soilId).toBe('unknown'); expect(roadDisplay.displaySoilId).toBe('forest');
        await page.evaluate(point => window.__landscapeTestHooks.select(point.x, point.z), road);
        const authoritative = await snapshot(page);
        expect(authoritative.selection.sample.soilId).toBe('unknown'); expect(authoritative.selection.sample.landCoverId).toBe(6);
        await page.screenshot({ path: path.join(artifacts, '04-forest-without-road-tint.png') });
        const zooms = [];
        for (const zoom of [1, 4, 16]) {
            await page.evaluate(({ point, zoom }) => window.__landscapeTestHooks.setCamera({ position: [point.x, point.height + 1200, point.z - .001], target: [point.x, point.height, point.z], projection: 'orthographic', orthoHeight: 800, zoom }), { point: grass, zoom });
            const state = await settle(page), tiling = state.appearance.materialTiling.loam;
            const planarFootprintWeight = landscapeMaterialMacroWeight(tiling, state.camera.orthoHeight / state.camera.zoom / state.canvas.height);
            zooms.push({ zoom, planarFootprintWeight, state });
            await page.screenshot({ path: path.join(artifacts, `05-grass-footprint-zoom-${zoom}.png`) });
        }
        expect(zooms[0].planarFootprintWeight).toBe(1); expect(zooms[2].planarFootprintWeight).toBeLessThan(.1);
        expect(zooms[1].planarFootprintWeight).toBeGreaterThan(zooms[2].planarFootprintWeight);
        for (const entry of zooms) entry.state.camera.position.forEach((value, axis) => expect(value).toBeCloseTo(zooms[0].state.camera.position[axis], 6));
        await page.evaluate(view => window.__landscapeTestHooks.setCamera(view), wide);
        const returned = await settle(page);
        expect(returned.appearance.residentMaskIds).toEqual([manifest.overviewId]);
        expect(errors).toEqual([]);
        await writeFile(path.join(artifacts, 'natural-coast-verification.json'), JSON.stringify({ references, overview, sand, gamePov, forest, roadDisplay, authoritative, zooms, returned, errors }, null, 2));
    } finally { await close(page); }
});
