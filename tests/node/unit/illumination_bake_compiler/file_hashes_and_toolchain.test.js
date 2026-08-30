// Verifies raw file snapshots and exact Blender toolchain gates without Blender.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    COMPILER_ERROR_SCHEMA,
    CompilerError
} from '../../../../tools/illumination_bake_compiler/src/CompilerErrors.mjs';
import {
    assertFileSnapshotsUnchanged,
    hashFileRaw,
    snapshotFile,
    snapshotFiles
} from '../../../../tools/illumination_bake_compiler/src/FileHashes.mjs';
import {
    verifyBlenderArchive,
    verifyBlenderExecutable,
    verifyBlenderRuntimeSignature,
    verifyBlenderToolchain
} from '../../../../tools/illumination_bake_compiler/src/BlenderToolchain.mjs';

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

async function withTempFiles(callback) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ai529-core-'));
    try {
        return await callback(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

test('CompilerError exposes a frozen stable structured payload', () => {
    const error = new CompilerError('fixture_failure', 'Fixture failed.', { z: 2, a: 1 });
    assert.equal(error.code, 'fixture_failure');
    assert.deepEqual(error.toJSON(), {
        schema: COMPILER_ERROR_SCHEMA,
        code: 'fixture_failure',
        message: 'Fixture failed.',
        context: { a: 1, z: 2 }
    });
    assert.equal(Object.isFrozen(error.context), true);
    assert.throws(() => new CompilerError('NOT-STABLE', 'bad'), TypeError);
});

test('raw hashing streams ordinary SHA-256 bytes and stable snapshots sort by ID', async () => {
    await withTempFiles(async (root) => {
        const firstPath = path.join(root, 'first.bin');
        const secondPath = path.join(root, 'second.bin');
        await writeFile(firstPath, Buffer.from('abc'));
        await writeFile(secondPath, Buffer.from([0, 1, 2, 3]));
        assert.deepEqual(await hashFileRaw(firstPath), {
            algorithm: 'sha256',
            byteLength: 3,
            sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        });
        const single = await snapshotFile({ id: 'a', filePath: firstPath });
        assert.equal(single.fileName, 'first.bin');
        const snapshots = await snapshotFiles([
            { id: 'z', filePath: secondPath },
            { id: 'a', filePath: firstPath }
        ]);
        assert.deepEqual(snapshots.map((entry) => entry.id), ['a', 'z']);
        assert.doesNotThrow(() => assertFileSnapshotsUnchanged(snapshots, [...snapshots].reverse()));
        const stale = structuredClone(snapshots);
        stale[0].sha256 = '0'.repeat(64);
        assert.throws(
            () => assertFileSnapshotsUnchanged(snapshots, stale),
            (error) => error instanceof CompilerError && error.code === 'compiler_inputs_stale'
        );
    });
});

test('archive and executable verification require exact filename, byte length, and raw digest', async () => {
    await withTempFiles(async (root) => {
        const archiveBytes = Buffer.from('portable archive fixture');
        const executableBytes = Buffer.from('executable fixture');
        const archivePath = path.join(root, 'blender-5.2.1-windows-x64.zip');
        const executablePath = path.join(root, 'blender.exe');
        await writeFile(archivePath, archiveBytes);
        await writeFile(executablePath, executableBytes);
        const contract = {
            archive: {
                fileName: path.basename(archivePath),
                byteLength: archiveBytes.byteLength,
                sha256: digest(archiveBytes)
            },
            executable: {
                fileName: path.basename(executablePath),
                byteLength: executableBytes.byteLength,
                sha256: digest(executableBytes)
            },
            signature: {
                version: [5, 2, 1],
                versionString: '5.2.1 LTS',
                buildHash: '9e2066aef7ef',
                buildPlatform: 'Windows',
                architecture: 'x86_64'
            }
        };
        const verified = await verifyBlenderToolchain({ archivePath, executablePath, contract });
        assert.equal(verified.archive.sha256, contract.archive.sha256);
        assert.equal(verified.executable.byteLength, executableBytes.byteLength);

        await assert.rejects(
            verifyBlenderArchive({ archivePath: path.join(root, 'wrong.zip'), contract: contract.archive }),
            (error) => error instanceof CompilerError && error.code === 'blender_archive_filename_mismatch'
        );
        await assert.rejects(
            verifyBlenderArchive({ archivePath, contract: { ...contract.archive, byteLength: 1 } }),
            (error) => error instanceof CompilerError && error.code === 'blender_archive_size_mismatch'
        );
        await assert.rejects(
            verifyBlenderArchive({ archivePath, contract: { ...contract.archive, sha256: '0'.repeat(64) } }),
            (error) => error instanceof CompilerError && error.code === 'blender_archive_hash_mismatch'
        );
        await assert.rejects(
            verifyBlenderExecutable({ executablePath: path.join(root, 'missing', 'blender.exe'), contract: contract.executable }),
            (error) => error instanceof CompilerError && error.code === 'blender_executable_missing'
        );
        await assert.rejects(
            verifyBlenderExecutable({ executablePath, contract: { ...contract.executable, byteLength: 1 } }),
            (error) => error instanceof CompilerError && error.code === 'blender_executable_size_mismatch'
        );
        await assert.rejects(
            verifyBlenderExecutable({ executablePath, contract: { ...contract.executable, sha256: 'f'.repeat(64) } }),
            (error) => error instanceof CompilerError && error.code === 'blender_executable_hash_mismatch'
        );
    });
});

test('checked-in toolchain shape adapts to exact binary gates and runtime build signature', async () => {
    const archiveHash = 'a'.repeat(64);
    const executableHash = 'b'.repeat(64);
    const contract = {
        archive: { fileName: 'blender.zip', byteLength: 10, officialSha256: archiveHash },
        blender: {
            executableRelativePath: 'blender/blender.exe',
            executableByteLength: 20,
            executableSha256: executableHash,
            version: [5, 2, 1],
            versionString: '5.2.1 LTS',
            buildHash: 'build529',
            buildPlatform: 'Windows',
            architecture: 'x86_64'
        }
    };
    const signature = { ...contract.blender };
    delete signature.executableRelativePath;
    delete signature.executableByteLength;
    delete signature.executableSha256;
    assert.equal(verifyBlenderRuntimeSignature(signature, contract).buildHash, 'build529');
    assert.throws(
        () => verifyBlenderRuntimeSignature({ ...signature, version: [5, 2, 0] }, contract),
        (error) => error instanceof CompilerError && error.code === 'blender_runtime_signature_mismatch'
    );
    assert.throws(
        () => verifyBlenderRuntimeSignature({ ...signature, buildHash: 'wrong' }, contract),
        (error) => error instanceof CompilerError && error.code === 'blender_runtime_signature_mismatch'
    );
});
