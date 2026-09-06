// Validates and expands declarative bake trees into a stable dependency schedule.
// @ts-check

/** @param {any[]} definitions @param {string} target */
export function planBakes(definitions, target) {
    const jobs = new Map();
    const claims = new Map();
    for (const job of definitions) {
        if (!/^[a-z][a-z0-9_/-]*$/.test(job.id) || jobs.has(job.id)) throw new Error(`Invalid or duplicate job ${job.id}`);
        for (const output of job.outputs ?? []) {
            const normalized = String(output).replaceAll('\\', '/').replace(/\/$/, '');
            if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid output claim ${output}`);
            for (const [claim, owner] of claims) {
                if (normalized === claim || normalized.startsWith(`${claim}/`) || claim.startsWith(`${normalized}/`)) {
                    throw new Error(`Conflicting output ${output}: ${owner} and ${job.id}`);
                }
            }
            claims.set(normalized, job.id);
        }
        jobs.set(job.id, job);
    }
    const checked = new Set(), stack = new Set();
    function validate(id) {
        if (!jobs.has(id)) throw new Error(`Unknown bake job ${id}`);
        if (stack.has(id)) throw new Error(`Bake dependency cycle at ${id}`);
        if (checked.has(id)) return;
        stack.add(id);
        for (const child of [...jobs.get(id).dependencies ?? [], ...jobs.get(id).children ?? []]) validate(child);
        stack.delete(id); checked.add(id);
    }
    for (const id of jobs.keys()) validate(id);
    const scheduled = new Set(), plan = [];
    function visit(id) {
        if (scheduled.has(id)) return;
        const job = jobs.get(id);
        if (!job) throw new Error(`Unknown bake target ${id}. Available: ${[...jobs.keys()].join(', ')}`);
        for (const child of [...job.dependencies ?? [], ...job.children ?? []]) visit(child);
        scheduled.add(id); plan.push(job);
    }
    visit(target);
    return plan;
}
