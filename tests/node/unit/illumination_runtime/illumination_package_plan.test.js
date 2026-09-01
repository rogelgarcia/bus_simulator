// Verifies parsed packages become complete generic resource plans only after compatibility succeeds.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIlluminationBinaryPackage } from '../../../../src/app/illumination/package/index.js';
import {
    isTransferredIlluminationPackageParse,
    parseTransferredIlluminationBinaryPackage,
    transferIlluminationPackageOwnership
} from '../../../../src/app/illumination/package/IlluminationBinaryPackage.js';
import {
    createIlluminationPackageChunkReader,
    createIlluminationPackageResourcePlan,
    decodeIlluminationPackageResource,
    hashIlluminationPackageResource
} from '../../../../src/graphics/illumination/runtime/IlluminationPackagePlan.js';
import { baseBuildOptions, buildPackageFixture } from '../illumination_package/package_fixture.js';

test('verified package compatibility produces a deterministic resource plan and chunk reader', async () => {
    const built = await buildPackageFixture();
    const parsed = await parseIlluminationBinaryPackage(built.bytes);
    const plan = createIlluminationPackageResourcePlan(parsed);
    assert.equal(plan.id, built.aggregateSha256);
    assert.deepEqual(plan.resources.map((entry) => entry.id), ['direct.rgba32f', 'mapping.ids']);
    assert.deepEqual(plan.requiredResourceIds, ['direct.rgba32f']);
    assert.equal(plan.identity.cityId, 'fixture.city');
    assert.deepEqual(plan.identity.selectedChannels, ['direct_receiver', 'receiver_mapping']);
    assert.equal(plan.resources[0].memory.residentCpuBytes, 0);
    assert.equal(plan.resources[0].memory.residentGpuBytes, 16);

    const reader = createIlluminationPackageChunkReader(parsed);
    const bytes = reader.fetchResource(plan.resources[0]);
    assert.equal(await hashIlluminationPackageResource(bytes), plan.resources[0].sha256);
    const decoded = decodeIlluminationPackageResource(bytes, plan.resources[0]);
    assert.deepEqual(decoded.decoded, bytes);
    assert.notEqual(decoded.decoded, bytes);
    assert.equal(reader.dispose(), true);
    assert.equal(reader.dispose(), false);
    assert.throws(
        () => reader.fetchResource(plan.resources[0]),
        (error) => error.code === 'verified_chunk_reader_disposed'
    );
});

test('transferred package parsing borrows fetch/decode subviews without weakening public snapshots', async () => {
    const built = await buildPackageFixture();
    const publicParsed = await parseIlluminationBinaryPackage(built.bytes);
    const publicPlan = createIlluminationPackageResourcePlan(publicParsed);
    assert.equal(publicPlan.resources[0].memory.fetchedCpuBytes, publicPlan.resources[0].byteLength);
    assert.equal(publicPlan.resources[0].memory.decodedCpuBytes, publicPlan.resources[0].byteLength);

    const transferredBytes = built.bytes.slice();
    const lease = transferIlluminationPackageOwnership(transferredBytes);
    const parsed = await parseTransferredIlluminationBinaryPackage(lease);
    assert.equal(isTransferredIlluminationPackageParse(parsed), true);
    const plan = createIlluminationPackageResourcePlan(parsed);
    assert.equal(plan.resources[0].memory.fetchedCpuBytes, 0);
    assert.equal(plan.resources[0].memory.decodedCpuBytes, 0);
    const reader = createIlluminationPackageChunkReader(parsed);
    const fetched = reader.fetchResource(plan.resources[0]);
    assert.equal(fetched.ownership, 'borrowed-verified-package-subview-v1');
    assert.equal(fetched.cpuBytes, 0);
    const decoded = decodeIlluminationPackageResource(fetched.bytes, plan.resources[0]);
    assert.strictEqual(decoded.decoded, fetched.bytes);
    assert.equal(decoded.cpuBytes, 0);
    reader.dispose();
});

test('compatibility failures map to the fixed lifecycle state and reason vocabulary before upload', async () => {
    const built = await buildPackageFixture();
    const wrongCity = await parseIlluminationBinaryPackage(built.bytes, {
        expectations: { cityId: 'different.city' }
    });
    assert.throws(
        () => createIlluminationPackageResourcePlan(wrongCity),
        (error) => error.state === 'stale'
            && error.reason === 'city_mismatch'
            && error.context.compatibilityReason === 'wrong_city'
    );

    const base = baseBuildOptions();
    const options = {
        ...base,
        chunks: base.chunks.map((chunk) => ({
            ...chunk,
            requiredRuntimeCapabilities: chunk.id === 'direct.rgba32f' ? ['fixture_float_upload_v1'] : []
        }))
    };
    const capabilityFixture = await buildPackageFixture(options);
    const unsupported = await parseIlluminationBinaryPackage(capabilityFixture.bytes, { runtimeCapabilities: [] });
    assert.throws(
        () => createIlluminationPackageResourcePlan(unsupported),
        (error) => error.state === 'unavailable'
            && error.reason === 'unsupported_capability'
            && error.context.capabilityCode === 'fixture_float_upload_v1'
    );
});
