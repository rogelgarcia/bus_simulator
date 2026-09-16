// Uploads authenticated receiver data in bounded row batches before publication.
// @ts-check
import * as THREE from 'three';

/** @param {any} renderer @param {any} texture @param {any[]} levels @param {AbortSignal} signal */
export async function prepareReceiverTexture(renderer, texture, levels, signal) {
    if (THREE.REVISION !== '183') throw new Error('Receiver preparation requires audited Three r183.');
    signal.throwIfAborted();
    const gl = renderer.getContext(), started = performance.now();
    const previousUpdate = texture.onUpdate, dataReady = texture.source.dataReady;
    const target = texture.isDataArrayTexture ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    const format = texture.format === THREE.RGBFormat ? gl.RGB : texture.format === THREE.RGBAFormat ? gl.RGBA : null;
    const type = texture.type === THREE.UnsignedInt5999Type ? gl.UNSIGNED_INT_5_9_9_9_REV
        : texture.type === THREE.FloatType ? gl.FLOAT : texture.type === THREE.UnsignedByteType ? gl.UNSIGNED_BYTE : null;
    if (!format || !type) throw new Error('Unsupported receiver staging format');
    const metrics = { bytes: 0, batches: 0, maximumBatchMs: 0, cpuMs: 0, elapsedMs: 0 };
    let completed = false;
    let batchStart = performance.now(), batchBytes = 0;
    const finishBatch = () => {
        const ms = performance.now() - batchStart;
        metrics.cpuMs += ms; metrics.maximumBatchMs = Math.max(metrics.maximumBatchMs, ms); metrics.batches++;
    };
    try {
        // Three allocates all mip storage while dataReady=false. Its version is
        // acknowledged, so normal draws do not repeat the completed CPU uploads.
        texture.source.dataReady = false; texture.onUpdate = null;
        renderer.initTexture(texture);
        for (let mip = 0; mip < levels.length; mip++) {
            const level = levels[mip], depth = level.depth ?? 1;
            const elements = level.data.length / (level.width * level.height * depth);
            const rowElements = level.width * elements;
            const rows = Math.max(1, Math.floor(2 * 1024 * 1024 / (rowElements * level.data.BYTES_PER_ELEMENT)));
            for (let layer = 0; layer < depth; layer++) for (let y = 0; y < level.height; y += rows) {
                signal.throwIfAborted();
                if (gl.isContextLost()) throw new Error('receiver_texture_context_lost');
                const count = Math.min(rows, level.height - y), offset = (layer * level.height + y) * rowElements;
                const pixels = level.data.subarray(offset, offset + count * rowElements);
                // Audited r183 state binding keeps Three's cache coherent. The
                // public copy API queries unpack state on every strip, forcing
                // repeated GPU round trips while the game continues rendering.
                renderer.state.bindTexture(target, renderer.properties.get(texture).__webglTexture);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
                gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
                gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
                gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
                try {
                    if (texture.isDataArrayTexture) gl.texSubImage3D(target, mip, 0, y, layer, level.width, count, 1, format, type, pixels);
                    else gl.texSubImage2D(target, mip, 0, y, level.width, count, format, type, pixels);
                } finally { renderer.state.unbindTexture(); }
                const bytes = pixels.byteLength; metrics.bytes += bytes; batchBytes += bytes;
                if (batchBytes >= 8 * 1024 * 1024 || performance.now() - batchStart >= 4) {
                    finishBatch();
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    signal.throwIfAborted(); batchStart = performance.now(); batchBytes = 0;
                }
            }
        }
        finishBatch();
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Receiver staged GPU upload failed');
        metrics.elapsedMs = performance.now() - started;
        completed = true;
        return metrics;
    } finally {
        texture.source.dataReady = dataReady; texture.onUpdate = previousUpdate;
        // A borrowed texture may survive cancellation (for example after resize
        // or city replacement). Never leave its partial upload marked current.
        if (!completed) texture.needsUpdate = true;
    }
}
