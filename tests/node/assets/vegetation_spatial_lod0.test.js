// Validate staged canopy revisions, baseline preservation, coverage guards and exact triangle accounting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lod0Job} from '../../../tools/bake_vegetation/lod0/job.mjs';
import {hashFile} from '../../../tools/baking/Files.mjs';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {readAccessor} from '../../../tools/bake_vegetation/Accessors.mjs';
import {decodePng} from '../../../tools/bake_vegetation/lod0/Png.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'tests/artifacts/screens/ai590_spatial_canopy/final');
const baseline = path.join(root, 'tests/artifacts/screens/ai589_lod0_vegetation/final');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const generated = {skip: existsSync(path.join(output, 'revision.json')) ? false : 'Spatial review assets are intentionally gitignored.'};

test('Spatial LOD0 rejects writing into or around its preserved baseline', async () => {
    const outputs = [baseline, path.join(baseline, 'child'), path.dirname(baseline)];
    for (const directory of outputs) await assert.rejects(lod0Job.run({root, publish: false,
        options: {scene: 'tests/artifacts/screens/reference-fixture', output: directory, baseline, placement: 'spatial'}}), /must not overlap/);
    await assert.rejects(lod0Job.run({root, publish: false, options: {scene: 'tests/artifacts/screens/reference-fixture',
        output: lod0Job.defaults.output, placement: 'spatial'}}), /new output directory/);
    if (process.platform === 'win32') await assert.rejects(lod0Job.run({root, publish: false, options: {scene: 'tests/artifacts/screens/reference-fixture',
        output: lod0Job.defaults.output.toUpperCase(), placement: 'spatial'}}), /new output directory/);
});

test('Spatial revision preserves every accepted trunk and bark map byte-for-byte', generated, async () => {
    const reused = await json(path.join(output, 'reused-wood.json'));
    assert.equal(reused.files.length, 75);
    for (const entry of reused.files) {
        const old = await hashFile(path.join(baseline, entry.model, entry.file));
        const current = await hashFile(path.join(output, entry.model, entry.file));
        assert.equal(old.sha256, entry.sha256);
        assert.equal(current.sha256, entry.sha256);
    }
    const reference = await json(path.join(output, 'reference.json'));
    assert.equal((await hashFile(path.join(reference.source, reference.scene))).sha256, reference.sha256);
});

test('Spatial cards preserve each spray and honor all 24 alpha-coverage guards', generated, async () => {
    const revision = await json(path.join(output, 'revision.json'));
    assert.equal(revision.models.length, 15);
    for (const row of revision.models) {
        const guard = await json(path.join(output, row.id, 'coverage.json'));
        assert.equal(row.placement, 'spatial');
        assert.equal(guard.views.length, 24);
        assert.ok(guard.minimumPatchesPerSpray >= 2);
        assert.equal(guard.candidateCards, row.spraysPreserved * 3);
        assert.equal(row.cards, guard.retainedCards);
        assert.ok(guard.removedCards > 0 && guard.reductionPercent <= 15);
        assert.ok(guard.opaqueFragmentSamplesAfter < guard.opaqueFragmentSamplesBefore);
        for (const view of guard.views) {
            assert.ok(view.afterPixels > 0 && view.afterPixels <= view.beforePixels);
            assert.ok(view.coverageLossFraction <= .0025 + 1e-9, row.id);
            assert.ok(Math.abs(view.coverageLossFraction - (1 - view.afterPixels / view.beforePixels)) < 1e-12);
        }
    }
});

test('Spatial atlases retain the captured linear albedo and coverage-preserving mips', generated, async () => {
    const revision = await json(path.join(output, 'revision.json'));
    for (const species of Object.keys(revision.names)) {
        const directory = path.join(output, species, 'canopy');
        const atlas = await json(path.join(directory, 'atlas.json'));
        assert.equal(atlas.placement, 'spatial');
        const png = decodePng(await readFile(path.join(directory, 'leaf_color.png')));
        const sum = [0, 0, 0]; let count = 0;
        for (let offset = 0; offset < png.data.length; offset += 4) {
            if (png.data[offset + 3] < 250) continue;
            count++;
            for (let channel = 0; channel < 3; channel++) {
                const value = png.data[offset + channel] / 255;
                sum[channel] += value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
            }
        }
        for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(sum[channel] / count - atlas.sourceLinearMeanRGB[channel]) < .004);
        for (const mip of atlas.mips) assert.ok(mip.maxTileCoverageError < .012);
    }
});

test('All revised GLBs report their actual trunk and leaf indices separately', generated, async () => {
    const revision = await json(path.join(output, 'revision.json'));
    for (const row of revision.models) {
        const variant = row.id.split('/')[1];
        const doc = glbDocument(await readFile(path.join(output, row.id, variant + '_lod0.glb')));
        const counts = {wood: 0, leaves: 0};
        const primitives = doc.json.meshes.flatMap(mesh => mesh.primitives);
        assert.equal(primitives.length, 2);
        for (const primitive of primitives) {
            const material = doc.json.materials[primitive.material];
            const foliage = material.name.includes('spray cards');
            const positions = readAccessor(doc, primitive.attributes.POSITION);
            const indices = readAccessor(doc, primitive.indices);
            counts[foliage ? 'leaves' : 'wood'] += indices.count / 3;
            for (let i = 0; i < positions.count; i++) for (let axis = 0; axis < 3; axis++) assert.ok(Number.isFinite(positions.get(i, axis)));
            for (let i = 0; i < indices.count; i++) assert.ok(indices.get(i) < positions.count);
            if (foliage) {
                assert.equal(material.alphaMode, 'MASK');
                assert.equal(material.alphaCutoff, .5);
                assert.equal(material.doubleSided, false);
                assert.equal(material.extensions.KHR_materials_diffuse_transmission.diffuseTransmissionFactor, .17);
            }
        }
        assert.equal(counts.wood, row.woodTriangles);
        assert.equal(counts.wood, row.currentWoodTriangles);
        assert.equal(counts.leaves, row.canopyTriangles);
        assert.equal(counts.leaves, row.cards * 4);
        assert.ok(counts.leaves < row.currentLeafTriangles);
        assert.equal(counts.wood + counts.leaves, row.totalTriangles);
        const oldDoc = glbDocument(await readFile(path.join(baseline, row.id, variant + '_lod0.glb')));
        const oldWood = oldDoc.json.meshes.flatMap(mesh => mesh.primitives).find(primitive => oldDoc.json.materials[primitive.material].name.includes('baked bark'));
        const newWood = primitives.find(primitive => doc.json.materials[primitive.material].name.includes('baked bark'));
        for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
            const old = readAccessor(oldDoc, oldWood.attributes[attribute]);
            const current = readAccessor(doc, newWood.attributes[attribute]);
            assert.equal(old.count, current.count);
            for (let i = 0; i < old.count; i++) for (let axis = 0; axis < old.width; axis++) assert.equal(current.get(i, axis), old.get(i, axis), row.id + ': altered wood');
        }
        const compressed = await json(path.join(output, row.id, 'compression.json'));
        for (const texture of compressed.textures) {
            assert.ok(texture.quality.psnr >= 28);
            assert.ok((texture.quality.meanNormalAngleDegrees ?? 0) <= 6);
            assert.ok((texture.quality.alphaCoverageError ?? 0) < .015);
        }
    }
});

test('Three-way captures use matching cameras and retain authenticated baseline images', generated, async () => {
    const revision = await json(path.join(output, 'revision.json'));
    assert.equal(revision.comparisons.length, 30);
    assert.equal(revision.reusedCaptures.length, 75);
    for (const capture of revision.reusedCaptures) {
        assert.equal((await hashFile(capture.source)).sha256, capture.sha256);
        assert.equal((await hashFile(path.join(output, 'comparisons', capture.file))).sha256, capture.sha256);
    }
    for (const row of revision.comparisons) {
        assert.equal(row.samples, 64); assert.equal(row.width, 1920);
        for (const file of Object.values(row.files)) {
            const png = await readFile(path.join(output, 'comparisons', file));
            assert.equal(png.readUInt32BE(16), 1920); assert.equal(png.readUInt32BE(20), 1080);
        }
        assert.ok((await readFile(path.join(output, 'threeway', row.id + '.jpg'))).length > 50000);
    }
});

test('Revised driving views improve coverage and silhouette agreement with the reference', generated, async () => {
    const revision = await json(path.join(output, 'revision.json'));
    const views = revision.metrics.filter(row => row.available && /_(roadside|driveby)$/.test(row.view));
    assert.equal(views.length, 8);
    for (const row of views) {
        assert.ok(row.coverageRatio > row.current.coverageRatio, row.view + ': reduced crown coverage');
        assert.ok(row.silhouetteIoU > row.current.silhouetteIoU, row.view + ': worse reference agreement');
    }
});
