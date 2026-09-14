// Diagnostic counterpart of the glTF source-material export, with reversible uniforms.
export function sourceMaterialControl(scene) {
    const materials = new Set();
    scene.traverse(object => {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material) materials.add(material);
        }
    });
    const changes = [], variation = [];
    function set(vector, component, value) {
        if (!vector || typeof vector[component] !== 'number') throw new Error('Unsupported material variation uniform');
        changes.push(() => { vector[component] = previous; });
        const previous = vector[component];
        vector[component] = value;
    }
    function restore() { for (const undo of changes.reverse()) undo(); changes.length = 0; }
    try {
        for (const material of materials) {
            const cfg = material.userData?.materialVariationConfig;
            if (!cfg) continue;
            variation.push({name: material.name, color: material.color?.toArray(),
                normalized: cfg.normalized, uniforms: Object.fromEntries(Object.entries(cfg.uniforms)
                    .filter(([, value]) => value?.toArray).map(([key, value]) => [key, value.toArray()])),
                debug: cfg.debug, cornerDist: cfg.cornerDist});
            // The glTF adapter retains source textures/UV tiling but drops these shader layers.
            set(cfg.uniforms.config0, 'z', 0);
            set(cfg.uniforms.texBlend1, 'w', 1);
            set(cfg.debugUniforms.debug1, 'z', 1);
            set(cfg.uniforms.normalMap, 'x', 0);
            set(cfg.uniforms.normalMap, 'y', 0);
            set(cfg.uniforms.normalMap, 'z', 0);
            set(cfg.debugUniforms.debug2, 'y', 0);
        }
    } catch (error) { restore(); throw error; }
    return {restore, variation, policy: 'Source textures/factors and UV override retained; runtime-only procedural variation disabled for diagnostic render. Never a production preset.'};
}
