// Validate actual blade clearance between the six full-size tufts, not their empty card rectangles.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/six_tufts');

const gap = 0.0004;
function transformBoxes(boxes,p) {
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw),scale=p.scale??1;
    return boxes.map(b=>({...b, x:p.x+scale*(c*b.x+s*b.z),z:p.z+scale*(-s*b.x+c*b.z),
        hx:b.hx*scale,hz:b.hz*scale,minY:b.minY*scale,maxY:b.maxY*scale,c,s}));
}
function overlap(a,b) {
    if(a.maxY<=b.minY||b.maxY<=a.minY)return false;
    const dx=b.x-a.x,dz=b.z-a.z;
    const cc=Math.abs(a.c*b.c+a.s*b.s),ss=Math.abs(a.c*b.s-a.s*b.c);
    return Math.abs(dx*a.c-dz*a.s)<a.hx+b.hx*cc+b.hz*ss
        && Math.abs(dx*a.s+dz*a.c)<a.hz+b.hx*ss+b.hz*cc
        && Math.abs(dx*b.c-dz*b.s)<b.hx+a.hx*cc+a.hz*ss
        && Math.abs(dx*b.s+dz*b.c)<b.hz+a.hx*ss+a.hz*cc;
}
function boxCells(b) {
    const ex=Math.abs(b.c)*b.hx+Math.abs(b.s)*b.hz,ez=Math.abs(b.s)*b.hx+Math.abs(b.c)*b.hz,keys=[];
    for(let x=Math.floor((b.x-ex)*50);x<=Math.floor((b.x+ex)*50);x++)
    for(let z=Math.floor((b.z-ez)*50);z<=Math.floor((b.z+ez)*50);z++)keys.push(x*1000+z);
    return keys;
}
function intersects(boxes,grid) {
    for(const b of boxes)for(const key of boxCells(b))for(const a of grid.get(key)??[])if(overlap(a,b))return true;
    return false;
}
function addBoxes(boxes,grid) {
    for(const b of boxes)for(const key of boxCells(b)){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);}
}


test('Six original-size tufts interleave without blade intersections in the one-meter square', async ({ page }) => {
    test.setTimeout(90000); await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#plant-loading')).toBeHidden();
    await expect(page.locator('#plant-counts')).toHaveText('120 leaves · 637,440 tris');
    await expect(page.getByLabel('Square bounds')).toBeChecked();
    const validation = await page.evaluate(async () => {
        const THREE = await import('three');
        const study = window.__plantCardsStudy, snapshot = study.getSnapshot();
        const boxes = [], vertex = new THREE.Vector3(), expected = new THREE.Vector3(), bounds = new THREE.Box3();
        let maximumTransformError = 0, vertexCount = 0;
        study.scene.updateMatrixWorld(true);
        const placements = snapshot.patch.placements;
        for (const [tuftIndex, tuft] of study.patch.lod0.children.entries()) {
            const p = placements[tuftIndex], c = Math.cos(p.yaw), s = Math.sin(p.yaw);
            for (const source of study.plant.leaves) {
                const mesh = tuft.children[study.plant.group.children.indexOf(source)];
                const position = mesh.geometry.attributes.position;
                for (let i = 0; i < position.count; i++) {
                    vertex.fromBufferAttribute(position, i);
                    const x = vertex.x + source.position.x, z = vertex.z;
                    expected.set(p.x + c * x + s * z, vertex.y, p.z - s * x + c * z);
                    vertex.applyMatrix4(mesh.matrixWorld);
                    maximumTransformError = Math.max(maximumTransformError, vertex.distanceTo(expected));
                    bounds.expandByPoint(vertex); vertexCount++;
                }
            }
        }
        // Every triangle is contained by one consecutive cross-section prism.
        // Inflate each prism by 0.4 mm before testing pairs from different tufts.
        for (const leaf of study.plant.leaves) {
            const position = leaf.geometry.attributes.position, stride = 33;
            for (let start = 0; start + stride < position.count; start += stride) {
                const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
                for (let i = start; i < Math.min(position.count, start + 2 * stride); i++) {
                    const point = [position.getX(i), position.getY(i), position.getZ(i)];
                    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], point[k]); max[k] = Math.max(max[k], point[k]); }
                }
                boxes.push({ x: (min[0] + max[0]) / 2 + leaf.position.x, z: (min[2] + max[2]) / 2,
                    hx: (max[0] - min[0]) / 2 + 0.0004, hz: (max[2] - min[2]) / 2 + 0.0004,
                    minY: min[1] - 0.0004, maxY: max[1] + 0.0004 });
            }
        }
        return { snapshot, boxes, maximumTransformError, vertexCount, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
            meshCounts: study.patch.lod0.children.map(tuft => tuft.children.filter(mesh => mesh.geometry.name === 'GrassV2PlantLeaf').length),
            soil: study.soil.getSnapshot(),
            rootSoilHeights: study.patch.roots.map(root => study.soil.getHeightAt(root.x, root.z)) };
    });
    expect(validation.snapshot.patch).toMatchObject({ tufts: 6, leaves: 120, scale: 1, squareMeters: 1 });
    expect(validation.snapshot.source.leaves).toBe(20);
    expect(validation.meshCounts).toEqual([20, 20, 20, 20, 20, 20]);
    expect(validation.maximumTransformError).toBeLessThan(1e-12);
    for (const axis of [0, 2]) {
        expect(validation.bounds.min[axis]).toBeGreaterThan(-0.5);
        expect(validation.bounds.max[axis]).toBeLessThan(0.5);
        expect(validation.bounds.min[axis] + validation.bounds.max[axis]).toBeCloseTo(0, 7);
    }
    expect(validation.soil.rootCenters).toHaveLength(60);
    expect(validation.rootSoilHeights.every(height => height > 0.001)).toBe(true);
    const grid = new Map(), placements = validation.snapshot.patch.placements;
    expect(new Set(placements.map(p => p.yaw)).size).toBe(6);
    for (const [index, placement] of placements.entries()) {
        const transformed = transformBoxes(validation.boxes, placement);
        expect(intersects(transformed, grid), `Tuft ${index + 1} blade bodies overlap a previous tuft`).toBe(false);
        addBoxes(transformed, grid);
    }
    const patchBounds = placements.map(p => {
        const bs = transformBoxes(validation.boxes, p);
        return { minX: Math.min(...bs.map(b => b.x - Math.abs(b.c) * b.hx - Math.abs(b.s) * b.hz)),
            maxX: Math.max(...bs.map(b => b.x + Math.abs(b.c) * b.hx + Math.abs(b.s) * b.hz)),
            minZ: Math.min(...bs.map(b => b.z - Math.abs(b.s) * b.hx - Math.abs(b.c) * b.hz)),
            maxZ: Math.max(...bs.map(b => b.z + Math.abs(b.s) * b.hx + Math.abs(b.c) * b.hz)) };
    });
    let overlappingFootprints = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < i; j++) {
        const a = patchBounds[i], b = patchBounds[j];
        if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ) overlappingFootprints++;
    }
    expect(overlappingFootprints).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(folder, 'lod0-three-quarter.png') });
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.screenshot({ path: path.join(folder, 'lod0-top.png') });
    for (const [mode, label, cards, tris] of [['refined','24',144,288],['detailed','12',72,144],['curved','6',36,72],['split','4',24,48]]) {
        await page.getByRole('button', { name: `LOD3 · ${label}`, exact: true }).click();
        await expect(page.locator('#plant-counts')).toHaveText(`120 leaves · ${cards} cards · ${tris} tris`);
        expect(await page.evaluate(mode => {
            const study = window.__plantCardsStudy;
            return { source: study.patch.lod0.visible, groups: Object.fromEntries(Object.entries(study.patch.representations).map(([name, variant]) => [name, variant.group.visible])),
                transforms: study.patch.representations[mode].group.children.map(group => ({ x: group.position.x, z: group.position.z, yaw: group.rotation.y })) };
        }, mode)).toEqual({ source: false, groups: { refined: mode === 'refined', detailed: mode === 'detailed', curved: mode === 'curved', split: mode === 'split' }, transforms: placements });
        await page.getByLabel('Card bounds').check();
        expect(await page.evaluate(mode => window.__plantCardsStudy.patch.representations[mode].boundaries.every(b => b.visible), mode)).toBe(true);
        await page.getByLabel('Card bounds').uncheck();
        if (mode === 'refined' || mode === 'curved') {
            await page.getByRole('button', { name: '3/4', exact: true }).click();
            await page.screenshot({ path: path.join(folder, `lod3-${label}-three-quarter.png`) });
        }
    }
    for (const label of ['Normal facing', 'Alpha coverage']) {
        await page.getByLabel(label, { exact: true }).uncheck();
        await page.getByLabel(label, { exact: true }).check();
    }
    await page.getByRole('button', { name: 'LOD0', exact: true }).click();
    expect(errors).toEqual([]);
    delete validation.boxes;
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ ...validation, overlappingFootprints, interTuftBladeIntersections: 0, prismInflationMeters: gap, errors }, null, 2));
});
