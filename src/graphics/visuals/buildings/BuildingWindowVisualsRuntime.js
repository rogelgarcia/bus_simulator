// src/graphics/visuals/buildings/BuildingWindowVisualsRuntime.js
// Applies reflective window-glass settings to existing building window meshes.
// @ts-check

function isObject(value) {
    return !!value && typeof value === 'object';
}

function isWithinWindowsGroup(obj) {
    let cur = obj;
    while (cur) {
        if (cur?.name === 'windows') return true;
        cur = cur?.parent ?? null;
    }
    return false;
}

function looksLikeWindowGlassMaterial(mat) {
    if (!isObject(mat)) return false;
    const ud = isObject(mat.userData) ? mat.userData : null;
    if (ud?.buildingWindowGlass === true) return true;

    const isPhysical = mat.isMeshPhysicalMaterial === true || mat.type === 'MeshPhysicalMaterial';
    if (!isPhysical) return false;
    if (mat.transparent !== true) return false;
    if (!mat.alphaMap || mat.alphaMap.isTexture !== true) return false;
    if (!(Number(mat.alphaTest) >= 0.49)) return false;
    if (mat.depthWrite !== false) return false;
    if (mat.polygonOffset !== true) return false;
    if (!(Number(mat.polygonOffsetFactor) <= -0.5)) return false;
    return true;
}

function applyGlassMaterialSettings(mat, settings, { iblEnabled, baseEnvMapIntensity }) {
    if (!isObject(mat)) return;
    if (!('envMapIntensity' in mat)) return;

    const reflective = isObject(settings?.reflective) ? settings.reflective : {};
    const glass = isObject(reflective?.glass) ? reflective.glass : {};

    const colorHex = Number.isFinite(glass.colorHex) ? ((Number(glass.colorHex) >>> 0) & 0xffffff) : 0xffffff;
    const metalness = Number.isFinite(glass.metalness) ? Math.max(0, Math.min(1, Number(glass.metalness))) : 0.0;
    const roughness = Number.isFinite(glass.roughness) ? Math.max(0, Math.min(1, Number(glass.roughness))) : 0.02;
    const transmission = Number.isFinite(glass.transmission) ? Math.max(0, Math.min(1, Number(glass.transmission))) : 0.0;
    const ior = Number.isFinite(glass.ior) ? Math.max(1, Math.min(2.5, Number(glass.ior))) : 1.5;
    const envMapIntensityScale = Number.isFinite(glass.envMapIntensity) ? Math.max(0, Number(glass.envMapIntensity)) : 4.0;

    const wantsTransmission = transmission > 0.01;
    const opacity = wantsTransmission ? 1.0 : 0.85;

    if (mat.color?.setHex) mat.color.setHex(colorHex);
    if ('metalness' in mat) mat.metalness = metalness;
    if ('roughness' in mat) mat.roughness = roughness;
    if ('transmission' in mat) mat.transmission = wantsTransmission ? transmission : 0.0;
    if ('ior' in mat) mat.ior = ior;
    if ('opacity' in mat) mat.opacity = opacity;

    mat.transparent = true;
    mat.alphaTest = 0.5;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    if ('polygonOffsetFactor' in mat) mat.polygonOffsetFactor = -1;
    if ('polygonOffsetUnits' in mat) mat.polygonOffsetUnits = -1;

    const ud = isObject(mat.userData) ? mat.userData : (mat.userData = {});
    ud.buildingWindowGlass = true;
    delete ud.iblNoAutoEnvMapIntensity;
    delete ud.iblEnvMapIntensity;
    ud.iblEnvMapIntensityScale = envMapIntensityScale;

    const base = Number.isFinite(baseEnvMapIntensity) ? Number(baseEnvMapIntensity) : 0.25;
    const intensity = iblEnabled ? base * envMapIntensityScale : 0.0;
    mat.envMapIntensity = intensity;
    ud._iblAutoEnvMapIntensity = intensity;
    mat.needsUpdate = true;
}

export function applyBuildingWindowVisualsToCityMeshes(root, settings, { iblEnabled = false, baseEnvMapIntensity = 0.25 } = {}) {
    if (!root?.traverse) return { glassMeshes: 0, glassMaterials: 0 };

    const reflective = isObject(settings?.reflective) ? settings.reflective : {};
    const reflectiveEnabled = reflective.enabled !== undefined ? !!reflective.enabled : true;

    /** @type {Set<any>} */
    const glassMaterials = new Set();
    let glassMeshes = 0;

    root.traverse((obj) => {
        if (!obj?.isMesh) return;
        if (!isWithinWindowsGroup(obj)) return;

        const material = obj.material ?? null;
        const mats = Array.isArray(material) ? material : [material];
        let hasGlass = false;
        for (const mat of mats) {
            if (!looksLikeWindowGlassMaterial(mat)) continue;
            hasGlass = true;
            glassMaterials.add(mat);
        }
        if (!hasGlass) return;
        obj.visible = reflectiveEnabled;
        glassMeshes++;
    });

    for (const mat of glassMaterials) {
        applyGlassMaterialSettings(mat, settings, { iblEnabled, baseEnvMapIntensity });
    }

    return { glassMeshes, glassMaterials: glassMaterials.size };
}

