// src/graphics/visuals/postprocessing/TemporalAAPass.js
// Temporal anti-aliasing pass (history accumulation + clamp + optional sharpen).
// @ts-check

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { createTemporalAACopyShaderPayload, createTemporalAAShaderPayload } from '../../shaders/postprocessing/TemporalAAPassShader.js';

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

export class TemporalAAPass extends ShaderPass {
    constructor({ colorSpace = null } = {}) {
        const payload = createTemporalAAShaderPayload();
        super({
            uniforms: THREE.UniformsUtils.clone(payload.uniforms),
            vertexShader: payload.vertexSource,
            fragmentShader: payload.fragmentSource
        });

        this.enabled = false;
        if (this.material) {
            this.material.toneMapped = false;
            attachShaderMetadata(this.material, payload, 'postprocessing-temporal-aa');
        }

        this._historyValid = false;
        this._historyRt = new THREE.WebGLRenderTarget(1, 1, {
            depthBuffer: false,
            stencilBuffer: false
        });
        if (colorSpace && this._historyRt?.texture && 'colorSpace' in this._historyRt.texture) {
            this._historyRt.texture.colorSpace = colorSpace;
        }

        const copyPayload = createTemporalAACopyShaderPayload();
        this._copyPass = new ShaderPass({
            uniforms: THREE.UniformsUtils.clone(copyPayload.uniforms),
            vertexShader: copyPayload.vertexSource,
            fragmentShader: copyPayload.fragmentSource
        });
        if (this._copyPass?.material) this._copyPass.material.toneMapped = false;
        if (this._copyPass?.material) attachShaderMetadata(this._copyPass.material, copyPayload, 'postprocessing-temporal-aa-copy');
    }

    resetHistory() {
        this._historyValid = false;
    }

    setSize(width, height) {
        const w = Math.max(1, Math.floor(Number(width)));
        const h = Math.max(1, Math.floor(Number(height)));
        const prevW = this._historyRt?.width ?? 1;
        const prevH = this._historyRt?.height ?? 1;
        if (prevW === w && prevH === h) return;
        this._historyRt.setSize(w, h);
        this.resetHistory();
        const inv = this.uniforms?.uInvResolution?.value ?? null;
        if (inv?.set) inv.set(1 / w, 1 / h);
    }

    setSettings({ historyStrength, sharpen, clampStrength } = {}) {
        if (this.uniforms?.uHistoryStrength) {
            this.uniforms.uHistoryStrength.value = clampNumber(historyStrength, 0, 0.98, this.uniforms.uHistoryStrength.value);
        }
        if (this.uniforms?.uSharpenStrength) {
            this.uniforms.uSharpenStrength.value = clampNumber(sharpen, 0, 1, this.uniforms.uSharpenStrength.value);
        }
        if (this.uniforms?.uClampStrength) {
            this.uniforms.uClampStrength.value = clampNumber(clampStrength, 0, 1, this.uniforms.uClampStrength.value);
        }
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        if (!this.uniforms) return;

        const historyTex = this._historyValid ? (this._historyRt?.texture ?? null) : null;
        if (this.uniforms.tHistory) this.uniforms.tHistory.value = historyTex || readBuffer?.texture || null;

        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);

        if (this._copyPass && this._historyRt) {
            this._copyPass.render(renderer, this._historyRt, writeBuffer, deltaTime, maskActive);
            this._historyValid = true;
        }
    }

    dispose() {
        this._historyRt?.dispose?.();
        this.material?.dispose?.();
        this._copyPass?.material?.dispose?.();
    }
}
