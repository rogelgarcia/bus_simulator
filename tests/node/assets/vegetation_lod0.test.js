// Checks the generated review assets when present; source-only checkouts do not contain these artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {readAccessor} from '../../../tools/bake_vegetation/Accessors.mjs';
import {hashFile} from '../../../tools/baking/Files.mjs';
import {lod0Job} from '../../../tools/bake_vegetation/lod0/job.mjs';
import {decodePng, encodePng, downsample} from '../../../tools/bake_vegetation/lod0/Png.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'tests/artifacts/screens/ai589_lod0_vegetation/final');
const present = existsSync(path.join(output, 'inspection.json'));
const generated = {skip: present ? false : 'LOD0 review artifacts are intentionally gitignored; run vegetation/lod0 to produce them.'};
const json = async file => JSON.parse(await readFile(file, 'utf8'));

test('LOD0 texture mips filter color in linear light and preserve normalized normals', () => {
    const source = {width: 2, height: 2, data: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255])};
    assert.deepEqual(decodePng(encodePng(source)), source);
    assert.equal(downsample(source, 'color').data[0], 188);
    const normal = {width: 2, height: 2, data: Uint8Array.from([255, 128, 128, 255, 128, 255, 128, 255, 255, 128, 128, 255, 128, 255, 128, 255])};
    const filtered = downsample(normal, 'normal').data;
    assert.ok(Math.abs(Math.hypot(...[0, 1, 2].map(c => filtered[c] / 127.5 - 1)) - 1) < .01);
});

test('LOD0 leaf atlas encoding retains source linear albedo and corrected alpha mips', generated, async () => {
    for (const family of ['london_plane', 'silver_linden', 'northern_red_oak', 'american_elm', 'arrowwood_viburnum']) {
        const directory = path.join(output, family, 'canopy'), atlas = await json(path.join(directory, 'atlas.json'));
        const png = decodePng(await readFile(path.join(directory, 'leaf_color.png'))), sum = [0, 0, 0];
        let count = 0;
        for (let i = 0; i < png.data.length; i += 4) {
            if (png.data[i + 3] < 250) continue;
            count++;
            for (let c = 0; c < 3; c++) {
                const value = png.data[i + c] / 255;
                sum[c] += value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
            }
        }
        for (let c = 0; c < 3; c++) assert.ok(Math.abs(sum[c] / count - atlas.sourceLinearMeanRGB[c]) < .004, `${family}: linear/sRGB bake mismatch`);
        for (const mip of atlas.mips) assert.ok(mip.maxTileCoverageError < .012, `${family}: disappearing leaf alpha`);
    }
});

test('LOD0 generation cannot publish over gameplay trees', async () => {
    await assert.rejects(lod0Job.run({publish: true}), /must not replace gameplay trees/);
});

test('LOD0 output cannot overlap the reference directory in either direction', async () => {
    const source = 'tests/artifacts/screens/frozen-reference';
    const outputs = [source, source + '/child', 'tests/artifacts/screens', 'assets/public/vegetation'];
    if (process.platform === 'win32') outputs.push(source.toUpperCase(), source.toUpperCase() + '/child');
    for (const output of outputs) await assert.rejects(lod0Job.run({root, publish: false, options: {scene: source, output}}), /separate review directory/);
});

test('LOD0 reference remains the authenticated complete fifteen-model source', generated, async () => {
    const reference = await json(path.join(output, 'reference.json'));
    const actual = await hashFile(path.join(reference.source, reference.scene));
    assert.equal(actual.sha256, reference.sha256);
    assert.equal(actual.bytes, reference.bytes);
    const inspection = await json(path.join(output, 'inspection.json'));
    assert.equal(inspection.length, 15);
    assert.equal(new Set(inspection.map(row => row.id)).size, 15);
    for (const row of inspection) {
        assert.equal(row.foliageTriangles, row.leafFormTriangles.reduce((sum, count, i) => sum + count * row.formCounts[i], 0));
        assert.ok(row.woodTriangles > 1000000);
    }
});

test('Every LOD0 GLB has finite reduced geometry, UVs, tangent bases, and baked PBR materials', generated, async () => {
    const inspection = await json(path.join(output, 'inspection.json'));
    for (const source of inspection) {
        const [species, variant] = source.id.split('/');
        const directory = path.join(output, species, variant);
        const stats = await json(path.join(directory, 'model.json'));
        const wood = await json(path.join(directory, 'wood.json'));
        const doc = glbDocument(await readFile(path.join(directory, `${variant}_lod0.glb`)));
        assert.ok(stats.totalTriangles < 110000, source.id);
        assert.ok(stats.totalTriangles < (source.woodTriangles + source.foliageTriangles) * .001, source.id);
        assert.equal(stats.geometryError.nonManifoldEdges, 0, source.id);
        assert.ok(stats.geometryError.p99Metres <= .06 && stats.geometryError.maxMetres <= .18, source.id);
        assert.ok(wood.uvOccupancy >= .25, `${source.id}: wasted wood UV atlas`);
        assert.equal(stats.spraysPreserved, source.sprays);
        assert.ok(stats.meanCardCoverage > .30 && stats.meanCardCoverage < .95);
        let total = 0;
        const primitives = doc.json.meshes.flatMap(mesh => mesh.primitives);
        assert.equal(primitives.length, 2, source.id);
        for (const primitive of primitives) {
            const positions = readAccessor(doc, primitive.attributes.POSITION);
            const indices = readAccessor(doc, primitive.indices);
            const normals = readAccessor(doc, primitive.attributes.NORMAL);
            const tangents = readAccessor(doc, primitive.attributes.TANGENT);
            const uvs = readAccessor(doc, primitive.attributes.TEXCOORD_0);
            assert.equal(indices.count % 3, 0);
            total += indices.count / 3;
            for (let i = 0; i < indices.count; i++) assert.ok(indices.get(i) < positions.count);
            for (let i = 0; i < positions.count; i++) {
                for (let axis = 0; axis < 3; axis++) assert.ok(Number.isFinite(positions.get(i, axis)), source.id);
                assert.ok(Math.abs(Math.hypot(...[0, 1, 2].map(a => normals.get(i, a))) - 1) < .002, source.id);
                assert.ok(Math.abs(Math.hypot(...[0, 1, 2].map(a => tangents.get(i, a))) - 1) < .002, source.id);
                assert.ok(Math.abs(Math.abs(tangents.get(i, 3)) - 1) < .001);
                for (let axis = 0; axis < 2; axis++) assert.ok(uvs.get(i, axis) >= -.0001 && uvs.get(i, axis) <= 1.0001, source.id);
            }
            const material = doc.json.materials[primitive.material];
            assert.ok(material.pbrMetallicRoughness.baseColorTexture);
            assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
            assert.ok(material.normalTexture);
            if (material.name.includes('spray cards')) {
                assert.equal(material.alphaMode, 'MASK'); assert.equal(material.alphaCutoff, .5);
                assert.equal(material.doubleSided, false);
                assert.equal(material.extensions.KHR_materials_diffuse_transmission.diffuseTransmissionFactor, .17);
                const texture = doc.json.textures[material.pbrMetallicRoughness.baseColorTexture.index];
                const image = doc.json.images[texture.source ?? texture.extensions.KHR_texture_basisu.source];
                const view = doc.json.bufferViews[image.bufferView];
                const png = doc.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
                if (image.mimeType === 'image/ktx2') {
                    assert.equal(png.subarray(0, 12).toString('hex'), 'ab4b5458203230bb0d0a1a0a');
                    assert.ok(png.readUInt32LE(40) > 5, 'Expected embedded mip chain');
                    const compression = await json(path.join(directory, 'compression.json'));
                    const color = compression.textures.find(row => row.foliage && row.channel === 'color');
                    assert.ok(color.quality.alphaCoverageError < .015);
                    assert.ok(color.quality.psnr > 28);
                } else {
                    assert.equal(png[24], 8); assert.equal(png[25], 6, `${source.id}: missing RGBA card cutout`);
                }
            } else assert.ok(material.occlusionTexture, `${source.id}: missing cavity AO`);
        }
        assert.equal(total, stats.totalTriangles, source.id);
        if (stats.textureCompression) {
            const compression = await json(path.join(directory, 'compression.json'));
            assert.equal(compression.compressedBytes, (await readFile(path.join(directory, `${variant}_lod0.glb`))).length);
            for (const texture of compression.textures) {
                assert.ok(texture.quality.psnr >= 28, `${source.id}/${texture.name}`);
                assert.ok((texture.quality.meanNormalAngleDegrees ?? 0) <= 6, `${source.id}/${texture.name}`);
                assert.ok(texture.blockGpuBytes < texture.rgbaGpuBytes * .251);
            }
            const review = glbDocument(await readFile(path.join(directory, `${variant}_lod0_review.glb`)));
            const reviewPrimitives = review.json.meshes.flatMap(mesh => mesh.primitives);
            for (let i = 0; i < primitives.length; i++) {
                for (const attribute of ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0']) {
                    const a = readAccessor(doc, primitives[i].attributes[attribute]), b = readAccessor(review, reviewPrimitives[i].attributes[attribute]);
                    assert.equal(a.count, b.count);
                    for (let row = 0; row < a.count; row++) for (let column = 0; column < a.width; column++) assert.equal(a.get(row, column), b.get(row, column));
                }
            }
        }
    }
});

test('Every species has paired full-form, drive-by, bark, root and underside comparisons', generated, async () => {
    const report = await json(path.join(output, 'comparisons/renders.json'));
    const species = ['london_plane', 'silver_linden', 'northern_red_oak', 'american_elm', 'arrowwood_viburnum'];
    for (const family of species) for (const view of ['mature_group', 'roadside', 'driveby', 'trunk', 'roots', 'canopy']) {
        const pair = report.renders.filter(row => row.camera.id === `${family}_${view}` && row.representation !== 'background');
        assert.equal(pair.length, 2, `${family}/${view}`);
        assert.deepEqual(pair[0].camera, pair[1].camera);
        assert.deepEqual(new Set(pair.map(row => row.representation)), new Set(['reference', 'lod0']));
        for (const row of pair) {
            const png = await readFile(path.join(output, 'comparisons', row.file));
            assert.equal(png.readUInt32BE(16), 1920); assert.equal(png.readUInt32BE(20), 1080);
            assert.equal(row.samples, 64);
        }
    }
});
