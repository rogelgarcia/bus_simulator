// Verifies the pinned AI 529 Blender toolchain and explicit Cycles profiles.

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    loadCompilerJson,
    validateCompilerProfile,
    validateToolchainContract
} from '../../../../tools/illumination_bake_compiler/profile.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

async function load(relativePath) {
    return loadCompilerJson(path.join(repoRoot, relativePath));
}

test('AI 529 profile: pins the official Blender 5.2.1 portable build', async () => {
    const contract = validateToolchainContract(await load('tools/illumination_bake_compiler/toolchain.v1.json'));
    assert.equal(contract.archive.fileName, 'blender-5.2.1-windows-x64.zip');
    assert.equal(contract.blender.buildHash, '9e2066aef7ef');
    assert.deepEqual(contract.blender.version, [5, 2, 1]);
    assert.equal(contract.commandContract.shell, false);
});

test('AI 529 profile: accepts only fixed-thread authoritative Cycles CPU profiles', async () => {
    const oneThread = validateCompilerProfile(await load('tools/illumination_bake_compiler/profiles/proof_cpu_1.v1.json'));
    const twelveThreads = validateCompilerProfile(await load('tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json'));
    assert.equal(oneThread.backend.threads, 1);
    assert.equal(twelveThreads.backend.threads, 12);
    assert.equal(oneThread.sampling.pattern, 'TABULATED_SOBOL');
    assert.equal(oneThread.output.colorDepthBits, 32);
});

test('AI 529 profile: rejects changed build, GPU, adaptive sampling, and lossy output', async () => {
    const toolchain = await load('tools/illumination_bake_compiler/toolchain.v1.json');
    toolchain.blender.buildHash = 'wrong';
    assert.throws(() => validateToolchainContract(toolchain), /build hash/);

    const gpu = await load('tools/illumination_bake_compiler/profiles/proof_cpu_1.v1.json');
    gpu.backend.cyclesDevice = 'GPU';
    assert.throws(() => validateCompilerProfile(gpu), /Cycles CPU/);

    const adaptive = await load('tools/illumination_bake_compiler/profiles/proof_cpu_1.v1.json');
    adaptive.sampling.adaptiveSampling = true;
    assert.throws(() => validateCompilerProfile(adaptive), /Sampling/);

    const lossy = await load('tools/illumination_bake_compiler/profiles/proof_cpu_1.v1.json');
    lossy.output.fileFormat = 'JPEG';
    lossy.output.lossy = true;
    assert.throws(() => validateCompilerProfile(lossy), /32-bit EXR/);
});
