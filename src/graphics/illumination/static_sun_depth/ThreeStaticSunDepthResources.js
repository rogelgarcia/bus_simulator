// Three-native AI 530 resource factory for the compact AI 531 RG8 tile array.
// @ts-check

import * as THREE from 'three';
import {
    requireStaticSunDepthPlanResource,
    validateStaticSunDepthUploadDescriptor
} from './StaticSunDepthPlanContract.js';

function requireDescriptor(descriptor, renderer) {
    const maxTextureSize = Number(renderer?.capabilities?.maxTextureSize ?? 0);
    const gl = renderer?.getContext?.();
    const maxLayers = Number(gl?.getParameter?.(gl.MAX_ARRAY_TEXTURE_LAYERS) ?? 0);
    return validateStaticSunDepthUploadDescriptor(descriptor, {
        maxTextureSize,
        maxArrayTextureLayers: maxLayers
    });
}

function bytesView(value, id) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError(`Decoded static-sun resource '${id}' must be binary bytes.`);
}

export function createThreeStaticSunDepthResourceFactory(renderer) {
    if (!renderer?.isWebGLRenderer || !renderer.capabilities?.isWebGL2) {
        throw new TypeError('Static-sun depth requires a Three WebGL2Renderer.');
    }
    const createResource = function createResource(decoded, descriptor) {
        const upload = requireDescriptor(descriptor, renderer);
        const source = bytesView(decoded, descriptor.id);
        if (source.byteLength !== upload.expectedBytes) {
            throw new RangeError(`Static-sun resource '${descriptor.id}' has ${source.byteLength} bytes; expected ${upload.expectedBytes}.`);
        }
        const pixels = source.slice();
        const expectedByteLength = pixels.byteLength;
        const texture = new THREE.DataArrayTexture(pixels, upload.width, upload.height, upload.layers);
        texture.name = `illumination/static-sun/${descriptor.id}`;
        texture.format = THREE.RGFormat;
        texture.type = THREE.UnsignedByteType;
        texture.internalFormat = 'RG8';
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.flipY = false;
        texture.unpackAlignment = 1;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;
        let initialized = false;
        let disposed = false;
        return Object.freeze({
            resource: Object.freeze({
                kind: 'texture_2d_array',
                encoding: 'rg8_unorm',
                texture,
                width: upload.width,
                height: upload.height,
                layers: upload.layers,
                initialize(verifiedPixels) {
                    if (disposed) throw new Error(`Static-sun resource '${descriptor.id}' is disposed.`);
                    if (initialized) return;
                    if (!(verifiedPixels instanceof Uint8Array)
                        || !(verifiedPixels.buffer instanceof ArrayBuffer)
                        || verifiedPixels.byteLength !== expectedByteLength) {
                        throw new TypeError(`Static-sun resource '${descriptor.id}' requires exact verified upload bytes.`);
                    }
                    texture.image.data = verifiedPixels;
                    renderer.initTexture(texture);
                    initialized = true;
                }
            }),
            cpuBytes: expectedByteLength,
            gpuBytes: expectedByteLength,
            dispose() {
                if (disposed) return;
                disposed = true;
                texture.dispose();
                if (texture.image) texture.image.data = null;
            }
        });
    };
    Object.defineProperty(createResource, 'validatePlan', {
        value(plan) {
            const descriptor = requireStaticSunDepthPlanResource(plan);
            return Object.freeze([requireDescriptor(descriptor, renderer)]);
        }
    });
    return Object.freeze(createResource);
}
