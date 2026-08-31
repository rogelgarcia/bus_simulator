// Compiles validated AI 529 static-depth intermediates into fixture-only guarded RG8 artifacts.
// @ts-check

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJsonStringify } from '../../src/app/illumination/bake_source/CanonicalJson.js';
import { createStaticSunDepthUsageText, parseStaticSunDepthCliArgs } from './src/CliArguments.mjs';
import { compileStaticSunDepthArtifact } from './src/StaticSunDepthArtifact.mjs';
import { asStaticSunDepthToolError } from './src/StaticSunDepthToolError.mjs';

export { createStaticSunDepthUsageText, parseStaticSunDepthCliArgs } from './src/CliArguments.mjs';
export * from './src/DepthEncoding.mjs';
export * from './src/IntermediateDepth.mjs';
export * from './src/StaticSunDepthArtifact.mjs';
export * from './src/StaticSunDepthToolError.mjs';

/** @param {readonly string[]} argv */
export async function runStaticSunDepthCommand(argv) {
    const options = parseStaticSunDepthCliArgs(argv);
    if (options.help) {
        return Object.freeze({
            help: createStaticSunDepthUsageText(),
            schema: 'bus-sim-static-sun-depth-cli-help-v1'
        });
    }
    return compileStaticSunDepthArtifact({
        fixture: options.fixture,
        guardPixels: options.guardPixels,
        manifestPath: path.resolve(options.manifestPath),
        outputRoot: path.resolve(options.outputRoot),
        runId: options.runId
    });
}

/**
 * @param {readonly string[]} [argv]
 * @param {{stdout?: {write: (text: string) => unknown}, stderr?: {write: (text: string) => unknown}}} [streams]
 */
export async function main(argv = process.argv.slice(2), streams = {}) {
    const stdout = streams.stdout ?? process.stdout;
    const stderr = streams.stderr ?? process.stderr;
    try {
        const result = await runStaticSunDepthCommand(argv);
        if (result.schema === 'bus-sim-static-sun-depth-cli-help-v1') stdout.write(result.help + '\n');
        else stdout.write(canonicalJsonStringify(result) + '\n');
        return 0;
    } catch (error) {
        const structured = asStaticSunDepthToolError(
            error,
            'static_sun_depth_tool_failed',
            'Static-sun depth tool failed.'
        );
        stderr.write(canonicalJsonStringify(structured.toJSON()) + '\n');
        return 1;
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
