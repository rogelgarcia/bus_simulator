// Isolates gameplay color visibility from shadow and auxiliary-camera renders.
// @ts-check

export class StaticVisibilityRenderBridge {
    constructor({ renderer, scene, camera, roots } = {}) {
        if (!renderer?.render || !renderer?.shadowMap?.render) throw new Error('Static visibility render bridge requires a WebGL renderer');
        if (!scene || !camera || !Array.isArray(roots)) throw new Error('Static visibility render bridge requires scene, camera, and roots');
        if (renderer.userData?.staticVisibilityBridge) throw new Error('A static visibility render bridge is already installed');

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.roots = roots;
        this._originalVisibility = roots.map((root) => root.visible !== false);
        this._desiredVisibility = new Uint8Array(roots.length);
        this._desiredVisibility.fill(1);
        this._temporaryAllVisibleDepth = 0;
        this._shadowPassDepth = 0;
        this.stats = { colorWrites: 0, shadowRestoreWrites: 0, auxiliaryRestoreWrites: 0 };

        renderer.userData ??= {};
        renderer.userData.staticVisibilityBridge = this;
        this._install();
    }

    _install() {
        const bridge = this;
        const renderer = this.renderer;
        const shadowMap = renderer.shadowMap;
        this._originalRender = renderer.render;
        this._originalShadowRender = shadowMap.render;

        renderer.render = function renderWithStaticVisibility(scene, camera, ...rest) {
            const auxiliaryCityCamera = scene === bridge.scene && camera !== bridge.camera;
            if (auxiliaryCityCamera) bridge._beginTemporaryAllVisible('auxiliary');
            try {
                return bridge._originalRender.call(this, scene, camera, ...rest);
            } finally {
                if (auxiliaryCityCamera) bridge._endTemporaryAllVisible();
            }
        };

        shadowMap.render = function renderShadowsWithStaticVisibility(...args) {
            bridge._shadowPassDepth += 1;
            bridge._setOriginalVisibility('shadow');
            try {
                return bridge._originalShadowRender.apply(this, args);
            } finally {
                bridge._shadowPassDepth -= 1;
                if (bridge._shadowPassDepth === 0 && bridge._temporaryAllVisibleDepth === 0) bridge._applyDesiredVisibility(false);
            }
        };
    }

    setColorVisibility(index, visible) {
        if (!Number.isInteger(index) || index < 0 || index >= this.roots.length) {
            throw new Error(`Static visibility root index out of range: ${index}`);
        }
        this._desiredVisibility[index] = visible ? 1 : 0;
        if (this._temporaryAllVisibleDepth > 0 || this._shadowPassDepth > 0) return;
        const root = this.roots[index];
        const next = this._originalVisibility[index] && visible;
        if (root.visible === next) return;
        root.visible = next;
        this.stats.colorWrites += 1;
    }

    _setOriginalVisibility(reason) {
        for (let index = 0; index < this.roots.length; index += 1) {
            const root = this.roots[index];
            const next = this._originalVisibility[index];
            if (root.visible === next) continue;
            root.visible = next;
            if (reason === 'shadow') this.stats.shadowRestoreWrites += 1;
            else this.stats.auxiliaryRestoreWrites += 1;
        }
    }

    _applyDesiredVisibility(countWrites = true) {
        for (let index = 0; index < this.roots.length; index += 1) {
            const root = this.roots[index];
            const next = this._originalVisibility[index] && this._desiredVisibility[index] === 1;
            if (root.visible === next) continue;
            root.visible = next;
            if (countWrites) this.stats.colorWrites += 1;
        }
    }

    _beginTemporaryAllVisible(reason) {
        this._temporaryAllVisibleDepth += 1;
        if (this._temporaryAllVisibleDepth === 1) this._setOriginalVisibility(reason);
    }

    _endTemporaryAllVisible() {
        this._temporaryAllVisibleDepth -= 1;
        if (this._temporaryAllVisibleDepth < 0) throw new Error('Static visibility temporary visibility depth underflow');
        if (this._temporaryAllVisibleDepth === 0 && this._shadowPassDepth === 0) this._applyDesiredVisibility(false);
    }

    restoreAllVisible() {
        this._desiredVisibility.fill(1);
        this._setOriginalVisibility('auxiliary');
    }

    dispose() {
        this.restoreAllVisible();
        const renderer = this.renderer;
        if (renderer?.render && renderer.render !== this._originalRender) renderer.render = this._originalRender;
        if (renderer?.shadowMap?.render && renderer.shadowMap.render !== this._originalShadowRender) {
            renderer.shadowMap.render = this._originalShadowRender;
        }
        if (renderer?.userData?.staticVisibilityBridge === this) delete renderer.userData.staticVisibilityBridge;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.roots = [];
    }
}
