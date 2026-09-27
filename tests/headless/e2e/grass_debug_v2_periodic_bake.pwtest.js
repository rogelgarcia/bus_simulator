// Verify exact eight-neighbor continuation and seamless material channels in the live grass bakes.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass bakes wrap crossing leaves through sides and corners without sparse borders', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/periodic_bake');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison;
        const { createGrassDebugV2PeriodicSource } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2PeriodicSource.js');
        const fixture = new THREE.Group(), geometry = new THREE.BoxGeometry(0.1, 0.07, 0.1);
        const material = new THREE.MeshStandardMaterial({ color: '#4a8a21', roughness: 0.8 });
        const mesh = new THREE.InstancedMesh(geometry, material, 4), originals = [];
        for (const [i, position] of [[-0.49, -0.49], [0.49, -0.49], [-0.49, 0.49], [0.49, 0.49]].entries()) {
            const transform = new THREE.Object3D();
            transform.position.set(position[0], 0.04, position[1]);
            transform.rotation.y = 0.2 + i * 0.1; transform.scale.setScalar(0.9 + i * 0.04); transform.updateMatrix();
            originals.push(transform.matrix.clone()); mesh.setMatrixAt(i, transform.matrix);
        }
        fixture.add(mesh);
        const periodic = createGrassDebugV2PeriodicSource(fixture), matrix = new THREE.Matrix4();
        const exact = periodic.group.children.every(copy => Array.from({ length: copy.count }, (_, i) => {
            copy.getMatrixAt(i, matrix);
            return originals.some(original => matrix.elements.every((value, index) => {
                const delta = value - original.elements[index];
                return [12, 14].includes(index) ? Math.abs(delta - Math.round(delta)) < 1e-6 && Math.abs(delta) < 1.001 : Math.abs(delta) < 1e-6;
            }));
        }).every(Boolean));
        const fixtureState = periodic.getSnapshot();
        periodic.dispose(); mesh.dispose(); geometry.dispose(); material.dispose();
        const maps = [c.bake, c.sparseBake].map(bake => {
            const { resolution: size } = bake.getSnapshot();
            const channels = ['albedo', 'normal', 'roughness'].map(name => {
                const data = bake.readPixels(name), sums = { edge: 0, interior: 0 };
                let borderGreen = 0, interiorGreen = 0, borderCount = 0, interiorCount = 0;
                const green = offset => data[offset + 1] > data[offset] * 1.1 && data[offset + 1] > data[offset + 2] * 1.1;
                for (let i = 0; i < size; i++) {
                    for (const [a, b] of [[i * size, i * size + size - 1], [i, (size - 1) * size + i]]) {
                        for (let channel = 0; channel < 3; channel++)
                            sums.edge += Math.abs(data[a * 4 + channel] - data[b * 4 + channel]);
                    }
                    for (const k of [size / 4, size / 2, size * 3 / 4])
                        for (const [a, b] of [[i * size + k, i * size + k - 1], [k * size + i, (k - 1) * size + i]])
                            for (let channel = 0; channel < 3; channel++)
                                sums.interior += Math.abs(data[a * 4 + channel] - data[b * 4 + channel]);
                }
                for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
                    const isBorder = x < 20 || y < 20 || x >= size - 20 || y >= size - 20;
                    if (isBorder) { borderCount++; borderGreen += Number(green((y * size + x) * 4)); }
                    else { interiorCount++; interiorGreen += Number(green((y * size + x) * 4)); }
                }
                return { name, edgeDifference: sums.edge / (size * 6), interiorDifference: sums.interior / (size * 18),
                    borderCoverage: borderGreen / borderCount, interiorCoverage: interiorGreen / interiorCount,
                    repeat: bake.textures[name].wrapS === THREE.RepeatWrapping && bake.textures[name].wrapT === THREE.RepeatWrapping };
            });
            return { ...bake.getSnapshot(), channels };
        });
        return { fixture: fixtureState, exact, maps, side: c.volume.bake.getSnapshot() };
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify(result, null, 2));
    expect(result.exact).toBe(true);
    expect(result.fixture.originalInstances).toBe(4);
    expect(result.fixture.renderedInstances).toBe(16);
    expect(result.fixture.neighbors.filter(n => n.instances > 0)).toHaveLength(9);
    for (const bake of result.maps) {
        expect(bake.periodic.neighbors).toHaveLength(9);
        expect(bake.periodic.neighbors.filter(n => Math.abs(n.x) + Math.abs(n.z) === 1).every(n => n.instances > 0)).toBe(true);
        expect(bake.periodic.renderedInstances).toBeLessThan(bake.periodic.originalInstances * 1.5);
        for (const channel of bake.channels) {
            expect(channel.repeat).toBe(true);
            expect(channel.edgeDifference).toBeLessThan(channel.interiorDifference * 1.5 + 0.5);
        }
        const albedo = bake.channels[0];
        expect(albedo.borderCoverage).toBeGreaterThan(albedo.interiorCoverage * 0.85);
    }
    expect(result.side.clipFootprintMeters).toBe(1);
    expect(result.side.periodic).toEqual(result.maps[0].periodic);
    expect(errors).toEqual([]);
});
