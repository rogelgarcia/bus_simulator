// Verifies deterministic content addressing, exact reports, validation, and proof safety gates.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { canonicalJsonStringify } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    compileStaticSunDepthArtifact,
    validateStaticSunDepthArtifact
} from '../../../../tools/static_sun_depth/src/StaticSunDepthArtifact.mjs';
import { StaticSunDepthToolError } from '../../../../tools/static_sun_depth/src/StaticSunDepthToolError.mjs';
import { createIntermediateFixture } from './fixture.js';

test('checked AI529 proof is rejected before output unless fixture mode is explicit', async () => {
    const fixture = await createIntermediateFixture();
    const outputRoot = path.join(fixture.root, 'rejected-output');
    try {
        await assert.rejects(
            compileStaticSunDepthArtifact({
                fixture: false,
                guardPixels: 1,
                manifestPath: fixture.manifestPath,
                outputRoot,
                runId: 'reject'
            }),
            (error) => error instanceof StaticSunDepthToolError && error.code === 'ai529_proof_requires_fixture_flag'
        );
        await assert.rejects(readFile(path.join(outputRoot, 'anything')), { code: 'ENOENT' });
    } finally {
        await fixture.cleanup();
    }
});

test('fixture compilation is deterministic and emits exact byte, precision, and residency tables', async () => {
    const left = await createIntermediateFixture();
    const right = await createIntermediateFixture();
    try {
        const leftResult = await compileStaticSunDepthArtifact({
            fixture: true,
            guardPixels: 1,
            manifestPath: left.manifestPath,
            outputRoot: path.join(left.root, 'artifacts'),
            runId: 'left'
        });
        const rightResult = await compileStaticSunDepthArtifact({
            fixture: true,
            guardPixels: 1,
            manifestPath: right.manifestPath,
            outputRoot: path.join(right.root, 'artifacts'),
            runId: 'right'
        });
        assert.equal(leftResult.contentSha256, rightResult.contentSha256);
        assert.equal(leftResult.payloadSha256, rightResult.payloadSha256);
        assert.equal(leftResult.productionEligible, false);
        const leftValidated = await validateStaticSunDepthArtifact(leftResult.finalPath, {
            expectedContentSha256: leftResult.contentSha256
        });
        const rightValidated = await validateStaticSunDepthArtifact(rightResult.finalPath);
        assert.deepEqual(leftValidated.artifactManifest, rightValidated.artifactManifest);
        assert.deepEqual(leftValidated.channelDefinition, rightValidated.channelDefinition);
        assert.deepEqual(leftValidated.metrics, rightValidated.metrics);
        assert.equal(leftValidated.channelDefinition.artifactClass, 'fixture');
        assert.equal(leftValidated.channelDefinition.packageInputStatus.ai530DirectlyPackable, false);
        assert.deepEqual(leftValidated.channelDefinition.chunk.dimensions, {
            components: 2,
            depth: 1,
            height: 34,
            width: 34
        });
        const byteRows = new Map(leftValidated.metrics.byteTable.rows.map((row) => [row[0], row[1]]));
        assert.equal(byteRows.get('ai529_canonical_rgba32f'), 16384);
        assert.equal(byteRows.get('ai531_rg8_interior'), 2048);
        assert.equal(byteRows.get('ai531_rg8_guard_overhead'), 264);
        assert.equal(byteRows.get('ai531_rg8_guarded_payload'), 2312);
        const physical = leftValidated.metrics.residencyTable.rows.find((row) => row[0] === 'physical_gpu_residency');
        assert.deepEqual(physical.slice(1, 4), [null, null, 'not_measured']);
        for (const relativePath of ['artifact_manifest.json', 'channel_definition.json', 'metrics.json']) {
            const text = await readFile(path.join(leftResult.finalPath, relativePath), 'utf8');
            assert.equal(text.endsWith('\n'), false);
            assert.equal(canonicalJsonStringify(JSON.parse(text)), text);
        }
    } finally {
        await Promise.all([left.cleanup(), right.cleanup()]);
    }
});

test('artifact validation rejects a payload changed after promotion', async () => {
    const fixture = await createIntermediateFixture();
    try {
        const result = await compileStaticSunDepthArtifact({
            fixture: true,
            guardPixels: 2,
            manifestPath: fixture.manifestPath,
            outputRoot: path.join(fixture.root, 'artifacts'),
            runId: 'tamper'
        });
        const payloadPath = path.join(result.finalPath, 'payload', 'static_sun_depth.tile_0000_0000.mip_0.rg8');
        const payload = new Uint8Array(await readFile(payloadPath));
        payload[0] ^= 1;
        await writeFile(payloadPath, payload);
        await assert.rejects(
            validateStaticSunDepthArtifact(result.finalPath),
            (error) => error instanceof StaticSunDepthToolError && error.code === 'static_sun_depth_artifact_file_mismatch'
        );
    } finally {
        await fixture.cleanup();
    }
});
