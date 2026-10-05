// Validate the aggregate canopy budget, exported flat double-sided planes and half-budget wood.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {access, readFile} from 'node:fs/promises';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {decodePng} from '../../../tools/bake_vegetation/lod0/Png.mjs';
import {readAccessor} from '../../../tools/bake_vegetation/Accessors.mjs';
import {lod0Job} from '../../../tools/bake_vegetation/lod0/job.mjs';

const root = path.resolve('tests/artifacts/screens/ai591_core_canopies/final');
const available = await access(path.join(root, 'revision.json')).then(() => true, () => false);
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('core revisions require a separate baseline and cannot publish', async () => {
    const workspace = path.resolve('.'), baseline = path.join(workspace, 'tests/artifacts/screens/baseline-fixture/final');
    const options = {scene: 'tests/artifacts/screens/source-fixture', output: root, placement: 'core'};
    await assert.rejects(lod0Job.run({root: workspace, publish: true, options}), /must not replace/);
    await assert.rejects(lod0Job.run({root: workspace, publish: false, options}), /preserved baseline/);
    for (const output of [baseline, path.join(baseline, 'child'), path.dirname(baseline)]) {
        await assert.rejects(lod0Job.run({root: workspace, publish: false, options: {...options, baseline, output}}), /must not overlap/);
    }
});

test('all 15 exported canopies fit the combined 50K triangle budget', {skip: !available}, async () => {
    const report = await json('revision.json');
    assert.equal(report.models.length, 15);
    let leaves = 0, wood = 0;
    for (const row of report.models) {
        const variant = row.id.split('/')[1];
        const document = glbDocument(await readFile(path.join(root, row.id, variant + '_lod0.glb'))), doc = document.json;
        let actualLeaves = 0, actualWood = 0;
        for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
            const material = doc.materials[primitive.material];
            const count = doc.accessors[primitive.indices].count / 3;
            assert.equal(primitive.mode ?? 4, 4);
            if (material.name.includes('spray cards')) {
                assert.equal(material.doubleSided, true); assert.equal(material.alphaMode, 'MASK');
                const indices = readAccessor(document, primitive.indices), positions = readAccessor(document, primitive.attributes.POSITION);
                const point = i => [0, 1, 2].map(c => positions.get(indices.get(i), c));
                for (let index = 0; index < indices.count; index += 6) {
                    const a = point(index), b = point(index + 1), c = point(index + 2), d = point(index + 5);
                    const u = b.map((v,i) => v-a[i]), v = c.map((v,i) => v-a[i]), w = d.map((v,i) => v-a[i]);
                    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
                    assert.ok(Math.abs(cross.reduce((sum,n,i) => sum+n*w[i], 0)) / Math.hypot(...cross) < 1e-4, 'Exported card is flat');
                }
                actualLeaves += count;
            } else actualWood += count;
        }
        assert.equal(actualLeaves, row.canopyTriangles); assert.equal(actualWood, row.woodTriangles);
        assert.ok(actualWood <= row.currentWoodTriangles * .5);
        assert.equal(row.geometryError.nonManifoldEdges, 0);
        assert.ok(row.geometryError.p99Metres <= .10 && row.geometryError.maxMetres <= .18);
        leaves += actualLeaves; wood += actualWood;
    }
    assert.equal(leaves, 50000); assert.ok(wood <= 47549);
});

test('all final PBR maps pass the preserved compression gates', {skip: !available}, async () => {
    for (const row of (await json('revision.json')).models) {
        const compression = await json(row.id + '/compression.json');
        assert.equal(compression.textures.length, 6);
        for (const texture of compression.textures) {
            assert.ok(texture.quality.psnr >= 28);
            assert.ok(texture.quality.alphaCoverageError <= .015);
            assert.ok((texture.quality.meanNormalAngleDegrees ?? 0) <= 6);
        }
    }
});

test('elm keeps the exposed stem curvature within the half-wood budget', {skip: !available}, async () => {
    const revision = await json('revision.json');
    const stemPoints = document => {
        const result = new Set();
        for (const mesh of document.json.meshes) for (const primitive of mesh.primitives) {
            if (document.json.materials[primitive.material].name.includes('spray cards')) continue;
            const positions = readAccessor(document, primitive.attributes.POSITION);
            for (let i = 0; i < positions.count; i++) {
                if (positions.get(i, 1) >= 4.9) continue;
                result.add([0, 1, 2].map(c => Math.round(positions.get(i, c) * 100000)).join(','));
            }
        }
        return result;
    };
    for (const row of revision.models.filter(model => model.id.startsWith('american_elm/'))) {
        const file = path.join(row.id, row.id.split('/')[1] + '_lod0.glb');
        const before = stemPoints(glbDocument(await readFile(path.join(revision.baseline, file))));
        const after = stemPoints(glbDocument(await readFile(path.join(root, file))));
        assert.ok(before.size > 100);
        for (const point of before) assert.ok(after.has(point), row.id + ' collapsed a visible lower-stem vertex');
    }
});

test('each crown has five orthogonal three-plane centers and flat outer cards', {skip: !available}, async () => {
    for (const row of (await json('revision.json')).models) {
        const layout = await json(row.id + '/layout.json');
        assert.equal(layout.centers.length, 5); assert.equal(layout.corePlanes, 15);
        assert.equal(layout.foliageTriangles, row.canopyTriangles);
        const dots = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
        for (let cluster = 0; cluster < 5; cluster++) {
            const planes = layout.planes.filter(p => p.kind === 'core' && p.cluster === cluster);
            assert.equal(planes.length, 3);
            for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) {
                assert.ok(Math.abs(dots(planes[i].basis.map(r => r[2]), planes[j].basis.map(r => r[2]))) < 1e-6);
                assert.deepEqual(planes[i].center, planes[j].center);
            }
        }
        for (const plane of layout.planes) {
            assert.ok(plane.size.every(value => value > 0));
            if (plane.kind === 'outer') assert.ok(Math.max(...plane.size) < 1.5, 'Outer cards must use the mature reference leaf scale, not the unit template');
            for (let i = 0; i < 3; i++) assert.ok(Math.abs(dots(plane.basis.map(r => r[i]), plane.basis.map(r => r[i])) - 1) < 1e-5);
        }
    }
});

test('outer PBR tiles keep six individual leaf cells separate', {skip: !available}, async () => {
    for (const species of Object.keys((await json('revision.json')).names)) {
        const atlas = await json(species + '/canopy/atlas.json');
        const image = decodePng(await readFile(path.join(root, species, 'canopy/leaf_color.png')));
        const tileSize = image.width / 8;
        for (const tile of atlas.tiles.filter(t => t.kind === 'outer')) {
            assert.equal(tile.individualLeaves, 6); assert.deepEqual(tile.nonOverlappingCells, [2, 3]);
            const x0 = tile.tile % 8 * tileSize, y0 = image.height - (Math.floor(tile.tile / 8) + 1) * tileSize;
            for (let y = 0; y < tileSize; y++) assert.equal(image.data[((y0 + y) * image.width + x0 + tileSize / 2) * 4 + 3], 0);
            for (const boundary of [1, 2]) for (let x = 0; x < tileSize; x++) {
                const y = Math.round(boundary * tileSize / 3);
                assert.equal(image.data[((y0 + y) * image.width + x0 + x) * 4 + 3], 0);
            }
        }
    }
});

test('interior albedo preserves photographed source colors without double gamma', {skip: !available}, async () => {
    const revision = await json('revision.json');
    const rgb = (pixels, offset) => pixels[offset] * 65536 + pixels[offset + 1] * 256 + pixels[offset + 2];
    for (const species of Object.keys(revision.names)) {
        const before = decodePng(await readFile(path.join(revision.baseline, species, 'canopy/leaf_color.png')));
        const after = decodePng(await readFile(path.join(root, species, 'canopy/leaf_color.png')));
        const palette = new Set();
        for (let offset = 0; offset < before.data.length; offset += 4) palette.add(rgb(before.data, offset));
        const tileSize = after.width / 8;
        let inspected = 0;
        for (let y = 0; y < after.height; y += 7) for (let x = 0; x < after.width; x += 7) {
            const tile = Math.floor((after.height - 1 - y) / tileSize) * 8 + Math.floor(x / tileSize);
            const offset = (y * after.width + x) * 4;
            if (tile >= 45 || after.data[offset + 3] < 250) continue;
            assert.ok(palette.has(rgb(after.data, offset)), species + ' changed an unlit photographed leaf color');
            inspected++;
        }
        assert.ok(inspected > 1000);
    }
});

test('matched comparisons and exported-geometry wireframes cover every species', {skip: !available}, async () => {
    const revision = await json('revision.json'), wire = await json('wireframes/renders.json');
    assert.equal(revision.comparisons.length, 30);
    assert.equal(wire.renders.length, 20);
    assert.equal(wire.source, 'Reimported final GLB geometry');
    for (const species of Object.keys(revision.names)) {
        assert.ok(wire.renders.some(row => row.camera.id === species + '_mature_group' && row.camera.variant === null));
        assert.ok(wire.renders.some(row => row.camera.id === species + '_roadside' && row.mode === 'cores'));
    }
});
