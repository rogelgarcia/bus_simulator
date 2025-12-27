// graphics/assets3d/generators/internal_road/RoadTileLogic.js
import * as THREE from 'three';
import {
    clamp,
    bitCount4,
    classifyJunctionType,
    connToCornerSigns,
    intersectionCornerStartAngle,
    orientFromSigns,
    turnStartAngle
} from './RoadMath.js';
import { applyQuadrantMirrorNonIndexed } from './RoadGeometry.js';

function hasConn(connMask, bit) {
    return (connMask & bit) !== 0;
}

export function processRoadTile({ pos, lanes, axis, connMask, ctx }) {
    const {
        ts,
        AXIS,
        DIR,
        asphalt,
        sidewalk,
        curb,
        markings,
        palette,
        roadY,
        laneWidth,
        shoulder,
        sidewalkExtra,
        sidewalkLift,
        sidewalkInset,
        curbCornerRadius,
        curbT,
        curbH,
        curbY,
        curbJoinOverlap,
        groundY,
        markLineW,
        markEdgeInset,
        markY,
        turnRadiusPref,
        asphaltArcSegs,
        curbArcSegs
    } = ctx;

    const widthNS = laneWidth * ((lanes.n ?? 0) + (lanes.s ?? 0)) + 2 * shoulder;
    const widthEW = laneWidth * ((lanes.e ?? 0) + (lanes.w ?? 0)) + 2 * shoulder;

    const wNS = clamp(widthNS, 1, ts);
    const wEW = clamp(widthEW, 1, ts);

    const neutralSidewalk = palette.instanceColor('sidewalk');
    const neutralCurb = palette.instanceColor('curb');

    function addCurvedCornerCurbsAndSidewalk({ xInner, zInner, cornerXeff, cornerZeff, signX, signZ, junctionType }) {
        const orient = orientFromSigns(signX, signZ);
        const key = palette.key(junctionType, orient);

        const curbColor = palette.instanceColor('curb', junctionType, orient);
        const sidewalkColor = palette.instanceColor('sidewalk', junctionType, orient);

        const xMin = xInner + curbT - sidewalkInset;
        const zMin = zInner + curbT - sidewalkInset;

        const xMax = ts * 0.5 + sidewalkExtra;
        const zMax = ts * 0.5 + sidewalkExtra;

        const dx = xMax - xMin;
        const dz = zMax - zMin;
        if (dx <= 0.02 || dz <= 0.02) return;

        const r = clamp(curbCornerRadius, 0.35, Math.min(cornerXeff, cornerZeff));
        if (r < 0.35) return;

        const x0 = xInner + curbT * 0.5;
        const z0 = zInner + curbT * 0.5;

        const cxLocal = x0 + r;
        const czLocal = z0 + r;

        const rrWanted = (r - curbT * 0.5) + sidewalkInset;
        const rrMaxX = cxLocal - xMin;
        const rrMaxZ = czLocal - zMin;
        const rr = clamp(rrWanted, 0.05, Math.min(rrMaxX, rrMaxZ));

        const shape = new THREE.Shape();
        shape.moveTo(xMin, zMax);
        shape.lineTo(xMax, zMax);
        shape.lineTo(xMax, zMin);
        shape.lineTo(cxLocal, zMin);
        shape.absarc(cxLocal, czLocal, rr, Math.PI * 1.5, Math.PI, true);
        shape.lineTo(xMin, zMax);

        let gSide = new THREE.ShapeGeometry(shape, Math.max(18, curbArcSegs));
        gSide.rotateX(-Math.PI / 2);
        gSide = applyQuadrantMirrorNonIndexed(gSide, signX, signZ);
        gSide.translate(pos.x, groundY + sidewalkLift, pos.z);
        sidewalk.addGeometryKey(key, gSide);

        const segZStart = z0 + Math.max(0.0, r - curbJoinOverlap);
        const segZEnd = z0 + cornerZeff;
        const segZCenter = (segZStart + segZEnd) * 0.5;

        curb.addBox(
            pos.x + signX * x0,
            curbY,
            pos.z + signZ * segZCenter,
            curbT,
            curbH,
            Math.max(0.05, segZEnd - segZStart),
            0,
            curbColor
        );

        const segXStart = x0 + Math.max(0.0, r - curbJoinOverlap);
        const segXEnd = x0 + cornerXeff;
        const segXCenter = (segXStart + segXEnd) * 0.5;

        curb.addBox(
            pos.x + signX * segXCenter,
            curbY,
            pos.z + signZ * z0,
            Math.max(0.05, segXEnd - segXStart),
            curbH,
            curbT,
            0,
            curbColor
        );

        const cx = pos.x + signX * cxLocal;
        const cz = pos.z + signZ * czLocal;
        const start = intersectionCornerStartAngle(signX, signZ);

        curb.addArcSolidKey({
            key,
            centerX: cx,
            centerZ: cz,
            radiusCenter: r,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });

        const sx = Math.max(0.05, (ts * 0.5 + sidewalkExtra) - (xInner + curbT));
        const sz = Math.max(0.05, (ts * 0.5 + sidewalkExtra) - (zInner + curbT));
        if (sx > 0.05 && sz > 0.05) {
            const cxPad = pos.x + signX * ((xInner + curbT) + sx * 0.5);
            const czPad = pos.z + signZ * ((zInner + curbT) + sz * 0.5);
            sidewalk.addPlane(cxPad, groundY + sidewalkLift, czPad, sx, sz, 0, sidewalkColor);
        }
    }

    function addCornerTileCurvedTurn() {
        const corner = connToCornerSigns(connMask, DIR);
        if (!corner) {
            asphalt.addPlane(pos.x, roadY, pos.z, ts, ts, 0);
            return;
        }

        const orient = corner.dirs;
        const wTurn = clamp(Math.min(wNS, wEW), 1.0, ts);
        const halfW = wTurn * 0.5;

        const eps = 0.02;
        const rMax = Math.max(0.05, (ts * 0.5) - halfW - (curbT * 0.5) - eps);
        const rTurn = clamp(turnRadiusPref, 0.05, rMax);

        const cxLocal = corner.signX * rTurn;
        const czLocal = corner.signZ * rTurn;

        const legLen = Math.max(0.0, ts * 0.5 - rTurn);

        if (legLen > 0.001) {
            if (hasConn(connMask, DIR.N) || hasConn(connMask, DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                asphalt.addPlane(pos.x, roadY, pos.z + zCenter, wTurn, legLen, 0);
            }

            if (hasConn(connMask, DIR.E) || hasConn(connMask, DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                asphalt.addPlane(pos.x + xCenter, roadY, pos.z, legLen, wTurn, 0);
            }
        }

        const start = turnStartAngle(corner.signX, corner.signZ);

        asphalt.addRingSectorXZ({
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            y: roadY + 0.00015,
            innerR: Math.max(0.01, rTurn - halfW),
            outerR: rTurn + halfW,
            startAng: start,
            spanAng: Math.PI * 0.5,
            segs: asphaltArcSegs
        });

        const outerCurbCenterR = rTurn + halfW + curbT * 0.5;
        const innerCurbCenterR = rTurn - halfW - curbT * 0.5;

        const outerType = 'turn_outer';
        const innerType = 'turn_inner';

        const outerKey = palette.key(outerType, orient);
        const innerKey = palette.key(innerType, orient);

        curb.addArcSolidKey({
            key: outerKey,
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            radiusCenter: outerCurbCenterR,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });

        if (innerCurbCenterR > 0.20) {
            curb.addArcSolidKey({
                key: innerKey,
                centerX: pos.x + cxLocal,
                centerZ: pos.z + czLocal,
                radiusCenter: innerCurbCenterR,
                startAng: start,
                spanAng: Math.PI * 0.5,
                curveSegs: curbArcSegs * 2
            });
        }

        const curbOuterColor = palette.instanceColor('curb', outerType, orient);
        const curbInnerColor = palette.instanceColor('curb', innerType, orient);

        if (legLen > 0.001) {
            if (hasConn(connMask, DIR.N) || hasConn(connMask, DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                const zLen = legLen;
                curb.addBox(pos.x + (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0, curbOuterColor);
                curb.addBox(pos.x - (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0, curbInnerColor);
            }

            if (hasConn(connMask, DIR.E) || hasConn(connMask, DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                const xLen = legLen;
                curb.addBox(pos.x + xCenter, curbY, pos.z + (halfW + curbT * 0.5), xLen, curbH, curbT, 0, curbOuterColor);
                curb.addBox(pos.x + xCenter, curbY, pos.z - (halfW + curbT * 0.5), xLen, curbH, curbT, 0, curbInnerColor);
            }
        }

        const xMin = halfW + curbT;
        const zMin = halfW + curbT;
        const xMax = ts * 0.5 + sidewalkExtra;
        const zMax = ts * 0.5 + sidewalkExtra;

        const sx = Math.max(0.05, xMax - xMin);
        const sz = Math.max(0.05, zMax - zMin);

        const quads = [
            { signX: 1, signZ: 1, o: 'NE' },
            { signX: -1, signZ: 1, o: 'NW' },
            { signX: 1, signZ: -1, o: 'SE' },
            { signX: -1, signZ: -1, o: 'SW' }
        ];

        for (const q of quads) {
            if (q.signX === corner.signX && q.signZ === corner.signZ) continue;
            const cx = pos.x + q.signX * (xMin + sx * 0.5);
            const cz = pos.z + q.signZ * (zMin + sz * 0.5);
            const c = palette.instanceColor('sidewalk', 'turn_pad', q.o);
            sidewalk.addPlane(cx, groundY + sidewalkLift, cz, sx, sz, 0, c);
        }

        const sidewalkInnerR = (outerCurbCenterR + curbT * 0.5) - sidewalkInset;
        const sidewalkOuterR = Math.max(sidewalkInnerR + 0.05, ts * 0.5 + sidewalkExtra);

        sidewalk.addRingSectorKey({
            key: outerKey,
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            y: groundY + sidewalkLift,
            innerR: sidewalkInnerR,
            outerR: sidewalkOuterR,
            startAng: start,
            spanAng: Math.PI * 0.5,
            segs: Math.max(18, curbArcSegs * 2)
        });
    }

    if (axis === AXIS.EW) {
        asphalt.addPlane(pos.x, roadY, pos.z, ts, wEW, 0);

        const tBase = (ts - wEW) * 0.5;
        const t = Math.max(0, tBase + sidewalkExtra - curbT);
        if (t > 0.001) {
            const zOut = (wEW * 0.5 + curbT + t * 0.5);
            sidewalk.addPlane(pos.x, groundY + sidewalkLift, pos.z + zOut, ts, t, 0, neutralSidewalk);
            sidewalk.addPlane(pos.x, groundY + sidewalkLift, pos.z - zOut, ts, t, 0, neutralSidewalk);

            curb.addBox(pos.x, curbY, pos.z + (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0, neutralCurb);
            curb.addBox(pos.x, curbY, pos.z - (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0, neutralCurb);
        }

        const half = wEW * 0.5;
        const edge = half - markEdgeInset;
        if (edge > markLineW * 0.6) {
            markings.addWhite(pos.x, markY, pos.z + edge, ts, markLineW, 0);
            markings.addWhite(pos.x, markY, pos.z - edge, ts, markLineW, 0);
        }

        const twoWay = (lanes.e ?? 0) > 0 && (lanes.w ?? 0) > 0;
        if (twoWay) markings.addYellow(pos.x, markY, pos.z, ts, markLineW, 0);
        else markings.addWhite(pos.x, markY, pos.z, ts, markLineW, 0);

        return;
    }

    if (axis === AXIS.NS) {
        asphalt.addPlane(pos.x, roadY, pos.z, wNS, ts, 0);

        const tBase = (ts - wNS) * 0.5;
        const t = Math.max(0, tBase + sidewalkExtra - curbT);
        if (t > 0.001) {
            const xOut = (wNS * 0.5 + curbT + t * 0.5);
            sidewalk.addPlane(pos.x + xOut, groundY + sidewalkLift, pos.z, t, ts, 0, neutralSidewalk);
            sidewalk.addPlane(pos.x - xOut, groundY + sidewalkLift, pos.z, t, ts, 0, neutralSidewalk);

            curb.addBox(pos.x + (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0, neutralCurb);
            curb.addBox(pos.x - (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0, neutralCurb);
        }

        const half = wNS * 0.5;
        const edge = half - markEdgeInset;
        if (edge > markLineW * 0.6) {
            markings.addWhite(pos.x + edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
            markings.addWhite(pos.x - edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
        }

        const twoWay = (lanes.n ?? 0) > 0 && (lanes.s ?? 0) > 0;
        if (twoWay) markings.addYellow(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);
        else markings.addWhite(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);

        return;
    }

    if (axis === AXIS.CORNER) {
        addCornerTileCurvedTurn();
        return;
    }

    asphalt.addPlane(pos.x, roadY, pos.z, ts, ts, 0);

    const xInner = wNS * 0.5;
    const zInner = wEW * 0.5;

    const cornerX = (ts - wNS) * 0.5;
    const cornerZ = (ts - wEW) * 0.5;

    if (cornerX <= 0.001 || cornerZ <= 0.001) return;

    const cornerXeff = cornerX + sidewalkExtra;
    const cornerZeff = cornerZ + sidewalkExtra;

    const degree = bitCount4(connMask);
    const junctionType = classifyJunctionType(degree);
    const doRounded = (degree >= 2);

    if (doRounded) {
        addCurvedCornerCurbsAndSidewalk({ xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: 1, junctionType });
        addCurvedCornerCurbsAndSidewalk({ xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: 1, junctionType });
        addCurvedCornerCurbsAndSidewalk({ xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: -1, junctionType });
        addCurvedCornerCurbsAndSidewalk({ xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: -1, junctionType });
        return;
    }

    const xMin2 = xInner + curbT;
    const zMin2 = zInner + curbT;
    const xMax2 = ts * 0.5 + sidewalkExtra;
    const zMax2 = ts * 0.5 + sidewalkExtra;

    const sx2 = Math.max(0.05, xMax2 - xMin2);
    const sz2 = Math.max(0.05, zMax2 - zMin2);

    const xOff = xMin2 + sx2 * 0.5;
    const zOff = zMin2 + sz2 * 0.5;

    const cNEc = palette.instanceColor('curb', junctionType, 'NE');
    const cNWc = palette.instanceColor('curb', junctionType, 'NW');
    const cSEc = palette.instanceColor('curb', junctionType, 'SE');
    const cSWc = palette.instanceColor('curb', junctionType, 'SW');

    const cNEs = palette.instanceColor('sidewalk', junctionType, 'NE');
    const cNWs = palette.instanceColor('sidewalk', junctionType, 'NW');
    const cSEs = palette.instanceColor('sidewalk', junctionType, 'SE');
    const cSWs = palette.instanceColor('sidewalk', junctionType, 'SW');

    sidewalk.addPlane(pos.x + xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0, cNEs);
    sidewalk.addPlane(pos.x - xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0, cNWs);
    sidewalk.addPlane(pos.x + xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0, cSEs);
    sidewalk.addPlane(pos.x - xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0, cSWs);

    curb.addBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0, cNEc);
    curb.addBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0, cSEc);
    curb.addBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0, cNWc);
    curb.addBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0, cSWc);

    curb.addBox(pos.x + xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cNEc);
    curb.addBox(pos.x - xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cNWc);
    curb.addBox(pos.x + xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cSEc);
    curb.addBox(pos.x - xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cSWc);
}
