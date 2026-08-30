// Verifies incomplete, stale, colliding, or unpromotable stages remain partial.

import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    assertSameVolume,
    createArtifactPaths,
    createArtifactTransaction
} from '../../../../tools/illumination_bake_compiler/src/ArtifactTransaction.mjs';
import { CompilerError } from '../../../../tools/illumination_bake_compiler/src/CompilerErrors.mjs';
import { snapshotFiles } from '../../../../tools/illumination_bake_compiler/src/FileHashes.mjs';

const CONTENT_HASH = '5'.repeat(64);

async function withArtifactRoot(callback) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ai529-artifact-'));
    try {
        return await callback(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

test('validated stage promotes by rename into promoted/contentSha256', async () => {
    await withArtifactRoot(async (artifactRoot) => {
        const transaction = await createArtifactTransaction({
            artifactRoot,
            contentSha256: CONTENT_HASH,
            runId: 'run-001'
        });
        assert.equal(transaction.finalPath, path.join(artifactRoot, 'promoted', CONTENT_HASH));
        await writeFile(path.join(transaction.stagingPath, 'receipt.json'), '{}');
        const result = await transaction.promote({
            validateStage: async (stage) => assert.equal(await readFile(path.join(stage, 'receipt.json'), 'utf8'), '{}')
        });
        assert.equal(result.promoted, true);
        assert.equal(await exists(transaction.stagingPath), false);
        assert.equal(await exists(transaction.finalPath), true);
    });
});

test('partial validation failure leaves the stage and never creates final output', async () => {
    await withArtifactRoot(async (artifactRoot) => {
        const transaction = await createArtifactTransaction({ artifactRoot, contentSha256: CONTENT_HASH, runId: 'partial' });
        await assert.rejects(
            transaction.promote({ validateStage: () => { throw new Error('missing AO'); } }),
            (error) => error instanceof CompilerError && error.code === 'artifact_stage_invalid'
        );
        assert.equal(await exists(transaction.stagingPath), true);
        assert.equal(await exists(transaction.finalPath), false);
    });
});

test('stale compiler input refuses promotion and preserves the partial stage', async () => {
    await withArtifactRoot(async (artifactRoot) => {
        const inputPath = path.join(artifactRoot, 'compiler.py');
        await writeFile(inputPath, 'version one');
        const snapshotInputs = [{ id: 'compiler-script', filePath: inputPath }];
        const expectedSnapshots = await snapshotFiles(snapshotInputs);
        const transaction = await createArtifactTransaction({ artifactRoot, contentSha256: CONTENT_HASH, runId: 'stale' });
        await writeFile(inputPath, 'version two');
        await assert.rejects(
            transaction.promote({ validateStage: () => {}, expectedSnapshots, snapshotInputs }),
            (error) => error instanceof CompilerError && error.code === 'artifact_inputs_stale'
        );
        assert.equal(await exists(transaction.stagingPath), true);
        assert.equal(await exists(transaction.finalPath), false);
    });
});

test('existing content address is a collision and is never modified', async () => {
    await withArtifactRoot(async (artifactRoot) => {
        const paths = createArtifactPaths({ artifactRoot, contentSha256: CONTENT_HASH, runId: 'collision' });
        await mkdir(paths.finalPath, { recursive: true });
        const sentinel = path.join(paths.finalPath, 'sentinel.txt');
        await writeFile(sentinel, 'keep');
        await assert.rejects(
            createArtifactTransaction({ artifactRoot, contentSha256: CONTENT_HASH, runId: 'collision' }),
            (error) => error instanceof CompilerError && error.code === 'artifact_collision'
        );
        assert.equal(await readFile(sentinel, 'utf8'), 'keep');
    });
});

test('permission failures are structured for stage creation and rename promotion', async () => {
    await withArtifactRoot(async (artifactRoot) => {
        const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
        await assert.rejects(
            createArtifactTransaction(
                { artifactRoot, contentSha256: CONTENT_HASH, runId: 'mkdir-denied' },
                { mkdirFn: async () => { throw denied; } }
            ),
            (error) => error instanceof CompilerError && error.code === 'artifact_stage_create_failed'
        );

        const transaction = await createArtifactTransaction(
            { artifactRoot, contentSha256: CONTENT_HASH, runId: 'rename-denied' },
            { renameFn: async () => { throw denied; } }
        );
        await assert.rejects(
            transaction.promote({ validateStage: () => {} }),
            (error) => error instanceof CompilerError && error.code === 'artifact_promotion_failed'
        );
        assert.equal(await exists(transaction.stagingPath), true);
        assert.equal(await exists(transaction.finalPath), false);
    });
});

test('different Windows volumes are rejected before staging', { skip: process.platform !== 'win32' }, () => {
    assert.throws(
        () => assertSameVolume('C:/stage/a', 'D:/promoted/a'),
        (error) => error instanceof CompilerError && error.code === 'artifact_cross_volume'
    );
});
