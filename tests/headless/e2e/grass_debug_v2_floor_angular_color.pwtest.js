// Compare displayed grass colors at low, angled and overhead camera elevations.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass floor angular color follows the source patch', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/floor_angular_color');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const results = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, { renderer, camera, controls } = s;
        s.setMode('refined'); s.setSquareBounds(false);
        const canvas = document.createElement('canvas'); canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
        const context = canvas.getContext('2d', { willReadFrequently: true }), probe = new THREE.Vector3();
        const width = canvas.width, height = canvas.height;
        const sun = s.lighting.sunRef.direction, heading = Math.atan2(sun.x, sun.z);
        const output = [], fields = s.comparison.getSnapshot().fields;
        for (const distance of [1.4, 10]) for (const elevation of [16.3, 45, 85]) for (const degrees of [0, 60, 120, 180, 240, 300]) {
            const angle = heading + degrees * Math.PI / 180;
            const row = { distance, elevation, degrees };
            const pitch = elevation * Math.PI / 180, radius = distance * Math.cos(pitch);
            for (const [name, id] of [['source', 'source'], ['floor', 'texture4k'], ['rings', 'rings4k']]) {
                const field = fields.find(field => field.id === id), { x: centerX, z } = field;
                const sampleY = name === 'source' ? 0.04 : field.surfaceHeight;
                camera.position.set(centerX + Math.sin(angle) * radius, sampleY + distance * Math.sin(pitch), z + Math.cos(angle) * radius);
                controls.target.set(centerX, sampleY, z); controls.update();
                s.lighting.render(0);
                context.drawImage(renderer.domElement, 0, 0);
                const pixels = context.getImageData(0, 0, width, height).data;
                let red = 0, green = 0, blue = 0, luminance = 0, count = 0;
                const leaves = { red: 0, green: 0, blue: 0, count: 0 };
                for (let a = 0; a < 50; a++) for (let b = 0; b < 50; b++) {
                    probe.set(centerX - 0.3 + 0.6 * a / 49, sampleY, z - 0.3 + 0.6 * b / 49).project(camera);
                    const x = Math.floor((probe.x * 0.5 + 0.5) * width), y = Math.floor((-probe.y * 0.5 + 0.5) * height);
                    const i = (y * width + x) * 4;
                    // Compare green blade pixels separately: a flat overhead bake exposes more soil.
                    if (pixels[i + 1] > pixels[i] * 1.25 && pixels[i + 1] > pixels[i + 2] * 1.25) {
                        leaves.red += pixels[i]; leaves.green += pixels[i + 1]; leaves.blue += pixels[i + 2]; leaves.count++;
                    }
                    red += pixels[i]; green += pixels[i + 1]; blue += pixels[i + 2]; luminance += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722; count++;
                }
                row[name] = { red: red / count, green: green / count, blue: blue / count, luminance: luminance / count,
                    leaves: { red: leaves.red / leaves.count, green: leaves.green / leaves.count, blue: leaves.blue / leaves.count, coverage: leaves.count / count } };
            }
            output.push(row);
        }
        s.setPose('three_quarter'); return { sun: sun.toArray(), poses: output };
    });
    await writeFile(path.join(folder, (process.env.GRASS_ANGLE_CAPTURE ?? 'after') + '.json'), JSON.stringify({ ...results, errors }, null, 2));
    await page.screenshot({ path: path.join(folder, 'comparison.png') });
    for (const pose of results.poses) {
        // Overhead still uses the original capture; low views now contain different visible leaves.
        if (pose.elevation === 85) for (const channel of ['red', 'green', 'blue'])
            expect(Math.abs(pose.rings.leaves[channel] - pose.floor.leaves[channel])).toBeLessThan(3);
        expect(pose.floor.leaves.coverage).toBeGreaterThan(0.4);
        // One fixed visibility view trades exact matching for storage.
        // Keep low-angle mean color within 15% of the live patch and verify heading contrast below.
        if (pose.distance === 10 && pose.elevation === 16.3) for (const name of ['rings'])
            expect(Math.abs(pose[name].leaves.green / pose.source.leaves.green - 1), name + ' low-angle color').toBeLessThan(0.15);
        if (pose.distance === 1.4) {
            for (const channel of ['red', 'green', 'blue'])
                expect(Math.abs(pose.floor.leaves[channel] - pose.source.leaves[channel]), channel + ' mismatch at ' + pose.degrees + '/' + pose.elevation).toBeLessThan(14);
            expect(Math.abs(pose.floor.leaves.green / pose.source.leaves.green - 1), 'Floor/source color mismatch at ' + pose.degrees + ' degrees, elevation ' + pose.elevation).toBeLessThan(0.12);
        }

    }
    const front = [results.poses[0], results.poses[1], results.poses[5]].reduce((sum, pose) => sum + pose.floor.leaves.green, 0) / 3;
    const rear = [results.poses[2], results.poses[3], results.poses[4]].reduce((sum, pose) => sum + pose.floor.leaves.green, 0) / 3;
    expect(rear).toBeLessThan(front * 0.9);
    for (const name of ['rings']) {
        const samples = results.poses.filter(pose => pose.distance === 10 && pose.elevation === 16.3);
        const greens = samples.map(pose => pose[name].leaves.green);
        expect(Math.max(...greens) - Math.min(...greens), name + ' view-dependent shade').toBeGreaterThan(5);
        expect(Math.min(...greens) / Math.max(...greens), name + ' directional contrast').toBeLessThan(0.95);
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
    expect(errors).toEqual([]);
});
