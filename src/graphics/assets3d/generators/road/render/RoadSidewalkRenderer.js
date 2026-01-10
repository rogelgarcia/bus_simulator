// src/graphics/assets3d/generators/road/render/RoadSidewalkRenderer.js
// Renders sidewalk surfaces using curb geometry as the guide.
import { buildRenderData } from './RoadRenderData.js';
import { offsetEndpoints } from '../geometry/RoadGeometryCalc.js';
import { EPS, HALF } from '../RoadConstants.js';

const TAU = Math.PI * 2;

function wrapAngleLocal(a) {
    a = a % TAU;
    if (a < 0) a += TAU;
    return a;
}

function curbArcSpan(arc) {
    const dir = arc.turnDir === 'L' ? 1 : -1;
    const worldStart = arc.startAngle;
    const worldEnd = worldStart + dir * arc.deltaAngle;
    const start = wrapAngleLocal(-worldStart);
    const end = wrapAngleLocal(-worldEnd);
    if (arc.turnDir === 'L') return { startAng: end, spanAng: arc.deltaAngle };
    return { startAng: start, spanAng: arc.deltaAngle };
}

function minDistanceToRoadCenterlines(p, roads) {
    if (!p || !Array.isArray(roads) || !roads.length) return Infinity;
    let best = Infinity;
    for (const road of roads) {
        const base = road?.centerlineStart ?? road?.rawStart ?? null;
        const normal = road?.normal ?? null;
        if (!base || !normal) continue;
        const dx = p.x - base.x;
        const dy = p.y - base.y;
        const dist = Math.abs(dx * normal.x + dy * normal.y);
        if (dist < best) best = dist;
    }
    return best;
}

function collectConnectorRoads(pole, roadById) {
    const out = [];
    const addById = (id) => {
        if (id == null) return;
        const road = roadById?.get?.(id) ?? null;
        if (road && !out.includes(road)) out.push(road);
    };
    addById(pole?.roadId ?? null);
    addById(pole?.connectorTarget?.roadId ?? null);
    addById(pole?.otherRoadId ?? null);
    addById(pole?.collision?.otherRoadId ?? null);
    return out;
}

function connectorSideSignForStraight(segment, roads, curbHalf, eps) {
    const start = segment?.startPoint ?? null;
    const end = segment?.endPoint ?? null;
    const dir = segment?.direction ?? null;
    if (!start || !end || !dir) return null;
    const nx = -dir.y;
    const ny = dir.x;
    const midX = (start.x + end.x) * HALF;
    const midY = (start.y + end.y) * HALF;
    const test = curbHalf + eps;
    const pPlus = { x: midX + nx * test, y: midY + ny * test };
    const pMinus = { x: midX - nx * test, y: midY - ny * test };
    const dPlus = minDistanceToRoadCenterlines(pPlus, roads);
    const dMinus = minDistanceToRoadCenterlines(pMinus, roads);
    if (!Number.isFinite(dPlus) && !Number.isFinite(dMinus)) return 1;
    if (!Number.isFinite(dPlus)) return -1;
    if (!Number.isFinite(dMinus)) return 1;
    const roadOnPlus = dPlus <= dMinus;
    return roadOnPlus ? -1 : 1;
}

function arcIsRoadOnOuterRadius(segment, roads, curbHalf, eps) {
    const center = segment?.center ?? null;
    const r = segment?.radius ?? null;
    const startAngle = segment?.startAngle ?? null;
    const deltaAngle = segment?.deltaAngle ?? null;
    if (!center || !Number.isFinite(r) || !Number.isFinite(startAngle) || !Number.isFinite(deltaAngle)) return true;
    const turnDir = segment?.turnDir === 'L' ? 1 : -1;
    const midAngle = startAngle + turnDir * deltaAngle * HALF;
    const ux = Math.cos(midAngle);
    const uy = Math.sin(midAngle);
    const test = curbHalf + eps;
    const pOuter = { x: center.x + ux * (r + test), y: center.y + uy * (r + test) };
    const pInner = { x: center.x + ux * (r - test), y: center.y + uy * (r - test) };
    const dOuter = minDistanceToRoadCenterlines(pOuter, roads);
    const dInner = minDistanceToRoadCenterlines(pInner, roads);
    if (!Number.isFinite(dOuter) && !Number.isFinite(dInner)) return true;
    if (!Number.isFinite(dOuter)) return false;
    if (!Number.isFinite(dInner)) return true;
    return dOuter <= dInner;
}

function addConnectorSidewalks({ sidewalk, roadById, pole, sidewalkY, sidewalkWidth, curbT, arcSegs, sampleEps }) {
    const connector = pole?.connector ?? null;
    if (!connector || !connector.ok || !Array.isArray(connector.segments)) return;
    const curbHalf = Math.max(0, curbT * HALF);
    const roads = collectConnectorRoads(pole, roadById);
    const curveSide = (pole?.curveConnection && (pole?.curveSide === 'internal' || pole?.curveSide === 'external'))
        ? pole.curveSide
        : null;
    const curveArcRoadOnOuter = curveSide === 'internal' ? true : (curveSide === 'external' ? false : null);
    const wantsRadialOutward = curveSide === 'external' ? true : (curveSide === 'internal' ? false : null);
    const segments = connector.segments;
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (!segment) continue;
        if (segment.type === 'ARC') {
            const r = segment.radius ?? 0;
            if (!(r > EPS)) continue;
            const roadOnOuter = curveArcRoadOnOuter ?? arcIsRoadOnOuterRadius(segment, roads, curbHalf, sampleEps);
            const curbFaceR = roadOnOuter ? (r - curbHalf) : (r + curbHalf);
            const minR = Math.max(0.01, curbFaceR - (roadOnOuter ? sidewalkWidth : 0));
            const maxR = Math.max(minR + 0.01, curbFaceR + (roadOnOuter ? 0 : sidewalkWidth));
            const span = curbArcSpan(segment);
            sidewalk.addRingSectorXZ({
                centerX: segment.center.x,
                centerZ: segment.center.y,
                y: sidewalkY,
                innerR: minR,
                outerR: maxR,
                startAng: span.startAng,
                spanAng: span.spanAng,
                segs: arcSegs
            });
        } else if (segment.type === 'STRAIGHT') {
            const len = segment.length ?? 0;
            if (!(len > EPS)) continue;
            const prev = segments[i - 1] ?? null;
            let sideSign = null;
            if (wantsRadialOutward != null && prev?.type === 'ARC' && prev?.center && segment?.startPoint && segment?.direction) {
                const nx = -segment.direction.y;
                const ny = segment.direction.x;
                const radialX = segment.startPoint.x - prev.center.x;
                const radialY = segment.startPoint.y - prev.center.y;
                const dot = radialX * nx + radialY * ny;
                const radialOnPlus = dot >= 0;
                sideSign = wantsRadialOutward
                    ? (radialOnPlus ? 1 : -1)
                    : (radialOnPlus ? -1 : 1);
            }
            if (sideSign == null) sideSign = connectorSideSignForStraight(segment, roads, curbHalf, sampleEps);
            const start = segment.startPoint;
            const end = segment.endPoint;
            const dir = segment.direction;
            const nx = -dir.y;
            const ny = dir.x;
            const inner = curbHalf;
            const outer = curbHalf + sidewalkWidth;
            const ax = start.x + nx * sideSign * inner;
            const ay = start.y + ny * sideSign * inner;
            const bx = start.x + nx * sideSign * outer;
            const by = start.y + ny * sideSign * outer;
            const cx = end.x + nx * sideSign * outer;
            const cy = end.y + ny * sideSign * outer;
            const dx = end.x + nx * sideSign * inner;
            const dy = end.y + ny * sideSign * inner;
            sidewalk.addQuadXZ({
                a: { x: ax, y: ay },
                b: { x: bx, y: by },
                c: { x: cx, y: cy },
                d: { x: dx, y: dy },
                y: sidewalkY
            });
        }
    }
}

function renderStraightSidewalks({ roadData, sidewalk, sidewalkY, sidewalkWidth }) {
    if (!Array.isArray(roadData) || !sidewalk) return;
    for (const data of roadData) {
        const centerlineStart = data.centerlineStart ?? data.rawStart;
        const length = data.length ?? 0;
        if (!centerlineStart || !(length > EPS)) continue;
        const renderData = buildRenderData(data);
        const cuts = renderData.cuts ?? [];
        const gaps = renderData.gaps ?? [];
        const innerOffset = data.boundaryHalf ?? null;
        if (!Number.isFinite(innerOffset)) continue;
        const outerOffset = innerOffset + sidewalkWidth;
        for (let i = 0; i + 1 < cuts.length; i++) {
            const t0 = cuts[i];
            const t1 = cuts[i + 1];
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

            const leftInner = offsetEndpoints(segStart, segEnd, data.normal, innerOffset);
            const leftOuter = offsetEndpoints(segStart, segEnd, data.normal, outerOffset);
            sidewalk.addQuadXZ({
                a: leftInner.start,
                b: leftOuter.start,
                c: leftOuter.end,
                d: leftInner.end,
                y: sidewalkY
            });

            const rightInner = offsetEndpoints(segStart, segEnd, data.normal, -innerOffset);
            const rightOuter = offsetEndpoints(segStart, segEnd, data.normal, -outerOffset);
            sidewalk.addQuadXZ({
                a: rightInner.start,
                b: rightOuter.start,
                c: rightOuter.end,
                d: rightInner.end,
                y: sidewalkY
            });
        }
    }
}

export function renderSidewalksFromCurbs({
    roadData,
    roadById,
    sidewalk,
    sidewalkY,
    sidewalkWidth,
    curbT,
    arcSegs
} = {}) {
    if (!sidewalk || !Array.isArray(roadData)) return;
    if (!(sidewalkWidth > EPS) || !(curbT > EPS)) return;
    if (!Number.isFinite(sidewalkY)) return;

    renderStraightSidewalks({ roadData, sidewalk, sidewalkY, sidewalkWidth });

    const visited = new Set();
    const poles = [];
    for (const data of roadData) {
        const roadPoles = data?.road?.poles ?? null;
        if (!roadPoles) continue;
        if (Array.isArray(roadPoles.end)) poles.push(...roadPoles.end);
        if (Array.isArray(roadPoles.connection)) poles.push(...roadPoles.connection);
    }
    const sampleEps = 0.002;
    for (const pole of poles) {
        const connector = pole?.connector ?? null;
        if (!connector || !connector.ok) continue;
        if (visited.has(connector)) continue;
        visited.add(connector);
        addConnectorSidewalks({
            sidewalk,
            roadById,
            pole,
            sidewalkY,
            sidewalkWidth,
            curbT,
            arcSegs,
            sampleEps
        });
    }
}
