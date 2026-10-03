// Soil-rooted leaf blades with a fixed cross-section and no sheath or axial twist.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2RibbonLod2Geometry, fitGrassDebugV2RibbonLod2Root } from './GrassDebugV2RibbonLod2.js?v=lod2-color-1';
import { fitGrassDebugV2RibbonRoot } from './GrassDebugV2RibbonRoot.js?v=root-fit-1';
import { clipGrassDebugV2MeshAtSoil } from './GrassDebugV2SoilClip.js';
import { sampleGrassDebugV2ShootColor } from './GrassDebugV2ShootAppearance.js';

const SOURCE_LEAF = Object.freeze({ width: 0.0045, rise: 0.047, openHalfAngleDegrees: 80,
    tipStart: 0.84, backwardBendDegrees: 0 });
const PAIRED_LEAF = Object.freeze({ ...SOURCE_LEAF, backwardBendDegrees: 11 });

export const GRASS_V2_RIBBON_SHOOT = Object.freeze({
    bladeSegments: 11, tipSegments: 4, tipSamplingStart: 0.9, acrossSegments: 2,
    maximumTrianglesPerLeaf: 50, rootGapMeters: 0.0002,
    sourceLeaf: SOURCE_LEAF, pairedLeaf: PAIRED_LEAF,
    specimens: Object.freeze([
        { id: 'young-reference', x: 0, leaves: [
            { id: 'young', size: 1, tiltDegrees: 0 }
        ] },
        { id: 'two-leaf-shoot', x: 0.035, leaves: [
            { id: 'older', size: 1.05, tiltDegrees: 12 },
            { id: 'second', size: 1, tiltDegrees: -12, mirrored: true }
        ] }
    ].map(specimen => Object.freeze({ ...specimen, leaves: Object.freeze(specimen.leaves.map(leaf => Object.freeze(leaf))) })))
});


// Two interleaved V pairs: the second root is 1 cm right and 1 cm behind the first.
export const GRASS_V2_RIBBON_TUFT = Object.freeze({
    leaves: 4, pairSpacingMeters: 0.01, pairDepthMeters: 0.01,
    specimens: Object.freeze([
        { id: 'front-pair', x: -0.005, z: 0.005 },
        { id: 'rear-pair', x: 0.005, z: -0.005 }
    ].map(pair => Object.freeze({ ...pair, leaves: GRASS_V2_RIBBON_SHOOT.specimens[1].leaves })))
});

function bladeLengthRatio(v) { return 1.02 * v - 0.02 * v * v * v; }

function bladeStationAtLength(length) {
    let v = length;
    for (let i = 0; i < 4; i++) v -= (bladeLengthRatio(v) - length) / (1.02 - 0.06 * v * v);
    return v;
}

const LOD1_TIP_START = GRASS_V2_RIBBON_SHOOT.tipSamplingStart;
// Extend the lower section by the cap's shortening, preserving the middle spine length.
const LOD1_BODY_STATIONS = Object.freeze([0,
    bladeStationAtLength(bladeLengthRatio(LOD1_TIP_START) - (bladeLengthRatio(0.84) - bladeLengthRatio(0.42))),
    LOD1_TIP_START]);

const SMART_BODY_TOP_SPLIT = GRASS_V2_RIBBON_SHOOT.tipSamplingStart * 5 / 7;
const SMART_BODY_STATIONS = Object.freeze([0,
    bladeStationAtLength(2 * bladeLengthRatio(SMART_BODY_TOP_SPLIT) - bladeLengthRatio(GRASS_V2_RIBBON_SHOOT.tipSamplingStart)),
    SMART_BODY_TOP_SPLIT, GRASS_V2_RIBBON_SHOOT.tipSamplingStart]);

export const GRASS_V2_RIBBON_LODS = Object.freeze({
    LOD0: GRASS_V2_RIBBON_SHOOT,
    LOD0_SMART: Object.freeze({ ...GRASS_V2_RIBBON_SHOOT, bladeSegments: 7, bodyStations: SMART_BODY_STATIONS,
        tipTopology: 'silhouette-fan', tipRimStation: 0.955, shoulderWidthScale: 1.03, rootTopology: 'edge-fit', maximumTrianglesPerLeaf: 18 }),
    LOD1: Object.freeze({ ...GRASS_V2_RIBBON_SHOOT,
        bladeSegments: 4, tipSegments: 2, tipSamplingStart: LOD1_TIP_START, tipTopology: 'offset-corners', tipCornerStation: 0.94, tipCornerWidthScale: 1.12,
        rootTopology: 'edge-fit', maximumTrianglesPerLeaf: 10,
        bodyStations: LOD1_BODY_STATIONS }),
    LOD2: Object.freeze({ ...GRASS_V2_RIBBON_SHOOT, topology: 'two-face',
        maximumTrianglesPerLeaf: 2, shortEdgeStation: 0.94, topWidthScale: 0.9, foldDegrees: 12 }),
    LOD3: Object.freeze({ ...GRASS_V2_RIBBON_SHOOT, topology: 'alpha-card', maximumTrianglesPerLeaf: 0.5, maximumTrianglesPerCard: 2 })
});

function makeLeaf(recipe, definition) {
    if (definition.topology === 'two-face') return createGrassDebugV2RibbonLod2Geometry(recipe, definition);
    const { bladeSegments: segments, tipSegments, tipSamplingStart, acrossSegments } = definition;
    const stride = acrossSegments + 2, creaseColumn = acrossSegments / 2, bodySegments = segments - tipSegments;
    const halfAngle = THREE.MathUtils.degToRad(recipe.openHalfAngleDegrees);
    const halfWidth = recipe.width * 0.5 * Math.sin(halfAngle), depth = recipe.width * 0.5 * Math.cos(halfAngle);
    const curvature = THREE.MathUtils.degToRad(recipe.backwardBendDegrees) / recipe.rise;
    const positions = [], colors = [], uvs = [], indices = [], color = new THREE.Color();
    for (let row = 0; row <= segments; row++) {
        const v = definition.tipCornerStation && row === segments - 1 ? definition.tipCornerStation : definition.tipRimStation && row === bodySegments + 2 ? definition.tipRimStation : row <= bodySegments ? (definition.bodyStations ? definition.bodyStations[row] : tipSamplingStart * row / bodySegments)
            : tipSamplingStart + (1 - tipSamplingStart) * Math.sin((row - bodySegments) / tipSegments * Math.PI / 2);
        const taper = THREE.MathUtils.clamp((v - recipe.tipStart) / (1 - recipe.tipStart), 0, 1);
        const envelope = Math.sqrt(1 - taper * taper) * (row === bodySegments ? definition.shoulderWidthScale ?? 1 : row === segments - 1 ? definition.tipCornerWidthScale ?? 1 : 1);
        const length = recipe.rise * (1.02 * v - 0.02 * v * v * v), angle = curvature * length;
        const spineY = curvature ? Math.sin(angle) / curvature : length;
        const spineZ = curvature ? -(1 - Math.cos(angle)) / curvature : 0;
        sampleGrassDebugV2ShootColor(v, color);
        const count = row === segments ? 1 : stride;
        for (let column = 0; column < count; column++) {
            const u = count === 1 ? 0.5 : (column <= creaseColumn ? column : column - 1) / acrossSegments, s = 2 * u - 1;
            const wingDepth = depth * Math.abs(s) * envelope;
            positions.push(-halfWidth * s * envelope, spineY + wingDepth * Math.sin(angle), spineZ + wingDepth * Math.cos(angle));
            colors.push(color.r, color.g, color.b);
            uvs.push(u, 0.18 + 0.82 * v);
        }
    }
    for (let row = 0; row < segments - 1; row++) for (let column = 0; column < stride - 1; column++) {
        if (column === creaseColumn) continue;
        const a = row * stride + column, b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    for (let column = 0; column < stride - 1; column++) if (column !== creaseColumn)
        indices.push((segments - 1) * stride + column, segments * stride, (segments - 1) * stride + column + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // Independent sheet tangents preserve the central crease on the sparse grid.
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    const lengthDirection = new THREE.Vector3(), widthDirection = new THREE.Vector3();
    const previous = new THREE.Vector3(), next = new THREE.Vector3(), sheetNormal = new THREE.Vector3();
    for (let row = 0; row < segments; row++) for (const [first, last] of [[0, creaseColumn], [creaseColumn + 1, stride - 1]]) {
        widthDirection.fromBufferAttribute(position, row * stride + last)
            .sub(previous.fromBufferAttribute(position, row * stride + first));
        for (let column = first; column <= last; column++) {
            previous.fromBufferAttribute(position, Math.max(0, row - 1) * stride + column);
            next.fromBufferAttribute(position, row === segments - 1 ? segments * stride : (row + 1) * stride + column);
            lengthDirection.subVectors(next, previous);
            sheetNormal.crossVectors(lengthDirection, widthDirection).normalize();
            normal.setXYZ(row * stride + column, sheetNormal.x, sheetNormal.y, sheetNormal.z);
        }
    }
    if (definition.tipTopology === 'offset-corners') {
        const base = (bodySegments - 1) * stride, center = bodySegments * stride + creaseColumn;
        const rim = (segments - 1) * stride, tip = segments * stride;
        indices.length = (bodySegments - 1) * acrossSegments * 6;
        indices.push(base, rim, center, base, center, base + 1,
            base + 2, center + 1, base + 3, base + 3, center + 1, rim + 3,
            rim, tip, center, center + 1, tip, rim + 3);
        geometry.setIndex(indices);
    }
    if (definition.tipTopology === 'silhouette-fan') {
        // Three mirrored body quads meet the preserved cap directly.
        const shoulder = bodySegments * stride, tip = segments * stride;
        indices.length = 0;
        for (let row = 0; row < bodySegments; row++) {
            const base = row * stride, top = base + stride;
            indices.push(base, top, top + 1, base, top + 1, base + 1,
                base + 2, top + 2, base + 3, base + 3, top + 2, top + 3);
        }
        indices.push(shoulder, tip, shoulder + 1, shoulder + 2, tip, shoulder + 3);
        for (let row = bodySegments; row < segments - 1; row += row === bodySegments ? 2 : 1) {
            const edge = row * stride, next = (row + (row === bodySegments ? 2 : 1)) * stride;
            indices.push(edge, next, tip, edge + 3, tip, next + 3);
        }
        geometry.setIndex(indices);
    }
    geometry.setAttribute('grassFacingNormal', normal.clone());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

/** @param {{material: THREE.MeshStandardMaterial, lod?: 'LOD0'|'LOD0_SMART'|'LOD1'|'LOD2'|'LOD3', cardTemplates?: readonly THREE.BufferGeometry[], layout?: 'study'|'tuft', leafScale?: number}} options */
export function createGrassDebugV2RibbonShoot({ material, lod = 'LOD0', cardTemplates = null, layout = lod === 'LOD3' ? 'tuft' : 'study', leafScale = 1 }) {
    if (!Object.hasOwn(GRASS_V2_RIBBON_LODS, lod)) throw new Error('Unknown ribbon LOD: ' + lod);
    if (!['study', 'tuft'].includes(layout) || lod === 'LOD3' && layout !== 'tuft') throw new Error('Unknown ribbon layout.');
    if (!(leafScale > 0)) throw new Error('Leaf scale must be positive.');
    const definition = GRASS_V2_RIBBON_LODS[lod];
    if (!material?.isMeshStandardMaterial || !material.vertexColors)
        throw new Error('Ribbon shoot requires a standard vertex-color material.');
    const group = new THREE.Group(); group.name = 'GrassV2RibbonShoot';
    const { specimens: studySpecimens, sourceLeaf, pairedLeaf, rootGapMeters, maximumTrianglesPerLeaf } = definition;
    const specimens = layout === 'tuft' ? GRASS_V2_RIBBON_TUFT.specimens : studySpecimens;
    if (lod === 'LOD3' && (!cardTemplates || cardTemplates.length !== 1 || cardTemplates.some(g => g.index?.count !== 6)))
        throw new Error('LOD3 requires one four-leaf LOD0-projected card template.');
    const templates = lod === 'LOD3' ? cardTemplates.map(g => g.clone()) : [makeLeaf(sourceLeaf, definition), makeLeaf(pairedLeaf, definition)];
    const leaves = lod === 'LOD3' ? [new THREE.Mesh(templates[0].clone(), material)] : specimens.flatMap(specimen => {
        const paired = specimen.leaves.length === 2;
        const halfWidth = sourceLeaf.width * 0.5 * Math.sin(THREE.MathUtils.degToRad(sourceLeaf.openHalfAngleDegrees));
        const rootSpacing = paired ? rootGapMeters + specimen.leaves.reduce((total, pose) =>
            total + halfWidth * pose.size * leafScale * Math.cos(THREE.MathUtils.degToRad(pose.tiltDegrees)), 0) : 0;
        return specimen.leaves.map((pose, i) => {
            const leaf = new THREE.Mesh(templates[paired ? 1 : 0].clone(), material);
            leaf.name = leaf.geometry.name = 'GrassV2RibbonLeaf-' + pose.id;
            leaf.rotation.z = THREE.MathUtils.degToRad(pose.tiltDegrees);
            leaf.scale.set((pose.mirrored ? -pose.size : pose.size) * leafScale, pose.size * leafScale, pose.size * leafScale);
            leaf.position.set(specimen.x + (paired ? (i ? 1 : -1) * rootSpacing * 0.5 : 0), 0, specimen.z ?? 0);
            leaf.castShadow = leaf.receiveShadow = true;
            leaf.userData.specimenId = specimen.id; leaf.userData.pose = pose;
            return leaf;
        });
    });
    templates.forEach(geometry => geometry.dispose());
    leaves.forEach((leaf, index) => {
        leaf.userData.leafId = index;
        leaf.castShadow = leaf.receiveShadow = true;
    });
    if (lod === 'LOD3') leaves[0].name = 'GrassV2FourLeafCard';
    group.add(...leaves);
    const bounds = new THREE.Box3().setFromObject(group);
    return Object.freeze({
        group, leaves: Object.freeze(leaves), crowns: Object.freeze([]),
        roots: Object.freeze(specimens.map(specimen => specimen.x)), bakeMeshes: Object.freeze([...leaves]),
        trimAtSoil: heightAt => {
            for (const leaf of leaves) {
                if (lod === 'LOD2' || lod === 'LOD3') fitGrassDebugV2RibbonLod2Root(leaf, heightAt);
                else if (lod === 'LOD0') clipGrassDebugV2MeshAtSoil(leaf, heightAt);
                else fitGrassDebugV2RibbonRoot(leaf, heightAt);
                if (leaf.geometry.index.count / 3 > (definition.maximumTrianglesPerCard ?? maximumTrianglesPerLeaf))
                    throw new Error(lod + ' soil-clipped leaf exceeds the ' + maximumTrianglesPerLeaf + '-triangle budget.');
            }
            bounds.setFromObject(group);
        },
        getSnapshot: () => ({
            model: 'leaf-growth-comparison', stage: 'soil-rooted-blades', specimens: specimens.length,
            layout, leafScale, leaves: lod === 'LOD3' ? 4 : leaves.length, cards: lod === 'LOD3' ? 1 : 0, matureLeaves: 0, emergingLeaves: lod === 'LOD3' ? 4 : leaves.length,
            lod, definition, contacts: [], crownTriangles: 0,
            leafTriangles: leaves.reduce((total, leaf) => total + leaf.geometry.index.count / 3, 0),
            trianglesPerLeaf: lod === 'LOD3' ? [] : leaves.map(leaf => leaf.geometry.index.count / 3),
            trianglesPerCard: lod === 'LOD3' ? [2] : [],
            pairRoots: specimens.map(specimen => ({ x: specimen.x, z: specimen.z ?? 0 })),
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }
        }),
        dispose: () => leaves.forEach(leaf => leaf.geometry.dispose())
    });
}
