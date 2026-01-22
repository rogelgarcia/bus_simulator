// src/graphics/visuals/city/RoadEngineRoads.js
// Renders CityMap roads using the RoadEngine compute pipeline (asphalt + decorations + debug metadata).

import * as THREE from 'three';
import { computeRoadEngineEdges } from '../../../app/road_engine/RoadEngineCompute.js';
import { buildRoadEnginePolygonMeshData } from '../../../app/road_engine/RoadEngineMeshData.js';
import { buildRoadEngineRoadsFromCityMap } from '../../../app/road_engine/RoadEngineCityMapAdapter.js';
import { buildRoadCurbMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/curbs/RoadCurbBuilder.js';
import { buildRoadSidewalkMeshDataFromRoadEnginePrimitives } from '../../../app/road_decoration/sidewalks/RoadSidewalkBuilder.js';
import { buildRoadMarkingsMeshDataFromRoadEngineDerived } from '../../../app/road_decoration/markings/RoadMarkingsBuilder.js';
import { createRoadMarkingsMeshesFromData } from './RoadMarkingsMeshes.js';

const EPS = 1e-9;

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function resolveRoadConfig(config) {
    const cfg = config && typeof config === 'object' ? config : {};
    const road = cfg.road && typeof cfg.road === 'object' ? cfg.road : {};
    const ground = cfg.ground && typeof cfg.ground === 'object' ? cfg.ground : {};
    const render = cfg.render && typeof cfg.render === 'object' ? cfg.render : {};
    return { cfg, road, ground, render };
}

function resolveMaterials(materials, { debugMode = false } = {}) {
    const base = materials && typeof materials === 'object' ? materials : {};
    const road = base.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95, metalness: 0.0 });
    const sidewalk = base.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 1.0, metalness: 0.0 });
    const curb = base.curb ?? new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.0 });
    const laneWhite = base.laneWhite ?? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.0 });
    const laneYellow = base.laneYellow ?? new THREE.MeshStandardMaterial({ color: 0xf2d34f, roughness: 0.35, metalness: 0.0 });

    if (!debugMode) return { road, sidewalk, curb, laneWhite, laneYellow };

    const toBasic = (mat) => {
        const c = mat?.color?.getHex?.() ?? 0xffffff;
        const out = new THREE.MeshBasicMaterial({ color: c, transparent: false, opacity: 1.0 });
        out.toneMapped = false;
        if (mat?.side != null) out.side = mat.side;
        if (mat?.polygonOffset) {
            out.polygonOffset = true;
            out.polygonOffsetFactor = mat.polygonOffsetFactor ?? 0;
            out.polygonOffsetUnits = mat.polygonOffsetUnits ?? 0;
        }
        return out;
    };

    return {
        road: toBasic(road),
        sidewalk: toBasic(sidewalk),
        curb: toBasic(curb),
        laneWhite: toBasic(laneWhite),
        laneYellow: toBasic(laneYellow)
    };
}

function buildCombinedPolygonGeometry(polygonMeshData, y) {
    const list = Array.isArray(polygonMeshData) ? polygonMeshData : [];
    let totalVerts = 0;
    let totalIndices = 0;
    for (const mesh of list) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : [];
        const indices = Array.isArray(mesh?.indices) ? mesh.indices : [];
        if (vertices.length < 3 || indices.length < 3) continue;
        totalVerts += vertices.length;
        totalIndices += indices.length;
    }
    if (!totalVerts || !totalIndices) return null;

    const positions = new Float32Array(totalVerts * 3);
    const use32 = totalVerts > 65535;
    const indices = use32 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;
    for (const mesh of list) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : [];
        const inds = Array.isArray(mesh?.indices) ? mesh.indices : [];
        if (vertices.length < 3 || inds.length < 3) continue;

        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i];
            const base = (vOffset + i) * 3;
            positions[base] = Number(p?.x) || 0;
            positions[base + 1] = y;
            positions[base + 2] = Number(p?.z) || 0;
        }

        for (let i = 0; i < inds.length; i++) {
            indices[iOffset + i] = vOffset + (inds[i] | 0);
        }

        vOffset += vertices.length;
        iOffset += inds.length;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
}

function buildDebugEdgesFromDerived(derived) {
    const edges = [];
    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const roads = Array.isArray(derived?.roads) ? derived.roads : [];
    const roadNameById = new Map(roads.map((road) => [road?.id ?? null, road?.name ?? null]));

    for (const seg of segments) {
        const edgeId = seg?.id ?? null;
        const a = seg?.aPointId ?? null;
        const b = seg?.bPointId ?? null;
        if (!edgeId || !a || !b) continue;

        const pieces = Array.isArray(seg?.keptPieces) ? seg.keptPieces : [];
        if (!pieces.length) continue;

        let startPiece = null;
        let endPiece = null;
        for (const piece of pieces) {
            const t0 = Number(piece?.t0) || 0;
            const t1 = Number(piece?.t1) || 0;
            if (!startPiece || t0 < (Number(startPiece?.t0) || 0) - 1e-9) startPiece = piece;
            if (!endPiece || t1 > (Number(endPiece?.t1) || 0) + 1e-9) endPiece = piece;
        }

        const startCorners = Array.isArray(startPiece?.corners) ? startPiece.corners : [];
        const endCorners = Array.isArray(endPiece?.corners) ? endPiece.corners : [];
        if (startCorners.length !== 4 || endCorners.length !== 4) continue;

        const aWorld = seg?.aWorld ?? null;
        const bWorld = seg?.bWorld ?? null;
        if (!aWorld || !bWorld) continue;

        const halfLeft = Number(seg?.asphaltObb?.halfWidthLeft) || 0;
        const halfRight = Number(seg?.asphaltObb?.halfWidthRight) || 0;
        const width = Math.max(0, halfLeft + halfRight);
        const tag = roadNameById.get(seg?.roadId ?? null) ?? null;

        edges.push({
            edgeId,
            sourceId: seg?.roadId ?? null,
            a,
            b,
            tag: typeof tag === 'string' && tag.trim() ? tag.trim() : null,
            rendered: true,
            lanesF: seg?.lanesF ?? 0,
            lanesB: seg?.lanesB ?? 0,
            width,
            centerline: {
                a: { x: Number(aWorld.x) || 0, z: Number(aWorld.z) || 0 },
                b: { x: Number(bWorld.x) || 0, z: Number(bWorld.z) || 0 }
            },
            left: {
                a: { x: Number(startCorners[0]?.x) || 0, z: Number(startCorners[0]?.z) || 0 },
                b: { x: Number(endCorners[3]?.x) || 0, z: Number(endCorners[3]?.z) || 0 }
            },
            right: {
                a: { x: Number(startCorners[1]?.x) || 0, z: Number(startCorners[1]?.z) || 0 },
                b: { x: Number(endCorners[2]?.x) || 0, z: Number(endCorners[2]?.z) || 0 }
            }
        });
    }

    return edges;
}

function buildDebugIntersectionsFromDerived(derived) {
    const out = [];
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    for (const junction of junctions) {
        const surface = junction?.surface?.points ?? null;
        if (!Array.isArray(surface) || surface.length < 3) continue;
        out.push({
            id: junction?.id ?? null,
            points: surface.map((p) => ({ x: Number(p?.x) || 0, z: Number(p?.z) || 0 }))
        });
    }
    return out;
}

function buildDebugCornerJoinsFromDerived(derived) {
    const out = [];
    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const segmentById = new Map(segments.map((seg) => [seg?.id ?? null, seg]));
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];

    for (const junction of junctions) {
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        if (endpoints.length !== 2) continue;

        const nodeIds = [];
        for (const ep of endpoints) {
            const seg = segmentById.get(ep?.segmentId ?? null) ?? null;
            if (!seg) continue;
            if (ep?.end === 'a' && seg.aPointId) nodeIds.push(seg.aPointId);
            if (ep?.end === 'b' && seg.bPointId) nodeIds.push(seg.bPointId);
        }

        const uniq = Array.from(new Set(nodeIds));
        if (nodeIds.length !== 2 || uniq.length !== 1) continue;
        const nodeId = uniq[0];

        const endpointById = new Map(endpoints.map((ep) => [ep?.id ?? null, ep]));
        const connections = [];
        const tat = Array.isArray(junction?.tat) ? junction.tat : [];
        for (const entry of tat) {
            const aSide = entry?.aSide ?? null;
            const bSide = entry?.bSide ?? null;
            if (aSide !== 'left' && aSide !== 'right') continue;
            if (bSide !== 'left' && bSide !== 'right') continue;
            const aEp = endpointById.get(entry?.aEndpointId ?? null) ?? null;
            const bEp = endpointById.get(entry?.bEndpointId ?? null) ?? null;
            if (!aEp?.segmentId || !bEp?.segmentId) continue;
            connections.push({
                a: { edgeId: aEp.segmentId, side: aSide },
                b: { edgeId: bEp.segmentId, side: bSide }
            });
        }

        if (!connections.length) continue;

        out.push({
            nodeId,
            junctionId: junction?.id ?? null,
            connections
        });
    }

    out.sort((a, b) => String(a?.nodeId ?? '').localeCompare(String(b?.nodeId ?? '')));
    return out;
}

function buildCurbConnectorsFromDerived(derived) {
    const connectors = [];
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    for (const junction of junctions) {
        const endpointById = new Map();
        for (const ep of junction?.endpoints ?? []) {
            if (!ep?.id || !ep?.world || !ep?.dirOut) continue;
            endpointById.set(ep.id, ep);
        }
        for (const conn of junction?.connectors ?? []) {
            const a = endpointById.get(conn?.aEndpointId ?? null) ?? null;
            const b = endpointById.get(conn?.bEndpointId ?? null) ?? null;
            if (!a || !b) continue;

            const ax = Number(a.world.x) || 0;
            const az = Number(a.world.z) || 0;
            const bx = Number(b.world.x) || 0;
            const bz = Number(b.world.z) || 0;
            const dx = bx - ax;
            const dz = bz - az;
            const dist = Math.hypot(dx, dz);
            if (!(dist > 1e-6)) continue;
            const inv = 1 / dist;
            const dir2 = new THREE.Vector2(dx * inv, dz * inv);

            const connectorGeom = {
                segments: [
                    {
                        type: 'STRAIGHT',
                        startPoint: new THREE.Vector2(ax, az),
                        endPoint: new THREE.Vector2(bx, bz),
                        length: dist,
                        direction: dir2
                    }
                ]
            };

            connectors.push({
                id: conn?.id ?? null,
                tag: 'junction',
                p0: {
                    x: ax,
                    z: az,
                    arrowRole: 'p0',
                    arrowDir: { x: Number(a.dirOut.x) || 0, z: Number(a.dirOut.z) || 0 },
                    connector: connectorGeom
                },
                p1: {
                    x: bx,
                    z: bz,
                    arrowRole: 'p1',
                    arrowDir: { x: Number(b.dirOut.x) || 0, z: Number(b.dirOut.z) || 0 },
                    connector: connectorGeom
                },
                dir0: { x: Number(a.dirOut.x) || 0, z: Number(a.dirOut.z) || 0 },
                dir1: { x: Number(b.dirOut.x) || 0, z: Number(b.dirOut.z) || 0 },
                connector: connectorGeom
            });
        }
    }
    connectors.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
    return connectors;
}

export function createRoadEngineRoads({
    map = null,
    roads = null,
    config = null,
    materials = null,
    options = null
} = {}) {
    const { road: roadCfg, ground: groundCfg, render } = resolveRoadConfig(config);
    const tileSize = Math.max(EPS, clampNumber(map?.tileSize, 1));
    const origin = map?.origin ?? { x: 0, z: 0 };

    const debugMode = (render?.roadMode ?? null) === 'debug';
    const mats = resolveMaterials(materials, { debugMode });

    const opt = options && typeof options === 'object' ? options : {};
    const includeCurbs = opt.includeCurbs !== false;
    const includeSidewalks = opt.includeSidewalks !== false;
    const includeMarkings = opt.includeMarkings !== false;
    const includeJunctions = opt.includeJunctions !== false;
    const includeDebug = opt.includeDebug !== false;

    const laneWidth = Math.max(EPS, clampNumber(roadCfg?.laneWidth, 4.8));
    const shoulder = Math.max(0, clampNumber(roadCfg?.shoulder, 0.525));
    const marginFactor = shoulder / laneWidth;

    const baseRoadY = clampNumber(roadCfg?.surfaceY, 0.02);
    const groundY = clampNumber(groundCfg?.surfaceY, baseRoadY);

    const asphaltLift = Math.max(0.001, laneWidth * 0.0005);
    const asphaltY = baseRoadY + asphaltLift;
    const markingLift = Math.max(0.001, clampNumber(roadCfg?.markings?.lift, 0.003));
    const markingY = asphaltY + markingLift;
    const paintLift = Math.max(0.0005, markingLift * 0.25);
    const arrowY = markingY + paintLift;
    const crosswalkY = markingY + paintLift;

    const curbThickness = Math.max(0, clampNumber(roadCfg?.curb?.thickness, 0.48));
    const curbHeight = Math.max(0, clampNumber(roadCfg?.curb?.height, 0.17));
    const curbExtraHeight = Math.max(0, clampNumber(roadCfg?.curb?.extraHeight, 0));
    const curbSink = Math.max(0, clampNumber(roadCfg?.curb?.sink, 0));
    const sidewalkWidth = Math.max(0, clampNumber(roadCfg?.sidewalk?.extraWidth, 0));
    const sidewalkLift = Math.max(0, clampNumber(roadCfg?.sidewalk?.lift, 0));

    const junctionCfg = (roadCfg?.junctions && typeof roadCfg.junctions === 'object') ? roadCfg.junctions : null;
    const junctionSettings = includeJunctions ? { enabled: true, autoCreate: true } : { enabled: false };
    if (includeJunctions && junctionCfg) {
        if (Object.prototype.hasOwnProperty.call(junctionCfg, 'enabled')) {
            junctionSettings.enabled = junctionCfg.enabled !== false;
        }
        if (Object.prototype.hasOwnProperty.call(junctionCfg, 'autoCreate')) {
            junctionSettings.autoCreate = junctionCfg.autoCreate === true;
        }
        const thresholdFactor = Number(junctionCfg.thresholdFactor);
        if (Number.isFinite(thresholdFactor)) junctionSettings.thresholdFactor = thresholdFactor;
        const filletRadiusFactor = Number(junctionCfg.filletRadiusFactor);
        if (Number.isFinite(filletRadiusFactor)) junctionSettings.filletRadiusFactor = filletRadiusFactor;
        const minThreshold = Number(junctionCfg.minThreshold);
        if (Number.isFinite(minThreshold)) junctionSettings.minThreshold = minThreshold;
        const maxThreshold = Number(junctionCfg.maxThreshold);
        if (Number.isFinite(maxThreshold)) junctionSettings.maxThreshold = maxThreshold;
    }

    const roadSchema = Array.isArray(roads)
        ? roads
        : (map ? buildRoadEngineRoadsFromCityMap(map) : []);

    const derived = computeRoadEngineEdges({
        roads: roadSchema,
        settings: {
            tileSize,
            laneWidth,
            marginFactor,
            origin,
            flags: {
                centerline: false,
                directionCenterlines: false,
                laneEdges: false,
                asphaltEdges: false,
                markers: false,
                asphaltObb: false
            },
            junctions: junctionSettings,
            trim: { enabled: true }
        }
    });

    const group = new THREE.Group();
    group.name = 'Roads';

    const primitives = Array.isArray(derived?.primitives) ? derived.primitives : [];
    const asphaltPolys = primitives.filter((p) => p?.type === 'polygon' && (p.kind === 'asphalt_piece' || p.kind === 'junction_surface'));

    const polygonMeshData = buildRoadEnginePolygonMeshData(asphaltPolys);
    const geo = buildCombinedPolygonGeometry(polygonMeshData, asphaltY);
    const asphaltMesh = geo ? new THREE.Mesh(geo, mats.road) : null;
    if (asphaltMesh) {
        asphaltMesh.name = 'Asphalt';
        asphaltMesh.receiveShadow = true;
        asphaltMesh.renderOrder = 0;
        group.add(asphaltMesh);
    }

    let curbMesh = null;
    if (includeCurbs && curbThickness > EPS && curbHeight > EPS && asphaltPolys.length) {
        const curbData = buildRoadCurbMeshDataFromRoadEnginePrimitives(asphaltPolys, {
            surfaceY: asphaltY,
            curbThickness,
            curbHeight,
            curbExtraHeight,
            curbSink,
            boundaryEpsilon: 1e-4,
            miterLimit: 4
        });
        if (curbData?.positions?.length) {
            const curbGeo = new THREE.BufferGeometry();
            curbGeo.setAttribute('position', new THREE.BufferAttribute(curbData.positions, 3));
            curbGeo.computeVertexNormals();
            curbGeo.computeBoundingSphere();
            curbMesh = new THREE.Mesh(curbGeo, mats.curb);
            curbMesh.name = 'CurbBlocks';
            curbMesh.receiveShadow = true;
            curbMesh.renderOrder = 0.5;
            group.add(curbMesh);
        }
    }

    let sidewalkMesh = null;
    if (includeSidewalks && sidewalkWidth > EPS && asphaltPolys.length) {
        const sidewalkData = buildRoadSidewalkMeshDataFromRoadEnginePrimitives(asphaltPolys, {
            surfaceY: asphaltY,
            curbThickness,
            curbHeight: curbHeight + curbExtraHeight,
            sidewalkWidth,
            sidewalkLift,
            boundaryEpsilon: 1e-4,
            miterLimit: 4
        });
        if (sidewalkData?.positions?.length) {
            const sidewalkGeo = new THREE.BufferGeometry();
            sidewalkGeo.setAttribute('position', new THREE.BufferAttribute(sidewalkData.positions, 3));
            sidewalkGeo.computeVertexNormals();
            sidewalkGeo.computeBoundingSphere();
            sidewalkMesh = new THREE.Mesh(sidewalkGeo, mats.sidewalk);
            sidewalkMesh.name = 'Sidewalk';
            sidewalkMesh.receiveShadow = true;
            sidewalkMesh.renderOrder = 0.75;
            group.add(sidewalkMesh);
        }
    }

    const markingsGroup = new THREE.Group();
    markingsGroup.name = 'Markings';
    markingsGroup.renderOrder = 1;
    group.add(markingsGroup);

    let markings = null;
    if (includeMarkings) {
        markings = buildRoadMarkingsMeshDataFromRoadEngineDerived(derived, {
            laneWidth,
            markingY,
            arrowY,
            crosswalkY,
            boundaryEpsilon: 1e-4
        });

        const meshes = createRoadMarkingsMeshesFromData(markings, {
            laneWidth,
            materials: { white: mats.laneWhite, yellow: mats.laneYellow },
            renderOrder: { white: 1.1, yellow: 1.15, crosswalk: 1.2, arrow: 1.25 }
        });

        if (meshes.markingsWhite) markingsGroup.add(meshes.markingsWhite);
        if (meshes.markingsYellow) markingsGroup.add(meshes.markingsYellow);
        if (meshes.crosswalks) markingsGroup.add(meshes.crosswalks);
        if (meshes.arrows) markingsGroup.add(meshes.arrows);
    }

    const debug = includeDebug ? {
        source: 'road_engine',
        derived,
        edges: buildDebugEdgesFromDerived(derived),
        cornerJoins: buildDebugCornerJoinsFromDerived(derived),
        intersections: buildDebugIntersectionsFromDerived(derived),
        groundY,
        asphaltY
    } : null;

    const curbConnectors = includeDebug ? buildCurbConnectorsFromDerived(derived) : [];

    return {
        group,
        asphalt: asphaltMesh,
        curbBlocks: curbMesh,
        sidewalk: sidewalkMesh,
        markingsWhite: markingsGroup.getObjectByName('MarkingsWhite') ?? null,
        markingsYellow: markingsGroup.getObjectByName('MarkingsYellow') ?? null,
        curbConnectors,
        debug
    };
}
