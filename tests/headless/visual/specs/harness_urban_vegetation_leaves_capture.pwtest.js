// Renders opaque 3D foliage, all mature variants and modeled leaf studies under HDRI lighting.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const SPECIES = process.env.VEGETATION_CAPTURE_SPECIES?.split(',') ?? ['london-plane', 'silver-linden', 'northern-red-oak', 'arrowwood-viburnum', 'american-elm'];
const PHASE = process.env.VEGETATION_CAPTURE_PHASE ?? 'final';
if (!/^[a-z0-9_-]+$/.test(PHASE)) throw new Error('Invalid foliage capture phase');
const TOPIC = process.env.VEGETATION_ARTIFACT_TOPIC ?? 'ai582_solid_leaves';
if (!/^[a-z0-9_-]+$/.test(TOPIC)) throw new Error('Invalid vegetation artifact topic');
const OUT = path.resolve('tests/artifacts/screens', TOPIC, PHASE);
const PROTOTYPE = process.env.VEGETATION_PROTOTYPE_DIRECTORY;
const VIEWPORT = { width: 3840, height: 2160 };
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ['--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb'] } });

test('Capture: opaque botanical foliage and all mature tree variants', async ({ page }) => {
    test.setTimeout(1_200_000);
    await fs.mkdir(OUT, { recursive: true });
    const report = { viewport: VIEWPORT, phase: PHASE, species: {}, captures: [] };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(VIEWPORT);
    for (const species of SPECIES) {
        const directory = PROTOTYPE ?? `/assets/public/vegetation/${species.replaceAll('-', '_')}`;
        const manifestBytes = await fs.readFile(path.resolve(directory.replace(/^\//, ''), 'index.json'));
        const manifest = JSON.parse(manifestBytes);
        expect(manifest.foliageRepresentation).toBe('solid-leaves-v1');
        report.species[species] = { manifest, manifestSha256: crypto.createHash('sha256').update(manifestBytes).digest('hex') };
        await bootHarness(page);
        await page.evaluate(async ({ species, prototypeUrl }) => {
            await window.__testHooks.loadScenario('urban_vegetation_showcase', { species, prototypeUrl });
            document.getElementById('harness-ui').style.display = 'none';
        }, { species, prototypeUrl: PROTOTYPE ? `${directory}/mature_01.glb` : null });
        const metrics = await page.evaluate(() => window.__urbanVegetationShowcase.getMetrics());
        expect(metrics.environment).toMatchObject({ present: true, background: true, fallback: false });
        expect(metrics.gpu).not.toMatch(/swiftshader|llvmpipe/i);
        if (!PROTOTYPE) for (const plant of metrics.plants) {
            expect(plant.metadata.treeAssetRevision).toBe(manifest.assetRevision);
            expect(plant.foliageMaterials[0]).toMatchObject({ alphaTest: 0, side: 0, transparent: false, vertexColors: true });
        }
        report.species[species].metrics = metrics;
        const variants = PROTOTYPE ? ['mature_01'] : ['mature_01', 'mature_02', 'mature_03'];
        report.species[species].crowns = await page.evaluate(variants => variants.map(variant => {
            const { occupied, ...measurement } = window.__urbanVegetationShowcase.silhouette(variant, { frameHeight: 1, foliageOnly: true });
            return { variant, ...measurement };
        }), variants);
        const shots = variants.map(variant => ({ name: `${variant}_three_quarter`, variant, pose: 'three_quarter' }));
        shots.push({ name: 'leaf_detail', pose: 'leaf_detail' }, { name: 'leaf_underside', pose: 'leaf_underside' });
        if (!PROTOTYPE) shots.push({ name: 'variants_lineup', pose: 'lineup', lineup: true });
        for (const shot of shots) {
            await page.evaluate(shot => {
                const scene = window.__urbanVegetationShowcase;
                scene.setVariant(shot.variant ?? 'mature_01', shot.lineup ?? false);
                scene.setPose(shot.pose); scene.setLight('front'); scene.render();
            }, shot);
            const file = `${species.replaceAll('-', '_')}_${shot.name}.png`;
            await page.locator('#harness-canvas').screenshot({ path: path.join(OUT, file) });
            report.captures.push({ species, file, ...shot });
        }
        await bootHarness(page);
        await page.evaluate(async ({ species, url }) => {
            await window.__testHooks.loadScenario('urban_vegetation_showcase', { species, leafStudyUrl: url, pose: 'leaf_study' });
            document.getElementById('harness-ui').style.display = 'none';
        }, { species, url: `${directory}/leaf_study.glb` });
        for (const [name, pose, surface] of [['leaf_study', 'leaf_study', 'native'], ['leaf_study_oblique', 'leaf_study_oblique', 'native'], ['leaf_study_clay', 'leaf_study_oblique', 'clay']]) {
            await page.evaluate(({ pose, surface }) => { const scene = window.__urbanVegetationShowcase; scene.setAppearance({ surface }); scene.setPose(pose); scene.render(); }, { pose, surface });
            const file = `${species.replaceAll('-', '_')}_${name}.png`;
            await page.locator('#harness-canvas').screenshot({ path: path.join(OUT, file) });
            report.captures.push({ species, file, name, pose, surface });
        }
        expect(crypto.createHash('sha256').update(await fs.readFile(path.resolve(directory.replace(/^\//, ''), 'index.json'))).digest('hex')).toBe(report.species[species].manifestSha256);
    }
    expect(report.captures).toHaveLength(SPECIES.length * (PROTOTYPE ? 6 : 9));
    for (const capture of report.captures) {
        const png = await fs.readFile(path.join(OUT, capture.file));
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([3840, 2160]);
    }
    await fs.writeFile(path.join(OUT, 'capture_report.json'), JSON.stringify(report, null, 2));
    expect(errors).toEqual([]);
});
