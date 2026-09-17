// Stages image rows privately; visible misses retain the renderer's complete ordinary upload.
// @ts-check
import * as THREE from 'three';
import { TextureRowDecoder } from './TextureRowDecoder.js';

/** @param {any} texture */
export function imageTextureBytes(texture) {
    const image = texture.image;
    return (image?.width ?? 0) * (image?.height ?? 0) * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
}

/** @param {any} texture */
export function canStageImageTexture(texture) {
    const image = texture.image;
    return texture.isTexture && texture.version > 0 && !texture.isExternalTexture && !texture.isRenderTargetTexture && !texture.isVideoTexture
        && !texture.isCubeTexture && !texture.isDataTexture && !texture.isCompressedTexture
        && texture.format === THREE.RGBAFormat && texture.type === THREE.UnsignedByteType
        && [null, 'RGBA8', 'SRGB8_ALPHA8'].includes(texture.internalFormat)
        && !texture.mipmaps.length && image?.width > 0 && image?.height > 0
        && image instanceof HTMLImageElement
        && [THREE.SRGBColorSpace, THREE.NoColorSpace, THREE.LinearSRGBColorSpace].includes(texture.colorSpace);
}

/** @param {any} renderer @param {any} texture @param {Function} complete @param {TextureRowDecoder|null} decoder */
export function createStagedImageTexture(renderer, texture, complete, decoder = null) {
    if (THREE.REVISION !== '183') throw new Error('Image preparation requires audited Three r183');
    const gl = renderer.getContext(), image = texture.image, version = texture.version, sourceVersion = texture.source.version;
    const width = image.width, height = image.height;
    const staging = new THREE.Texture(image);
    staging.colorSpace = texture.colorSpace;
    staging.generateMipmaps = false; staging.minFilter = THREE.LinearFilter;
    staging.onUpdate = null; staging.needsUpdate = true;
    let y = 0, bitmap = null, rows = 0, pending = false, allocated = false, cancelled = false, failure = null, phase = 'idle';
    const framebuffer = gl.createFramebuffer();
    const reader = decoder ?? new TextureRowDecoder(), source = reader.open(image);
    const requestRows = byteBudget => {
        rows = Math.min(height - y, Math.max(1, Math.floor(Math.min(byteBudget, 256 * 1024) / (width * 4)))); pending = true;
        source.read(y, rows, texture.flipY, texture.premultiplyAlpha)
            .then(value => { pending = false; if (!cancelled) bitmap = value.pixels; }, error => { pending = false; if (!cancelled) failure = error; });
    };
    const cancel = () => {
        if (cancelled) return;
        cancelled = true; bitmap = null; source.cancel(); if (!decoder) reader.dispose();
        staging.dispose(); gl.deleteFramebuffer(framebuffer); texture.removeEventListener('dispose', cancel);
    };
    texture.addEventListener('dispose', cancel);
    return {
        cancel,
        get phase() { return phase; },
        step(byteBudget) {
            if (failure) { cancel(); throw failure; }
            if (cancelled || gl.isContextLost() || texture.version !== version || texture.source.version !== sourceVersion
                || texture.image !== image || renderer.properties.get(texture).__version === version) return { done: true };
            if (!allocated) {
                phase = 'allocate';
                staging.source.dataReady = false; renderer.initTexture(staging); allocated = true;
                return { done: false, bytes: 0 };
            }
            if (bitmap) {
                phase = 'upload';
                if (width * rows * 4 > byteBudget) return { waiting: true };
                renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(staging).__webglTexture);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
                gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, texture.flipY ? height - y - rows : y, width, rows, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
                const uploadedBytes = width * rows * 4;
                renderer.state.unbindTexture(); bitmap = null; y += rows;
                // Decode the next strip while gameplay renders; keep only one strip in flight.
                if (y < height) requestRows(byteBudget);
                return { done: false, bytes: uploadedBytes };
            }
            if (y < height) {
                phase = 'waiting';
                if (!pending) {
                    phase = 'decode-row';
                    if (byteBudget < width * 4) return { waiting: true };
                    requestRows(byteBudget);
                }
                return { done: false, waiting: true };
            }
            const ready = texture.source.dataReady, callback = texture.onUpdate;
            phase = 'publish';
            const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
            let published = false;
            try {
                texture.source.dataReady = false; texture.onUpdate = null; renderer.initTexture(texture);
                renderer.state.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.properties.get(staging).__webglTexture, 0);
                renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(texture).__webglTexture);
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
                if (texture.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
                published = true;
            } finally {
                renderer.state.unbindTexture(); renderer.setRenderTarget(target, face, mip);
                texture.source.dataReady = ready; texture.onUpdate = callback;
                if (!published) texture.needsUpdate = true;
            }
            callback?.(texture); complete();
            return { done: true, bytes: 0 };
        }
    };
}
