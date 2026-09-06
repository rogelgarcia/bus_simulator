// Executes a validated bake plan sequentially with authenticated checkpoints and a run lock.
// @ts-check
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { digest, hashFile, writeJson, listFiles } from './Files.mjs';
import { runBakeProcess } from './Process.mjs';
import { acquireBakeLock } from './Lock.mjs';

/** @param {any[]} plan @param {any} settings @param {any} context */
export async function executeBakes(plan, settings, context) {
    const base = path.join(context.root, 'tests/artifacts/screens/ai556_bake_framework');
    await mkdir(base, { recursive: true });
    const lockPath = path.join(base, 'active.lock');
    const releaseLock = await acquireBakeLock(lockPath);
    const runRoot = path.join(base, `run-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`);
    const results = new Map(), summary = [];
    let done = 0, currentJob, currentStarted;
    try {
        await mkdir(runRoot, { recursive: true });
        const code = [];
        for (const directory of ['tools/baking', 'tools/bake_lighting', 'tools/bake_visibility', 'tools/bake_materials']) {
            for (const file of await listFiles(path.join(context.root, directory)).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
                if (!file.endsWith('.mjs') && !file.endsWith('.py') && !file.endsWith('defaults.json')) continue;
                code.push({ file: path.relative(context.root, file), ...await hashFile(file) });
            }
        }
        const codeHash = digest(code);
        for (const job of plan) {
            currentJob = job.id; currentStarted = Date.now();
            context.signal.throwIfAborted();
            const started = Date.now();
            const options = settings.get(job.id);
            const dependencies = Object.fromEntries([...(job.dependencies ?? []), ...(job.children ?? [])].map(id => [id, results.get(id)]));
            const stage = path.join(runRoot, job.id);
            await mkdir(stage, { recursive: true });
            const ctx = { ...context, id: job.id, options, stage, base, dependencies, processCount: 0,
                result: id => { if (!results.has(id)) throw new Error(`Unsatisfied dependency ${id}`); return results.get(id).result; } };
            ctx.process = (exe, args) => runBakeProcess(exe, args, ctx);
            ctx.node = (script, args = []) => ctx.process(process.execPath, [path.join(ctx.root, script), ...args.map(String)]);
            const inputs = job.inputs ? await job.inputs(ctx) : [];
            const inputHashes = [];
            for (const file of inputs) inputHashes.push({ file: path.relative(ctx.root, file), ...await hashFile(file) });
            const key = digest({ schema: 1, job: job.id, codeHash, inputs: inputHashes, options, publish: !!context.publish,
                toolchain: context.toolchain, dependencies: Object.values(dependencies).map(v => v.contentHash) });
            ctx.key = key;
            ctx.assertInputsStable = async () => {
                context.signal.throwIfAborted();
                for (const entry of [...code, ...inputHashes]) {
                    const current = await hashFile(path.resolve(context.root, entry.file));
                    if (current.sha256 !== entry.sha256 || current.bytes !== entry.bytes) throw new Error(`Bake input changed during execution: ${entry.file}`);
                }
            };
            const checkpoint = path.join(base, 'checkpoints', job.id, `${key}.json`);
            let saved;
            if (!job.always && !context.rebuild) {
                try {
                    saved = JSON.parse(await readFile(checkpoint, 'utf8'));
                    if (saved.key !== key || saved.schema !== 1) throw new Error('Checkpoint identity mismatch');
                    for (const item of saved.files) {
                        if (JSON.stringify(await hashFile(item.file)) !== JSON.stringify(item.hash)) throw new Error(`Checkpoint changed: ${item.file}`);
                    }
                    if (job.validate) await job.validate(saved.result, ctx);
                } catch (error) {
                    if (error.code !== 'ENOENT') context.log.line(job.id, `Checkpoint rejected: ${error.message}; rebuilding`);
                    saved = null;
                }
            }
            let timer;
            try {
                context.log.progress(job.id, done, plan.length, saved ? 'authenticated reuse' : 'working; job progress indeterminate');
                if (!saved) {
                    timer = setInterval(() => context.log.progress(job.id, done, plan.length, `working; job elapsed ${((Date.now() - started) / 1000).toFixed(0)}s; ETA unknown`), 30000);
                    const result = job.run ? await job.run(ctx) : { state: 'validated', files: [], children: Object.keys(dependencies) };
                    context.signal.throwIfAborted();
                    if (!['baked', 'validated', 'published'].includes(result.state)) throw new Error(`Invalid completion state from ${job.id}`);
                    if (job.validate) await job.validate(result, ctx);
                    await ctx.assertInputsStable();
                    const files = [];
                    for (const file of result.files ?? []) files.push({ file, hash: await hashFile(file) });
                    saved = { schema: 1, key, result, files, contentHash: digest({ key, hashes: files.map(v => v.hash) }) };
                    await writeJson(checkpoint, saved);
                    summary.push({ id: job.id, status: 'success', state: result.state, seconds: (Date.now() - started) / 1000, outputs: result.files });
                } else {
                    await ctx.assertInputsStable();
                    summary.push({ id: job.id, status: 'reused', state: saved.result.state, seconds: (Date.now() - started) / 1000, outputs: saved.result.files });
                }
                results.set(job.id, saved);
                done++;
                context.log.line(job.id, `${summary.at(-1).status}: ${saved.result.state} (${summary.at(-1).seconds.toFixed(1)}s)`, 'success');
            } catch (error) {
                summary.push({ id: job.id, status: context.signal.aborted ? 'cancelled' : 'failed', seconds: (Date.now() - started) / 1000, error: error.message });
                throw error;
            } finally { clearInterval(timer); }
        }
        context.log.progress('all', done, plan.length, 'complete');
        return summary;
    } catch (error) {
        if (currentJob && !summary.some(item => item.id === currentJob)) {
            summary.push({ id: currentJob, status: context.signal.aborted ? 'cancelled' : 'failed',
                seconds: (Date.now() - currentStarted) / 1000, error: error.message });
        }
        throw error;
    } finally {
        try {
            await writeJson(path.join(runRoot, 'summary.json'), { completed: done === plan.length, jobs: summary, pending: plan.filter(job => !summary.some(v => v.id === job.id)).map(v => v.id) });
            context.log.line('all', `Run summary: ${path.join(runRoot, 'summary.json')}`);
        } finally { await releaseLock(); }
    }
}
