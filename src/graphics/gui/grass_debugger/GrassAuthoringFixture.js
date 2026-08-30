// Renders the deterministic high-resolution bake source beside its one-triangle runtime derivation.
// @ts-check

import * as THREE from 'three';
import { createProceduralMeshAsset } from '../../assets3d/procedural_meshes/ProceduralMeshCatalog.js';
import { PROCEDURAL_MESH } from '../../content3d/catalogs/ProceduralMeshCatalog.js';
import {
    createLowCutGrassAuthoringBladeDescriptors,
    createLowCutGrassRuntimeBladeData,
    deriveLowCutGrassRuntimeProfile,
    getLowCutGrassAuthoringSignature,
    sanitizeLowCutGrassProfile,
    serializeLowCutGrassProfile
} from '../../engine3d/grass/LowCutGrassProfile.js';

const SOURCE_BLADE_COUNT = 24;
const SOURCE_PATCH_SIZE_METERS = 0.24;

function computeTriangles(geometry) {
    const index = geometry?.index;
    if (index?.isBufferAttribute) return Math.floor(index.count / 3);
    const position = geometry?.attributes?.position;
    return position?.isBufferAttribute ? Math.floor(position.count / 3) : 0;
}

function hashGeometryList(geometries) {
    let hash = 2166136261;
    for (const geometry of geometries) {
        const position = geometry?.attributes?.position;
        const color = geometry?.attributes?.color;
        const arrays = [position?.array, geometry?.index?.array, color?.array];
        for (const array of arrays) {
            if (!array) continue;
            for (let index = 0; index < array.length; index++) {
                const text = Number(array[index]).toFixed(8);
                for (let charIndex = 0; charIndex < text.length; charIndex++) {
                    hash ^= text.charCodeAt(charIndex);
                    hash = Math.imul(hash, 16777619);
                }
            }
        }
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function varyColor(hex, descriptor) {
    const color = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const hue = ((hsl.h + Number(descriptor.hueShiftDegrees) / 360) % 1 + 1) % 1;
    const saturation = THREE.MathUtils.clamp(hsl.s * Number(descriptor.saturationMultiplier), 0, 1);
    const lightness = THREE.MathUtils.clamp(hsl.l * Number(descriptor.brightnessMultiplier), 0, 1);
    return color.setHSL(hue, saturation, lightness).getHex();
}

function disposeObject(object) {
    object?.traverse?.((child) => {
        if (!child?.isMesh) return;
        child.geometry?.dispose?.();
        const material = child.material;
        if (Array.isArray(material)) for (const item of material) item?.dispose?.();
        else material?.dispose?.();
    });
    object?.clear?.();
}

export class GrassAuthoringFixture {
    constructor({ scene, position } = {}) {
        if (!scene?.isScene) throw new Error('[GrassAuthoringFixture] A THREE.Scene is required.');
        this._scene = scene;
        this._profileKey = '';
        this._stats = null;
        this.group = new THREE.Group();
        this.group.name = 'GrassLabAuthoringBakeFixture';
        this.group.position.set(Number(position?.x) || -52, Number(position?.y) || 0.025, Number(position?.z) || -138);
        this.group.visible = false;
        scene.add(this.group);
    }

    setProfile(profile) {
        const config = sanitizeLowCutGrassProfile(profile);
        const key = serializeLowCutGrassProfile(config);
        if (key === this._profileKey) return;
        this._profileKey = key;
        this._rebuild(config);
    }

    setVisible(visible) {
        this.group.visible = !!visible;
    }

    getFocusPose() {
        const target = this.group.position.clone().add(new THREE.Vector3(0, 0.035, 0));
        const position = target.clone().add(new THREE.Vector3(0.36, 0.22, 0.42));
        return { position, target };
    }

    getStats() {
        return this._stats ? JSON.parse(JSON.stringify(this._stats)) : null;
    }

    dispose() {
        disposeObject(this.group);
        this.group.removeFromParent();
        this._scene = null;
        this._stats = null;
    }

    _rebuild(profile) {
        disposeObject(this.group);
        const descriptors = createLowCutGrassAuthoringBladeDescriptors(profile, {
            count: SOURCE_BLADE_COUNT,
            patchSizeMeters: SOURCE_PATCH_SIZE_METERS
        });
        const runtimeProfile = deriveLowCutGrassRuntimeProfile(profile);
        const sourceGeometries = [];
        let sourceTriangles = 0;

        const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(0.72, 0.012, 0.34),
            new THREE.MeshStandardMaterial({ color: 0x263126, roughness: 0.92, metalness: 0 })
        );
        plinth.name = 'GrassAuthoringFixturePlinth';
        plinth.position.y = -0.009;
        plinth.receiveShadow = true;
        this.group.add(plinth);

        const sourceGroup = new THREE.Group();
        sourceGroup.name = 'GrassAuthoringHighResolutionSource';
        sourceGroup.position.x = -0.20;
        this.group.add(sourceGroup);

        for (const descriptor of descriptors) {
            const asset = createProceduralMeshAsset(PROCEDURAL_MESH.SOCCER_GRASS_BLADE_HIRES_V1);
            const mesh = asset?.mesh ?? null;
            const prefab = mesh?.userData?.prefab ?? null;
            if (!mesh?.isInstancedMesh || !prefab?.setParam) throw new Error('[GrassAuthoringFixture] Missing high-resolution grass source asset.');
            prefab.setParam('count', 1);
            prefab.setParam('bladeHeightCm', descriptor.heightMeters * 100);
            prefab.setParam('baseWidthCm', descriptor.widthMeters * 100);
            prefab.setParam('midWidthCm', descriptor.widthMeters * 92);
            prefab.setParam('tipWidthCm', descriptor.widthMeters * 52);
            prefab.setParam('tipStart01', 0.70);
            prefab.setParam('tipRoundness', 0.58);
            prefab.setParam('curvature', descriptor.curvature);
            prefab.setParam('bladeBendDegrees', descriptor.bendDegrees);
            prefab.setParam('baseColorHex', varyColor(profile.appearance.baseColor, descriptor));
            prefab.setParam('tipColorHex', varyColor(profile.appearance.tipColor, descriptor));
            prefab.setParam('roughness', runtimeProfile.appearance.roughness);
            prefab.setParam('specularIntensity', THREE.MathUtils.clamp(0.08 + profile.appearance.humidity * 0.22, 0, 1));
            mesh.name = `GrassAuthoringSourceBlade_${descriptor.index}`;
            mesh.position.set(descriptor.x, 0, descriptor.z);
            mesh.rotation.order = 'YXZ';
            mesh.rotation.y = descriptor.yawRadians;
            mesh.rotation.x = THREE.MathUtils.degToRad(descriptor.inclinationDegrees);
            mesh.castShadow = false;
            sourceGroup.add(mesh);
            sourceGeometries.push(mesh.geometry);
            sourceTriangles += computeTriangles(mesh.geometry);
            const solids = asset?.materials?.solid;
            if (Array.isArray(solids)) for (const material of solids) material?.dispose?.();
        }

        const runtimeData = createLowCutGrassRuntimeBladeData(profile);
        const runtimeGeometry = new THREE.BufferGeometry();
        runtimeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(runtimeData.positions, 3));
        runtimeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(runtimeData.colors, 3));
        runtimeGeometry.setIndex(runtimeData.indices);
        runtimeGeometry.computeVertexNormals();
        runtimeGeometry.computeBoundingBox();
        runtimeGeometry.computeBoundingSphere();
        const runtimeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: runtimeProfile.appearance.roughness,
            metalness: 0,
            side: THREE.DoubleSide
        });
        const runtimeMesh = new THREE.InstancedMesh(runtimeGeometry, runtimeMaterial, descriptors.length);
        runtimeMesh.name = 'GrassAuthoringOneTriangleRuntimeDerivation';
        runtimeMesh.position.x = 0.20;
        runtimeMesh.castShadow = false;
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3(1, 1, 1);
        const averageHeight = (profile.blade.heightMeters.min + profile.blade.heightMeters.max) * 0.5;
        const averageWidth = (profile.blade.widthMeters.min + profile.blade.widthMeters.max) * 0.5;
        for (let index = 0; index < descriptors.length; index++) {
            const descriptor = descriptors[index];
            position.set(descriptor.x, 0, descriptor.z);
            quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, descriptor.yawRadians);
            scale.set(descriptor.widthMeters / averageWidth, descriptor.heightMeters / averageHeight, descriptor.heightMeters / averageHeight);
            matrix.compose(position, quaternion, scale);
            runtimeMesh.setMatrixAt(index, matrix);
        }
        runtimeMesh.instanceMatrix.needsUpdate = true;
        this.group.add(runtimeMesh);

        this._stats = {
            profileId: profile.profileId,
            profileVersion: profile.version,
            profileSeed: profile.seed,
            sourceMeshId: PROCEDURAL_MESH.SOCCER_GRASS_BLADE_HIRES_V1,
            sourceBladeCount: descriptors.length,
            sourceTriangles,
            sourceGeometryHash: hashGeometryList(sourceGeometries),
            sourceSignature: getLowCutGrassAuthoringSignature(profile, { count: SOURCE_BLADE_COUNT, patchSizeMeters: SOURCE_PATCH_SIZE_METERS }),
            runtimeSourceMeshId: runtimeData.sourceMeshId,
            runtimeTrianglesPerBlade: runtimeData.triangleCount,
            runtimeMaterialSlots: runtimeData.materialSlots,
            runtimeGroupCount: runtimeData.groupCount,
            runtimeDrawCalls: 1,
            carpetLayout: profile.carpet.layout,
            accentLayout: profile.accents.layout
        };
    }
}
