// Checks publication isolation, exact reviewed exports and detection of damaged assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {branchletLibraryJob} from '../../../tools/bake_vegetation/branchlet_library/job.mjs';
import {validateBranchletLibrary} from '../../../tools/bake_vegetation/branchlet_library/Package.mjs';
import {vegetationJobs} from '../../../tools/bake_vegetation/jobs.mjs';
import {hashFile} from '../../../tools/baking/Files.mjs';

const directory = path.resolve('assets/public/vegetation_lods');
const source = path.resolve('tests/artifacts/screens/ai594_branchlet_canopies/final');
const available = await access(path.join(directory, 'index.json')).then(() => true, () => false);
const reviewed = await access(path.join(source, 'validation.json')).then(() => true, () => false);

test('branchlet asset publication is explicit and isolates reviewed inputs', async () => {
    assert.ok(vegetationJobs.includes(branchletLibraryJob));
    assert.ok(!vegetationJobs.find(job => job.id === 'vegetation').children.includes(branchletLibraryJob.id));
    for (const key of ['source', 'source0', 'source1']) for (const invalid of ['assets/public/vegetation_lods', 'tests/artifacts/screens', '../external']) {
        await assert.rejects(branchletLibraryJob.run({root: path.resolve('.'), options: {...branchletLibraryJob.defaults, [key]: invalid}}), /separate reviewed sources/);
    }
});

test('installed branchlet library authenticates all 30 models and embedded PBR', {skip: !available}, async () => {
    await validateBranchletLibrary({directory});
});

test('installed models are byte-identical to the final reviewed LOD0 and LOD1', {skip: !available || !reviewed}, async () => {
    const manifest = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
    for (const model of manifest.models) {
        const original = path.join(source, `lod${model.level}`, model.id, model.id.split('/')[1]+`_lod${model.level}.glb`);
        assert.deepEqual(await hashFile(original), await hashFile(path.join(directory, model.file)), model.file);
    }
});

test('asset authentication rejects corrupted model bytes before loading', {skip: !available}, async () => {
    const manifest = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
    const fixture = path.resolve(`tests/artifacts/screens/vegetation_branchlet_library_tests/corrupt-${Date.now()}`);
    const first = manifest.models[0];
    await mkdir(path.dirname(path.join(fixture, first.file)), {recursive: true});
    await writeFile(path.join(fixture, 'index.json'), JSON.stringify(manifest));
    await writeFile(path.join(fixture, first.file), 'damaged model');
    await assert.rejects(validateBranchletLibrary({directory: fixture}), /Asset authentication failed/);
});
