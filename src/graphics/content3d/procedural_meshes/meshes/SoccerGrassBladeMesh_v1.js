// src/graphics/content3d/procedural_meshes/meshes/SoccerGrassBladeMesh_v1.js
// Generates a minimal foliage blade mesh with adjustable bend controls.
import * as THREE from 'three';
import { clampNumber, createColorProperty, createNumberProperty, normalizeColorHex } from '../../../../app/prefabs/PrefabParamsSchema.js';
import { makeRegionMaterials } from '../../../engine3d/procedural_meshes/RegionMaterials.js';

export const MESH_ID = 'mesh.soccer_grass_blade.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Soccer Grass Blade (lo-res)' });

export const REGIONS = Object.freeze([
    { id: 'soccer_grass_blade:base', label: 'Base', tag: 'base', color: 0x1f7a2c },
    { id: 'soccer_grass_blade:tip', label: 'Tip', tag: 'tip', color: 0x49c965 }
]);

const DEG2RAD = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN_ANGLE = 2.399963229728653;

function degreesToRadians(degrees) {
    const value = Number(degrees);
    if (!Number.isFinite(value)) return 0;
    return value * DEG2RAD;
}

function rotateYZ({ y, z }, radians) {
    const y0 = Number(y) || 0;
    const z0 = Number(z) || 0;
    const r = Number(radians) || 0;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return { y: y0 * c - z0 * s, z: y0 * s + z0 * c };
}

function buildSoccerGrassBladeGeometry({ bendDegrees = 0, bladeBendDegrees = 0 } = {}) {
    const baseWidthMeters = 0.005;
    const baseHeightMeters = 0.03;
    const tipHeightMeters = 0.05;

    const halfWidth = baseWidthMeters * 0.5;
    const baseTopY = baseHeightMeters;

    const tipBendRad = degreesToRadians(bendDegrees);
    const localTipY = baseTopY + tipHeightMeters * Math.cos(tipBendRad);
    const localTipZ = tipHeightMeters * Math.sin(tipBendRad);

    const bladeBendRad = degreesToRadians(bladeBendDegrees);
    const topRight = rotateYZ({ y: baseTopY, z: 0 }, bladeBendRad);
    const topLeft = rotateYZ({ y: baseTopY, z: 0 }, bladeBendRad);
    const tip = rotateYZ({ y: localTipY, z: localTipZ }, bladeBendRad);

    const positions = new Float32Array([
        -halfWidth, 0, 0,
        halfWidth, 0, 0,
        halfWidth, topRight.y, topRight.z,
        -halfWidth, topLeft.y, topLeft.z,
        0, tip.y, tip.z
    ]);

    const indices = [0, 1, 2, 0, 2, 3, 3, 2, 4];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.clearGroups();
    geometry.addGroup(0, 6, 0);
    geometry.addGroup(6, 3, 1);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
}

function setDoubleSided(materials) {
    const list = Array.isArray(materials) ? materials : [materials];
    for (const mat of list) {
        if (!mat) continue;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
    }
}

function makeSolidMaterials(regionCount, { roughness = 0.7, metalness = 0.0 } = {}) {
    const count = Number.isInteger(regionCount) ? regionCount : 0;
    const r = Number.isFinite(roughness) ? roughness : 0.7;
    const m = Number.isFinite(metalness) ? metalness : 0.0;
    const materials = [];
    for (let i = 0; i < count; i++) {
        materials.push(new THREE.MeshStandardMaterial({
            color: 0xd7dde7,
            metalness: m,
            roughness: r,
            side: THREE.DoubleSide
        }));
    }
    return materials;
}

function seedBladeInstances(mesh, maxCount) {
    const count = Number.isInteger(maxCount) ? maxCount : 1;
    const radiusMax = 0.18;

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < count; i++) {
        if (i === 0) {
            pos.set(0, 0, 0);
            quat.identity();
        } else {
            const t = count > 1 ? (i / (count - 1)) : 0;
            const theta = i * GOLDEN_ANGLE;
            const radius = radiusMax * Math.sqrt(t);
            pos.set(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
            quat.setFromAxisAngle(UP, theta);
        }

        matrix.compose(pos, quat, scale);
        mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
}

export function createAsset() {
    const baseColorProp = createColorProperty({
        id: 'baseColorHex',
        label: 'Base color',
        defaultValue: REGIONS[0]?.color ?? 0xffffff
    });

    const tipColorProp = createColorProperty({
        id: 'tipColorHex',
        label: 'Tip color',
        defaultValue: REGIONS[1]?.color ?? 0xffffff
    });

    const roughnessProp = createNumberProperty({
        id: 'roughness',
        label: 'Roughness',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.88
    });

    const metalnessProp = createNumberProperty({
        id: 'metalness',
        label: 'Metalness',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.0
    });

    const bladeBendProp = createNumberProperty({
        id: 'bladeBendDegrees',
        label: 'Blade bend (deg)',
        min: -90,
        max: 90,
        step: 1,
        defaultValue: 0
    });

    const bendProp = createNumberProperty({
        id: 'bendDegrees',
        label: 'Tip bend (deg)',
        min: -90,
        max: 90,
        step: 1,
        defaultValue: 0
    });

    const yawProp = createNumberProperty({
        id: 'yawDegrees',
        label: 'Yaw (deg)',
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 0
    });

    const countProp = createNumberProperty({
        id: 'count',
        label: 'Count',
        min: 1,
        max: 25,
        step: 1,
        defaultValue: 1
    });

    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    if (regions[0]) regions[0].color = baseColorProp.defaultValue;
    if (regions[1]) regions[1].color = tipColorProp.defaultValue;
    const geometry = buildSoccerGrassBladeGeometry({
        bendDegrees: bendProp.defaultValue,
        bladeBendDegrees: bladeBendProp.defaultValue
    });

    const semanticMaterials = makeRegionMaterials(regions, {
        wireframe: false,
        metalness: metalnessProp.defaultValue,
        roughness: roughnessProp.defaultValue
    });
    setDoubleSided(semanticMaterials);

    const solidMaterials = makeSolidMaterials(regions.length, {
        metalness: metalnessProp.defaultValue,
        roughness: roughnessProp.defaultValue
    });

    const maxInstances = Math.round(Number(countProp.max ?? 1)) || 1;
    const mesh = new THREE.InstancedMesh(geometry, semanticMaterials, maxInstances);
    mesh.count = Math.round(countProp.defaultValue);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    seedBladeInstances(mesh, maxInstances);
    mesh.rotation.y = degreesToRadians(yawProp.defaultValue);

    const params = {
        baseColorHex: baseColorProp.defaultValue,
        tipColorHex: tipColorProp.defaultValue,
        roughness: roughnessProp.defaultValue,
        metalness: metalnessProp.defaultValue,
        bendDegrees: bendProp.defaultValue,
        bladeBendDegrees: bladeBendProp.defaultValue,
        yawDegrees: yawProp.defaultValue,
        count: Math.round(countProp.defaultValue)
    };

    const prefab = {
        schema: Object.freeze({
            id: 'prefab_params.soccer_grass_blade.v1',
            label: 'Soccer Grass Blade (lo-res)',
            properties: Object.freeze([baseColorProp, tipColorProp, roughnessProp, metalnessProp, bladeBendProp, bendProp, yawProp, countProp]),
            children: Object.freeze([])
        }),
        children: [],
        getParam: (propId) => {
            if (propId === 'baseColorHex') return params.baseColorHex;
            if (propId === 'tipColorHex') return params.tipColorHex;
            if (propId === 'roughness') return params.roughness;
            if (propId === 'metalness') return params.metalness;
            if (propId === 'bendDegrees') return params.bendDegrees;
            if (propId === 'bladeBendDegrees') return params.bladeBendDegrees;
            if (propId === 'yawDegrees') return params.yawDegrees;
            if (propId === 'count') return params.count;
            return null;
        },
        setParam: (propId, value) => {
            if (propId === 'baseColorHex') {
                const next = normalizeColorHex(value, baseColorProp.defaultValue);
                if (next === params.baseColorHex) return;
                params.baseColorHex = next;
                if (regions[0]) regions[0].color = next;
                const mat = semanticMaterials[0] ?? null;
                mat?.color?.setHex?.(next);
                if (mat) mat.needsUpdate = true;
                return;
            }

            if (propId === 'tipColorHex') {
                const next = normalizeColorHex(value, tipColorProp.defaultValue);
                if (next === params.tipColorHex) return;
                params.tipColorHex = next;
                if (regions[1]) regions[1].color = next;
                const mat = semanticMaterials[1] ?? null;
                mat?.color?.setHex?.(next);
                if (mat) mat.needsUpdate = true;
                return;
            }

            if (propId === 'roughness') {
                const next = clampNumber(value, roughnessProp);
                if (Math.abs(next - params.roughness) < 1e-9) return;
                params.roughness = next;
                for (const mat of [...semanticMaterials, ...solidMaterials]) {
                    if (!mat) continue;
                    mat.roughness = next;
                    mat.needsUpdate = true;
                }
                return;
            }

            if (propId === 'metalness') {
                const next = clampNumber(value, metalnessProp);
                if (Math.abs(next - params.metalness) < 1e-9) return;
                params.metalness = next;
                for (const mat of [...semanticMaterials, ...solidMaterials]) {
                    if (!mat) continue;
                    mat.metalness = next;
                    mat.needsUpdate = true;
                }
                return;
            }

            if (propId === 'bladeBendDegrees') {
                const next = clampNumber(value, bladeBendProp);
                if (Math.abs(next - params.bladeBendDegrees) < 1e-9) return;
                params.bladeBendDegrees = next;
                const nextGeo = buildSoccerGrassBladeGeometry({
                    bendDegrees: params.bendDegrees,
                    bladeBendDegrees: params.bladeBendDegrees
                });
                const prev = mesh.geometry;
                mesh.geometry = nextGeo;
                prev?.dispose?.();
                mesh.userData._meshInspectorNeedsEdgesRefresh = true;
                return;
            }

            if (propId === 'bendDegrees') {
                const next = clampNumber(value, bendProp);
                if (Math.abs(next - params.bendDegrees) < 1e-9) return;
                params.bendDegrees = next;
                const nextGeo = buildSoccerGrassBladeGeometry({
                    bendDegrees: next,
                    bladeBendDegrees: params.bladeBendDegrees
                });
                const prev = mesh.geometry;
                mesh.geometry = nextGeo;
                prev?.dispose?.();
                mesh.userData._meshInspectorNeedsEdgesRefresh = true;
                return;
            }

            if (propId === 'yawDegrees') {
                const next = clampNumber(value, yawProp);
                if (Math.abs(next - params.yawDegrees) < 1e-9) return;
                params.yawDegrees = next;
                mesh.rotation.y = degreesToRadians(next);
                return;
            }

            if (propId === 'count') {
                const next = Math.round(clampNumber(value, countProp));
                if (next === params.count) return;
                params.count = next;
                mesh.count = next;
            }
        }
    };
    mesh.userData.prefab = prefab;

    return {
        id,
        name: 'Soccer Grass Blade (lo-res)',
        source: { type: 'SoccerGrassBladeMesh', version: 1 },
        regions,
        mesh,
        materials: { semantic: semanticMaterials, solid: solidMaterials }
    };
}
