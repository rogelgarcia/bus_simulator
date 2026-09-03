#!/usr/bin/env node
// CLI for authenticated AI 531 production static-sun rendering and packaging.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT
} from '../illumination_bake_exporter/profile.mjs';
import {
    orchestrateProductionStaticSunDepth,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');

export const PRODUCTION_STATIC_SUN_DEFAULTS = Object.freeze({
    ai529Directory: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/blender'
    ),
    archivePath: path.join(
        repoRoot,
        'tests/artifacts/illumination_529/toolchain/blender-5.2.1-windows-x64.zip'
    ),
    artifactRoot: path.join(
        repoRoot,
        'tests/artifacts/illumination_531'
    ),
    executablePath: path.join(
        repoRoot,
        'tests/artifacts/illumination_529/toolchain/portable',
        'blender-5.2.1-windows-x64/blender.exe'
    ),
    inputPath: path.join(
        repoRoot,
        'tests/artifacts/illumination_528/packages/bigcity2',
        'ai531-production/bigcity2.bsib'
    ),
    nativeCutoutRoot: path.join(
        repoRoot,
        'tests/artifacts/illumination_531/native_cutout_fields/release-v1'
    ),
    profilePath: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json'
    ),
    rendererPath: path.join(
        repoRoot,
        'tools/static_sun_depth/blender/production_static_sun.py'
    ),
    repeat: 1,
    repoRoot,
    rowStripPixels: AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels[1],
    timeoutMs: 21_600_000,
    toolchainPath: path.join(
        repoRoot,
        'tools/illumination_bake_compiler/toolchain.v1.json'
    )
});

/** @param {readonly string[]} argv */
export function parseProductionCliArguments(argv) {
    if (!Array.isArray(argv)) throw new TypeError('CLI arguments must be an array');
    const options = {
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        profiles: undefined
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({ help: true });
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        switch (flag) {
            case '--input':
                options.inputPath = path.resolve(value);
                break;
            case '--archive':
                options.archivePath = path.resolve(value);
                break;
            case '--blender':
                options.executablePath = path.resolve(value);
                break;
            case '--toolchain':
                options.toolchainPath = path.resolve(value);
                break;
            case '--profile':
                options.profilePath = path.resolve(value);
                break;
            case '--renderer':
                options.rendererPath = path.resolve(value);
                break;
            case '--output-root':
                options.artifactRoot = path.resolve(value);
                break;
            case '--alpha-parity-root':
                options.alphaParityRoot = path.resolve(value);
                break;
            case '--native-cutout-root':
                options.nativeCutoutRoot = path.resolve(value);
                break;
            case '--profiles':
                options.profiles = parseProfileIds(value);
                break;
            case '--repeat':
                options.repeat = positiveInteger(value, '--repeat');
                break;
            case '--timeout-ms':
                options.timeoutMs = positiveInteger(value, '--timeout-ms');
                break;
            case '--row-strip-pixels':
                options.rowStripPixels = positiveInteger(
                    value,
                    '--row-strip-pixels'
                );
                if (options.rowStripPixels
                    !== AI531_STATIC_SUN_DEPTH_PRODUCTION_LAYOUT.interiorPixels[1]) {
                    throw new RangeError(
                        '--row-strip-pixels must equal the rectangular tile interior height for production'
                    );
                }
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (options.profiles !== undefined) {
        selectProductionStaticSunProfiles(options.profiles);
    }
    return Object.freeze(options);
}

export function createProductionUsageText() {
    return `AI 531 production static-sun compiler

Usage:
  node tools/static_sun_depth/production.mjs [options]

Options:
  --input <package.bsib>       Fresh semantically validated AI 528 package
  --archive <blender.zip>      Pinned official Blender 5.2.1 archive
  --blender <blender.exe>      Pinned portable Blender 5.2.1 executable
  --toolchain <json>           Pinned AI 529 toolchain contract
  --profile <json>             Pinned proof_cpu_12.v1.json profile
  --renderer <python>          AI 531 production Blender renderer
  --output-root <directory>    Artifact root below tests/artifacts/illumination_531
  --alpha-parity-root <dir>    Profile subdirectories containing authenticated spatial_parity_artifact.json files
  --native-cutout-root <dir>   Profile subdirectories containing complete native_cutout_field_receipt.json fields
  --profiles <id,id>           Exact subset of the eight non-lab release profile IDs
  --repeat <count>             Fresh deterministic runs per selected profile (default: 1)
  --timeout-ms <milliseconds>  Explicit timeout per Blender process
  --row-strip-pixels <pixels>  Strict production tile height (default: 1821)
  --help                       Show this help
`;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseProductionCliArguments(argv);
    if (options.help) {
        process.stdout.write(createProductionUsageText());
        return;
    }
    const result = await orchestrateProductionStaticSunDepth(options);
    const report = {
        packageIndexPath: path.relative(repoRoot, result.packageIndexPath)
            .replaceAll('\\', '/'),
        performance: {
            reason: 'host-load-and-gpu-contention-declared-by-user',
            status: 'not_measured'
        },
        profiles: result.profiles.map((entry) => ({
            lightingProfileId: entry.lightingProfileId,
            repeat: entry.repeat ?? 1,
            repeatVerified: entry.repeatResults?.slice(1)
                .every((repeat) => repeat.repeatVerified === true) ?? true,
            resumed: entry.resumed === true
        })),
        schema: 'bus-sim-static-sun-depth-production-run-report-v1',
        selectedProfileIds: result.selectedProfileIds
    };
    process.stdout.write(canonicalJsonStringify(report) + '\n');
}

function parseProfileIds(value) {
    const ids = value.split(',').filter(Boolean);
    if (ids.length === 0 || new Set(ids).size !== ids.length) {
        throw new TypeError('--profiles must contain unique comma-separated IDs');
    }
    return ids;
}

function positiveInteger(value, flag) {
    if (!/^[1-9][0-9]*$/.test(value)
        || !Number.isSafeInteger(Number(value))) {
        throw new TypeError(`${flag} must be a positive safe integer`);
    }
    return Number(value);
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        const report = {
            code: typeof error?.code === 'string'
                ? error.code
                : 'static_sun_depth_production_failed',
            context: error?.context && typeof error.context === 'object'
                ? error.context
                : {},
            message: error instanceof Error ? error.message : String(error),
            schema: 'bus-sim-static-sun-depth-production-error-v1'
        };
        process.stderr.write(canonicalJsonStringify(report) + '\n');
        process.exitCode = 1;
    });
}
