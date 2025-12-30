// graphics/assets3d/generators/road_generator_utils/RoadRenderData.js - Render cuts, gaps, and straight segments.
// Builds cut/gap data and renders straight road meshes.
import { clamp } from '../internal_road/RoadMath.js';
import { angleColorHex } from './RoadAngleUtils.js';
import { offsetEndpoints, segmentDataFromEndpoints } from './RoadGeometryCalc.js';
import { addCurbSegment, addDashedMark, addSolidMark } from './RoadMarkingUtils.js';
import { DEFAULT_COLOR_HEX, EDGE_MARK_MIN_SCALE, EPS, HALF } from './RoadConstants.js';

export function buildRenderData(data) {
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
}

export function isInGaps(t, gaps) {
    if (!Array.isArray(gaps)) return false;
    for (const gap of gaps) {
        if (t > gap.start + EPS && t < gap.end - EPS) return true;
    }
    return false;
}

export function renderStraightRoads({
    roadData,
    asphalt,
    curb,
    markings,
    asphaltDebug,
    tmpColor,
    roadY,
    curbY,
    curbH,
    curbT,
    neutralCurbColor,
    laneWidth,
    markLineW,
    markEdgeInset,
    markY
}) {
    for (const data of roadData) {
        const centerlineStart = data.centerlineStart ?? data.rawStart;
        const centerlineEnd = data.centerlineEnd ?? data.rawEnd;
        const length = data.length ?? 0;
        if (!(length > EPS)) continue;
        const renderData = buildRenderData(data);
        const cuts = renderData.cuts ?? [];
        const gaps = renderData.gaps ?? [];
        const colorHex = asphaltDebug
            ? angleColorHex(data.angleIdx, tmpColor)
            : DEFAULT_COLOR_HEX;
        const edgeOffset = data.halfWidth - markEdgeInset;
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
}
