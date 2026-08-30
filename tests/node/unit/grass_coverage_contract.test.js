import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    createGrassCoverageDefinition,
    createGrassCoveragePartition,
    sampleGrassCoverage,
    sanitizeGrassCoverageConfig
} from '../../../src/app/grass/GrassCoverageContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BOUNDS = Object.freeze({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });

function makeDefinition() {
    return createGrassCoverageDefinition({
        seed: 'coverage-test',
        bounds: BOUNDS,
        exclusionRects: [
            { id: 'vertical', kind: 'sidewalk', x0: -2, x1: 2, z0: -20, z1: 4 },
            { id: 'horizontal', kind: 'sidewalk', x0: -2, x1: 14, z0: 0, z1: 4 }
        ],
        irregularCutRects: [
            { id: 'step_a', kind: 'irregular_cut', x0: 2, x1: 4, z0: -8, z1: -5 },
            { id: 'step_b', kind: 'irregular_cut', x0: 4, x1: 6, z0: -7, z1: -5.5 }
        ]
    });
}

test('grass coverage is binary and independent from substrate blending', () => {
    const definition = makeDefinition();
    assert.equal(sampleGrassCoverage(definition, -10, -10), 1);
    assert.equal(sampleGrassCoverage(definition, 0, -10), 0);
    assert.equal(sampleGrassCoverage(definition, 5, -6), 0);
    assert.equal(definition.sources.occupancy, 'binary_exclusion_union');
    assert.equal(definition.sources.substrateBlend, 'independent');
    assert.match(definition.sources.farCoverage, /far_coverage\.png$/);
});

test('coverage defaults describe a 27.5 mm maintained layer and bounded edge treatment', () => {
    const config = sanitizeGrassCoverageConfig(null);
    assert.equal(config.layerHeightMeters, 0.0275);
    assert.equal(config.farCoverageThreshold, 0.35);
    assert.ok(config.edgeAntialiasMeters <= 0.03);
    assert.equal(config.accentEligibility, true);
});

test('coverage partition is deterministic and includes sidewalk, corner, and irregular boundaries', () => {
    const definition = makeDefinition();
    const first = createGrassCoveragePartition(definition);
    const second = createGrassCoveragePartition(definition);
    assert.deepEqual(first, second);
    assert.ok(first.cells.length > 0);
    assert.ok(first.diagnostics.sidewalkSegments > 0);
    assert.ok(first.diagnostics.irregularSegments > 0);
    assert.ok(first.diagnostics.outsideCorners > 0);
    assert.ok(first.diagnostics.insideCorners > 0);
});

test('coverage renderer batches the complete surface, lip, and fringe without transparent blending', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassCoverageSurfaceSystem.js`, 'utf8');
    assert.match(source, /new THREE\.Mesh\(buildSurfaceGeometry/);
    assert.match(source, /new THREE\.Mesh\(buildLipGeometry/);
    assert.match(source, /new THREE\.Mesh\(buildFringeGeometry/);
    assert.match(source, /transparent:\s*false/);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(source, /mesh\.receiveShadow = false/);
    assert.match(source, /mesh\.frustumCulled = true/);
    assert.equal((source.match(/new THREE\.Mesh\(/g) ?? []).length, 3);
});

test('AI 354 remains Lab-only and is not imported by gameplay', () => {
    const gameplay = readFileSync(`${REPO_ROOT}/src/states/GameplayState.js`, 'utf8');
    assert.doesNotMatch(gameplay, /GrassCoverageSurfaceSystem|GrassCoverageContract/);
});
