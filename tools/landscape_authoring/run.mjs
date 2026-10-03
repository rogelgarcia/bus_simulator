// Exposes persistent landscape queries, data-batch authoring, and last-batch revert through a local CLI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLandscapeAuthoringStore, LANDSCAPE_AUTHORING_BUDGETS } from './LandscapeAuthoringStore.mjs';
import { atomicAuthoringWrite, readAuthoringFile } from './AuthoringFiles.mjs';
import { bindLandscapeBatchTemplate, bindLandscapeStateBatchTemplate } from './BatchTemplate.mjs';
import { LANDSCAPE_MANIFEST_BYTE_LIMIT } from '../../src/app/landscape/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const HELP = `Landscape authoring
  node tools/landscape_authoring/run.mjs state
  node tools/landscape_authoring/run.mjs query --x <meters> --z <meters> --selection-id <id> --expected-revision <revision> [--radius <meters>] [--output <context.json>]
  node tools/landscape_authoring/run.mjs bind --template <template.json> --context <context.json> --batch-id <fresh-id> --output <batch.json>
  node tools/landscape_authoring/run.mjs bind --template <template.json> --state <state.json> --batch-id <fresh-id> --output <batch.json>
  node tools/landscape_authoring/run.mjs apply --batch <batch.json>
  node tools/landscape_authoring/run.mjs revert --expected-revision <revision> [--batch-id <last-batch-id>]

All commands accept --directory <landscape-directory> (default: assets/public/landscape/coastal-city).
Exact selection queries admit at most four native chunks. All regions must stay inside the source bounds.
Edit batches stream large regions through an 8 MiB working set; named polygons, grading and smoothing are supported.
Apply requires an explicit revision and validated data operations. Stale or duplicate batches fail without publishing.
Revert publishes a new revision and retains accepted batch IDs, including the reverted ID.
Use --output to save command JSON. This is an authoring tool, not a source-import/bake command.
`;

const OPTIONS = Object.freeze({
    state: [], query: ['x', 'z', 'selection-id', 'expected-revision', 'radius'],
    bind: ['template', 'context', 'state', 'batch-id'], apply: ['batch'], revert: ['expected-revision', 'batch-id']
});

function parse(argv) {
    if (!argv.length || argv.includes('--help') || argv.includes('-h')) return { command: 'help', values: {} };
    const [command, ...args] = argv;
    if (!Object.hasOwn(OPTIONS, command)) throw new Error(`Unknown authoring command ${command}`);
    const values = {}, allowed = new Set([...OPTIONS[command], 'directory', 'output']);
    for (let index = 0; index < args.length; index += 2) {
        const option = args[index].replace(/^--/, ''), value = args[index + 1];
        if (!args[index].startsWith('--') || !allowed.has(option) || Object.hasOwn(values, option)) throw new Error(`Unsupported or repeated ${command} option ${args[index]}`);
        if (!value || value.startsWith('--')) throw new Error(`Missing value for --${option}`);
        values[option] = value;
    }
    return { command, values };
}

async function jsonFile(file, signal, maximum = LANDSCAPE_AUTHORING_BUDGETS.maxBatchBytes) {
    if (!file) throw new Error('A required JSON file option is missing');
    return JSON.parse((await readAuthoringFile(path.resolve(file), maximum, { signal })).toString('utf8'));
}

async function run(signal) {
    const { command, values } = parse(process.argv.slice(2));
    if (command === 'help') { process.stdout.write(HELP); return; }
    const directory = path.resolve(values.directory ?? path.join(root, 'assets/public/landscape/coastal-city'));
    const store = createLandscapeAuthoringStore({ directory });
    if (values.output) {
        const output = path.relative(directory, path.resolve(values.output)).replaceAll('\\', '/');
        if (/^(manifest(?:\.[a-f0-9]+)?\.json|authoring\.lock(?:\.recovering)?|payloads\/|source\/|appearance\/|chunks\/)/i.test(output)) throw new Error('Command output cannot overwrite managed landscape source files');
    }
    let result;
    if (command === 'state') result = await store.readState();
    if (command === 'query') result = await store.query({ x: Number(values.x), z: Number(values.z), selectionId: values['selection-id'],
        expectedRevision: values['expected-revision'], signal, ...(values.radius === undefined ? {} : { radius: Number(values.radius) }) });
    if (command === 'bind') {
        if (!!values.context === !!values.state) throw new Error('Bind requires exactly one of --context or --state');
        const template = await jsonFile(values.template, signal), identity = await jsonFile(values.context ?? values.state, signal,
            values.state ? LANDSCAPE_MANIFEST_BYTE_LIMIT : LANDSCAPE_AUTHORING_BUDGETS.maxBatchBytes);
        result = values.context ? bindLandscapeBatchTemplate(template, identity, { batchId: values['batch-id'] })
            : bindLandscapeStateBatchTemplate(template, identity, { batchId: values['batch-id'] });
    }
    if (command === 'apply') result = await store.apply(await jsonFile(values.batch, signal), { signal });
    if (command === 'revert') result = await store.revert({ expectedRevision: values['expected-revision'], batchId: values['batch-id'], signal });
    const output = JSON.stringify(result, null, 2) + '\n';
    if (values.output) await atomicAuthoringWrite(path.resolve(values.output), output);
    process.stdout.write(output);
}

const controller = new AbortController(), abort = () => controller.abort(new Error('Authoring command canceled before completion'));
process.on('SIGINT', abort); process.on('SIGTERM', abort);
try { await run(controller.signal); }
catch (error) { process.stderr.write(`[LandscapeAuthoring] ${error.message}\n`); process.exitCode = controller.signal.aborted ? 130 : 1; }
finally { process.off('SIGINT', abort); process.off('SIGTERM', abort); }
