import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceShadowDepth2x, ShadowPageResidency, streamedPageAt, validateStreamedShadowManifest, streamedShadowPrototypeOptions} from '../../../src/app/illumination/static_sun_depth/StreamedShadowPages.js';
import {canonicalJsonBytes} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import {rawSha256Hex} from '../../../src/app/illumination/package/index.js';
import {reconcileGuardBuffers,reconcileShadowPageGuards} from '../../../tools/bake_lighting/shadows/streamed/ReconcileGuards.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

test('bounded city reconciliation equals the full-grid reference including four-page corners', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shadow-guard-test-'));
    const sha = bytes => createHash('sha256').update(bytes).digest('hex');
    try {
        await mkdir(path.join(root,'pages'));
        const manifest = {interiorTexels:6,guardTexels:1,tileCount:[3,4],pages:[]}, expected = new Map();
        for (let id=0;id<12;id++) {
            const raw = Buffer.alloc(8*8*2,255);
            for (let i=0;i<raw.length;i+=2) { raw[i] = 1 + (i+id)%23; raw[i+1] = (i*11+id*31)%255; }
            expected.set(id, raw.slice());
            const zipped=gzipSync(raw), file=`pages/${id}.rg8.gz`;
            manifest.pages.push({id,empty:false,byteLength:raw.length,path:file,sha256:sha(raw),compressedBytes:zipped.length,compressedSha256:sha(zipped)});
            await writeFile(path.join(root,file),zipped);
        }
        reconcileGuardBuffers(manifest, expected);
        const report = await reconcileShadowPageGuards(root, manifest);
        assert.ok(report.peakWorkingBytes <= 6*128);
        for (const page of manifest.pages) {
            const actual=gunzipSync(await readFile(path.join(root,page.path)));
            assert.deepEqual(actual,expected.get(page.id)); assert.equal(sha(actual),page.sha256);
        }
    } finally { await rm(root,{recursive:true,force:true}); }
});

test('normal gameplay uses published detail; only explicit local artifact indexes are accepted',()=>{
    assert.equal(streamedShadowPrototypeOptions('').enabled,true);
    assert.equal(streamedShadowPrototypeOptions('?streamedShadowPrototype=0').enabled,false);
    const local='/tests/artifacts/screens/illumination_547/pages-02/streaming_index.json';
    assert.equal(streamedShadowPrototypeOptions('?streamedShadowIndex='+local).indexUrl.includes('/assets/'),true);
    assert.deepEqual(streamedShadowPrototypeOptions('?streamedShadowPrototype=1&streamedShadowIndex='+local),{enabled:true,indexUrl:local});
    for(const bad of ['https://example.com/a.json','/tests/artifacts/private/streaming_index.json',local.replace('pages-02','../private')])
        assert.equal(streamedShadowPrototypeOptions('?streamedShadowPrototype=1&streamedShadowIndex='+bad).indexUrl.includes('/assets/'),true);
});

test('native border reconciliation keeps the nearest blocker across four-page corners',()=>{
    const size=8,edge=6,guard=1,m={interiorTexels:edge,guardTexels:guard,tileCount:[2,2]};
    const buffers=new Map([0,1,2,3].map(id=>[id,new Uint8Array(size*size*2).fill(255)]));
    const write=(id,x,y,v)=>{const a=buffers.get(id),i=(y*size+x)*2;a[i]=v>>8;a[i+1]=v&255;};
    write(3,0,0,173);write(0,6,6,200);
    const report=reconcileGuardBuffers(m,buffers);
    assert.ok(report.changedCopies>0);
    for(const [id,x,y] of [[0,6,6],[1,0,6],[2,6,0],[3,0,0]]){
        const a=buffers.get(id),i=(y*size+x)*2;assert.equal(a[i]*256+a[i+1],173);
    }
    // Shared padding cannot alter an unrelated interior texel.
    assert.equal(buffers.get(0)[(3*size+3)*2],255);
    assert.equal(reconcileGuardBuffers(m,buffers).changedCopies,0);
});

test('conservative reduction keeps the nearest blocker and all-empty sentinel',()=>{
    const bytes=new Uint8Array([255,255,0,100,1,44,0,200,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]);
    assert.deepEqual([...reduceShadowDepth2x(bytes,4,4)],[0,100,0,200,255,255,255,255]);
    assert.throws(()=>reduceShadowDepth2x(new Uint8Array(6),3,1));
});
test('residency is bounded; visible pages survive prefetch, deterministic old slots expire',()=>{
    const pool=new ShadowPageResidency(2);pool.select([3,4],0);
    assert.equal(pool.admit(3,0).slot,0);assert.equal(pool.admit(4,0).slot,1);
    assert.equal(pool.admit(5,9),null);
    pool.select([4,5],1);assert.equal(pool.admit(5,1),null);
    const replacement=pool.admit(5,2.1);assert.equal(replacement.evicted,3);assert.equal(replacement.slot,0);
    assert.equal(pool.entries.size,2);assert.equal(pool.evictions,1);pool.clear();assert.equal(pool.entries.size,0);
});
test('page addressing uses half-open world-space bounds',()=>{
    const m={interiorTexels:10,texelSizeMeters:.1,origin:[-1,-2],tileCount:[2,3]};
    assert.equal(streamedPageAt(m,-1,-2),0);assert.equal(streamedPageAt(m,0,-1),3);
    assert.equal(streamedPageAt(m,1,0),-1);assert.equal(streamedPageAt(m,-1.000001,-2),-1);
});
test('manifest binds the complete parent and authenticated empty pages, rejects identity and guard drift',async()=>{
    const parent={identity:{layout:{boundsLightMeters:{min:[0,0]},texelSizeMeters:.06,interiorTexels:[2040,2040],tileCount:[1,1]},encoding:{minDepthMeters:-250,maxDepthMeters:250}}};
    const size=1020+2*118,bytes=size*size*2;
    const m={schema:'bus-sim-static-shadow-pages-v1',parentDescriptorSha256:await rawSha256Hex(canonicalJsonBytes(parent)),ratio:3,interiorTexels:1020,
        guardTexels:118,angularDiameterDegrees:.53,origin:[0,0],texelSizeMeters:.02,tileCount:[6,6],encoding:'rg8-packed-linear-depth-v1',
        pages:[{id:0,empty:true,path:null,byteLength:bytes,sha256:await rawSha256Hex(new Uint8Array(bytes).fill(255))}]};
    assert.equal((await validateStreamedShadowManifest(m,parent)).pages.length,1);
    for(const changed of [{...m,parentDescriptorSha256:'f'.repeat(64)},{...m,guardTexels:4},{...m,pages:[...m.pages,...m.pages]},
        {...m,pages:[{...m.pages[0],sha256:'0'.repeat(64)}]}])await assert.rejects(()=>validateStreamedShadowManifest(changed,parent));
});
