// Node unit tests: deterministic, coverage-bounded localized grass accents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGrassCoverageDefinition, sanitizeGrassCoverageConfig, sampleGrassCoverage } from '../../../src/app/grass/GrassCoverageContract.js';
import {
    createGrassLocalizedAccentLayout,
    sanitizeGrassLocalizedAccentConfig
} from '../../../src/app/grass/GrassLocalizedAccentContract.js';
import { createGrassLabEngineConfig, createGrassLabFixtureDefinition } from '../../../src/graphics/gui/grass_debugger/GrassLabContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const coverageDefinition = createGrassCoverageDefinition({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    exclusionRects: [{ id: 'sidewalk', kind: 'sidewalk', x0: -2, x1: 2, z0: -2, z1: 2 }]
});

test('localized accent defaults stay inside the per-tree geometry budget', () => {
    const config = sanitizeGrassLocalizedAccentConfig(null);
    assert.equal(config.clustersPerTree, 4);
    assert.equal(config.clustersPerTree * 2, 8);
    assert.ok(config.clustersPerTree >= 3 && config.clustersPerTree <= 6);
    assert.equal(config.atlasVariants, 8);
});

test('tree placement uses the city scaleVar shape and reproduces the same accent layout', () => {
    const input = {
        config: { seed: 'repeatable' },
        treePlacements: [{ x: 8, y: 0, z: 7, rotation: 0.4, scaleVar: 1.1, variant: 1 }],
        featurePlacements: [{ x: -8, y: 0, z: 7, rotation: 1.1, scaleVar: 0.9, variant: 0 }],
        coverageDefinition,
        coverageConfig: sanitizeGrassCoverageConfig(null)
    };
    const first = createGrassLocalizedAccentLayout(input);
    const second = createGrassLocalizedAccentLayout(input);
    assert.deepEqual(first, second);
    assert.equal(first.treePlacements[0].scaleVar, 1.1);
    assert.equal(first.accents.length, 7);
    assert.equal(first.wornPatches.length, 1);
    assert.equal(first.deterministicSignature, second.deterministicSignature);
});

test('localized roots remain outside trunks and inside the binary coverage footprint', () => {
    const config = sanitizeGrassLocalizedAccentConfig({ seed: 'coverage' });
    const layout = createGrassLocalizedAccentLayout({
        config,
        treePlacements: [
            { id: 'eligible', x: 8, y: 0, z: 7, rotation: 0, scaleVar: 1, variant: 0 },
            { id: 'excluded', x: 0, y: 0, z: 0, rotation: 0, scaleVar: 1, variant: 0 }
        ],
        coverageDefinition,
        coverageConfig: sanitizeGrassCoverageConfig(null)
    });
    assert.equal(layout.eligibleTrees, 1);
    assert.equal(layout.accents.length, config.clustersPerTree);
    assert.equal(layout.rejectedCoverage, config.clustersPerTree);
    for (const accent of layout.accents) {
        assert.ok(Math.hypot(accent.x - 8, accent.z - 7) > config.trunkRadiusMeters);
        assert.equal(sampleGrassCoverage(coverageDefinition, accent.x, accent.z), 1);
    }
});

test('coverage accent eligibility is an authoritative off switch', () => {
    const layout = createGrassLocalizedAccentLayout({
        config: null,
        treePlacements: [{ x: 8, y: 0, z: 7, rotation: 0, scaleVar: 1, variant: 0 }],
        coverageDefinition,
        coverageConfig: { accentEligibility: false }
    });
    assert.equal(layout.accents.length, 0);
    assert.equal(layout.wornPatches.length, 0);
});

test('canonical Lab fixtures expose city-shaped trees and an optional explicit accent feature', () => {
    const fixtures = createGrassLabFixtureDefinition({ bounds: { minX: -180, maxX: 180, minZ: -180, maxZ: 180 } });
    assert.equal(fixtures.treePlacements.length, 4);
    assert.ok(fixtures.treePlacements.every((tree) => Number.isFinite(tree.scaleVar) && !Object.hasOwn(tree, 'scale')));
    assert.equal(fixtures.accentFeaturePlacements.length, 1);
    assert.ok(fixtures.accentCameraTargets.tree);
    const config = createGrassLabEngineConfig({ coverage: { accentEligibility: true }, accents: { clustersPerTree: 4 } });
    assert.equal(config.localizedAccents.enabled, true);
    assert.equal(config.localizedAccents.clustersPerTree, 4);
    assert.equal(config.localizedAccents.cardHeightMeters, 0.075);
});

test('localized accent renderer uses one global atlas batch and one worn-substrate batch', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassLocalizedAccentSystem.js`, 'utf8');
    assert.equal((source.match(/new THREE\.InstancedMesh\(/g) ?? []).length, 2);
    assert.match(source, /grassAtlasVariant/);
    assert.match(source, /mesh\.frustumCulled = true/g);
    assert.match(source, /mesh\.castShadow = false/g);
    const gameplay = readFileSync(`${REPO_ROOT}/src/states/GameplayState.js`, 'utf8');
    assert.doesNotMatch(gameplay, /GrassLocalizedAccentSystem|GrassLocalizedAccentContract/);
});
