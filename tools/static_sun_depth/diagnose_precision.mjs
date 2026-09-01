#!/usr/bin/env node
// Runs the isolated, non-promotable RGB24+A AI 531 precision diagnostic.

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    orchestrateProductionDepthDiagnostic
} from './src/ProductionDepthDiagnostic.mjs';
import {
    PRODUCTION_STATIC_SUN_DEFAULTS
} from './production.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');

export const PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS = Object.freeze({
    ...PRODUCTION_STATIC_SUN_DEFAULTS,
    artifactRoot: path.join(
        repoRoot,
        'tests/artifacts/illumination_531/diagnostics/rgba8_rgb24a_global_v1'
    )
});

/** @param {readonly string[]} argv */
export function parseProductionDepthDiagnosticArgs(argv) {
    if (!Array.isArray(argv)) throw new TypeError('CLI arguments must be an array');
    const options = {...PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') {
            return Object.freeze({help: true});
        }
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
            case '--timeout-ms':
                options.timeoutMs = positiveInteger(value, '--timeout-ms');
                break;
            case '--row-strip-pixels':
                options.rowStripPixels = positiveInteger(
                    value,
                    '--row-strip-pixels'
                );
                if (options.rowStripPixels !== 1821) {
                    throw new RangeError(
                        '--row-strip-pixels must preserve the production tile height of 1821'
                    );
                }
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    return Object.freeze(options);
}

export function createProductionDepthDiagnosticUsageText() {
    return `AI 531 one-profile RGB24+A depth precision diagnostic

Usage:
  node tools/static_sun_depth/diagnose_precision.mjs [options]

The command is hard-gated to ai527.sun.az135.el08, writes only below the
diagnostics artifact authority, and refuses to resume or overwrite a root.

Options:
  --input <package.bsib>       Fresh semantically validated AI 528 package
  --archive <blender.zip>      Pinned official Blender 5.2.1 archive
  --blender <blender.exe>      Pinned portable Blender 5.2.1 executable
  --toolchain <json>           Pinned AI 529 toolchain contract
  --profile <json>             Pinned proof_cpu_12.v1.json profile
  --renderer <python>          AI 531 production Blender renderer
  --output-root <directory>    New named child below illumination_531/diagnostics
  --timeout-ms <milliseconds>  Explicit timeout for the Blender process
  --row-strip-pixels <pixels>  Strict production tile height (must be 1821)
  --help                       Show this help
`;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseProductionDepthDiagnosticArgs(argv);
    if (options.help) {
        process.stdout.write(createProductionDepthDiagnosticUsageText());
        return;
    }
    const result = await orchestrateProductionDepthDiagnostic(options);
    process.stdout.write(canonicalJsonStringify({
        packageIndexPath: path.relative(repoRoot, result.packageIndexPath)
            .replaceAll('\\', '/'),
        performance: {
            reason: 'host-load-and-gpu-contention-declared-by-user',
            status: 'not_measured'
        },
        productionEligible: false,
        profileId: result.profile.lightingProfileId,
        schema: 'bus-sim-static-sun-depth-depth-precision-diagnostic-run-report-v1'
    }) + '\n');
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
        process.stderr.write(canonicalJsonStringify({
            code: typeof error?.code === 'string'
                ? error.code
                : 'static_sun_depth_precision_diagnostic_failed',
            message: error instanceof Error ? error.message : String(error),
            productionEligible: false,
            schema: 'bus-sim-static-sun-depth-depth-precision-diagnostic-error-v1'
        }) + '\n');
        process.exitCode = 1;
    });
}
