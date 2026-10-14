// AI 597 D5 frame pipeline model (landscape-frame-pipeline-v1): the constants and the byte accounting of the viewer's frame pipeline, pure so
// tests and the ocean modules read them without the pipeline's shader load (LandscapeFramePipeline.js builds the passes).
// @ts-check

export const LANDSCAPE_FRAME_PIPELINE = Object.freeze({
    id: 'landscape-frame-pipeline-v1',
    // the frame target (RGBA16F), its depth renderbuffer (DEPTH_COMPONENT24) and the scene copy (RGBA16F, the same format so the copy is
    // always legal) per drawing-buffer pixel
    targetBytesPerPixel: 8, depthBytesPerPixel: 4, sceneBytesPerPixel: 8,
    // render calls per frame: the scene into the target, the final pass to the canvas
    passes: 2,
    edge: Object.freeze({ sharpness: 8, threshold: .125, thresholdMin: .05 })
});

/** Bytes of the pipeline at a drawing-buffer size. @param {number} width @param {number} height */
export function landscapeFramePipelineBytes(width, height) {
    const pixels = Math.max(0, width) * Math.max(0, height), p = LANDSCAPE_FRAME_PIPELINE;
    return { target: pixels * p.targetBytesPerPixel, depth: pixels * p.depthBytesPerPixel, scene: pixels * p.sceneBytesPerPixel, total: pixels * (p.targetBytesPerPixel + p.depthBytesPerPixel + p.sceneBytesPerPixel) };
}
