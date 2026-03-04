// src/graphics/gui/mesh_fabrication/render_passes/gizmosPass.js

export function createGizmosRenderPass() {
    return Object.freeze({
        id: 'gizmos',
        render(context) {
            const { view, renderer, tile, viewport, camera } = context;
            view._renderAxisGizmoInTile(renderer, tile, viewport.x, viewport.y, viewport.w, viewport.h, camera);
        }
    });
}
