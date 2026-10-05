// UHD library evidence for three mature forms of four urban vegetation species.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const SPECIES = ['london-plane', 'silver-linden', 'northern-red-oak', 'arrowwood-viburnum'];
const VARIANTS = ['mature_01', 'mature_02', 'mature_03'];
const PHASE = process.env.VEGETATION_CAPTURE_PHASE ?? '';
if (PHASE && !/^[a-z0-9_-]+$/.test(PHASE)) throw new Error('Invalid vegetation capture phase');
const OUT_DIR = path.resolve(SPEC_DIR, '../../../artifacts/screens/ai577_urban_vegetation/mature_family', PHASE);
const ASSET_ROOT = path.resolve(SPEC_DIR, '../../../../assets/public/vegetation');
const VIEWPORT = { width: 3840, height: 2160 };
const QUICK = process.env.VEGETATION_QUICK === '1';
const hardware = process.env.VEGETATION_GPU === '1';
const selectedSpecies = process.env.VEGETATION_CAPTURE_SPECIES ? process.env.VEGETATION_CAPTURE_SPECIES.split(',') : SPECIES;
if (selectedSpecies.some(species => !SPECIES.includes(species))) throw new Error('Invalid capture species');
const indexPath = species => path.join(ASSET_ROOT, species.replaceAll('-', '_'), 'index.json');
const assetDigest = async species => crypto.createHash('sha256').update(await fs.readFile(indexPath(species))).digest('hex');
if (hardware) test.use({ launchOptions: {
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
    args: ['--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb']
} });

test('Capture: mature urban vegetation species, structural variants and sunlight', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(VIEWPORT);
    await bootHarness(page, { query: '?ibl=0&bloom=0' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    const report = { captureSize: VIEWPORT, hardwareRequested: hardware, phase: PHASE || 'final', captureMode: QUICK ? 'lineup-preview' : 'full', captures: [], species: {}, performanceScope: 'Per-plant geometry, draw counts and projected coverage only. FPS, frame time, GPU time, actual GPU allocation and fragment overdraw are unmeasured.', coverageMethod: 'Orthographic front view, all variants normalized to height 1, mask height 256 pixels spanning 1.3 world units. Species share an unclipped width derived from maximum normalized radius. Crown masks hide bark and count alpha-tested leaf pixels divided by the convex hull area of occupied pixel cells; this is single-view projected occupancy, not volumetric fullness.' };
    for (const species of selectedSpecies) {
        const digest = await assetDigest(species);
        report.species[species] = { assetIndexDigest: digest, assetInventory: JSON.parse(await fs.readFile(indexPath(species), 'utf8')) };
    }
    for (const species of selectedSpecies) {
        await page.evaluate(async ({ species, viewport }) => {
            window.__testHooks.setViewport(viewport.width, viewport.height);
            await window.__testHooks.loadScenario('urban_vegetation_showcase', { species, variant: 'mature_01' });
            document.getElementById('harness-ui').style.display = 'none';
            window.__urbanVegetationShowcase.render();
        }, { species, viewport: VIEWPORT });
        const metrics = await page.evaluate(() => window.__urbanVegetationShowcase.getMetrics());
        expect(await assetDigest(species), `${species} assets changed during loading`).toBe(report.species[species].assetIndexDigest);
        expect(metrics.environment).toMatchObject({ background: true, present: true, fallback: false });
        expect(metrics.textures.ready).toBe(metrics.textures.total);
        if (hardware) expect(metrics.gpu).not.toMatch(/swiftshader|llvmpipe/i);
        report.species[species].metrics = metrics;
        const shots = [
            { name: 'variants_lineup', pose: 'lineup', lineup: true },
            ...VARIANTS.map(variant => ({ name: `${variant}_three_quarter`, pose: 'three_quarter', variant })),
            { name: 'low_angle', pose: 'low_angle' },
            { name: 'bark_detail', pose: 'bark_detail' },
            { name: 'leaf_detail', pose: 'leaf_detail' },
            ...(species === 'silver-linden' ? [{ name: 'leaf_underside', pose: 'leaf_underside' }] : []),
            { name: 'sun_front', pose: 'front', sunlight: 'front' },
            { name: 'sun_side', pose: 'front', sunlight: 'side' },
            { name: 'sun_back', pose: 'front', sunlight: 'back' }
        ];
        for (const shot of QUICK ? shots.slice(0, 1) : shots) {
            await page.evaluate(shot => {
                const showcase = window.__urbanVegetationShowcase;
                showcase.setVariant(shot.variant ?? 'mature_01', shot.lineup === true);
                showcase.setLight(shot.sunlight ?? 'front');
                showcase.setPose(shot.pose);
                showcase.render();
            }, shot);
            const file = `${species.replaceAll('-', '_')}_${shot.name}.png`;
            await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, file) });
            report.captures.push({ file, species, ...shot, exposure: 1 });
        }
        report.species[species].silhouettes = await page.evaluate(variants => variants.map(variant => {
            const mask = window.__urbanVegetationShowcase.silhouette(variant, { frameHeight: 1 });
            delete mask.occupied;
            return { variant, ...mask, boundingCoverage: mask.pixels / mask.boundingPixels };
        }), VARIANTS);
        for (const silhouette of report.species[species].silhouettes) expect(silhouette.clipped, `${species} ${silhouette.variant} silhouette clipped`).toBe(false);
        report.species[species].crownSilhouettes = await page.evaluate(variants => variants.map(variant => {
            const mask = window.__urbanVegetationShowcase.silhouette(variant, { frameHeight: 1, foliageOnly: true });
            delete mask.occupied;
            return { variant, ...mask, boundingCoverage: mask.pixels / mask.boundingPixels };
        }), VARIANTS);
        for (const crown of report.species[species].crownSilhouettes) {
            expect(crown.clipped, `${species} ${crown.variant} crown clipped`).toBe(false);
            expect(crown.convexHullCoverage).toBeGreaterThan(0);
            expect(crown.convexHullCoverage).toBeLessThanOrEqual(1);
        }
    }
    for (const species of selectedSpecies) {
        report.species[species].assetIndexDigestAfter = await assetDigest(species);
        expect(report.species[species].assetIndexDigestAfter, `${species} assets changed during capture`).toBe(report.species[species].assetIndexDigest);
    }
    await fs.writeFile(path.join(OUT_DIR, 'capture_report.json'), `${JSON.stringify(report, null, 2)}\n`);
    expect(errors).toEqual([]);
});
