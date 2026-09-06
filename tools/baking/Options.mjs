// Parses common and scoped bake options, rejecting overrides with no consumer.
// @ts-check
const FLAGS = new Set(['help', 'dry-run', 'rebuild', 'publish']);
const VALUES = new Set(['target', 'samples', 'device', 'profile', 'timeout-seconds']);

/** @param {string[]} argv */
export function parseBakeOptions(argv) {
    const result = { flags: {}, values: {}, scoped: [] };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i] === '-h' ? 'help' : argv[i].replace(/^--/, '');
        if (!argv[i].startsWith('-')) throw new Error(`Unexpected argument ${argv[i]}`);
        if (FLAGS.has(flag)) { result.flags[flag] = true; continue; }
        if (!VALUES.has(flag) && flag !== 'set') throw new Error(`Unknown bake option --${flag}. See --help.`);
        const value = argv[++i];
        if (!value || value.startsWith('--')) throw new Error(`--${flag} requires a value`);
        if (flag === 'set') {
            const match = /^([a-z][a-z0-9_./-]*):([a-z][a-z0-9-]*)=(.+)$/.exec(value);
            if (!match) throw new Error('--set expects job/id:option=value');
            result.scoped.push({ id: match[1], key: match[2], value: match[3] });
        } else result.values[flag] = value;
    }
    if (result.values['timeout-seconds'] !== undefined && (!Number.isFinite(Number(result.values['timeout-seconds'])) || Number(result.values['timeout-seconds']) <= 0 || Number(result.values['timeout-seconds']) > 2147483)) throw new Error('--timeout-seconds must be positive and at most 2147483 (hard timeout for the entire requested run)');
    return result;
}

/** Resolves inherited settings through owning parents, including shared prerequisites.
 * @param {any[]} jobs @param {ReturnType<typeof parseBakeOptions>} options */
export function resolveBakeOptions(jobs, options) {
    const consumed = new Set();
    const settings = new Map();
    for (const job of jobs) {
        const effective = { ...job.defaults };
        for (const key of Object.keys(job.options ?? {})) {
            if (options.values[key] !== undefined) { effective[key] = options.values[key]; consumed.add(key); }
            for (const item of [...options.scoped].sort((a, b) => a.id.length - b.id.length)) {
                if (item.key === key && (job.id === item.id || job.id.startsWith(item.id + '/'))) {
                    effective[key] = item.value; consumed.add(item);
                }
            }
            if (effective[key] !== undefined) effective[key] = job.options[key](effective[key]);
        }
        settings.set(job.id, Object.freeze(effective));
    }
    for (const key of Object.keys(options.values)) if (!['target', 'timeout-seconds'].includes(key) && !consumed.has(key)) throw new Error(`--${key} is unsupported by the selected jobs`);
    for (const item of options.scoped) if (!consumed.has(item)) throw new Error(`No selected job consumes ${item.id}:${item.key}`);
    return settings;
}

export const bakeOption = Object.freeze({
    samples: value => { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 4096) throw new Error('Samples must be an integer from 1 to 4096'); return n; },
    device: value => { if (!['CPU', 'OPTIX'].includes(value)) throw new Error('Device must be CPU or OPTIX'); return value; },
    choice: values => value => { if (!values.includes(value)) throw new Error(`Expected one of ${values.join(', ')}, received ${value}`); return value; }
});
