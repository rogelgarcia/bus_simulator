// Verifies review isolation, per-model LOD1 budgets, unchanged LOD0 sources and full-tree comparison pairing.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {access, readFile} from 'node:fs/promises';
import {lod1Job} from '../../../tools/bake_vegetation/lod1/job.mjs';
import {validateModels} from '../../../tools/bake_vegetation/lod1/Validate.mjs';
import {hashFile} from '../../../tools/baking/Files.mjs';
import {vegetationJobs} from '../../../tools/bake_vegetation/jobs.mjs';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {readAccessor} from '../../../tools/bake_vegetation/Accessors.mjs';
import {decodePng} from '../../../tools/bake_vegetation/lod0/Png.mjs';

const root = path.resolve('.'), output = path.join(root, lod1Job.defaults.output);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const installed = path.join(root, 'assets/public/vegetation_lod0/index.json');
const available = await access(installed).then(() => true, () => false);
const manifest = available ? await json(installed) : null;
const ready = available && (await Promise.all(manifest.models.map(row => access(path.join(output, row.id, 'model.json')).then(() => true, () => false)))).every(Boolean);
const packaged = ready && (await Promise.all(manifest.models.map(row => access(path.join(output, row.id, 'compression.json')).then(() => true, () => false)))).every(Boolean);

test('LOD1 remains an explicit, isolated review leaf and cannot publish', async () => {
    assert.ok(vegetationJobs.includes(lod1Job));
    assert.ok(!vegetationJobs.find(job => job.id === 'vegetation').children.includes('vegetation/lod1'));
    await assert.rejects(lod1Job.run({publish: true}), /review-only/);
    for (const directory of ['assets/public/vegetation_lod0', lod1Job.defaults.source, lod1Job.defaults.source+'/child', 'tests/artifacts/screens']) {
        await assert.rejects(lod1Job.run({root, publish: false, options: {...lod1Job.defaults, output: directory}}), /separate review/);
    }
});

test('all 15 LOD1 forms satisfy actual 40% budgets and retain 15 double-sided interior planes', {skip: !ready}, async () => {
    await validateModels({root, output, models: manifest.models.map(row => row.id)});
    let wood = 0, leaves = 0;
    for (const row of manifest.models) {
        const stats = await json(path.join(output, row.id, 'model.json'));
        const layout = await json(path.join(output, row.id, 'layout.json'));
        assert.equal(stats.lodLevel, 1);
        assert.equal(layout.corePlanes, 15);
        assert.equal(layout.doubleSided, true);
        assert.equal(stats.coreTriangles, 30);
        assert.equal(layout.planes.length*2, stats.canopyTriangles);
        assert.equal(stats.totalTriangles, stats.woodTriangles+stats.canopyTriangles);
        assert.ok(stats.geometryError.p99Metres <= .15);
        assert.ok(stats.geometryError.maxMetres <= .35);
        assert.ok(stats.geometryError.reverse.faceMax <= .09, row.id+' protruding branch triangles');
        wood += stats.woodTriangles; leaves += stats.canopyTriangles;
    }
    assert.ok(wood+leaves <= (47548+50000)*.4);
    assert.ok(leaves < 50000 && wood < 47548);
});

test('LOD1 generation leaves the accepted and installed LOD0 models byte-identical', {skip: !ready}, async () => {
    for (const row of manifest.models) {
        const source = path.join(root, lod1Job.defaults.source, row.id, row.id.split('/')[1]+'_lod0.glb');
        assert.deepEqual(await hashFile(source), row.sourceGlb);
        assert.equal((await hashFile(path.join(root, 'assets/public/vegetation_lod0', row.file))).sha256, row.sha256);
    }
});

test('tree stems below five metres retain their original curvature', {skip: !ready}, async () => {
    const points = document => {
        const result = new Set();
        for (const mesh of document.json.meshes) for (const primitive of mesh.primitives) {
            if (document.json.materials[primitive.material].name.includes('spray cards')) continue;
            const position = readAccessor(document, primitive.attributes.POSITION);
            for (let i = 0; i < position.count; i++) if (position.get(i, 1) < 4.99) result.add([0,1,2].map(c=>Math.round(position.get(i,c)*10000)).join(','));
        }
        return result;
    };
    for (const row of manifest.models.filter(row=>!row.id.startsWith('arrowwood_'))) {
        const variant = row.id.split('/')[1];
        const before = points(glbDocument(await readFile(path.join(root, lod1Job.defaults.source, row.id, variant+'_lod0.glb'))));
        const after = points(glbDocument(await readFile(path.join(output, row.id, variant+'_lod1.glb'))));
        for (const point of before) assert.ok(after.has(point), row.id+' exposed stem moved');
    }
});

test('rebaked wood uses nondegenerate UV charts with useful texture occupancy', {skip: !ready}, async () => {
    for (const row of manifest.models) {
        const document = glbDocument(await readFile(path.join(output, row.id, row.id.split('/')[1]+'_lod1.glb')));
        let area = 0;
        for (const mesh of document.json.meshes) for (const primitive of mesh.primitives) {
            if (document.json.materials[primitive.material].name.includes('spray cards')) continue;
            const indices = readAccessor(document, primitive.indices), uv = readAccessor(document, primitive.attributes.TEXCOORD_0);
            for (let i = 0; i < indices.count; i += 3) {
                const a = indices.get(i), b = indices.get(i+1), c = indices.get(i+2);
                const face = Math.abs((uv.get(b,0)-uv.get(a,0))*(uv.get(c,1)-uv.get(a,1))-(uv.get(b,1)-uv.get(a,1))*(uv.get(c,0)-uv.get(a,0)))/2;
                assert.ok(face > 1e-12, row.id+' UV triangle'); area += face;
            }
        }
        assert.ok(area >= .25 && area <= 1.001, row.id+' packed UV occupancy');
    }
});

test('coverage measures all bus-height and upper views with finite diagnostics', {skip: !ready}, async () => {
    for (const row of manifest.models) {
        const report = await json(path.join(output, row.id, 'coverage.json'));
        assert.equal(report.views.length, 24);
        assert.deepEqual([...new Set(report.views.map(view => view.elevation))], [-12, 15, 40]);
        for (const view of report.views) {
            assert.ok(view.coverageRatio >= .95 && view.coverageRatio <= 1.20, row.id+' canopy coverage');
            assert.ok(view.outsideLod0EnvelopeFraction >= 0 && view.outsideLod0EnvelopeFraction <= .10, row.id+' canopy envelope');
        }
    }
});

test('final LOD1 textures satisfy the existing PBR compression thresholds', {skip: !packaged}, async () => {
    for (const row of manifest.models) {
        const report = await json(path.join(output, row.id, 'compression.json'));
        assert.equal(report.textures.length, 6);
        for (const texture of report.textures) {
            assert.ok(texture.quality.psnr >= 28);
            assert.ok(texture.quality.alphaCoverageError <= .015);
            assert.ok((texture.quality.meanNormalAngleDegrees ?? 0) <= 6);
            assert.ok(texture.levels > 1);
            if (texture.foliage) assert.deepEqual(texture.size, [2048, 1536]);
        }
    }
});

test('baked bark remains nonmetallic after material reprojection', {skip: !ready}, async () => {
    for (const row of manifest.models) {
        const file = path.join(output, row.id, row.id.split('/')[1]+'_lod1_review.glb');
        if (!(await access(file).then(() => true, () => false))) continue;
        const document = glbDocument(await readFile(file)), doc = document.json;
        for (const material of doc.materials.filter(material => !material.name.includes('spray cards'))) {
            const texture = doc.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index];
            const image = doc.images[texture.source], view = doc.bufferViews[image.bufferView];
            const png = decodePng(document.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0)+view.byteLength));
            let maximum = 0;
            for (let i = 2; i < png.data.length; i += 4) maximum = Math.max(maximum, png.data[i]);
            assert.ok(maximum <= 3, row.id+' bark metallic channel');
        }
    }
});

test('final LOD1 comparisons frame the complete tree under identical cameras', {skip: !ready || !(await access(path.join(output, 'summary.json')).then(() => true, () => false))}, async () => {
    const report = await json(path.join(output, 'comparisons/renders.json'));
    assert.equal(report.closeups, false);
    for (const row of manifest.models) {
        const views = report.renders.filter(render => render.model === row.id && render.view === 'front');
        assert.equal(views.length, 2);
        assert.deepEqual(views[0].camera, views[1].camera);
        assert.equal(views[0].width, views[1].width);
        assert.equal(views[0].height, views[1].height);
        assert.equal(views[0].samples, views[1].samples);
        for (const view of views) {
            assert.ok((await readFile(path.join(output, 'comparisons', view.file))).length > 10000);
            const directory = view.lod === 'lod0' ? path.join(root, lod1Job.defaults.source) : output;
            const file = path.join(directory, row.id, row.id.split('/')[1]+'_'+view.lod+'_review.glb');
            assert.equal(view.sourceGlbSha256, (await hashFile(file)).sha256, row.id+' stale render');
        }
        const board = await readFile(path.join(output, 'boards', row.id.replace('/', '_')+'_front.png'));
        assert.equal(board.readUInt32BE(16), report.width*2);
    }
});
