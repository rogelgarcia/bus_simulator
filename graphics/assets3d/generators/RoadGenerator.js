// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { ROAD_DEFAULTS, DEBUG_ASPHALT, CURB_COLOR_PALETTE, createAsphaltPalette } from './GeneratorParams.js';
import { clamp, deepMerge } from './internal_road/RoadMath.js';
import { createAsphaltBuilder } from './internal_road/AsphaltBuilder.js';
import { createCurbBuilder } from './internal_road/CurbBuilder.js';
import { createMarkingsBuilder } from './internal_road/MarkingsBuilder.js';
import { addConnectorCurbSegments } from './internal_road/ConnectorCurbUtils.js';
import { solveConnectorPath } from '../../../src/geometry/ConnectorPathSolver.js';

const DEG_TO_RAD = Math.PI / 180;
const HALF_TURN_RAD = Math.PI;
const ANGLE_SNAP_DEG = 15;
const ANGLE_SNAP_RAD = ANGLE_SNAP_DEG * DEG_TO_RAD;
const ANGLE_BUCKETS = Math.round(HALF_TURN_RAD / ANGLE_SNAP_RAD);
const HALF = 0.5;
const DOUBLE = 2;
const EPS = 1e-6;
const MIN_LANES_ONEWAY = 2;
const COLOR_SATURATION = 1;
const COLOR_LIGHTNESS = 0.5;
const DEFAULT_COLOR_HEX = 0xffffff;
const DEFAULT_ROAD_COLOR_HEX = 0x2b2b2b;
const DEFAULT_ROAD_ROUGHNESS = 0.95;
const DEFAULT_CURB_COLOR_HEX = 0x6f6f6f;
const DEFAULT_CURB_ROUGHNESS = 1.0;
const LANE_WHITE_COLOR_HEX = 0xf2f2f2;
const LANE_YELLOW_COLOR_HEX = 0xf2d34f;
const LANE_MARK_ROUGHNESS = 0.35;
const MARKINGS_WHITE_PER_TILE = 32;
const MARKINGS_YELLOW_PER_TILE = 8;
const EDGE_MARK_MIN_SCALE = 0.6;
const DASH_LEN_MIN = 1.2;
const DASH_LEN_FACTOR = 0.6;
const DASH_GAP_MIN = 0.8;
const DASH_GAP_FACTOR = 0.35;
const DASH_END_EPS = 0.001;
const ROAD_SURFACE_LIFT = 0.004;
const CURB_BOXES_PER_TILE = 2;
const ASPHALT_CAPACITY_PER_TILE = 8;
const MIN_CAPACITY = 1;
const GEOMETRY_UNIT = 1;
const PLANE_SEGMENTS = 1;
const POLES_PER_TILE = 4;
const POLE_DOT_SCALE = 1.5;
const POLE_DOT_COLOR_HEX = 0xfff0a6;
const POLE_DOT_RADIUS_FACTOR = 0.25;
const POLE_DOT_HEIGHT_FACTOR = 0.2;
const POLE_DOT_RADIUS_MIN = 0.04;
const POLE_DOT_HEIGHT_MIN = 0.02;
const POLE_DOT_SEGMENTS = 16;
const COLLISION_DEDUP_EPS = 0.5;
const POLE_CLEARANCE = 0.05;

function normalizeHalfTurn(angle) {
    let a = angle % HALF_TURN_RAD;
    if (a < 0) a += HALF_TURN_RAD;
    if (Math.abs(a - HALF_TURN_RAD) <= EPS) return 0;
    return a;
}

function snapAngle(angle) {
    const base = normalizeHalfTurn(angle);
    const snapped = Math.round(base / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
    return normalizeHalfTurn(snapped);
}

function normalizeDir(x, y) {
    const len = Math.hypot(x, y);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: x * inv, y: y * inv };
}

function laneCount(lanesF, lanesB) {
    const f = lanesF ?? 0;
    const b = lanesB ?? 0;
    const total = f + b;
    if (total <= 0) return 0;
    if (f === 0 || b === 0) return Math.max(MIN_LANES_ONEWAY, total);
    return total;
}

function roadWidth(lanesF, lanesB, laneWidth, shoulder, tileSize) {
    const lanes = laneCount(lanesF, lanesB);
    const raw = lanes * laneWidth + shoulder * DOUBLE;
    return clamp(raw, laneWidth, tileSize);
}

function angleIndex(angle) {
    const snapped = snapAngle(angle);
    const idx = Math.round(snapped / ANGLE_SNAP_RAD);
    return ((idx % ANGLE_BUCKETS) + ANGLE_BUCKETS) % ANGLE_BUCKETS;
}

function angleColorHex(index, tmpColor) {
    const t = index / ANGLE_BUCKETS;
    tmpColor.setHSL(t, COLOR_SATURATION, COLOR_LIGHTNESS);
    return tmpColor.getHex();
}

function addCurbSegment(curb, p0, p1, curbY, curbH, curbT, colorHex) {
    if (!curb || !p0 || !p1) return;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return;
    const midX = (p0.x + p1.x) * HALF;
    const midZ = (p0.y + p1.y) * HALF;
    const dirX = dx / len;
    const dirY = dy / len;
    const ry = Math.atan2(-dirY, dirX);
    curb.addBox(midX, curbY, midZ, len, curbH, curbT, ry, colorHex);
}

function addSolidMark(markings, kind, data, lineW, heading, markY) {
    if (!markings || !data) return;
    if (kind === 'yellow') {
        markings.addYellow(data.mid.x, markY, data.mid.y, data.length, lineW, heading);
    } else {
        markings.addWhite(data.mid.x, markY, data.mid.y, data.length, lineW, heading);
    }
}

function addDashedMark(markings, kind, data, dir, lineW, heading, markY, dashLen, dashGap) {
    if (!markings || !data) return;
    const step = dashLen + dashGap;
    const start = -data.length * HALF + dashLen * HALF;
    const end = data.length * HALF - dashLen * HALF + DASH_END_EPS;
    for (let t = start; t <= end; t += step) {
        const cx = data.mid.x + dir.x * t;
        const cz = data.mid.y + dir.y * t;
        if (kind === 'yellow') {
            markings.addYellow(cx, markY, cz, dashLen, lineW, heading);
        } else {
            markings.addWhite(cx, markY, cz, dashLen, lineW, heading);
        }
    }
}

function segmentDataFromEndpoints(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return null;
    return {
        mid: { x: (p0.x + p1.x) * HALF, y: (p0.y + p1.y) * HALF },
        length: len
    };
}

function offsetEndpoints(p0, p1, normal, offset) {
    return {
        start: { x: p0.x + normal.x * offset, y: p0.y + normal.y * offset },
        end: { x: p1.x + normal.x * offset, y: p1.y + normal.y * offset }
    };
}

function cross2(a, b) {
    return a.x * b.y - a.y * b.x;
}

function segmentIntersection(p0, p1, p2, p3) {
    if (!p0 || !p1 || !p2 || !p3) return null;
    const r = { x: p1.x - p0.x, y: p1.y - p0.y };
    const s = { x: p3.x - p2.x, y: p3.y - p2.y };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= EPS) return null;
    const qp = { x: p2.x - p0.x, y: p2.y - p0.y };
    const t = cross2(qp, s) / denom;
    const u = cross2(qp, r) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p0.x + r.x * t, y: p0.y + r.y * t };
}

function dot2(a, b) {
    return a.x * b.x + a.y * b.y;
}

function distanceSq(a, b) {
    const dx = a.x - b.x;
    const ay = Number.isFinite(a.z) ? a.z : a.y;
    const by = Number.isFinite(b.z) ? b.z : b.y;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

function distanceBetween(a, b) {
    const ax = a?.x;
    const bx = b?.x;
    const az = Number.isFinite(a?.z) ? a.z : a?.y;
    const bz = Number.isFinite(b?.z) ? b.z : b?.y;
    if (!Number.isFinite(ax) || !Number.isFinite(bx) || !Number.isFinite(az) || !Number.isFinite(bz)) return null;
    return Math.hypot(bx - ax, bz - az);
}

function alongForData(data, point) {
    if (!data || !point) return 0;
    const base = data.centerlineStart ?? data.rawStart;
    if (!base) return 0;
    const py = Number.isFinite(point.y) ? point.y : point.z;
    return (point.x - base.x) * data.dir.x + (py - base.y) * data.dir.y;
}

function exitDistanceFromRect(p0, moveDir, rectStart, rectEnd, rectHalf) {
    if (!p0 || !moveDir || !rectStart || !rectEnd) return 0;
    const dx = rectEnd.x - rectStart.x;
    const dy = rectEnd.y - rectStart.y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return 0;
    const dir = { x: dx / len, y: dy / len };
    const normal = { x: -dir.y, y: dir.x };
    const a = dot2(moveDir, normal);
    const b = dot2({ x: p0.x - rectStart.x, y: p0.y - rectStart.y }, normal);
    let n0 = -Infinity;
    let n1 = Infinity;
    if (Math.abs(a) <= EPS) {
        if (Math.abs(b) > rectHalf) return 0;
    } else {
        const t1 = (-rectHalf - b) / a;
        const t2 = (rectHalf - b) / a;
        n0 = Math.min(t1, t2);
        n1 = Math.max(t1, t2);
    }
    const c = dot2(moveDir, dir);
    const d = dot2({ x: p0.x - rectStart.x, y: p0.y - rectStart.y }, dir);
    let s0 = -Infinity;
    let s1 = Infinity;
    if (Math.abs(c) <= EPS) {
        if (d < 0 || d > len) return 0;
    } else {
        const t3 = (0 - d) / c;
        const t4 = (len - d) / c;
        s0 = Math.min(t3, t4);
        s1 = Math.max(t3, t4);
    }
    const t0 = Math.max(n0, s0);
    const t1 = Math.min(n1, s1);
    if (t0 > t1) return 0;
    if (t1 < 0) return 0;
    if (t0 > 0) return 0;
    if (!Number.isFinite(t1)) return Infinity;
    return Math.max(0, t1 + EPS);
}

function tileKey(tile) {
    if (!tile) return null;
    const x = tile.x;
    const y = tile.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return `${x},${y}`;
}

function tileExitDistance(p0, moveDir, center, halfTile) {
    if (!p0 || !moveDir || !center) return 0;
    const minX = center.x - halfTile;
    const maxX = center.x + halfTile;
    const minY = center.y - halfTile;
    const maxY = center.y + halfTile;
    let tMin = -Infinity;
    let tMax = Infinity;
    if (Math.abs(moveDir.x) <= EPS) {
        if (p0.x < minX - EPS || p0.x > maxX + EPS) return 0;
    } else {
        const tx1 = (minX - p0.x) / moveDir.x;
        const tx2 = (maxX - p0.x) / moveDir.x;
        tMin = Math.max(tMin, Math.min(tx1, tx2));
        tMax = Math.min(tMax, Math.max(tx1, tx2));
    }
    if (Math.abs(moveDir.y) <= EPS) {
        if (p0.y < minY - EPS || p0.y > maxY + EPS) return 0;
    } else {
        const ty1 = (minY - p0.y) / moveDir.y;
        const ty2 = (maxY - p0.y) / moveDir.y;
        tMin = Math.max(tMin, Math.min(ty1, ty2));
        tMax = Math.min(tMax, Math.max(ty1, ty2));
    }
    if (tMax < tMin) return 0;
    if (tMax < 0) return 0;
    if (!Number.isFinite(tMax)) return 0;
    return Math.max(0, tMax + EPS);
}

function endPoleTrimForTile(data, center, halfTile, isStart) {
    if (!data || !center) return 0;
    const base = isStart ? data.rawStart : data.rawEnd;
    if (!base) return 0;
    const moveDir = isStart ? data.dir : { x: -data.dir.x, y: -data.dir.y };
    const left = {
        x: base.x + data.normal.x * data.curbOffset,
        y: base.y + data.normal.y * data.curbOffset
    };
    const right = {
        x: base.x - data.normal.x * data.curbOffset,
        y: base.y - data.normal.y * data.curbOffset
    };
    const tLeft = tileExitDistance(left, moveDir, center, halfTile);
    const tRight = tileExitDistance(right, moveDir, center, halfTile);
    return Math.max(tLeft, tRight);
}

function centerlineExtent(halfTile, halfWidth, dir, normal) {
    let t = halfTile;
    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const nx = Math.abs(normal.x);
    const ny = Math.abs(normal.y);
    if (ax > EPS) t = Math.min(t, (halfTile - nx * halfWidth) / ax);
    if (ay > EPS) t = Math.min(t, (halfTile - ny * halfWidth) / ay);
    if (t < 0) return 0;
    return t;
}

function trimForRoad(data, others) {
    if (!data || !Array.isArray(others)) return null;
    const leftEdge = offsetEndpoints(data.rawStart, data.rawEnd, data.normal, data.curbOffset);
    const rightEdge = offsetEndpoints(data.rawStart, data.rawEnd, data.normal, -data.curbOffset);
    const startPoles = [leftEdge.start, rightEdge.start];
    const endPoles = [leftEdge.end, rightEdge.end];
    let trimStart = 0;
    let trimEnd = 0;
    const moveStart = data.dir;
    const moveEnd = { x: -data.dir.x, y: -data.dir.y };
    for (const other of others) {
        if (!other || other.roadId === data.roadId) continue;
        const rectHalf = (other.boundaryHalf ?? 0) + POLE_CLEARANCE;
        for (const p of startPoles) {
            let t = exitDistanceFromRect(p, moveStart, other.rawStart, other.rawEnd, rectHalf);
            if (!Number.isFinite(t)) t = data.length;
            if (t > trimStart) trimStart = t;
        }
        for (const p of endPoles) {
            let t = exitDistanceFromRect(p, moveEnd, other.rawStart, other.rawEnd, rectHalf);
            if (!Number.isFinite(t)) t = data.length;
            if (t > trimEnd) trimEnd = t;
        }
    }
    const length = data.length ?? 0;
    if (!(length > EPS)) {
        return { start: data.rawStart, end: data.rawEnd };
    }
    const maxTrim = Math.max(0, length - EPS);
    const totalTrim = trimStart + trimEnd;
    if (totalTrim > maxTrim && totalTrim > EPS) {
        const scale = maxTrim / totalTrim;
        trimStart *= scale;
        trimEnd *= scale;
    }
    return {
        start: { x: data.rawStart.x + data.dir.x * trimStart, y: data.rawStart.y + data.dir.y * trimStart },
        end: { x: data.rawEnd.x - data.dir.x * trimEnd, y: data.rawEnd.y - data.dir.y * trimEnd }
    };
}

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';
    const curbConnectors = [];
    const collisionMarkers = [];
    const roadPoles = new Map();
    const connectionPolesByCollision = new Map();
    const connectorPairs = new Set();

    if (!map) {
        return {
            group,
            asphalt: null,
            sidewalk: null,
            curbBlocks: null,
            markingsWhite: null,
            markingsYellow: null,
            curbConnectors,
            collisionMarkers
        };
    }

    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const ts = map.tileSize;

    const baseRoadY = roadCfg.surfaceY ?? ROAD_DEFAULTS.surfaceY;
    const laneWidth = roadCfg.laneWidth ?? ROAD_DEFAULTS.laneWidth;
    const turnRadius = roadCfg.curves?.turnRadius ?? ROAD_DEFAULTS.curves.turnRadius;
    const curbArcSegs = roadCfg.curves?.curbArcSegments ?? ROAD_DEFAULTS.curves.curbArcSegments;
    const shoulder = roadCfg.shoulder ?? ROAD_DEFAULTS.shoulder;
    const curbT = roadCfg.curb?.thickness ?? ROAD_DEFAULTS.curb.thickness;
    const curbHeight = roadCfg.curb?.height ?? ROAD_DEFAULTS.curb.height;
    const curbExtra = roadCfg.curb?.extraHeight ?? ROAD_DEFAULTS.curb.extraHeight;
    const curbSink = roadCfg.curb?.sink ?? ROAD_DEFAULTS.curb.sink;
    const groundY = config?.ground?.surfaceY ?? (baseRoadY + curbHeight);
    const roadY = Math.max(baseRoadY, groundY + ROAD_SURFACE_LIFT);
    const markLineW = roadCfg.markings?.lineWidth ?? ROAD_DEFAULTS.markings.lineWidth;
    const markEdgeInset = roadCfg.markings?.edgeInset ?? ROAD_DEFAULTS.markings.edgeInset;
    const markLift = roadCfg.markings?.lift ?? ROAD_DEFAULTS.markings.lift;
    const markY = roadY + markLift;
    const curbBottom = roadY - curbSink;
    const curbTop = roadY + curbHeight + curbExtra;
    const curbH = Math.max(EPS, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * HALF;

    const roadMatBase = materials?.road ?? new THREE.MeshStandardMaterial({ color: DEFAULT_ROAD_COLOR_HEX, roughness: DEFAULT_ROAD_ROUGHNESS });
    const curbMatBase = materials?.curb ?? new THREE.MeshStandardMaterial({ color: DEFAULT_CURB_COLOR_HEX, roughness: DEFAULT_CURB_ROUGHNESS });
    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: LANE_WHITE_COLOR_HEX, roughness: LANE_MARK_ROUGHNESS });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: LANE_YELLOW_COLOR_HEX, roughness: LANE_MARK_ROUGHNESS });
    const modeSetting = config?.render?.roadMode ?? null;
    const debugEnabled = modeSetting ? modeSetting === 'debug' : DEBUG_ASPHALT;
    const asphaltPalette = createAsphaltPalette(debugEnabled ? 'debug' : 'regular');
    const asphaltDebug = debugEnabled && asphaltPalette?.kind === 'debug';
    const asphaltMat = asphaltDebug
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : roadMatBase;

    if (asphaltMat) asphaltMat.side = THREE.DoubleSide;
    if (asphaltDebug && asphaltMat) asphaltMat.toneMapped = false;

    const planeGeo = new THREE.PlaneGeometry(GEOMETRY_UNIT, GEOMETRY_UNIT, PLANE_SEGMENTS, PLANE_SEGMENTS);
    planeGeo.rotateX(-Math.PI / 2);
    const boxGeo = new THREE.BoxGeometry(GEOMETRY_UNIT, GEOMETRY_UNIT, GEOMETRY_UNIT);

    const roadCount = map.countRoadTiles();
    const asphalt = createAsphaltBuilder({
        planeGeo,
        material: asphaltMat,
        palette: asphaltPalette,
        capacity: Math.max(MIN_CAPACITY, roadCount * ASPHALT_CAPACITY_PER_TILE),
        name: 'Asphalt'
    });

    const markings = createMarkingsBuilder({
        planeGeo,
        whiteMaterial: laneWhiteMat,
        yellowMaterial: laneYellowMat,
        whiteCapacity: Math.max(MIN_CAPACITY, roadCount * MARKINGS_WHITE_PER_TILE),
        yellowCapacity: Math.max(MIN_CAPACITY, roadCount * MARKINGS_YELLOW_PER_TILE)
    });

    const curb = createCurbBuilder({
        boxGeo,
        instancedMaterial: CURB_COLOR_PALETTE.instancedMaterial(curbMatBase, 'curb'),
        baseMaterial: curbMatBase,
        palette: CURB_COLOR_PALETTE,
        capacity: Math.max(MIN_CAPACITY, roadCount * CURB_BOXES_PER_TILE),
        curbT,
        curbH,
        curbBottom,
        name: 'CurbBlocks'
    });

    const roads = Array.isArray(map.roadSegments) ? map.roadSegments.filter(Boolean) : [];
    const tmpColor = new THREE.Color();
    const neutralCurbColor = curbMatBase?.color?.getHex?.() ?? DEFAULT_CURB_COLOR_HEX;
    const poleDotRadius = Math.max(POLE_DOT_RADIUS_MIN, curbT * POLE_DOT_RADIUS_FACTOR * POLE_DOT_SCALE);
    const poleDotHeight = Math.max(POLE_DOT_HEIGHT_MIN, curbH * POLE_DOT_HEIGHT_FACTOR * POLE_DOT_SCALE);
    const poleDotY = roadY - poleDotHeight * HALF;
    const poleDotGeo = asphaltDebug ? new THREE.CylinderGeometry(poleDotRadius, poleDotRadius, poleDotHeight, POLE_DOT_SEGMENTS, 1) : null;
    const poleDotMat = asphaltDebug ? new THREE.MeshBasicMaterial({ color: POLE_DOT_COLOR_HEX }) : null;
    const poleDots = (asphaltDebug && poleDotGeo && poleDotMat)
        ? new THREE.InstancedMesh(poleDotGeo, poleDotMat, Math.max(MIN_CAPACITY, roadCount * POLES_PER_TILE))
        : null;
    const poleCapacity = poleDots?.count ?? 0;
    const poleDummy = poleDots ? new THREE.Object3D() : null;
    let poleCount = 0;
    let roadIndex = 0;
    const dedupDistSq = COLLISION_DEDUP_EPS * COLLISION_DEDUP_EPS;
    let poleId = 0;
    let collisionId = 0;

    const computeConnectorRadius = (p0, p1) => {
        if (!p0 || !p1) return null;
        const curbReduce = Number.isFinite(curbT) ? curbT : 0;
        const curveConnector = !!(p0?.curveConnection || p1?.curveConnection);
        if (curveConnector) {
            const ax = p0.x;
            const bx = p1.x;
            const az = Number.isFinite(p0.z) ? p0.z : p0.y;
            const bz = Number.isFinite(p1.z) ? p1.z : p1.y;
            if (!Number.isFinite(ax) || !Number.isFinite(bx) || !Number.isFinite(az) || !Number.isFinite(bz)) return null;
            const dx = Math.abs(bx - ax);
            const dz = Math.abs(bz - az);
            const minAxis = Math.min(dx, dz);
            if (minAxis > EPS) {
                const reduced = minAxis - curbReduce;
                return reduced > EPS ? reduced : null;
            }
            const dist = Math.hypot(dx, dz);
            const reduced = dist - curbReduce;
            return reduced > EPS ? reduced : null;
        }
        const resolveCollision = (pole) => {
            const col = pole?.collision ?? null;
            if (col && Number.isFinite(col.x) && (Number.isFinite(col.z) || Number.isFinite(col.y))) return col;
            const road = pole?.roadId != null ? roadById.get(pole.roadId) : null;
            if (!road?.collisionById || pole?.collisionId == null) return null;
            return road.collisionById.get(pole.collisionId) ?? null;
        };
        const distToCollision = (pole) => {
            const col = resolveCollision(pole);
            if (!col) return null;
            const ax = pole.x;
            const az = Number.isFinite(pole.z) ? pole.z : pole.y;
            const bx = col.x;
            const bz = Number.isFinite(col.z) ? col.z : col.y;
            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return null;
            const dx = bx - ax;
            const dz = bz - az;
            const dist = Math.hypot(dx, dz);
            const reduced = dist - curbReduce;
            return reduced > EPS ? reduced : null;
        };
        const d0 = distToCollision(p0);
        if (Number.isFinite(d0)) return d0;
        const d1 = distToCollision(p1);
        if (Number.isFinite(d1)) return d1;
        const ax = p0.x;
        const bx = p1.x;
        const az = Number.isFinite(p0.z) ? p0.z : p0.y;
        const bz = Number.isFinite(p1.z) ? p1.z : p1.y;
        if (!Number.isFinite(ax) || !Number.isFinite(bx) || !Number.isFinite(az) || !Number.isFinite(bz)) return null;
        const dx = Math.abs(bx - ax);
        const dz = Math.abs(bz - az);
        const minAxis = Math.min(dx, dz);
        const dist = Math.hypot(dx, dz);
        const base = minAxis > EPS ? minAxis : dist;
        if (!(base > EPS)) return null;
        const reduced = base - curbReduce;
        return reduced > EPS ? reduced : null;
    };
    const solveCurbConnector = (p0, p1, dir0, dir1) => {
        if (!p0 || !p1 || !dir0 || !dir1) return null;
        const radius = computeConnectorRadius(p0, p1);
        if (!Number.isFinite(radius) || radius <= EPS) return null;
        const isConnection = (p0?.collisionId != null || p1?.collisionId != null || p0?.cut != null || p1?.cut != null);
        const isCurve = !!(p0?.curveConnection || p1?.curveConnection);
        const connector = solveConnectorPath({
            start: { position: { x: p0.x, y: p0.z }, direction: { x: dir0.x, y: dir0.z } },
            end: { position: { x: p1.x, y: p1.z }, direction: { x: dir1.x, y: dir1.z } },
            radius,
            allowFallback: !(isConnection || isCurve),
            preferS: true
        });
        if (connector && connector.ok) return connector;
        return null;
    };
    const getPoleFlowDir = (pole) => {
        if (!pole) return null;
        const road = roadById.get(pole.roadId);
        if (!road) return null;
        const dir = { x: road.dir.x, z: road.dir.y };
        if (pole.flow === 'enter') return dir;
        if (pole.flow === 'exit') return { x: -dir.x, z: -dir.z };
        if (pole.end === 'start') return dir;
        if (pole.end === 'end') return { x: -dir.x, z: -dir.z };
        return null;
    };
    const getArrowDir = (pole, sign) => {
        const flowDir = getPoleFlowDir(pole);
        if (!flowDir) return null;
        if (sign < 0) return { x: flowDir.x, z: flowDir.z };
        return { x: -flowDir.x, z: -flowDir.z };
    };
    const pickConnectorRoles = (pole, targetPole) => {
        let p0 = pole;
        let p1 = targetPole;
        const flow0 = pole?.flow ?? null;
        const flow1 = targetPole?.flow ?? null;
        if (flow0 === 'enter' && flow1 === 'exit') {
            p0 = targetPole;
            p1 = pole;
        }
        return { p0, p1 };
    };
    const addPoleDot = (p) => {
        if (!poleDots || !poleDummy) return;
        if (poleCount >= poleCapacity) return;
        poleDummy.position.set(p.x, poleDotY, p.y);
        poleDummy.updateMatrix();
        poleDots.setMatrixAt(poleCount, poleDummy.matrix);
        poleCount += 1;
    };
    const shouldCreateConnector = (pole, targetPole) => {
        if (!pole || !targetPole) return false;
        const id0 = pole.uid;
        const id1 = targetPole.uid;
        if (Number.isFinite(id0) && Number.isFinite(id1)) {
            const key = id0 <= id1 ? `${id0}:${id1}` : `${id1}:${id0}`;
            if (connectorPairs.has(key)) return false;
            connectorPairs.add(key);
            return true;
        }
        const keyA = `${pole.x},${pole.z}`;
        const keyB = `${targetPole.x},${targetPole.z}`;
        const key = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
        if (connectorPairs.has(key)) return false;
        connectorPairs.add(key);
        return true;
    };
    const registerConnectionPoleByCollision = (pole, collisionId) => {
        if (!pole || collisionId == null) return;
        const roadId = pole.roadId;
        if (roadId == null) return;
        let entry = connectionPolesByCollision.get(collisionId);
        if (!entry) {
            entry = new Map();
            connectionPolesByCollision.set(collisionId, entry);
        }
        let list = entry.get(roadId);
        if (!list) {
            list = [];
            entry.set(roadId, list);
        }
        if (!list.includes(pole)) list.push(pole);
    };
    const buildRenderData = (data) => {
        const length = data.length ?? 0;
        if (!(length > EPS)) return { length, cuts: [], gaps: [], connectionCuts: [] };
        const cuts = [0, length];
        const connectionCuts = [];
        if (Array.isArray(data.connectionCuts)) {
            for (const t of data.connectionCuts) {
                if (!Number.isFinite(t)) continue;
                const ct = clamp(t, 0, length);
                connectionCuts.push(ct);
                if (ct > EPS && ct < length - EPS) cuts.push(ct);
            }
        }
        const gaps = [];
        if (Array.isArray(data.connectionGaps)) {
            for (const gap of data.connectionGaps) {
                let start = gap?.start;
                let end = gap?.end;
                if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                start = clamp(start, 0, length);
                end = clamp(end, 0, length);
                if (end < start) {
                    const tmp = start;
                    start = end;
                    end = tmp;
                }
                if (end - start > EPS) gaps.push({ start, end });
            }
        }
        if (Array.isArray(data.collisionIntervals) && data.collisionIntervals.length) {
            let minCollision = Infinity;
            let maxCollision = -Infinity;
            for (const interval of data.collisionIntervals) {
                let start = interval?.start;
                let end = interval?.end;
                if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                start = clamp(start, 0, length);
                end = clamp(end, 0, length);
                const lo = Math.min(start, end);
                const hi = Math.max(start, end);
                if (lo < minCollision) minCollision = lo;
                if (hi > maxCollision) maxCollision = hi;
            }
            if (Number.isFinite(minCollision)) {
                let hasConnBefore = false;
                let resumeAt = Infinity;
                for (const cut of connectionCuts) {
                    if (!Number.isFinite(cut)) continue;
                    if (cut > EPS && cut < minCollision - EPS) hasConnBefore = true;
                    if (cut > minCollision + EPS && cut < resumeAt) resumeAt = cut;
                }
                if (!hasConnBefore) {
                    if (!Number.isFinite(resumeAt)) resumeAt = length;
                    if (resumeAt > EPS) gaps.push({ start: 0, end: resumeAt });
                }
            }
            if (Number.isFinite(maxCollision)) {
                let hasConnAfter = false;
                let resumeFrom = -Infinity;
                for (const cut of connectionCuts) {
                    if (!Number.isFinite(cut)) continue;
                    if (cut < length - EPS && cut > maxCollision + EPS) hasConnAfter = true;
                    if (cut < maxCollision - EPS && cut > resumeFrom) resumeFrom = cut;
                }
                if (!hasConnAfter) {
                    if (!Number.isFinite(resumeFrom)) resumeFrom = 0;
                    if (length - resumeFrom > EPS) gaps.push({ start: resumeFrom, end: length });
                }
            }
        }
        if (gaps.length) {
            gaps.sort((a, b) => a.start - b.start);
            const merged = [];
            for (const gap of gaps) {
                const last = merged[merged.length - 1];
                if (!last || gap.start > last.end + EPS) merged.push({ start: gap.start, end: gap.end });
                else last.end = Math.max(last.end, gap.end);
            }
            gaps.length = 0;
            for (const g of merged) gaps.push(g);
        }
        cuts.sort((a, b) => a - b);
        const uniq = [];
        for (const t of cuts) {
            if (!Number.isFinite(t)) continue;
            if (!uniq.length || t - uniq[uniq.length - 1] > EPS) uniq.push(t);
        }
        return { length, cuts: uniq, gaps, connectionCuts };
    };
    const isInGaps = (t, gaps) => {
        if (!Array.isArray(gaps)) return false;
        for (const gap of gaps) {
            if (t > gap.start + EPS && t < gap.end - EPS) return true;
        }
        return false;
    };
    const addCollisionPole = (data, hit, otherRoadId, collisionId, along) => {
        const poles = roadPoles.get(data?.roadId);
        if (!poles) return null;
        const list = poles.collision;
        const base = data?.centerlineStart ?? data?.rawStart ?? null;
        const dir = data?.dir ?? null;
        const normal = data?.normal ?? null;
        const offset = Number.isFinite(data?.curbOffset) ? data.curbOffset : (data?.halfWidth ?? 0);
        const hitX = hit?.x;
        const hitY = hit?.y;
        let poleX = Number.isFinite(hitX) ? hitX : 0;
        let poleZ = Number.isFinite(hitY) ? hitY : 0;
        let alongValue = Number.isFinite(along) ? along : null;
        if (!Number.isFinite(alongValue) && hit && data) alongValue = alongForData(data, hit);
        if (base && dir && normal && Number.isFinite(alongValue)) {
            const cx = base.x + dir.x * alongValue;
            const cy = base.y + dir.y * alongValue;
            const dx = poleX - cx;
            const dz = poleZ - cy;
            const dot = dx * normal.x + dz * normal.y;
            const sideSign = dot >= 0 ? 1 : -1;
            poleX = cx + normal.x * sideSign * offset;
            poleZ = cy + normal.y * sideSign * offset;
        }
        for (const existing of list) {
            const dx = existing.x - poleX;
            const dz = existing.z - poleZ;
            if (dx * dx + dz * dz <= dedupDistSq) {
                if (!existing.otherRoadIds) existing.otherRoadIds = [];
                if (otherRoadId != null && !existing.otherRoadIds.includes(otherRoadId)) {
                    existing.otherRoadIds.push(otherRoadId);
                }
                if (data?.collisionById) data.collisionById.set(collisionId, existing);
                return existing;
            }
        }
        const pole = {
            id: collisionId,
            roadId: data?.roadId ?? null,
            x: poleX,
            z: poleZ,
            otherRoadIds: otherRoadId != null ? [otherRoadId] : [],
            otherRoadId: otherRoadId != null ? otherRoadId : null,
            along: Number.isFinite(alongValue) ? alongValue : null
        };
        list.push(pole);
        if (data?.collisionById) data.collisionById.set(collisionId, pole);
        return pole;
    };
    const addConnectionPole = (data, hit, side, collisionInfo, cutT) => {
        const poles = roadPoles.get(data?.roadId);
        if (!poles) return null;
        const list = poles.connection;
        for (const existing of list) {
            const dx = existing.x - hit.x;
            const dz = existing.z - hit.y;
            if (dx * dx + dz * dz <= dedupDistSq) {
                if (!Number.isFinite(existing.uid)) existing.uid = poleId++;
                if (collisionInfo?.collisionId != null) existing.collisionId = collisionInfo.collisionId;
                if (collisionInfo?.collisionPole) existing.collision = collisionInfo.collisionPole;
                if (collisionInfo?.otherRoadId != null) existing.otherRoadId = collisionInfo.otherRoadId;
                if (Number.isFinite(cutT)) existing.cut = cutT;
                registerConnectionPoleByCollision(existing, collisionInfo?.collisionId ?? null);
                return existing;
            }
        }
        const pole = {
            x: hit.x,
            z: hit.y,
            side,
            roadId: data?.roadId ?? null,
            collisionId: collisionInfo?.collisionId ?? null,
            collision: collisionInfo?.collisionPole ?? null,
            otherRoadId: collisionInfo?.otherRoadId ?? null,
            cut: Number.isFinite(cutT) ? cutT : null,
            uid: poleId++
        };
        list.push(pole);
        registerConnectionPoleByCollision(pole, collisionInfo?.collisionId ?? null);
        if (collisionInfo?.collisionId != null && data?.connectionByCollision) {
            const entry = data.connectionByCollision.get(collisionInfo.collisionId) ?? { left: null, right: null };
            if (side === 'left') entry.left = pole;
            if (side === 'right') entry.right = pole;
            data.connectionByCollision.set(collisionInfo.collisionId, entry);
        }
        return pole;
    };
    const addConnectionPolesForRoad = (data, hits) => {
        if (!data || !Array.isArray(hits) || !hits.length) return;
        const maxT = data.length ?? 0;
        if (!(maxT > EPS)) return;
        const base = data.centerlineStart ?? data.rawStart;
        if (!base) return;
        const baseHalfWidth = data.halfWidth ?? 0;
        let minHalfWidth = baseHalfWidth;
        let minAlong = Infinity;
        let maxAlong = -Infinity;
        let minHit = null;
        let maxHit = null;
        const leftHits = [];
        const rightHits = [];
        for (const hit of hits) {
            const along = hit?.along ?? null;
            if (!Number.isFinite(along)) continue;
            const otherRoadId = hit?.otherRoadId ?? null;
            let hitHalfWidth = baseHalfWidth;
            if (otherRoadId != null) {
                const other = roadById.get(otherRoadId);
                const otherHalf = other?.halfWidth ?? null;
                if (Number.isFinite(otherHalf)) hitHalfWidth = Math.min(baseHalfWidth, otherHalf);
            }
            hit.halfWidth = hitHalfWidth;
            if (Number.isFinite(hitHalfWidth)) minHalfWidth = Math.min(minHalfWidth, hitHalfWidth);
            if (along < minAlong) {
                minAlong = along;
                minHit = hit;
            }
            if (along > maxAlong) {
                maxAlong = along;
                maxHit = hit;
            }
            const collision = hit?.collisionPole ?? null;
            const hx = collision?.x;
            const hz = collision?.z;
            if (!Number.isFinite(hx) || !Number.isFinite(hz)) continue;
            const cx = base.x + data.dir.x * along;
            const cy = base.y + data.dir.y * along;
            const dx = hx - cx;
            const dz = hz - cy;
            const dot = dx * data.normal.x + dz * data.normal.y;
            if (dot >= 0) leftHits.push(hit);
            else rightHits.push(hit);
        }
        if (!Number.isFinite(minAlong) || !Number.isFinite(maxAlong)) return;
        const pickMinHit = (list) => {
            let best = null;
            let bestAlong = Infinity;
            for (const entry of list) {
                const along = entry?.along ?? null;
                if (!Number.isFinite(along)) continue;
                if (along < bestAlong) {
                    bestAlong = along;
                    best = entry;
                }
            }
            return best;
        };
        const pickMaxHit = (list) => {
            let best = null;
            let bestAlong = -Infinity;
            for (const entry of list) {
                const along = entry?.along ?? null;
                if (!Number.isFinite(along)) continue;
                if (along > bestAlong) {
                    bestAlong = along;
                    best = entry;
                }
            }
            return best;
        };
        const leftMinHit = pickMinHit(leftHits) ?? null;
        const rightMinHit = pickMinHit(rightHits) ?? null;
        const leftMaxHit = pickMaxHit(leftHits) ?? null;
        const rightMaxHit = pickMaxHit(rightHits) ?? null;
        const collisionStart = clamp(minAlong, 0, maxT);
        const collisionEnd = clamp(maxAlong, 0, maxT);
        if (!data.collisionIntervals) data.collisionIntervals = [];
        data.collisionIntervals.push({ start: collisionStart, end: collisionEnd });
        const startHalfWidth = Number.isFinite(minHit?.halfWidth) ? minHit.halfWidth : minHalfWidth;
        const endHalfWidth = Number.isFinite(maxHit?.halfWidth) ? maxHit.halfWidth : minHalfWidth;
        const cutStart = clamp(minAlong - startHalfWidth, 0, maxT);
        const cutEnd = clamp(maxAlong + endHalfWidth, 0, maxT);
        if (!data.connectionCuts) data.connectionCuts = [];
        if (!data.connectionGaps) data.connectionGaps = [];
        data.connectionCuts.push(cutStart);
        data.connectionCuts.push(cutEnd);
        const gapStart = Math.min(cutStart, cutEnd);
        const gapEnd = Math.max(cutStart, cutEnd);
        if (gapEnd - gapStart > EPS) data.connectionGaps.push({ start: gapStart, end: gapEnd });
        const addConnectionPairAt = (cutT, collisionInfoLeft, collisionInfoRight) => {
            const mid = { x: base.x + data.dir.x * cutT, y: base.y + data.dir.y * cutT };
            const left = {
                x: mid.x + data.normal.x * data.curbOffset,
                y: mid.y + data.normal.y * data.curbOffset
            };
            const right = {
                x: mid.x - data.normal.x * data.curbOffset,
                y: mid.y - data.normal.y * data.curbOffset
            };
            addConnectionPole(data, left, 'left', collisionInfoLeft ?? collisionInfoRight, cutT);
            addConnectionPole(data, right, 'right', collisionInfoRight ?? collisionInfoLeft, cutT);
            if (!data.connectionPairs) data.connectionPairs = [];
            const midX = (left.x + right.x) * HALF;
            const midY = (left.y + right.y) * HALF;
            let ok = true;
            for (const existing of data.connectionPairs) {
                const el = existing?.left;
                const er = existing?.right;
                if (!el || !er) continue;
                const ex = (el.x + er.x) * HALF;
                const ey = ((el.z ?? el.y) + (er.z ?? er.y)) * HALF;
                const dx = ex - midX;
                const dz = ey - midY;
                if (dx * dx + dz * dz <= dedupDistSq) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                data.connectionPairs.push({
                    left: { x: left.x, z: left.y },
                    right: { x: right.x, z: right.y },
                    cut: cutT,
                    collisionId: collisionInfoLeft?.collisionId ?? collisionInfoRight?.collisionId ?? null,
                    otherRoadId: collisionInfoLeft?.otherRoadId ?? collisionInfoRight?.otherRoadId ?? null
                });
            }
        };
        addConnectionPairAt(cutStart, leftMinHit ?? minHit, rightMinHit ?? minHit);
        if (Math.abs(cutEnd - cutStart) > EPS) {
            addConnectionPairAt(cutEnd, leftMaxHit ?? maxHit, rightMaxHit ?? maxHit);
        }
    };

    const roadData = [];
    for (const road of roads) {
        const roadIdFallback = roadIndex;
        roadIndex += 1;
        const tiles = Array.isArray(road.tiles) ? road.tiles : [];
        if (!tiles.length) continue;

        const rawDir = normalizeDir(road.b.x - road.a.x, road.b.y - road.a.y);
        if (!rawDir) continue;

        const angleForColor = Number.isFinite(road.angle)
            ? road.angle
            : Math.atan2(rawDir.y, rawDir.x);
        const angleIdx = angleIndex(angleForColor);
        const width = roadWidth(road.lanesF, road.lanesB, laneWidth, shoulder, ts);
        const halfWidth = width * HALF;

        const dir = rawDir;
        const normal = { x: -dir.y, y: dir.x };
        const curbOffset = halfWidth + curbT * HALF;
        const heading = Math.atan2(-dir.y, dir.x);
        const dashLen = Math.max(DASH_LEN_MIN, laneWidth * DASH_LEN_FACTOR);
        const dashGap = Math.max(DASH_GAP_MIN, laneWidth * DASH_GAP_FACTOR);
        const twoWay = road.lanesF > 0 && road.lanesB > 0;
        const totalLanes = (road.lanesF ?? 0) + (road.lanesB ?? 0);
        const halfTile = ts * HALF;
        const spanInset = centerlineExtent(halfTile, halfWidth, dir, normal);

        const startTile = tiles[0];
        const endTile = tiles[tiles.length - 1];
        const startCenterRaw = map.tileToWorldCenter(startTile.x, startTile.y);
        const endCenterRaw = map.tileToWorldCenter(endTile.x, endTile.y);
        const startCenter = { x: startCenterRaw.x, y: startCenterRaw.z };
        const endCenter = { x: endCenterRaw.x, y: endCenterRaw.z };
        const rawStart = {
            x: startCenter.x - dir.x * spanInset,
            y: startCenter.y - dir.y * spanInset
        };
        const rawEnd = {
            x: endCenter.x + dir.x * spanInset,
            y: endCenter.y + dir.y * spanInset
        };
        const length = Math.hypot(rawEnd.x - rawStart.x, rawEnd.y - rawStart.y);
        const startKey = tileKey(startTile);
        const endKey = tileKey(endTile);

        roadData.push({
            road,
            roadId: road.id ?? roadIdFallback,
            dir,
            normal,
            halfWidth,
            curbOffset,
            angleIdx,
            heading,
            dashLen,
            dashGap,
            twoWay,
            totalLanes,
            lanesF: road.lanesF ?? 0,
            lanesB: road.lanesB ?? 0,
            startTile,
            endTile,
            startCenter,
            endCenter,
            startKey,
            endKey,
            rawStart,
            rawEnd,
            length,
            boundaryHalf: halfWidth + curbT
        });
    }

    const roadById = new Map();
    for (const data of roadData) roadById.set(data.roadId, data);

    const endTileRoads = new Map();
    const registerEndTile = (key, roadId) => {
        if (!key) return;
        let set = endTileRoads.get(key);
        if (!set) {
            set = new Set();
            endTileRoads.set(key, set);
        }
        set.add(roadId);
    };
    for (const data of roadData) {
        registerEndTile(data.startKey, data.roadId);
        registerEndTile(data.endKey, data.roadId);
    }
    const endTileHalf = ts * HALF;
    for (const data of roadData) {
        const startSet = data.startKey ? endTileRoads.get(data.startKey) : null;
        const endSet = data.endKey ? endTileRoads.get(data.endKey) : null;
        data.sharedStartRoadIds = startSet ? Array.from(startSet).filter((id) => id !== data.roadId) : [];
        data.sharedEndRoadIds = endSet ? Array.from(endSet).filter((id) => id !== data.roadId) : [];
        let trimStart = 0;
        let trimEnd = 0;
        if (startSet && startSet.size > 1) {
            trimStart = endPoleTrimForTile(data, data.startCenter, endTileHalf, true);
        }
        if (endSet && endSet.size > 1) {
            trimEnd = endPoleTrimForTile(data, data.endCenter, endTileHalf, false);
        }
        if (trimStart > 0 || trimEnd > 0) {
            data.sharedOriginalStart = { x: data.rawStart.x, y: data.rawStart.y };
            data.sharedOriginalEnd = { x: data.rawEnd.x, y: data.rawEnd.y };
            data.sharedTrimStart = trimStart;
            data.sharedTrimEnd = trimEnd;
            const length = data.length ?? 0;
            if (length > EPS) {
                const maxTrim = Math.max(0, length - EPS);
                const totalTrim = trimStart + trimEnd;
                if (totalTrim > maxTrim && totalTrim > EPS) {
                    const scale = maxTrim / totalTrim;
                    trimStart *= scale;
                    trimEnd *= scale;
                }
                if (trimStart > 0) {
                    data.rawStart = {
                        x: data.rawStart.x + data.dir.x * trimStart,
                        y: data.rawStart.y + data.dir.y * trimStart
                    };
                }
                if (trimEnd > 0) {
                    data.rawEnd = {
                        x: data.rawEnd.x - data.dir.x * trimEnd,
                        y: data.rawEnd.y - data.dir.y * trimEnd
                    };
                }
                data.length = Math.hypot(data.rawEnd.x - data.rawStart.x, data.rawEnd.y - data.rawStart.y);
            }
        }
    }

    for (const data of roadData) {
        const trimmed = trimForRoad(data, roadData);
        if (!trimmed) continue;
        data.centerlineStart = trimmed.start;
        data.centerlineEnd = trimmed.end;
        data.length = Math.hypot(trimmed.end.x - trimmed.start.x, trimmed.end.y - trimmed.start.y);
    }

    for (const data of roadData) {
        const road = data.road;
        const centerlineStart = data.centerlineStart ?? data.rawStart;
        const centerlineEnd = data.centerlineEnd ?? data.rawEnd;
        const poles = { end: [], collision: [], connection: [], adjustedEnd: [] };
        road.poles = poles;
        roadPoles.set(data.roadId, poles);
        data.connectionCuts = [];
        data.connectionPairs = [];
        data.connectionGaps = [];
        data.collisionIntervals = [];
        data.collisionById = new Map();
        data.connectionByCollision = new Map();

        const leftEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, data.halfWidth);
        const rightEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, -data.halfWidth);
        const leftPoleEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, data.curbOffset);
        const rightPoleEdge = offsetEndpoints(centerlineStart, centerlineEnd, data.normal, -data.curbOffset);
        const startLeft = { x: leftPoleEdge.start.x, z: leftPoleEdge.start.y, side: 'left', end: 'start', endKey: data.startKey, roadId: data.roadId, uid: poleId++ };
        const startRight = { x: rightPoleEdge.start.x, z: rightPoleEdge.start.y, side: 'right', end: 'start', endKey: data.startKey, roadId: data.roadId, uid: poleId++ };
        const endLeft = { x: leftPoleEdge.end.x, z: leftPoleEdge.end.y, side: 'left', end: 'end', endKey: data.endKey, roadId: data.roadId, uid: poleId++ };
        const endRight = { x: rightPoleEdge.end.x, z: rightPoleEdge.end.y, side: 'right', end: 'end', endKey: data.endKey, roadId: data.roadId, uid: poleId++ };
        poles.end = [startLeft, startRight, endLeft, endRight];
        data.endPoles = {
            start: {
                left: startLeft,
                right: startRight
            },
            end: {
                left: endLeft,
                right: endRight
            }
        };
        const adjustedEnd = poles.adjustedEnd;
        if (data.sharedTrimStart > 0 && data.sharedOriginalStart && data.sharedOriginalEnd) {
            const origLeft = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, data.curbOffset);
            const origRight = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, -data.curbOffset);
            const sharedStartIds = data.sharedStartRoadIds?.slice?.() ?? [];
            startLeft.sharedRoadIds = sharedStartIds;
            startRight.sharedRoadIds = sharedStartIds;
            startLeft.adjusted = true;
            startRight.adjusted = true;
            startLeft.original = { x: origLeft.start.x, z: origLeft.start.y };
            startRight.original = { x: origRight.start.x, z: origRight.start.y };
            adjustedEnd.push({
                adjusted: { x: leftPoleEdge.start.x, z: leftPoleEdge.start.y },
                original: { x: origLeft.start.x, z: origLeft.start.y },
                sharedRoadIds: sharedStartIds,
                endKey: data.startKey,
                end: 'start',
                side: 'left'
            });
            adjustedEnd.push({
                adjusted: { x: rightPoleEdge.start.x, z: rightPoleEdge.start.y },
                original: { x: origRight.start.x, z: origRight.start.y },
                sharedRoadIds: sharedStartIds,
                endKey: data.startKey,
                end: 'start',
                side: 'right'
            });
        }
        if (data.sharedTrimEnd > 0 && data.sharedOriginalStart && data.sharedOriginalEnd) {
            const origLeft = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, data.curbOffset);
            const origRight = offsetEndpoints(data.sharedOriginalStart, data.sharedOriginalEnd, data.normal, -data.curbOffset);
            const sharedEndIds = data.sharedEndRoadIds?.slice?.() ?? [];
            endLeft.sharedRoadIds = sharedEndIds;
            endRight.sharedRoadIds = sharedEndIds;
            endLeft.adjusted = true;
            endRight.adjusted = true;
            endLeft.original = { x: origLeft.end.x, z: origLeft.end.y };
            endRight.original = { x: origRight.end.x, z: origRight.end.y };
            adjustedEnd.push({
                adjusted: { x: leftPoleEdge.end.x, z: leftPoleEdge.end.y },
                original: { x: origLeft.end.x, z: origLeft.end.y },
                sharedRoadIds: sharedEndIds,
                endKey: data.endKey,
                end: 'end',
                side: 'left'
            });
            adjustedEnd.push({
                adjusted: { x: rightPoleEdge.end.x, z: rightPoleEdge.end.y },
                original: { x: origRight.end.x, z: origRight.end.y },
                sharedRoadIds: sharedEndIds,
                endKey: data.endKey,
                end: 'end',
                side: 'right'
            });
        }
        addPoleDot(leftPoleEdge.start);
        addPoleDot(leftPoleEdge.end);
        addPoleDot(rightPoleEdge.start);
        addPoleDot(rightPoleEdge.end);
        data.collisionEdges = [
            { a: leftEdge.start, b: leftEdge.end },
            { a: rightEdge.start, b: rightEdge.end },
            { a: leftEdge.start, b: rightEdge.start },
            { a: leftEdge.end, b: rightEdge.end }
        ];
    }

    for (let i = 0; i < roadData.length; i++) {
        const a = roadData[i];
        const aEdges = a.collisionEdges;
        if (!aEdges) continue;
        for (let j = i + 1; j < roadData.length; j++) {
            const b = roadData[j];
            if (a.roadId === b.roadId) continue;
            const bEdges = b.collisionEdges;
            if (!bEdges) continue;
            const pairHits = [];
            for (const e0 of aEdges) {
                for (const e1 of bEdges) {
                    const hit = segmentIntersection(e0.a, e0.b, e1.a, e1.b);
                    if (!hit) continue;
                    let ok = true;
                    for (const existing of pairHits) {
                        const dx = existing.x - hit.x;
                        const dz = existing.y - hit.y;
                        if (dx * dx + dz * dz <= dedupDistSq) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) pairHits.push(hit);
                }
            }
            if (!pairHits.length) continue;
            const hitInfosA = [];
            const hitInfosB = [];
            for (const hit of pairHits) {
                const id = collisionId;
                collisionId += 1;
                const alongA = alongForData(a, hit);
                const alongB = alongForData(b, hit);
                const poleA = addCollisionPole(a, hit, b.roadId, id, alongA);
                const poleB = addCollisionPole(b, hit, a.roadId, id, alongB);
                hitInfosA.push({
                    along: alongA,
                    collisionId: id,
                    collisionPole: poleA,
                    otherRoadId: b.roadId
                });
                hitInfosB.push({
                    along: alongB,
                    collisionId: id,
                    collisionPole: poleB,
                    otherRoadId: a.roadId
                });
                let ok = true;
                for (const existing of collisionMarkers) {
                    const dx = existing.x - hit.x;
                    const dz = existing.z - hit.y;
                    if (dx * dx + dz * dz <= dedupDistSq) {
                        ok = false;
                        break;
                    }
                }
                if (ok) collisionMarkers.push({ x: hit.x, z: hit.y });
            }
            addConnectionPolesForRoad(a, hitInfosA);
            addConnectionPolesForRoad(b, hitInfosB);
        }
    }

    for (const data of roadData) {
        const poles = data.road?.poles;
        const connectionPoles = poles?.connection;
        if (!Array.isArray(connectionPoles) || !connectionPoles.length) continue;
        const renderData = buildRenderData(data);
        const length = renderData.length ?? 0;
        const gaps = renderData.gaps ?? [];
        if (!(length > EPS)) continue;
        const boundaryTol = Math.max(EPS * 100, Math.min(0.05, data.halfWidth * 0.2));
        for (const pole of connectionPoles) {
            const cutT = pole?.cut;
            if (!Number.isFinite(cutT)) continue;
            let hasBefore = false;
            let hasAfter = false;
            let matchedBoundary = false;
            for (const gap of gaps) {
                const start = gap?.start;
                const end = gap?.end;
                if (Number.isFinite(start) && Math.abs(cutT - start) <= boundaryTol) {
                    hasBefore = true;
                    hasAfter = false;
                    matchedBoundary = true;
                    break;
                }
                if (Number.isFinite(end) && Math.abs(cutT - end) <= boundaryTol) {
                    hasBefore = false;
                    hasAfter = true;
                    matchedBoundary = true;
                    break;
                }
            }
            if (!matchedBoundary) {
                const beforeT = cutT - boundaryTol;
                const afterT = cutT + boundaryTol;
                hasBefore = beforeT > EPS && !isInGaps(beforeT, gaps);
                hasAfter = afterT < length - EPS && !isInGaps(afterT, gaps);
            }
            pole.renderBefore = hasBefore;
            pole.renderAfter = hasAfter;
            pole.flow = (hasBefore && !hasAfter) ? 'exit' : (!hasBefore && hasAfter ? 'enter' : null);
        }
    }

    for (const [collisionId, entry] of connectionPolesByCollision.entries()) {
        const items = [];
        for (const [roadId, poles] of entry.entries()) {
            if (!Array.isArray(poles)) continue;
            for (const pole of poles) {
                if (!pole) continue;
                items.push({ roadId, pole });
            }
        }
        if (items.length < 2) continue;
        if (items.length === 2) {
            const a = items[0];
            const b = items[1];
            const flowA = a?.pole?.flow;
            const flowB = b?.pole?.flow;
            if (a?.pole && b?.pole && ((flowA === 'exit' && flowB === 'enter') || (flowA === 'enter' && flowB === 'exit'))) {
                a.pole.linkedTarget = { roadId: b.roadId, pole: b.pole, collisionId };
                b.pole.linkedTarget = { roadId: a.roadId, pole: a.pole, collisionId };
                continue;
            }
        }
        for (const item of items) {
            let best = null;
            let bestDist = Infinity;
            let bestAny = null;
            let bestAnyDist = Infinity;
            const flow = item?.pole?.flow ?? null;
            for (const candidate of items) {
                if (candidate.roadId === item.roadId) continue;
                const flowOther = candidate?.pole?.flow ?? null;
                if (!((flow === 'exit' && flowOther === 'enter') || (flow === 'enter' && flowOther === 'exit'))) continue;
                const d2 = distanceSq(item.pole, candidate.pole);
                if (d2 < bestAnyDist - EPS) {
                    bestAnyDist = d2;
                    bestAny = candidate;
                }
                const other = roadById.get(candidate.roadId);
                const collision = item.pole.collision;
                if (other && collision && candidate.pole?.side) {
                    const dx = item.pole.x - collision.x;
                    const dz = item.pole.z - collision.z;
                    const dot = dx * other.normal.x + dz * other.normal.y;
                    const desiredSide = dot >= 0 ? 'left' : 'right';
                    if (candidate.pole.side !== desiredSide) continue;
                }
                if (d2 < bestDist - EPS) {
                    bestDist = d2;
                    best = candidate;
                }
            }
            const chosen = best ?? bestAny;
            if (chosen) {
                item.pole.linkedTarget = { roadId: chosen.roadId, pole: chosen.pole, collisionId };
            }
        }
    }

    const endKeyEntries = new Map();
    const registerEndEntry = (data, endKey, endLabel) => {
        if (!data || !endKey) return;
        const poles = endLabel === 'start' ? data.endPoles?.start : data.endPoles?.end;
        if (!poles || !poles.left || !poles.right) return;
        const base = endLabel === 'start'
            ? (data.centerlineStart ?? data.rawStart)
            : (data.centerlineEnd ?? data.rawEnd);
        if (!base) return;
        const dirOut = endLabel === 'start'
            ? { x: data.dir.x, y: data.dir.y }
            : { x: -data.dir.x, y: -data.dir.y };
        let entry = endKeyEntries.get(endKey);
        if (!entry) {
            entry = [];
            endKeyEntries.set(endKey, entry);
        }
        entry.push({
            roadId: data.roadId,
            data,
            end: endLabel,
            endKey,
            poles,
            base,
            dirOut
        });
    };
    for (const data of roadData) {
        registerEndEntry(data, data.startKey, 'start');
        registerEndEntry(data, data.endKey, 'end');
    }
    const pickPoleForSideOut = (entry, sideOut) => {
        const poles = entry?.poles;
        if (!poles) return null;
        const leftPole = poles.left;
        const rightPole = poles.right;
        if (!leftPole) return rightPole ?? null;
        if (!rightPole) return leftPole ?? null;
        const base = entry.base;
        const dirOut = entry.dirOut;
        if (!base || !dirOut) return sideOut === 'left' ? leftPole : rightPole;
        const normal = { x: -dirOut.y, y: dirOut.x };
        const leftDot = (leftPole.x - base.x) * normal.x + (leftPole.z - base.y) * normal.y;
        const rightDot = (rightPole.x - base.x) * normal.x + (rightPole.z - base.y) * normal.y;
        const leftIsLeft = leftDot >= rightDot;
        if (sideOut === 'left') return leftIsLeft ? leftPole : rightPole;
        return leftIsLeft ? rightPole : leftPole;
    };
    for (const [endKey, entries] of endKeyEntries.entries()) {
        if (!Array.isArray(entries) || entries.length < 2) continue;
        if (entries.length === 2) {
            const a = entries[0];
            const b = entries[1];
            const dirA = a?.dirOut;
            const dirB = b?.dirOut;
            const cross = dirA && dirB ? cross2(dirA, dirB) : 0;
            if (Math.abs(cross) > EPS) {
                const internalA = cross > 0 ? 'left' : 'right';
                const internalB = cross > 0 ? 'right' : 'left';
                const aInternal = pickPoleForSideOut(a, internalA);
                const aExternal = aInternal === a?.poles?.left ? a?.poles?.right : a?.poles?.left;
                const bInternal = pickPoleForSideOut(b, internalB);
                const bExternal = bInternal === b?.poles?.left ? b?.poles?.right : b?.poles?.left;
                if (aInternal && bInternal) {
                    aInternal.linkedTarget = { roadId: b.roadId, pole: bInternal, endKey };
                    bInternal.linkedTarget = { roadId: a.roadId, pole: aInternal, endKey };
                }
                if (aExternal && bExternal) {
                    aExternal.linkedTarget = { roadId: b.roadId, pole: bExternal, endKey };
                    bExternal.linkedTarget = { roadId: a.roadId, pole: aExternal, endKey };
                }
            } else {
                const aLeft = pickPoleForSideOut(a, 'left');
                const aRight = aLeft === a?.poles?.left ? a?.poles?.right : a?.poles?.left;
                const bLeft = pickPoleForSideOut(b, 'left');
                const bRight = bLeft === b?.poles?.left ? b?.poles?.right : b?.poles?.left;
                if (aLeft && bLeft) {
                    aLeft.linkedTarget = { roadId: b.roadId, pole: bLeft, endKey };
                    bLeft.linkedTarget = { roadId: a.roadId, pole: aLeft, endKey };
                }
                if (aRight && bRight) {
                    aRight.linkedTarget = { roadId: b.roadId, pole: bRight, endKey };
                    bRight.linkedTarget = { roadId: a.roadId, pole: aRight, endKey };
                }
            }
            continue;
        }
        const endPoleLinksByTile = { left: [], right: [] };
        for (const entry of entries) {
            const poles = entry?.poles;
            if (!poles) continue;
            for (const pole of [poles.left, poles.right]) {
                if (!pole) continue;
                if (!pole.adjusted) continue;
                const side = pole.side === 'right' ? 'right' : 'left';
                endPoleLinksByTile[side].push({ roadId: entry.roadId, pole });
            }
        }
        for (const side of ['left', 'right']) {
            const list = endPoleLinksByTile[side];
            if (!Array.isArray(list) || list.length < 2) continue;
            if (list.length === 2) {
                const a = list[0];
                const b = list[1];
                if (a?.pole && b?.pole) {
                    if (!a.pole.linkedTarget) a.pole.linkedTarget = { roadId: b.roadId, pole: b.pole, endKey };
                    if (!b.pole.linkedTarget) b.pole.linkedTarget = { roadId: a.roadId, pole: a.pole, endKey };
                }
                continue;
            }
            for (const item of list) {
                if (!item?.pole || item.pole.linkedTarget) continue;
                let best = null;
                let bestDist = Infinity;
                for (const candidate of list) {
                    if (!candidate?.pole) continue;
                    if (candidate.roadId === item.roadId) continue;
                    const d2 = distanceSq(item.pole, candidate.pole);
                    if (d2 < bestDist - EPS) {
                        bestDist = d2;
                        best = candidate;
                    }
                }
                if (best) {
                    item.pole.linkedTarget = { roadId: best.roadId, pole: best.pole, endKey };
                }
            }
        }
    }

    const markCurveAtEnd = (data, endLabel) => {
        const endPoles = data?.endPoles;
        if (!endPoles) return;
        const poleSet = endLabel === 'start' ? endPoles.start : endPoles.end;
        const leftPole = poleSet?.left ?? null;
        const rightPole = poleSet?.right ?? null;
        if (!leftPole || !rightPole) return;
        const leftLink = leftPole.linkedTarget ?? null;
        const rightLink = rightPole.linkedTarget ?? null;
        if (!leftLink || !rightLink) return;
        const otherRoadId = leftLink.roadId;
        if (otherRoadId == null || otherRoadId !== rightLink.roadId) return;
        const leftTarget = leftLink.pole ?? null;
        const rightTarget = rightLink.pole ?? null;
        if (!leftTarget || !rightTarget) return;
        if (leftTarget === rightTarget) return;
        if (!leftTarget.end || !rightTarget.end) return;
        if (leftTarget.end !== rightTarget.end) return;
        const other = roadById.get(otherRoadId);
        if (!other?.endPoles) return;
        const otherPoleSet = leftTarget.end === 'start' ? other.endPoles.start : other.endPoles.end;
        if (!otherPoleSet) return;
        const distLeft = distanceBetween(leftPole, leftTarget);
        const distRight = distanceBetween(rightPole, rightTarget);
        if (!Number.isFinite(distLeft) || !Number.isFinite(distRight)) return;
        leftPole.curveConnection = true;
        rightPole.curveConnection = true;
        leftTarget.curveConnection = true;
        rightTarget.curveConnection = true;
        if (Math.abs(distLeft - distRight) > EPS) {
            const leftInner = distLeft < distRight;
            leftPole.curveSide = leftInner ? 'internal' : 'external';
            rightPole.curveSide = leftInner ? 'external' : 'internal';
            leftTarget.curveSide = leftInner ? 'internal' : 'external';
            rightTarget.curveSide = leftInner ? 'external' : 'internal';
        }
    };

    for (const data of roadData) {
        markCurveAtEnd(data, 'start');
        markCurveAtEnd(data, 'end');
    }

    const pickSharedRoadOnSide = (data, endKey, side) => {
        if (!data || !endKey) return null;
        const sharedIds = endKey === data.startKey ? data.sharedStartRoadIds : data.sharedEndRoadIds;
        if (!Array.isArray(sharedIds) || !sharedIds.length) return null;
        const base = endKey === data.startKey ? data.startCenter : data.endCenter;
        if (!base) return null;
        const sideNormal = side === 'right'
            ? { x: -data.normal.x, y: -data.normal.y }
            : { x: data.normal.x, y: data.normal.y };
        let bestId = null;
        let bestDot = -Infinity;
        let bestDist = Infinity;
        for (const id of sharedIds) {
            const other = roadById.get(id);
            if (!other) continue;
            let otherCenter = null;
            if (endKey === other.startKey) otherCenter = other.startCenter;
            else if (endKey === other.endKey) otherCenter = other.endCenter;
            if (!otherCenter) continue;
            const vx = otherCenter.x - base.x;
            const vy = otherCenter.y - base.y;
            const dot = vx * sideNormal.x + vy * sideNormal.y;
            if (!(dot > EPS)) continue;
            const distSq = vx * vx + vy * vy;
            if (dot > bestDot + EPS || (Math.abs(dot - bestDot) <= EPS && distSq < bestDist)) {
                bestDot = dot;
                bestDist = distSq;
                bestId = id;
            }
        }
        return bestId;
    };

    const pickEndPole = (data, endKey, side) => {
        if (!data || !data.endPoles) return null;
        if (endKey === data.startKey) return data.endPoles.start?.[side] ?? null;
        if (endKey === data.endKey) return data.endPoles.end?.[side] ?? null;
        return null;
    };

    const pickClosestEndPole = (data, side, ref) => {
        if (!data || !data.endPoles || !ref) return null;
        const startPole = data.endPoles.start?.[side] ?? null;
        const endPole = data.endPoles.end?.[side] ?? null;
        let best = null;
        let bestDist = Infinity;
        if (startPole) {
            const d = distanceSq(startPole, ref);
            if (d < bestDist) {
                best = startPole;
                bestDist = d;
            }
        }
        if (endPole) {
            const d = distanceSq(endPole, ref);
            if (d < bestDist) best = endPole;
        }
        return best;
    };

    const pushConnector = (record) => {
        if (!record) return;
        curbConnectors.push(record);
    };

    for (const data of roadData) {
        const endPoles = data.endPoles;
        const poles = data.road?.poles;
        if (endPoles) {
            const endEntries = [
                { pos: endPoles.start.left, side: 'left', end: 'start', endKey: data.startKey },
                { pos: endPoles.start.right, side: 'right', end: 'start', endKey: data.startKey },
                { pos: endPoles.end.left, side: 'left', end: 'end', endKey: data.endKey },
                { pos: endPoles.end.right, side: 'right', end: 'end', endKey: data.endKey }
            ];
            for (const entry of endEntries) {
                const pole = entry.pos;
                if (!pole) continue;
                const side = entry.side;
                const linked = pole.linkedTarget ?? null;
                const otherRoadId = linked?.roadId ?? pickSharedRoadOnSide(data, entry.endKey, side);
                let targetPole = null;
                let side1 = null;
                if (linked?.pole) {
                    targetPole = linked.pole;
                    side1 = targetPole.side ?? side;
                }
                if (!targetPole && otherRoadId != null) {
                    const other = roadById.get(otherRoadId);
                    if (other) {
                        const otherPole = pickEndPole(other, entry.endKey, side) ?? pickClosestEndPole(other, side, pole);
                        if (otherPole) {
                            targetPole = otherPole;
                            side1 = otherPole.side ?? side;
                        }
                    }
                }
                const { p0, p1 } = pickConnectorRoles(pole, targetPole);
                const dir0 = p0 ? getArrowDir(p0, 1) : null;
                const dir1 = p1 ? getArrowDir(p1, -1) : null;
                const allowConnector = p0 && p1 && dir0 && dir1 && shouldCreateConnector(p0, p1);
                if (p0 && p1 && dir0 && dir1 && !allowConnector) continue;
                const connector = allowConnector ? solveCurbConnector(p0, p1, dir0, dir1) : null;
                const targetRoadId = p1?.roadId ?? null;
                if (p0) {
                    p0.otherRoadId = targetRoadId;
                    p0.connector = connector;
                    p0.connectorTarget = p1
                        ? { roadId: targetRoadId, x: p1.x, z: p1.z, side: p1.side ?? side1 }
                        : null;
                    p0.connectorDir = dir0;
                    p0.arrowSign = 1;
                    p0.arrowRole = 'p0';
                    p0.arrowDir = dir0;
                }
                if (p1) {
                    p1.arrowSign = -1;
                    p1.arrowRole = 'p1';
                    p1.arrowDir = dir1;
                }
                pushConnector({
                    tag: 'end',
                    roadId: p0?.roadId ?? data.roadId,
                    otherRoadId: targetRoadId,
                    p0,
                    p1,
                    dir0,
                    dir1,
                    side0: p0?.side ?? side,
                    side1: p1?.side ?? side1,
                    connector
                });
            }
        }
        const connectionPoles = poles?.connection;
        if (Array.isArray(connectionPoles)) {
            for (const pole of connectionPoles) {
                if (!pole || !Number.isFinite(pole.x) || !Number.isFinite(pole.z)) continue;
                const side = pole.side === 'right' ? 'right' : 'left';
                const linked = pole.linkedTarget ?? null;
                const otherRoadId = linked?.roadId ?? pole.otherRoadId ?? pole.collision?.otherRoadId ?? null;
                let targetPole = null;
                let side1 = null;
                if (linked?.pole) {
                    targetPole = linked.pole;
                    side1 = targetPole.side ?? side;
                }
                if (!targetPole && otherRoadId != null) {
                    const other = roadById.get(otherRoadId);
                    const collisionId = pole.collisionId;
                    if (other && collisionId != null) {
                        const entry = other.connectionByCollision?.get(collisionId);
                        const candidates = [];
                        if (entry?.left) candidates.push(entry.left);
                        if (entry?.right) candidates.push(entry.right);
                        if (!candidates.length) {
                            const fallbackRef = pole.collision?.x != null && pole.collision?.z != null
                                ? { x: pole.collision.x, z: pole.collision.z }
                                : { x: pole.x, z: pole.z };
                            const fallbackPole = pickClosestEndPole(other, side, fallbackRef);
                            if (fallbackPole) candidates.push(fallbackPole);
                        }
                        if (candidates.length) {
                            let best = null;
                            let bestDist = Infinity;
                            for (const cand of candidates) {
                                const d2 = distanceSq(pole, cand);
                                if (d2 < bestDist - EPS) {
                                    bestDist = d2;
                                    best = cand;
                                }
                            }
                            if (best) {
                                targetPole = best;
                                side1 = best.side ?? side;
                            }
                        }
                    }
                }
                const { p0, p1 } = pickConnectorRoles(pole, targetPole);
                const dir0 = p0 ? getArrowDir(p0, 1) : null;
                const dir1 = p1 ? getArrowDir(p1, -1) : null;
                const allowConnector = p0 && p1 && dir0 && dir1 && shouldCreateConnector(p0, p1);
                if (p0 && p1 && dir0 && dir1 && !allowConnector) continue;
                const connector = allowConnector ? solveCurbConnector(p0, p1, dir0, dir1) : null;
                const targetRoadId = p1?.roadId ?? otherRoadId ?? null;
                if (p0) {
                    p0.connector = connector;
                    p0.connectorTarget = p1
                        ? { roadId: targetRoadId, x: p1.x, z: p1.z, side: p1.side ?? side1 }
                        : null;
                    p0.connectorDir = dir0;
                    p0.arrowSign = 1;
                    p0.arrowRole = 'p0';
                    p0.arrowDir = dir0;
                }
                if (p1) {
                    p1.arrowSign = -1;
                    p1.arrowRole = 'p1';
                    p1.arrowDir = dir1;
                }
                pushConnector({
                    tag: 'connection',
                    roadId: p0?.roadId ?? data.roadId,
                    otherRoadId: targetRoadId,
                    p0,
                    p1,
                    dir0,
                    dir1,
                    side0: p0?.side ?? side,
                    side1: p1?.side ?? side1,
                    connector
                });
            }
        }
    }

    if (curb) {
        const connectorCurbKey = CURB_COLOR_PALETTE.key('connector', 'all');
        for (const data of roadData) {
            const poles = data.road?.poles;
            if (!poles) continue;
            const allPoles = [];
            if (Array.isArray(poles.end)) allPoles.push(...poles.end);
            if (Array.isArray(poles.connection)) allPoles.push(...poles.connection);
            for (const pole of allPoles) {
                const connector = pole?.connector;
                if (!connector || !connector.ok) continue;
                addConnectorCurbSegments({
                    curb,
                    key: connectorCurbKey,
                    color: neutralCurbColor,
                    connector,
                    curveSegs: curbArcSegs,
                    curbY,
                    curbH,
                    curbT
                });
            }
        }
    }

    for (const data of roadData) {
        const centerlineStart = data.centerlineStart ?? data.rawStart;
        const centerlineEnd = data.centerlineEnd ?? data.rawEnd;
        const length = data.length ?? 0;
        if (!(length > EPS)) continue;
        const cuts = [0, length];
        const connectionCuts = [];
        if (Array.isArray(data.connectionCuts)) {
            for (const t of data.connectionCuts) {
                if (!Number.isFinite(t)) continue;
                const ct = clamp(t, 0, length);
                connectionCuts.push(ct);
                if (ct > EPS && ct < length - EPS) cuts.push(ct);
            }
        }
        const gaps = [];
        if (Array.isArray(data.connectionGaps)) {
            for (const gap of data.connectionGaps) {
                let start = gap?.start;
                let end = gap?.end;
                if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                start = clamp(start, 0, length);
                end = clamp(end, 0, length);
                if (end < start) {
                    const tmp = start;
                    start = end;
                    end = tmp;
                }
                if (end - start > EPS) gaps.push({ start, end });
            }
        }
        if (Array.isArray(data.collisionIntervals) && data.collisionIntervals.length) {
            let minCollision = Infinity;
            let maxCollision = -Infinity;
            for (const interval of data.collisionIntervals) {
                let start = interval?.start;
                let end = interval?.end;
                if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
                start = clamp(start, 0, length);
                end = clamp(end, 0, length);
                const lo = Math.min(start, end);
                const hi = Math.max(start, end);
                if (lo < minCollision) minCollision = lo;
                if (hi > maxCollision) maxCollision = hi;
            }
            if (Number.isFinite(minCollision)) {
                let hasConnBefore = false;
                let resumeAt = Infinity;
                for (const cut of connectionCuts) {
                    if (!Number.isFinite(cut)) continue;
                    if (cut > EPS && cut < minCollision - EPS) hasConnBefore = true;
                    if (cut > minCollision + EPS && cut < resumeAt) resumeAt = cut;
                }
                if (!hasConnBefore) {
                    if (!Number.isFinite(resumeAt)) resumeAt = length;
                    if (resumeAt > EPS) gaps.push({ start: 0, end: resumeAt });
                }
            }
            if (Number.isFinite(maxCollision)) {
                let hasConnAfter = false;
                let resumeFrom = -Infinity;
                for (const cut of connectionCuts) {
                    if (!Number.isFinite(cut)) continue;
                    if (cut < length - EPS && cut > maxCollision + EPS) hasConnAfter = true;
                    if (cut < maxCollision - EPS && cut > resumeFrom) resumeFrom = cut;
                }
                if (!hasConnAfter) {
                    if (!Number.isFinite(resumeFrom)) resumeFrom = 0;
                    if (length - resumeFrom > EPS) gaps.push({ start: resumeFrom, end: length });
                }
            }
        }
        if (gaps.length) {
            gaps.sort((a, b) => a.start - b.start);
            const merged = [];
            for (const gap of gaps) {
                const last = merged[merged.length - 1];
                if (!last || gap.start > last.end + EPS) merged.push({ start: gap.start, end: gap.end });
                else last.end = Math.max(last.end, gap.end);
            }
            gaps.length = 0;
            for (const g of merged) gaps.push(g);
        }
        cuts.sort((a, b) => a - b);
        const uniq = [];
        for (const t of cuts) {
            if (!Number.isFinite(t)) continue;
            if (!uniq.length || t - uniq[uniq.length - 1] > EPS) uniq.push(t);
        }
        const colorHex = asphaltDebug
            ? angleColorHex(data.angleIdx, tmpColor)
            : DEFAULT_COLOR_HEX;
        const edgeOffset = data.halfWidth - markEdgeInset;
        for (let i = 0; i + 1 < uniq.length; i++) {
            const t0 = uniq[i];
            const t1 = uniq[i + 1];
            if (t1 - t0 <= EPS) continue;
            if (gaps.length) {
                let skip = false;
                for (const gap of gaps) {
                    if (t1 >= gap.start + EPS && t0 <= gap.end - EPS) {
                        skip = true;
                        break;
                    }
                }
                if (skip) continue;
            }
            const segStart = { x: centerlineStart.x + data.dir.x * t0, y: centerlineStart.y + data.dir.y * t0 };
            const segEnd = { x: centerlineStart.x + data.dir.x * t1, y: centerlineStart.y + data.dir.y * t1 };
            const centerData = segmentDataFromEndpoints(segStart, segEnd);
            if (!centerData) continue;
            const leftEdge = offsetEndpoints(segStart, segEnd, data.normal, data.halfWidth);
            const rightEdge = offsetEndpoints(segStart, segEnd, data.normal, -data.halfWidth);
            asphalt.addQuadXZ({
                a: leftEdge.start,
                b: rightEdge.start,
                c: rightEdge.end,
                d: leftEdge.end,
                y: roadY,
                colorHex
            });

            const leftCurb = offsetEndpoints(segStart, segEnd, data.normal, data.curbOffset);
            const rightCurb = offsetEndpoints(segStart, segEnd, data.normal, -data.curbOffset);
            addCurbSegment(curb, leftCurb.start, leftCurb.end, curbY, curbH, curbT, neutralCurbColor);
            addCurbSegment(curb, rightCurb.start, rightCurb.end, curbY, curbH, curbT, neutralCurbColor);

            if (edgeOffset > markLineW * EDGE_MARK_MIN_SCALE) {
                const edgeA = offsetEndpoints(segStart, segEnd, data.normal, edgeOffset);
                const edgeB = offsetEndpoints(segStart, segEnd, data.normal, -edgeOffset);
                addSolidMark(markings, 'white', segmentDataFromEndpoints(edgeA.start, edgeA.end), markLineW, data.heading, markY);
                addSolidMark(markings, 'white', segmentDataFromEndpoints(edgeB.start, edgeB.end), markLineW, data.heading, markY);
            }

            if (data.twoWay) {
                addSolidMark(markings, 'yellow', centerData, markLineW, data.heading, markY);
                for (let lane = 1; lane < data.lanesF; lane++) {
                    const offset = laneWidth * lane;
                    const lineData = offsetEndpoints(segStart, segEnd, data.normal, offset);
                    addDashedMark(markings, 'white', segmentDataFromEndpoints(lineData.start, lineData.end), data.dir, markLineW, data.heading, markY, data.dashLen, data.dashGap);
                }
                for (let lane = 1; lane < data.lanesB; lane++) {
                    const offset = -laneWidth * lane;
                    const lineData = offsetEndpoints(segStart, segEnd, data.normal, offset);
                    addDashedMark(markings, 'white', segmentDataFromEndpoints(lineData.start, lineData.end), data.dir, markLineW, data.heading, markY, data.dashLen, data.dashGap);
                }
            } else if (data.totalLanes > 1) {
                for (let lane = 1; lane < data.totalLanes; lane++) {
                    const offset = (lane - data.totalLanes * HALF) * laneWidth;
                    const lineData = offsetEndpoints(segStart, segEnd, data.normal, offset);
                    addDashedMark(markings, 'white', segmentDataFromEndpoints(lineData.start, lineData.end), data.dir, markLineW, data.heading, markY, data.dashLen, data.dashGap);
                }
            }
        }
    }

    asphalt.finalize();
    group.add(asphalt.mesh);

    let markingsWhite = null;
    let markingsYellow = null;
    if (markings) {
        ({ markingsWhite, markingsYellow } = markings);
        markings.finalize();
        group.add(markingsWhite);
        group.add(markingsYellow);
    }

    if (curb) {
        curb.finalize();
        group.add(curb.mesh);
        for (const m of curb.buildCurveMeshes()) group.add(m);
    }

    if (poleDots) {
        poleDots.count = poleCount;
        poleDots.instanceMatrix.needsUpdate = true;
        poleDots.name = 'RoadPoleDots';
        group.add(poleDots);
    }

    return {
        group,
        asphalt: asphalt.mesh,
        sidewalk: null,
        curbBlocks: curb?.mesh ?? null,
        markingsWhite,
        markingsYellow,
        curbConnectors,
        collisionMarkers
    };
}
