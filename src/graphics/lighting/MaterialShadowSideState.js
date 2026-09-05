// Keeps authored shadow-sidedness separate from the city's temporary renderer override.
// @ts-check
const originals = new WeakMap();

/** @param {any} material */
export function getAuthoredMaterialShadowSide(material) {
    return originals.has(material) ? originals.get(material) : material.shadowSide ?? null;
}

/** @param {any} material @param {number} side */
export function overrideMaterialShadowSide(material, side) {
    if (!originals.has(material)) originals.set(material, material.shadowSide ?? null);
    material.shadowSide = side;
}

/** @param {any} material */
export function restoreMaterialShadowSide(material) {
    if (!originals.has(material)) return;
    material.shadowSide = originals.get(material);
    originals.delete(material);
}
