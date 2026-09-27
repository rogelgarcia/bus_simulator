// Verify the cropped block and one continuous outer strip carried by two cards per side.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Experimental canopy joins a one-metre base to a cropped top and one connected outer ring', async ({ page }) => {
    test.setTimeout(180000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/sparse_lower_ring');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.locator('[data-pose="ten_meters_rear"]').click();
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison, r = c.ringPatch;
        s.scene.updateMatrixWorld(true);
        const floor = c.tiles.find(tile => tile.name === 'GrassV2Floor-rings4k');
        const meshes = [...r.rings, ...r.walls, floor], shadowDraws = [];
        const callbacks = meshes.map(mesh => mesh.onBeforeShadow);
        meshes.forEach(mesh => { mesh.onBeforeShadow = () => shadowDraws.push(mesh.name); });
        s.renderer.shadowMap.needsUpdate = true; s.lighting.sun.shadow.needsUpdate = true; s.lighting.render(0);
        meshes.forEach((mesh, i) => { mesh.onBeforeShadow = callbacks[i]; });
        const cards = r.rings.map(mesh => {
            const positions = Array.from({ length: 4 }, (_, i) => new THREE.Vector3()
                .fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld).sub(r.group.position).toArray());
            const frame = s.renderer.properties.get(mesh.material).uniforms.grassFloorCaptureToCard.value;
            const normal = new THREE.Vector3(0.2, 0.5, 0.8).normalize().applyMatrix3(frame).applyQuaternion(mesh.quaternion);
            return { name: mesh.name, side: mesh.userData.ringSide, segment: mesh.userData.ringSegment, positions,
                uv: Array.from(mesh.geometry.attributes.uv.array), castShadow: mesh.castShadow, alphaTest: mesh.material.alphaTest,
                triangles: mesh.geometry.index.count / 3, sourceNormal: normal.toArray() };
        });
        const mapSharing = r.bakes[0].views.every(view => {
            const pair = r.rings.filter(mesh => mesh.userData.ringSide === view.id);
            return pair.length === 2 && ['map', 'normalMap', 'roughnessMap'].every(slot => pair[0].material[slot] === pair[1].material[slot]);
        });
        return { snapshot: r.getSnapshot(), details: c.getPatchDetails('rings4k'), cards, shadowDraws, mapSharing,
            distance: s.camera.position.distanceTo(s.controls.target),
            floor: { size: floor.geometry.parameters.width, scale: floor.scale.toArray(), uv: Array.from(floor.geometry.attributes.uv.array),
                positions: Array.from(floor.geometry.attributes.position.array), castShadow: floor.castShadow,
                originalMap: floor.material.map === c.bake.textures.albedo },
            walls: r.walls.map((mesh, i) => {
                const frame = s.renderer.properties.get(mesh.material).uniforms.grassFloorCaptureToCard.value;
                const sampleNormal = new THREE.Vector3(0.2, 0.5, 0.8).normalize();
                return {
                    positions: Array.from({ length: 4 }, (_, vertex) => new THREE.Vector3()
                        .fromBufferAttribute(mesh.geometry.attributes.position, vertex).applyMatrix4(mesh.matrixWorld).sub(r.group.position).toArray()),
                    uv: Array.from(mesh.geometry.attributes.uv.array), castShadow: mesh.castShadow,
                    sourceNormal: sampleNormal.clone().applyMatrix3(frame).applyQuaternion(mesh.quaternion).toArray(),
                    captureNormal: sampleNormal.applyQuaternion(r.wallBake.views[i].quaternion).toArray()
                };
            }),
            coverage: r.bakes[0].views.map(view => {
                const data = view.textures.albedo.image.data;
                let clear = 0, solid = 0;
                for (let i = 3; i < data.length; i += 4) { if (!data[i]) clear++; if (data[i] > 200) solid++; }
                return { clear, solid, sourceLeaves: view.sourceLeaves, eligibleLeaves: view.eligibleLeaves };
            })
        };
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ result, errors }, null, 2));
    expect(errors).toEqual([]);
    expect(result.snapshot).toMatchObject({ cropMeters: 0.005, blockSize: 0.99, baseSize: 1, topSize: 0.99, ringCount: 1, originalBorderHalfWidth: 0.5,
        visibleTriangles: 26, shadowOnlyTriangles: 0 });
    expect(result.details.triangles).toBe(26);
    expect(result.details.rings).toHaveLength(1);
    expect(result.details.rings[0]).toMatchObject({ cards: 8, cardsPerSide: 2, triangles: 16, stripDepthMeters: 0.12, leafFraction: 0.4, castShadow: true });
    expect(result.floor.size).toBe(0.99); expect(result.floor.scale).toEqual([1, 1, 1]);
    expect(result.floor.originalMap).toBe(true); expect(result.floor.castShadow).toBe(false);
    // World centimetres map to the same UV centimetres: cropping must not rescale the source photograph.
    for (let i = 0; i < 4; i++) {
        expect(result.floor.uv[i * 2]).toBeCloseTo(result.floor.positions[i * 3] + 0.5, 7);
        expect(result.floor.uv[i * 2 + 1]).toBeCloseTo(0.5 - result.floor.positions[i * 3 + 2], 7);
    }
    expect(Math.min(...result.floor.uv)).toBeCloseTo(0.005, 7);
    expect(Math.max(...result.floor.uv)).toBeCloseTo(0.995, 7);
    for (const wall of result.walls) {
        expect(wall.castShadow).toBe(false);
        wall.positions.forEach(([x, y, z], vertex) => {
            const top = vertex < 2, halfWidth = top ? 0.495 : 0.5;
            expect(Math.abs(x)).toBeCloseTo(halfWidth, 7);
            expect(Math.abs(z)).toBeCloseTo(halfWidth, 7);
            expect(y).toBeCloseTo(top ? result.snapshot.baseHeight : 0, 7);
            expect(wall.uv[vertex * 2]).toBeCloseTo(vertex % 2 ? 0.5 + halfWidth : 0.5 - halfWidth, 7);
            expect(wall.uv[vertex * 2 + 1]).toBe(top ? 1 : 0);
            // Every corner must meet the neighbouring wall, including the sloping upper rim.
            const neighbours = result.walls.filter(other => other !== wall).flatMap(other => other.positions);
            expect(neighbours.some(point => point.every((value, axis) => Math.abs(value - wall.positions[vertex][axis]) < 0.000001))).toBe(true);
        });
        wall.sourceNormal.forEach((value, axis) => expect(value).toBeCloseTo(wall.captureNormal[axis], 7));
    }
    expect(result.cards).toHaveLength(8);
    expect(result.mapSharing).toBe(true);
    expect(result.snapshot.bakes[0].bottomHeight).toBe(0);
    expect(result.details.rings[0].startHeightFraction).toBe(0);
    expect(result.snapshot.segments[0].inclinationDegrees).toBeCloseTo(15, 7);
    expect(result.snapshot.segments[0].endHeightFraction).toBe(0.5);
    expect(result.snapshot.segments[1].startHeightFraction).toBe(0.5);
    expect(result.snapshot.segments[1].inclinationDegrees - result.snapshot.segments[0].inclinationDegrees).toBeGreaterThan(10);
    for (const side of ['front', 'right', 'back', 'left']) {
        const pair = result.cards.filter(card => card.side === side).sort((a, b) => a.segment - b.segment);
        const [lower, upper] = pair;
        for (const card of pair) {
            expect(card.triangles).toBe(2); expect(card.castShadow).toBe(true); expect(card.alphaTest).toBeGreaterThan(0);
        }
        for (let vertex = 0; vertex < 2; vertex++) {
            lower.positions[vertex].forEach((value, axis) => expect(value).toBeCloseTo(upper.positions[vertex + 2][axis], 7));
            for (let axis = 0; axis < 2; axis++) expect(lower.uv[vertex * 2 + axis]).toBeCloseTo(upper.uv[(vertex + 2) * 2 + axis], 7);
            expect(Math.max(Math.abs(lower.positions[vertex + 2][0]), Math.abs(lower.positions[vertex + 2][2]))).toBeCloseTo(0.5, 7);
            expect(lower.positions[vertex + 2][1]).toBeCloseTo(0, 7);
            expect(lower.uv[(vertex + 2) * 2 + 1]).toBeCloseTo(0, 7);
            expect(upper.positions[vertex][1]).toBeCloseTo(result.snapshot.sourceHeight, 7);
        }
        lower.sourceNormal.forEach((value, axis) => expect(value).toBeCloseTo(upper.sourceNormal[axis], 7));
    }
    expect([...new Set(result.shadowDraws)].sort()).toEqual(result.cards.map(card => card.name).sort());
    for (const view of result.coverage) {
        expect(view.eligibleLeaves).toBeGreaterThan(400); expect(view.eligibleLeaves).toBeLessThan(550);
        expect(view.sourceLeaves).toBe(Math.round(view.eligibleLeaves * 0.4));
        expect(view.solid).toBeGreaterThan(1000); expect(view.clear).toBeGreaterThan(1000);
    }
    expect(result.distance).toBeCloseTo(10, 9);
    await page.screenshot({ path: path.join(folder, 'rear-10m-ui.png') });
    await page.addStyleTag({ content: '.plant-study-panel, .grass-comparison-label, .grass-patch-distance { display:none!important; }' });
    await page.screenshot({ path: path.join(folder, 'rear-10m.png') });
    for (const [name, distance, elevation] of [['close', 1.3, 24], ['medium', 3, 24], ['top', 1.5, 85]]) {
        await page.evaluate(async ({ distance, elevation }) => {
            const THREE = await import('three'), s = window.__plantCardsStudy, r = s.comparison.ringPatch;
            const pitch = elevation * Math.PI / 180;
            s.controls.target.copy(r.group.position).setY(r.baseHeight);
            s.camera.up.set(0, 1, 0);
            s.camera.position.copy(s.controls.target).add(new THREE.Vector3(0.7071 * Math.cos(pitch), Math.sin(pitch), 0.7071 * Math.cos(pitch)).multiplyScalar(distance));
            s.controls.update(); s.lighting.render(0);
        }, { distance, elevation });
        await page.screenshot({ path: path.join(folder, name + '.png') });
    }
    expect(errors).toEqual([]);
});
