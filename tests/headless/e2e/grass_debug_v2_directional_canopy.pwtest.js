// Validate view-dependent visibility rather than trying to tint an overhead photograph.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Directional canopy blends top, sun-facing and opposite captures continuously', async ({ page }) => {
    test.setTimeout(240000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/sun_opposite_canopy');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison, d = c.directionalFloor;
        s.setMode('refined'); s.setSquareBounds(false);
        const tile = c.tiles.find(mesh => mesh.name === 'GrassV2Floor-rings4k');
        const coverage = bake => {
            const pixels = bake.readPixels('normal');
            let total = 0;
            for (let i = 3; i < pixels.length; i += 4) total += pixels[i] / 255;
            return total / (pixels.length / 4);
        };
        const seams = d.bakes.map(bake => {
            const size = bake.getSnapshot().resolution;
            return ['albedo', 'normal', 'roughness', 'visibility'].map(channel => {
                const data = bake.readPixels(channel);
                let edge = 0, interior = 0;
                for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) {
                    edge += Math.abs(data[(i * size) * 4 + c] - data[(i * size + size - 1) * 4 + c]);
                    edge += Math.abs(data[i * 4 + c] - data[((size - 1) * size + i) * 4 + c]);
                    for (const k of [size / 4, size / 2, size * 3 / 4]) {
                        interior += Math.abs(data[(i * size + k) * 4 + c] - data[(i * size + k - 1) * 4 + c]);
                        interior += Math.abs(data[(k * size + i) * 4 + c] - data[((k - 1) * size + i) * 4 + c]);
                    }
                }
                return { channel, edge: edge / (size * 6), interior: interior / (size * 18) };
            });
        });
        const shadowStats = d.bakes.map(bake => {
            const data = bake.readPixels('visibility');
            let lit = 0, shadowed = 0;
            for (let i = 0; i < data.length; i += 4) { if (data[i] > 200) lit++; if (data[i] < 50) shadowed++; }
            return { lit, shadowed };
        });
        const poses = [], sunAzimuth = d.getSnapshot().sunAzimuthDegrees;
        const headings = [0, 45, 90, 135, 180, 225, 270, 315, 359.99, 0.01,
            ...[0, 90, 180, 270].map(offset => (sunAzimuth + offset) % 360)];
        for (const elevation of [30, 57.5, 85]) for (const azimuth of headings) {
            const pitch = THREE.MathUtils.degToRad(elevation), angle = THREE.MathUtils.degToRad(azimuth);
            s.controls.target.copy(tile.position);
            s.camera.position.copy(tile.position).add(new THREE.Vector3(Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch)).multiplyScalar(10));
            s.controls.update(); s.lighting.render(0);
            poses.push({ elevation, azimuth, state: d.getSnapshot().state });
        }
        return { snapshot: d.getSnapshot(), topCoverage: coverage(c.bake), coverages: d.bakes.map(coverage), shadowStats, seams, poses,
            details: c.getPatchDetails('rings4k'), maxTextures: s.renderer.capabilities.maxTextures };
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ result, errors }, null, 2));
    expect(errors).toEqual([]);
    expect(result.snapshot.viewCount).toBe(2);
    expect(result.snapshot.totalViewCount).toBe(3);
    expect(result.snapshot.captures).toHaveLength(2);
    const sunDirection = result.snapshot.shadowDirection;
    const sunAzimuth = (Math.atan2(sunDirection[0], sunDirection[2]) * 180 / Math.PI + 360) % 360;
    expect(result.snapshot.sunAzimuthDegrees).toBeCloseTo(sunAzimuth, 8);
    expect(result.details.triangles).toBe(26);
    for (const [i, capture] of result.snapshot.captures.entries()) {
        expect(capture.azimuthDegrees).toBeCloseTo((sunAzimuth + i * 180) % 360, 8); expect(capture.elevationDegrees).toBe(30);
        expect(capture.sourceView).toBe('oblique'); expect(capture.shadowsBaked).toBe(true);
        expect(result.shadowStats[i].lit).toBeGreaterThan(1000); expect(result.shadowStats[i].shadowed).toBeGreaterThan(1000);
        expect(capture.planeHeight).toBeCloseTo(result.snapshot.planeHeight, 9);
        expect(capture.periodic.paddingMeters).toBeGreaterThan(0.15);
        expect(result.coverages[i]).toBeGreaterThan(result.topCoverage + 0.12);
        expect(result.coverages[i]).toBeGreaterThan(0.85);
        for (const seam of result.seams[i]) expect(seam.edge, i + ': ' + seam.channel + ' seam').toBeLessThan(seam.interior * 1.5 + 0.5);
    }
    for (const pose of result.poses) {
        const { weights, indices } = pose.state;
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        expect(pose.state.elevationDegrees).toBeCloseTo(pose.elevation, 6);
        const headingError = Math.abs(pose.state.azimuthDegrees - pose.azimuth);
        expect(Math.min(headingError, 360 - headingError)).toBeLessThan(0.00001);
        expect(weights[0]).toBeCloseTo(pose.elevation === 30 ? 0 : pose.elevation === 85 ? 1 : 0.5, 6);
        expect(indices).toEqual([0, 1]);
        const alignment = Math.cos((pose.azimuth - sunAzimuth) * Math.PI / 180);
        expect(weights[1]).toBeCloseTo((1 - weights[0]) * (1 + alignment) / 2, 8);
        expect(weights[2]).toBeCloseTo((1 - weights[0]) * (1 - alignment) / 2, 8);
    }
    for (const elevation of [30, 57.5, 85]) {
        const before = result.poses.find(pose => pose.elevation === elevation && pose.azimuth === 359.99).state;
        const after = result.poses.find(pose => pose.elevation === elevation && pose.azimuth === 0.01).state;
        before.weights.forEach((value, index) => expect(Math.abs(value - after.weights[index])).toBeLessThan(0.0002));
    }
    await page.addStyleTag({ content: '.plant-study-panel, .grass-comparison-label, .grass-patch-distance { display:none!important; }' });
    for (const [name, pose] of [['front', 'three_quarter'], ['rear', 'ten_meters_rear'], ['top', 'elevated']]) {
        await page.evaluate(pose => {
            const s = window.__plantCardsStudy; s.setPose(pose);
            s.camera.position.sub(s.controls.target).normalize().multiplyScalar(10).add(s.controls.target);
            s.controls.update(); s.lighting.render(0);
        }, pose);
        await page.screenshot({ path: path.join(folder, name + '-10m.png') });
    }
    for (const elevation of [30, 85]) for (const id of ['source', 'rings4k', 'texture4k']) {
        await page.evaluate(async ({ elevation, id }) => {
            const THREE = await import('three'), s = window.__plantCardsStudy;
            const field = s.comparison.getSnapshot().fields.find(field => field.id === id);
            const angle = Math.PI / 4, pitch = THREE.MathUtils.degToRad(elevation);
            s.controls.target.set(field.x, s.comparison.ringPatch.baseHeight, field.z);
            s.camera.up.set(0, 1, 0);
            s.camera.position.copy(s.controls.target).add(new THREE.Vector3(Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch)).multiplyScalar(2));
            s.controls.update(); s.lighting.render(0);
        }, { elevation, id });
        await page.screenshot({ path: path.join(folder, id + '-' + elevation + 'deg.png') });
    }
    expect(errors).toEqual([]);
});
