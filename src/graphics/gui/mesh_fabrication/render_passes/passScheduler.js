// src/graphics/gui/mesh_fabrication/render_passes/passScheduler.js

export function createMeshFabricationPassScheduler(passes) {
    const orderedPasses = Array.isArray(passes)
        ? passes.filter((pass) => pass && typeof pass.render === 'function')
        : [];

    return Object.freeze({
        render(context) {
            for (const pass of orderedPasses) {
                pass.render(context);
            }
        }
    });
}
