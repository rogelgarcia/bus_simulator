// src/graphics/gui/mesh_fabrication/render_passes/wirePass.js

export function createWireRenderPass() {
    return Object.freeze({
        id: 'wire',
        render(context) {
            void context;
        }
    });
}
