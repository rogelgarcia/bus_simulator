// Isolated Grass Lab comparison fixture for historical/current surfaces and the V2 atlas families.

import * as THREE from 'three';
import { applyResolvedPbrToStandardMaterial } from '../../content3d/materials/PbrTexturePipeline.js';
import {
    LOW_CUT_GRASS_ASSET_FAMILY,
    LOW_CUT_GRASS_ATLAS_ROLE,
    LOW_CUT_GRASS_LOCAL_OVERRIDES,
    LOW_CUT_GRASS_MATERIAL_ID,
    LOW_CUT_GRASS_SHADER_DEFAULTS,
    LOW_CUT_GRASS_SOURCE_MATERIAL_ID,
    LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID,
    LOW_CUT_GRASS_V1_ASSET_FAMILY,
    LOW_CUT_GRASS_V1_MATERIAL_ID
} from '../../content3d/catalogs/LowCutGrassMaterialCatalog.js';
import { applyGrassAtlasPreviewShader } from '../../engine3d/grass/GrassMidClusterSystem.js';
import { applyLowCutGrassCarpetMaterial, updateLowCutGrassCarpetMaterial } from '../../engine3d/grass/LowCutGrassCarpetMaterialSystem.js';

function ensureUv2(geometry) {
    const uv = geometry?.getAttribute?.('uv') ?? null;
    if (!uv || geometry.getAttribute('uv2')) return;
    geometry.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
}

function collectPayloadTextures(payload, output) {
    const target = output instanceof Set ? output : new Set();
    for (const texture of Object.values(payload?.textures ?? {})) {
        if (texture?.isTexture) target.add(texture);
    }
    for (const texture of Object.values(payload?.auxiliaryTextures ?? {})) {
        if (texture?.isTexture) target.add(texture);
    }
    return target;
}

export class GrassMaterialFixture {
    constructor({ scene, resolveMaterial, position = null } = {}) {
        if (!scene?.isScene) throw new Error('[GrassMaterialFixture] A THREE.Scene is required.');
        if (typeof resolveMaterial !== 'function') throw new Error('[GrassMaterialFixture] A shared PBR resolver is required.');
        this._scene = scene;
        this._resolveMaterial = resolveMaterial;
        this._group = new THREE.Group();
        this._group.name = 'GrassMaterialFixture';
        this._group.position.set(Number(position?.x) || -36, Number(position?.y) || 0.03, Number(position?.z) || -128);
        this._materials = [];
        this._geometries = [];
        this._matchedMaterial = null;
        this._atlasPayloads = new Map();
        this._atlasPreviewMaterials = new Map();
        this._materialVersion = 'v2';
        this._build();
        this._group.visible = false;
        scene.add(this._group);
    }

    _makeSurfaceMaterial(materialId, localOverrides = null) {
        const payload = this._resolveMaterial(materialId, {
            localOverrides,
            cloneTextures: true,
            uvSpace: 'unit',
            surfaceSizeMeters: { x: 6, y: 6 },
            diagnosticsTag: `GrassMaterialFixture.${materialId}`
        });
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
        applyResolvedPbrToStandardMaterial(material, payload);
        this._materials.push(material);
        return { material, payload };
    }

    _makeSurfaceSwatch(materialId, x, localOverrides = null) {
        const geometry = new THREE.PlaneGeometry(6, 6, 1, 1);
        ensureUv2(geometry);
        geometry.rotateX(-Math.PI * 0.5);
        this._geometries.push(geometry);
        const resolved = this._makeSurfaceMaterial(materialId, localOverrides);
        const mesh = new THREE.Mesh(geometry, resolved.material);
        mesh.position.set(x, 0.08, 1.5);
        mesh.receiveShadow = true;
        this._group.add(mesh);
        return resolved;
    }

    _applyAtlasPreviewMaterial(material, payload, role, version) {
        const isHistorical = version === 'v1';
        const family = isHistorical ? LOW_CUT_GRASS_V1_ASSET_FAMILY : LOW_CUT_GRASS_ASSET_FAMILY;
        const contract = isHistorical ? family.atlas : family.atlases[role];
        const channels = isHistorical
            ? { color: 'clusterColor', normal: 'clusterNormal', roughness: 'clusterRoughness', ao: 'clusterAo' }
            : contract.channels;
        const atlasTextures = payload?.auxiliaryTextures ?? {};
        const response = family.materialResponse;
        material.map = atlasTextures[channels.color] ?? null;
        material.alphaMap = channels.coverage ? (atlasTextures[channels.coverage] ?? null) : null;
        material.normalMap = atlasTextures[channels.normal] ?? null;
        material.roughnessMap = atlasTextures[channels.roughness] ?? null;
        material.aoMap = atlasTextures[channels.ao] ?? null;
        material.roughness = Number(response?.roughness) || LOW_CUT_GRASS_LOCAL_OVERRIDES.roughness;
        material.metalness = Number(response?.metalness) || 0;
        material.emissive?.set?.(response?.emissive ?? '#000000');
        material.emissiveIntensity = Number(response?.emissiveIntensity) || 0;
        material.emissiveMap = null;
        material.aoMapIntensity = Number(response?.aoIntensity) || 0;
        material.normalScale.setScalar(isHistorical ? 0.38 : LOW_CUT_GRASS_LOCAL_OVERRIDES.normalStrength);
        material.alphaTest = contract.alphaCutoff;
        material.alphaToCoverage = contract.alphaToCoverage;
        material.transparent = false;
        material.depthWrite = true;
        material.userData.resolvedMaterialId = isHistorical ? LOW_CUT_GRASS_V1_MATERIAL_ID : LOW_CUT_GRASS_MATERIAL_ID;
        material.userData.grassAtlasRole = role;
        applyGrassAtlasPreviewShader(material, contract);
        material.needsUpdate = true;
    }

    _makeAtlasPreview(payload, role, x) {
        const geometry = new THREE.PlaneGeometry(7.5, 3.6, 1, 1);
        ensureUv2(geometry);
        this._geometries.push(geometry);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: LOW_CUT_GRASS_LOCAL_OVERRIDES.roughness,
            metalness: 0,
            emissive: 0x000000,
            emissiveIntensity: 0,
            transparent: false,
            depthWrite: true,
            side: THREE.DoubleSide
        });
        material.name = `GrassMaterialFixture_${role}`;
        this._applyAtlasPreviewMaterial(material, payload, role, this._materialVersion);
        this._atlasPreviewMaterials.set(role, material);
        this._materials.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = role === LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
            ? 'NaturalGrassMidClusterAtlasPreview'
            : 'NaturalGrassAccentClumpAtlasPreview';
        mesh.position.set(x, 3.1, -3.25);
        mesh.castShadow = false;
        this._group.add(mesh);
    }

    _build() {
        const baseGeometry = new THREE.BoxGeometry(29, 0.3, 8.5);
        this._geometries.push(baseGeometry);
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x252a25, roughness: 0.92, metalness: 0 });
        this._materials.push(baseMaterial);
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(0, -0.13, 1.5);
        base.receiveShadow = true;
        this._group.add(base);

        this._makeSurfaceSwatch(LOW_CUT_GRASS_SOURCE_MATERIAL_ID, -10.5);
        const historical = this._makeSurfaceSwatch(LOW_CUT_GRASS_V1_MATERIAL_ID, -3.5, LOW_CUT_GRASS_LOCAL_OVERRIDES);
        const matched = this._makeSurfaceSwatch(LOW_CUT_GRASS_MATERIAL_ID, 3.5, LOW_CUT_GRASS_LOCAL_OVERRIDES);
        this._atlasPayloads.set('v1', historical.payload);
        this._atlasPayloads.set('v2', matched.payload);
        this._matchedMaterial = matched.material;
        applyLowCutGrassCarpetMaterial(this._matchedMaterial, LOW_CUT_GRASS_SHADER_DEFAULTS);
        this._makeSurfaceSwatch(LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID, 10.5);
        this._makeAtlasPreview(matched.payload, LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER, -4.1);
        this._makeAtlasPreview(matched.payload, LOW_CUT_GRASS_ATLAS_ROLE.ACCENT_CLUMP, 4.1);
    }

    setVisible(visible) {
        if (this._group) this._group.visible = visible === true;
    }

    updateMaterial(config) {
        if (this._matchedMaterial) updateLowCutGrassCarpetMaterial(this._matchedMaterial, config);
    }

    setMaterialVersion(version) {
        const next = String(version ?? '').trim().toLowerCase();
        if (next !== 'v1' && next !== 'v2') throw new Error(`[GrassMaterialFixture] Unsupported material version: ${String(version)}`);
        this._materialVersion = next;
        const payload = this._atlasPayloads.get(next) ?? null;
        for (const [role, material] of this._atlasPreviewMaterials) {
            this._applyAtlasPreviewMaterial(material, payload, role, next);
        }
        return this.getStats();
    }

    getFocusPose({ grazing = false } = {}) {
        const target = this._group?.position?.clone?.() ?? new THREE.Vector3();
        target.y += 1.25;
        const position = target.clone().add(grazing
            ? new THREE.Vector3(0, 2.0, 18.5)
            : new THREE.Vector3(0, 10.5, 18.5));
        return { position, target };
    }

    getStats() {
        return {
            fixture: 'grass_material_family_v2',
            activeMaterialVersion: this._materialVersion,
            sourceMaterialId: LOW_CUT_GRASS_SOURCE_MATERIAL_ID,
            historicalMaterialId: LOW_CUT_GRASS_V1_MATERIAL_ID,
            matchedMaterialId: LOW_CUT_GRASS_MATERIAL_ID,
            substrateMaterialId: LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID,
            physicalTileMeters: LOW_CUT_GRASS_ASSET_FAMILY.physicalDimensionsMeters.x,
            farMapCount: 6,
            clusterAtlas: {
                role: LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER,
                variants: LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.variants,
                materialPaths: LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.materialPaths,
                logicalDraws: 1,
                triangles: 2,
                alphaCutoff: LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.alphaCutoff,
                alphaToCoverage: LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.alphaToCoverage,
                minFilter: LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.minFilter,
                bakePhysicalDimensionsMeters: { ...LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.bakePhysicalDimensionsMeters },
                runtimePhysicalDimensionsMeters: { ...LOW_CUT_GRASS_ASSET_FAMILY.atlases.midCluster.runtimePhysicalDimensionsMeters }
            },
            accentAtlas: {
                role: LOW_CUT_GRASS_ATLAS_ROLE.ACCENT_CLUMP,
                variants: LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.variants,
                materialPaths: LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.materialPaths,
                logicalDraws: 1,
                triangles: 2,
                alphaCutoff: LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.alphaCutoff,
                alphaToCoverage: LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.alphaToCoverage,
                minFilter: LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.minFilter,
                bakePhysicalDimensionsMeters: { ...LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.bakePhysicalDimensionsMeters },
                runtimePhysicalDimensionsMeters: { ...LOW_CUT_GRASS_ASSET_FAMILY.atlases.accentClump.runtimePhysicalDimensionsMeters }
            },
            provenance: {
                profileId: LOW_CUT_GRASS_ASSET_FAMILY.bakeProfile.profileId,
                profileVersion: LOW_CUT_GRASS_ASSET_FAMILY.bakeProfile.version,
                seed: LOW_CUT_GRASS_ASSET_FAMILY.generation.seed,
                license: LOW_CUT_GRASS_ASSET_FAMILY.source.license
            }
        };
    }

    dispose() {
        if (this._group?.parent) this._group.parent.remove(this._group);
        for (const geometry of this._geometries) geometry.dispose?.();
        const textures = new Set();
        for (const material of this._materials) {
            for (const value of Object.values(material ?? {})) {
                if (value?.isTexture) textures.add(value);
            }
        }
        for (const payload of this._atlasPayloads.values()) collectPayloadTextures(payload, textures);
        for (const texture of textures) texture.dispose?.();
        for (const material of this._materials) material.dispose?.();
        this._geometries.length = 0;
        this._materials.length = 0;
        this._matchedMaterial = null;
        this._atlasPayloads.clear();
        this._atlasPreviewMaterials.clear();
        this._group = null;
        this._scene = null;
    }
}
