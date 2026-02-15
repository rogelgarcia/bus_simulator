// src/graphics/visuals/postprocessing/AoAlphaCutoutSupport.js
// Helpers for AO alpha-cutout handling (SSAO/GTAO override materials).
// @ts-check

function isLikelyFoliageName(name) {
    const s = String(name ?? '').trim().toLowerCase();
    if (!s) return false;
    return s.includes('leaf') || s.includes('foliage') || s.includes('bush') || s.includes('grass') || s.includes('hedge');
}

function hasAlphaTexture(material) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat) return false;
    return !!(mat.alphaMap || mat.map);
}

export function getMaterialForAoGroup(object, group) {
    const obj = object ?? null;
    if (!obj) return null;
    const mat = obj.material ?? null;
    if (!mat) return null;
    if (!Array.isArray(mat)) return mat;
    const idx = Number.isFinite(group?.materialIndex) ? Math.max(0, Math.floor(group.materialIndex)) : 0;
    return mat[idx] ?? mat[0] ?? null;
}

export function shouldApplyAoAlphaCutout(material, object) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat || !hasAlphaTexture(mat)) return false;

    const alphaTest = Number(mat.alphaTest) || 0;
    if (alphaTest > 1e-6) return true;

    const tagged = mat.userData?.isFoliage === true || object?.userData?.isFoliage === true;
    if (tagged) return true;

    if (isLikelyFoliageName(mat.name) || isLikelyFoliageName(object?.name)) return true;

    const transparent = mat.transparent === true;
    const depthWriteDisabled = mat.depthWrite === false;
    const opacity = Number.isFinite(mat.opacity) ? Number(mat.opacity) : 1;
    return transparent && (depthWriteDisabled || opacity < 0.999 || !!mat.alphaMap);
}

export function resolveAoOverrideMaterial({ drawMaterial, sceneOverrideMaterial, overrideMaterials }) {
    const mats = overrideMaterials instanceof Set ? overrideMaterials : null;
    if (!mats || mats.size === 0) return null;
    if (drawMaterial && mats.has(drawMaterial)) return drawMaterial;
    if (sceneOverrideMaterial && mats.has(sceneOverrideMaterial)) return sceneOverrideMaterial;
    return null;
}

export function primeAoOverrideMaterial(material, whiteTexture) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat?.isMaterial) return;

    let needsUpdate = false;
    if ('transparent' in mat && mat.transparent !== false) {
        mat.transparent = false;
        needsUpdate = true;
    }
    if ('depthWrite' in mat && mat.depthWrite !== true) {
        mat.depthWrite = true;
        needsUpdate = true;
    }
    if (!((Number(mat.alphaTest) || 0) > 0)) {
        mat.alphaTest = 0.0001;
        needsUpdate = true;
    }

    if (mat.map !== whiteTexture) {
        mat.map = whiteTexture;
        needsUpdate = true;
    }
    if (mat.alphaMap !== whiteTexture) {
        mat.alphaMap = whiteTexture;
        needsUpdate = true;
    }

    if (needsUpdate) mat.needsUpdate = true;
}

export function applyAoAlphaHandlingToMaterial({
    overrideMaterial,
    sourceMaterial,
    object,
    handling,
    threshold,
    whiteTexture
}) {
    const mat = overrideMaterial && typeof overrideMaterial === 'object' ? overrideMaterial : null;
    if (!mat?.isMaterial) return;

    const src = sourceMaterial && typeof sourceMaterial === 'object' ? sourceMaterial : null;
    const mode = String(handling ?? 'alpha_test').toLowerCase();
    const t = Number.isFinite(Number(threshold))
        ? Math.max(0.01, Math.min(0.99, Number(threshold)))
        : 0.5;

    mat.map = whiteTexture;
    mat.alphaMap = whiteTexture;
    mat.alphaTest = 0.0001;

    if (!shouldApplyAoAlphaCutout(src, object)) return;

    if (mode === 'exclude') {
        mat.alphaTest = 1.1;
        return;
    }

    const sourceAlphaTest = Number(src?.alphaTest) || 0;
    const effectiveThreshold = sourceAlphaTest > 0 ? Math.max(t, sourceAlphaTest) : t;
    mat.map = src?.map ?? whiteTexture;
    mat.alphaMap = src?.alphaMap ?? whiteTexture;
    mat.alphaTest = effectiveThreshold;
}
