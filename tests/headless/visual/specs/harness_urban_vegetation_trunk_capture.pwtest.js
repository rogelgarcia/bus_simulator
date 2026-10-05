// UHD native and map-free clay evidence for detail-first woody vegetation geometry.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SPECIES = ['london-plane', 'silver-linden', 'northern-red-oak', 'arrowwood-viburnum'];
const VARIANTS = ['mature_01', 'mature_02', 'mature_03'];
const PHASE = process.env.VEGETATION_TRUNK_PHASE ?? 'final';
if (!/^[a-z0-9_-]+$/.test(PHASE)) throw new Error('Invalid trunk capture phase');
const TOPIC = process.env.VEGETATION_TRUNK_TOPIC ?? 'ai578_tree_trunks';
if (!/^[a-z0-9_-]+$/.test(TOPIC)) throw new Error('Invalid trunk capture topic');
const OUT = path.join(ROOT, 'tests/artifacts/screens', TOPIC, PHASE);
const selectedSpecies = process.env.VEGETATION_CAPTURE_SPECIES?.split(',') ?? SPECIES;
const captureSpecies = process.env.VEGETATION_TRUNK_CAPTURE_SPECIES?.split(',') ?? selectedSpecies;
const captureVariants = process.env.VEGETATION_TRUNK_VARIANTS?.split(',') ?? VARIANTS;
const prototypeUrl = process.env.VEGETATION_PROTOTYPE_URL ?? null;
const metricsOnly = process.env.VEGETATION_TRUNK_METRICS_ONLY === '1';
const clayOnly = process.env.VEGETATION_TRUNK_CLAY_ONLY === '1';
const requestedShot = process.env.VEGETATION_TRUNK_SHOT ?? null;
const prototypeFile = prototypeUrl ? path.resolve(ROOT, prototypeUrl.replace(/^\/+/, '')) : null;
if (prototypeFile && (!prototypeFile.startsWith(`${ROOT}${path.sep}`) || !prototypeFile.endsWith('.glb') || selectedSpecies.length !== 1 || captureVariants.join(',') !== 'mature_01')) throw new Error('Prototype requires one species/mature_01 and a GLB inside the workspace');
if (selectedSpecies.some(value => !SPECIES.includes(value)) || captureSpecies.some(value => !SPECIES.includes(value)) || captureVariants.some(value => !VARIANTS.includes(value))) throw new Error('Invalid trunk capture selection');
const indexFile = species => path.join(ROOT, 'assets/public/vegetation', species.replaceAll('-', '_'), 'index.json');
const digest = async species => crypto.createHash('sha256').update(await fs.readFile(indexFile(species))).digest('hex');
const VIEWPORT = { width: 3840, height: 2160 };
if (process.env.VEGETATION_GPU === '1') test.use({ launchOptions: {
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
    args: ['--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb']
} });

test('Capture: detailed trunks, buttresses and forks with native and clay raking-light views', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const scenarioPath = 'tests/headless/harness/scenarios/scenario_urban_vegetation_showcase.js';
    const expectedScenarioDigest = crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT, scenarioPath))).digest('hex');
    const response = await page.request.get(`/${scenarioPath}`);
    expect(response.ok(), 'Capture server must serve this workspace showcase').toBe(true);
    const servedScenarioDigest = crypto.createHash('sha256').update(await response.body()).digest('hex');
    expect(servedScenarioDigest, 'Capture server served a different checkout').toBe(expectedScenarioDigest);
    await page.setViewportSize(VIEWPORT);
    await bootHarness(page, { query: '?ibl=0&bloom=0' });
    await fs.mkdir(OUT, { recursive: true });
    const report = { phase: PHASE, viewport: VIEWPORT, servedScenarioDigest, species: {}, captures: [], method: 'Same native geometry in textured and map-free gray clay. Close-ups hide foliage to reveal roots, stems and branch unions. Fixed exposure and raking directional light; HDRI supplies environment and visible background. No FPS, overdraw or GPU-memory claim.' };
    if (prototypeFile) report.prototype = { url: prototypeUrl, sha256: crypto.createHash('sha256').update(await fs.readFile(prototypeFile)).digest('hex') };
    for (const species of selectedSpecies) report.species[species] = { manifestDigest: await digest(species), manifest: JSON.parse(await fs.readFile(indexFile(species), 'utf8')) };
    for (const species of selectedSpecies) {
        await page.evaluate(async ({ species, viewport, prototypeUrl }) => {
            window.__testHooks.setViewport(viewport.width, viewport.height);
            await window.__testHooks.loadScenario('urban_vegetation_showcase', { species, prototypeUrl });
            document.getElementById('harness-ui').style.display = 'none';
        }, { species, viewport: VIEWPORT, prototypeUrl });
        const data = report.species[species];
        data.metrics = await page.evaluate(() => window.__urbanVegetationShowcase.getMetrics());
        data.geometry = await page.evaluate(() => window.__urbanVegetationShowcase.getGeometryEvidence());
        for (const geometry of data.geometry) {
            expect(geometry.bark).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0, degenerateTriangles: 0 });
            expect(geometry.bark.groundedComponents).toBe(geometry.bark.connectedComponents);
            expect(geometry.foliage.fingerprint).toEqual(data.manifest.variants.find(variant => variant.id === geometry.variant).foliageFingerprint);
        }
        expect(data.metrics.environment).toMatchObject({ present: true, background: true, fallback: false });
        if (process.env.VEGETATION_GPU === '1') expect(data.metrics.gpu).not.toMatch(/swiftshader|llvmpipe/i);
        expect(await digest(species)).toBe(data.manifestDigest);
        if (metricsOnly || !captureSpecies.includes(species)) continue;
        const shots = captureVariants.flatMap(variant => [
            { name: `${variant}_three_quarter`, variant, pose: 'three_quarter', surface: 'native', foliage: true, light: 'front' },
            ...(species === 'arrowwood-viburnum' ? [{ name: `${variant}_ground_transition`, variant, pose: 'ground_transition', surface: 'native', foliage: true, light: 'raking' }] : []),
            ...(variant === 'mature_01' ? ['buttress_detail', 'fork_detail', 'bark_macro'] : ['buttress_detail', 'fork_detail']).flatMap(pose => ['native', 'clay'].map(surface => ({ name: `${variant}_${pose}_${surface}`, variant, pose, surface, foliage: false, light: surface === 'clay' ? 'clay_raking' : 'raking' })))
        ]);
        if (captureVariants.includes('mature_01')) shots.push({ name: 'woody_structure_clay', variant: 'mature_01', pose: 'three_quarter', surface: 'clay', foliage: false, light: 'front' });
        if (captureVariants.length === 3) shots.push(
            { name: 'variants_lineup', variant: 'mature_01', pose: 'lineup', lineup: true, surface: 'native', foliage: true, light: 'front' },
            { name: 'low_angle', variant: 'mature_01', pose: 'low_angle', surface: 'native', foliage: true, light: 'front' }
        );
        const selectedShots = requestedShot ? shots.filter(shot => shot.name === requestedShot) : clayOnly ? shots.filter(shot => shot.surface === 'clay') : shots;
        if (requestedShot) expect(selectedShots, 'Requested trunk shot must exist').toHaveLength(1);
        for (const shot of selectedShots) {
            const state = await page.evaluate(shot => {
                const scene = window.__urbanVegetationShowcase;
                scene.setVariant(shot.variant, shot.lineup === true);
                scene.setAppearance({ surface: shot.surface, foliage: shot.foliage });
                scene.setPose(shot.pose);
                scene.setLight(shot.light);
                scene.render();
                const metrics = scene.getMetrics();
                return { appearance: metrics.appearance, camera: metrics.camera, exposure: metrics.exposure };
            }, shot);
            expect(state.appearance).toMatchObject({ surface: shot.surface, foliageVisible: shot.foliage, clayUsesTextures: false });
            const file = `${species.replaceAll('-', '_')}_${shot.name}.png`;
            await page.locator('#harness-canvas').screenshot({ path: path.join(OUT, file) });
            report.captures.push({ species, file, ...shot, ...state });
        }
    }
    for (const species of selectedSpecies) {
        report.species[species].manifestDigestAfter = await digest(species);
        expect(report.species[species].manifestDigestAfter).toBe(report.species[species].manifestDigest);
    }
    if (prototypeFile) expect(crypto.createHash('sha256').update(await fs.readFile(prototypeFile)).digest('hex')).toBe(report.prototype.sha256);
    await fs.writeFile(path.join(OUT, 'capture_report.json'), `${JSON.stringify(report, null, 2)}\n`);
    expect(errors).toEqual([]);
});
