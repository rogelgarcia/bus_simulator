// Verifies content-addressed illumination package promotion never overwrites a valid release.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promotePackageRelease } from '../../../../tools/illumination_package/src/AtomicPromotion.mjs';

test('package promotion validates a complete stage and atomically publishes it once', async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'illumination-package-promotion-'));
    t.after(() => rm(root, { force: true, recursive: true }));
    const packageBytes = Uint8Array.from([1, 2, 3, 4]);
    const options = {
        artifactRoot: root,
        cityId: 'fixture-city',
        lightingProfileId: 'fixture-light',
        capabilityProfileId: 'transport.fixture_v1',
        aggregateSha256: 'a'.repeat(64),
        runId: 'run-01',
        packageBytes,
        manifest: { schema: 'fixture-manifest-v1' },
        validationReport: { passed: true, schema: 'fixture-report-v1' },
        validateStage: async (stage) => {
            assert.deepEqual(new Uint8Array(await readFile(path.join(stage, 'package.ilpkg'))), packageBytes);
        }
    };
    const promoted = await promotePackageRelease(options);
    assert.equal(promoted.promoted, true);
    assert.deepEqual(new Uint8Array(await readFile(path.join(promoted.finalPath, 'package.ilpkg'))), packageBytes);

    await assert.rejects(
        promotePackageRelease({ ...options, runId: 'run-02' }),
        (error) => error.code === 'package_release_collision'
    );
    assert.deepEqual(new Uint8Array(await readFile(path.join(promoted.finalPath, 'package.ilpkg'))), packageBytes);
});

test('failed stage validation leaves no promoted release', async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'illumination-package-invalid-'));
    t.after(() => rm(root, { force: true, recursive: true }));
    const options = {
        artifactRoot: root,
        cityId: 'fixture-city',
        lightingProfileId: 'fixture-light',
        capabilityProfileId: 'transport.fixture_v1',
        aggregateSha256: 'b'.repeat(64),
        runId: 'run-01',
        packageBytes: Uint8Array.of(9),
        manifest: { schema: 'fixture-manifest-v1' },
        validationReport: { passed: false, schema: 'fixture-report-v1' },
        validateStage: async () => {
            throw new Error('fixture validation failure');
        }
    };
    await assert.rejects(
        promotePackageRelease(options),
        (error) => error.code === 'package_promotion_failed'
    );
    const expectedRelease = path.join(
        root,
        options.cityId,
        options.lightingProfileId,
        options.capabilityProfileId,
        'releases',
        options.aggregateSha256
    );
    await assert.rejects(readFile(path.join(expectedRelease, 'package.ilpkg')), { code: 'ENOENT' });
});
