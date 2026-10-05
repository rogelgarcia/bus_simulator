// Validates the installed opt-in library and proves packaging preserves every reviewed geometry byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { validateLod0Library } from '../../../tools/bake_vegetation/lod0_library/Package.mjs';
import { lod0LibraryJob } from '../../../tools/bake_vegetation/lod0_library/job.mjs';
import { vegetationJobs } from '../../../tools/bake_vegetation/jobs.mjs';
import { glbDocument } from '../../../tools/bake_vegetation/Validate.mjs';

const directory = path.resolve('assets/public/vegetation_lod0');
const source = path.resolve('tests/artifacts/screens/ai591_core_canopies/final');
const available = await access(path.join(directory, 'index.json')).then(() => true, () => false);
const reviewed = await access(path.join(source, 'revision.json')).then(() => true, () => false);

test('LOD0 publication is explicit and cannot use the asset directory as its review source', async () => {
    assert.ok(vegetationJobs.includes(lod0LibraryJob));
    assert.ok(!vegetationJobs.find(job => job.id === 'vegetation').children.includes(lod0LibraryJob.id));
    for (const invalid of ['assets/public/vegetation_lod0', 'tests/artifacts/screens', '../external']) {
        await assert.rejects(lod0LibraryJob.run({ root: path.resolve('.'), options: { source: invalid } }), /separate reviewed source/);
    }
});

test('installed library authenticates all maps and maintains the combined geometry budget', { skip: !available }, async () => {
    await validateLod0Library({ directory });
    const manifest = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
    const meshes = manifest.models.reduce((bytes, model) => bytes + model.bytes, 0);
    const textures = Object.values(manifest.textures).reduce((bytes, texture) => bytes + texture.bytes, 0);
    const embedded = manifest.models.reduce((bytes, model) => bytes + model.sourceGlb.bytes, 0);
    assert.ok(meshes + textures < embedded * 0.65, 'external canopy sharing must remove duplicated texture bytes');
});

test('installed geometry is byte-identical to the accepted review before texture externalization', { skip: !available || !reviewed }, async () => {
    const manifest = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
    for (const model of manifest.models) {
        const variant = model.id.split('/')[1];
        const before = glbDocument(await readFile(path.join(source, model.id, `${variant}_lod0.glb`)));
        const after = glbDocument(await readFile(path.join(directory, model.file)));
        assert.deepEqual(after.json.meshes, before.json.meshes);
        assert.deepEqual(after.json.nodes, before.json.nodes);
        assert.equal(after.json.accessors.length, before.json.accessors.length);
        for (const [index, accessor] of after.json.accessors.entries()) {
            const original = before.json.accessors[index];
            assert.deepEqual({ ...accessor, bufferView: 0 }, { ...original, bufferView: 0 });
            const oldView = before.json.bufferViews[original.bufferView], newView = after.json.bufferViews[accessor.bufferView];
            assert.deepEqual({ ...newView, byteOffset: 0 }, { ...oldView, byteOffset: 0 });
            assert.ok(before.bin.subarray(oldView.byteOffset ?? 0, (oldView.byteOffset ?? 0) + oldView.byteLength)
                .equals(after.bin.subarray(newView.byteOffset ?? 0, (newView.byteOffset ?? 0) + newView.byteLength)), `${model.id}: geometry bytes changed`);
        }
    }
});
