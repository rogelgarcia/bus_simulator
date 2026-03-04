// src/graphics/gui/mesh_fabrication/services/overlayRenderManager.js

import {
    createGizmosRenderPass,
    createHighlightsRenderPass,
    createMeshFabricationPassScheduler,
    createRulersRenderPass,
    createSurfaceRenderPass,
    createVerticesRenderPass,
    createWireRenderPass
} from '../render_passes/index.js';

export function createOverlayRenderManager() {
    const scheduler = createMeshFabricationPassScheduler([
        createSurfaceRenderPass(),
        createWireRenderPass(),
        createVerticesRenderPass(),
        createGizmosRenderPass(),
        createRulersRenderPass(),
        createHighlightsRenderPass()
    ]);

    return Object.freeze({
        renderTile(context) {
            scheduler.render(context);
        }
    });
}
