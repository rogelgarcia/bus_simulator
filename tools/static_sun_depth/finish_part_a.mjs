#!/usr/bin/env node
// CLI for the resumable deterministic AI 531 Part A finishing workflow.
// @ts-check

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    PRODUCTION_STATIC_SUN_DEFAULTS
} from './production.mjs';
import {
    orchestrateProductionStaticSunDepth
} from './src/ProductionOrchestrator.mjs';
import {
    runLabStaticSunDepthValidation
} from './validate_lab.mjs';
import {
    runProductionStaticSunDepthValidation
} from './validate_production.mjs';
import {
    runPartAFinishingDriver
} from './src/PartAFinishingDriver.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');
const productionRoot = path.join(
    repoRoot,
    'tests/artifacts/illumination_531/production_accepted_casters_v1_all8'
);
const screenRoot = path.join(
    repoRoot,
    'tests/artifacts/screens/illumination_531'
);

export const PART_A_DEFAULTS = Object.freeze({
    checkpointPath: path.join(productionRoot, 'part_a_checkpoint.json'),
    failureInventoryPath: path.join(productionRoot, 'part_a_failure_inventory.json'),
    isolationProbePath: path.join(
        screenRoot,
        'part_a_accepted_casters_v1/determinism_validation_state.json'
    ),
    labOutputRoot: path.join(screenRoot, 'lab_accepted_casters_v1_part_a'),
    productionOptions: Object.freeze({
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        alphaParityRoot: path.join(
            repoRoot,
            'tests/artifacts/illumination_531/native_field_parity_accepted_casters_v1'
        ),
        artifactRoot: productionRoot,
        inputPath: path.join(
            repoRoot,
            'tests/artifacts/illumination_528/packages/bigcity2',
            'ai531-production-accepted-casters-v1/bigcity2.bsib'
        ),
        nativeCutoutRoot: path.join(
            repoRoot,
            'tests/artifacts/illumination_531/native_cutout_fields/accepted_casters_v1_direct'
        ),
        repeat: 1
    }),
    productionOutputRoot: path.join(
        screenRoot,
        'production_accepted_casters_v1_part_a'
    ),
    repoRoot,
    timingContaminationReason:
        'concurrent processes and shared GPU contention declared by user',
    warmupFrames: 2
});

/** @param {readonly string[]} argv */
export function parsePartAFinishingArguments(argv) {
    const result = {
        ...PART_A_DEFAULTS,
        productionOptions: {...PART_A_DEFAULTS.productionOptions}
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        if (flag === '--acknowledge-first-failures') {
            result.acknowledgeFirstFailures = true;
            continue;
        }
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        const productionKey = ({
            '--alpha-parity-root': 'alphaParityRoot',
            '--archive': 'archivePath',
            '--blender': 'executablePath',
            '--input': 'inputPath',
            '--native-cutout-root': 'nativeCutoutRoot',
            '--output-root': 'artifactRoot',
            '--profile': 'profilePath',
            '--renderer': 'rendererPath',
            '--toolchain': 'toolchainPath'
        })[flag];
        if (productionKey) {
            result.productionOptions[productionKey] = path.resolve(value);
            if (flag === '--output-root') {
                result.checkpointPath = path.join(
                    result.productionOptions.artifactRoot,
                    'part_a_checkpoint.json'
                );
                result.failureInventoryPath = path.join(
                    result.productionOptions.artifactRoot,
                    'part_a_failure_inventory.json'
                );
            }
            continue;
        }
        switch (flag) {
            case '--checkpoint':
                result.checkpointPath = path.resolve(value);
                break;
            case '--failure-inventory':
                result.failureInventoryPath = path.resolve(value);
                break;
            case '--lab-output-root':
                result.labOutputRoot = path.resolve(value);
                break;
            case '--production-output-root':
                result.productionOutputRoot = path.resolve(value);
                break;
            case '--isolation-probe':
                result.isolationProbePath = path.resolve(value);
                break;
            case '--stop-after':
                result.stopAfter = value;
                break;
            case '--timeout-ms':
                result.productionOptions.timeoutMs = positiveInteger(value, flag);
                break;
            case '--warmup-frames':
                result.warmupFrames = nonNegativeInteger(value, flag);
                break;
            case '--timing-contaminated-reason':
                result.timingContaminationReason = value;
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    result.productionOptions = Object.freeze(result.productionOptions);
    return Object.freeze(result);
}

export function createPartAFinishingUsageText() {
    return `AI 531 Part A deterministic finishing driver

Usage:
  node tools/static_sun_depth/finish_part_a.mjs [options]

Options:
  --input <package.bsib>             Authenticated AI 528 city source
  --output-root <directory>          Exact-eight production artifact root
  --alpha-parity-root <directory>    Exact spatial-parity artifacts
  --native-cutout-root <directory>   Clean source-derived native fields
  --lab-output-root <directory>      Eight-case Lab evidence root
  --production-output-root <dir>     197-case production evidence root
  --checkpoint <json>                Persistent checkpoint path
  --failure-inventory <json>         Deterministic visual failure inventory
  --isolation-probe <json>           Presentation-only isolation state
  --stop-after <stage>               Stop cleanly after a named stage
  --acknowledge-first-failures       Record that chat pairs were delivered
  --timing-contaminated-reason <text>
  --warmup-frames <count>
  --timeout-ms <milliseconds>
  --archive/--blender/--toolchain/--profile/--renderer <path>
  --help
`;
}

async function main(argv = process.argv.slice(2)) {
    const options = parsePartAFinishingArguments(argv);
    if (options.help) {
        process.stdout.write(createPartAFinishingUsageText());
        return;
    }
    const controller = new AbortController();
    let stopRequested = false;
    const stop = () => {
        stopRequested = true;
        controller.abort(new Error('Part A stop requested'));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
        const checkpoint = await runPartAFinishingDriver({
            ...options,
            productionOptions: {
                ...options.productionOptions,
                signal: controller.signal
            },
            signal: controller.signal
        }, {
            orchestrateFn: orchestrateProductionStaticSunDepth,
            runLabFn: runLabStaticSunDepthValidation,
            runProductionValidationFn: runProductionStaticSunDepthValidation
        });
        process.stdout.write(canonicalJsonStringify({
            checkpoint: path.relative(repoRoot, options.checkpointPath).replaceAll('\\', '/'),
            exitState: checkpoint.exitState,
            failureInventory: checkpoint.stages.failureInventory.artifact?.path ?? null,
            presentation: checkpoint.presentation,
            revision: checkpoint.revision,
            schema: 'bus-sim-static-sun-depth-part-a-run-result-v1'
        }) + '\n');
    } catch (error) {
        if (stopRequested) {
            process.stderr.write('[StaticSunDepthPartA] stopped cleanly\n');
            process.exitCode = 2;
            return;
        }
        throw error;
    } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    }
}

function positiveInteger(value, flag) {
    const parsed = nonNegativeInteger(value, flag);
    if (parsed < 1) throw new TypeError(`${flag} must be positive`);
    return parsed;
}

function nonNegativeInteger(value, flag) {
    if (!/^[0-9]+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new TypeError(`${flag} must be a non-negative safe integer`);
    }
    return Number(value);
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`[StaticSunDepthPartA] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
