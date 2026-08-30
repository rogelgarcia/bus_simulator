#!/usr/bin/env node
// CLI for repeatable pinned Blender 5.2.1 Cycles CPU illumination compilation.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJsonStringify } from '../../src/app/illumination/bake_source/CanonicalJson.js';
import { asCompilerError } from './src/CompilerErrors.mjs';
import { compileIlluminationBake, COMPILER_JOB_ORDER } from './src/CompilerOrchestrator.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');
const defaults = Object.freeze({
    input: path.join(repoRoot, 'tests/artifacts/illumination_528/packages/bigcity2/default/representative_bigcity2.bsib'),
    archive: path.join(repoRoot, 'tests/artifacts/illumination_529/toolchain/blender-5.2.1-windows-x64.zip'),
    blender: path.join(repoRoot, 'tests/artifacts/illumination_529/toolchain/portable/blender-5.2.1-windows-x64/blender.exe'),
    toolchain: path.join(toolRoot, 'toolchain.v1.json'),
    profile: path.join(toolRoot, 'profiles/proof_cpu_1.v1.json'),
    outputRoot: path.join(repoRoot, 'tests/artifacts/illumination_529/compiler'),
    jobs: [...COMPILER_JOB_ORDER],
    reconstruction: 'validate',
    repeat: 1,
    timeoutMs: 21_600_000
});

function usage() {
    return `AI 529 illumination bake compiler

Usage:
  node tools/illumination_bake_compiler/run.mjs [options]

Options:
  --input <package.bsib>       AI 528 representative package
  --archive <blender.zip>      Exact official portable Blender archive
  --blender <blender.exe>      Exact extracted Blender executable
  --toolchain <json>           Pinned toolchain contract
  --profile <json>             Profile (repeatable; replaces the default)
  --profiles <a.json,b.json>   Comma-separated profiles (replaces the default)
  --output-root <directory>    Non-source artifact root
  --jobs <list>                Unique subset of depth,direct,indirect,ao
  --reconstruction <mode>      validate or full
  --repeat <count>             Clean runs per profile (default: 1)
  --timeout-ms <milliseconds>  Explicit Blender timeout (default: 21600000)
  --help                       Show this help
`;
}

export function parseCompilerCli(argv) {
    const options = { ...defaults, jobs: [...defaults.jobs], profiles: [] };
    let explicitProfiles = false;
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return { help: true };
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
        index += 1;
        switch (flag) {
            case '--input': options.input = path.resolve(value); break;
            case '--archive': options.archive = path.resolve(value); break;
            case '--blender': options.blender = path.resolve(value); break;
            case '--toolchain': options.toolchain = path.resolve(value); break;
            case '--output-root': options.outputRoot = path.resolve(value); break;
            case '--profile':
                if (!explicitProfiles) options.profiles = [];
                explicitProfiles = true;
                options.profiles.push(path.resolve(value));
                break;
            case '--profiles':
                if (!explicitProfiles) options.profiles = [];
                explicitProfiles = true;
                options.profiles.push(...value.split(',').filter(Boolean).map((entry) => path.resolve(entry)));
                break;
            case '--jobs': options.jobs = value.split(',').filter(Boolean); break;
            case '--reconstruction': options.reconstruction = value; break;
            case '--repeat': options.repeat = integer(value, '--repeat'); break;
            case '--timeout-ms': options.timeoutMs = integer(value, '--timeout-ms'); break;
            default: throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (!explicitProfiles) options.profiles = [defaults.profile];
    if (options.profiles.length === 0) throw new TypeError('At least one profile is required');
    if (!['validate', 'full'].includes(options.reconstruction)) throw new TypeError('--reconstruction must be validate or full');
    if (options.jobs.length === 0 || new Set(options.jobs).size !== options.jobs.length
        || options.jobs.some((job) => !COMPILER_JOB_ORDER.includes(job))) {
        throw new TypeError('--jobs must be a unique subset of depth,direct,indirect,ao');
    }
    return options;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseCompilerCli(argv);
    if (options.help) {
        process.stdout.write(usage());
        return;
    }
    const resultGroups = [];
    for (const profilePath of options.profiles) {
        const profileKey = stableDirectoryName(path.basename(profilePath, path.extname(profilePath)));
        const runs = [];
        for (let index = 1; index <= options.repeat; index += 1) {
            const runId = `run-${String(index).padStart(2, '0')}`;
            const artifactRoot = path.join(options.outputRoot, 'runs', profileKey, runId);
            const started = performance.now();
            const result = await compileIlluminationBake({
                inputPath: options.input,
                archivePath: options.archive,
                executablePath: options.blender,
                toolchainPath: options.toolchain,
                profilePath,
                artifactRoot,
                runId,
                jobs: options.jobs,
                reconstructionMode: options.reconstruction,
                timeoutMs: options.timeoutMs
            });
            runs.push({
                canonicalOutputs: result.manifest.outputs.map((output) => ({ id: output.id, sha256: output.canonical.sha256 })),
                contentSha256: result.contentSha256,
                durationMs: Math.round(performance.now() - started),
                manifestSha256: result.manifestSha256,
                promotedPath: path.relative(options.outputRoot, result.finalPath).replaceAll('\\', '/')
            });
        }
        const baseline = runs[0];
        const repeatable = runs.every((entry) => entry.manifestSha256 === baseline.manifestSha256
            && canonicalJsonStringify(entry.canonicalOutputs) === canonicalJsonStringify(baseline.canonicalOutputs));
        if (!repeatable) throw new Error(`Repeatability mismatch for profile '${profileKey}'`);
        resultGroups.push({ profile: profileKey, repeatable, runs });
    }
    const report = {
        authoritativeManifestsContainHostMetadata: false,
        jobs: options.jobs,
        profiles: resultGroups,
        reconstruction: options.reconstruction,
        repeat: options.repeat,
        schema: 'bus-sim-illumination-compiler-run-report-v1'
    };
    await mkdir(options.outputRoot, { recursive: true });
    await writeFile(path.join(options.outputRoot, 'run_report.json'), canonicalJsonStringify(report), 'utf8');
    process.stdout.write(canonicalJsonStringify(report) + '\n');
}

function integer(value, flag) {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new TypeError(`${flag} must be a positive safe integer`);
    return Number(value);
}

function stableDirectoryName(value) {
    const normalized = value.replace(/[^A-Za-z0-9._-]+/g, '_');
    if (!normalized || normalized === '.' || normalized === '..') throw new TypeError('Profile filename cannot form a stable output directory');
    return normalized;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        const structured = asCompilerError(error, 'illumination_compiler_cli_failed', 'AI 529 compiler CLI failed.', {});
        process.stderr.write(canonicalJsonStringify(structured.toJSON()) + '\n');
        process.exitCode = 1;
    });
}
