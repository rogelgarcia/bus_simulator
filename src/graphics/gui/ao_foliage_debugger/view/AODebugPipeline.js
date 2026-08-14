// src/graphics/gui/ao_foliage_debugger/view/AODebugPipeline.js
// AO debugger adapter that exercises the same post-processing pipeline as gameplay.
// @ts-check

import { sanitizeAmbientOcclusionSettings } from '../../../visuals/postprocessing/AmbientOcclusionSettings.js';
import { PostProcessingPipeline } from '../../../visuals/postprocessing/PostProcessingPipeline.js';

function deepClone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

export class AODebugPipeline {
    constructor({
        renderer,
        scene,
        camera,
        bloom = null,
        sunBloom = null,
        antiAliasing = null,
        ambientOcclusion = null,
        msaaSamples = 8
    } = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this._ambientOcclusion = sanitizeAmbientOcclusionSettings(ambientOcclusion);
        this._pipeline = new PostProcessingPipeline({
            renderer,
            scene,
            camera,
            bloom,
            sunBloom,
            colorGrading: { enabled: false, intensity: 0 },
            antiAliasing: antiAliasing ?? {
                mode: 'msaa',
                msaa: { samples: Math.max(0, Math.floor(Number(msaaSamples) || 0)) }
            },
            ambientOcclusion: this._ambientOcclusion
        });
        this.composer = this._pipeline.composer;
    }

    setPixelRatio(pixelRatio) {
        this._pipeline?.setPixelRatio?.(pixelRatio);
    }

    setSize(width, height) {
        this._pipeline?.setSize?.(width, height);
    }

    setToneMapping(options) {
        this._pipeline?.setToneMapping?.(options);
    }

    setAmbientOcclusion(ambientOcclusion) {
        this._ambientOcclusion = sanitizeAmbientOcclusionSettings(ambientOcclusion);
        this._pipeline?.setAmbientOcclusion?.(this._ambientOcclusion);
    }

    getAmbientOcclusion() {
        return deepClone(this._ambientOcclusion);
    }

    getDebugInfo() {
        return this._pipeline?.getDebugInfo?.() ?? null;
    }

    getAoOverrideDebugInfo() {
        const materials = [];
        const overrideMaterials = this._pipeline?._aoAlpha?.overrideMaterials ?? null;
        if (overrideMaterials instanceof Set) {
            for (const material of overrideMaterials) {
                materials.push({
                    type: material?.type ?? null,
                    alphaTest: Number(material?.alphaTest) || 0,
                    hasMap: !!material?.map,
                    hasAlphaMap: !!material?.alphaMap
                });
            }
        }
        return {
            handling: this._ambientOcclusion?.alpha?.handling ?? 'alpha_test',
            frameStats: {
                ...(this._pipeline?.getDebugInfo?.()?.ambientOcclusion?.alpha?.frameStats ?? {})
            },
            count: materials.length,
            materials
        };
    }

    getAoExclusionMaskDataUrlForTest() {
        const target = this._pipeline?._aoExclusionMask?.target ?? null;
        const renderer = this.renderer ?? null;
        const width = Math.max(1, Math.floor(Number(target?.width) || 1));
        const height = Math.max(1, Math.floor(Number(target?.height) || 1));
        if (!target || !renderer?.readRenderTargetPixels || typeof document === 'undefined') return null;

        const pixels = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        const image = context.createImageData(width, height);
        for (let y = 0; y < height; y += 1) {
            const srcRow = (height - 1 - y) * width * 4;
            const dstRow = y * width * 4;
            image.data.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow);
        }
        context.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png');
    }

    render(deltaTime = undefined) {
        this._pipeline?.render?.(deltaTime);
        const stats = this._pipeline?.getDebugInfo?.()?.ambientOcclusion?.alpha?.frameStats ?? null;
        const canvas = this.renderer?.domElement ?? null;
        if (canvas?.dataset) {
            canvas.dataset.aoHandling = this._ambientOcclusion?.alpha?.handling ?? 'alpha_test';
            canvas.dataset.aoFrameStats = JSON.stringify(stats ?? {});
        }
    }

    dispose() {
        this._pipeline?.dispose?.();
        this._pipeline = null;
        this.composer = null;
    }
}
