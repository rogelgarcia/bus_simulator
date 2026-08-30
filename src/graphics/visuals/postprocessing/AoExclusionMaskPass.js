// Runs the AO receiver-mask callback after the visible scene has populated composer depth.
// @ts-check

export class AoExclusionMaskPass {
    constructor({ renderMask } = {}) {
        if (typeof renderMask !== 'function') {
            throw new Error('[AoExclusionMaskPass] renderMask is required');
        }
        this.enabled = true;
        this.needsSwap = false;
        this.clear = false;
        this.renderToScreen = false;
        this._renderMask = renderMask;
    }

    setSize() {}

    render(renderer, writeBuffer, readBuffer) {
        this._renderMask({ renderer, writeBuffer, readBuffer });
    }

    dispose() {
        this._renderMask = null;
    }
}
