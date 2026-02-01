// src/graphics/content3d/procedural_meshes/meshes/SoccerGrassBladeHiResMesh_v1.js
// Generates a higher-resolution grass blade mesh with curvature, cavity, and arc bending.
import * as THREE from 'three';
import {
    clampNumber,
    createBooleanProperty,
    createColorProperty,
    createEnumProperty,
    createNumberProperty,
    normalizeBooleanValue,
    normalizeEnumValue,
    normalizeColorHex
} from '../../../../app/prefabs/PrefabParamsSchema.js';

export const MESH_ID = 'mesh.soccer_grass_blade_hires.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Blade (hi-res)' });

export const REGIONS = Object.freeze([
    { id: 'soccer_grass_blade_hires:base', label: 'Base', tag: 'base', color: 0x1f7a2c },
    { id: 'soccer_grass_blade_hires:tip', label: 'Tip', tag: 'tip', color: 0x49c965 }
]);

const DEG2RAD = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN_ANGLE = 2.399963229728653;

function degreesToRadians(degrees) {
    const value = Number(degrees);
    if (!Number.isFinite(value)) return 0;
    return value * DEG2RAD;
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function lerp(a, b, t) {
    const t0 = clamp(t, 0, 1);
    return (Number(a) || 0) + ((Number(b) || 0) - (Number(a) || 0)) * t0;
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((Number(x) - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function srgb01ToLinear01(v) {
    const x = clamp(v, 0, 1);
    if (x <= 0.04045) return x / 12.92;
    return Math.pow((x + 0.055) / 1.055, 2.4);
}

function hexToRgbLinear01(hex) {
    const h = Number.isFinite(Number(hex)) ? (Number(hex) >>> 0) & 0xffffff : 0xffffff;
    return {
        r: srgb01ToLinear01(((h >> 16) & 0xff) / 255),
        g: srgb01ToLinear01(((h >> 8) & 0xff) / 255),
        b: srgb01ToLinear01((h & 0xff) / 255)
    };
}

function applyBladeGradientVertexColors(geometry, { baseColorHex, tipColorHex } = {}) {
    const geo = geometry && typeof geometry === 'object' ? geometry : null;
    if (!geo) return;

    const tByVertex = geo.userData?._bladeGradientT ?? null;
    if (!tByVertex || !Number.isFinite(tByVertex.length) || tByVertex.length <= 0) return;

    // Vertex colors are interpreted as linear in Three.js shaders. Convert from sRGB hex.
    const base = hexToRgbLinear01(baseColorHex);
    const tip = hexToRgbLinear01(tipColorHex);

    const attr = geo.getAttribute?.('color') ?? null;
    const needsNew = !attr || !attr.isBufferAttribute || attr.itemSize !== 3 || attr.count !== tByVertex.length;
    const array = needsNew ? new Float32Array(tByVertex.length * 3) : attr.array;

    for (let i = 0; i < tByVertex.length; i++) {
        const t = smoothstep(0, 1, tByVertex[i]);
        array[i * 3 + 0] = base.r + (tip.r - base.r) * t;
        array[i * 3 + 1] = base.g + (tip.g - base.g) * t;
        array[i * 3 + 2] = base.b + (tip.b - base.b) * t;
    }

    if (needsNew) {
        geo.setAttribute('color', new THREE.BufferAttribute(array, 3));
        return;
    }

    attr.needsUpdate = true;
}

function bendPointArcYz({ y, z }, { totalLength, bendRadians }) {
    const len = Number(totalLength) || 0;
    const bend = Number(bendRadians) || 0;
    if (!(len > 1e-6) || Math.abs(bend) < 1e-6) return { y, z };

    const phi = (Number(y) || 0) * (bend / len);
    const radius = len / bend;

    const yc = radius * Math.sin(phi);
    const zc = radius * (1 - Math.cos(phi));

    const normalY = -Math.sin(phi);
    const normalZ = Math.cos(phi);

    return {
        y: yc + normalY * (Number(z) || 0),
        z: zc + normalZ * (Number(z) || 0)
    };
}

function buildHiResGeometry({
    bladeHeightMeters = 0.08,
    baseWidthMeters = 0.005,
    midWidthMeters = 0.005,
    tipStart01 = 0.68,
    tipMode = 'rounded',
    tipWidthMeters = 0.005,
    tipRoundness = 0.75,
    curvature = 0.65,
    bladeBendDegrees = 0,
    baseColorHex = 0xffffff,
    tipColorHex = 0xffffff
} = {}) {
    const totalHeight = Math.max(0.0001, Number(bladeHeightMeters) || 0.08);
    const baseWidth = Math.max(0.0001, Number(baseWidthMeters) || 0.005);
    const midWidth = Math.max(0.0001, Number(midWidthMeters) || baseWidth);
    const tipStartT = clamp(tipStart01, 0.05, 0.98);

    const tipLength = totalHeight * (1 - tipStartT);
    const capBaseY = totalHeight * tipStartT;

    const tipShape = String(tipMode || 'rounded').toLowerCase() === 'pointy' ? 'pointy' : 'rounded';
    const tipEndWidth = tipShape === 'rounded'
        ? Math.max(0, Math.min(Number(tipWidthMeters) || 0, midWidth))
        : 0;

    const curvatureScale = clamp(curvature, 0, 3);
    const cavityDepthRatio = clamp(curvatureScale * 0.06, 0, 0.22);
    const cavityWallPower = 2.15;

    const bendRadians = degreesToRadians(bladeBendDegrees);

    const widthSegments = 18;
    const heightSegments = 26;
    const midT = 0.5;

    const getWidthAtT = (t) => {
        const t0 = clamp(t, 0, 1);
        if (t0 <= midT) return lerp(baseWidth, midWidth, smoothstep(0, midT, t0));
        if (t0 <= tipStartT) return midWidth;
        const tipT = smoothstep(tipStartT, 1, t0);
        return lerp(midWidth, tipEndWidth, tipT);
    };

    const getTipProfile01 = (v) => {
        const v0 = clamp(v, 0, 1);
        const r = clamp(tipRoundness, 0, 1);
        const linear = 1 - v0;
        const cosine = Math.cos(v0 * Math.PI * 0.5);
        return lerp(linear, cosine, r);
    };

    const positions = [];
    const tByVertex = [];
    const rowTs = [];
    const rows = [];

    const bodySegments = Math.max(1, Math.min(heightSegments, Math.round(heightSegments * tipStartT)));
    for (let iy = 0; iy <= bodySegments; iy++) {
        const tBody = bodySegments > 0 ? (iy / bodySegments) : 0;
        const y = capBaseY * tBody;
        const t = totalHeight > 1e-6 ? clamp(y / totalHeight, 0, 1) : 0;
        rowTs.push(t);
        const rowWidth = Math.max(0.0001, getWidthAtT(t));
        const half = rowWidth * 0.5;
        const cavityDepth = rowWidth * cavityDepthRatio;

        const row = [];
        for (let ix = 0; ix <= widthSegments; ix++) {
            const s = widthSegments > 0 ? (ix / widthSegments) * 2 - 1 : 0;
            const x = s * half;
            const u = Math.abs(s);
            const z = cavityDepth * (2 * Math.pow(u, cavityWallPower) - 1);

            const bent = bendPointArcYz({ y, z }, { totalLength: totalHeight, bendRadians });
            const index = Math.floor(positions.length / 3);
            positions.push(x, bent.y, bent.z);
            tByVertex.push(t);
            row.push(index);
        }
        rows.push(row);
    }

    const capHalf = Math.max(0.0001, getWidthAtT(tipStartT)) * 0.5;
    const tipEndHalf = Math.max(0, Math.min(capHalf, tipEndWidth * 0.5));

    const capRow = [];
    for (let ix = 0; ix <= widthSegments; ix++) {
        const s = widthSegments > 0 ? (ix / widthSegments) * 2 - 1 : 0;
        const x = s * capHalf;
        const absX = Math.abs(x);

        let y = capBaseY;
        if (tipLength <= 1e-6 || capHalf <= 1e-6) {
            y = capBaseY;
        } else if (absX <= tipEndHalf + 1e-9 || capHalf - tipEndHalf <= 1e-6) {
            y = totalHeight;
        } else {
            const v = clamp((absX - tipEndHalf) / Math.max(1e-6, capHalf - tipEndHalf), 0, 1);
            y = capBaseY + tipLength * getTipProfile01(v);
        }

        const t = totalHeight > 1e-6 ? clamp(y / totalHeight, 0, 1) : 1;
        const rowWidth = Math.max(0.0001, getWidthAtT(t));
        const cavityDepth = rowWidth * cavityDepthRatio;
        const u = Math.abs(s);
        const z = cavityDepth * (2 * Math.pow(u, cavityWallPower) - 1);

        const bent = bendPointArcYz({ y, z }, { totalLength: totalHeight, bendRadians });
        const index = Math.floor(positions.length / 3);
        positions.push(x, bent.y, bent.z);
        tByVertex.push(t);
        capRow.push(index);
    }

    const baseHeightMeters = 0.03;
    const baseThresholdT = baseHeightMeters / totalHeight;
    const baseIndices = [];
    const tipIndices = [];

    const pushTri = (tMid, a, b, c) => {
        const out = tMid <= baseThresholdT ? baseIndices : tipIndices;
        out.push(a, b, c);
    };

    for (let iy = 0; iy < bodySegments; iy++) {
        const rowA = rows[iy];
        const rowB = rows[iy + 1];
        const tA = rowTs[iy] ?? 0;
        const tB = rowTs[iy + 1] ?? 0;
        const tMid = (tA + tB) * 0.5;

        for (let ix = 0; ix < widthSegments; ix++) {
            const a0 = rowA[ix];
            const a1 = rowA[ix + 1];
            const b0 = rowB[ix];
            const b1 = rowB[ix + 1];

            pushTri(tMid, a0, b0, b1);
            pushTri(tMid, a0, b1, a1);
        }
    }

    const baseRow = rows[bodySegments];
    for (let ix = 0; ix < widthSegments; ix++) {
        const a0 = baseRow[ix];
        const a1 = baseRow[ix + 1];
        const b0 = capRow[ix];
        const b1 = capRow[ix + 1];
        const tMid = ((rowTs[bodySegments] ?? 0) + 1) * 0.5;
        pushTri(tMid, a0, b0, b1);
        pushTri(tMid, a0, b1, a1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex([...baseIndices, ...tipIndices]);
    geometry.clearGroups();
    geometry.addGroup(0, baseIndices.length, 0);
    geometry.addGroup(baseIndices.length, tipIndices.length, 1);
    geometry.userData._bladeGradientT = new Float32Array(tByVertex);
    applyBladeGradientVertexColors(geometry, { baseColorHex, tipColorHex });
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
}

function makeBladeMaterial({
    roughness = 0.7,
    metalness = 0.0,
    specularIntensity = 0.15,
    edgeTintHex = 0xe7d46b,
    edgeTintStrength = 0.65,
    edgeTintEnabled = true,
    grazingShine = 0.2,
    grazingShineRoughness = 0.25,
    grazingShineEnabled = true,
    wireframe = false
} = {}) {
    const r = Number.isFinite(roughness) ? roughness : 0.7;
    const m = Number.isFinite(metalness) ? metalness : 0.0;
    const spec = clamp(specularIntensity, 0, 1);
    const s = edgeTintEnabled ? clamp(edgeTintStrength, 0, 1) : 0;
    const coat = grazingShineEnabled ? clamp(grazingShine, 0, 1) : 0;
    const coatRough = clamp(grazingShineRoughness, 0, 1);
    return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: m,
        roughness: r,
        specularIntensity: spec,
        ior: 1.3,
        sheen: s,
        sheenColor: edgeTintHex,
        sheenRoughness: clamp(0.35 + r * 0.35, 0.05, 1),
        clearcoat: coat,
        clearcoatRoughness: coatRough,
        vertexColors: true,
        wireframe: !!wireframe,
        side: THREE.DoubleSide
    });
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

    const bladeHeightCmProp = createNumberProperty({
        id: 'bladeHeightCm',
        label: 'Blade height (cm)',
        min: 6,
        max: 70,
        step: 0.1,
        defaultValue: 8
    });

    const baseWidthCmProp = createNumberProperty({
        id: 'baseWidthCm',
        label: 'Base width (cm)',
        min: 0.5,
        max: 9,
        step: 0.01,
        defaultValue: 0.5
    });

    const midWidthCmProp = createNumberProperty({
        id: 'midWidthCm',
        label: 'Middle width (cm)',
        min: 0.5,
        max: 9,
        step: 0.01,
        defaultValue: 0.5
    });

    const tipStartProp = createNumberProperty({
        id: 'tipStart01',
        label: 'Tip start (0..1)',
        min: 0.05,
        max: 0.98,
        step: 0.01,
        defaultValue: 0.68
    });

    const tipModeProp = createEnumProperty({
        id: 'tipMode',
        label: 'Tip mode',
        options: [
            { id: 'rounded', label: 'Rounded' },
            { id: 'pointy', label: 'Pointy' }
        ],
        defaultValue: 'rounded'
    });

    const tipWidthCmProp = createNumberProperty({
        id: 'tipWidthCm',
        label: 'Tip width (cm)',
        min: 0.5,
        max: 9,
        step: 0.01,
        defaultValue: 0.5
    });

    const tipRoundnessProp = createNumberProperty({
        id: 'tipRoundness',
        label: 'Tip roundness',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.75
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

    const specularIntensityProp = createNumberProperty({
        id: 'specularIntensity',
        label: 'Specular intensity',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.15
    });

    const curvatureProp = createNumberProperty({
        id: 'curvature',
        label: 'Curvature',
        min: 0,
        max: 3,
        step: 0.01,
        defaultValue: 0.65
    });

    const bladeBendProp = createNumberProperty({
        id: 'bladeBendDegrees',
        label: 'Blade bend (deg)',
        min: -180,
        max: 180,
        step: 1,
        defaultValue: 0
    });

    const edgeTintProp = createColorProperty({
        id: 'edgeTintHex',
        label: 'Edge tint',
        defaultValue: 0xe7d46b
    });

    const edgeTintEnabledProp = createBooleanProperty({
        id: 'edgeTintEnabled',
        label: 'Edge tint enabled',
        defaultValue: true
    });

    const edgeTintStrengthProp = createNumberProperty({
        id: 'edgeTintStrength',
        label: 'Edge tint strength',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.4
    });

    const grazingShineEnabledProp = createBooleanProperty({
        id: 'grazingShineEnabled',
        label: 'Grazing shine enabled',
        defaultValue: true
    });

    const grazingShineProp = createNumberProperty({
        id: 'grazingShine',
        label: 'Grazing shine',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.06
    });

    const grazingShineRoughnessProp = createNumberProperty({
        id: 'grazingShineRoughness',
        label: 'Grazing shine roughness',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.85
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
        max: 12,
        step: 1,
        defaultValue: 1
    });

    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    if (regions[0]) regions[0].color = baseColorProp.defaultValue;
    if (regions[1]) regions[1].color = tipColorProp.defaultValue;

    const geometry = buildHiResGeometry({
        bladeHeightMeters: bladeHeightCmProp.defaultValue * 0.01,
        baseWidthMeters: baseWidthCmProp.defaultValue * 0.01,
        midWidthMeters: midWidthCmProp.defaultValue * 0.01,
        tipStart01: tipStartProp.defaultValue,
        tipMode: tipModeProp.defaultValue,
        tipWidthMeters: tipWidthCmProp.defaultValue * 0.01,
        tipRoundness: tipRoundnessProp.defaultValue,
        curvature: curvatureProp.defaultValue,
        bladeBendDegrees: bladeBendProp.defaultValue,
        baseColorHex: baseColorProp.defaultValue,
        tipColorHex: tipColorProp.defaultValue
    });

    const semanticMaterial = makeBladeMaterial({
        metalness: metalnessProp.defaultValue,
        roughness: roughnessProp.defaultValue,
        specularIntensity: specularIntensityProp.defaultValue,
        edgeTintHex: edgeTintProp.defaultValue,
        edgeTintStrength: edgeTintStrengthProp.defaultValue,
        edgeTintEnabled: edgeTintEnabledProp.defaultValue,
        grazingShine: grazingShineProp.defaultValue,
        grazingShineRoughness: grazingShineRoughnessProp.defaultValue,
        grazingShineEnabled: grazingShineEnabledProp.defaultValue,
        wireframe: false
    });

    const solidMaterials = makeSolidMaterials(regions.length, {
        metalness: metalnessProp.defaultValue,
        roughness: roughnessProp.defaultValue
    });

    const maxInstances = Math.round(Number(countProp.max ?? 1)) || 1;
    const mesh = new THREE.InstancedMesh(geometry, semanticMaterial, maxInstances);
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
        bladeHeightCm: bladeHeightCmProp.defaultValue,
        baseWidthCm: baseWidthCmProp.defaultValue,
        midWidthCm: midWidthCmProp.defaultValue,
        tipStart01: tipStartProp.defaultValue,
        tipMode: tipModeProp.defaultValue,
        tipWidthCm: tipWidthCmProp.defaultValue,
        tipRoundness: tipRoundnessProp.defaultValue,
        roughness: roughnessProp.defaultValue,
        metalness: metalnessProp.defaultValue,
        specularIntensity: specularIntensityProp.defaultValue,
        curvature: curvatureProp.defaultValue,
        bladeBendDegrees: bladeBendProp.defaultValue,
        edgeTintHex: edgeTintProp.defaultValue,
        edgeTintEnabled: edgeTintEnabledProp.defaultValue,
        edgeTintStrength: edgeTintStrengthProp.defaultValue,
        grazingShineEnabled: grazingShineEnabledProp.defaultValue,
        grazingShine: grazingShineProp.defaultValue,
        grazingShineRoughness: grazingShineRoughnessProp.defaultValue,
        yawDegrees: yawProp.defaultValue,
        count: Math.round(countProp.defaultValue)
    };

    const rebuildGeometry = () => buildHiResGeometry({
        bladeHeightMeters: params.bladeHeightCm * 0.01,
        baseWidthMeters: params.baseWidthCm * 0.01,
        midWidthMeters: params.midWidthCm * 0.01,
        tipStart01: params.tipStart01,
        tipMode: params.tipMode,
        tipWidthMeters: params.tipWidthCm * 0.01,
        tipRoundness: params.tipRoundness,
        curvature: params.curvature,
        bladeBendDegrees: params.bladeBendDegrees,
        baseColorHex: params.baseColorHex,
        tipColorHex: params.tipColorHex
    });

    const applyGeometryRebuild = () => {
        const nextGeo = rebuildGeometry();
        const prev = mesh.geometry;
        mesh.geometry = nextGeo;
        prev?.dispose?.();
        mesh.userData._meshInspectorNeedsEdgesRefresh = true;
    };

    const prefab = {
        schema: Object.freeze({
            id: 'prefab_params.soccer_grass_blade_hires.v1',
            label: 'Blade (hi-res)',
            properties: Object.freeze([
                baseColorProp,
                tipColorProp,
                bladeHeightCmProp,
                baseWidthCmProp,
                midWidthCmProp,
                tipStartProp,
                tipModeProp,
                tipWidthCmProp,
                tipRoundnessProp,
                roughnessProp,
                metalnessProp,
                specularIntensityProp,
                curvatureProp,
                bladeBendProp,
                edgeTintEnabledProp,
                edgeTintProp,
                edgeTintStrengthProp,
                grazingShineEnabledProp,
                grazingShineProp,
                grazingShineRoughnessProp,
                yawProp,
                countProp
            ]),
            children: Object.freeze([])
        }),
        children: [],
        getParam: (propId) => {
            if (propId === 'baseColorHex') return params.baseColorHex;
            if (propId === 'tipColorHex') return params.tipColorHex;
            if (propId === 'bladeHeightCm') return params.bladeHeightCm;
            if (propId === 'baseWidthCm') return params.baseWidthCm;
            if (propId === 'midWidthCm') return params.midWidthCm;
            if (propId === 'tipStart01') return params.tipStart01;
            if (propId === 'tipMode') return params.tipMode;
            if (propId === 'tipWidthCm') return params.tipWidthCm;
            if (propId === 'tipRoundness') return params.tipRoundness;
            if (propId === 'roughness') return params.roughness;
            if (propId === 'metalness') return params.metalness;
            if (propId === 'specularIntensity') return params.specularIntensity;
            if (propId === 'curvature') return params.curvature;
            if (propId === 'bladeBendDegrees') return params.bladeBendDegrees;
            if (propId === 'edgeTintHex') return params.edgeTintHex;
            if (propId === 'edgeTintEnabled') return params.edgeTintEnabled;
            if (propId === 'edgeTintStrength') return params.edgeTintStrength;
            if (propId === 'grazingShineEnabled') return params.grazingShineEnabled;
            if (propId === 'grazingShine') return params.grazingShine;
            if (propId === 'grazingShineRoughness') return params.grazingShineRoughness;
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
                applyBladeGradientVertexColors(mesh.geometry, { baseColorHex: params.baseColorHex, tipColorHex: params.tipColorHex });
                return;
            }

            if (propId === 'tipColorHex') {
                const next = normalizeColorHex(value, tipColorProp.defaultValue);
                if (next === params.tipColorHex) return;
                params.tipColorHex = next;
                if (regions[1]) regions[1].color = next;
                applyBladeGradientVertexColors(mesh.geometry, { baseColorHex: params.baseColorHex, tipColorHex: params.tipColorHex });
                return;
            }

            if (propId === 'bladeHeightCm') {
                const next = clampNumber(value, bladeHeightCmProp);
                if (Math.abs(next - params.bladeHeightCm) < 1e-9) return;
                params.bladeHeightCm = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'baseWidthCm') {
                const next = clampNumber(value, baseWidthCmProp);
                if (Math.abs(next - params.baseWidthCm) < 1e-9) return;
                params.baseWidthCm = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'midWidthCm') {
                const next = clampNumber(value, midWidthCmProp);
                if (Math.abs(next - params.midWidthCm) < 1e-9) return;
                params.midWidthCm = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'tipStart01') {
                const next = clampNumber(value, tipStartProp);
                if (Math.abs(next - params.tipStart01) < 1e-9) return;
                params.tipStart01 = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'tipMode') {
                const next = normalizeEnumValue(value, tipModeProp.options, tipModeProp.defaultValue);
                if (next === params.tipMode) return;
                params.tipMode = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'tipWidthCm') {
                const next = clampNumber(value, tipWidthCmProp);
                if (Math.abs(next - params.tipWidthCm) < 1e-9) return;
                params.tipWidthCm = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'tipRoundness') {
                const next = clampNumber(value, tipRoundnessProp);
                if (Math.abs(next - params.tipRoundness) < 1e-9) return;
                params.tipRoundness = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'roughness') {
                const next = clampNumber(value, roughnessProp);
                if (Math.abs(next - params.roughness) < 1e-9) return;
                params.roughness = next;
                semanticMaterial.roughness = next;
                semanticMaterial.sheenRoughness = clamp(0.35 + next * 0.35, 0.05, 1);
                semanticMaterial.needsUpdate = true;
                for (const mat of solidMaterials) {
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
                semanticMaterial.metalness = next;
                semanticMaterial.needsUpdate = true;
                for (const mat of solidMaterials) {
                    if (!mat) continue;
                    mat.metalness = next;
                    mat.needsUpdate = true;
                }
                return;
            }

            if (propId === 'specularIntensity') {
                const next = clampNumber(value, specularIntensityProp);
                if (Math.abs(next - params.specularIntensity) < 1e-9) return;
                params.specularIntensity = next;
                semanticMaterial.specularIntensity = clamp(next, 0, 1);
                semanticMaterial.needsUpdate = true;
                return;
            }

            if (propId === 'curvature') {
                const next = clampNumber(value, curvatureProp);
                if (Math.abs(next - params.curvature) < 1e-9) return;
                params.curvature = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'bladeBendDegrees') {
                const next = clampNumber(value, bladeBendProp);
                if (Math.abs(next - params.bladeBendDegrees) < 1e-9) return;
                params.bladeBendDegrees = next;
                applyGeometryRebuild();
                return;
            }

            if (propId === 'edgeTintEnabled') {
                const next = normalizeBooleanValue(value);
                if (next === params.edgeTintEnabled) return;
                params.edgeTintEnabled = next;
                semanticMaterial.sheen = params.edgeTintEnabled ? clamp(params.edgeTintStrength, 0, 1) : 0;
                semanticMaterial.needsUpdate = true;
                return;
            }

            if (propId === 'edgeTintHex') {
                const next = normalizeColorHex(value, edgeTintProp.defaultValue);
                if (next === params.edgeTintHex) return;
                params.edgeTintHex = next;
                semanticMaterial.sheenColor?.setHex?.(next);
                semanticMaterial.needsUpdate = true;
                return;
            }

            if (propId === 'edgeTintStrength') {
                const next = clampNumber(value, edgeTintStrengthProp);
                if (Math.abs(next - params.edgeTintStrength) < 1e-9) return;
                params.edgeTintStrength = next;
                semanticMaterial.sheen = params.edgeTintEnabled ? clamp(next, 0, 1) : 0;
                semanticMaterial.needsUpdate = true;
                return;
            }

            if (propId === 'grazingShineEnabled') {
                const next = normalizeBooleanValue(value);
                if (next === params.grazingShineEnabled) return;
                params.grazingShineEnabled = next;
                semanticMaterial.clearcoat = params.grazingShineEnabled ? clamp(params.grazingShine, 0, 1) : 0;
                semanticMaterial.needsUpdate = true;
                return;
            }

            if (propId === 'grazingShine') {
                const next = clampNumber(value, grazingShineProp);
                if (Math.abs(next - params.grazingShine) < 1e-9) return;
                params.grazingShine = next;
                semanticMaterial.clearcoat = params.grazingShineEnabled ? clamp(next, 0, 1) : 0;
                semanticMaterial.needsUpdate = true;
                return;
            }

            if (propId === 'grazingShineRoughness') {
                const next = clampNumber(value, grazingShineRoughnessProp);
                if (Math.abs(next - params.grazingShineRoughness) < 1e-9) return;
                params.grazingShineRoughness = next;
                semanticMaterial.clearcoatRoughness = clamp(next, 0, 1);
                semanticMaterial.needsUpdate = true;
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
        name: 'Blade (hi-res)',
        source: { type: 'SoccerGrassBladeHiResMesh', version: 1 },
        regions,
        mesh,
        materials: { semantic: semanticMaterial, solid: solidMaterials }
    };
}
