// Exposes persistent landscape queries, data-batch authoring, and last-batch revert through a local CLI.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLandscapeAuthoringStore, LANDSCAPE_AUTHORING_BUDGETS } from './LandscapeAuthoringStore.mjs';
import { atomicAuthoringWrite, readAuthoringFile } from './AuthoringFiles.mjs';
import { bindLandscapeBatchTemplate } from './BatchTemplate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const HELP = `Landscape authoring
  node tools/landscape_authoring/run.mjs state
  node tools/landscape_authoring/run.mjs query --x <meters> --z <meters> --selection-id <id> --expected-revision <revision> [--radius <meters>] [--output <context.json>]
  node tools/landscape_authoring/run.mjs bind --template <template.json> --context <context.json> --batch-id <fresh-id> --output <batch.json>
  node tools/landscape_authoring/run.mjs apply --batch <batch.json>
  node tools/landscape_authoring/run.mjs revert --expected-revision <revision> [--batch-id <last-batch-id>]

All commands accept --directory <landscape-directory> (default: assets/public/landscape/coastal-city).
Queries and edit batches admit at most four native chunks. A circle must stay inside the source bounds.
Apply requires an explicit revision and validated data operations. Stale or duplicate batches fail without publishing.
Revert publishes a new revision and retains accepted batch IDs, including the reverted ID.
Use --output to save command JSON. This is an authoring tool, not a source-import/bake command.
`;

const OPTIONS = Object.freeze({
    state: [], query: ['x', 'z', 'selection-id', 'expected-revision', 'radius'],
    bind: ['template', 'context', 'batch-id'], apply: ['batch'], revert: ['expected-revision', 'batch-id']
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

async function jsonFile(file, maximum = LANDSCAPE_AUTHORING_BUDGETS.maxBatchBytes) {
    if (!file) throw new Error('A required JSON file option is missing');
    return JSON.parse((await readAuthoringFile(path.resolve(file), maximum)).toString('utf8'));
}

async function run() {
    const { command, values } = parse(process.argv.slice(2));
    if (command === 'help') { process.stdout.write(HELP); return; }
    const directory = path.resolve(values.directory ?? path.join(root, 'assets/public/landscape/coastal-city'));
    const store = createLandscapeAuthoringStore({ directory });
    if (values.output) {
        const output = path.relative(directory, path.resolve(values.output)).replaceAll('\\', '/');
        if (/^(manifest(?:\.[a-f0-9]+)?\.json|authoring\.lock(?:\.recovering)?|payloads\/|source\/)/.test(output)) throw new Error('Command output cannot overwrite managed landscape source files');
    }
    let result;
    if (command === 'state') result = await store.readState();
    if (command === 'query') result = await store.query({ x: Number(values.x), z: Number(values.z), selectionId: values['selection-id'],
        expectedRevision: values['expected-revision'], ...(values.radius === undefined ? {} : { radius: Number(values.radius) }) });
    if (command === 'bind') result = bindLandscapeBatchTemplate(await jsonFile(values.template), await jsonFile(values.context), { batchId: values['batch-id'] });
    if (command === 'apply') result = await store.apply(await jsonFile(values.batch));
    if (command === 'revert') result = await store.revert({ expectedRevision: values['expected-revision'], batchId: values['batch-id'] });
    const output = JSON.stringify(result, null, 2) + '\n';
    if (values.output) await atomicAuthoringWrite(path.resolve(values.output), output);
    process.stdout.write(output);
}

await run().catch(error => { process.stderr.write(`[LandscapeAuthoring] ${error.message}\n`); process.exitCode = 1; });
