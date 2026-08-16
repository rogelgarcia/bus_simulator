// src/graphics/assets3d/generators/building_fabrication/BuildingGeometryMerger.js
// Collapses a fabricated building's many small meshes into a few merged meshes.
//
// Fabricated buildings emit one mesh per decoration segment, cap and window part
// (hundreds per building, ~8 triangles each), so the cost is draw calls rather
// than geometry. This pass deduplicates structurally identical materials and
// merges everything sharing a material into a single mesh, in building-local
// space, before the building is ever rendered.
//
// Not for the authoring path: BuildingFabrication2 and the wall decoration
// debugger need the individual meshes to pick and highlight bays/decorations.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEXTURE_SLOTS = Object.freeze([
    'map',
    'normalMap',
    'aoMap',
    'roughnessMap',
    'metalnessMap',
    'alphaMap',
    'emissiveMap',
    'bumpMap',
    'displacementMap',
    'envMap',
    'lightMap'
]);

const NUMERIC_PROPS = Object.freeze([
    'roughness',
    'metalness',
    'emissiveIntensity',
    'opacity',
    'alphaTest',
    'side',
    'shadowSide',
    'blending',
    'envMapIntensity',
    'normalScale',
    'aoMapIntensity',
    'lightMapIntensity',
    'displacementScale',
    'bumpScale',
    'reflectivity',
    'ior',
    'transmission',
    'clearcoat',
    'sheen',
    'polygonOffsetFactor',
    'polygonOffsetUnits'
]);

const BOOL_PROPS = Object.freeze([
    'transparent',
    'depthTest',
    'depthWrite',
    'polygonOffset',
    'flatShading',
    'vertexColors',
    'fog',
    'wireframe',
    'premultipliedAlpha',
    'toneMapped'
]);

function colorKey(color) {
    return color && typeof color.getHexString === 'function' ? color.getHexString() : '-';
}

function textureKey(texture) {
    return texture && texture.isTexture ? texture.uuid : '-';
}

/**
 * Deterministic deep serialization (sorted keys) used for material metadata that
 * drives shading, e.g. `userData.uvTilingConfig` / `userData.materialVariationConfig`.
 * Anything it cannot serialize yields a unique token, so materials fall apart
 * into separate buckets rather than being wrongly treated as equal.
 */
function stableStringify(value, depth = 0) {
    if (depth > 8) return '__deep';
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return JSON.stringify(value);
    if (type === 'function' || type === 'symbol') return `__${type}:${Math.random()}`;
    if (type !== 'object') return String(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item, depth + 1)).join(',')}]`;
    }
    if (value.isTexture) return `tex:${value.uuid}`;
    if (typeof value.getHexString === 'function') return `color:${value.getHexString()}`;
    let keys;
    try {
        keys = Object.keys(value).sort();
    } catch {
        return `__unreadable:${Math.random()}`;
    }
    return `{${keys.map((key) => `${key}:${stableStringify(value[key], depth + 1)}`).join(',')}}`;
}

function safeUserDataKey(userData) {
    if (!userData || typeof userData !== 'object') return '-';
    try {
        return stableStringify(userData);
    } catch {
        return `__unserializable:${Math.random()}`;
    }
}

function definesKey(material) {
    const defines = /** @type {any} */ (material).defines;
    if (!defines || typeof defines !== 'object') return '-';
    try {
        return stableStringify(defines);
    } catch {
        return `__unserializable:${Math.random()}`;
    }
}

/**
 * True when the material injects custom shader code. Such a closure can capture
 * state we cannot inspect, so those materials are never deduplicated across
 * instances (meshes sharing one instance still merge).
 */
function hasCustomShaderHook(material) {
    if (!material) return false;
    const proto = Object.getPrototypeOf(material) ?? null;
    const fn = material.onBeforeCompile;
    if (typeof fn === 'function' && proto && fn !== proto.onBeforeCompile) return true;
    const cacheKeyFn = material.customProgramCacheKey;
    if (typeof cacheKeyFn === 'function' && proto && cacheKeyFn !== proto.customProgramCacheKey) return true;
    return false;
}

/**
 * Identity of a material for deduplication: two materials with the same key
 * render identically and can share one instance.
 * @param {THREE.Material} material
 * @returns {string}
 */
export function computeMaterialIdentityKey(material) {
    if (!material) return 'null';
    // Custom shader injection (wall UV tiling / material variation) can depend on
    // captured state we cannot compare; keep those instances distinct.
    if (hasCustomShaderHook(material)) return `unique:${material.uuid}`;
    const parts = [material.type];
    parts.push(`color:${colorKey(/** @type {any} */ (material).color)}`);
    parts.push(`emissive:${colorKey(/** @type {any} */ (material).emissive)}`);
    parts.push(`specular:${colorKey(/** @type {any} */ (material).specular)}`);
    parts.push(`sheenColor:${colorKey(/** @type {any} */ (material).sheenColor)}`);
    for (const prop of NUMERIC_PROPS) {
        const value = /** @type {any} */ (material)[prop];
        if (value === undefined) continue;
        if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
            parts.push(`${prop}:${value.x},${value.y}`);
            continue;
        }
        parts.push(`${prop}:${value}`);
    }
    for (const prop of BOOL_PROPS) {
        const value = /** @type {any} */ (material)[prop];
        if (value === undefined) continue;
        parts.push(`${prop}:${value ? 1 : 0}`);
    }
    for (const slot of TEXTURE_SLOTS) {
        const tex = /** @type {any} */ (material)[slot];
        if (tex === undefined) continue;
        parts.push(`${slot}:${textureKey(tex)}`);
    }
    parts.push(`defines:${definesKey(material)}`);
    parts.push(`userData:${safeUserDataKey(material.userData)}`);
    return parts.join('|');
}

function geometrySignature(geometry) {
    if (!geometry || !geometry.attributes) return null;
    const names = Object.keys(geometry.attributes).sort();
    if (!names.length) return null;
    const parts = [];
    for (const name of names) {
        const attr = geometry.attributes[name];
        if (!attr) continue;
        parts.push(`${name}:${attr.itemSize}:${attr.normalized ? 1 : 0}`);
    }
    parts.push(`indexed:${geometry.index ? 1 : 0}`);
    parts.push(`groups:${Array.isArray(geometry.groups) && geometry.groups.length > 1 ? 1 : 0}`);
    return parts.join('|');
}

function isMergeableMesh(object) {
    if (!object || !object.isMesh) return false;
    if (object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh) return false;
    if (Array.isArray(object.material)) return false;
    if (!object.material || !object.geometry) return false;
    const geometry = object.geometry;
    if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length) return false;
    if (!geometry.attributes?.position) return false;
    return true;
}

function hasMeaningfulUserData(object) {
    const userData = object?.userData;
    if (!userData || typeof userData !== 'object') return false;
    return Object.keys(userData).length > 0;
}

/**
 * Collect merge scopes: the root plus any descendant container that must keep
 * its identity (groups carrying userData). Meshes are attributed to their
 * nearest enclosing scope.
 */
function collectScopes(root, { preserveGroupsWithUserData }) {
    const scopes = [];

    const visit = (container) => {
        const scope = { container, meshes: [], keepChildren: [] };
        scopes.push(scope);

        const walk = (node) => {
            for (const child of node.children.slice()) {
                const isPreservedScope = child.isGroup === true
                    && preserveGroupsWithUserData
                    && hasMeaningfulUserData(child)
                    && child !== container;

                if (isPreservedScope) {
                    scope.keepChildren.push(child);
                    visit(child);
                    continue;
                }

                if (child.isMesh) {
                    if (isMergeableMesh(child)) scope.meshes.push(child);
                    else scope.keepChildren.push(child);
                    // A mesh may still parent further meshes.
                    if (child.children.length) walk(child);
                    continue;
                }

                if (child.isGroup || child.isObject3D) {
                    if (child.isLight || child.isCamera || child.isLine || child.isPoints || child.isSprite) {
                        scope.keepChildren.push(child);
                        continue;
                    }
                    walk(child);
                    continue;
                }

                scope.keepChildren.push(child);
            }
        };

        walk(container);
    };

    visit(root);
    return scopes;
}

function bucketKeyFor(mesh, materialKey, geoSig) {
    return [
        materialKey,
        geoSig,
        `cast:${mesh.castShadow ? 1 : 0}`,
        `recv:${mesh.receiveShadow ? 1 : 0}`,
        `order:${mesh.renderOrder ?? 0}`,
        `visible:${mesh.visible ? 1 : 0}`,
        `layers:${mesh.layers?.mask ?? 1}`,
        // Mesh-level flags read by per-object passes (the post-processing AO
        // exclusion mask keys on these), so meshes differing here must not share
        // a merged mesh. Deliberately narrow: bucketing on all userData would
        // split on authoring metadata that has no rendering effect.
        `aoExcl:${mesh.userData?.excludeFromAmbientOcclusion === true ? 1 : 0}`,
        `foliage:${mesh.userData?.isFoliage === true ? 1 : 0}`
    ].join('||');
}

/**
 * Merge a built building group in place.
 *
 * Bakes each mesh's transform relative to its merge scope, so the merged mesh
 * sits at the scope's origin with identity transform.
 *
 * @param {THREE.Object3D} root building group produced by the fabrication generator
 * @param {object} [options]
 * @param {boolean} [options.preserveGroupsWithUserData=true]
 * @param {number} [options.minBucketSize=2] buckets smaller than this stay unmerged
 * @param {Map<string, THREE.Material>} [options.materialCache] shared across buildings
 * @returns {{merged: number, sourceMeshes: number, resultMeshes: number, materialsBefore: number, materialsAfter: number, failedBuckets: number}}
 */
export function mergeBuildingGroupGeometry(root, options = {}) {
    const {
        preserveGroupsWithUserData = true,
        minBucketSize = 2,
        materialCache = null,
        dedupeMaterials = true
    } = options;

    const stats = {
        merged: 0,
        sourceMeshes: 0,
        resultMeshes: 0,
        materialsBefore: 0,
        materialsAfter: 0,
        failedBuckets: 0
    };
    if (!root || typeof root.traverse !== 'function') return stats;

    root.updateMatrixWorld(true);

    const materialsBefore = new Set();
    root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m) materialsBefore.add(m.uuid);
    });
    stats.materialsBefore = materialsBefore.size;

    const canonicalMaterials = materialCache instanceof Map ? materialCache : new Map();
    const canonicalize = (material) => {
        if (!dedupeMaterials) return material;
        const key = computeMaterialIdentityKey(material);
        const existing = canonicalMaterials.get(key);
        if (existing) return existing;
        canonicalMaterials.set(key, material);
        return material;
    };
    const identityKeyFor = (material) => (dedupeMaterials
        ? computeMaterialIdentityKey(material)
        : `instance:${material?.uuid ?? 'null'}`);

    const scopes = collectScopes(root, { preserveGroupsWithUserData });
    const scopeInverse = new THREE.Matrix4();
    const relative = new THREE.Matrix4();
    const materialsAfter = new Set();

    for (const scope of scopes) {
        const { container, meshes } = scope;
        if (!meshes.length) continue;
        stats.sourceMeshes += meshes.length;

        container.updateMatrixWorld(true);
        scopeInverse.copy(container.matrixWorld).invert();

        /** @type {Map<string, {material: THREE.Material, sample: THREE.Mesh, geometries: THREE.BufferGeometry[], sources: THREE.Mesh[]}>} */
        const buckets = new Map();

        for (const mesh of meshes) {
            const geoSig = geometrySignature(mesh.geometry);
            if (!geoSig) {
                scope.keepChildren.push(mesh);
                continue;
            }
            const material = canonicalize(mesh.material);
            const key = bucketKeyFor(mesh, identityKeyFor(material), geoSig);
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { material, sample: mesh, geometries: [], sources: [] };
                buckets.set(key, bucket);
            }
            mesh.updateMatrixWorld(true);
            relative.multiplyMatrices(scopeInverse, mesh.matrixWorld);
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(relative);
            // Merged geometry is static; drop caches that no longer describe it.
            geometry.boundingBox = null;
            geometry.boundingSphere = null;
            bucket.geometries.push(geometry);
            bucket.sources.push(mesh);
        }

        // Detach every source mesh; merged results (and non-mergeable keepers)
        // are re-attached to the scope container below.
        for (const mesh of meshes) {
            if (mesh.parent) mesh.parent.remove(mesh);
        }
        for (const keeper of scope.keepChildren) {
            if (keeper.parent !== container) {
                if (keeper.parent) keeper.parent.remove(keeper);
                container.add(keeper);
            }
        }
        // Drop now-empty anonymous groups left behind by flattening.
        for (const child of container.children.slice()) {
            if (child.isGroup && child.children.length === 0 && !hasMeaningfulUserData(child)) {
                container.remove(child);
            }
        }

        let index = 0;
        for (const bucket of buckets.values()) {
            const { material, sample, geometries, sources } = bucket;

            if (geometries.length < Math.max(1, minBucketSize)) {
                // Not worth merging: restore the originals with their material canonicalized.
                for (const geometry of geometries) geometry.dispose();
                for (const source of sources) {
                    source.material = material;
                    container.add(source);
                    stats.resultMeshes += 1;
                    materialsAfter.add(material.uuid);
                }
                continue;
            }

            let mergedGeometry = null;
            try {
                mergedGeometry = mergeGeometries(geometries, false);
            } catch {
                mergedGeometry = null;
            }

            if (!mergedGeometry) {
                stats.failedBuckets += 1;
                for (const geometry of geometries) geometry.dispose();
                for (const source of sources) {
                    source.material = material;
                    container.add(source);
                    stats.resultMeshes += 1;
                    materialsAfter.add(material.uuid);
                }
                continue;
            }

            for (const geometry of geometries) geometry.dispose();

            const merged = new THREE.Mesh(mergedGeometry, material);
            merged.name = `${container.name || 'building'}_merged_${index++}`;
            merged.castShadow = sample.castShadow;
            merged.receiveShadow = sample.receiveShadow;
            merged.renderOrder = sample.renderOrder ?? 0;
            merged.visible = sample.visible;
            merged.layers.mask = sample.layers?.mask ?? merged.layers.mask;
            merged.matrixAutoUpdate = false;
            merged.updateMatrix();
            merged.userData = {
                ...(sample.userData && typeof sample.userData === 'object' ? sample.userData : {}),
                buildingMergedMeshCount: sources.length
            };
            container.add(merged);

            stats.merged += sources.length;
            stats.resultMeshes += 1;
            materialsAfter.add(material.uuid);
        }
    }

    stats.materialsAfter = materialsAfter.size;
    root.updateMatrixWorld(true);
    return stats;
}

export default mergeBuildingGroupGeometry;
