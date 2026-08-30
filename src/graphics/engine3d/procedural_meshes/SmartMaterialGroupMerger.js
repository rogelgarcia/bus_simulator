// Collapses compatible material groups on one mesh into one physical material.
// The pass is content-agnostic: compatibility is inferred only from geometry
// groups and material rendering properties.
// @ts-check
import * as THREE from 'three';
import { applySmartMaterialGroupShader } from '../../shaders/materials/SmartMaterialGroupShader.js';

export const SMART_MATERIAL_GROUP_ATTRIBUTE = Object.freeze({
    SURFACE: 'smartMaterialSurface',
    EMISSIVE: 'smartMaterialEmissive',
    CLEARCOAT: 'smartMaterialClearcoat',
    MAP_WEIGHT: 'smartMaterialMapWeight'
});

const UNSUPPORTED_TEXTURE_SLOTS = Object.freeze([
    'alphaMap',
    'aoMap',
    'bumpMap',
    'clearcoatMap',
    'clearcoatNormalMap',
    'clearcoatRoughnessMap',
    'displacementMap',
    'emissiveMap',
    'lightMap',
    'metalnessMap',
    'normalMap',
    'roughnessMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'specularColorMap',
    'specularIntensityMap',
    'thicknessMap',
    'transmissionMap',
    'iridescenceMap',
    'iridescenceThicknessMap',
    'anisotropyMap'
]);

const COMMON_RENDER_PROPS = Object.freeze([
    'alphaHash',
    'alphaTest',
    'alphaToCoverage',
    'blending',
    'blendDst',
    'blendDstAlpha',
    'blendEquation',
    'blendEquationAlpha',
    'blendSrc',
    'blendSrcAlpha',
    'clipIntersection',
    'clipShadows',
    'colorWrite',
    'depthFunc',
    'depthTest',
    'depthWrite',
    'dithering',
    'flatShading',
    'fog',
    'forceSinglePass',
    'opacity',
    'polygonOffset',
    'polygonOffsetFactor',
    'polygonOffsetUnits',
    'premultipliedAlpha',
    'shadowSide',
    'side',
    'stencilFail',
    'stencilFunc',
    'stencilFuncMask',
    'stencilRef',
    'stencilWrite',
    'stencilWriteMask',
    'stencilZFail',
    'stencilZPass',
    'toneMapped',
    'transparent',
    'visible',
    'wireframe',
    'wireframeLinecap',
    'wireframeLinejoin',
    'wireframeLinewidth'
]);

const COMMON_PHYSICAL_PROPS = Object.freeze([
    'envMap',
    'envMapIntensity',
    'ior',
    'reflectivity',
    'specularIntensity'
]);

const COPY_PROPS = Object.freeze([...COMMON_RENDER_PROPS, ...COMMON_PHYSICAL_PROPS]);

function numeric(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
}

function sameValue(a, b) {
    if (a === b) return true;
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= 1e-8;
    if (a?.isColor && b?.isColor) return a.equals(b);
    if (a?.isTexture && b?.isTexture) return a.uuid === b.uuid;
    return false;
}

function resolvedPhysicalProp(material, prop) {
    if (material?.[prop] !== undefined) return material[prop];
    if (prop === 'ior') return 1.5;
    if (prop === 'reflectivity') return 0.5;
    if (prop === 'specularIntensity') return 1.0;
    if (prop === 'envMapIntensity') return 1.0;
    return null;
}

function hasCustomShaderHook(material) {
    const proto = Object.getPrototypeOf(material) ?? null;
    if (!proto) return true;
    if (typeof material.onBeforeCompile === 'function' && material.onBeforeCompile !== proto.onBeforeCompile) return true;
    return typeof material.customProgramCacheKey === 'function'
        && material.customProgramCacheKey !== proto.customProgramCacheKey;
}

function hasUnsupportedPhysicalFeature(material) {
    const nonZero = [
        'anisotropy',
        'dispersion',
        'iridescence',
        'sheen',
        'thickness',
        'transmission'
    ];
    if (nonZero.some((prop) => numeric(material?.[prop], 0) > 1e-8)) return true;
    if (material?.specularColor?.isColor && !material.specularColor.equals(new THREE.Color(0xffffff))) return true;
    return false;
}

function inspectMaterials(materials) {
    if (materials.length < 2) return { compatible: false, reason: 'single_material' };
    const first = materials[0];
    if (!first) return { compatible: false, reason: 'missing_material' };

    let commonMap = null;
    for (const material of materials) {
        if (!material?.isMeshStandardMaterial) return { compatible: false, reason: 'unsupported_material_type' };
        if (material.vertexColors === true) return { compatible: false, reason: 'source_vertex_colors' };
        if (hasCustomShaderHook(material)) return { compatible: false, reason: 'custom_shader_hook' };
        if (hasUnsupportedPhysicalFeature(material)) return { compatible: false, reason: 'unsupported_physical_feature' };
        if (Array.isArray(material.clippingPlanes) && material.clippingPlanes.length) {
            return { compatible: false, reason: 'clipping_planes' };
        }
        const customDefines = Object.keys(material.defines ?? {})
            .filter((name) => name !== 'STANDARD' && name !== 'PHYSICAL');
        if (customDefines.length) return { compatible: false, reason: 'custom_defines' };
        for (const slot of UNSUPPORTED_TEXTURE_SLOTS) {
            if (material[slot]) return { compatible: false, reason: `unsupported_texture:${slot}` };
        }
        if (material.map) {
            if (commonMap && material.map.uuid !== commonMap.uuid) {
                return { compatible: false, reason: 'multiple_color_maps' };
            }
            commonMap = material.map;
        }
    }

    for (const prop of COMMON_RENDER_PROPS) {
        const expected = first[prop];
        if (materials.some((material) => !sameValue(material[prop], expected))) {
            return { compatible: false, reason: `render_state_mismatch:${prop}` };
        }
    }
    for (const prop of COMMON_PHYSICAL_PROPS) {
        const expected = resolvedPhysicalProp(first, prop);
        if (materials.some((material) => !sameValue(resolvedPhysicalProp(material, prop), expected))) {
            return { compatible: false, reason: `physical_state_mismatch:${prop}` };
        }
    }

    return { compatible: true, reason: 'compatible', commonMap };
}

function inspectGeometry(mesh, materials) {
    if (!mesh?.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) {
        return { compatible: false, reason: 'unsupported_mesh_type' };
    }
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute?.('position') ?? null;
    if (!geometry?.isBufferGeometry || !position) return { compatible: false, reason: 'missing_geometry' };
    if (geometry.getAttribute('color')) return { compatible: false, reason: 'existing_color_attribute' };
    if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length) {
        return { compatible: false, reason: 'morph_attributes' };
    }
    const groups = Array.isArray(geometry.groups) ? geometry.groups : [];
    if (groups.length < 2) return { compatible: false, reason: 'single_group' };

    const elementCount = geometry.index?.count ?? position.count;
    const slots = new Int32Array(elementCount);
    slots.fill(-1);
    for (const group of groups) {
        const start = Number(group?.start);
        const count = Number(group?.count);
        const materialIndex = Number(group?.materialIndex);
        if (!Number.isInteger(start) || !Number.isInteger(count) || count <= 0
            || start < 0 || start + count > elementCount
            || !Number.isInteger(materialIndex) || materialIndex < 0 || materialIndex >= materials.length) {
            return { compatible: false, reason: 'invalid_group' };
        }
        for (let index = start; index < start + count; index += 1) {
            if (slots[index] !== -1) return { compatible: false, reason: 'overlapping_groups' };
            slots[index] = materialIndex;
        }
    }
    for (let index = 0; index < slots.length; index += 1) {
        if (slots[index] < 0) return { compatible: false, reason: 'incomplete_group_coverage' };
    }

    const vertexSlots = new Int32Array(position.count);
    vertexSlots.fill(-1);
    let requiresExpansion = false;
    for (let elementIndex = 0; elementIndex < slots.length; elementIndex += 1) {
        const vertexIndex = geometry.index ? geometry.index.getX(elementIndex) : elementIndex;
        const materialIndex = slots[elementIndex];
        if (vertexSlots[vertexIndex] === -1) vertexSlots[vertexIndex] = materialIndex;
        else if (vertexSlots[vertexIndex] !== materialIndex) requiresExpansion = true;
    }
    for (let vertexIndex = 0; vertexIndex < vertexSlots.length; vertexIndex += 1) {
        if (vertexSlots[vertexIndex] < 0) vertexSlots[vertexIndex] = 0;
    }

    return {
        compatible: true,
        reason: 'compatible',
        slots,
        vertexSlots,
        requiresExpansion,
        elementCount
    };
}

export function analyzeSmartMaterialGroupMerge(mesh) {
    const materials = Array.isArray(mesh?.material) ? mesh.material.slice() : [];
    if (materials.length > 65535) {
        return { compatible: false, reason: 'too_many_materials', sourceMaterialCount: materials.length };
    }
    const materialCheck = inspectMaterials(materials);
    if (!materialCheck.compatible) return { ...materialCheck, sourceMaterialCount: materials.length };
    if (materialCheck.commonMap && !mesh.geometry?.getAttribute?.('uv')) {
        return { compatible: false, reason: 'mapped_geometry_without_uv', sourceMaterialCount: materials.length };
    }
    const geometryCheck = inspectGeometry(mesh, materials);
    return {
        ...geometryCheck,
        commonMap: materialCheck.commonMap ?? null,
        sourceMaterialCount: materials.length
    };
}

function copyCommonProperties(target, source) {
    for (const prop of COPY_PROPS) {
        const value = COMMON_PHYSICAL_PROPS.includes(prop) ? resolvedPhysicalProp(source, prop) : source[prop];
        if (value === undefined || !(prop in target)) continue;
        if (target[prop]?.isColor && value?.isColor) target[prop].copy(value);
        else target[prop] = value;
    }
}

function materialFingerprint(material) {
    const color = material?.color;
    const emissive = material?.emissive;
    return [
        color?.r ?? 1,
        color?.g ?? 1,
        color?.b ?? 1,
        emissive?.r ?? 0,
        emissive?.g ?? 0,
        emissive?.b ?? 0,
        numeric(material?.roughness, 1),
        numeric(material?.metalness, 0),
        numeric(material?.emissiveIntensity, 1),
        numeric(material?.clearcoat, 0),
        numeric(material?.clearcoatRoughness, 0),
        material?.map?.uuid ?? '-'
    ].join(',');
}

function createMergedMaterial(mesh, materials, commonMap) {
    const first = materials[0];
    const hasClearcoat = materials.some((material) => numeric(material?.clearcoat, 0) > 1e-8);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.0,
        map: commonMap,
        metalness: 0,
        roughness: 1,
        clearcoat: hasClearcoat ? 1 : 0,
        clearcoatRoughness: 1,
        vertexColors: true
    });
    material.name = `${mesh.name || 'mesh'}:smart-material-groups`;
    copyCommonProperties(material, first);
    material.vertexColors = true;
    material.map = commonMap;
    material.color.set(0xffffff);
    material.emissive.set(0xffffff);
    material.emissiveIntensity = 1.0;
    material.roughness = 1.0;
    material.metalness = 0.0;
    material.clearcoat = hasClearcoat ? 1.0 : 0.0;
    material.clearcoatRoughness = 1.0;
    applySmartMaterialGroupShader(material);
    return material;
}

function installAttributes(geometry, vertexMaterialSlots) {
    const vertexCount = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    geometry.setAttribute(
        SMART_MATERIAL_GROUP_ATTRIBUTE.SURFACE,
        new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3)
    );
    geometry.setAttribute(
        SMART_MATERIAL_GROUP_ATTRIBUTE.EMISSIVE,
        new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3)
    );
    geometry.setAttribute(
        SMART_MATERIAL_GROUP_ATTRIBUTE.CLEARCOAT,
        new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2)
    );
    geometry.setAttribute(
        SMART_MATERIAL_GROUP_ATTRIBUTE.MAP_WEIGHT,
        new THREE.BufferAttribute(new Float32Array(vertexCount), 1)
    );
    geometry.clearGroups();
    return vertexMaterialSlots;
}

function geometryBufferBytes(geometry) {
    let bytes = geometry?.index?.array?.byteLength ?? 0;
    for (const attribute of Object.values(geometry?.attributes ?? {})) {
        bytes += attribute?.array?.byteLength ?? 0;
    }
    return bytes;
}

function syncAttributes(state, { force = false } = {}) {
    const fingerprints = state.sourceMaterials.map(materialFingerprint);
    if (!force && fingerprints.every((value, index) => value === state.fingerprints[index])) return false;

    const materialCheck = inspectMaterials(state.sourceMaterials);
    if (!materialCheck.compatible) {
        state.lastSyncError = materialCheck.reason;
        return false;
    }

    const geometry = state.mesh.geometry;
    if (materialCheck.commonMap && !geometry.getAttribute('uv')) {
        state.lastSyncError = 'mapped_geometry_without_uv';
        return false;
    }
    const color = geometry.getAttribute('color');
    const surface = geometry.getAttribute(SMART_MATERIAL_GROUP_ATTRIBUTE.SURFACE);
    const emissive = geometry.getAttribute(SMART_MATERIAL_GROUP_ATTRIBUTE.EMISSIVE);
    const clearcoat = geometry.getAttribute(SMART_MATERIAL_GROUP_ATTRIBUTE.CLEARCOAT);
    const mapWeight = geometry.getAttribute(SMART_MATERIAL_GROUP_ATTRIBUTE.MAP_WEIGHT);
    for (let vertexIndex = 0; vertexIndex < state.vertexMaterialSlots.length; vertexIndex += 1) {
        const material = state.sourceMaterials[state.vertexMaterialSlots[vertexIndex]];
        color.setXYZ(vertexIndex, material.color?.r ?? 1, material.color?.g ?? 1, material.color?.b ?? 1);
        surface.setXYZ(
            vertexIndex,
            numeric(material.roughness, 1),
            numeric(material.metalness, 0),
            numeric(material.emissiveIntensity, 1)
        );
        emissive.setXYZ(
            vertexIndex,
            material.emissive?.r ?? 0,
            material.emissive?.g ?? 0,
            material.emissive?.b ?? 0
        );
        clearcoat.setXY(
            vertexIndex,
            numeric(material.clearcoat, 0),
            numeric(material.clearcoatRoughness, 0)
        );
        mapWeight.setX(vertexIndex, material.map ? 1 : 0);
    }
    color.needsUpdate = true;
    surface.needsUpdate = true;
    emissive.needsUpdate = true;
    clearcoat.needsUpdate = true;
    mapWeight.needsUpdate = true;

    const mapChanged = state.material.map !== materialCheck.commonMap;
    state.material.map = materialCheck.commonMap ?? null;
    const wantsClearcoat = state.sourceMaterials.some((material) => numeric(material?.clearcoat, 0) > 1e-8);
    const clearcoatChanged = (state.material.clearcoat > 1e-8) !== wantsClearcoat;
    state.material.clearcoat = wantsClearcoat ? 1.0 : 0.0;
    if (mapChanged || clearcoatChanged) state.material.needsUpdate = true;
    state.fingerprints = fingerprints;
    state.lastSyncError = null;
    return true;
}

export function mergeCompatibleMaterialGroups(mesh, { disposeSourceGeometry = false } = {}) {
    const analysis = analyzeSmartMaterialGroupMerge(mesh);
    if (!analysis.compatible) return { merged: false, ...analysis };

    const sourceGeometry = mesh.geometry;
    const sourceMaterials = mesh.material.slice();
    const geometry = analysis.requiresExpansion && sourceGeometry.index
        ? sourceGeometry.toNonIndexed()
        : sourceGeometry.clone();
    const vertexMaterialSlots = new Uint16Array(
        analysis.requiresExpansion ? analysis.slots : analysis.vertexSlots
    );
    installAttributes(geometry, vertexMaterialSlots);
    geometry.boundingBox = sourceGeometry.boundingBox?.clone?.() ?? null;
    geometry.boundingSphere = sourceGeometry.boundingSphere?.clone?.() ?? null;

    const material = createMergedMaterial(mesh, sourceMaterials, analysis.commonMap);
    const previousOnBeforeRender = typeof mesh.onBeforeRender === 'function'
        ? mesh.onBeforeRender.bind(mesh)
        : null;
    const state = {
        mesh,
        material,
        sourceMaterials,
        vertexMaterialSlots,
        fingerprints: [],
        lastSyncError: null,
        sync: (options = {}) => syncAttributes(state, options)
    };

    mesh.geometry = geometry;
    mesh.material = material;
    mesh.userData = mesh.userData ?? {};
    mesh.userData.smartMaterialGroupMerge = state;
    mesh.onBeforeRender = (...args) => {
        state.sync();
        previousOnBeforeRender?.(...args);
    };
    state.sync({ force: true });

    const triangleCount = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    const addedAttributeBytes = geometry.getAttribute('position').count * (3 + 3 + 2 + 1) * 4;
    const sourceGeometryBytes = geometryBufferBytes(sourceGeometry);
    const outputGeometryBytes = geometryBufferBytes(geometry);
    if (disposeSourceGeometry) sourceGeometry.dispose();
    return {
        merged: true,
        compatible: true,
        reason: 'merged',
        sourceMaterialCount: sourceMaterials.length,
        outputMaterialCount: 1,
        triangleCount,
        addedAttributeBytes,
        sourceGeometryBytes,
        outputGeometryBytes,
        geometryByteDelta: outputGeometryBytes - sourceGeometryBytes,
        expandedToNonIndexed: analysis.requiresExpansion === true,
        state
    };
}

export default mergeCompatibleMaterialGroups;
