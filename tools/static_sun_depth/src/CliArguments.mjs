// Parses the deliberately small static-sun depth fixture compiler CLI.
// @ts-check

import { failStaticSunDepth } from './StaticSunDepthToolError.mjs';

const VALUE_FLAGS = Object.freeze(new Set(['--guard-pixels', '--input', '--output-root', '--run-id']));

/** @param {readonly string[]} argv */
export function parseStaticSunDepthCliArgs(argv) {
    if (!Array.isArray(argv)) throw new TypeError('CLI arguments must be an array');
    const values = new Map();
    let fixture = false;
    let help = false;
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') {
            if (help) cliFailure('cli_argument_duplicate', 'Help flag is duplicated.', { flag });
            help = true;
            continue;
        }
        if (flag === '--fixture') {
            if (fixture) cliFailure('cli_argument_duplicate', 'Fixture flag is duplicated.', { flag });
            fixture = true;
            continue;
        }
        if (!VALUE_FLAGS.has(flag)) cliFailure('cli_argument_unknown', 'Unknown static-sun depth argument.', { argument: flag });
        if (values.has(flag)) cliFailure('cli_argument_duplicate', 'Static-sun depth argument is duplicated.', { flag });
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            cliFailure('cli_argument_value_missing', 'Static-sun depth argument requires a value.', { flag });
        }
        values.set(flag, value);
        index += 1;
    }
    if (help) return Object.freeze({ help: true });
    for (const flag of ['--input', '--output-root']) {
        if (!values.has(flag)) cliFailure('cli_argument_required', 'A required static-sun depth argument is missing.', { flag });
    }
    const guardText = values.get('--guard-pixels') ?? '2';
    if (!/^(?:[1-9]|[1-5][0-9]|6[0-4])$/.test(guardText)) {
        cliFailure('cli_guard_pixels_invalid', '--guard-pixels must be an integer from 1 through 64.', {
            value: guardText
        });
    }
    const runId = values.get('--run-id') ?? 'run-01';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
        cliFailure('cli_run_id_invalid', '--run-id must be a filesystem-safe stable identifier.', { value: runId });
    }
    return Object.freeze({
        fixture,
        guardPixels: Number(guardText),
        help: false,
        manifestPath: /** @type {string} */ (values.get('--input')),
        outputRoot: /** @type {string} */ (values.get('--output-root')),
        runId
    });
}

export function createStaticSunDepthUsageText() {
    return [
        'Usage:',
        '  node tools/static_sun_depth/run.mjs --input <intermediate_manifest.json> --output-root <directory> [options]',
        '',
        'Options:',
        '  --fixture            Explicitly label and allow the checked AI 529 32x32 proof as a non-production fixture.',
        '  --guard-pixels <n>    Duplicate 1..64 edge texels on every side (default: 2).',
        '  --run-id <id>         Stable atomic-stage identifier (default: run-01).',
        '  --help, -h            Show this help.',
        '',
        'Without --fixture, the checked AI 529 proof is rejected and no artifact is promoted.'
    ].join('\n');
}

/** @returns {never} */
function cliFailure(code, message, context) {
    failStaticSunDepth(code, message, context);
}
