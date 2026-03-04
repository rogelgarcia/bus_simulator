// src/graphics/gui/mesh_fabrication/render_passes/surfacePass.js

export function createSurfaceRenderPass() {
    return Object.freeze({
        id: 'surface',
        render(context) {
            context.renderer.render(context.scene, context.camera);
        }
    });
}
