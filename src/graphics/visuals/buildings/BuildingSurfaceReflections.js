// Optional environment response on opaque building surfaces; authored inputs stay intact.
// @ts-check

const bindings = new WeakMap();

export function updateBuildingSurfaceReflectionIntensity(material, intensity) {
    const binding = bindings.get(material);
    if (!binding) return false;
    material.envMapIntensity = binding.enabled ? Math.max(0, intensity) : binding.original;
    return true;
}

export function applyBuildingSurfaceReflections(root, enabled, intensity) {
    const materials = new Set();
    root?.traverse(object => {
        if (!object.isMesh) return;
        for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
            if (ancestor.name === 'windows') return;
        }
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (!material?.isMeshStandardMaterial || material.transparent || material.transmission > 0
                || material.userData?.buildingWindowGlass || material.userData?.windowInterior
                || material.userData?.iblNoAutoEnvMapIntensity !== true) continue;
            materials.add(material);
        }
    });
    for (const material of materials) {
        let binding = bindings.get(material);
        if (!binding) {
            binding = { original: material.envMapIntensity, enabled: false };
            bindings.set(material, binding);
        }
        binding.enabled = enabled === true;
        // envMapIntensity is a uniform: do not replace materials, change source
        // semantics, mark shaders dirty, or reload baked resources on a toggle.
        updateBuildingSurfaceReflectionIntensity(material, intensity);
    }
    return { materials: materials.size, enabled: enabled === true };
}
