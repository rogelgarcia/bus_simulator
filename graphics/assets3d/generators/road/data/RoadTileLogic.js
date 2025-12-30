// graphics/assets3d/generators/road/data/RoadTileLogic.js
import * as THREE from 'three';
import {
    clamp,
    bitCount4,
    classifyJunctionType,
    connToCornerSigns,
    intersectionCornerStartAngle,
    orientFromSigns,
    turnStartAngle
} from '../math/RoadMath.js';
import { applyQuadrantMirrorNonIndexed } from '../geometry/RoadGeometry.js';

function hasConn(connMask, bit) {
    return (connMask & bit) !== 0;
}

function laneCountForAxis(a, b) {
    const la = a ?? 0;
    const lb = b ?? 0;
    const total = la + lb;
    if (total <= 0) return 0;
    if (la === 0 || lb === 0) return Math.max(2, total);
    return total;
}

const NULL_SIDEWALK = {
    addPlane() {},
    addGeometryKey() {},
    addRingSectorKey() {}
};

const NULL_CURB = {
    addBox() {},
    addArcSolidKey() {}
};

export function processRoadTile({ pos, lanes, axis, connMask, neighborAxis, ctx }) {
    const {
        ts,
        AXIS,
        DIR,
        asphalt,
        sidewalk: sidewalkBuilder,
        curb: curbBuilder,
        markings,
        palette,
        curbPalette,
        asphaltPalette,
        debugAsphaltOnly,
        neutralSidewalkColor,
        neutralCurbColor,
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

    const sidewalk = sidewalkBuilder ?? NULL_SIDEWALK;
    const curb = curbBuilder ?? NULL_CURB;

    const neighborAxisLocal = neighborAxis ?? {};
    const curbTrim = curbJoinOverlap * 2.0;
    const isCornerNeighbor = (dir) => {
        const nAxis = neighborAxisLocal[dir];
        return nAxis === AXIS.CORNER || nAxis === AXIS.INTERSECTION;
    };

    const widthNS = laneWidth * laneCountForAxis(lanes.n, lanes.s) + 2 * shoulder;
    const widthEW = laneWidth * laneCountForAxis(lanes.e, lanes.w) + 2 * shoulder;

    const wNS = clamp(widthNS, 1, ts);
    const wEW = clamp(widthEW, 1, ts);

    const asphaltColor = (type, orient) => asphaltPalette?.instanceColor?.('asphalt', type, orient) ?? 0xffffff;
    const asphaltKey = (type, orient) => asphaltPalette?.key ? asphaltPalette.key(type, orient) : `${type ?? 'unknown'}|${orient ?? 'unknown'}`;

    if (debugAsphaltOnly) {
        if (axis === AXIS.EW) {
            asphalt.addPlane(pos.x, roadY, pos.z, ts, wEW, 0, asphaltColor('straight', 'EW'));
            return;
        }

        if (axis === AXIS.NS) {
            asphalt.addPlane(pos.x, roadY, pos.z, wNS, ts, 0, asphaltColor('straight', 'NS'));
            return;
        }

        if (axis === AXIS.CORNER) {
            const corner = connToCornerSigns(connMask, DIR);
            if (!corner) {
                asphalt.addPlane(pos.x, roadY, pos.z, ts, ts, 0, asphaltColor('turn', 'NE'));
                return;
            }

            const orient = corner.dirs;
            const cTurn = asphaltColor('turn', orient);
            const kTurn = asphaltKey('turn', orient);

            const wTurn = clamp(Math.min(wNS, wEW), 1.0, ts);
            const halfW = wTurn * 0.5;

            const eps = 0.02;
            const rMax = Math.max(0.05, (ts * 0.5) - halfW - curbT - eps);
            const rTurn = clamp(turnRadiusPref, 0.05, rMax);

            const cxLocal = corner.signX * rTurn;
            const czLocal = corner.signZ * rTurn;

            const legLen = Math.max(0.0, ts * 0.5 - rTurn);

            if (legLen > 0.001) {
                if (hasConn(connMask, DIR.N) || hasConn(connMask, DIR.S)) {
                    const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                    asphalt.addPlane(pos.x, roadY, pos.z + zCenter, wTurn, legLen, 0, cTurn);
                }

                if (hasConn(connMask, DIR.E) || hasConn(connMask, DIR.W)) {
                    const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                    asphalt.addPlane(pos.x + xCenter, roadY, pos.z, legLen, wTurn, 0, cTurn);
                }
            }

            const start = turnStartAngle(corner.signX, corner.signZ);

            asphalt.addRingSectorKey({
                key: kTurn,
                centerX: pos.x + cxLocal,
                centerZ: pos.z + czLocal,
                y: roadY + 0.00015,
                innerR: Math.max(0.01, rTurn - halfW),
                outerR: rTurn + halfW,
                startAng: start,
                spanAng: Math.PI * 0.5,
                segs: asphaltArcSegs
            });

            return;
        }

        const degree = bitCount4(connMask);
        const junctionType = classifyJunctionType(degree);
        asphalt.addPlane(pos.x, roadY, pos.z, ts, ts, 0, asphaltColor(junctionType, 'all'));
        return;
    }

    const curbPaletteLocal = curbPalette ?? palette;
    const neutralSidewalk = neutralSidewalkColor ?? palette.instanceColor('sidewalk');
    const neutralCurb = neutralCurbColor ?? curbPaletteLocal.instanceColor('curb');

    function addCurvedCornerCurbsAndSidewalk({ xInner, zInner, cornerXeff, cornerZeff, signX, signZ, junctionType }) {
        const orient = orientFromSigns(signX, signZ);
        const sidewalkKey = palette.key(junctionType, orient);
        const curbKey = curbPaletteLocal.key(junctionType, orient);

        const curbColor = curbPaletteLocal.instanceColor('curb', junctionType, orient);
        const sidewalkColor = palette.instanceColor('sidewalk', junctionType, orient);

        const xMin = xInner + curbT - sidewalkInset;
        const zMin = zInner + curbT - sidewalkInset;

        const sidewalkEdge = ts * 0.5;
        const xMax = sidewalkEdge;
        const zMax = sidewalkEdge;

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
        sidewalk.addGeometryKey(sidewalkKey, gSide);

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
            key: curbKey,
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
            asphalt.addPlane(pos.x, roadY, pos.z, ts, ts, 0, asphaltColor('turn', 'NE'));
            return;
        }

        const orient = corner.dirs;
        const cTurn = asphaltColor('turn', orient);
        const wTurn = clamp(Math.min(wNS, wEW), 1.0, ts);
        const halfW = wTurn * 0.5;
        const halfWNS = wNS * 0.5;
        const halfWEW = wEW * 0.5;
        const sidewalkEdge = ts * 0.5;

        const eps = 0.02;
        const rMax = Math.max(0.05, (ts * 0.5) - halfW - curbT - eps);
        const rTurn = clamp(turnRadiusPref, 0.05, rMax);

        const cxLocal = corner.signX * rTurn;
        const czLocal = corner.signZ * rTurn;

        const legLen = Math.max(0.0, ts * 0.5 - rTurn);

        if (legLen > 0.001) {
            if (hasConn(connMask, DIR.N) || hasConn(connMask, DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                asphalt.addPlane(pos.x, roadY, pos.z + zCenter, wNS, legLen, 0, cTurn);
            }

            if (hasConn(connMask, DIR.E) || hasConn(connMask, DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                asphalt.addPlane(pos.x + xCenter, roadY, pos.z, legLen, wEW, 0, cTurn);
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
            segs: asphaltArcSegs,
            colorHex: cTurn
        });

        const outerCurbCenterR = rTurn + halfW + curbT * 0.5;
        const innerCurbCenterR = rTurn - halfW - curbT * 0.5;

        const outerType = 'turn_outer';
        const innerType = 'turn_inner';

        const outerKey = curbPaletteLocal.key(outerType, orient);
        const innerKey = curbPaletteLocal.key(innerType, orient);
        const sidewalkOuterKey = palette.key(outerType, orient);

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

        const curbOuterColor = curbPaletteLocal.instanceColor('curb', outerType, orient);
        const curbInnerColor = curbPaletteLocal.instanceColor('curb', innerType, orient);

        const curbHalfNS = halfWNS + curbT * 0.5;
        const curbHalfEW = halfWEW + curbT * 0.5;
        const xInner = corner.signX * curbHalfNS;
        const xOuter = -corner.signX * curbHalfNS;
        const zInner = corner.signZ * curbHalfEW;
        const zOuter = -corner.signZ * curbHalfEW;

        const zEdge = corner.signZ * (ts * 0.5);
        const xEdge = corner.signX * (ts * 0.5);

        const getZAtX = (xLine, radiusCenter) => {
            const dx = xLine - cxLocal;
            const disc = radiusCenter * radiusCenter - dx * dx;
            if (disc < 0) return null;
            return czLocal + corner.signZ * Math.sqrt(Math.max(0, disc));
        };

        const getXAtZ = (zLine, radiusCenter) => {
            const dz = zLine - czLocal;
            const disc = radiusCenter * radiusCenter - dz * dz;
            if (disc < 0) return null;
            return cxLocal + corner.signX * Math.sqrt(Math.max(0, disc));
        };

        if (legLen > 0.001) {
            if (hasConn(connMask, DIR.N) || hasConn(connMask, DIR.S)) {
                const zStartOuter = getZAtX(xOuter, outerCurbCenterR);
                if (zStartOuter !== null) {
                    const zStartOuterClamped = (corner.signZ > 0) ? Math.min(zStartOuter, zEdge) : Math.max(zStartOuter, zEdge);
                    const zLenOuter = Math.max(0.05, Math.abs(zEdge - zStartOuterClamped));
                    const zCenterOuter = (zEdge + zStartOuterClamped) * 0.5;
                    curb.addBox(pos.x + xOuter, curbY, pos.z + zCenterOuter, curbT, curbH, zLenOuter, 0, curbOuterColor);
                }

                if (innerCurbCenterR > 0.20) {
                    const zStartInner = getZAtX(xInner, innerCurbCenterR);
                    if (zStartInner !== null) {
                        const zStartInnerClamped = (corner.signZ > 0) ? Math.min(zStartInner, zEdge) : Math.max(zStartInner, zEdge);
                        const zLenInner = Math.max(0.05, Math.abs(zEdge - zStartInnerClamped));
                        const zCenterInner = (zEdge + zStartInnerClamped) * 0.5;
                        curb.addBox(pos.x + xInner, curbY, pos.z + zCenterInner, curbT, curbH, zLenInner, 0, curbInnerColor);
                    }
                }
            }

            if (hasConn(connMask, DIR.E) || hasConn(connMask, DIR.W)) {
                const xStartOuter = getXAtZ(zOuter, outerCurbCenterR);
                if (xStartOuter !== null) {
                    const xStartOuterClamped = (corner.signX > 0) ? Math.min(xStartOuter, xEdge) : Math.max(xStartOuter, xEdge);
                    const xLenOuter = Math.max(0.05, Math.abs(xEdge - xStartOuterClamped));
                    const xCenterOuter = (xEdge + xStartOuterClamped) * 0.5;
                    curb.addBox(pos.x + xCenterOuter, curbY, pos.z + zOuter, xLenOuter, curbH, curbT, 0, curbOuterColor);
                }

                if (innerCurbCenterR > 0.20) {
                    const xStartInner = getXAtZ(zInner, innerCurbCenterR);
                    if (xStartInner !== null) {
                        const xStartInnerClamped = (corner.signX > 0) ? Math.min(xStartInner, xEdge) : Math.max(xStartInner, xEdge);
                        const xLenInner = Math.max(0.05, Math.abs(xEdge - xStartInnerClamped));
                        const xCenterInner = (xEdge + xStartInnerClamped) * 0.5;
                        curb.addBox(pos.x + xCenterInner, curbY, pos.z + zInner, xLenInner, curbH, curbT, 0, curbInnerColor);
                    }
                }
            }
        }

        const xMin = wNS * 0.5 + curbT + sidewalkInset;
        const zMin = wEW * 0.5 + curbT + sidewalkInset;
        const xMax = sidewalkEdge;
        const zMax = sidewalkEdge;

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

        const sidewalkInnerR = (outerCurbCenterR + curbT * 0.5) + sidewalkInset;
        const sidewalkOuterR = Math.max(sidewalkInnerR + 0.05, sidewalkEdge);

        sidewalk.addRingSectorKey({
            key: sidewalkOuterKey,
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
        asphalt.addPlane(pos.x, roadY, pos.z, ts, wEW, 0, asphaltColor('straight', 'EW'));

        const tBase = (ts - wEW) * 0.5;
        const t = Math.max(0, tBase + sidewalkExtra - curbT);
        if (t > 0.001) {
            const zOut = (wEW * 0.5 + curbT + t * 0.5);
            sidewalk.addPlane(pos.x, groundY + sidewalkLift, pos.z + zOut, ts, t, 0, neutralSidewalk);
            sidewalk.addPlane(pos.x, groundY + sidewalkLift, pos.z - zOut, ts, t, 0, neutralSidewalk);

            const trimW = (hasConn(connMask, DIR.W) && isCornerNeighbor('w')) ? curbTrim : 0;
            const trimE = (hasConn(connMask, DIR.E) && isCornerNeighbor('e')) ? curbTrim : 0;
            const curbLen = Math.max(0.05, ts - (trimW + trimE));
            const curbOffset = (trimW - trimE) * 0.5;

            curb.addBox(pos.x + curbOffset, curbY, pos.z + (wEW * 0.5 + curbT * 0.5), curbLen, curbH, curbT, 0, neutralCurb);
            curb.addBox(pos.x + curbOffset, curbY, pos.z - (wEW * 0.5 + curbT * 0.5), curbLen, curbH, curbT, 0, neutralCurb);
        }

        if (markings) {
            const half = wEW * 0.5;
            const edge = half - markEdgeInset;
            if (edge > markLineW * 0.6) {
                markings.addWhite(pos.x, markY, pos.z + edge, ts, markLineW, 0);
                markings.addWhite(pos.x, markY, pos.z - edge, ts, markLineW, 0);
            }

            const twoWay = (lanes.e ?? 0) > 0 && (lanes.w ?? 0) > 0;
            if (twoWay) markings.addYellow(pos.x, markY, pos.z, ts, markLineW, 0);
            else markings.addWhite(pos.x, markY, pos.z, ts, markLineW, 0);
        }

        return;
    }

    if (axis === AXIS.NS) {
        asphalt.addPlane(pos.x, roadY, pos.z, wNS, ts, 0, asphaltColor('straight', 'NS'));

        const tBase = (ts - wNS) * 0.5;
        const t = Math.max(0, tBase + sidewalkExtra - curbT);
        if (t > 0.001) {
            const xOut = (wNS * 0.5 + curbT + t * 0.5);
            sidewalk.addPlane(pos.x + xOut, groundY + sidewalkLift, pos.z, t, ts, 0, neutralSidewalk);
            sidewalk.addPlane(pos.x - xOut, groundY + sidewalkLift, pos.z, t, ts, 0, neutralSidewalk);

            const trimS = (hasConn(connMask, DIR.S) && isCornerNeighbor('s')) ? curbTrim : 0;
            const trimN = (hasConn(connMask, DIR.N) && isCornerNeighbor('n')) ? curbTrim : 0;
            const curbLen = Math.max(0.05, ts - (trimS + trimN));
            const curbOffset = (trimS - trimN) * 0.5;

            curb.addBox(pos.x + (wNS * 0.5 + curbT * 0.5), curbY, pos.z + curbOffset, curbT, curbH, curbLen, 0, neutralCurb);
            curb.addBox(pos.x - (wNS * 0.5 + curbT * 0.5), curbY, pos.z + curbOffset, curbT, curbH, curbLen, 0, neutralCurb);
        }

        if (markings) {
            const half = wNS * 0.5;
            const edge = half - markEdgeInset;
            if (edge > markLineW * 0.6) {
                markings.addWhite(pos.x + edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                markings.addWhite(pos.x - edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
            }

            const twoWay = (lanes.n ?? 0) > 0 && (lanes.s ?? 0) > 0;
            if (twoWay) markings.addYellow(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);
            else markings.addWhite(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);
        }

        return;
    }

    if (axis === AXIS.CORNER) {
        addCornerTileCurvedTurn();
        return;
    }

    const degree = bitCount4(connMask);
    const junctionType = classifyJunctionType(degree);
    asphalt.addPlane(pos.x, roadY, pos.z, ts, ts, 0, asphaltColor(junctionType, 'all'));

    const xInner = wNS * 0.5;
    const zInner = wEW * 0.5;

    const cornerX = (ts - wNS) * 0.5;
    const cornerZ = (ts - wEW) * 0.5;

    if (cornerX <= 0.001 || cornerZ <= 0.001) return;

    const cornerXeff = cornerX + sidewalkExtra;
    const cornerZeff = cornerZ + sidewalkExtra;

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

    const cNEc = curbPaletteLocal.instanceColor('curb', junctionType, 'NE');
    const cNWc = curbPaletteLocal.instanceColor('curb', junctionType, 'NW');
    const cSEc = curbPaletteLocal.instanceColor('curb', junctionType, 'SE');
    const cSWc = curbPaletteLocal.instanceColor('curb', junctionType, 'SW');

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
