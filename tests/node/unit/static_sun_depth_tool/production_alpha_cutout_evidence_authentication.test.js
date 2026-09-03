// Verifies fail-closed, file-backed AI 531 alpha-cutout spatial parity evidence.

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {
    canonicalJsonBytes
} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    authenticateProductionAlphaCutoutSpatialParityArtifactFiles,
    buildProductionAlphaCutoutSpatialParityArtifactFromFiles,
    PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA
} from '../../../../tools/static_sun_depth/src/ProductionAlphaCutoutParity.mjs';

const HASHES = Object.freeze({
    alpha: '1'.repeat(64),
    binding: '2'.repeat(64),
    casters: '3'.repeat(64),
    descriptor: '4'.repeat(64),
    inventory: '5'.repeat(64),
    liveDepthAttachment: '6'.repeat(64),
    samplePlan: '7'.repeat(64)
});

test('alpha-cutout parity builder rehashes files and derives spatial metrics from bytes', async () => {
    const fixture = makeFixture();
    const artifact = await buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
        fixture.options,
        fixture.deps
    );

    assert.equal(artifact.sampleCount, 4);
    assert.equal(artifact.firstHitDepthSampleCount, 2);
    assert.equal(artifact.liveOccupiedSampleCount, 2);
    assert.equal(artifact.bakeOccupiedSampleCount, 2);
    assert.equal(artifact.matchingOccupancySampleCount, 4);
    assert.equal(artifact.missingOccluderCount, 0);
    assert.equal(artifact.unexpectedOccluderCount, 0);
    assert.equal(artifact.firstHitDepthMismatchCount, 0);
    assert.ok(artifact.maximumAbsoluteFirstHitDepthErrorMeters > 0.0019);
    assert.ok(artifact.maximumAbsoluteFirstHitDepthErrorMeters < 0.0021);
    assert.equal(artifact.status, 'measured_spatial_parity_passed');
    assert.deepEqual(
        Object.fromEntries(Object.entries(artifact.evidence).map(([key, value]) => (
            [key, value.path]
        ))),
        Object.fromEntries(Object.entries(fixture.records).map(([key, value]) => (
            [key, value.path]
        )))
    );
});

test('persisted alpha-cutout parity artifacts are independently reauthenticated', async () => {
    const fixture = makeFixture();
    const artifact = await buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
        fixture.options,
        fixture.deps
    );
    const repeated = await authenticateProductionAlphaCutoutSpatialParityArtifactFiles(
        artifact,
        {
            authorityRoot: fixture.authorityRoot,
            repoRoot: fixture.repoRoot
        },
        fixture.deps
    );
    assert.deepEqual(repeated, artifact);

    fixture.files.set(
        resolveRecord(fixture, fixture.records.bakeOccupancy),
        Uint8Array.of(1, 1, 1, 0)
    );
    await assert.rejects(
        authenticateProductionAlphaCutoutSpatialParityArtifactFiles(
            artifact,
            {
                authorityRoot: fixture.authorityRoot,
                repoRoot: fixture.repoRoot
            },
            fixture.deps
        ),
        /differs from its authenticated record/
    );
});

test('alpha-cutout parity builder rejects tampering, traversal, symlinks, and duplicate files', async () => {
    const tampered = makeFixture();
    tampered.files.set(
        resolveRecord(tampered, tampered.records.liveOccupancy),
        Uint8Array.of(0, 0, 1, 0)
    );
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            tampered.options,
            tampered.deps
        ),
        /differs from its authenticated record/
    );

    const traversal = makeFixture();
    traversal.options.evidence.liveOccupancy.path =
        'tests/artifacts/illumination_531/alpha/../escape.bin';
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            traversal.options,
            traversal.deps
        ),
        /path is unsafe/
    );

    const symlinked = makeFixture();
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            symlinked.options,
            {
                ...symlinked.deps,
                lstatFn: async (filePath) => ({
                    isSymbolicLink: () => path.resolve(filePath)
                        === path.resolve(symlinked.authorityRoot)
                })
            }
        ),
        /rejects symbolic-link path segment/
    );

    const duplicate = makeFixture();
    duplicate.options.evidence.bakeOccupancy = {
        ...duplicate.options.evidence.liveOccupancy
    };
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            duplicate.options,
            duplicate.deps
        ),
        /must use unique files/
    );
});

test('alpha-cutout parity builder rejects incomplete and fabricated comparison evidence', async () => {
    const incomplete = makeFixture();
    replaceRecordBytes(
        incomplete,
        'bakeFirstHitDepth',
        float32LeBytes([1.001])
    );
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            incomplete.options,
            incomplete.deps
        ),
        /first-hit-depth files must contain one Float32 value per common occupied sample/
    );

    const fabricated = makeFixture();
    replaceRecordBytes(
        fabricated,
        'comparison',
        Uint8Array.of(0, 0, 1, 0)
    );
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            fabricated.options,
            fabricated.deps
        ),
        /comparison evidence differs from independently derived classifications/
    );
});

test('alpha-cutout parity builder rejects sample plans that omit a cutout caster', async () => {
    const fixture = makeFixture();
    const incompletePlan = {
        lightingProfileId: 'ai527.sun.az135.el08',
        method: 'all-cutout-casters-projected-light-texel-coverage-v1',
        samples: [
            {casterId: 'caster.alpha', globalTexel: [10, 20], index: 0},
            {casterId: 'caster.alpha', globalTexel: [11, 20], index: 1},
            {casterId: 'caster.alpha', globalTexel: [12, 20], index: 2},
            {casterId: 'caster.alpha', globalTexel: [13, 20], index: 3}
        ],
        schema: 'ai531-production-alpha-cutout-sample-plan-v1'
    };
    replaceRecordBytes(
        fixture,
        'samplePlan',
        canonicalJsonBytes(incompletePlan)
    );
    fixture.options.metadata.samplePlanSha256 =
        fixture.options.evidence.samplePlan.sha256;
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            fixture.options,
            fixture.deps
        ),
        /must cover every authenticated cutout caster/
    );
});

test('alpha-cutout parity v2 authenticates a physical per-profile coverage partition', async () => {
    const fixture = makeFixture();
    const plan = {
        inCoverageCasterIds: ['caster.alpha', 'caster.beta'],
        lightingProfileId: 'ai527.sun.az135.el08',
        method: 'per-profile-in-out-cutout-casters-projected-light-texel-coverage-v2',
        outOfCoverageCasterIds: ['caster.gamma'],
        samples: [
            {casterId: 'caster.alpha', globalTexel: [10, 20], index: 0},
            {casterId: 'caster.beta', globalTexel: [11, 20], index: 1},
            {casterId: 'caster.alpha', globalTexel: [12, 20], index: 2},
            {casterId: 'caster.beta', globalTexel: [13, 20], index: 3}
        ],
        schema: 'ai531-production-alpha-cutout-sample-plan-v2'
    };
    replaceRecordBytes(fixture, 'samplePlan', canonicalJsonBytes(plan));
    fixture.options.metadata.samplePlanSha256 =
        fixture.options.evidence.samplePlan.sha256;
    fixture.options.metadata.cutoutCasterCount = 3;
    fixture.options.metadata.cutoutCasterIdsSha256 = rawSha256(canonicalJsonBytes({
        casterIds: ['caster.alpha', 'caster.beta', 'caster.gamma'],
        schema: 'ai531-production-alpha-cutout-caster-plan-v1'
    }));

    const artifact = await buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
        fixture.options,
        fixture.deps
    );
    assert.equal(artifact.schema, PRODUCTION_ALPHA_CUTOUT_SPATIAL_PARITY_V2_SCHEMA);
    assert.equal(artifact.cutoutCasterCount, 3);
    assert.equal(artifact.inCoverageCasterCount, 2);
    assert.deepEqual(
        artifact.inCoverageCasterIds,
        ['caster.alpha', 'caster.beta']
    );
    assert.equal(artifact.outOfCoverageCasterCount, 1);
    assert.deepEqual(artifact.outOfCoverageCasterIds, ['caster.gamma']);
    assert.equal(artifact.sampleCount, 4);
    assert.equal(artifact.firstHitDepthSampleCount, 2);

    const repeated = await authenticateProductionAlphaCutoutSpatialParityArtifactFiles(
        artifact,
        {
            authorityRoot: fixture.authorityRoot,
            repoRoot: fixture.repoRoot
        },
        fixture.deps
    );
    assert.deepEqual(repeated, artifact);
});

test('alpha-cutout parity v2 rejects overlapping or incomplete coverage classes', async () => {
    const fixture = makeFixture();
    const plan = {
        inCoverageCasterIds: ['caster.alpha', 'caster.beta'],
        lightingProfileId: 'ai527.sun.az135.el08',
        method: 'per-profile-in-out-cutout-casters-projected-light-texel-coverage-v2',
        outOfCoverageCasterIds: ['caster.beta'],
        samples: [
            {casterId: 'caster.alpha', globalTexel: [10, 20], index: 0},
            {casterId: 'caster.beta', globalTexel: [11, 20], index: 1},
            {casterId: 'caster.alpha', globalTexel: [12, 20], index: 2},
            {casterId: 'caster.beta', globalTexel: [13, 20], index: 3}
        ],
        schema: 'ai531-production-alpha-cutout-sample-plan-v2'
    };
    replaceRecordBytes(fixture, 'samplePlan', canonicalJsonBytes(plan));
    fixture.options.metadata.samplePlanSha256 =
        fixture.options.evidence.samplePlan.sha256;
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            fixture.options,
            fixture.deps
        ),
        /coverage classes must be disjoint/
    );
});

test('alpha-cutout parity builder fails closed on measured occupancy or depth mismatch', async () => {
    const occupancyMismatch = makeFixture();
    replaceRecordBytes(
        occupancyMismatch,
        'bakeOccupancy',
        Uint8Array.of(1, 1, 1, 0)
    );
    replaceRecordBytes(
        occupancyMismatch,
        'comparison',
        Uint8Array.of(1, 3, 1, 0)
    );
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            occupancyMismatch.options,
            occupancyMismatch.deps
        ),
        /contains a mismatch/
    );

    const depthMismatch = makeFixture();
    replaceRecordBytes(
        depthMismatch,
        'bakeFirstHitDepth',
        float32LeBytes([1.02, 2.002])
    );
    replaceRecordBytes(
        depthMismatch,
        'comparison',
        Uint8Array.of(4, 0, 1, 0)
    );
    await assert.rejects(
        buildProductionAlphaCutoutSpatialParityArtifactFromFiles(
            depthMismatch.options,
            depthMismatch.deps
        ),
        /contains a mismatch/
    );
});

function makeFixture() {
    const repoRoot = path.resolve('C:/repo');
    const authorityRoot = path.join(
        repoRoot,
        'tests/artifacts/illumination_531/alpha'
    );
    const source = {
        bakeFirstHitDepth: float32LeBytes([1.001, 2.002]),
        bakeOccupancy: Uint8Array.of(1, 0, 1, 0),
        comparison: Uint8Array.of(1, 0, 1, 0),
        liveFirstHitDepth: float32LeBytes([1, 2]),
        liveOccupancy: Uint8Array.of(1, 0, 1, 0),
        samplePlan: canonicalJsonBytes({
            lightingProfileId: 'ai527.sun.az135.el08',
            method: 'all-cutout-casters-projected-light-texel-coverage-v1',
            samples: [
                {casterId: 'caster.alpha', globalTexel: [10, 20], index: 0},
                {casterId: 'caster.beta', globalTexel: [11, 20], index: 1},
                {casterId: 'caster.alpha', globalTexel: [12, 20], index: 2},
                {casterId: 'caster.beta', globalTexel: [13, 20], index: 3}
            ],
            schema: 'ai531-production-alpha-cutout-sample-plan-v1'
        })
    };
    const files = new Map();
    const records = {};
    for (const [key, bytes] of Object.entries(source)) {
        const relativePath = `tests/artifacts/illumination_531/alpha/${key}.bin`;
        const absolutePath = path.resolve(repoRoot, ...relativePath.split('/'));
        files.set(absolutePath, bytes);
        records[key] = {
            byteLength: bytes.byteLength,
            path: relativePath,
            sha256: rawSha256(bytes)
        };
    }
    return {
        authorityRoot,
        deps: {
            lstatFn: async () => ({isSymbolicLink: () => false}),
            readFileFn: async (filePath) => {
                const bytes = files.get(path.resolve(filePath));
                if (!bytes) throw new Error(`missing virtual file ${filePath}`);
                return bytes;
            }
        },
        files,
        options: {
            authorityRoot,
            evidence: structuredClone(records),
            metadata: {
                alphaSemanticsSha256: HASHES.alpha,
                casterInventorySha256: HASHES.inventory,
                cutoutBindingProjectionSha256: HASHES.binding,
                cutoutCasterCount: 2,
                cutoutCasterIdsSha256: rawSha256(canonicalJsonBytes({
                    casterIds: ['caster.alpha', 'caster.beta'],
                    schema: 'ai531-production-alpha-cutout-caster-plan-v1'
                })),
                descriptorSha256: HASHES.descriptor,
                lightingProfileId: 'ai527.sun.az135.el08',
                liveDepthAttachmentIdentitySha256:
                    HASHES.liveDepthAttachment,
                samplePlanSha256: records.samplePlan.sha256,
                unsupportedBindingIds: ['binding.leaves']
            },
            repoRoot
        },
        records,
        repoRoot
    };
}

function replaceRecordBytes(fixture, key, bytes) {
    const record = fixture.options.evidence[key];
    fixture.files.set(resolveRecord(fixture, record), bytes);
    record.byteLength = bytes.byteLength;
    record.sha256 = rawSha256(bytes);
}

function resolveRecord(fixture, record) {
    return path.resolve(fixture.repoRoot, ...record.path.split('/'));
}

function float32LeBytes(values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return bytes;
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
