// Builds and runs the exact isolated headless Blender compiler invocation.
// @ts-check

import { spawn } from 'node:child_process';
import { asCompilerError, failCompiler } from './CompilerErrors.mjs';

export const BLENDER_HEADLESS_ARGUMENT_PREFIX = Object.freeze([
    '--background',
    '--factory-startup',
    '--disable-autoexec',
    '--offline-mode',
    '--python-exit-code',
    '1',
    '--python'
]);

/**
 * @param {{pythonScriptPath: string, scriptArgs?: readonly string[]}} options
 * @returns {readonly string[]}
 */
export function buildBlenderArguments(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Blender argument options are required');
    assertString(options.pythonScriptPath, 'Blender Python script path');
    const scriptArgs = options.scriptArgs ?? [];
    if (!Array.isArray(scriptArgs) || scriptArgs.some((value) => typeof value !== 'string')) {
        throw new TypeError('Blender Python script arguments must be an array of strings');
    }
    return Object.freeze([
        ...BLENDER_HEADLESS_ARGUMENT_PREFIX,
        options.pythonScriptPath,
        '--',
        ...scriptArgs
    ]);
}

export { buildBlenderArguments as buildBlenderArgv };

/**
 * @param {{
 *   executablePath: string,
 *   pythonScriptPath: string,
 *   scriptArgs?: readonly string[],
 *   cwd: string,
 *   env: Readonly<Record<string, string>>,
 *   timeoutMs: number,
 *   killGraceMs?: number,
 *   maxOutputBytes?: number,
 *   signal?: AbortSignal
 * }} options
 * @param {{
 *   spawnImpl?: typeof spawn,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout
 * }} [deps]
 * @returns {Promise<Readonly<{exitCode: 0, signal: null, stdout: string, stderr: string, arguments: readonly string[]}>>}
 */
export async function runBlenderProcess(options, deps = {}) {
    assertProcessOptions(options);
    const args = buildBlenderArguments(options);
    if (options.signal?.aborted) {
        failCompiler('blender_process_aborted', 'Blender compiler was aborted before it started.', {});
    }
    const spawnImpl = deps.spawnImpl ?? spawn;
    const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
    const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
    const maxOutputBytes = options.maxOutputBytes ?? 262_144;
    const killGraceMs = options.killGraceMs ?? 5_000;

    return await new Promise((resolve, reject) => {
        let child;
        try {
            child = spawnImpl(options.executablePath, [...args], {
                cwd: options.cwd,
                env: { ...options.env },
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
        } catch (error) {
            reject(asCompilerError(error, 'blender_spawn_failed', 'Blender compiler process could not be created.', {}));
            return;
        }

        let stdout = '';
        let stderr = '';
        let stopReason = null;
        let settled = false;
        let forceTimer = null;
        const append = (current, chunk) => (current + String(chunk)).slice(-maxOutputBytes);
        child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
        child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });

        const requestStop = (reason) => {
            if (stopReason) return;
            stopReason = reason;
            try {
                child.kill('SIGTERM');
            } catch {}
            forceTimer = setTimeoutFn(() => {
                try {
                    child.kill('SIGKILL');
                } catch {}
            }, killGraceMs);
            forceTimer?.unref?.();
        };
        const timeout = setTimeoutFn(() => requestStop('timeout'), options.timeoutMs);
        timeout?.unref?.();
        const onAbort = () => requestStop('abort');
        options.signal?.addEventListener('abort', onAbort, { once: true });

        const cleanUp = () => {
            clearTimeoutFn(timeout);
            if (forceTimer) clearTimeoutFn(forceTimer);
            options.signal?.removeEventListener('abort', onAbort);
        };
        child.once('error', (error) => {
            if (settled) return;
            settled = true;
            cleanUp();
            reject(asCompilerError(error, 'blender_spawn_failed', 'Blender compiler process failed to start.', {}));
        });
        child.once('close', (code, signal) => {
            if (settled) return;
            settled = true;
            cleanUp();
            const context = { exitCode: code, signal: signal ?? null, stdout, stderr };
            if (stopReason === 'timeout') {
                reject(asCompilerError(null, 'blender_process_timeout', 'Blender compiler exceeded its explicit timeout.', {
                    ...context,
                    timeoutMs: options.timeoutMs
                }));
                return;
            }
            if (stopReason === 'abort') {
                reject(asCompilerError(null, 'blender_process_aborted', 'Blender compiler was interrupted by an abort signal.', context));
                return;
            }
            if (signal) {
                reject(asCompilerError(null, 'blender_process_signaled', 'Blender compiler exited because of a signal.', context));
                return;
            }
            if (code !== 0) {
                reject(asCompilerError(null, 'blender_process_nonzero', 'Blender compiler exited with a nonzero status.', context));
                return;
            }
            resolve(Object.freeze({ exitCode: 0, signal: null, stdout, stderr, arguments: args }));
        });
    });
}

/** @param {Parameters<typeof runBlenderProcess>[0]} options */
function assertProcessOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Blender process options are required');
    assertString(options.executablePath, 'Blender executable path');
    assertString(options.pythonScriptPath, 'Blender Python script path');
    assertString(options.cwd, 'Blender process working directory');
    if (!options.env || typeof options.env !== 'object' || Array.isArray(options.env)
        || Object.entries(options.env).some(([key, value]) => !key || typeof value !== 'string')) {
        throw new TypeError('Blender process environment must be an explicit string map');
    }
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new TypeError('Blender process timeoutMs must be a positive safe integer');
    }
    if (options.killGraceMs !== undefined && (!Number.isSafeInteger(options.killGraceMs) || options.killGraceMs <= 0)) {
        throw new TypeError('Blender process killGraceMs must be a positive safe integer');
    }
    if (options.maxOutputBytes !== undefined && (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes <= 0)) {
        throw new TypeError('Blender process maxOutputBytes must be a positive safe integer');
    }
}

/** @param {unknown} value @param {string} label */
function assertString(value, label) {
    if (typeof value !== 'string' || !value) throw new TypeError(`${label} must be a non-empty string`);
}
