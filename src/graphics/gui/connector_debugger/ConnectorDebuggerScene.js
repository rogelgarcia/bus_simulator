// src/graphics/gui/connector_debugger/ConnectorDebuggerScene.js
// Builds and updates the 3D scene elements for the connector debugger.
import * as THREE from 'three';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { City } from '../../../app/city/City.js';
import { createCityConfig } from '../../../app/city/CityConfig.js';
import { solveConnectorPath } from '../../../app/geometry/ConnectorPathSolver.js';
import { getCityMaterials } from '../../assets3d/textures/CityMaterials.js';
import { createCurbBuilder } from '../../assets3d/generators/road/builders/CurbBuilder.js';
import { addConnectorCurbSegments } from '../../assets3d/generators/road/connectors/ConnectorCurbUtils.js';
import { sampleConnector } from '../../../app/geometry/ConnectorSampling.js';
import { CURB_COLOR_PALETTE } from '../../assets3d/generators/GeneratorParams.js';
import { createPoleMarkerAssets, createPoleMarkerGroup } from '../../visuals/shared/PoleMarkerGroup.js';
import { createConnectorPathLine } from '../../visuals/shared/ConnectorPathLine.js';
import { createConnectorTurnCircleLines } from '../../visuals/shared/ConnectorTurnCircleLines.js';
import { createConnectorArrowLines } from '../../visuals/shared/ConnectorArrowLines.js';
import { createConnectorCandidateLines } from '../../visuals/connector_debugger/ConnectorCandidateLines.js';

const TAU = Math.PI * 2;

function createDebugCitySpec(config) {
    const w = config.map.width;
    const h = config.map.height;
    return {
        version: 1,
        seed: config.seed,
        width: w,
        height: h,
        tileSize: config.map.tileSize,
        origin: config.map.origin,
        roads: []
    };
}

export function setupCity(view) {
    const baseConfig = createCityConfig();
    const tileSize = baseConfig.map.tileSize;
    const debugConfig = createCityConfig({
        size: tileSize * 3,
        tileMeters: baseConfig.tileMeters,
        mapTileSize: tileSize,
        seed: 'connector-debug'
    });
    const mapSpec = createDebugCitySpec(debugConfig);
    view.city = new City({
        size: debugConfig.size,
        tileMeters: debugConfig.tileMeters,
        mapTileSize: debugConfig.map.tileSize,
        seed: debugConfig.seed,
        mapSpec,
        generatorConfig: {
            render: {
                treesEnabled: false
            }
        }
    });
    view.city.attach(view.engine);
    const treesGroup = view.city?.world?.trees?.group ?? view.city?.group?.getObjectByName?.('Trees') ?? null;
    if (treesGroup) {
        treesGroup.visible = false;
        treesGroup.removeFromParent?.();
    }
    view._tileSize = debugConfig.map.tileSize;
}

export function setupSceneObjects(view) {
    view.group = new THREE.Group();
    view.group.name = 'ConnectorDebugger';
    view.engine.scene.add(view.group);

    view._materials = getCityMaterials();
    const roadCfg = view.city?.generatorConfig?.road ?? {};
    const groundCfg = view.city?.generatorConfig?.ground ?? {};
    const roadY = roadCfg.surfaceY ?? 0.02;
    const curbHeight = roadCfg.curb?.height ?? 0.17;
    const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
    const curbSink = roadCfg.curb?.sink ?? 0.03;
    const groundY = groundCfg.surfaceY ?? (roadY + curbHeight);
    const curbLift = Math.max(curbExtra, Math.min(0.06, curbHeight * 0.25));
    const curbTop = groundY + curbLift;
    const curbBottom = roadY - curbSink;
    const curbH = Math.max(0.04, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * 0.5;
    const curbT = roadCfg.curb?.thickness ?? 0.32;

    view._groundY = groundY;
    view._curbY = curbY;
    view._curbH = curbH;
    view._curbT = curbT;
    view._curbBottom = curbBottom;
    view._curbTop = curbTop;
    view._curbArcSegs = roadCfg.curves?.curbArcSegments ?? 24;
    view._turnRadius = roadCfg.curves?.turnRadius ?? 6.8;
    view._radius = view._turnRadius;
    view._lineY = curbTop + 0.04;
    view._markerY = groundY + 0.003;

    view.dragPlane.set(new THREE.Vector3(0, 1, 0), -view._groundY);

    const length = view._tileSize * 0.8;
    view._curbGeo = new THREE.BoxGeometry(length, curbH, curbT);

    const curbMat = view._materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.0 });

    const curbA = new THREE.Mesh(view._curbGeo, curbMat);
    curbA.position.set(-view._tileSize * 0.6, curbY, -view._tileSize * 0.15);
    curbA.rotation.set(0, 0, 0);
    curbA.castShadow = true;
    curbA.receiveShadow = true;

    const curbB = new THREE.Mesh(view._curbGeo, curbMat);
    curbB.position.set(view._tileSize * 0.85, curbY, view._tileSize * 0.45);
    curbB.rotation.set(0, 0, 0);
    curbB.castShadow = true;
    curbB.receiveShadow = true;

    const markerRadius = Math.max(0.35, view._tileSize * 0.07);
    view._markerAssets = createPoleMarkerAssets({
        radius: markerRadius,
        colorHex: 0x1d4d8f,
        textureColors: {
            center: 'rgba(45, 123, 232, 0.95)',
            mid: 'rgba(120, 200, 255, 0.7)',
            edge: 'rgba(120, 200, 255, 0.0)'
        },
        depthTest: true,
        depthWrite: false
    });
    const markerA = createPoleMarkerGroup({ assets: view._markerAssets }).group;
    const markerB = createPoleMarkerGroup({ assets: view._markerAssets }).group;

    const curbDataA = { id: 'A', mesh: curbA, marker: markerA, endSign: 1, dirSign: 1, length };
    const curbDataB = { id: 'B', mesh: curbB, marker: markerB, endSign: -1, dirSign: 1, length };
    curbA.userData.debugCurb = curbDataA;
    curbB.userData.debugCurb = curbDataB;

    view.curbs = [curbDataA, curbDataB];
    view._curbMeshes = [curbA, curbB];

    view.group.add(curbA);
    view.group.add(curbB);
    view.group.add(markerA);
    view.group.add(markerB);

    const lineWidth = 6;
    const { line, geo, mat } = createConnectorPathLine({
        y: view._lineY,
        color: 0x3b82f6,
        lineWidth,
        opacity: 1,
        renderOrder: 7,
        depthTest: false,
        depthWrite: false
    });
    view._line = line;
    view._lineGeometry = geo;
    view._lineMaterial = mat;
    view.group.add(view._line);

    const candidateLineWidth = Math.max(1, lineWidth * 0.35);
    view._candidateLines = createConnectorCandidateLines({
        count: view._candidateTypes.length,
        y: view._lineY,
        color: 0xef4444,
        lineWidth: candidateLineWidth,
        opacity: 1,
        renderOrder: 6,
        depthTest: false,
        depthWrite: false
    });
    view._candidateMaterials = view._candidateLines.map((entry) => entry.mat);
    for (const entry of view._candidateLines) view.group.add(entry.line);

    const circleWidth = Math.max(1, lineWidth * 0.45);
    view._circleLines = createConnectorTurnCircleLines({
        y: view._markerY,
        lineWidth: circleWidth,
        opacity: 0.55,
        renderOrder: 2,
        depthTest: false,
        depthWrite: false
    });
    view._circleMaterials = view._circleLines.map((entry) => entry.mat);
    for (const entry of view._circleLines) view.group.add(entry.line);

    const arrowLineWidth = Math.max(1, lineWidth * 0.3);
    const arrowVisuals = createConnectorArrowLines({
        y: view._markerY,
        colors: [0x000000, 0x000000],
        lineWidth: arrowLineWidth,
        opacity: 0.95,
        coneOpacity: 1,
        coneTransparent: false,
        renderOrderLine: 8,
        renderOrderCone: 6,
        depthTest: false,
        depthWrite: false,
        markerRadius
    });
    view._arrowLines = arrowVisuals.arrows;
    view._arrowMaterials = view._arrowLines.map((entry) => entry.mat);
    view._arrowConeGeo = arrowVisuals.coneGeometry;
    for (const entry of view._arrowLines) {
        view.group.add(entry.line);
        view.group.add(entry.cone);
    }

    syncLineResolution(view);
}

export function getCurbEndPosition(view, curb) {
    if (!curb) return null;
    curb.mesh.updateMatrixWorld();
    const half = curb.length * 0.5;
    const localPos = new THREE.Vector3(curb.endSign * half, 0, 0);
    const worldPos = curb.mesh.localToWorld(localPos);
    const axis3 = new THREE.Vector3(1, 0, 0).applyQuaternion(curb.mesh.quaternion).normalize();
    const axis2 = new THREE.Vector2(axis3.x, axis3.z);
    if (axis2.lengthSq() > 0) axis2.normalize();
    return { position: worldPos, axis: axis2 };
}

export function getMapCenter(view) {
    const map = view.city?.config?.map;
    if (!map) return new THREE.Vector3(0, view._groundY, 0);
    const tileSize = map.tileSize ?? view._tileSize ?? 1;
    const width = Math.max(1, map.width ?? 1);
    const height = Math.max(1, map.height ?? 1);
    const origin = map.origin ?? { x: 0, z: 0 };
    const x = origin.x + (width - 1) * tileSize * 0.5;
    const z = origin.z + (height - 1) * tileSize * 0.5;
    return new THREE.Vector3(x, view._groundY, z);
}

export function updateMarkers(view) {
    for (const curb of view.curbs) {
        const end = getCurbEndPosition(view, curb);
        if (!end) continue;
        curb.marker.position.set(end.position.x, view._markerY, end.position.z);
    }
}

export function selectConnectorInputs(view) {
    const endA = getCurbEndPosition(view, view.curbs[0]);
    const endB = getCurbEndPosition(view, view.curbs[1]);
    if (!endA || !endB) return { valid: false, error: 'missing-curb' };
    if (endA.axis.lengthSq() < 1e-6 || endB.axis.lengthSq() < 1e-6) {
        return { valid: false, error: 'invalid-direction' };
    }
    const p0 = new THREE.Vector2(endA.position.x, endA.position.z);
    const p1 = new THREE.Vector2(endB.position.x, endB.position.z);
    const axisA = endA.axis.clone().normalize();
    const axisB = endB.axis.clone().normalize();
    const endSignA = view.curbs[0]?.endSign ?? 1;
    const endSignB = view.curbs[1]?.endSign ?? 1;
    const signA = endSignA;
    const signB = -endSignB;
    const dir0 = axisA.clone().multiplyScalar(signA);
    const dir1 = axisB.clone().multiplyScalar(signB);
    const solver = solveConnectorPath({
        start: { position: p0, direction: dir0 },
        end: { position: p1, direction: dir1 },
        radius: view._radius,
        allowFallback: false,
        preferS: true,
        includeCandidates: true
    });
    if (Array.isArray(solver.candidateTypes) && solver.candidateTypes.length === view._candidateTypes.length) {
        view._candidateTypes = solver.candidateTypes.slice();
    }
    view._ensureLineVisibilityKeys();
    return {
        valid: solver.ok,
        error: solver.ok ? null : (solver.failure?.code ?? 'no-solution'),
        connector: solver,
        candidatesByType: solver.candidatesByType ?? [],
        candidateTypes: view._candidateTypes,
        p0,
        p1,
        dir0,
        dir1,
        dirSigns: [signA, signB]
    };
}

export function updateLine(view, points, visible) {
    if (!view._line) return;
    if (!view._displayDebug) {
        view._line.visible = false;
        return;
    }
    const positions = [];
    for (const p of points) {
        positions.push(p.x, view._lineY, p.y);
    }
    if (!visible) {
        setLinePositions(view._lineGeometry, [0, view._lineY, 0, 0, view._lineY, 0]);
        view._line.visible = false;
    } else if (positions.length >= 6) {
        setLinePositions(view._lineGeometry, positions);
        view._line.computeLineDistances();
        view._line.visible = true;
    } else {
        setLinePositions(view._lineGeometry, [0, view._lineY, 0, 0, view._lineY, 0]);
        view._line.visible = false;
    }
}

export function updateCandidateLines(view, inputs, connector, candidatesByType) {
    if (!view._displayDebug) {
        for (const entry of view._candidateLines) {
            entry.line.visible = false;
        }
        return;
    }
    const chosenType = connector?.type ?? null;
    const redColor = 0xef4444;
    for (let i = 0; i < view._candidateLines.length; i++) {
        const entry = view._candidateLines[i];
        const type = view._candidateTypes[i];
        const isVisible = view._lineVisibility[type] !== false;
        const isChosen = type && chosenType === type;
        const candidate = candidatesByType[i] ?? null;
        if (!candidate || !isVisible || isChosen) {
            setLinePositions(entry.geo, [0, view._lineY, 0, 0, view._lineY, 0]);
            entry.line.visible = false;
            continue;
        }
        const sample = sampleConnector(candidate, view._sampleStep);
        let points = sample.points;
        if (points.length >= 2) {
            points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (points.length < 2) {
            const fallback = [];
            const segments = candidate.segments ?? [];
            const startPoint = segments[0]?.startPoint;
            const endPoint = segments[segments.length - 1]?.endPoint;
            if (startPoint) fallback.push(startPoint.clone());
            else if (inputs.p0) fallback.push(inputs.p0.clone());
            if (endPoint) fallback.push(endPoint.clone());
            else if (inputs.p1) fallback.push(inputs.p1.clone());
            points = fallback.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        if (points.length >= 2) {
            const segments = candidate.segments ?? [];
            const startPoint = segments[0]?.startPoint;
            const endPoint = segments[segments.length - 1]?.endPoint;
            if (startPoint) points[0] = startPoint.clone();
            else if (inputs.p0) points[0] = inputs.p0.clone();
            if (endPoint) points[points.length - 1] = endPoint.clone();
            else if (inputs.p1) points[points.length - 1] = inputs.p1.clone();
        }
        const positions = [];
        for (const p of points) {
            positions.push(p.x, view._lineY, p.y);
        }
        if (positions.length >= 6) {
            setLinePositions(entry.geo, positions);
            entry.line.computeLineDistances();
            entry.line.visible = true;
        } else {
            setLinePositions(entry.geo, [0, view._lineY, 0, 0, view._lineY, 0]);
            entry.line.visible = false;
        }
        entry.mat.color.setHex(redColor);
        entry.mat.opacity = 1;
    }
}

export function updateTurnCircles(view, inputs, connector) {
    if (!view._circleLines.length) return;
    if (!view._displayDebug) {
        for (const entry of view._circleLines) entry.line.visible = false;
        return;
    }
    const startLeft = connector?.startLeftCircle ?? null;
    const startRight = connector?.startRightCircle ?? null;
    const endLeft = connector?.endLeftCircle ?? null;
    const endRight = connector?.endRightCircle ?? null;
    if (!startLeft || !startRight || !endLeft || !endRight) {
        for (const entry of view._circleLines) entry.line.visible = false;
        return;
    }
    const r = Math.max(0.01, connector?.radius ?? view._radius);
    const centers = [
        new THREE.Vector3(startLeft.center.x, view._markerY, startLeft.center.y),
        new THREE.Vector3(startRight.center.x, view._markerY, startRight.center.y),
        new THREE.Vector3(endLeft.center.x, view._markerY, endLeft.center.y),
        new THREE.Vector3(endRight.center.x, view._markerY, endRight.center.y)
    ];
    const chosen = new Set();
    const segments = connector?.segments ?? [];
    const startTurn = segments[0]?.turnDir ?? null;
    const endTurn = segments[segments.length - 1]?.turnDir ?? null;
    if (startTurn === 'L') chosen.add(0);
    if (startTurn === 'R') chosen.add(1);
    if (endTurn === 'L') chosen.add(2);
    if (endTurn === 'R') chosen.add(3);
    const dashSize = Math.max(0.2, r * 0.08);
    const gapSize = Math.max(0.15, r * 0.06);
    const segs = 64;
    for (let i = 0; i < view._circleLines.length; i++) {
        const entry = view._circleLines[i];
        const center = centers[i];
        const positions = [];
        for (let k = 0; k <= segs; k++) {
            const t = (k / segs) * TAU;
            positions.push(center.x + Math.cos(t) * r, center.y, center.z + Math.sin(t) * r);
        }
        setLinePositions(entry.geo, positions);
        entry.line.computeLineDistances();
        const isChosen = chosen.has(i);
        entry.mat.dashed = !isChosen;
        entry.mat.dashSize = dashSize;
        entry.mat.gapSize = gapSize;
        entry.mat.needsUpdate = true;
        entry.line.visible = true;
    }
}

export function updateArrows(view, inputs) {
    if (!view._arrowLines.length) return;
    if (!view._displayDebug) {
        for (const entry of view._arrowLines) {
            entry.line.visible = false;
            entry.cone.visible = false;
        }
        return;
    }
    const p0 = inputs?.p0;
    const p1 = inputs?.p1;
    const dir0 = inputs?.dir0;
    const dir1 = inputs?.dir1;
    if (!p0 || !p1 || !dir0 || !dir1) {
        for (const entry of view._arrowLines) {
            entry.line.visible = false;
            entry.cone.visible = false;
        }
        return;
    }
    const arrowY = view._markerY + 0.01;
    const arrowLen = Math.max(0.5, view._radius * 0.35);
    const data = [
        { p: p0, dir: dir0 },
        { p: p1, dir: dir1 }
    ];
    for (let i = 0; i < view._arrowLines.length; i++) {
        const entry = view._arrowLines[i];
        const item = data[i];
        if (!item) continue;
        const dir = item.dir.clone();
        if (dir.lengthSq() < 1e-6) {
            entry.line.visible = false;
            entry.cone.visible = false;
            continue;
        }
        dir.normalize();
        const start = new THREE.Vector3(item.p.x, arrowY, item.p.y);
        const end = start.clone().add(new THREE.Vector3(dir.x, 0, dir.y).multiplyScalar(arrowLen));
        setLinePositions(entry.geo, [start.x, start.y, start.z, end.x, end.y, end.z]);
        entry.line.computeLineDistances();
        entry.line.visible = true;
        entry.cone.position.set(end.x, arrowY, end.z);
        const dir3 = new THREE.Vector3(dir.x, 0, dir.y).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir3);
        entry.cone.quaternion.copy(q);
        entry.cone.visible = true;
    }
}

export function setLinePositions(geo, positions) {
    if (!geo) return;
    geo.setPositions(positions);
    const start = geo.attributes?.instanceStart ?? null;
    const end = geo.attributes?.instanceEnd ?? null;
    if (start) start.needsUpdate = true;
    if (end) end.needsUpdate = true;
    if (start?.count !== undefined) geo.instanceCount = start.count;
}

export function syncLineResolution(view) {
    if (!view._lineMaterial) return;
    const size = view.engine.renderer.getSize(view._lineResolution);
    view._lineMaterial.resolution.set(size.x, size.y);
    for (const mat of view._candidateMaterials) {
        mat.resolution.set(size.x, size.y);
    }
    for (const mat of view._circleMaterials) {
        mat.resolution.set(size.x, size.y);
    }
    for (const mat of view._arrowMaterials) {
        mat.resolution.set(size.x, size.y);
    }
}

export function hardResetDebugLines(view) {
    if (view._line) {
        if (view._lineGeometry) view._lineGeometry.dispose();
        const geo = new LineGeometry();
        geo.setPositions([0, view._lineY, 0, 0, view._lineY, 0]);
        view._line.geometry = geo;
        view._lineGeometry = geo;
        view._line.computeLineDistances();
    }
    for (const entry of view._candidateLines) {
        if (entry.geo) entry.geo.dispose();
        const geo = new LineGeometry();
        geo.setPositions([0, view._lineY, 0, 0, view._lineY, 0]);
        entry.line.geometry = geo;
        entry.geo = geo;
        entry.line.computeLineDistances();
    }
    for (const entry of view._circleLines) {
        if (entry.geo) entry.geo.dispose();
        const geo = new LineGeometry();
        geo.setPositions([0, view._markerY, 0, 0, view._markerY, 0]);
        entry.line.geometry = geo;
        entry.geo = geo;
        entry.line.computeLineDistances();
    }
    for (const entry of view._arrowLines) {
        if (entry.geo) entry.geo.dispose();
        const geo = new LineGeometry();
        geo.setPositions([0, view._markerY, 0, 0, view._markerY, 0]);
        entry.line.geometry = geo;
        entry.geo = geo;
        entry.line.computeLineDistances();
    }
    syncLineResolution(view);
}

export function hideDebugLines(view) {
    if (view._line) view._line.visible = false;
    for (const entry of view._candidateLines) entry.line.visible = false;
    for (const entry of view._circleLines) entry.line.visible = false;
    for (const entry of view._arrowLines) {
        entry.line.visible = false;
        entry.cone.visible = false;
    }
}

export function clearConnectorMesh(view) {
    if (!view._connectorMesh) return;
    view._connectorMesh.removeFromParent();
    view._connectorMesh = null;
}

export function clearCreatedCurbs(view) {
    if (!view._createdCurbGroup) return;
    view._createdCurbGroup.removeFromParent();
    view._createdCurbGroup = null;
}

export function setCurbAutoCreate(view, enabled) {
    view._curbAutoCreate = !!enabled;
    view.panel?.setCurbsEnabled(view._curbAutoCreate);
    if (!view._curbAutoCreate) {
        clearCreatedCurbs(view);
        return;
    }
    rebuildCurbsIfEnabled(view);
}

export function rebuildCurbsIfEnabled(view) {
    if (!view._curbAutoCreate) return;
    if (!view._connector || !view._connector.ok) {
        if (view._createdCurbGroup) clearCreatedCurbs(view);
        return;
    }
    if (view._createdCurbGroup) return;
    if (!Array.isArray(view._connector.segments) || view._connector.segments.length === 0) return;
    const group = buildCurbGroup(view, view._connector, 'ConnectorCurbs');
    if (!group) return;
    view._createdCurbGroup = group;
    view.group.add(group);
}

export function addCurbConnector(view, { curb, key, color, connector, curveSegs }) {
    addConnectorCurbSegments({
        curb,
        key,
        color,
        connector,
        curveSegs,
        curbY: view._curbY,
        curbH: view._curbH,
        curbT: view._curbT
    });
}

export function buildCurbGroup(view, connector, name) {
    if (!connector) return null;
    const baseMat = view._materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.0 });
    const instancedMat = CURB_COLOR_PALETTE.instancedMaterial(baseMat, 'curb');
    view._connectorBoxGeo ??= new THREE.BoxGeometry(1, 1, 1);
    const curb = createCurbBuilder({
        boxGeo: view._connectorBoxGeo,
        instancedMaterial: instancedMat,
        baseMaterial: baseMat,
        palette: CURB_COLOR_PALETTE,
        capacity: 32,
        curbT: view._curbT,
        curbH: view._curbH,
        curbBottom: view._curbBottom,
        name: `${name}Blocks`
    });
    const key = CURB_COLOR_PALETTE.key('connector', 'all');
    const color = CURB_COLOR_PALETTE.instanceColor('curb') ?? 0xffffff;
    const curveSegs = Math.max(12, view._curbArcSegs * 2);
    addCurbConnector(view, { curb, key, color, connector, curveSegs });
    curb.finalize();
    const group = new THREE.Group();
    group.name = name;
    group.add(curb.mesh);
    for (const m of curb.buildCurveMeshes()) group.add(m);
    return group;
}

export function buildConnectorMesh(view, connector) {
    if (!connector) return;
    clearConnectorMesh(view);
    const group = buildCurbGroup(view, connector, 'ConnectorCurb');
    if (!group) return;
    view._connectorMesh = group;
    view.group.add(group);
}
