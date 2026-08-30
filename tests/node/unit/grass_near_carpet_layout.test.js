import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    createGrassNearCarpetCellSet,
    diffGrassNearCarpetCellSets,
    getGrassNearCarpetBladesPerPatch,
    sanitizeGrassNearCarpetConfig
} from '../../../src/graphics/engine3d/grass/GrassNearCarpetLayout.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BOUNDS = Object.freeze({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });

test('near carpet defaults to one-metre patches with 48 simplified physical blades', () => {
    const config = sanitizeGrassNearCarpetConfig({ enabled: true });
    assert.equal(config.patchSizeMeters, 1);
    assert.equal(config.bladesPerSquareMeter, 48);
    assert.equal(getGrassNearCarpetBladesPerPatch(config), 48);
    assert.deepEqual(config.bladeHeightMeters, { min: 0.025, max: 0.03 });
});

test('near carpet layout is deterministic and excludes road cells', () => {
    const options = {
        cameraX: 0.25,
        cameraZ: 0.25,
        config: { enabled: true, radiusMeters: 4 },
        terrainBounds: BOUNDS,
        exclusionRects: [{ x0: -0.5, x1: 0.5, z0: -10, z1: 10 }]
    };
    const first = createGrassNearCarpetCellSet(options);
    const second = createGrassNearCarpetCellSet(options);
    assert.deepEqual([...first.cells], [...second.cells]);
    assert.equal([...first.cells.values()].some((cell) => cell.x >= -0.5 && cell.x <= 0.5), false);
});

test('crossing one camera cell retains the carpet and bounds buffer churn', () => {
    const config = { enabled: true, patchSizeMeters: 1, radiusMeters: 12 };
    const before = createGrassNearCarpetCellSet({ cameraX: 0.25, cameraZ: 0.25, config, terrainBounds: BOUNDS });
    const after = createGrassNearCarpetCellSet({ cameraX: 1.25, cameraZ: 0.25, config, terrainBounds: BOUNDS });
    const delta = diffGrassNearCarpetCellSets(before.cells, after.cells);
    assert.ok(delta.retained > delta.entering.length);
    assert.ok(delta.retained > delta.leaving.length);
    assert.ok(delta.entering.length + delta.leaving.length < after.cells.size);
});

test('near carpet renderer keeps geometry opaque, shadow-free, and frustum culled', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassNearCarpetSystem.js`, 'utf8');
    assert.match(source, /transparent:\s*false/);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(source, /mesh\.frustumCulled = true/);
    assert.doesNotMatch(source, /mesh\.frustumCulled = false/);
});
