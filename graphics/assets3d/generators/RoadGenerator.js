// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { TILE, AXIS, DIR } from '../../../src/city/CityMap.js';
import { ROAD_DEFAULTS, GROUND_DEFAULTS, CORNER_COLOR_PALETTE } from './GeneratorParams.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function bitCount4(m) {
    m = m & 0x0f;
    m = (m & 0x05) + ((m >> 1) & 0x05);
    m = (m & 0x03) + ((m >> 2) & 0x03);
    return m;
}

function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
    if (!isObj(base)) return over;
    const out = { ...base };
    if (!isObj(over)) return out;
    for (const k of Object.keys(over)) {
        const bv = base[k];
        const ov = over[k];
        if (isObj(bv) && isObj(ov)) out[k] = deepMerge(bv, ov);
        else out[k] = ov;
    }
    return out;
}

function cornerStartAngle(signX, signZ) {
    const sz = -signZ;
    if (signX === 1 && sz === 1) return 0;
    if (signX === -1 && sz === 1) return Math.PI * 0.5;
    if (signX === -1 && sz === -1) return Math.PI;
    return Math.PI * 1.5;
}

function wrapAngle(a) {
    const twoPi = Math.PI * 2;
    a = a % twoPi;
    if (a < 0) a += twoPi;
    return a;
}

function turnStartAngle(signX, signZ) {
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

function intersectionCornerStartAngle(signX, signZ) {
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

function applyQuadrantMirrorNonIndexed(geom, signX, signZ) {
    const g = geom.index ? geom.toNonIndexed() : geom;

    const m = new THREE.Matrix4().makeScale(signX, 1, signZ);
    g.applyMatrix4(m);

    if (signX * signZ < 0) {
        const pos = g.attributes.position.array;
        const nor = g.attributes.normal?.array;
        const uv = g.attributes.uv?.array;

        for (let i = 0; i < pos.length; i += 9) {
            for (let k = 0; k < 3; k++) {
                const a = i + 3 + k;
                const b = i + 6 + k;
                const tmp = pos[a];
                pos[a] = pos[b];
                pos[b] = tmp;
            }

            if (nor) {
                for (let k = 0; k < 3; k++) {
                    const a = i + 3 + k;
                    const b = i + 6 + k;
                    const tmp = nor[a];
                    nor[a] = nor[b];
                    nor[b] = tmp;
                }
            }

            if (uv) {
                const tri = (i / 9) | 0;
                const u = tri * 6;

                for (let k = 0; k < 2; k++) {
                    const a = u + 2 + k;
                    const b = u + 4 + k;
                    const tmp = uv[a];
                    uv[a] = uv[b];
                    uv[b] = tmp;
                }
            }
        }

        g.attributes.position.needsUpdate = true;
        if (g.attributes.normal) g.attributes.normal.needsUpdate = true;
        if (g.attributes.uv) g.attributes.uv.needsUpdate = true;

        g.computeVertexNormals?.();
    }

    return g;
}

function orientFromSigns(signX, signZ) {
    if (signX === 1 && signZ === 1) return 'NE';
    if (signX === -1 && signZ === 1) return 'NW';
    if (signX === 1 && signZ === -1) return 'SE';
    return 'SW';
}

function classifyJunctionType(degree) {
    if (degree === 4) return 'cross';
    if (degree === 3) return 't';
    if (degree === 2) return 'junction2';
    return 'junction1';
}

function pushToMap(mapObj, key, geom) {
    const arr = mapObj.get(key);
    if (arr) arr.push(geom);
    else mapObj.set(key, [geom]);
}

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const ts = map.tileSize;

    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const groundCfg = deepMerge(GROUND_DEFAULTS, config?.ground ?? {});

    const roadY = roadCfg.surfaceY ?? 0.02;
    const laneWidth = roadCfg.laneWidth ?? 3.2;
    const shoulder = roadCfg.shoulder ?? 0.35;

    const sidewalkExtra = roadCfg.sidewalk?.extraWidth ?? 0.0;
    const sidewalkLift = roadCfg.sidewalk?.lift ?? 0.001;
    const sidewalkInset = roadCfg.sidewalk?.inset ?? 0.06;
    const curbCornerRadius = roadCfg.sidewalk?.cornerRadius ?? 1.4;

    const curbT = roadCfg.curb?.thickness ?? 0.32;
    const curbHeight = roadCfg.curb?.height ?? 0.17;
    const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
    const curbSink = roadCfg.curb?.sink ?? 0.03;

    const curbJoinOverlap = clamp(roadCfg.curb?.joinOverlap ?? curbT * 0.75, 0.0, curbT * 2.5);

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
    const asphaltArcSegs = clamp(roadCfg.curves?.asphaltArcSegments ?? 32, 12, 96) | 0;
    const curbArcSegs = clamp(roadCfg.curves?.curbArcSegments ?? 18, 8, 96) | 0;

    const roadMatBase = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    const sidewalkMatBase = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 1.0 });
    const curbMatBase = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });

    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: 0xf2d34f, roughness: 0.35 });

    const roadMat = roadMatBase;
    const sidewalkMatInst = CORNER_COLOR_PALETTE.instancedMaterial(sidewalkMatBase, 'sidewalk');
    const curbMatInst = CORNER_COLOR_PALETTE.instancedMaterial(curbMatBase, 'curb');

    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const roadCount = map.countRoadTiles();

    const asphalt = new THREE.InstancedMesh(planeGeo, roadMat, Math.max(1, roadCount * 4));
    asphalt.name = 'Asphalt';
    asphalt.receiveShadow = true;

    const sidewalk = new THREE.InstancedMesh(planeGeo, sidewalkMatInst, Math.max(1, roadCount * 12));
    sidewalk.name = 'Sidewalk';
    sidewalk.receiveShadow = true;

    const curbBlocks = new THREE.InstancedMesh(boxGeo, curbMatInst, Math.max(1, roadCount * 84));
    curbBlocks.name = 'CurbBlocks';
    curbBlocks.castShadow = true;
    curbBlocks.receiveShadow = true;

    const markingsWhite = new THREE.InstancedMesh(planeGeo, laneWhiteMat, Math.max(1, roadCount * 10));
    markingsWhite.name = 'MarkingsWhite';

    const markingsYellow = new THREE.InstancedMesh(planeGeo, laneYellowMat, Math.max(1, roadCount * 8));
    markingsYellow.name = 'MarkingsYellow';

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

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

    function addSidewalkPlane(x, y, z, sx, sz, ry = 0, colorHex = 0xffffff) {
        const i = s;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        sidewalk.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(colorHex);
        sidewalk.setColorAt(i, tmpColor);
        s++;
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

    function addCurbBox(x, y, z, sx, sy, sz, ry = 0, colorHex = 0xffffff) {
        const i = cb;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        curbBlocks.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(colorHex);
        curbBlocks.setColorAt(i, tmpColor);
        cb++;
    }

    const asphaltCurves = [];
    const sidewalkCurvesByKey = new Map();
    const curbCurvesByKey = new Map();

    function pushRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, outArray }) {
        if (!(outerR > innerR + 0.01)) return;
        const g = new THREE.RingGeometry(innerR, outerR, segs, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        outArray.push(g);
    }

    function pushSidewalkRingSectorKey({ key, centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs }) {
        if (!(outerR > innerR + 0.01)) return;
        const g = new THREE.RingGeometry(innerR, outerR, segs, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        pushToMap(sidewalkCurvesByKey, key, g);
    }

    function pushCurbArcSolidKey({ key, centerX, centerZ, radiusCenter, startAng, spanAng, curveSegs }) {
        const innerR = Math.max(0.01, radiusCenter - curbT * 0.5);
        const outerR = radiusCenter + curbT * 0.5;

        const a0 = startAng;
        const a1 = startAng + spanAng;

        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerR, a0, a1, false);
        shape.absarc(0, 0, innerR, a1, a0, true);
        shape.closePath();

        const g = new THREE.ExtrudeGeometry(shape, {
            depth: curbH,
            bevelEnabled: false,
            curveSegments: clamp(curveSegs ?? 24, 8, 128) | 0
        });

        g.rotateX(-Math.PI / 2);
        g.translate(centerX, curbBottom, centerZ);

        pushToMap(curbCurvesByKey, key, g);
    }

    function addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX, signZ, junctionType }) {
        const orient = orientFromSigns(signX, signZ);
        const key = CORNER_COLOR_PALETTE.key(junctionType, orient);

        const curbColor = CORNER_COLOR_PALETTE.instanceColor('curb', junctionType, orient);
        const sidewalkColor = CORNER_COLOR_PALETTE.instanceColor('sidewalk', junctionType, orient);

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
        pushToMap(sidewalkCurvesByKey, key, gSide);

        const segZStart = z0 + Math.max(0.0, r - curbJoinOverlap);
        const segZEnd = z0 + cornerZeff;
        const segZCenter = (segZStart + segZEnd) * 0.5;

        addCurbBox(
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

        addCurbBox(
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

        pushCurbArcSolidKey({
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
            addSidewalkPlane(cxPad, groundY + sidewalkLift, czPad, sx, sz, 0, sidewalkColor);
        }
    }

    function addCornerTileCurvedTurn({ pos, wNS, wEW, connMask }) {
        const corner = connToCornerSigns(connMask);
        if (!corner) {
            addAsphaltPlane(pos.x, roadY, pos.z, ts, ts, 0);
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
            if ((connMask & DIR.N) || (connMask & DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                addAsphaltPlane(pos.x, roadY, pos.z + zCenter, wTurn, legLen, 0);
            }

            if ((connMask & DIR.E) || (connMask & DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                addAsphaltPlane(pos.x + xCenter, roadY, pos.z, legLen, wTurn, 0);
            }
        }

        const start = turnStartAngle(corner.signX, corner.signZ);

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

        const outerCurbCenterR = rTurn + halfW + curbT * 0.5;
        const innerCurbCenterR = rTurn - halfW - curbT * 0.5;

        const outerType = 'turn_outer';
        const innerType = 'turn_inner';

        const outerKey = CORNER_COLOR_PALETTE.key(outerType, orient);
        const innerKey = CORNER_COLOR_PALETTE.key(innerType, orient);

        pushCurbArcSolidKey({
            key: outerKey,
            centerX: pos.x + cxLocal,
            centerZ: pos.z + czLocal,
            radiusCenter: outerCurbCenterR,
            startAng: start,
            spanAng: Math.PI * 0.5,
            curveSegs: curbArcSegs * 2
        });

        if (innerCurbCenterR > 0.20) {
            pushCurbArcSolidKey({
                key: innerKey,
                centerX: pos.x + cxLocal,
                centerZ: pos.z + czLocal,
                radiusCenter: innerCurbCenterR,
                startAng: start,
                spanAng: Math.PI * 0.5,
                curveSegs: curbArcSegs * 2
            });
        }

        const curbOuterColor = CORNER_COLOR_PALETTE.instanceColor('curb', outerType, orient);
        const curbInnerColor = CORNER_COLOR_PALETTE.instanceColor('curb', innerType, orient);

        if (legLen > 0.001) {
            if ((connMask & DIR.N) || (connMask & DIR.S)) {
                const zCenter = corner.signZ * (rTurn + ts * 0.5) * 0.5;
                const zLen = legLen;
                addCurbBox(pos.x + (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0, curbOuterColor);
                addCurbBox(pos.x - (halfW + curbT * 0.5), curbY, pos.z + zCenter, curbT, curbH, zLen, 0, curbInnerColor);
            }

            if ((connMask & DIR.E) || (connMask & DIR.W)) {
                const xCenter = corner.signX * (rTurn + ts * 0.5) * 0.5;
                const xLen = legLen;
                addCurbBox(pos.x + xCenter, curbY, pos.z + (halfW + curbT * 0.5), xLen, curbH, curbT, 0, curbOuterColor);
                addCurbBox(pos.x + xCenter, curbY, pos.z - (halfW + curbT * 0.5), xLen, curbH, curbT, 0, curbInnerColor);
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
            const c = CORNER_COLOR_PALETTE.instanceColor('sidewalk', 'turn_pad', q.o);
            addSidewalkPlane(cx, groundY + sidewalkLift, cz, sx, sz, 0, c);
        }

        const sidewalkInnerR = (outerCurbCenterR + curbT * 0.5) - sidewalkInset;
        const sidewalkOuterR = Math.max(sidewalkInnerR + 0.05, ts * 0.5 + sidewalkExtra);

        pushSidewalkRingSectorKey({
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

    const neutralSidewalk = CORNER_COLOR_PALETTE.instanceColor('sidewalk');
    const neutralCurb = CORNER_COLOR_PALETTE.instanceColor('curb');

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

            if (ax === AXIS.EW) {
                addAsphaltPlane(pos.x, roadY, pos.z, ts, wEW, 0);

                const tBase = (ts - wEW) * 0.5;
                const t = Math.max(0, tBase + sidewalkExtra - curbT);
                if (t > 0.001) {
                    const zOut = (wEW * 0.5 + curbT + t * 0.5);
                    addSidewalkPlane(pos.x, groundY + sidewalkLift, pos.z + zOut, ts, t, 0, neutralSidewalk);
                    addSidewalkPlane(pos.x, groundY + sidewalkLift, pos.z - zOut, ts, t, 0, neutralSidewalk);

                    addCurbBox(pos.x, curbY, pos.z + (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0, neutralCurb);
                    addCurbBox(pos.x, curbY, pos.z - (wEW * 0.5 + curbT * 0.5), ts, curbH, curbT, 0, neutralCurb);
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

            if (ax === AXIS.NS) {
                addAsphaltPlane(pos.x, roadY, pos.z, wNS, ts, 0);

                const tBase = (ts - wNS) * 0.5;
                const t = Math.max(0, tBase + sidewalkExtra - curbT);
                if (t > 0.001) {
                    const xOut = (wNS * 0.5 + curbT + t * 0.5);
                    addSidewalkPlane(pos.x + xOut, groundY + sidewalkLift, pos.z, t, ts, 0, neutralSidewalk);
                    addSidewalkPlane(pos.x - xOut, groundY + sidewalkLift, pos.z, t, ts, 0, neutralSidewalk);

                    addCurbBox(pos.x + (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0, neutralCurb);
                    addCurbBox(pos.x - (wNS * 0.5 + curbT * 0.5), curbY, pos.z, curbT, curbH, ts, 0, neutralCurb);
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

            if (ax === AXIS.CORNER) {
                const connMask = map.conn[idx] ?? 0;
                addCornerTileCurvedTurn({ pos, wNS, wEW, connMask });
                continue;
            }

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
            const junctionType = classifyJunctionType(degree);
            const doRounded = (degree >= 2);

            if (doRounded) {
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: 1, junctionType });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: 1, junctionType });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: 1, signZ: -1, junctionType });
                addCurvedCornerCurbsAndSidewalk({ pos, xInner, zInner, cornerXeff, cornerZeff, signX: -1, signZ: -1, junctionType });
            } else {
                const xMin2 = xInner + curbT;
                const zMin2 = zInner + curbT;
                const xMax2 = ts * 0.5 + sidewalkExtra;
                const zMax2 = ts * 0.5 + sidewalkExtra;

                const sx2 = Math.max(0.05, xMax2 - xMin2);
                const sz2 = Math.max(0.05, zMax2 - zMin2);

                const xOff = xMin2 + sx2 * 0.5;
                const zOff = zMin2 + sz2 * 0.5;

                const cNEc = CORNER_COLOR_PALETTE.instanceColor('curb', junctionType, 'NE');
                const cNWc = CORNER_COLOR_PALETTE.instanceColor('curb', junctionType, 'NW');
                const cSEc = CORNER_COLOR_PALETTE.instanceColor('curb', junctionType, 'SE');
                const cSWc = CORNER_COLOR_PALETTE.instanceColor('curb', junctionType, 'SW');

                const cNEs = CORNER_COLOR_PALETTE.instanceColor('sidewalk', junctionType, 'NE');
                const cNWs = CORNER_COLOR_PALETTE.instanceColor('sidewalk', junctionType, 'NW');
                const cSEs = CORNER_COLOR_PALETTE.instanceColor('sidewalk', junctionType, 'SE');
                const cSWs = CORNER_COLOR_PALETTE.instanceColor('sidewalk', junctionType, 'SW');

                addSidewalkPlane(pos.x + xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0, cNEs);
                addSidewalkPlane(pos.x - xOff, groundY + sidewalkLift, pos.z + zOff, sx2, sz2, 0, cNWs);
                addSidewalkPlane(pos.x + xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0, cSEs);
                addSidewalkPlane(pos.x - xOff, groundY + sidewalkLift, pos.z - zOff, sx2, sz2, 0, cSWs);

                addCurbBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0, cNEc);
                addCurbBox(pos.x + (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0, cSEc);
                addCurbBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z + zOff, curbT, curbH, sz2, 0, cNWc);
                addCurbBox(pos.x - (xInner + curbT * 0.5), curbY, pos.z - zOff, curbT, curbH, sz2, 0, cSWc);

                addCurbBox(pos.x + xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cNEc);
                addCurbBox(pos.x - xOff, curbY, pos.z + (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cNWc);
                addCurbBox(pos.x + xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cSEc);
                addCurbBox(pos.x - xOff, curbY, pos.z - (zInner + curbT * 0.5), sx2, curbH, curbT, 0, cSWc);
            }
        }
    }

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

    if (sidewalk.instanceColor) sidewalk.instanceColor.needsUpdate = true;
    if (curbBlocks.instanceColor) curbBlocks.instanceColor.needsUpdate = true;

    group.add(asphalt);
    group.add(sidewalk);
    group.add(curbBlocks);
    group.add(markingsWhite);
    group.add(markingsYellow);

    const asphaltCurveGeo = mergeBufferGeometries(asphaltCurves);
    if (asphaltCurveGeo) {
        const m = new THREE.Mesh(asphaltCurveGeo, roadMat);
        m.name = 'AsphaltCurves';
        m.receiveShadow = true;
        group.add(m);
    }

    for (const [key, geoms] of sidewalkCurvesByKey.entries()) {
        const desc = CORNER_COLOR_PALETTE.parseKey(key);
        const geo = mergeBufferGeometries(geoms);
        if (!geo) continue;
        const mat = CORNER_COLOR_PALETTE.curvedMaterial(sidewalkMatBase, 'sidewalk', desc.type, desc.orient);
        const m = new THREE.Mesh(geo, mat);
        m.name = CORNER_COLOR_PALETTE.meshName('sidewalk', desc.type, desc.orient);
        m.receiveShadow = true;
        group.add(m);
    }

    for (const [key, geoms] of curbCurvesByKey.entries()) {
        const desc = CORNER_COLOR_PALETTE.parseKey(key);
        const geo = mergeBufferGeometries(geoms);
        if (!geo) continue;
        const mat = CORNER_COLOR_PALETTE.curvedMaterial(curbMatBase, 'curb', desc.type, desc.orient);
        const m = new THREE.Mesh(geo, mat);
        m.name = CORNER_COLOR_PALETTE.meshName('curb', desc.type, desc.orient);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
    }

    return { group, asphalt, sidewalk, curbBlocks, markingsWhite, markingsYellow };
}
