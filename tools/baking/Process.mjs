// Runs owned child process trees headlessly, preserving logs and propagating cancellation.
// @ts-check
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

/** @param {string} executable @param {string[]} args @param {any} context */
export async function runBakeProcess(executable, args, context) {
    context.signal.throwIfAborted();
    const file = path.join(context.stage, `process-${context.processCount++}.log`);
    const output = createWriteStream(file);
    context.log.line(context.id, `Running ${path.basename(executable)} ${args[0] ?? ''}; full log: ${file}`);
    await new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd: context.root, shell: false, windowsHide: true,
            detached: process.platform !== 'win32', env: { ...process.env, ...context.env } });
        let tail = '', lastMessage = 0, terminating = false;
        const consume = chunk => {
            output.write(chunk);
            tail = (tail + chunk.toString()).slice(-5000);
            if (Date.now() - lastMessage > 10000) {
                const line = tail.trim().split(/[\r\n]/).filter(Boolean).at(-1);
                if (line) context.log.line(context.id, line.slice(0, 260));
                lastMessage = Date.now();
            }
        };
        child.stdout.on('data', consume); child.stderr.on('data', consume);
        const cancel = () => {
            if (terminating || !child.pid) return;
            terminating = true;
            if (process.platform === 'win32') {
                // Only the PID created above and its descendants belong to this run.
                const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
                killer.on('error', () => child.kill());
                killer.on('close', code => { if (code !== 0) child.kill(); });
            } else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') child.kill(); } }
        };
        context.signal.addEventListener('abort', cancel, { once: true });
        if (context.signal.aborted) cancel();
        child.once('error', error => { context.signal.removeEventListener('abort', cancel); reject(error); });
        child.once('close', code => {
            context.signal.removeEventListener('abort', cancel);
            if (context.signal.aborted) reject(context.signal.reason);
            else if (code !== 0) reject(new Error(`${context.id}: child exited ${code}. Log: ${file}\n${tail}`));
            else resolve(undefined);
        });
    }).finally(() => new Promise(resolve => output.end(resolve)));
    return file;
}
