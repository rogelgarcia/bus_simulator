import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiverAtlas, RECEIVER_LIGHTMAP_PROFILE } from '../../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js';
import { assertCompleteReceiverCoverage } from '../../../src/app/illumination/receiver_lightmaps/ReceiverCoverageContract.js';
import { resolveReceiverTransport } from '../../../src/app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
import { receiverCoordinateChunks } from '../../../src/app/illumination/receiver_lightmaps/ReceiverCoordinateTransport.js';
import { encodeReceiverRgb9e5 } from '../../../src/app/illumination/receiver_lightmaps/ReceiverHdrEncoding.js';
import { createRasterReceiverCharts } from '../../../src/app/illumination/receiver_lightmaps/ReceiverRasterCharts.js';

const profile = { ...RECEIVER_LIGHTMAP_PROFILE, coverage: 'complete-eligible-v1',
    directional: 'chart-affine-irradiance-v1', pageSize: 64, padding: 2, mipLevels: 1,
    texelSizeMeters: .1, maxPages: 16 };

function fixture() {
    const vertices = [0, 0, 0, 2, 0, 0, 0, 0, 2,
        0, 0, 0, 0, .02, 0, 2, 0, 0,
        2, 0, 0, 0, 0, 2, 2, -.1, 0];
    const bytes = new Uint8Array(new Float32Array(vertices).buffer);
    const materials = [{ id: 'concrete', channelSupport: { direct_receiver: { supported: true },
        indirect_irradiance: { supported: true } }, textureBindings: {}, alpha: { mode: 'opaque' }, metalness: 0 }];
    const instances = [0, 1].map(sourceIndex => ({ id: `instance/${sourceIndex}`, objectId: 'platforms', sourceIndex,
        matrixThreeWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sourceIndex * 4, 0, 0, 1] }));
    const mappings = instances.map(instance => ({ id: `receiver/${instance.id}`, meshInstanceId: instance.id,
        objectId: instance.objectId, geometryId: 'geometry', materialId: 'concrete', start: 0, count: 9,
        chunkId: 'chunk', channelRelevance: { direct_receiver: true, indirect_irradiance: true } }));
    return { getBuffer: () => bytes, manifest: { materials, meshInstances: instances,
        geometries: [{ id: 'geometry', referenceCount: 9, attributes: { position: { bufferId: 'positions',
            componentType: 'f32', normalized: false, byteOffset: 0, byteStride: 12 } } }],
        receiverMappings: mappings, participantMappings: mappings.map(m => ({ ...m, id: m.id.replace('receiver/', 'participant/'),
            channelRelevance: { ...m.channelRelevance } })),
        casterMappings: [] } };
}

test('Complete coverage includes small sides, bevels and every instance, independent of discovery order', () => {
    const input = fixture(), before = JSON.stringify(input.manifest);
    const atlas = createReceiverAtlas(input, profile);
    assert.equal(atlas.coverage.complete, true);
    assert.equal(atlas.coverage.eligibleTriangles, 6);
    assert.equal(atlas.coverage.mappedTriangles, 6);
    for (let i = 1; i <= 18; i++) assert.equal(atlas.coordinates[i * 4 + 3], 1);
    assert.equal(JSON.stringify(input.manifest), before);
    input.manifest.receiverMappings.reverse();
    input.manifest.meshInstances.reverse();
    assert.deepEqual(createReceiverAtlas(input, profile), atlas);
});

test('Insufficient page capacity fails the whole plan instead of emitting partly lit instances', () => {
    assert.throws(() => createReceiverAtlas(fixture(), { ...profile, maxPages: 1, texelSizeMeters: .04 }), error => {
        assert.equal(error.code, 'receiver_coverage_incomplete');
        assert.ok(error.coverage.requiredPages > 1);
        assert.equal(error.coverage.eligibleTriangles, 6);
        assert.equal(error.coverage.complete, false);
        assert.equal(error.coverage.failures[0].reason, 'page_budget');
        return true;
    });
});

test('Oversized faces fail explicitly instead of dropping the side of an otherwise mapped asset', () => {
    const input = fixture();
    input.manifest.meshInstances[1].matrixThreeWorld[0] = 100;
    assert.throws(() => createReceiverAtlas(input, profile), error => {
        assert.equal(error.code, 'receiver_coverage_incomplete');
        assert.ok(error.coverage.failures.some(f => f.reason === 'chart_exceeds_page' && f.objectId === 'platforms'));
        return true;
    });
});

test('Complete coverage rejects preview heuristics rather than silently ignoring a requested policy', () => {
    for (const option of [{ focus: [0, 0, 0] }, { minimumChartArea: .5 }]) {
        assert.throws(() => createReceiverAtlas(fixture(), { ...profile, ...option }), /preview selection/);
    }
});

test('Unsupported receiver materials remain transport participants and have a per-mapping reason', () => {
    const input = fixture();
    input.manifest.materials.push({ ...input.manifest.materials[0], id: 'cutout', alpha: { mode: 'cutout' } });
    input.manifest.receiverMappings[1].materialId = 'cutout';
    input.manifest.participantMappings[1].materialId = 'cutout';
    const atlas = createReceiverAtlas(input, profile);
    assert.equal(atlas.coverage.eligibleTriangles, 3);
    assert.equal(atlas.coverage.mappedTriangles, 3);
    assert.deepEqual(atlas.coverage.excludedReceivers.map(m => [m.mappingId, m.reason]), [['receiver/instance/1', 'alpha_surface']]);
    assert.equal(atlas.coverage.transport.participantMappings, 2);
    assert.equal(atlas.coverage.transport.nonReceiverParticipantMappings, 1);
    assert.equal(input.manifest.participantMappings.length, 2);
});

test('Source channel opt-out prevents receiver promotion even with a supported material', () => {
    const input = fixture();
    input.manifest.receiverMappings[1].channelRelevance.indirect_irradiance = false;
    const atlas = createReceiverAtlas(input, profile);
    assert.equal(atlas.coverage.mappedTriangles, 3);
    assert.equal(atlas.coverage.excludedReceivers[0].reason, 'source_channel_disabled');
});

test('The publication gate accepts complete maps and refuses historical or inconsistent coverage', () => {
    const atlas = createReceiverAtlas(fixture(), profile);
    assert.doesNotThrow(() => assertCompleteReceiverCoverage(atlas));
    assert.throws(() => assertCompleteReceiverCoverage(createReceiverAtlas(fixture())), /complete eligible coverage/);
    assert.throws(() => assertCompleteReceiverCoverage({ ...atlas, coverage: { ...atlas.coverage, mappedTriangles: 5 } }), /complete eligible coverage/);
});

test('Complete scalar maps cover all faces too, while unsupported shading normals stay explicitly live', () => {
    const input = fixture(), scalar = { ...profile, directional: undefined };
    const atlas = createReceiverAtlas(input, scalar);
    assert.equal(atlas.coverage.mappedTriangles, 6);
    assert.doesNotThrow(() => assertCompleteReceiverCoverage(atlas));
    input.manifest.materials[0].textureBindings.normalMap = 'normal';
    assert.throws(() => createReceiverAtlas(input, scalar), error => {
        assert.equal(error.coverage.excludedReceivers[0].reason, 'runtime_shading_normal');
        assert.equal(error.coverage.transport.nonReceiverParticipantMappings, 2);
        return true;
    });
});

test('Unsupported transport cannot silently disappear even when it needs no lightmap', () => {
    const input = fixture();
    input.manifest.participantMappings.push({ ...input.manifest.participantMappings[0], id: 'participant/glass',
        materialId: 'glass', channelRelevance: { indirect_irradiance: false } });
    assert.throws(() => createReceiverAtlas(input, profile), error => {
        assert.equal(error.coverage.transport.complete, false);
        assert.deepEqual(error.coverage.failures, [{ reason: 'unsupported_transport', participantMappings: 1, materialIds: ['glass'] }]);
        return true;
    });
});

function unwrappedFixture() {
    const source = fixture(); source.manifest.hashes = { resolvedSource: 'authenticated-source' };
    source.manifest.materials[0].textureBindings.normalMap = 'authored-normal-map';
    const complete = { ...profile, directional: undefined, irradianceRepresentation: 'surface-diffuse-v1',
        chartLayout: 'blender-smart-project-v1', packing: 'height-shelves-v1' };
    const charts = source.manifest.receiverMappings.flatMap(mapping => [0,3,6].map(offset => ({
        id: `${mapping.id}/${offset}`, mappingId: mapping.id,
        triangles: [{ offset, uv: [[0,0],[.001,0],[0,.002]] }] })));
    return { source, complete, layout: { schema: complete.chartLayout, sourceHash: 'authenticated-source', charts } };
}

test('Connected layouts cover every normal-mapped side and give tiny islands a rasterizable footprint', () => {
    const { source, complete, layout } = unwrappedFixture(), before = JSON.stringify(layout);
    const atlas = createReceiverAtlas(source, complete, layout);
    assert.equal(atlas.coverage.mappedTriangles, 6);
    assert.equal(atlas.coverage.missingReceivers.length, 0);
    assert.equal(JSON.stringify(layout), before);
    for (const chart of atlas.charts) for (let c=0;c<2;c++) {
        assert.ok((chart.max[c]-chart.min[c])*chart.texelsPerMeter[c] >= 2);
    }
    layout.charts.reverse();
    assert.deepEqual(createReceiverAtlas(source, complete, layout), atlas);
});

test('A complete UV inventory cannot publish without matching raster and mip evidence', () => {
    const { source, complete, layout } = unwrappedFixture();
    const atlas = createReceiverAtlas(source, complete, layout);
    assert.throws(() => assertCompleteReceiverCoverage(atlas), /verified raster coverage/);
    atlas.coverage.raster = { schema: 'bus-sim-receiver-raster-coverage-v1', policy: 'chart-isolated-nearest-sample-v1',
        triangles: atlas.statistics.triangles, charts: atlas.statistics.charts, emptyCharts: 0, missingReceiverSamples: 0,
        pages: Array.from({ length: atlas.pageCount }, (_, page) => ({ page,
            triangles: atlas.charts.filter(c => c.page === page).reduce((n, c) => n + c.triangles.length, 0),
            charts: atlas.charts.filter(c => c.page === page).length,
            mips: [{ mip: 0, sha256: '1'.repeat(64), bytes: complete.pageSize ** 2 * 4 }] })) };
    assert.doesNotThrow(() => assertCompleteReceiverCoverage(atlas));
    for (const patch of [{ emptyCharts: 1 }, { missingReceiverSamples: 1 }, { triangles: 5 }, { pages: [] }]) {
        assert.throws(() => assertCompleteReceiverCoverage({ ...atlas, coverage: { ...atlas.coverage,
            raster: { ...atlas.coverage.raster, ...patch } } }), /verified raster coverage/);
    }
});

test('Narrow details get independent pixel-center samples when the connected island has no raster coverage', () => {
    const chart={id:'connected',triangles:[{offset:0,area:2,uv:[[0,0],[2,0],[0,2]]},
        {offset:3,area:.001,uv:[[4.2,4.2],[6.2,4.2],[4.2,4.201]]}]};
    const before=JSON.stringify(chart), result=createRasterReceiverCharts(chart,.5);
    assert.equal(JSON.stringify(chart),before);
    assert.deepEqual(result.flatMap(c=>c.triangles.map(t=>t.offset)).sort((a,b)=>a-b),[0,3]);
    const detail=result.find(c=>c.pixelOffset);
    assert.equal(detail.triangles.length,1);assert.equal(detail.triangles[0].offset,3);
    for(let c=0;c<2;c++){
        const pixel=detail.triangles[0].uv.reduce((sum,p)=>sum+(p[c]-detail.min[c])*detail.texelsPerMeter[c],0)/3+detail.pixelOffset[c];
        assert.ok(Math.abs(pixel-Math.floor(pixel)-.5)<1e-9);
    }
});

test('A neighboring face cannot stand in for an unsampled face in the same island', () => {
    const chart={id:'shared-island',triangles:[{offset:0,area:2,uv:[[0,0],[2,0],[0,2]]},
        {offset:3,area:.005,uv:[[.4,.4],[.5,.4],[.4,.5]]}]};
    const result=createRasterReceiverCharts(chart,.5);
    assert.ok(result.some(c=>c.id==='shared-island/face/3'&&c.triangles.length===1&&c.pixelOffset));
    assert.equal(result.flatMap(c=>c.triangles).length,2);
});

test('Unwrap output cannot drop, duplicate, misidentify or collapse an eligible triangle', () => {
    for (const corrupt of [
        l => l.charts.pop(),
        l => l.charts[1].triangles[0].offset = 0,
        l => l.charts[0].triangles[0].uv[2] = [0,0],
        l => l.sourceHash = 'stale',
        l => l.charts[0].mappingId = 'unknown',
        l => { l.charts.shift(); l.degenerates = [{ mappingId:'receiver/instance/0', offsets:[0] }]; }
    ]) {
        const { source, complete, layout } = unwrappedFixture(); corrupt(layout);
        assert.throws(() => createReceiverAtlas(source, complete, layout));
    }
});

test('Declared alpha transport is independent of receiver selection and preserves the authenticated source', () => {
    const source = fixture().manifest;
    source.materials[0] = { ...source.materials[0], transmission:0, alpha:{mode:'blended',opacity:.5},
        channelSupport:{indirect_irradiance:{supported:false,reasons:['unsupported_alpha_mode:blended']}} };
    for (const mapping of source.participantMappings) mapping.channelRelevance.indirect_irradiance = false;
    source.casterMappings.push({ ...source.participantMappings[0], coverageMode:'forced_opaque' });
    const before = JSON.stringify(source), derived = resolveReceiverTransport(source);
    assert.ok(derived.participantMappings.every(m => m.channelRelevance.indirect_irradiance));
    assert.equal(derived.receiverMappings, source.receiverMappings);
    assert.equal(derived.casterMappings[0].coverageMode, 'opaque');
    assert.equal(source.casterMappings[0].coverageMode, 'forced_opaque');
    assert.equal(JSON.stringify(source), before);
    for (const change of [{transmission:1}, {channelSupport:{indirect_irradiance:{supported:false,reasons:['unknown_shader']}}}]) {
        const incompatible = { ...source, materials:[{...source.materials[0],...change}] };
        assert.ok(resolveReceiverTransport(incompatible).participantMappings.every(m => !m.channelRelevance.indirect_irradiance));
    }
});

test('Coordinate shards require exact, nonoverlapping row coverage', () => {
    const mapping = {tableWidth:2,tableHeight:3};
    const chunk = (firstRow,height) => ({data:new Uint8Array(2*height*16),descriptor:{id:`mapping.coordinates.${firstRow}`,
        encoding:'rgba32f_le',dimensions:{width:2,height},coordinateTransform:{schema:'bus-sim-receiver-mapping-rows-v1',firstRow}}});
    const a=chunk(0,2), b=chunk(2,1);
    assert.deepEqual(receiverCoordinateChunks([b,a],mapping),[a,b]);
    for (const invalid of [[a],[a,a],[a,chunk(1,1)],[a,chunk(2,2)]]) assert.throws(() => receiverCoordinateChunks(invalid,mapping));
});

test('HDR receiver encoding retains dim lighting independently of bright texels', () => {
    const values = new Float32Array([0,0,0,1, .0001,.0002,.0003,1, 1,.5,.25,1, 1024,512,256,1, 65408,65408,65408,1]);
    const bytes=encodeReceiverRgb9e5(values), view=new DataView(bytes.buffer);
    for (let pixel=0;pixel<values.length/4;pixel++) {
        const bits=view.getUint32(pixel*4,true), unit=2**((bits>>>27)-24);
        for (let c=0;c<3;c++) assert.ok(Math.abs(((bits>>>(c*9))&511)*unit-values[pixel*4+c]) <= unit*.50001);
    }
    assert.notEqual(view.getUint32(4,true),0);
    for (const bad of [-1,Infinity,NaN,70000]) assert.throws(()=>encodeReceiverRgb9e5(new Float32Array([bad,1,1,1])));
});
