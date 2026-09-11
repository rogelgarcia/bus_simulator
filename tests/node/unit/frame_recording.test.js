// Checks exact pose round trips, compact transport, and rejected corrupt captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_FIELDS, createFrameChunk, packFrameRecording, unpackFrameRecording,
    encodeFrameRecording, decodeFrameRecording, recordingFramePose } from '../../../src/app/gameplay/recording/FrameRecording.js';

test('recording preserves every frame, double precision transforms and missing GPU samples across chunks', async () => {
    const chunks=[createFrameChunk(),createFrameChunk(),createFrameChunk()], count=2107;
    for (let i=0;i<count;i++) {
        const c=chunks[Math.floor(i/1024)], n=i%1024;
        for (const [key] of FRAME_FIELDS) c[key][n]=i;
        c.frame[n]=2**32+i; c.busX[n]=-170.06046435546867+i/100;
        c.cameraQx[n]=Math.sin(i/2000); c.cameraQw[n]=Math.cos(i/2000);
        c.gpuMs[n]=i%3 ? i/100 : NaN;
    }
    const metadata={version:1,city:'bigcity2',busModelId:'city',configurations:[{usesDefaultValues:true}]};
    const payload=await encodeFrameRecording({metadata,chunks,count});
    const decoded=await decodeFrameRecording(payload);
    assert.equal(decoded.count,count); assert.deepEqual(decoded.metadata,metadata);
    for (let i=0;i<count;i++) for (const [key] of FRAME_FIELDS) assert.ok(Object.is(decoded.columns[key][i],chunks[Math.floor(i/1024)][key][i%1024]),`${key} at ${i}`);
    assert.ok(payload.length < count*150,'Column compression must stay compact for a moving trace');
    assert.equal(recordingFramePose(decoded,1000).bus.transform.position.x,chunks[0].busX[1000]);
    assert.throws(()=>recordingFramePose(decoded,count),/out of range/);
});

test('decoder rejects corrupted, truncated and unknown recordings', async () => {
    const bytes=packFrameRecording({metadata:{},chunks:[createFrameChunk(2)],count:2});
    assert.throws(()=>unpackFrameRecording(bytes.subarray(0,bytes.length-1)),/Truncated/);
    const bad=bytes.slice(); bad[0]=0;
    assert.throws(()=>unpackFrameRecording(bad),/version/);
    await assert.rejects(()=>decodeFrameRecording('BUSREC2:AAAA'),/BUSREC1/);
    const text=await encodeFrameRecording({metadata:{},chunks:[createFrameChunk(2)],count:2});
    await assert.rejects(()=>decodeFrameRecording(text.slice(0,-12)));
});
