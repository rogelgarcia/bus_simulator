// Exercises real framework boundaries with inexpensive deterministic jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, CONFIG_PATH, loadBakeConfiguration } from '../../../tools/baking/Configuration.mjs';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { bakeOption, parseBakeOptions, resolveBakeOptions } from '../../../tools/baking/Options.mjs';
import { createBakeLog } from '../../../tools/baking/Log.mjs';
import { executeBakes } from '../../../tools/baking/Runner.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { acquireBakeLock } from '../../../tools/baking/Lock.mjs';
import { parseAlphaCutoutNativeFieldArguments } from '../../../tools/static_sun_depth/capture_alpha_cutout_native_field.mjs';
import { parseTextureGradFieldArguments } from '../../../tools/static_sun_depth/build_alpha_cutout_texture_grad_field.mjs';
import { resolveSharedSunProfile } from '../../../tools/bake_lighting/illumination/SharedSunReference.mjs';
import { selectProductionStaticSunProfiles } from '../../../tools/static_sun_depth/src/ProductionOrchestrator.mjs';

const evidence = path.join(REPO_ROOT, 'tests/artifacts/screens/ai556_bake_framework/unit');
await mkdir(evidence, { recursive: true });
const temporary = () => mkdtemp(path.join(evidence, 'fixture-'));

test('Enhanced resolution reaches shared preparation and rejects unsupported density', () => {
    const jobs = planBakes(bakeJobs, 'lighting/illumination');
    const settings = resolveBakeOptions(jobs, parseBakeOptions(['--samples', '512', '--device', 'OPTIX', '--set', 'lighting/illumination:texel-size=0.25']));
    assert.deepEqual(settings.get('lighting/illumination/prepare'), { samples: 512, device: 'OPTIX', 'texel-size': '0.25', 'facade-detail':'off' });
    assert.equal(resolveBakeOptions(jobs, parseBakeOptions(['--set','lighting/illumination:facade-detail=8cm'])).get('lighting/illumination/prepare')['facade-detail'],'8cm');
    assert.throws(()=>resolveBakeOptions(jobs,parseBakeOptions(['--set','lighting/illumination:facade-detail=2cm'])),/Expected one of/);
    assert.equal(resolveBakeOptions(jobs, parseBakeOptions([])).get('lighting/illumination/prepare')['texel-size'], '0.5');
    assert.throws(() => resolveBakeOptions(jobs, parseBakeOptions(['--set', 'lighting/illumination:texel-size=0.01'])), /Expected one of/);
    assert.throws(() => resolveBakeOptions(planBakes(bakeJobs, 'lighting/illumination/preview'), parseBakeOptions(['--set', 'lighting/illumination/preview:texel-size=0.25'])), /No selected job consumes/);
});
function logger(isTTY = false, env = {}) {
    const lines = [];
    return { lines, log: createBakeLog({ stream: { isTTY, write: text => lines.push(text) }, env, now: () => 1000 }) };
}

test('Bake configuration creates once, preserves edits, handles invalid values and paths with spaces', async () => {
    const root = await temporary();
    const file = path.join(root, CONFIG_PATH);
    await assert.rejects(loadBakeConfiguration(root), error => error.exitCode === 2 && error.message.includes(file));
    const original = await readFile(file, 'utf8');
    await assert.rejects(loadBakeConfiguration(root), /configure executable/);
    assert.equal(await readFile(file, 'utf8'), original);
    const executable = path.join(root, 'Existing Blender.app', 'Contents', 'MacOS', 'Blender');
    await mkdir(path.dirname(executable), { recursive: true }); await writeFile(executable, 'fixture executable');
    await writeFile(file, JSON.stringify({ executable: path.relative(root, executable) }));
    assert.equal((await loadBakeConfiguration(root)).executable, executable);
    await writeFile(file, '{invalid'); await assert.rejects(loadBakeConfiguration(root), /Invalid JSON/);
    assert.equal(await readFile(file, 'utf8'), '{invalid');
    await writeFile(file, JSON.stringify({ executable, unexpected: 4 })); await assert.rejects(loadBakeConfiguration(root), /Unknown configuration/);
    await writeFile(file, JSON.stringify({ executable: 42 })); await assert.rejects(loadBakeConfiguration(root), /path string/);
});

test('Bake config is gitignored and CLI resolves repo paths from another cwd', async () => {
    const ignore = await readFile(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    assert.ok(ignore.includes('/tools/baking/blender.local.json'));
    const directory = await temporary();
    const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tools/bake.mjs'), '--help'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.stdout.includes(CONFIG_PATH));
    assert.ok(!result.stdout.includes('Running blender'));
    const moduleUrl = pathToFileURL(path.join(REPO_ROOT, 'tools/baking/Configuration.mjs')).href;
    const discovery = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import {REPO_ROOT,loadBakeConfiguration} from ${JSON.stringify(moduleUrl)}; console.log(REPO_ROOT); try {await loadBakeConfiguration(process.argv[1]);} catch(e) {console.log(e.message);process.exitCode=e.exitCode;}`, directory],
    { cwd: directory, encoding: 'utf8' });
    assert.equal(discovery.status, 2, discovery.stdout + discovery.stderr);
    assert.ok(discovery.stdout.includes(REPO_ROOT));
    assert.ok(discovery.stdout.includes(path.join(directory, CONFIG_PATH)));
});

test('Bake graph orders dependencies, deduplicates prerequisites and rejects invalid registrations', () => {
    const definitions = [{ id: 'source' }, { id: 'lighting/indirect', dependencies: ['source'] },
        { id: 'lighting/sky', dependencies: ['source'] }, { id: 'lighting', children: ['lighting/indirect', 'lighting/sky'] },
        { id: 'all', children: ['lighting'] }];
    assert.deepEqual(planBakes(definitions, 'all').map(v => v.id), ['source', 'lighting/indirect', 'lighting/sky', 'lighting', 'all']);
    assert.deepEqual(planBakes(definitions, 'lighting/sky').map(v => v.id), ['source', 'lighting/sky']);
    assert.throws(() => planBakes([{ id: 'a', dependencies: ['b'] }, { id: 'b', children: ['a'] }], 'a'), /cycle/);
    assert.throws(() => planBakes([{ id: 'a', outputs: ['map'] }, { id: 'b', outputs: ['map'] }], 'a'), /Conflicting output/);
    assert.throws(() => planBakes([{ id: 'a', outputs: ['maps'] }, { id: 'b', outputs: ['maps/channel'] }], 'a'), /Conflicting output/);
    assert.throws(() => planBakes([{ id: 'a' }, { id: 'a' }], 'a'), /duplicate/);
    assert.throws(() => planBakes([{ id: 'a', children: ['missing'] }], 'a'), /Unknown bake job/);
    const production = planBakes(bakeJobs, 'all');
    assert.equal(production.filter(v => v.id === 'lighting/source').length, 1);
    for (const id of ['lighting/shadows', 'lighting/occlusion', 'lighting/preview-reference', 'visibility', 'materials/grass']) assert.ok(production.some(v => v.id === id));
    assert.ok(bakeJobs.some(v => v.id === 'lighting/illumination/preview'));
    const shadows = planBakes(bakeJobs, 'lighting/shadows').map(job => job.id);
    assert.ok(shadows.indexOf('lighting/shadows/cutouts') < shadows.indexOf('lighting/shadows/provisional'));
    assert.ok(shadows.indexOf('lighting/shadows/provisional') < shadows.indexOf('lighting/shadows/parity'));
    assert.ok(shadows.indexOf('lighting/shadows/parity') < shadows.indexOf('lighting/shadows'));
});

test('Enhanced direct references reject missing or incompatible source-sun profiles', () => {
    const profile = selectProductionStaticSunProfiles()[0];
    const source = [{ id: 'sun.default', directionThree: profile.directionThree }];
    assert.equal(resolveSharedSunProfile(source, { profiles: { [profile.id]: {} } }), profile.id);
    assert.throws(() => resolveSharedSunProfile(source, { profiles: {} }), /require shared shadows/);
    assert.throws(() => resolveSharedSunProfile([], { profiles: { [profile.id]: {} } }), /unsupported direction/);
});

test('Independent bake entries select their real prerequisite tree and forward machine paths', () => {
    const jobs = planBakes(bakeJobs, 'lighting/illumination/indirect');
    assert.deepEqual(jobs.map(job => job.id), ['lighting/source', 'lighting/illumination/prepare', 'lighting/illumination/indirect']);
    const options = resolveBakeOptions(jobs, parseBakeOptions(['--samples', '32', '--device', 'OPTIX']));
    assert.deepEqual(options.get('lighting/illumination/prepare'), { samples: 32, device: 'OPTIX', 'texel-size': '0.5', 'facade-detail':'off' });
    for (const parse of [parseTextureGradFieldArguments, parseAlphaCutoutNativeFieldArguments]) {
        const parsed = parse(['--blender', 'Existing Blender/blender.exe', '--archive', 'Existing Blender/archive.zip',
            '--output-root', 'tests/artifacts/illumination_531/ai556/parser-fixture']);
        assert.equal(parsed.executablePath, path.join(REPO_ROOT, 'Existing Blender/blender.exe'));
        assert.equal(parsed.archivePath, path.join(REPO_ROOT, 'Existing Blender/archive.zip'));
    }
});

test('Bake locks reject a concurrent owner and recover a dead owner', async () => {
    const root = await temporary(), lock = path.join(root, 'active.lock');
    const release = await acquireBakeLock(lock);
    await assert.rejects(acquireBakeLock(lock), /Another bake owns/);
    await release();
    const child = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
    assert.equal(child.status, 0);
    await writeFile(lock, JSON.stringify({ pid: child.pid }));
    const recovered = await acquireBakeLock(lock);
    assert.equal(JSON.parse(await readFile(lock, 'utf8')).pid, process.pid);
    await recovered();
});

test('Missing declared input reports the failing job and releases the run lock', async () => {
    const root = await temporary(), { log, lines } = logger();
    const job = { id: 'missing', inputs: () => [path.join(root, 'absent')] };
    await assert.rejects(executeBakes([job], new Map([['missing', {}]]), { root, log, signal: new AbortController().signal }), /ENOENT/);
    const summaryPath = lines.find(line => line.includes('Run summary: ')).split('Run summary: ')[1].trim();
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    assert.equal(summary.completed, false);
    assert.equal(summary.jobs[0].id, 'missing');
    assert.equal(summary.jobs[0].status, 'failed');
    await assert.rejects(access(path.join(root, 'tests/artifacts/screens/ai556_bake_framework/active.lock')));
});

test('Bake options forward defaults, common overrides and narrower scopes, and reject unused options', () => {
    const jobs = ['lighting/a', 'lighting/b'].map(id => ({ id, options: { samples: bakeOption.samples }, defaults: { samples: 64 } }));
    const options = parseBakeOptions(['--samples', '128', '--set', 'lighting:samples=256', '--set', 'lighting/a:samples=32']);
    const settings = resolveBakeOptions(jobs, options);
    assert.equal(settings.get('lighting/a').samples, 32); assert.equal(settings.get('lighting/b').samples, 256);
    assert.throws(() => parseBakeOptions(['--nonsense']), /Unknown/);
    assert.throws(() => resolveBakeOptions(jobs, parseBakeOptions(['--device', 'OPTIX'])), /unsupported/);
    assert.throws(() => resolveBakeOptions(jobs, parseBakeOptions(['--set', 'absent:samples=1'])), /No selected/);
    assert.throws(() => resolveBakeOptions(jobs, parseBakeOptions(['--samples', '0'])), /1 to 4096/);
    assert.throws(() => parseBakeOptions(['--timeout-seconds', 'NaN']), /positive/);
});

test('Bake logs honor TTY/NO_COLOR and report indeterminate progress without premature completion', () => {
    const plain = logger(); plain.log.progress('lighting/indirect', 0, 3, 'indeterminate; ETA unknown');
    assert.match(plain.lines[0], /^    \[lighting\/indirect\]/);
    assert.ok(!plain.lines[0].includes('\x1b')); assert.ok(!plain.lines[0].includes('100%'));
    const colored = logger(true); colored.log.line('all', 'done', 'success'); assert.ok(colored.lines[0].includes('\x1b[32m'));
    const disabled = logger(true, { NO_COLOR: '' }); disabled.log.line('all', 'done'); assert.ok(!disabled.lines[0].includes('\x1b'));
    const dumb = logger(true, { TERM: 'dumb' }); dumb.log.line('all', 'done'); assert.ok(!dumb.lines[0].includes('\x1b'));
});

test('Bake checkpoints authenticate outputs, inputs and settings, and rebuild after corruption', async () => {
    const root = await temporary(), { log } = logger();
    const input = path.join(root, 'input.txt'); await writeFile(input, 'first');
    let count = 0;
    const jobs = [{ id: 'leaf', inputs: () => [input], async run(ctx) { count++; const file = path.join(ctx.stage, 'output'); await writeFile(file, await readFile(input)); return { state: 'validated', files: [file] }; } }, { id: 'all', children: ['leaf'] }];
    const plan = planBakes(jobs, 'all'), settings = new Map(plan.map(v => [v.id, {}]));
    const context = { root, log, signal: new AbortController().signal, toolchain: { build: 'fixture' } };
    const first = await executeBakes(plan, settings, context); assert.equal(count, 1);
    const second = await executeBakes(plan, settings, context); assert.equal(count, 1); assert.equal(second[0].status, 'reused');
    await writeFile(first[0].outputs[0], 'corrupted'); await executeBakes(plan, settings, context); assert.equal(count, 2);
    await writeFile(input, 'changed'); await executeBakes(plan, settings, context); assert.equal(count, 3);
    await executeBakes(plan, settings, { ...context, rebuild: true }); assert.equal(count, 4);
    await executeBakes(plan, settings, { ...context, toolchain: { build: 'new' } }); assert.equal(count, 5);
});

test('Bake failure prevents consolidation, preserves checkpoints, and releases lock', async () => {
    const root = await temporary(), { log, lines } = logger(); let combined = false;
    const jobs = [{ id: 'fail', run: async () => { throw new Error('fixture failure'); } },
        { id: 'all', children: ['fail'], run: () => { combined = true; } }];
    await assert.rejects(executeBakes(planBakes(jobs, 'all'), new Map([['fail', {}], ['all', {}]]), { root, log, signal: new AbortController().signal }), /fixture failure/);
    assert.equal(combined, false); assert.ok(!lines.some(line => line.includes('complete')));
    await assert.rejects(access(path.join(root, 'tests/artifacts/screens/ai556_bake_framework/active.lock')));
});

test('Bake hard cancellation kills the owned child and stops the parent', async () => {
    const root = await temporary(), { log } = logger(), controller = new AbortController();
    const script = path.join(root, 'slow child.mjs');
    await writeFile(script, "setInterval(() => {}, 1000); console.log('started');");
    let timer;
    const jobs = [{ id: 'slow', async run(ctx) { timer = setTimeout(() => controller.abort(new Error('fixture cancelled')), 250); await ctx.process(process.execPath, [script]); throw new Error('must not complete'); } }];
    await assert.rejects(executeBakes(jobs, new Map([['slow', {}]]), { root, log, signal: controller.signal }), /fixture cancelled/);
    clearTimeout(timer);
});
