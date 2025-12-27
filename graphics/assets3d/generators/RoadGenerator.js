// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { TILE, AXIS, DIR } from '../../../src/city/CityMap.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function bitCount4(m) {
    // DIR is {N:1,E:2,S:4,W:8} -> only 4 bits
    m = m & 0x0f;
    m = (m & 0x05) + ((m >> 1) & 0x05);
    m = (m & 0x03) + ((m >> 2) & 0x03);
    return m;
}

/**
 * IMPORTANT (curves + rotation):
 * - RingGeometry / Shape arcs are authored in XY (angles measured toward +Y).
 * - We rotate them onto XZ using rotateX(-PI/2) so normals point +Y.
 * - That mapping sends local +Y -> world -Z, which mirrors Z.
 *
 * Therefore: any "quadrant" angle mapping that is based on world (+X,+Z) must flip signZ.
 */
function cornerStartAngle(signX, signZ) {
    // Map world quadrant (signX, signZ) into geometry-angle quadrant.
    // Because local +Y becomes world -Z, we must invert signZ.
    const sz = -signZ;

    // Returns start angle for arc in the quadrant:
    // NE: 0..90, NW: 90..180, SW: 180..270, SE: 270..360
    if (signX === 1 && sz === 1) return 0;
    if (signX === -1 && sz === 1) return Math.PI * 0.5;
    if (signX === -1 && sz === -1) return Math.PI;
    return Math.PI * 1.5; // (1, -1)
}

function wrapAngle(a) {
    const twoPi = Math.PI * 2;
    a = a % twoPi;
    if (a < 0) a += twoPi;
    return a;
}

function turnStartAngle(signX, signZ) {
    // For CORNER (turn) tiles, we need the *inside* quadrant relative to the arc center.
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

function intersectionCornerStartAngle(signX, signZ) {
    // For intersection sidewalk corners we want the fillet arc that is tangent to the two straight curb segments.
    // That fillet is the *opposite* quadrant relative to the fillet center.
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

function connToCornerSigns(connMask) {
    const n = (connMask & DIR.N) !== 0;
    const e = (connMask & DIR.E) !== 0;
    const s = (connMask & DIR.S) !== 0;
    const w = (connMask & DIR.W) !== 0;

    if (n && e) return { signX: 1, signZ: 1, dirs: 'NE' };
    if (n && w) return { signX: -1, signZ: 1, dirs: 'NW' };
    if (s && e) return { signX: 1, signZ: -1, dirs: 'SE' };
    if (s && w) return { signX: -1, signZ: -1, dirs: 'SW' };
    return null;
}

function ensureNonIndexedWithUV(g) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.uv) {
        const pos = gg.attributes.position;
        const uv = new Float32Array((pos.count || (pos.array.length / 3)) * 2);
        gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    return gg;
}

function mergeBufferGeometries(geoms) {
    if (!geoms || geoms.length === 0) return null;

    let totalVerts = 0;
    for (const g0 of geoms) {
        const g = ensureNonIndexedWithUV(g0);
        totalVerts += g.attributes.position.count;
    }

    const outPos = new Float32Array(totalVerts * 3);
    const outNor = new Float32Array(totalVerts * 3);
    const outUv = new Float32Array(totalVerts * 2);

    let v = 0;
    for (const g0 of geoms) {
        const g = ensureNonIndexedWithUV(g0);

        outPos.set(g.attributes.position.array, v * 3);
        outNor.set(g.attributes.normal.array, v * 3);
        outUv.set(g.attributes.uv.array, v * 2);

        v += g.attributes.position.count;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
    out.computeBoundingSphere?.();
    return out;
}

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const ts = map.tileSize;

    const roadY = config.road?.surfaceY ?? 0.02;
    const laneWidth = config.road?.laneWidth ?? 3.2;
    const shoulder = config.road?.shoulder ?? 0.35;

    // Sidewalk / curb tuning
    const sidewalkExtra = config.road?.sidewalk?.extraWidth ?? 0.0;
    const sidewalkLift = config.road?.sidewalk?.lift ?? 0.001;

    // ✅ small intersection-only “snug” to eliminate the tiny grass wedge between curb + sidewalk
    // (does NOT affect L-shaped turns; those are handled by AXIS.CORNER path).
    const sidewalkInset = config.road?.sidewalk?.inset ?? 0.06;

    const curbCornerRadius = config.road?.sidewalk?.cornerRadius ?? 1.4;

    const curbT = config.road?.curb?.thickness ?? 0.32;
    const curbHeight = config.road?.curb?.height ?? 0.17;
    const curbExtra = config.road?.curb?.extraHeight ?? 0.0;
    const curbSink = config.road?.curb?.sink ?? 0.03;

    // Ground (sidewalk/grass) sits at curb top
    const groundY = config.ground?.surfaceY ?? (roadY + curbHeight);

    const curbTop = groundY + curbExtra;
    const curbBottom = roadY - curbSink;
    const curbH = Math.max(0.04, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * 0.5;

    // Markings
    const markLineW = config.road?.markings?.lineWidth ?? 0.12;
    const markEdgeInset = config.road?.markings?.edgeInset ?? 0.22;
    const markLift = config.road?.markings?.lift ?? 0.003;
    const markY = roadY + markLift;

    // Curves config
    const turnRadiusPref = config.road?.curves?.turnRadius ?? 4.2;
    const asphaltArcSegs = clamp(config.road?.curves?.asphaltArcSegments ?? 32, 12, 96) | 0;
    const curbArcSegs = clamp(config.road?.curves?.curbArcSegments ?? 18, 8, 96) | 0;

    const roadMat = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    const sidewalkMat = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 1.0 });
    const curbMat = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });

    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: 0xf2d34f, roughness: 0.35 });

    // unit plane (XZ)
    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    // unit box
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const roadCount = map.countRoadTiles();

    // Instanced layers
    const asphalt = new THREE.InstancedMesh(planeGeo, roadMat, Math.max(1, roadCount * 4));
    asphalt.name = 'Asphalt';
    asphalt.receiveShadow = true;

    const sidewalk = new THREE.InstancedMesh(planeGeo, sidewalkMat, Math.max(1, roadCount * 10));
    sidewalk.name = 'Sidewalk';
    sidewalk.receiveShadow = true;

    const curbBlocks = new THREE.InstancedMesh(boxGeo, curbMat, Math.max(1, roadCount * 72));
    curbBlocks.name = 'CurbBlocks';
    curbBlocks.castShadow = true;
    curbBlocks.receiveShadow = true;

    const markingsWhite = new THREE.InstancedMesh(planeGeo, laneWhiteMat, Math.max(1, roadCount * 10));
    markingsWhite.name = 'MarkingsWhite';

    const markingsYellow = new THREE.InstancedMesh(planeGeo, laneYellowMat, Math.max(1, roadCount * 8));
    markingsYellow.name = 'MarkingsYellow';

    const dummy = new THREE.Object3D();

    let a = 0;
    let s = 0;
    let cb = 0;
    let mw = 0;
    let my = 0;

    function addAsphaltPlane(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        asphalt.setMatrixAt(a++, dummy.matrix);
    }

    function addSidewalkPlane(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        sidewalk.setMatrixAt(s++, dummy.matrix);
    }

    function addMarkWhite(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        markingsWhite.setMatrixAt(mw++, dummy.matrix);
    }

    function addMarkYellow(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        markingsYellow.setMatrixAt(my++, dummy.matrix);
    }

    function addCurbBox(x, y, z, sx, sy, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        curbBlocks.setMatrixAt(cb++, dummy.matrix);
    }

    // Curved geometry collectors
    const asphaltCurves = [];
    const sidewalkCurves = [];
    const curbCurves = [];

    function pushRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, outArray }) {
        if (!(outerR > innerR + 0.01)) return;

        const g = new THREE.RingGeometry(innerR, outerR, segs, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        outArray.push(g);
    }

    function pushCurbArcSolid({ centerX, centerZ, radiusCenter, startAng, spanAng, curveSegs }) {
        // True curved curb: extruded ring sector (no block stepping).
        const innerR = Math.max(0.01, radiusCenter - curbT * 0.5);
        const outerR = radiusCenter + curbT * 0.5;

        const a0 = startAng;
        const a1 = startAng + spanAng;

        const shape = new THREE.Shape();
        // Outer arc CCW a0->a1
        shape.absarc(0, 0, outerR, a0, a1, false);
        // Inner arc back a1->a0 (to close the ring sector)
        shape.absarc(0, 0, innerR, a1, a0, true);
        shape.closePath();

        const g = new THREE.ExtrudeGeometry(shape, {
            depth: curbH,
            bevelEnabled: false,
            curveSegments: clamp(curveSegs ?? 24, 8, 128) | 0
        });

        // Shape is in XY plane; map to XZ with Y-up.
        // With rotateX(-90), extrusion depth (+Z) becomes +Y.
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, curbBottom, centerZ);

        curbCurves.push(g);
    }

    function addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX, signZ }) {
        // Sidewalk shape in this quadrant, avoiding curb overlap.
        // ✅ small inset to snug sidewalk into curb for intersections (prevents grass wedge)
        const xMin = xInner + curbT - sidewalkInset;
        const zMin = zInner + curbT - sidewalkInset;

        const xMax = ts * 0.5 + sidewalkExtra;
        const zMax = ts * 0.5 + sidewalkExtra;

        const dx = xMax - xMin;
        const dz = zMax - zMin;
        if (dx <= 0.02 || dz <= 0.02) return;

        // ✅ Reduce the sidewalk “bite” radius slightly so it doesn't retreat too far from the curb
        // (this is the minor distance fix you’re asking for).
        const rEdge = clamp(curbCornerRadius - curbT, 0.15, Math.min(dx, dz));

        const shape = new THREE.Shape();
        shape.moveTo(xMin + rEdge, zMin);
        shape.lineTo(xMax, zMin);
        shape.lineTo(xMax, zMax);
        shape.lineTo(xMin, zMax);
        shape.lineTo(xMin, zMin + rEdge);
        shape.absarc(xMin, zMin, rEdge, Math.PI * 0.5, 0, true);

        const gSide = new THREE.ShapeGeometry(shape, Math.max(18, curbArcSegs));
        gSide.rotateX(-Math.PI / 2);

        const m = new THREE.Matrix4().makeScale(signX, 1, signZ);
        gSide.applyMatrix4(m);
        gSide.translate(pos.x, groundY + sidewalkLift, pos.z);
        sidewalkCurves.push(gSide);

        // ✅ FILLETED curb corner (tangent), not "centered at the corner point"
        // The two straight curb centerlines intersect at:
        //   x0 = xInner + curbT/2
        //   z0 = zInner + curbT/2
        // A fillet of radius r has its circle center at:
        //   (x0 + r, z0 + r) in the quadrant.
        const r = clamp(curbCornerRadius, 0.35, Math.min(cornerXeff, cornerZeff));
        if (r < 0.35) return;

        const x0 = xInner + curbT * 0.5;
        const z0 = zInner + curbT * 0.5;

        // Straight segments shortened by r (so they meet the arc tangentially)
        const segZLen = Math.max(0.05, cornerZeff - r);
        const segZCenter = z0 + (cornerZeff + r) * 0.5;
        addCurbBox(
            pos.x + signX * x0,
            curbY,
            pos.z + signZ * segZCenter,
            curbT,
            curbH,
            segZLen,
            0
        );

        const segXLen = Math.max(0.05, cornerXeff - r);
        const segXCenter = x0 + (cornerXeff + r) * 0.5;
        addCurbBox(
            pos.x + signX * segXCenter,
            curbY,
            pos.z + signZ * z0,
            segXLen,
            curbH,
            curbT,
            0
        );

        // Fillet arc center (offset outward by r in both axes)
        const cx = pos.x + signX * (x0 + r);
        const cz = pos.z + signZ * (z0 + r);

        const start = intersectionCornerStartAngle(signX, signZ);

        pushCurbArcSolid({
            centerX: cx,
            centerZ: cz,
            radiusCenter: r,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });
    }

    function addCornerTileCurvedTurn({ pos, wNS, wEW, connMask }) {
        const corner = connToCornerSigns(connMask);
        if (!corner) {
            addAsphaltPlane(pos.x, roadY, pos.z, ts, ts, 0);
            return;
        }

        // Conservative turn width (must fit both legs)
        const wTurn = clamp(Math.min(wNS, wEW), 1.0, ts);
        const halfW = wTurn * 0.5;

        // Clamp so arc stays inside tile, including curb thickness.
        const eps = 0.02;
        const rMax = Math.max(0.05, (ts * 0.5) - halfW - (curbT * 0.5) - eps);
        const rTurn = clamp(turnRadiusPref, 0.05, rMax);

        const cxLocal = corner.signX * rTurn;
        const czLocal = corner.signZ * rTurn;

        const legLen = Math.max(0.0, ts * 0.5 - rTurn);

        // Legs
        if (legLen > 0.001) {
            if ((connMask & DIR.N) || (connMask & DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                addAsphaltPlane(pos.x, roadY, pos.z + zCenter, wTurn, legLen, 0);
            }

            if ((connMask & DIR.E) || (connMask & DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                addAsphaltPlane(pos.x + xCenter, roadY, pos.z, legLen, wTurn, 0);
            }
        }

        // Arc: inside quadrant relative to arc center
        const start = turnStartAngle(corner.signX, corner.signZ);

        // Asphalt arc
        pushRingSectorXZ({
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            y: roadY + 0.00015,
            innerR: Math.max(0.01, rTurn - halfW),
            outerR: rTurn + halfW,
            startAng: start,
            spanAng: Math.PI * 0.5,
            segs: asphaltArcSegs,
            outArray: asphaltCurves
        });

        // Curbs around the turn
        const outerCurbCenterR = rTurn + halfW + curbT * 0.5;
        const innerCurbCenterR = rTurn - halfW - curbT * 0.5;

        pushCurbArcSolid({
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            radiusCenter: outerCurbCenterR,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });

        if (innerCurbCenterR > 0.20) {
            pushCurbArcSolid({
                centerX: pos.x + cxLocal,
                centerZ: pos.z + czLocal,
                radiusCenter: innerCurbCenterR,
                startAng: start,
                spanAng: Math.PI * 0.5,
                curveSegs: curbArcSegs * 2
            });
        }

        // Straight curbs along legs
        if (legLen > 0.001) {
            if ((connMask & DIR.N) || (connMask & DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                const zLen = legLen;
                addCurbBox(pos.x + (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0);
                addCurbBox(pos.x - (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0);
            }

            if ((connMask & DIR.E) || (connMask & DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                const xLen = legLen;
                addCurbBox(pos.x + xCenter, curbY, pos.z + (halfW + curbT * 0.5), xLen, curbH, curbT, 0);
                addCurbBox(pos.x + xCenter, curbY, pos.z - (halfW + curbT * 0.5), xLen, curbH, curbT, 0);
            }
        }

        // Sidewalk pads: conservative
        const xMin = halfW + curbT;
        const zMin = halfW + curbT;
        const xMax = ts * 0.5 + sidewalkExtra;
        const zMax = ts * 0.5 + sidewalkExtra;

        const sx = Math.max(0.05, xMax - xMin);
        const sz = Math.max(0.05, zMax - zMin);

        const quads = [
            { signX: 1, signZ: 1 },
            { signX: -1, signZ: 1 },
            { signX: 1, signZ: -1 },
            { signX: -1, signZ: -1 }
        ];

        for (const q of quads) {
            // Skip the road quadrant (the one that matches the corner directions)
            if (q.signX === corner.signX && q.signZ === corner.signZ) continue;

            const cx = pos.x + q.signX * (xMin + sx * 0.5);
            const cz = pos.z + q.signZ * (zMin + sz * 0.5);
            addSidewalkPlane(cx, groundY + sidewalkLift, cz, sx, sz, 0);
        }
    }

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] !== TILE.ROAD) continue;

            const pos = map.tileToWorldCenter(x, y);
            const lanes = map.getLanesAtIndex(idx);

            const widthNS = laneWidth * (lanes.n + lanes.s) + 2 * shoulder;
            const widthEW = laneWidth * (lanes.e + lanes.w) + 2 * shoulder;

            const wNS = clamp(widthNS, 1, ts);
            const wEW = clamp(widthEW, 1, ts);

            const ax = map.axis[idx];

            // STRAIGHT: EW
            if (ax === AXIS.EW) {
                addAsphaltPlane(pos.x, roadY, pos.z, ts, wEW, 0);

                const tBase = (ts - wEW) * 0.5;
                const t = Math.max(0, tBase + sidewalkExtra - curbT);
                if (t > 0.001) {
                    const zOut = (wEW * 0.5 + curbT + t * 0.5);
                    addSidewalkPlane(pos.x, groundY + sidewalkLift, pos.z + zOut, ts, t, 0);
                    addSidewalkPlane(pos.x, groundY + sidewalkLift, pos.z - zOut, ts, t, 0);

                    addCurbBox(pos.x, curbY, pos.z + (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0);
                    addCurbBox(pos.x, curbY, pos.z - (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0);
                }

                const half = wEW * 0.5;
                const edge = half - markEdgeInset;
                if (edge > markLineW * 0.6) {
                    addMarkWhite(pos.x, markY, pos.z + edge, ts, markLineW, 0);
                    addMarkWhite(pos.x, markY, pos.z - edge, ts, markLineW, 0);
                }

                const twoWay = lanes.e > 0 && lanes.w > 0;
                if (twoWay) addMarkYellow(pos.x, markY, pos.z, ts, markLineW, 0);
                else addMarkWhite(pos.x, markY, pos.z, ts, markLineW, 0);

                continue;
            }

            // STRAIGHT: NS
            if (ax === AXIS.NS) {
                addAsphaltPlane(pos.x, roadY, pos.z, wNS, ts, 0);

                const tBase = (ts - wNS) * 0.5;
                const t = Math.max(0, tBase + sidewalkExtra - curbT);
                if (t > 0.001) {
                    const xOut = (wNS * 0.5 + curbT + t * 0.5);
                    addSidewalkPlane(pos.x + xOut, groundY + sidewalkLift, pos.z, t, ts, 0);
                    addSidewalkPlane(pos.x - xOut, groundY + sidewalkLift, pos.z, t, ts, 0);

                    addCurbBox(pos.x + (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0);
                    addCurbBox(pos.x - (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0);
                }

                const half = wNS * 0.5;
                const edge = half - markEdgeInset;
                if (edge > markLineW * 0.6) {
                    addMarkWhite(pos.x + edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                    addMarkWhite(pos.x - edge, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                }

                const twoWay = lanes.n > 0 && lanes.s > 0;
                if (twoWay) addMarkYellow(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);
                else addMarkWhite(pos.x, markY, pos.z, ts, markLineW, Math.PI * 0.5);

                continue;
            }

            // CORNER (90° turn): smooth curved road, not a crossing
            if (ax === AXIS.CORNER) {
                const connMask = map.conn[idx] ?? 0;
                addCornerTileCurvedTurn({ pos, wNS, wEW, connMask });
                continue;
            }

            // INTERSECTION / T-JUNCTION:
            addAsphaltPlane(pos.x, roadY, pos.z, ts, ts, 0);

            const xInner = wNS * 0.5;
            const zInner = wEW * 0.5;

            const cornerX = (ts - wNS) * 0.5;
            const cornerZ = (ts - wEW) * 0.5;

            if (cornerX <= 0.001 || cornerZ <= 0.001) continue;

            const cornerXeff = cornerX + sidewalkExtra;
            const cornerZeff = cornerZ + sidewalkExtra;

            const connMask = map.conn[idx] ?? 0;
            const degree = bitCount4(connMask);
            const doRounded = (degree >= 2);

            if (doRounded) {
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: 1 });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: 1 });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: -1 });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: -1 });
            } else {
                // Conservative fallback: sharp corners, avoid overlap.
                const xMin2 = xInner + curbT;
                const zMin2 = zInner + curbT;
                const xMax2 = ts * 0.5 + sidewalkExtra;
                const zMax2 = ts * 0.5 + sidewalkExtra;

                const sx2 = Math.max(0.05, xMax2 - xMin2);
                const sz2 = Math.max(0.05, zMax2 - zMin2);

                const xOff = xMin2 + sx2 * 0.5;
                const zOff = zMin2 + sz2 * 0.5;

                addSidewalkPlane(pos.x + xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0);
                addSidewalkPlane(pos.x - xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0);
                addSidewalkPlane(pos.x + xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0);
                addSidewalkPlane(pos.x - xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0);

                addCurbBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0);
                addCurbBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0);
                addCurbBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0);
                addCurbBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0);

                addCurbBox(pos.x + xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
                addCurbBox(pos.x - xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
                addCurbBox(pos.x + xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
                addCurbBox(pos.x - xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0);
            }
        }
    }

    // Finalize instanced counts
    asphalt.count = a;
    sidewalk.count = s;
    curbBlocks.count = cb;
    markingsWhite.count = mw;
    markingsYellow.count = my;

    asphalt.instanceMatrix.needsUpdate = true;
    sidewalk.instanceMatrix.needsUpdate = true;
    curbBlocks.instanceMatrix.needsUpdate = true;
    markingsWhite.instanceMatrix.needsUpdate = true;
    markingsYellow.instanceMatrix.needsUpdate = true;

    group.add(asphalt);
    group.add(sidewalk);
    group.add(curbBlocks);
    group.add(markingsWhite);
    group.add(markingsYellow);

    // Add merged curved meshes
    const asphaltCurveGeo = mergeBufferGeometries(asphaltCurves);
    if (asphaltCurveGeo) {
        const m = new THREE.Mesh(asphaltCurveGeo, roadMat);
        m.name = 'AsphaltCurves';
        m.receiveShadow = true;
        group.add(m);
    }

    const sidewalkCurveGeo = mergeBufferGeometries(sidewalkCurves);
    if (sidewalkCurveGeo) {
        const m = new THREE.Mesh(sidewalkCurveGeo, sidewalkMat);
        m.name = 'SidewalkCurves';
        m.receiveShadow = true;
        group.add(m);
    }

    const curbCurveGeo = mergeBufferGeometries(curbCurves);
    if (curbCurveGeo) {
        const m = new THREE.Mesh(curbCurveGeo, curbMat);
        m.name = 'CurbCurves';
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
    }

    return { group, asphalt, sidewalk, curbBlocks, markingsWhite, markingsYellow };
}
