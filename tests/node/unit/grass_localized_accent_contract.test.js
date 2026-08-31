// Node unit tests: deterministic, coverage-bounded localized grass accents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGrassCoverageDefinition, sanitizeGrassCoverageConfig, sampleGrassCoverage } from '../../../src/app/grass/GrassCoverageContract.js';
import {
    createGrassLocalizedAccentHandoffIdentity,
    createGrassLocalizedAccentLayout,
    sanitizeGrassLocalizedAccentConfig
} from '../../../src/app/grass/GrassLocalizedAccentContract.js';
import { getGrassAutoLodStableSample } from '../../../src/app/grass/GrassAutoLodContract.js';
import { createGrassLabEngineConfig, createGrassLabFixtureDefinition } from '../../../src/graphics/gui/grass_debugger/GrassLabContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const coverageDefinition = createGrassCoverageDefinition({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    exclusionRects: [{ id: 'sidewalk', kind: 'sidewalk', x0: -2, x1: 2, z0: -2, z1: 2 }]
});

function circleLoop(x, z, radius, segments = 32) {
    return Array.from({ length: segments }, (_, index) => {
        const angle = index / segments * Math.PI * 2;
        return { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
    });
}

test('localized accent defaults stay inside the per-tree geometry budget', () => {
    const config = sanitizeGrassLocalizedAccentConfig(null);
    assert.equal(config.clustersPerTree, 4);
    assert.equal(config.cardsPerCluster, 2);
    assert.equal(config.clustersPerTree * config.cardsPerCluster, 8);
    assert.ok(config.clustersPerTree >= 3 && config.clustersPerTree <= 6);
    assert.equal(config.atlasVariants, 8);
    assert.equal(config.wornEnabled, false);
});

test('localized accent final-handoff samples include seed and exact boundary identity', () => {
    const options = {
        accentKey: 'tree:oak:2',
        seed: 'accent-seed-a',
        boundarySignature: 'boundary-a'
    };
    const first = createGrassLocalizedAccentHandoffIdentity(options);
    assert.equal(createGrassLocalizedAccentHandoffIdentity(options), first);
    assert.notEqual(
        createGrassLocalizedAccentHandoffIdentity({ ...options, seed: 'accent-seed-b' }),
        first
    );
    assert.notEqual(
        createGrassLocalizedAccentHandoffIdentity({ ...options, boundarySignature: 'boundary-b' }),
        first
    );
    assert.notEqual(
        getGrassAutoLodStableSample(first, 'middle_to_texture'),
        getGrassAutoLodStableSample(first, 'billboard_to_middle')
    );
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
    assert.equal(first.wornPatches.length, 0, 'V2 never submits an opaque worn-disc overlay');
    assert.equal(first.deterministicSignature, second.deterministicSignature);
});

test('V2 tree wear is a hard polygon exclusion that reveals the shared substrate', () => {
    const definition = createGrassCoverageDefinition({
        seed: 'tree-base-v2',
        bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        boundaryExclusions: [{
            id: 'tree_base_approval',
            kind: 'tree_base',
            shape: 'circle',
            sourceIdentity: 'grass-lab-tree:approval:1.000000',
            substrateRevealMeters: 0.21,
            sourceLoop: circleLoop(8, 7, 0.55),
            onsetLoop: circleLoop(8, 7, 0.76)
        }]
    });
    const layout = createGrassLocalizedAccentLayout({
        config: { seed: 'tree-base-v2', wornEnabled: true, clustersPerTree: 4 },
        treePlacements: [{ id: 'approval', x: 8, y: 0, z: 7, rotation: 0, scaleVar: 1, variant: 0 }],
        coverageDefinition: definition,
        coverageConfig: sanitizeGrassCoverageConfig(null)
    });

    assert.equal(sampleGrassCoverage(definition, 8, 7), 0);
    assert.equal(sampleGrassCoverage(definition, 8.6, 7), 0, 'The worn ring remains shared substrate, not a colored disc');
    assert.equal(sampleGrassCoverage(definition, 8.8, 7), 1);
    assert.equal(layout.wornPatches.length, 0);
    assert.equal(layout.eligibleTrees, 1);
    assert.equal(layout.accents.length, 4);
    assert.ok(layout.accents.every((accent) => sampleGrassCoverage(definition, accent.x, accent.z) === 1));
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
    assert.equal(config.localizedAccents.wornEnabled, false);
    assert.equal(config.localizedAccents.clustersPerTree, 4);
    assert.equal(config.localizedAccents.cardHeightMeters, 0.075);
});

test('localized accents retain the middle cutoff for every non-texture force mode', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassLocalizedAccentSystem.js`, 'utf8');
    assert.match(source, /if \(!config\.enabled \|\| config\.force === 'texture'\) return 0;/);
    assert.match(
        source,
        /return config\.middleEndMeters \/ Math\.max\(EPS, getGrassAutoLodAngleScale\(config, viewAngleDeg\)\);/
    );
});

test('localized accent renderer keeps one V2 two-card atlas batch and no worn geometry batch', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassLocalizedAccentSystem.js`, 'utf8');
    assert.equal((source.match(/new THREE\.InstancedMesh\(/g) ?? []).length, 1);
    assert.match(source, /for \(let card = 0; card < config\.cardsPerCluster; card\+\+\)/);
    assert.match(source, /trianglesPerCluster: config\.cardsPerCluster \* 2/);
    assert.match(source, /GrassLocalizedAccentV2CrossedClump/);
    assert.match(source, /GrassLocalizedAccentV2Batch/);
    assert.match(source, /grassAtlasVariant/);
    assert.match(source, /mesh\.frustumCulled = true/g);
    assert.match(source, /mesh\.castShadow = false/g);
    assert.match(source, /createGrassLocalizedAccentHandoffIdentity/);
    assert.match(source, /camera\.position\.x\.toFixed\(6\)/);
    assert.match(source, /camera\.position\.z\.toFixed\(6\)/);
    assert.match(source, /batchSignature/);
    assert.doesNotMatch(source, /CAMERA_BUCKET_METERS|cameraBucketX|cameraBucketZ/);
    assert.doesNotMatch(source, /_wornMesh|CircleGeometry|GrassLocalizedWornSubstrateBatch|\bwornMaterial\b/);
    const gameplay = readFileSync(`${REPO_ROOT}/src/states/GameplayState.js`, 'utf8');
    assert.doesNotMatch(gameplay, /GrassLocalizedAccentSystem|GrassLocalizedAccentContract/);
});
