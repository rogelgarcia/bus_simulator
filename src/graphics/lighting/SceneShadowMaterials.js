// src/graphics/lighting/SceneShadowMaterials.js
// Choke point that prepares materials to receive scene sun shadows.
//
// With the single fitted shadow map this is a no-op: built-in lit materials
// already receive DirectionalLight shadows through the stock pipeline. When
// cascaded shadow maps are active, every lit material must be registered so
// the CSM shader picks the right cascade per fragment — an unregistered lit
// material would be lit by every cascade light at once and render over-bright.
//
// Registration is idempotent and material-level, so canonical instances handed
// back by BuildingGeometryMerger register once no matter how many meshes share
// them. Register AFTER geometry merging: the CSM hook chains onBeforeCompile,
// which would otherwise make every material look custom to the merger's
// dedup identity check.
// @ts-check

let _activeSystem = null;

/**
 * Install (or clear, with null) the system that materials register into.
 * The system must expose `registerMaterial(material)`.
 */
export function setActiveSceneShadowSystem(system) {
    _activeSystem = system && typeof system.registerMaterial === 'function' ? system : null;
}

export function getActiveSceneShadowSystem() {
    return _activeSystem;
}

/** True for built-in materials lit by directional lights. */
export function isLitMaterial(mat) {
    if (!mat || typeof mat !== 'object') return false;
    return !!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial
        || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial || mat.isMeshToonMaterial);
}

export function registerMaterialForSceneShadows(material) {
    if (!_activeSystem) return;
    if (!isLitMaterial(material)) return;
    _activeSystem.registerMaterial(material);
}

/** Register every lit material found under an Object3D subtree. */
export function registerObjectForSceneShadows(root) {
    if (!_activeSystem || !root?.traverse) return;
    root.traverse((o) => {
        const m = o?.material ?? null;
        if (!m) return;
        if (Array.isArray(m)) {
            for (const mat of m) registerMaterialForSceneShadows(mat);
        } else {
            registerMaterialForSceneShadows(m);
        }
    });
}
