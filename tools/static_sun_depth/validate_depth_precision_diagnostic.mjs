#!/usr/bin/env node
// Validates only the 12 canonical az135/el08 cases against RGB24+A evidence.

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    parseProductionValidationArgs,
    runProductionStaticSunDepthValidation
} from './validate_production.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');

export const PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_DEFAULTS = Object.freeze({
    depthPrecisionDiagnostic: true,
    outputRoot: path.join(
        repoRoot,
        'tests/artifacts/screens/illumination_531/depth_precision_rgba8_rgb24a_v1'
    ),
    packageIndexPath: path.join(
        repoRoot,
        'tests/artifacts/illumination_531/diagnostics/rgba8_rgb24a_global_v1',
        'package_index.json'
    ),
    timingContaminationReason:
        'multiple-process-and-gpu-contention-declared-by-user'
});

/** @param {readonly string[]} argv */
export function parseProductionDepthDiagnosticValidationArgs(argv) {
    const parsed = parseProductionValidationArgs(argv);
    if (parsed.help) return parsed;
    return Object.freeze({
        ...PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_DEFAULTS,
        ...parsed,
        depthPrecisionDiagnostic: true
    });
}

export function createProductionDepthDiagnosticValidationUsageText() {
    return [
        'Usage: node tools/static_sun_depth/validate_depth_precision_diagnostic.mjs [options]',
        '',
        'Validates only the 12 canonical ai527.sun.az135.el08 non-lab cases.',
        'The package index must use the diagnostic schema and separate artifact root.',
        '',
        '  --package-index <package_index.json>  Exact one-profile diagnostic mapping',
        '  --output-root <tests/artifacts/screens/illumination_531/...>',
        '  --url <http://127.0.0.1:port>          Reuse a repository static server',
        '  --port <number>                        Preferred local port (default 4173)',
        '  --chrome <path>                        Installed Chrome/Chromium executable',
        '  --warmup-frames <count>                Frames before each capture (default 2)',
        '  --timing-contaminated-reason <text>    Mark timings non-promotable',
        ''
    ].join('\n');
}

async function run(argv = process.argv.slice(2)) {
    const options = parseProductionDepthDiagnosticValidationArgs(argv);
    if (options.help) {
        process.stdout.write(createProductionDepthDiagnosticValidationUsageText());
        return;
    }
    const result = await runProductionStaticSunDepthValidation(options);
    process.stdout.write(`${JSON.stringify({
        caseCount: result.report.caseCount,
        ok: true,
        productionEligible: false,
        report: path.relative(repoRoot, result.reportPath).replaceAll('\\', '/'),
        timingContamination: result.report.timingContamination
    }, null, 2)}\n`);
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        process.stderr.write(
            `[StaticSunDepthPrecisionDiagnosticValidation] ${error?.stack ?? error}\n`
        );
        process.exitCode = 1;
    });
}
