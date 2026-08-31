import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    createGrassCoverageDefinition,
    createGrassCoverageStaticGeometryConfig,
    createGrassCoveragePartition,
    sampleGrassCoverage,
    sampleGrassCoverageContract,
    sampleGrassRootEligibility,
    sanitizeGrassCoverageConfig
} from '../../../src/app/grass/GrassCoverageContract.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BOUNDS = Object.freeze({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });

function circleLoop(radius, segments = 64) {
    return Array.from({ length: segments }, (_, index) => {
        const angle = index / segments * Math.PI * 2;
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    });
}

function makeDefinition() {
    return createGrassCoverageDefinition({
        seed: 'coverage-v2-test',
        bounds: BOUNDS,
        boundaryExclusions: [{
            id: 'sidewalk_outer_0',
            kind: 'sidewalk',
            shape: 'rendered_polygon',
            sourceIdentity: 'road-engine:test-loop-0',
            substrateRevealMeters: 0.08,
            sourceLoop: circleLoop(2),
            onsetLoop: circleLoop(2.08)
        }]
    });
}

test('V2 occupancy, boundary distance, and root eligibility share the exact polygon contract', () => {
    const definition = makeDefinition();
    const config = sanitizeGrassCoverageConfig({ rootClearanceMeters: 0.003, edgeAntialiasMeters: 0.012 });

    const sidewalk = sampleGrassCoverageContract(definition, 1.99, 0, config);
    const reveal = sampleGrassCoverageContract(definition, 2.04, 0, config);
    const nearRoot = sampleGrassCoverageContract(definition, 2.081, 0, config);
    const eligibleRoot = sampleGrassCoverageContract(definition, 2.084, 0, config);

    assert.equal(sidewalk.occupancy, 0);
    assert.ok(sidewalk.sourceBoundaryDistanceMeters < 0, 'The rendered sidewalk source polygon is a hard exclusion');
    assert.equal(reveal.occupancy, 0, 'The 80 mm strip reveals the independent substrate');
    assert.equal(reveal.sourceBoundaryDistanceMeters, 0.04);
    assert.equal(nearRoot.occupancy, 1);
    assert.equal(nearRoot.boundaryDistanceMeters, 0.001);
    assert.equal(nearRoot.rootEligible, false);
    assert.equal(sampleGrassRootEligibility(definition, 2.081, 0, config), false);
    assert.equal(eligibleRoot.rootEligible, true);
    assert.equal(sampleGrassCoverage(definition, 2.084, 0, config), 1);
    assert.equal(definition.sources.occupancy, 'hard_polygon_footprint');
    assert.equal(definition.sources.boundaryDistance, 'signed_euclidean_to_grass_onset');
    assert.equal(definition.sources.rootEligibility, 'occupied_plus_boundary_clearance');
    assert.equal(definition.sources.substrateBlend, 'independent');
    assert.equal(definition.sources.farCoverage, 'appearance_only_no_footprint_alpha');
});

test('coverage defaults separate the 27.5 mm structural base from irregular visible tips', () => {
    const config = sanitizeGrassCoverageConfig(null);
    assert.equal(config.structuralBaseHeightMeters, 0.0275);
    assert.equal(config.layerHeightMeters, 0.0275);
    assert.equal(config.substrateRevealMeters, 0.08);
    assert.ok(config.edgeAntialiasMeters <= 0.015);
    assert.equal(config.rootClearanceMeters, 0.003);
    assert.ok(config.visibleBladeTipMinMeters > config.structuralBaseHeightMeters);
    assert.ok(config.visibleBladeTipMaxMeters > config.visibleBladeTipMinMeters);
    assert.equal(config.cutEdgeEnabled, true);
    assert.equal(config.accentEligibility, true);
});

test('geometry safety ignores visibility across a disabled rebuild and re-enable transition', () => {
    const definition = makeDefinition();
    const disabled = sanitizeGrassCoverageConfig({
        enabled: false,
        cutEdgeSpacingMeters: 0.005
    });
    const rebuiltWhileDisabled = sanitizeGrassCoverageConfig({
        ...disabled,
        cutEdgeSpacingMeters: 0.004
    });
    const reenabled = sanitizeGrassCoverageConfig({
        ...rebuiltWhileDisabled,
        enabled: true
    });
    const disabledSafetyConfig = createGrassCoverageStaticGeometryConfig(rebuiltWhileDisabled);
    const reenabledSafetyConfig = createGrassCoverageStaticGeometryConfig(reenabled);

    assert.equal(disabled.enabled, false);
    assert.equal(rebuiltWhileDisabled.enabled, false);
    assert.equal(disabledSafetyConfig.enabled, true);
    assert.deepEqual(disabledSafetyConfig, reenabledSafetyConfig);
    assert.deepEqual(
        sampleGrassCoverageContract(definition, 5, 0, disabledSafetyConfig),
        sampleGrassCoverageContract(definition, 5, 0, reenabledSafetyConfig)
    );
    assert.equal(sampleGrassCoverageContract(definition, 5, 0, disabledSafetyConfig).occupancy, 1);
});

test('polygon partition and source identity remain deterministic across a JSON reload', () => {
    const firstDefinition = makeDefinition();
    const reloadedExclusions = JSON.parse(JSON.stringify(firstDefinition.exclusions));
    const secondDefinition = createGrassCoverageDefinition({
        seed: firstDefinition.seed,
        bounds: JSON.parse(JSON.stringify(firstDefinition.bounds)),
        boundaryExclusions: reloadedExclusions
    });
    const first = createGrassCoveragePartition(firstDefinition);
    const second = createGrassCoveragePartition(secondDefinition);

    assert.equal(firstDefinition.boundarySignature, secondDefinition.boundarySignature);
    assert.equal(firstDefinition.sourceLoopIdentity, 'road-engine:test-loop-0');
    assert.equal(secondDefinition.sourceLoopIdentity, firstDefinition.sourceLoopIdentity);
    assert.deepEqual(first, second);
    assert.equal(first.holeLoops.length, 1);
    assert.equal(first.boundarySegments.length, 64);
    assert.equal(first.diagnostics.sidewalkSegments, 64);
    assert.equal(first.diagnostics.grassOnsetWidthMeters, 0.08);
    assert.equal(first.diagnostics.grassOnsetWidthMaxMeters, 0.08);
    assert.equal(first.diagnostics.occupiedSamples, first.boundarySegments.length);
    assert.equal(first.diagnostics.excludedSamples, first.boundarySegments.length);
    assert.equal(first.diagnostics.rootEligibleSamples, first.boundarySegments.length);
    assert.ok(first.diagnostics.maxBoundaryDeviationMeters <= 1e-8);
});

test('polygon exclusions reject mismatched source/onset point topology', () => {
    assert.throws(() => createGrassCoverageDefinition({
        seed: 'mismatched-topology',
        bounds: BOUNDS,
        boundaryExclusions: [{
            id: 'invalid_pair',
            sourceLoop: circleLoop(2, 32),
            onsetLoop: circleLoop(2.08, 24)
        }]
    }), /source\/onset loops must share one point topology/);
});

test('coverage renderer is an opaque polygon cap plus one batched physical edge draw', () => {
    const source = readFileSync(`${REPO_ROOT}/src/graphics/engine3d/grass/GrassCoverageSurfaceSystem.js`, 'utf8');
    assert.match(source, /ShapeUtils\.triangulateShape\(contour, holes\)/);
    assert.match(source, /pushTriangle\(positions, uvs, colors, a, c, b, uv\(a2\), uv\(c2\), uv\(b2\)/);
    assert.match(source, /new THREE\.Mesh\(surfaceGeometry, this\._surfaceMaterial\)/);
    assert.match(source, /new THREE\.Mesh\(edgeGeometry, this\._edgeMaterial\)/);
    assert.match(source, /transparent:\s*false/);
    assert.match(source, /opaqueCap:\s*true/);
    assert.match(source, /alphaTestedSurface:\s*false/);
    assert.match(source, /physicalEdgeLogicalDraws:\s*Number\(edgeTriangles > 0\)/);
    assert.match(source, /hardExclusionIntrusions/);
    assert.match(source, /grassOnsetBoundaryContacts/);
    assert.match(source, /float32PositionToleranceMeters/);
    assert.match(source, /createGrassCoverageStaticGeometryConfig\(config\)/);
    assert.match(source, /createGrassCoveragePartition\(this\._definition, geometryConfig\)/);
    assert.match(source, /buildCutEdgeGeometry\(this\._partition, this\._definition\.seed, this\._definition\)/);
    assert.match(source, /measureGeometrySafety\(this\._definition, geometryConfig, surfaceGeometry, edgeGeometry\)/);
    assert.match(source, /coverageGeometryConfigKey/);
    assert.match(source, /if \(geometryChanged\) this\._rebuild\(\)/);
    assert.match(source, /ineligibleCutEdgeRoots/);
    assert.match(source, /sampleGrassRootEligibility/);
    assert.doesNotMatch(source, /alphaMap\s*:/);
    assert.doesNotMatch(source, /buildFringeGeometry/);
    assert.equal((source.match(/new THREE\.Mesh\(/g) ?? []).length, 2);
    assert.match(source, /mesh\.castShadow = false/);
    assert.match(source, /mesh\.receiveShadow = false/);
    assert.match(source, /mesh\.frustumCulled = true/);
});

test('AI 359 remains Lab-only and does not change gameplay ownership', () => {
    const gameplay = readFileSync(`${REPO_ROOT}/src/states/GameplayState.js`, 'utf8');
    assert.doesNotMatch(gameplay, /GrassCoverageSurfaceSystem|GrassCoverageContract/);
});
