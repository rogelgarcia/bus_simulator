// Verifies exact shell-free Blender argv and deterministic process failures.

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
    BLENDER_HEADLESS_ARGUMENT_PREFIX,
    buildBlenderArgv,
    runBlenderProcess
} from '../../../../tools/illumination_bake_compiler/src/BlenderProcess.mjs';
import { CompilerError } from '../../../../tools/illumination_bake_compiler/src/CompilerErrors.mjs';

function fakeChild(onKill = null) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kills = [];
    child.kill = (signal) => {
        child.kills.push(signal);
        onKill?.(child, signal);
        return true;
    };
    return child;
}

function options(overrides = {}) {
    return {
        executablePath: 'C:/pinned/blender.exe',
        pythonScriptPath: 'C:/repo/compiler.py',
        scriptArgs: ['--profile', 'proof.json'],
        cwd: 'C:/repo',
        env: { PATH: 'C:/pinned' },
        timeoutMs: 1_000,
        ...overrides
    };
}

test('Blender argv begins with the exact factory/offline contract and uses shell false', async () => {
    const calls = [];
    const child = fakeChild();
    const spawnImpl = (command, args, spawnOptions) => {
        calls.push({ command, args, spawnOptions });
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
    };
    const expected = [
        ...BLENDER_HEADLESS_ARGUMENT_PREFIX,
        'C:/repo/compiler.py',
        '--',
        '--profile',
        'proof.json'
    ];
    assert.deepEqual(buildBlenderArgv(options()), expected);
    const result = await runBlenderProcess(options(), { spawnImpl });
    assert.deepEqual(result.arguments, expected);
    assert.equal(calls[0].command, 'C:/pinned/blender.exe');
    assert.deepEqual(calls[0].args, expected);
    assert.equal(calls[0].spawnOptions.shell, false);
    assert.deepEqual(calls[0].spawnOptions.env, { PATH: 'C:/pinned' });
});

test('Blender process reports spawn, nonzero, and external-signal failures distinctly', async () => {
    await assert.rejects(
        runBlenderProcess(options(), { spawnImpl: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } }),
        (error) => error instanceof CompilerError && error.code === 'blender_spawn_failed'
    );

    const nonzero = fakeChild();
    await assert.rejects(
        runBlenderProcess(options(), {
            spawnImpl: () => {
                queueMicrotask(() => {
                    nonzero.stderr.write('fixture failure');
                    nonzero.emit('close', 7, null);
                });
                return nonzero;
            }
        }),
        (error) => error instanceof CompilerError
            && error.code === 'blender_process_nonzero'
            && error.context.exitCode === 7
            && error.context.stderr.includes('fixture failure')
    );

    const signaled = fakeChild();
    await assert.rejects(
        runBlenderProcess(options(), {
            spawnImpl: () => {
                queueMicrotask(() => signaled.emit('close', null, 'SIGSEGV'));
                return signaled;
            }
        }),
        (error) => error instanceof CompilerError
            && error.code === 'blender_process_signaled'
            && error.context.signal === 'SIGSEGV'
    );
});

test('Blender timeout terminates the child and waits for close before rejecting', async () => {
    let closed = false;
    const child = fakeChild((target, signal) => {
        if (signal === 'SIGTERM') queueMicrotask(() => {
            closed = true;
            target.emit('close', null, 'SIGTERM');
        });
    });
    await assert.rejects(
        runBlenderProcess(options({ timeoutMs: 5, killGraceMs: 100 }), { spawnImpl: () => child }),
        (error) => error instanceof CompilerError && error.code === 'blender_process_timeout'
    );
    assert.equal(closed, true);
    assert.deepEqual(child.kills, ['SIGTERM']);
});

test('Blender abort is distinct from timeout and interruption before spawn never launches', async () => {
    const controller = new AbortController();
    const child = fakeChild((target, signal) => {
        if (signal === 'SIGTERM') queueMicrotask(() => target.emit('close', null, 'SIGTERM'));
    });
    const pending = runBlenderProcess(options({ signal: controller.signal }), { spawnImpl: () => child });
    controller.abort();
    await assert.rejects(
        pending,
        (error) => error instanceof CompilerError && error.code === 'blender_process_aborted'
    );
    assert.deepEqual(child.kills, ['SIGTERM']);

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    let spawnCount = 0;
    await assert.rejects(
        runBlenderProcess(options({ signal: alreadyAborted.signal }), { spawnImpl: () => { spawnCount += 1; } }),
        (error) => error instanceof CompilerError && error.code === 'blender_process_aborted'
    );
    assert.equal(spawnCount, 0);
});
