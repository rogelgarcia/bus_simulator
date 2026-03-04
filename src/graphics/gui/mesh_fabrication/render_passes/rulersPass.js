// src/graphics/gui/mesh_fabrication/render_passes/rulersPass.js

export function createRulersRenderPass() {
    return Object.freeze({
        id: 'rulers',
        render(context) {
            const { view, tile, camera, viewport } = context;
            if (tile.kind !== 'orthographic') return;
            const aspect = viewport.w / Math.max(1, viewport.h);
            view._updateOrthoRulerMetricsForTile(tile, camera, aspect);
        }
    });
}
