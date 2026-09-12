// Capture validated candidates without replacing the user's installed package indexes.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hashFile } from '../../../baking/Files.mjs';

export async function candidateInputs(ctx, input) {
    let shadowIndex, receiverIndex, provenance = [];
    if (input === undefined) {
        const shadow = ctx.result('lighting/shadows'), receiver = ctx.result('lighting/illumination');
        if (![shadow, receiver].every(value => ['validated', 'published'].includes(value.state))) throw new Error('Bake dependencies are not validated');
        shadowIndex = shadow.index;
        receiverIndex = path.join(receiver.folder, 'package_index.json');
    } else {
        const indexFor = async (id, directory) => {
            const run = path.resolve(ctx.root, directory), base = path.join(ctx.root, 'tests/artifacts/screens/ai556_bake_framework');
            if (!run.startsWith(base + path.sep)) throw new Error('Candidate must be an existing bake framework run');
            const summaryPath = path.join(run, 'summary.json'), summary = JSON.parse(await readFile(summaryPath, 'utf8'));
            if (!summary.completed) throw new Error('Candidate bake has unfinished or failed stages');
            const job = summary.jobs.find(job => job.id === id);
            if (!job || !['success', 'reused'].includes(job.status) || !['validated', 'published'].includes(job.state)) throw new Error('Candidate stage is not validated: ' + id);
            const files = job.outputs.filter(file => path.basename(file) === 'package_index.json');
            const file = files.find(file => file.startsWith(run + path.sep)) ?? files[0];
            if (!file || !path.resolve(file).startsWith(ctx.root + path.sep)) throw new Error('Candidate index must stay in this workspace');
            if (!provenance.includes(summaryPath)) provenance.push(summaryPath);
            return file;
        };
        shadowIndex = await indexFor('lighting/shadows', ctx.options['shadow-run'] ?? input);
        receiverIndex = await indexFor('lighting/illumination', input);
    }
    // Re-run the package/coverage/publication validator without installing anything.
    await ctx.node('tools/receiver_lightmaps/publish.mjs', ['--enhanced', '--validate-only', '--from', path.dirname(path.dirname(receiverIndex))]);
    const shadows = JSON.parse(await readFile(shadowIndex, 'utf8'));
    const receivers = JSON.parse(await readFile(receiverIndex, 'utf8'));
    if (!shadows.profiles?.['ai527.sun.az045.el55'] || !receivers.channels?.indirect_irradiance) throw new Error('Candidate lacks the calibrated sun or indirect channel');
    const routeIndex = JSON.parse(JSON.stringify(receivers));
    for (const channel of Object.values(routeIndex.channels)) {
        channel.url = '/' + path.relative(ctx.root, path.resolve(path.dirname(receiverIndex), channel.url)).replaceAll('\\', '/');
    }
    const files = await Promise.all([...provenance, shadowIndex, receiverIndex].map(async file => ({ file: path.relative(ctx.root, file).replaceAll('\\', '/'), ...await hashFile(file) })));
    const bodies = {
        'assets/baked_lighting/shadows/package_index.json': JSON.stringify(shadows),
        'assets/baked_lighting/receivers/enhanced/package_index.json': JSON.stringify(routeIndex)
    };
    const resourceOverrides = Object.fromEntries(Object.entries(bodies).map(([file, body]) => [file, {
        file, sha256: createHash('sha256').update(body).digest('hex'), byteLength: Buffer.byteLength(body),
        content: JSON.parse(body), policy: 'Exact isolated-browser response; installed disk index is not served'
    }]));
    return { files, shadowIndex, receiverIndex, resourceOverrides, configurePage: async (page, origin) => {
        for (const [file, body] of Object.entries(bodies))
            await page.route(origin + '/' + file, route => route.fulfill({ body, contentType: 'application/json' }));
    } };
}
