import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { receiverChartSeams, receiverSeamConstraints, stitchReceiverSeams, receiverSeamComponents, stitchReceiverPageFiles } from '../../../tools/receiver_lightmaps/ReceiverSeamStitching.mjs';
import { createReceiverBoundaryInventory } from '../../../tools/receiver_lightmaps/ReceiverVisibleSeams.mjs';

function fixture(raised = 0, back = false) {
    const coordinates = [0,0,0, 2,0,0, 0,2,0, 2,2,raised, 0,2,raised, 2,0,raised];
    if (back) coordinates.splice(12, 6, 2,0,raised, 0,2,raised);
    const bytes = new Uint8Array(new Float32Array(coordinates).buffer);
    const instanceId = 'instance';
    const parsed = { getBuffer: () => bytes, manifest: {
        geometries: [{ id: 'g', attributes: { position: { bufferId: 'p', componentType: 'f32', byteOffset: 0, byteStride: 12 } } }],
        meshInstances: [{ id: instanceId, geometryId: 'g', matrixThreeWorld: [1,0,0,0,0,1,0,0,0,0,1,0,20,7,30,1] }]
    } };
    const charts = [0, 1].map(i => ({ instanceId, id: 'chart'+i, page: i, min: [0,0], x: 0, y: 0, texelsPerMeter: [2,2],
        triangles: [{ offset: i*3, uv: [[0,0],[2,0],[0,2]] }] }));
    return { parsed, charts, profile: { pageSize: 16, padding: 2 } };
}

test('UV seams join coplanar neighbors, including translated surfaces, but preserve gaps and hard edges', () => {
    const f = fixture(), before = JSON.stringify(f.charts);
    assert.equal(receiverChartSeams(f.parsed, f.charts, f.profile).length, 1);
    assert.equal(JSON.stringify(f.charts), before);
    for (const variant of [fixture(.001), fixture(0, true)]) assert.equal(receiverChartSeams(variant.parsed, variant.charts, variant.profile).length, 0);
    // A crease shares its edge yet requires a different irradiance on either face.
    const original = f.parsed.getBuffer(); new Float32Array(original.buffer)[11] = 1;
    assert.equal(receiverChartSeams(f.parsed, f.charts, f.profile).length, 0);
});

test('A continuous surface joins across separate meshes, including partial edges, without joining gaps or overlaps', () => {
    const f = fixture();
    const instance = f.parsed.manifest.meshInstances[0];
    f.parsed.manifest.meshInstances.push({ ...instance, id: 'second' });
    f.charts[1].instanceId = 'second';
    assert.equal(receiverChartSeams(f.parsed, f.charts, f.profile).length, 1);
    instance.matrixThreeWorld = [...instance.matrixThreeWorld];
    instance.matrixThreeWorld[14] += .001;
    assert.equal(receiverChartSeams(f.parsed, f.charts, f.profile).length, 0);
    instance.matrixThreeWorld[14] -= .001;
    const coordinates = new Float32Array([0,0,0, 1,0,0, 1,2,0, 1,0,0, 2,0,0, 1,1,0]);
    f.parsed.getBuffer = () => new Uint8Array(coordinates.buffer);
    assert.equal(receiverChartSeams(f.parsed, f.charts, f.profile).length, 1, 'Short mesh edge meets part of the other mesh edge');
    coordinates[12] = .5;
    assert.equal(receiverChartSeams(f.parsed, f.charts, f.profile).length, 0, 'Overlapping interiors are not a shared boundary');
});

test('A closed slab still exposes its top boundary for continuity with the neighboring mesh', () => {
    const f = fixture();
    f.parsed.manifest.meshInstances.push({ ...f.parsed.manifest.meshInstances[0], id:'second' });
    f.charts[1].instanceId = 'second';
    const coordinates = new Float32Array([...new Float32Array(f.parsed.getBuffer().buffer), 0,2,0, 2,0,0, 0,2,-1]);
    f.parsed.getBuffer = () => new Uint8Array(coordinates.buffer);
    f.charts.push({ ...f.charts[0], id:'side', triangles:[{offset:6,uv:[[0,0],[2,0],[0,2]]}] });
    const seams = receiverChartSeams(f.parsed, f.charts, f.profile);
    assert.equal(seams.length, 1, 'The vertical side must not hide the flat top boundary');
    assert.ok(seams.every(s => s.a.chart !== 'side' && s.b.chart !== 'side'));
});

test('Compact city boundary blocks preserve all seams across allocation boundaries', () => {
    const inventory = createReceiverBoundaryInventory();
    for (let i=0;i<2500;i++) for (const side of [-1,1]) inventory.add({
        chart:{id:i+'/'+side,instanceId:String(side),page:0},normal:[0,0,1],
        points:[[i*2,0,0],[i*2,1,0]],pixels:[[i*2,0],[i*2,1]],third:[i*2+side,.5,0]
    });
    const seams = [...inventory.seams()];
    assert.equal(seams.length,2500);
    assert.equal(new Set(seams.map(s=>s.a.chart.split('/')[0])).size,2500);
    for (const seam of seams) assert.deepEqual(seam.a.pixels,seam.b.pixels);
});

test('Disconnected surfaces solve independently and cross-page mip files preserve all non-seam samples', async () => {
    const f = fixture(), seam = receiverChartSeams(f.parsed, f.charts, f.profile)[0];
    // More blocks than the cache holds, to exercise eviction and dirty writes.
    const seams = Array.from({length:33}, (_, i) => ({
        a: {...seam.a,chart:'a'+i,page:i*2}, b:{...seam.b,chart:'b'+i,page:i*2+1}
    }));
    assert.deepEqual(receiverSeamComponents(seams).map(c => c.length), new Array(33).fill(1));
    const stage = await mkdtemp(path.join(os.tmpdir(), 'receiver-seams-'));
    const original = [];
    for (let page = 0; page < 66; page++) {
        original[page] = [];
        for (let mip = 0; mip < 2; mip++) {
            const data = new Float32Array((16 >> mip)**2*4);
            for (let i = 0; i < data.length; i++) data[i] = [page%2 ? 1.2 : .2, .4, .6, 1][i%4];
            original[page][mip] = data;
            await writeFile(path.join(stage, `seam-input.${page}.mip${mip}.f32`), Buffer.from(data.buffer));
        }
    }
    const reports = await stitchReceiverPageFiles(stage, seams, { ...f.profile, mipLevels: 2 }, 66);
    for (const report of reports) {
        assert.equal(report.components, 33); assert.ok(report.after.maximum < .005);
        const indices = new Set(receiverSeamConstraints(seams, 16, report.mip).flatMap(c => c.map(([i]) => i)));
        const area = (16 >> report.mip)**2;
        for (let page = 0; page < 66; page++) {
            const bytes = await readFile(path.join(stage, `seam-input.${page}.mip${report.mip}.f32`));
            const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length/4);
            for (let i = 0; i < data.length; i++) if (i%4 === 3 || !indices.has(page*area+Math.floor(i/4))) {
                assert.equal(data[i], original[page][report.mip][i]);
            }
        }
    }
});

test('Unclipped facade T-junctions join each shorter edge to the uninterrupted wall strip', () => {
    const f = fixture(), points = [[0,0,0],[1,0,0],[1,2,0], [1,0,0],[2,0,0],[1,1,0], [1,1,0],[2,2,0],[1,2,0]];
    const bytes = new Uint8Array(new Float32Array(points.flat()).buffer);
    f.parsed.getBuffer = () => bytes;
    f.charts = [0,1,2].map(i => ({ ...f.charts[0], id:'strip'+i, page:i,
        triangles:[{offset:i*3,uv:points.slice(i*3,i*3+3).map(p=>p.slice(0,2))}] }));
    const seams = receiverChartSeams(f.parsed,f.charts,f.profile);
    assert.equal(seams.length,2,'Both wall segments must meet the same long edge without being clipped first');
    for (const seam of seams) assert.deepEqual(seam.a.pixels,seam.b.pixels);
    const reversed = receiverChartSeams(f.parsed,f.charts.toReversed(),f.profile);
    assert.equal(reversed.length,2,'Shorter edges encountered first must still match the long edge exactly once');
    for (const seam of reversed) assert.deepEqual(seam.a.pixels,seam.b.pixels);
});

test('Overlapping coplanar quads stitch the partial boundaries exposed by runtime ownership', () => {
    const f = fixture(), points = [[0,0,0],[2,0,0],[0,2,0], [2,0,0],[2,2,0],[0,2,0],
        [1,1,0],[3,1,0],[1,3,0], [3,1,0],[3,3,0],[1,3,0]];
    const bytes = new Uint8Array(new Float32Array(points.flat()).buffer);
    f.parsed.getBuffer = () => bytes;
    f.charts = [0,1,2,3].map(i => ({ ...f.charts[0], id: 'quad'+i, page: i,
        triangles: [{ offset: i*3, uv: points.slice(i*3,i*3+3).map(p => p.slice(0,2)) }] }));
    const seams = receiverChartSeams(f.parsed, f.charts, f.profile);
    const overlap = seams.filter(s => Number(s.a.chart.slice(4)) < 2 !== (Number(s.b.chart.slice(4)) < 2));
    assert.ok(overlap.length >= 2, 'Both newly visible sides of the clipped square must join their owner');
    for (const seam of overlap) for (let p = 0; p < 2; p++) for (let c = 0; c < 2; c++) {
        assert.ok(Math.abs(seam.a.pixels[p][c]-seam.b.pixels[p][c]) < 1e-6, 'UV interpolation must preserve the same world point');
    }
    const constraints = receiverSeamConstraints(seams,16), pixels = new Map();
    for (const terms of constraints) for (const [i] of terms) pixels.set(i, [i >= 512 ? .2 : 1.2, .4, .6]);
    const report = stitchReceiverSeams(pixels,constraints);
    assert.ok(report.before.maximum > .9);
    assert.ok(report.after.maximum < .015, JSON.stringify(report));
});

test('Bilinear seam correction removes triangle discontinuities at every mip without changing unrelated samples', () => {
    const f = fixture(), seams = receiverChartSeams(f.parsed, f.charts, f.profile);
    for (let mip = 0; mip < 2; mip++) {
        const constraints = receiverSeamConstraints(seams, 16, mip), pixels = new Map(), area = (16 >> mip)**2;
        for (const terms of constraints) for (const [i] of terms) pixels.set(i, [i >= area ? 1.2 : .2, .4, .6]);
        pixels.set(0, [4, 5, 6]);
        const report = stitchReceiverSeams(pixels, constraints);
        assert.ok(report.before.maximum > .9);
        assert.ok(report.after.maximum < .005, JSON.stringify(report));
        assert.deepEqual(pixels.get(0), [4,5,6]);
        for (const [i, value] of pixels) if (i !== 0) { assert.ok(Math.abs(value[1]-.4)<1e-12); assert.ok(Math.abs(value[2]-.6)<1e-12); }
    }
});
