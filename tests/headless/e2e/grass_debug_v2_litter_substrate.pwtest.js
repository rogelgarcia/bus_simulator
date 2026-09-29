// Validate physical offset, tiled continuity and nonrectangular litter contours at exposed soil.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });
test('Dry litter ramps from soil to a 5 mm interior over 2 cm', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const { createGrassDebugV2LitterSubstrate } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2LitterSubstrate.js');
        const THREE = await import('three');
        const study = window.__plantCardsStudy;
        const litter = await createGrassDebugV2LitterSubstrate({ renderer: study.renderer, widthMeters: 2, depthMeters: 2 });
        study.scene.add(litter.group); litter.group.updateMatrixWorld(true);
        const meshes = litter.group.children;
        const elevations = meshes.flatMap(mesh => {
            const p = mesh.geometry.attributes.position, values = [];
            for (let i = 0; i < p.count; i++) values.push(p.getY(i) + mesh.position.y + litter.group.position.y);
            return values;
        });
        const east = litter.masks.find(mask => mask.name === 'DryLitterContour_1_0');
        const canvas = east.image, data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const extents = [], inner = [], outer = [];
        for (let y = 0; y < canvas.height; y += 4) {
            inner.push(data[y * canvas.width * 4]); outer.push(data[((y + 1) * canvas.width - 1) * 4]);
            let last = -1;
            for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4] >= 128) last = x;
            extents.push(last);
        }
        const interior = meshes.find(mesh => mesh.name === 'DryLitterInterior');
        const ray = new THREE.Raycaster();
        const sampleHeight = (x, z) => {
            ray.set(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObjects(meshes, false)[0];
            if (!hit) throw new Error('No litter geometry at ramp sample.');
            return hit.point.y;
        };
        const rampSamples = [];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            rampSamples.push([0, 0.01, 0.02].map(inward => sampleHeight(dx * (0.925 - inward), dz * (0.925 - inward))));
        }
        const cornerSamples = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
            cornerSamples.push(sampleHeight(sx * 0.92, sz * 0.91));
        const centerHeight = sampleHeight(0, 0);
        study.plant.group.visible = false; study.soil.group.visible = false;
        study.scene.getObjectByName('GrassV2DirtTerrain').visible = true;
        study.lighting.applyEnvironment();
        const sun = study.lighting.sun;
        sun.position.copy(study.lighting.sunRef.direction).multiplyScalar(5);
        Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.05, far: 10 });
        sun.shadow.camera.updateProjectionMatrix(); sun.shadow.needsUpdate = true; study.renderer.shadowMap.needsUpdate = true;
        study.controls.target.set(0.9, 0.005, 0.9);
        study.camera.position.set(1.5, 0.65, 1.5); study.camera.near = 0.01; study.camera.updateProjectionMatrix(); study.controls.update();
        study.lighting.render(0);
        window.__litterReview = litter;
        return { ...litter.getSnapshot(), rampSamples, cornerSamples, centerHeight, minY: Math.min(...elevations), maxY: Math.max(...elevations),
            outermostContourU: (Math.max(...extents) + 0.5) / canvas.width,
            materialAlbedo: interior.material.color.toArray(),
            innerMin: Math.min(...inner), outerMax: Math.max(...outer), outlineSpanPixels: Math.max(...extents) - Math.min(...extents),
            interiorRepeat: interior.material.map.repeat.toArray(), interiorHasGeneratedMask: !!interior.material.alphaMap,
            groundContactBias: meshes.every(mesh => mesh.material.polygonOffset && mesh.material.polygonOffsetFactor === -1 && mesh.material.polygonOffsetUnits === -1),
            receivesShadows: meshes.every(mesh => mesh.receiveShadow), masks: litter.masks.map(mask => ({ name: mask.name, png: mask.image.toDataURL('image/png') })) };
    });
    expect(result.minY).toBeCloseTo(0, 8); expect(result.maxY).toBeCloseTo(0.005, 8);
    expect(result.centerHeight).toBeCloseTo(0.005, 8);
    for (const samples of result.rampSamples) samples.forEach((height, index) => expect(height).toBeCloseTo(index * 0.0025, 7));
    for (const height of result.cornerSamples) expect(height).toBeCloseTo(0.00125, 7);
    expect(result.triangles).toBe(98); expect(result.perimeterMasks).toBe(8);
    expect(result.innerMin).toBe(255); expect(result.outerMax).toBe(0);
    expect(result.outlineSpanPixels).toBeGreaterThan(20);
    expect(result.outermostContourU).toBeLessThan(0.45);
    expect(result.materialAlbedo).toEqual([0.3, 0.3, 0.3]);
    expect(result.interiorRepeat).toEqual([4, 4]); expect(result.interiorHasGeneratedMask).toBe(false);
    expect(result.receivesShadows).toBe(true); expect(result.groundContactBias).toBe(true);
    for (const size of Object.values(result.maps)) expect(size).toEqual([1024, 1024]);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/litter_substrate');
    await mkdir(folder, { recursive: true });
    for (const mask of result.masks) await writeFile(path.join(folder, mask.name + '.png'), Buffer.from(mask.png.split(',')[1], 'base64'));
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ ...result, masks: result.masks.map(mask => mask.name) }, null, 2));
    await page.addStyleTag({ content: '.plant-study-panel, #plant-loading { display:none !important }' });
    await page.screenshot({ path: path.join(folder, 'litter_edge_closeup.png') });
    const masks = result.masks.map(mask => '<figure><img src="' + mask.name + '.png" alt="' + mask.name + '"><figcaption>' + mask.name + '</figcaption></figure>').join('');
    await writeFile(path.join(folder, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>Dry litter substrate</title><style>body{margin:32px;background:#14201b;color:#e6ede7;font:16px system-ui}main{max-width:1200px;margin:auto}img{width:100%;display:block}figure{margin:0}figcaption{padding:10px 0;color:#b9cbbb}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}a{color:#b8dd91}</style>'
        + '<main><h1>Dry litter substrate</h1><p>The supplied PBR material uses a darker albedo and tiles every 40 cm. Its interior is 5 mm above soil, with a 2 cm ramp down to the grounded strand outline. The contour remains inset 5 cm with 2.5 cm variation.</p>'
        + '<p><a href="../ninety_six_thousand_leaves_12m/index.html">96,000-leaf field — eight 4K views</a> · <a href="validation.json">Validation data</a></p>'
        + '<figure><img src="litter_edge_closeup.png" alt="Litter edge on bare soil, grass hidden for inspection"><figcaption>Isolated substrate corner. Grass is hidden here to show the cutout edge against bare soil.</figcaption></figure>'
        + '<h2>Perimeter masks</h2><p>White keeps litter, black exposes soil. The outlines use the supplied litter coverage and height maps.</p><section>' + masks + '</section></main></html>');
    expect(errors).toEqual([]);
});
