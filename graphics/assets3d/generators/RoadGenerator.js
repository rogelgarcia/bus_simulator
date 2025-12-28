// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import {
    ROAD_DEFAULTS,
    GROUND_DEFAULTS,
    CORNER_COLOR_PALETTE,
    CURB_COLOR_PALETTE,
    ASPHALT_COLOR_PALETTE,
    DEBUG_ASPHALT,
    DEBUG_HIDE_SIDEWALKS,
    DEBUG_HIDE_CURBS,
    DEBUG_DISABLE_MARKINGS_IN_ASPHALT_DEBUG
} from './GeneratorParams.js';
import { clamp, deepMerge, classifyJunctionType, intersectionCornerStartAngle } from './internal_road/RoadMath.js';
import { createAsphaltBuilder } from './internal_road/AsphaltBuilder.js';
import { createSidewalkBuilder } from './internal_road/SidewalkBuilder.js';
import { createCurbBuilder } from './internal_road/CurbBuilder.js';
import { createMarkingsBuilder } from './internal_road/MarkingsBuilder.js';
import { buildRoadGraph } from './internal_road/RoadGraph.js';

const DIR_KEYS = ['N', 'E', 'S', 'W'];
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const TWO_PI = Math.PI * 2;
const CORNERS = [
    { key: 'NE', dirA: 'N', dirB: 'E', signX: 1, signZ: 1 },
    { key: 'NW', dirA: 'N', dirB: 'W', signX: -1, signZ: 1 },
    { key: 'SE', dirA: 'S', dirB: 'E', signX: 1, signZ: -1 },
    { key: 'SW', dirA: 'S', dirB: 'W', signX: -1, signZ: -1 }
];

function edgeDir(start, end) {
    if (Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)) return (end.x >= start.x) ? 'E' : 'W';
    return (end.z >= start.z) ? 'N' : 'S';
}

function cornerFromHas(has) {
    if (has.N && has.E) return { signX: 1, signZ: 1, orient: 'NE', dirA: 'N', dirB: 'E' };
    if (has.N && has.W) return { signX: -1, signZ: 1, orient: 'NW', dirA: 'N', dirB: 'W' };
    if (has.S && has.E) return { signX: 1, signZ: -1, orient: 'SE', dirA: 'S', dirB: 'E' };
    if (has.S && has.W) return { signX: -1, signZ: -1, orient: 'SW', dirA: 'S', dirB: 'W' };
    return null;
}

function addDashedLine({ markings, axis, midX, midZ, len, offset, lineW, markY, dashLen, dashGap }) {
    const step = dashLen + dashGap;
    const start = -len * 0.5 + dashLen * 0.5;
    const end = len * 0.5 - dashLen * 0.5 + 0.001;
    for (let t = start; t <= end; t += step) {
        if (axis === 'EW') {
            markings.addWhite(midX + t, markY, midZ + offset, dashLen, lineW, 0);
        } else {
            markings.addWhite(midX + offset, markY, midZ + t, dashLen, lineW, Math.PI * 0.5);
        }
    }
}

function wrapAngleLocal(a) {
    a = a % TWO_PI;
    if (a < 0) a += TWO_PI;
    return a;
}

function arcSpan(start, end) {
    const s = wrapAngleLocal(start);
    const e = wrapAngleLocal(end);
    let span = e - s;
    if (span < 0) span += TWO_PI;
    return { start: s, span };
}

function rotatePoint(x, z, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return { x: x * c - z * s, z: x * s + z * c };
}

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const groundCfg = deepMerge(GROUND_DEFAULTS, config?.ground ?? {});
    const ts = map.tileSize;

    const roadY = roadCfg.surfaceY ?? 0.02;
    const laneWidth = roadCfg.laneWidth ?? 3.2;
    const shoulder = roadCfg.shoulder ?? 0.35;

    const sidewalkExtra = roadCfg.sidewalk?.extraWidth ?? 0.0;
    const sidewalkLift = roadCfg.sidewalk?.lift ?? 0.001;
    const sidewalkInset = roadCfg.sidewalk?.inset ?? 0.06;
    const curbCornerRadius = roadCfg.sidewalk?.cornerRadius ?? 1.4;
    const sidewalkWidth = Math.max(0, sidewalkExtra + sidewalkInset);

    const curbT = roadCfg.curb?.thickness ?? 0.32;
    const curbHeight = roadCfg.curb?.height ?? 0.17;
    const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
    const curbSink = roadCfg.curb?.sink ?? 0.03;

    const groundY = groundCfg.surfaceY ?? (roadY + curbHeight);

    const curbTop = groundY + curbExtra;
    const curbBottom = roadY - curbSink;
    const curbH = Math.max(0.04, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * 0.5;

    const markLineW = roadCfg.markings?.lineWidth ?? 0.12;
    const markEdgeInset = roadCfg.markings?.edgeInset ?? 0.22;
    const markLift = roadCfg.markings?.lift ?? 0.003;
    const markY = roadY + markLift;

    const turnRadiusPref = roadCfg.curves?.turnRadius ?? 4.2;
    const curbArcSegs = clamp(roadCfg.curves?.curbArcSegments ?? 18, 8, 96) | 0;
    const asphaltArcSegs = clamp(roadCfg.curves?.asphaltArcSegments ?? 24, 8, 128) | 0;

    const roadMatBase = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    const sidewalkMatBase = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 1.0 });
    const curbMatBase = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });

    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: 0xf2d34f, roughness: 0.35 });

    const asphaltDebug = DEBUG_ASPHALT && ASPHALT_COLOR_PALETTE?.kind === 'debug';
    const asphaltMat = asphaltDebug
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : roadMatBase;

    if (asphaltDebug && asphaltMat) asphaltMat.toneMapped = false;

    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const roadCount = map.countRoadTiles();

    const asphalt = createAsphaltBuilder({
        planeGeo,
        material: asphaltMat,
        palette: ASPHALT_COLOR_PALETTE,
        capacity: Math.max(1, roadCount * 8),
        name: 'Asphalt'
    });

    const hideSidewalk = asphaltDebug && DEBUG_HIDE_SIDEWALKS;
    const hideCurb = asphaltDebug && DEBUG_HIDE_CURBS;
    const disableMarkings = asphaltDebug && DEBUG_DISABLE_MARKINGS_IN_ASPHALT_DEBUG;

    const sidewalk = hideSidewalk
        ? null
        : createSidewalkBuilder({
            planeGeo,
            instancedMaterial: CORNER_COLOR_PALETTE.instancedMaterial(sidewalkMatBase, 'sidewalk'),
            baseMaterial: sidewalkMatBase,
            palette: CORNER_COLOR_PALETTE,
            capacity: Math.max(1, roadCount * 12),
            name: 'Sidewalk'
        });

    const curb = hideCurb
        ? null
        : createCurbBuilder({
            boxGeo,
            instancedMaterial: CURB_COLOR_PALETTE.instancedMaterial(curbMatBase, 'curb'),
            baseMaterial: curbMatBase,
            palette: CURB_COLOR_PALETTE,
            capacity: Math.max(1, roadCount * 84),
            curbT,
            curbH,
            curbBottom,
            name: 'CurbBlocks'
        });

    const markings = disableMarkings
        ? null
        : createMarkingsBuilder({
            planeGeo,
            whiteMaterial: laneWhiteMat,
            yellowMaterial: laneYellowMat,
            whiteCapacity: Math.max(1, roadCount * 10),
            yellowCapacity: Math.max(1, roadCount * 8)
        });

    const neutralSidewalkColor = sidewalkMatBase?.color?.getHex?.() ?? 0x8b8b8b;
    const neutralCurbColor = CURB_COLOR_PALETTE.instanceColor('curb') ?? 0xffffff;

    const graph = buildRoadGraph(map, { laneWidth, shoulder });

    const asphaltColor = (type, orient) => ASPHALT_COLOR_PALETTE?.instanceColor?.('asphalt', type, orient) ?? 0xffffff;

    const nodeInfo = graph.nodes.map((node) => {
        const has = { N: false, E: false, S: false, W: false };
        const widths = { N: 0, E: 0, S: 0, W: 0 };
        const extents = { N: 0, E: 0, S: 0, W: 0 };

        for (const dir of DIR_KEYS) {
            const edgeId = node.edges[dir];
            if (edgeId === undefined) continue;
            const edge = graph.edges[edgeId];
            has[dir] = true;
            widths[dir] = edge.width;
            extents[dir] = edge.length * 0.5;
        }

        let degree = 0;
        for (const dir of DIR_KEYS) if (has[dir]) degree += 1;
        const junctionType = classifyJunctionType(degree);

        const hasNS = has.N || has.S;
        const hasEW = has.E || has.W;
        const widthNS = Math.max(widths.N, widths.S);
        const widthEW = Math.max(widths.E, widths.W);
        const isCorner = degree === 2 && hasNS && hasEW;
        const isJunction = !isCorner && hasNS && hasEW;

        const caps = { N: 0, E: 0, S: 0, W: 0 };
        const curbTrim = {
            N: { E: 0, W: 0 },
            S: { E: 0, W: 0 },
            E: { N: 0, S: 0 },
            W: { N: 0, S: 0 }
        };
        let turn = null;
        let roundabout = null;

        if (isJunction) {
            caps.N = widthEW * 0.5;
            caps.S = widthEW * 0.5;
            caps.E = widthNS * 0.5;
            caps.W = widthNS * 0.5;
        }

        const corners = {};
        if (isJunction) {
            const baseTrimNS = hasEW ? caps.N : 0;
            const baseTrimEW = hasNS ? caps.E : 0;
            curbTrim.N.E = baseTrimNS;
            curbTrim.N.W = baseTrimNS;
            curbTrim.S.E = baseTrimNS;
            curbTrim.S.W = baseTrimNS;
            curbTrim.E.N = baseTrimEW;
            curbTrim.E.S = baseTrimEW;
            curbTrim.W.N = baseTrimEW;
            curbTrim.W.S = baseTrimEW;

            for (const corner of CORNERS) {
                if (!has[corner.dirA] || !has[corner.dirB]) continue;
                const xInner = widths[corner.dirA] * 0.5;
                const zInner = widths[corner.dirB] * 0.5;
                const xExtent = extents[corner.dirB];
                const zExtent = extents[corner.dirA];
                const cornerX = xExtent - xInner;
                const cornerZ = zExtent - zInner;
                if (cornerX <= 0.001 || cornerZ <= 0.001) continue;
                const cornerXeff = cornerX + sidewalkExtra;
                const cornerZeff = cornerZ + sidewalkExtra;
                const rC = clamp(curbCornerRadius, 0.35, Math.min(cornerXeff, cornerZeff));
                const x0 = xInner + curbT * 0.5;
                const z0 = zInner + curbT * 0.5;
                corners[corner.key] = {
                    rC,
                    xInner,
                    zInner,
                    x0,
                    z0,
                    signX: corner.signX,
                    signZ: corner.signZ
                };
                const tA = z0 + rC;
                const tB = x0 + rC;
                if (corner.dirA === 'N') curbTrim.N[corner.dirB] = Math.max(curbTrim.N[corner.dirB], tA);
                if (corner.dirA === 'S') curbTrim.S[corner.dirB] = Math.max(curbTrim.S[corner.dirB], tA);
                if (corner.dirB === 'E') curbTrim.E[corner.dirA] = Math.max(curbTrim.E[corner.dirA], tB);
                if (corner.dirB === 'W') curbTrim.W[corner.dirA] = Math.max(curbTrim.W[corner.dirA], tB);
            }
        } else if (isCorner) {
            const corner = cornerFromHas(has);
            if (corner) {
                const halfW = Math.min(widthNS, widthEW) * 0.5;
                const availA = extents[corner.dirA];
                const availB = extents[corner.dirB];
                const rMax = Math.min(availA, availB) - halfW - curbT * 0.5;
                const rTurn = clamp(turnRadiusPref, 0.05, Math.max(0.05, rMax));
                caps[corner.dirA] = rTurn;
                caps[corner.dirB] = rTurn;
                const outerR = rTurn + halfW + curbT * 0.5;
                const innerR = rTurn - halfW - curbT * 0.5;
                const cx = corner.signX * rTurn;
                const cz = corner.signZ * rTurn;
                const offsetA = widths[corner.dirA] * 0.5 + curbT * 0.5;
                const offsetB = widths[corner.dirB] * 0.5 + curbT * 0.5;
                const trimFromX = (xLine, radius) => {
                    const dx = xLine - cx;
                    const disc = radius * radius - dx * dx;
                    if (disc < 0) return 0;
                    const z = cz + corner.signZ * Math.sqrt(disc);
                    return Math.abs(z);
                };
                const trimFromZ = (zLine, radius) => {
                    const dz = zLine - cz;
                    const disc = radius * radius - dz * dz;
                    if (disc < 0) return 0;
                    const x = cx + corner.signX * Math.sqrt(disc);
                    return Math.abs(x);
                };
                const innerTrimA = trimFromX(corner.signX * offsetA, innerR);
                const outerTrimA = trimFromX(-corner.signX * offsetA, outerR);
                const innerTrimB = trimFromZ(corner.signZ * offsetB, innerR);
                const outerTrimB = trimFromZ(-corner.signZ * offsetB, outerR);
                if (corner.dirA === 'N') {
                    if (corner.signX > 0) {
                        curbTrim.N.E = innerTrimA;
                        curbTrim.N.W = outerTrimA;
                    } else {
                        curbTrim.N.W = innerTrimA;
                        curbTrim.N.E = outerTrimA;
                    }
                } else {
                    if (corner.signX > 0) {
                        curbTrim.S.E = innerTrimA;
                        curbTrim.S.W = outerTrimA;
                    } else {
                        curbTrim.S.W = innerTrimA;
                        curbTrim.S.E = outerTrimA;
                    }
                }
                if (corner.dirB === 'E') {
                    if (corner.signZ > 0) {
                        curbTrim.E.N = innerTrimB;
                        curbTrim.E.S = outerTrimB;
                    } else {
                        curbTrim.E.S = innerTrimB;
                        curbTrim.E.N = outerTrimB;
                    }
                } else {
                    if (corner.signZ > 0) {
                        curbTrim.W.N = innerTrimB;
                        curbTrim.W.S = outerTrimB;
                    } else {
                        curbTrim.W.S = innerTrimB;
                        curbTrim.W.N = outerTrimB;
                    }
                }
                turn = {
                    signX: corner.signX,
                    signZ: corner.signZ,
                    orient: corner.orient,
                    halfW,
                    rTurn
                };
            }
        }
        if (degree === 1) {
            const deadDir = DIR_KEYS.find((dir) => has[dir]);
            if (deadDir) {
                const edgeId = node.edges[deadDir];
                const edge = edgeId !== undefined ? graph.edges[edgeId] : null;
                const otherId = edge ? (edge.start === node.id ? edge.end : edge.start) : -1;
                const other = otherId >= 0 ? graph.nodes[otherId] : null;
                const dirAngle = other ? Math.atan2(other.z - node.z, other.x - node.x) : 0;
                const roadWidth = widths[deadDir];
                const roadHalf = roadWidth * 0.5;
                const offset = roadHalf + curbT * 0.5;
                const minR = offset + curbT * 0.5;
                const maxR = Math.max(minR, ts * 0.5 - curbT);
                const radius = clamp(roadHalf * 1.35, minR, maxR);
                const curbRadius = radius + curbT * 0.5;
                const blendGap = Math.max(0.05, curbRadius - offset);
                const blendMin = curbT * 1.1;
                const blendTarget = Math.max(blendGap * 0.25, curbRadius * 0.15);
                const blendMax = Math.max(blendMin, curbRadius * 0.35);
                const blendRadius = clamp(blendTarget, blendMin, blendMax);
                const blendZ = offset + blendRadius;
                const blendX = Math.sqrt(Math.max(0, (curbRadius + blendRadius) * (curbRadius + blendRadius) - (blendZ * blendZ)));
                const phi = Math.atan2(blendZ, blendX);
                const cap = Math.max(0, blendX);
                caps[deadDir] = Math.max(caps[deadDir] ?? 0, cap);
                if (deadDir === 'N') {
                    curbTrim.N.E = cap;
                    curbTrim.N.W = cap;
                } else if (deadDir === 'S') {
                    curbTrim.S.E = cap;
                    curbTrim.S.W = cap;
                } else if (deadDir === 'E') {
                    curbTrim.E.N = cap;
                    curbTrim.E.S = cap;
                } else if (deadDir === 'W') {
                    curbTrim.W.N = cap;
                    curbTrim.W.S = cap;
                }
                roundabout = {
                    radius,
                    curbRadius,
                    dirAngle,
                    phi,
                    blendRadius,
                    blendX,
                    blendZ
                };
            }
        }

        return {
            has,
            widths,
            extents,
            degree,
            junctionType,
            caps,
            corners,
            curbTrim,
            hasNS,
            hasEW,
            widthNS,
            widthEW,
            isCorner,
            isJunction,
            turn,
            roundabout
        };
    });

    for (const edge of graph.edges) {
        const start = graph.nodes[edge.start];
        const end = graph.nodes[edge.end];
        const dir = edgeDir(start, end);
        const dirEnd = OPP[dir];
        const startCap = nodeInfo[edge.start].caps[dir] ?? 0;
        const endCap = nodeInfo[edge.end].caps[dirEnd] ?? 0;
        const len = edge.length - startCap - endCap;
        if (len <= 0.05) continue;
        const dirSign = (dir === 'E' || dir === 'N') ? 1 : -1;
        if (edge.axis === 'EW') {
            const cx = start.x + dirSign * (startCap + len * 0.5);
            asphalt.addPlane(cx, roadY, start.z, len, edge.width, 0, asphaltColor('straight', 'EW'));
        } else {
            const cz = start.z + dirSign * (startCap + len * 0.5);
            asphalt.addPlane(start.x, roadY, cz, edge.width, len, 0, asphaltColor('straight', 'NS'));
        }
    }

    for (let i = 0; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const info = nodeInfo[i];
        if (!info.isJunction) continue;
        const plateW = info.widthNS;
        const plateH = info.widthEW;
        if (plateW <= 0.05 || plateH <= 0.05) continue;
        asphalt.addPlane(node.x, roadY, node.z, plateW, plateH, 0, asphaltColor(info.junctionType, 'all'));
    }

    for (let i = 0; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const info = nodeInfo[i];
        if (!info.isCorner || !info.turn) continue;
        const rTurn = info.turn.rTurn;
        const halfW = info.turn.halfW;
        const cx = node.x + info.turn.signX * rTurn;
        const cz = node.z + info.turn.signZ * rTurn;
        const startAng = intersectionCornerStartAngle(info.turn.signX, info.turn.signZ);
        const kTurn = ASPHALT_COLOR_PALETTE?.key ? ASPHALT_COLOR_PALETTE.key('turn', info.turn.orient) : null;
        const innerR = Math.max(0.01, rTurn - halfW);
        const outerR = rTurn + halfW;
        if (kTurn) {
            asphalt.addRingSectorKey({
                key: kTurn,
                centerX: cx,
                centerZ: cz,
                y: roadY + 0.00015,
                innerR,
                outerR,
                startAng,
                spanAng: Math.PI * 0.5,
                segs: Math.max(12, curbArcSegs)
            });
        } else {
            asphalt.addRingSectorXZ({
                centerX: cx,
                centerZ: cz,
                y: roadY + 0.00015,
                innerR,
                outerR,
                startAng,
                spanAng: Math.PI * 0.5,
                segs: Math.max(12, curbArcSegs),
                colorHex: asphaltColor('turn', info.turn.orient)
            });
        }
    }

    for (let i = 0; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const info = nodeInfo[i];
        if (!info.roundabout) continue;
        const radius = info.roundabout.radius;
        if (radius <= 0.05) continue;
        asphalt.addRingSectorXZ({
            centerX: node.x,
            centerZ: node.z,
            y: roadY + 0.00015,
            innerR: 0.01,
            outerR: radius,
            startAng: 0,
            spanAng: Math.PI * 2,
            segs: Math.max(24, asphaltArcSegs),
            colorHex: asphaltColor('junction1', 'all')
        });
    }

    if (markings) {
        for (const edge of graph.edges) {
            const start = graph.nodes[edge.start];
            const end = graph.nodes[edge.end];
            const dir = edgeDir(start, end);
            const dirEnd = OPP[dir];
            const startCap = nodeInfo[edge.start].caps[dir] ?? 0;
            const endCap = nodeInfo[edge.end].caps[dirEnd] ?? 0;
            const len = edge.length - startCap - endCap;
            if (len <= 0.05) continue;
            const dirSign = (dir === 'E' || dir === 'N') ? 1 : -1;
            const midX = (edge.axis === 'EW')
                ? start.x + dirSign * (startCap + len * 0.5)
                : start.x;
            const midZ = (edge.axis === 'EW')
                ? start.z
                : start.z + dirSign * (startCap + len * 0.5);
            const half = edge.width * 0.5;
            const edgeOffset = half - markEdgeInset;
            if (edgeOffset <= markLineW * 0.6) continue;
            const twoWay = edge.lanesF > 0 && edge.lanesB > 0;
            const dashLen = Math.max(1.2, laneWidth * 0.6);
            const dashGap = Math.max(0.8, laneWidth * 0.35);
            if (edge.axis === 'EW') {
                markings.addWhite(midX, markY, midZ + edgeOffset, len, markLineW, 0);
                markings.addWhite(midX, markY, midZ - edgeOffset, len, markLineW, 0);
                if (twoWay) markings.addYellow(midX, markY, midZ, len, markLineW, 0);
            } else {
                markings.addWhite(midX + edgeOffset, markY, midZ, len, markLineW, Math.PI * 0.5);
                markings.addWhite(midX - edgeOffset, markY, midZ, len, markLineW, Math.PI * 0.5);
                if (twoWay) markings.addYellow(midX, markY, midZ, len, markLineW, Math.PI * 0.5);
            }
            if (twoWay) {
                for (let i = 1; i < edge.lanesF; i++) {
                    addDashedLine({
                        markings,
                        axis: edge.axis,
                        midX,
                        midZ,
                        len,
                        offset: laneWidth * i,
                        lineW: markLineW,
                        markY,
                        dashLen,
                        dashGap
                    });
                }
                for (let i = 1; i < edge.lanesB; i++) {
                    addDashedLine({
                        markings,
                        axis: edge.axis,
                        midX,
                        midZ,
                        len,
                        offset: -laneWidth * i,
                        lineW: markLineW,
                        markY,
                        dashLen,
                        dashGap
                    });
                }
            } else {
                const totalLanes = edge.lanesF + edge.lanesB;
                if (totalLanes > 1) {
                    for (let i = 1; i < totalLanes; i++) {
                        const offset = (i - totalLanes * 0.5) * laneWidth;
                        addDashedLine({
                            markings,
                            axis: edge.axis,
                            midX,
                            midZ,
                            len,
                            offset,
                            lineW: markLineW,
                            markY,
                            dashLen,
                            dashGap
                        });
                    }
                }
            }
        }
    }

    if (curb) {
        for (let i = 0; i < graph.nodes.length; i++) {
            const node = graph.nodes[i];
            const info = nodeInfo[i];
            if (info.isCorner && info.turn) {
                const rTurn = info.turn.rTurn;
                const halfW = info.turn.halfW;
                const outerR = rTurn + halfW + curbT * 0.5;
                const innerR = rTurn - halfW - curbT * 0.5;
                const cx = node.x + info.turn.signX * rTurn;
                const cz = node.z + info.turn.signZ * rTurn;
                const startAng = intersectionCornerStartAngle(info.turn.signX, info.turn.signZ);
                const outerKey = CURB_COLOR_PALETTE.key('turn_outer', info.turn.orient);
                curb.addArcSolidKey({
                    key: outerKey,
                    centerX: cx,
                    centerZ: cz,
                    radiusCenter: outerR,
                    startAng,
                    spanAng: Math.PI * 0.5,
                    curveSegs: curbArcSegs * 2
                });
                if (innerR > 0.2) {
                    const innerKey = CURB_COLOR_PALETTE.key('turn_inner', info.turn.orient);
                    curb.addArcSolidKey({
                        key: innerKey,
                        centerX: cx,
                        centerZ: cz,
                        radiusCenter: innerR,
                        startAng,
                        spanAng: Math.PI * 0.5,
                        curveSegs: curbArcSegs * 2
                    });
                }
            }
            if (info.roundabout) {
                const roundKey = CURB_COLOR_PALETTE.key('turn_outer', 'NE');
                const round = info.roundabout;
                const roundStart = wrapAngleLocal(round.dirAngle + round.phi);
                const roundSpan = Math.max(0.01, TWO_PI - round.phi * 2);
                curb.addArcSolidKey({
                    key: roundKey,
                    centerX: node.x,
                    centerZ: node.z,
                    radiusCenter: round.curbRadius,
                    startAng: roundStart,
                    spanAng: roundSpan,
                    curveSegs: curbArcSegs * 2
                });
                if (round.blendRadius > 0.05 && round.blendX > 0.01) {
                    const addBlend = (sign) => {
                        const localX = round.blendX;
                        const localZ = sign * round.blendZ;
                        const center = rotatePoint(localX, localZ, round.dirAngle);
                        const angleLine = -sign * Math.PI * 0.5;
                        const angleRound = Math.atan2(-localZ, -localX);
                        const arcLineToRound = arcSpan(angleLine, angleRound);
                        const arcRoundToLine = arcSpan(angleRound, angleLine);
                        const lineStart = arcLineToRound.span <= arcRoundToLine.span;
                        const baseArc = lineStart ? arcLineToRound : arcRoundToLine;
                        const span = baseArc.span;
                        const start = baseArc.start;
                        curb.addArcSolidKey({
                            key: roundKey,
                            centerX: node.x + center.x,
                            centerZ: node.z + center.z,
                            radiusCenter: round.blendRadius,
                            startAng: wrapAngleLocal(start + round.dirAngle),
                            spanAng: span,
                            curveSegs: curbArcSegs * 2
                        });
                    };
                    addBlend(1);
                    addBlend(-1);
                }
            }
            if (!info.isJunction) continue;
            const junctionType = info.junctionType;
            for (const [cornerKey, data] of Object.entries(info.corners)) {
                const cx = node.x + data.signX * (data.x0 + data.rC);
                const cz = node.z + data.signZ * (data.z0 + data.rC);
                const startAng = intersectionCornerStartAngle(data.signX, data.signZ);
                const curbKey = CURB_COLOR_PALETTE.key(junctionType, cornerKey);
                curb.addArcSolidKey({
                    key: curbKey,
                    centerX: cx,
                    centerZ: cz,
                    radiusCenter: data.rC,
                    startAng,
                    spanAng: Math.PI * 0.5,
                    curveSegs: curbArcSegs * 2
                });
            }
        }
    }

    if (sidewalk && sidewalkWidth > 0.001) {
        for (let i = 0; i < graph.nodes.length; i++) {
            const node = graph.nodes[i];
            const info = nodeInfo[i];
            if (info.isCorner && info.turn) {
                const rTurn = info.turn.rTurn;
                const halfW = info.turn.halfW;
                const cx = node.x + info.turn.signX * rTurn;
                const cz = node.z + info.turn.signZ * rTurn;
                const innerR = rTurn + halfW + curbT * 0.5 + sidewalkInset;
                const outerR = innerR + sidewalkWidth;
                if (outerR > innerR + 0.01) {
                    const startAng = intersectionCornerStartAngle(info.turn.signX, info.turn.signZ);
                    const sidewalkKey = CORNER_COLOR_PALETTE.key('turn_outer', info.turn.orient);
                    sidewalk.addRingSectorKey({
                        key: sidewalkKey,
                        centerX: cx,
                        centerZ: cz,
                        y: groundY + sidewalkLift,
                        innerR,
                        outerR,
                        startAng,
                        spanAng: Math.PI * 0.5,
                        segs: Math.max(18, curbArcSegs * 2)
                    });
                }
            }
            if (!info.isJunction) continue;
            const junctionType = info.junctionType;
            for (const [cornerKey, data] of Object.entries(info.corners)) {
                const cx = node.x + data.signX * (data.x0 + data.rC);
                const cz = node.z + data.signZ * (data.z0 + data.rC);
                const innerR = Math.max(0.05, data.rC - curbT * 0.5 + sidewalkInset);
                const outerR = innerR + sidewalkWidth;
                if (outerR <= innerR + 0.01) continue;
                const startAng = intersectionCornerStartAngle(data.signX, data.signZ);
                const sidewalkKey = CORNER_COLOR_PALETTE.key(junctionType, cornerKey);
                sidewalk.addRingSectorKey({
                    key: sidewalkKey,
                    centerX: cx,
                    centerZ: cz,
                    y: groundY + sidewalkLift,
                    innerR,
                    outerR,
                    startAng,
                    spanAng: Math.PI * 0.5,
                    segs: Math.max(18, curbArcSegs * 2)
                });
            }
        }
    }

    if (curb) {
        for (const edge of graph.edges) {
            const start = graph.nodes[edge.start];
            const end = graph.nodes[edge.end];
            const dir = edgeDir(start, end);
            const dirEnd = OPP[dir];
            const startTrim = nodeInfo[edge.start].curbTrim[dir];
            const endTrim = nodeInfo[edge.end].curbTrim[dirEnd];
            const dirSign = (dir === 'E' || dir === 'N') ? 1 : -1;
            const offset = edge.width * 0.5 + curbT * 0.5;
            if (edge.axis === 'EW') {
                const northLen = edge.length - startTrim.N - endTrim.N;
                if (northLen > 0.05) {
                    const cx = start.x + dirSign * (startTrim.N + northLen * 0.5);
                    const cz = start.z + offset;
                    curb.addBox(cx, curbY, cz, northLen, curbH, curbT, 0, neutralCurbColor);
                }
                const southLen = edge.length - startTrim.S - endTrim.S;
                if (southLen > 0.05) {
                    const cx = start.x + dirSign * (startTrim.S + southLen * 0.5);
                    const cz = start.z - offset;
                    curb.addBox(cx, curbY, cz, southLen, curbH, curbT, 0, neutralCurbColor);
                }
            } else {
                const eastLen = edge.length - startTrim.E - endTrim.E;
                if (eastLen > 0.05) {
                    const cz = start.z + dirSign * (startTrim.E + eastLen * 0.5);
                    const cx = start.x + offset;
                    curb.addBox(cx, curbY, cz, curbT, curbH, eastLen, 0, neutralCurbColor);
                }
                const westLen = edge.length - startTrim.W - endTrim.W;
                if (westLen > 0.05) {
                    const cz = start.z + dirSign * (startTrim.W + westLen * 0.5);
                    const cx = start.x - offset;
                    curb.addBox(cx, curbY, cz, curbT, curbH, westLen, 0, neutralCurbColor);
                }
            }
        }
    }

    if (sidewalk && sidewalkWidth > 0.001) {
        for (const edge of graph.edges) {
            const start = graph.nodes[edge.start];
            const end = graph.nodes[edge.end];
            const dir = edgeDir(start, end);
            const dirEnd = OPP[dir];
            const startTrim = nodeInfo[edge.start].curbTrim[dir];
            const endTrim = nodeInfo[edge.end].curbTrim[dirEnd];
            const dirSign = (dir === 'E' || dir === 'N') ? 1 : -1;
            const offset = edge.width * 0.5 + curbT + sidewalkWidth * 0.5 - sidewalkInset;
            if (edge.axis === 'EW') {
                const northLen = edge.length - startTrim.N - endTrim.N;
                if (northLen > 0.05) {
                    const cx = start.x + dirSign * (startTrim.N + northLen * 0.5);
                    const cz = start.z + offset;
                    sidewalk.addPlane(cx, groundY + sidewalkLift, cz, northLen, sidewalkWidth, 0, neutralSidewalkColor);
                }
                const southLen = edge.length - startTrim.S - endTrim.S;
                if (southLen > 0.05) {
                    const cx = start.x + dirSign * (startTrim.S + southLen * 0.5);
                    const cz = start.z - offset;
                    sidewalk.addPlane(cx, groundY + sidewalkLift, cz, southLen, sidewalkWidth, 0, neutralSidewalkColor);
                }
            } else {
                const eastLen = edge.length - startTrim.E - endTrim.E;
                if (eastLen > 0.05) {
                    const cz = start.z + dirSign * (startTrim.E + eastLen * 0.5);
                    const cx = start.x + offset;
                    sidewalk.addPlane(cx, groundY + sidewalkLift, cz, sidewalkWidth, eastLen, 0, neutralSidewalkColor);
                }
                const westLen = edge.length - startTrim.W - endTrim.W;
                if (westLen > 0.05) {
                    const cz = start.z + dirSign * (startTrim.W + westLen * 0.5);
                    const cx = start.x - offset;
                    sidewalk.addPlane(cx, groundY + sidewalkLift, cz, sidewalkWidth, westLen, 0, neutralSidewalkColor);
                }
            }
        }
    }

    asphalt.finalize();
    group.add(asphalt.mesh);

    if (sidewalk) {
        sidewalk.finalize();
        group.add(sidewalk.mesh);
        for (const m of sidewalk.buildCurveMeshes()) group.add(m);
    }

    if (curb) {
        curb.finalize();
        group.add(curb.mesh);
        for (const m of curb.buildCurveMeshes()) group.add(m);
    }

    let markingsWhite = null;
    let markingsYellow = null;

    if (markings) {
        ({ markingsWhite, markingsYellow } = markings);
        markings.finalize();
        group.add(markingsWhite);
        group.add(markingsYellow);
    }

    return {
        group,
        asphalt: asphalt.mesh,
        sidewalk: sidewalk?.mesh ?? null,
        curbBlocks: curb?.mesh ?? null,
        markingsWhite,
        markingsYellow
    };
}
