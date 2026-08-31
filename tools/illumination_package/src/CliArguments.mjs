// Parses and documents deterministic illumination package command-line arguments.
// @ts-check

import { compareCanonicalStrings } from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { PackageToolError } from './PackageToolError.mjs';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CAPABILITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const OPTION_ALIASES = Object.freeze({
    '--input': 'input',
    '--profile': 'profilePath',
    '--city-id': 'cityId',
    '--lighting-profile-id': 'lightingProfileId',
    '--capability-profile-id': 'capabilityProfileId',
    '--output-root': 'outputRoot',
    '--artifact-root': 'artifactRoot',
    '--package': 'packagePath',
    '--run-id': 'runId',
    '--expected-city-id': 'expectedCityId',
    '--expect-city-id': 'expectedCityId',
    '--expected-lighting-profile-id': 'expectedLightingProfileId',
    '--expect-lighting-profile-id': 'expectedLightingProfileId',
    '--expected-capability-profile-id': 'expectedCapabilityProfileId',
    '--expect-capability-profile-id': 'expectedCapabilityProfileId',
    '--expected-source-sha256': 'expectedSourceSha256',
    '--expect-resolved-source-sha256': 'expectedSourceSha256',
    '--expected-profile-sha256': 'expectedProfileSha256',
    '--expect-profile-sha256': 'expectedProfileSha256',
    '--expected-compiler-signature-sha256': 'expectedCompilerSignatureSha256',
    '--expect-compiler-signature-sha256': 'expectedCompilerSignatureSha256',
    '--expected-aggregate-sha256': 'expectedAggregateSha256',
    '--expect-aggregate-sha256': 'expectedAggregateSha256',
    '--capability': 'runtimeCapabilities',
    '--runtime-capability': 'runtimeCapabilities',
    '--runtime-capabilities': 'runtimeCapabilities'
});

const COMMANDS = Object.freeze({
    pack: Object.freeze({
        required: Object.freeze(['input', 'cityId', 'lightingProfileId', 'capabilityProfileId', 'outputRoot']),
        allowed: Object.freeze(['input', 'profilePath', 'cityId', 'lightingProfileId', 'capabilityProfileId', 'outputRoot', 'runId'])
    }),
    inspect: Object.freeze({
        required: Object.freeze(['packagePath']),
        allowed: Object.freeze(['packagePath'])
    }),
    verify: Object.freeze({
        required: Object.freeze(['packagePath']),
        allowed: Object.freeze([
            'packagePath',
            'expectedCityId',
            'expectedLightingProfileId',
            'expectedCapabilityProfileId',
            'expectedSourceSha256',
            'expectedProfileSha256',
            'expectedCompilerSignatureSha256',
            'expectedAggregateSha256',
            'runtimeCapabilities'
        ])
    }),
    promote: Object.freeze({
        required: Object.freeze(['packagePath', 'artifactRoot', 'runId']),
        allowed: Object.freeze([
            'packagePath',
            'artifactRoot',
            'runId',
            'expectedCityId',
            'expectedLightingProfileId',
            'expectedCapabilityProfileId',
            'expectedSourceSha256',
            'expectedProfileSha256',
            'expectedCompilerSignatureSha256',
            'expectedAggregateSha256',
            'runtimeCapabilities'
        ])
    })
});

/** @param {readonly string[]} argv */
export function parseCliArgs(argv) {
    if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) {
        throw new TypeError('Illumination package CLI arguments must be an array of strings');
    }
    if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
        return Object.freeze({ command: null, help: true, runtimeCapabilities: Object.freeze([]) });
    }
    const command = argv[0];
    const contract = COMMANDS[command];
    if (!contract) {
        throw new PackageToolError('cli_command_unknown', 'Unknown illumination package command.', { command });
    }
    const values = {};
    const runtimeCapabilities = [];
    let help = false;
    for (let index = 1; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help' || token === '-h') {
            help = true;
            continue;
        }
        if (!token.startsWith('--')) {
            throw new PackageToolError('cli_positional_argument_unexpected', 'Unexpected positional CLI argument.', { command, token });
        }
        const equalsIndex = token.indexOf('=');
        const flag = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
        const key = OPTION_ALIASES[flag];
        if (!key) throw new PackageToolError('cli_option_unknown', 'Unknown illumination package option.', { command, option: flag });
        const value = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : argv[index + 1];
        if (equalsIndex < 0) index += 1;
        if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
            throw new PackageToolError('cli_option_value_missing', 'Illumination package option requires a value.', { command, option: flag });
        }
        if (key === 'runtimeCapabilities') {
            runtimeCapabilities.push(...parseCapabilities(value, flag));
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            throw new PackageToolError('cli_option_duplicate', 'Illumination package option may appear only once.', { command, option: flag });
        }
        values[key] = value;
    }
    if (!help) validateCommandOptions(command, contract, values, runtimeCapabilities);
    return Object.freeze({
        command,
        help,
        ...values,
        runtimeCapabilities: Object.freeze([...new Set(runtimeCapabilities)].sort(compareCanonicalStrings))
    });
}

/** @param {string | null} [command] */
export function createUsageText(command = null) {
    const lines = [
        'Usage: node tools/illumination_package/run.mjs <command> [options]',
        '',
        'Commands:',
        '  pack     Validate AI 529 intermediates, build, verify, and atomically publish a package.',
        '  inspect  Fully parse a package and print its embedded identity and inventories.',
        '  verify   Fully parse a package and enforce optional identity/runtime expectations.',
        '  promote  Re-verify and atomically publish a package into a production artifact root.'
    ];
    const details = {
        pack: [
            '--input <intermediate_manifest.json>', '--city-id <id>', '--lighting-profile-id <id>',
            '--capability-profile-id <id>', '--output-root <directory>',
            '--profile <profile.json> (optional)', '--run-id <safe-id> (optional; default pack)'
        ],
        inspect: ['--package <package.ilpkg>'],
        verify: ['--package <package.ilpkg>', ...expectationUsage()],
        promote: ['--package <package.ilpkg>', '--artifact-root <directory>', '--run-id <safe-id>', ...expectationUsage()]
    };
    if (command && details[command]) {
        lines.push('', command + ' options:', ...details[command].map((line) => '  ' + line));
    } else {
        lines.push('', 'Use <command> --help for command options.');
    }
    return lines.join('\n');
}

function validateCommandOptions(command, contract, values, runtimeCapabilities) {
    for (const key of contract.required) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) {
            throw new PackageToolError('cli_option_required', 'A required illumination package option is missing.', {
                command,
                option: optionName(key)
            });
        }
    }
    for (const key of Object.keys(values)) {
        if (!contract.allowed.includes(key)) {
            throw new PackageToolError('cli_option_not_allowed', 'Illumination package option is not valid for this command.', {
                command,
                option: optionName(key)
            });
        }
    }
    if (runtimeCapabilities.length > 0 && !contract.allowed.includes('runtimeCapabilities')) {
        throw new PackageToolError('cli_option_not_allowed', 'Runtime capabilities are not valid for this command.', { command });
    }
    validateExpectedHashes(values);
}

function parseCapabilities(value, option) {
    const values = value.split(',');
    if (values.some((entry) => !CAPABILITY_PATTERN.test(entry))) {
        throw new PackageToolError('cli_capability_invalid', 'Runtime capabilities must be comma-separated stable IDs.', { option, value });
    }
    return values;
}

function validateExpectedHashes(values) {
    for (const key of ['expectedSourceSha256', 'expectedProfileSha256', 'expectedCompilerSignatureSha256', 'expectedAggregateSha256']) {
        if (values[key] !== undefined && !SHA256_PATTERN.test(values[key])) {
            throw new PackageToolError('cli_sha256_invalid', 'Expected SHA-256 values must use 64 lowercase hexadecimal characters.', {
                option: optionName(key),
                value: values[key]
            });
        }
    }
}

function expectationUsage() {
    return [
        '--expected-city-id <id>', '--expected-lighting-profile-id <id>',
        '--expected-capability-profile-id <id>', '--expected-source-sha256 <sha256>',
        '--expected-profile-sha256 <sha256>', '--expected-compiler-signature-sha256 <sha256>',
        '--expected-aggregate-sha256 <sha256>', '--capability <id>[,<id>...] (repeatable)'
    ];
}

function optionName(key) {
    return Object.entries(OPTION_ALIASES).find(([, value]) => value === key)?.[0] ?? key;
}
