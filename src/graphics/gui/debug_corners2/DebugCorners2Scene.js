// src/graphics/gui/debug_corners2/DebugCorners2Scene.js
// Builds the two-road debug scene and renders asphalt using the shared road generator.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createRoadNetworkFromWorldSegments } from '../../../app/city/roads/RoadNetwork.js';
import { generateRoadsFromRoadNetwork } from '../../assets3d/generators/road2/CenterlineRoadGenerator.js';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { createCityWorld } from '../../assets3d/generators/TerrainGenerator.js';
import { createPoleMarkerAssets, createPoleMarkerGroup } from '../../visuals/shared/PoleMarkerGroup.js';

const EPS = 1e-9;

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(v) | 0));
}

function yawDirXZ(yaw) {
    return { x: Math.cos(yaw), z: Math.sin(yaw) };
}

function roadWidthFromLanes({ lanes, laneWidth, shoulder }) {
    const ln = clampInt(lanes, 1, 99);
    const lw = Number.isFinite(laneWidth) ? laneWidth : 4.8;
    const sh = Number.isFinite(shoulder) ? shoulder : 0;
    return Math.max(lw, ln * lw + sh * 2);
}

function buildLine2({ color, lineWidth = 4, opacity = 0.95, y = 0.04, renderOrder = 10 } = {}) {
    const geo = new LineGeometry();
    geo.setPositions([0, y, 0, 0, y, 0]);
    const mat = new LineMaterial({
        color,
        linewidth: lineWidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    line.frustumCulled = false;
    line.renderOrder = renderOrder;
    return { line, geo, mat };
}

function setLinePositions(line2, points) {
    if (!line2?.geometry?.setPositions) return;
    const flat = [];
    for (const p of points) {
        if (!p) continue;
        const z = Number.isFinite(p.z) ? p.z : p.y;
        if (!Number.isFinite(p.x) || !Number.isFinite(z) || !Number.isFinite(p.y)) continue;
        flat.push(p.x, p.y, z);
    }
    line2.geometry.setPositions(flat.length >= 6 ? flat : [0, points?.[0]?.y ?? 0, 0, 0, points?.[0]?.y ?? 0, 0]);
    line2.computeLineDistances?.();
}

function buildRoadGeom(view, road) {
    const lanes = clampInt(road?.lanes ?? 2, 1, 20);
    const yaw = Number.isFinite(road?.yaw) ? road.yaw : 0;
    const startPos = view?._pivot ?? new THREE.Vector3();
    const dir = yawDirXZ(yaw);
    const width = roadWidthFromLanes({ lanes, laneWidth: view._laneWidth, shoulder: view._shoulder });
    const len = Number.isFinite(view._segmentLen) ? view._segmentLen : 40;
    const start = { x: startPos.x, z: startPos.z };
    const end = { x: start.x + dir.x * len, z: start.z + dir.z * len };

    return {
        lanes,
        yaw,
        width,
        start,
        end,
        dir
    };
}

function disposeMaterial(m) {
    if (!m) return;
    const maps = ['map', 'alphaMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap'];
    for (const key of maps) {
        const tex = m[key];
        if (tex?.dispose) tex.dispose();
    }
    m.dispose?.();
}

function disposeObject3D(obj, { disposeMaterials = true } = {}) {
    if (!obj?.traverse) return;
    obj.traverse((child) => {
        child?.geometry?.dispose?.();
        if (!disposeMaterials) return;
        const mat = child?.material ?? null;
        if (Array.isArray(mat)) {
            for (const entry of mat) disposeMaterial(entry);
        } else {
            disposeMaterial(mat);
        }
    });
}

function bestEdgeForSource(edges, sourceId) {
    const list = Array.isArray(edges) ? edges : [];
    let best = null;
    let bestLen = -Infinity;
    for (const e of list) {
        if (e?.sourceId !== sourceId) continue;
        const a = e?.centerline?.a ?? null;
        const b = e?.centerline?.b ?? null;
        if (!a || !b) continue;
        const len = Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.z ?? 0) - (a.z ?? 0));
        if (len > bestLen) {
            bestLen = len;
            best = e;
        }
    }
    return best;
}

function nodeIdAtPivot(network, pivot) {
    const nodes = network?.getNodes?.() ?? [];
    for (const node of nodes) {
        const p = node?.position ?? null;
        if (!p) continue;
        if (Math.hypot((p.x ?? 0) - pivot.x, (p.z ?? 0) - pivot.z) <= 1e-6) return node.id;
    }
    return null;
}

function makeSegments(view) {
    const pivot = view?._pivot ?? new THREE.Vector3();
    const len = Number.isFinite(view?._segmentLen) ? view._segmentLen : 60;

    const out = [];
    for (const road of view?._roads ?? []) {
        const geom = buildRoadGeom(view, road);
        const lanesTotal = clampInt(road?.lanes ?? 2, 1, 99);
        const lanesF = Math.ceil(lanesTotal * 0.5);
        const lanesB = lanesTotal - lanesF;
        out.push({
            sourceId: road.key,
            tag: 'road',
            rendered: true,
            lanesF,
            lanesB,
            a: { x: pivot.x, z: pivot.z },
            b: { x: pivot.x + geom.dir.x * len, z: pivot.z + geom.dir.z * len }
        });
    }
    return out;
}

export function setupScene(view) {
    const scene = view.engine.scene;
    const group = new THREE.Group();
    group.name = 'DebugCorners2';
    view.group = group;

    view._hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, 0.85);
    view._hemi.position.set(0, 100, 0);
    group.add(view._hemi);

    view._sun = new THREE.DirectionalLight(0xffffff, 1.2);
    view._sun.position.set(80, 140, 60);
    group.add(view._sun);

    view._sky = createGradientSkyDome({
        top: '#2f7fe8',
        horizon: '#eaf7ff',
        sunDir: view._sun.position.clone().normalize(),
        sunIntensity: 0.28
    });
    group.add(view._sky);

    const groundY = Number.isFinite(view._roadY) ? view._roadY : 0.02;
    view._world = createCityWorld({
        size: 800,
        tileMeters: 2,
        map: null,
        config: { road: { surfaceY: groundY }, ground: { surfaceY: groundY } },
        groundY
    });
    if (view._world?.group) group.add(view._world.group);

    view._roadsRoot = new THREE.Group();
    view._roadsRoot.name = 'DebugCorners2Roads';
    group.add(view._roadsRoot);

    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);
    view._roadPlaneGeo = planeGeo;

    const overlayMatA = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false
    });
    const overlayMatB = new THREE.MeshBasicMaterial({
        color: 0x34c759,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false
    });
    view._roadOverlayMats = { A: overlayMatA, B: overlayMatB };

    view._roadMeshes = [];
    view._roadOverlayByKey = new Map();
    for (const road of view._roads) {
        const mat = road.key === 'B' ? overlayMatB : overlayMatA;
        const mesh = new THREE.Mesh(planeGeo, mat);
        mesh.name = `DebugCorners2RoadOverlay_${road.key}`;
        mesh.userData.debugRoadKey = road.key;
        mesh.renderOrder = 20;
        mesh.frustumCulled = false;
        group.add(mesh);
        view._roadOverlayByKey.set(road.key, mesh);
        view._roadMeshes.push(mesh);
    }

    const y = groundY + 0.04;
    view._lines = {
        aCenter: buildLine2({ color: 0xe5e7eb, lineWidth: 3, y, opacity: 0.85, renderOrder: 30 }),
        aLeft: buildLine2({ color: 0xffd60a, lineWidth: 4, y: y + 0.002, opacity: 0.95, renderOrder: 31 }),
        aRight: buildLine2({ color: 0xffd60a, lineWidth: 4, y: y + 0.002, opacity: 0.95, renderOrder: 31 }),
        bCenter: buildLine2({ color: 0xe5e7eb, lineWidth: 3, y, opacity: 0.85, renderOrder: 30 }),
        bLeft: buildLine2({ color: 0xffd60a, lineWidth: 4, y: y + 0.002, opacity: 0.95, renderOrder: 31 }),
        bRight: buildLine2({ color: 0xffd60a, lineWidth: 4, y: y + 0.002, opacity: 0.95, renderOrder: 31 })
    };
    for (const entry of Object.values(view._lines)) group.add(entry.line);

    const cpGeo = new THREE.CircleGeometry(0.55, 32);
    cpGeo.rotateX(-Math.PI / 2);
    const cpMat = new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
    });
    view._connectingPointGeo = cpGeo;
    view._connectingPointMat = cpMat;

    const makeCp = (key) => {
        const mesh = new THREE.Mesh(cpGeo, cpMat);
        mesh.name = `DebugCorners2ConnectingPoint_${key}`;
        mesh.renderOrder = 42;
        mesh.visible = false;
        mesh.frustumCulled = false;
        group.add(mesh);
        return mesh;
    };
    view._connectingPointMeshes = { A: makeCp('A'), B: makeCp('B') };

    const markerRadius = Math.max(0.35, (Number.isFinite(view._tileSize) ? view._tileSize : 24) * 0.07);
    view._markerAssets = createPoleMarkerAssets({
        radius: markerRadius,
        colorHex: 0x1d4d8f,
        textureColors: {
            center: 'rgba(45, 123, 232, 0.95)',
            mid: 'rgba(120, 200, 255, 0.7)',
            edge: 'rgba(120, 200, 255, 0.0)'
        },
        depthTest: false,
        depthWrite: false
    });
    view._activeMarker = createPoleMarkerGroup({ assets: view._markerAssets }).group;
    view._activeMarker.name = 'DebugCorners2ActiveMarker';
    view._activeMarker.renderOrder = 50;
    view._activeMarker.visible = false;
    group.add(view._activeMarker);

    view._roadMaterials = {
        road: new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.95, metalness: 0.0 }),
        curb: new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 1.0, metalness: 0.0 }),
        sidewalk: new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 1.0, metalness: 0.0 })
    };

    scene.add(group);
    view._syncLineResolution?.();
}

export function disposeScene(view) {
    view._generatedRoadsGroup?.removeFromParent?.();
    if (view._generatedRoadsGroup) disposeObject3D(view._generatedRoadsGroup, { disposeMaterials: false });
    view._generatedRoadsGroup = null;
    view._generatedRoads = null;

    if (view.group) view.group.removeFromParent();

    if (view._lines) {
        for (const entry of Object.values(view._lines)) {
            entry.line?.removeFromParent();
            entry.geo?.dispose?.();
            entry.mat?.dispose?.();
        }
    }
    view._lines = null;

    view._activeMarker?.removeFromParent?.();
    view._activeMarker = null;
    view._markerAssets?.dispose?.();
    view._markerAssets = null;

    view._connectingPointMeshes = null;
    view._connectingPointGeo?.dispose?.();
    view._connectingPointGeo = null;
    view._connectingPointMat?.dispose?.();
    view._connectingPointMat = null;

    if (view._roadMaterials) {
        disposeMaterial(view._roadMaterials.road);
        disposeMaterial(view._roadMaterials.curb);
        disposeMaterial(view._roadMaterials.sidewalk);
    }
    view._roadMaterials = null;

    if (view._roadOverlayMats) {
        disposeMaterial(view._roadOverlayMats.A);
        disposeMaterial(view._roadOverlayMats.B);
    }
    view._roadOverlayMats = null;
    view._roadOverlayByKey = null;

    view._roadMeshes = null;
    view._roadPlaneGeo?.dispose?.();
    view._roadPlaneGeo = null;

    if (view._sky) {
        view._sky.geometry?.dispose?.();
        view._sky.material?.dispose?.();
    }
    view._sky = null;
    view._hemi = null;
    view._sun = null;

    if (view._world?.group) disposeObject3D(view._world.group, { disposeMaterials: true });
    view._world = null;

    view._roadsRoot = null;
    view.group = null;
}

export function syncScene(view) {
    if (!view.group) return;

    const hovered = view._hoveredRoadKey;
    const pivot = view._pivot ?? new THREE.Vector3();
    const len = Number.isFinite(view._segmentLen) ? view._segmentLen : 60;
    const overlayY = (Number.isFinite(view._roadY) ? view._roadY : 0.02) + 0.03;

    for (const road of view._roads) {
        const mesh = view._roadOverlayByKey?.get?.(road.key) ?? null;
        if (!mesh) continue;
        const geom = buildRoadGeom(view, road);
        mesh.scale.set(len, 1, geom.width);
        mesh.position.set(pivot.x + geom.dir.x * len * 0.5, overlayY, pivot.z + geom.dir.z * len * 0.5);
        mesh.rotation.set(0, geom.yaw, 0);
        mesh.material.opacity = hovered === road.key ? 0.22 : 0.12;
    }

    if (view._generatedRoadsGroup) view._generatedRoadsGroup.visible = !!view._renderAsphalt;

    const edgesVisible = !!view._renderEdges;
    const centerVisible = !!view._renderCenterline;
    if (view._lines) {
        view._lines.aCenter.line.visible = centerVisible;
        view._lines.bCenter.line.visible = centerVisible;
        view._lines.aLeft.line.visible = edgesVisible;
        view._lines.aRight.line.visible = edgesVisible;
        view._lines.bLeft.line.visible = edgesVisible;
        view._lines.bRight.line.visible = edgesVisible;
    }

    const showConn = !!view._showConnectingPoint;
    for (const key of ['A', 'B']) {
        const mesh = view._connectingPointMeshes?.[key] ?? null;
        if (!mesh) continue;
        mesh.visible = showConn && mesh.userData?.hasPoint === true;
    }

    if (view._activeMarker) {
        view._activeMarker.visible = !!hovered;
        view._activeMarker.position.set(pivot.x, overlayY + 0.005, pivot.z);
    }
}

export function rebuildConnection(view) {
    if (!view._roadsRoot || !view._lines) return;

    const segments = makeSegments(view);
    const network = createRoadNetworkFromWorldSegments(segments, {
        origin: view._origin ?? { x: 0, z: 0 },
        tileSize: Number.isFinite(view._tileSize) ? view._tileSize : 24,
        seed: 'debug-corners2'
    });

    const config = {
        road: {
            surfaceY: Number.isFinite(view._roadY) ? view._roadY : 0.02,
            laneWidth: Number.isFinite(view._laneWidth) ? view._laneWidth : 4.8,
            shoulder: Number.isFinite(view._shoulder) ? view._shoulder : 0.525,
            curves: {
                turnRadius: Number.isFinite(view._filletRadius) ? view._filletRadius : 6,
                asphaltArcSegments: Number.isFinite(view._arcSegments) ? view._arcSegments : 32
            },
            curb: { height: 0, extraHeight: 0, thickness: 0.25 },
            sidewalk: { extraWidth: 0, lift: 0 }
        }
    };

    if (view._generatedRoadsGroup) {
        view._generatedRoadsGroup.removeFromParent();
        disposeObject3D(view._generatedRoadsGroup, { disposeMaterials: false });
        view._generatedRoadsGroup = null;
        view._generatedRoads = null;
    }

    const roads = generateRoadsFromRoadNetwork({ network, config, materials: view._roadMaterials ?? {} });
    view._generatedRoads = roads;
    view._generatedRoadsGroup = roads?.group ?? null;
    if (view._generatedRoadsGroup) view._roadsRoot.add(view._generatedRoadsGroup);

    const debug = roads?.debug ?? null;
    const edges = Array.isArray(debug?.edges) ? debug.edges : [];

    const lineY = (Number.isFinite(view._roadY) ? view._roadY : 0.02) + 0.04;
    const edgeA = bestEdgeForSource(edges, 'A');
    const edgeB = bestEdgeForSource(edges, 'B');

    const setEdgeLines = (key, edge, prefix) => {
        if (!edge) return;
        setLinePositions(view._lines[`${prefix}Center`].line, [
            { x: edge.centerline.a.x, y: lineY, z: edge.centerline.a.z },
            { x: edge.centerline.b.x, y: lineY, z: edge.centerline.b.z }
        ]);
        setLinePositions(view._lines[`${prefix}Left`].line, [
            { x: edge.left.a.x, y: lineY, z: edge.left.a.z },
            { x: edge.left.b.x, y: lineY, z: edge.left.b.z }
        ]);
        setLinePositions(view._lines[`${prefix}Right`].line, [
            { x: edge.right.a.x, y: lineY, z: edge.right.a.z },
            { x: edge.right.b.x, y: lineY, z: edge.right.b.z }
        ]);
    };

    setEdgeLines('A', edgeA, 'a');
    setEdgeLines('B', edgeB, 'b');

    const yellow = 0xffd60a;
    const hiA = 0xff9f0a;
    const hiB = 0x34c759;
    const selA = (view._roadsByKey.get('A')?.targetEdge ?? 'left') === 'right' ? 'right' : 'left';
    const selB = (view._roadsByKey.get('B')?.targetEdge ?? 'left') === 'right' ? 'right' : 'left';
    view._lines.aLeft.mat.color.setHex(selA === 'left' ? hiA : yellow);
    view._lines.aRight.mat.color.setHex(selA === 'right' ? hiA : yellow);
    view._lines.bLeft.mat.color.setHex(selB === 'left' ? hiB : yellow);
    view._lines.bRight.mat.color.setHex(selB === 'right' ? hiB : yellow);

    const pivot = view._pivot ?? new THREE.Vector3();
    const nodeId = nodeIdAtPivot(network, pivot);
    const joins = Array.isArray(debug?.cornerJoins) ? debug.cornerJoins : [];
    const join = (nodeId ? joins.find((j) => j?.nodeId === nodeId) : joins[0]) ?? null;
    const cutback = Number.isFinite(join?.cutback) ? join.cutback : 0;

    const roadA = view._roadsByKey.get('A') ?? null;
    const roadB = view._roadsByKey.get('B') ?? null;
    const geomA = buildRoadGeom(view, roadA);
    const geomB = buildRoadGeom(view, roadB);
    const cpA = (cutback > EPS) ? { x: pivot.x + geomA.dir.x * cutback, z: pivot.z + geomA.dir.z * cutback } : null;
    const cpB = (cutback > EPS) ? { x: pivot.x + geomB.dir.x * cutback, z: pivot.z + geomB.dir.z * cutback } : null;

    const cpmA = view._connectingPointMeshes?.A ?? null;
    if (cpmA) {
        cpmA.userData.hasPoint = !!cpA;
        if (cpA) cpmA.position.set(cpA.x, lineY + 0.002, cpA.z);
    }
    const cpmB = view._connectingPointMeshes?.B ?? null;
    if (cpmB) {
        cpmB.userData.hasPoint = !!cpB;
        if (cpB) cpmB.position.set(cpB.x, lineY + 0.002, cpB.z);
    }

    view._telemetry = {
        ok: true,
        roads: {
            A: { lanes: geomA.lanes, width: geomA.width, yaw: geomA.yaw, connectingPoint: cpA },
            B: { lanes: geomB.lanes, width: geomB.width, yaw: geomB.yaw, connectingPoint: cpB }
        },
        join: join
            ? {
                cutback,
                pointCount: Array.isArray(join.points) ? join.points.length : 0,
                edge12: join?.fillets?.edge12 ?? null,
                edge30: join?.fillets?.edge30 ?? null
            }
            : null
    };
}
