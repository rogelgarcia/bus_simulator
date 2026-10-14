// AI 597 D5: the frame pipeline model (the pure constants and the byte accounting of the viewer's linear frame target, depth and scene copy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_FRAME_PIPELINE, landscapeFramePipelineBytes } from '../../../src/graphics/engine3d/landscape/LandscapeFramePipelineModel.js';

test('Frame pipeline model: two passes per frame, half-float target and scene copy with a depth renderbuffer, display-sized bytes', () => {
    assert.equal(LANDSCAPE_FRAME_PIPELINE.id, 'landscape-frame-pipeline-v1');
    assert.equal(LANDSCAPE_FRAME_PIPELINE.passes, 2);
    assert.deepEqual([LANDSCAPE_FRAME_PIPELINE.targetBytesPerPixel, LANDSCAPE_FRAME_PIPELINE.depthBytesPerPixel, LANDSCAPE_FRAME_PIPELINE.sceneBytesPerPixel], [8, 4, 8]);
    assert.ok(LANDSCAPE_FRAME_PIPELINE.edge.threshold > LANDSCAPE_FRAME_PIPELINE.edge.thresholdMin && LANDSCAPE_FRAME_PIPELINE.edge.sharpness > 0);
    // 1920 x 1080: 20 bytes per pixel, 41.5 MB; 3840 x 2160 four times that; a degenerate size holds nothing
    const hd = landscapeFramePipelineBytes(1920, 1080);
    assert.deepEqual(hd, { target: 16588800, depth: 8294400, scene: 16588800, total: 41472000 });
    assert.equal(landscapeFramePipelineBytes(3840, 2160).total, 4 * hd.total);
    assert.equal(landscapeFramePipelineBytes(0, 1080).total, 0);
    assert.equal(landscapeFramePipelineBytes(-5, 10).total, 0);
    assert.ok(Object.isFrozen(LANDSCAPE_FRAME_PIPELINE) && Object.isFrozen(LANDSCAPE_FRAME_PIPELINE.edge));
});
