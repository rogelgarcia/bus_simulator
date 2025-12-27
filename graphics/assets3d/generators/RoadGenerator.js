// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { TILE, AXIS } from '../../../src/city/CityMap.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const ts = map.tileSize;

    const roadY = config.road?.surfaceY ?? 0.02;
    const groundY = config.ground?.surfaceY ?? (roadY + 0.06);

    const laneWidth = config.road?.laneWidth ?? 3.2;
    const shoulder = config.road?.shoulder ?? 0.35;

    const curbT = config.road?.curb?.thickness ?? 0.25;
    const curbExtra = config.road?.curb?.extraHeight ?? 0.0;

    // ✅ curb top flush with sidewalk+grass (groundY)
    const curbTop = groundY + curbExtra; // extraHeight is 0 by default now
    const curbBottom = roadY - 0.01;     // tiny sink to avoid Z fighting
    const curbH = Math.max(0.02, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * 0.5;

    const roadMat = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    const sidewalkMat = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 1.0 });
    const curbMat = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });

    // unit plane (XZ)
    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    // unit box
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const roadCount = map.countRoadTiles();

    // asphalt: 1 per road tile (intersection uses full-tile asphalt + corner sidewalks)
    const asphalt = new THREE.InstancedMesh(planeGeo, roadMat, Math.max(1, roadCount));
    asphalt.name = 'Asphalt';
    asphalt.receiveShadow = true;

    // sidewalk: straight tiles -> 2 strips, intersections -> 4 corners (max 4)
    const sidewalk = new THREE.InstancedMesh(planeGeo, sidewalkMat, Math.max(1, roadCount * 4));
    sidewalk.name = 'Sidewalk';
    sidewalk.receiveShadow = true;

    // curbs: straight tiles -> 2, intersections -> 8 (max 8)
    const curbs = new THREE.InstancedMesh(boxGeo, curbMat, Math.max(1, roadCount * 8));
    curbs.name = 'CurbBlockers';
    curbs.castShadow = true;
    curbs.receiveShadow = true;

    const dummy = new THREE.Object3D();

    let a = 0;
    let s = 0;
    let c = 0;

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

            // ----------------------------
            // STRAIGHT: EW
            // ----------------------------
            if (ax === AXIS.EW) {
                // Asphalt strip
                dummy.position.set(pos.x, roadY, pos.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(ts, 1, wEW);
                dummy.updateMatrix();
                asphalt.setMatrixAt(a++, dummy.matrix);

                // Sidewalk strips (north/south), same height as grass
                const t = (ts - wEW) * 0.5;
                if (t > 0.001) {
                    // north
                    dummy.position.set(pos.x, groundY, pos.z + (wEW * 0.5 + t * 0.5));
                    dummy.scale.set(ts, 1, t);
                    dummy.updateMatrix();
                    sidewalk.setMatrixAt(s++, dummy.matrix);

                    // south
                    dummy.position.set(pos.x, groundY, pos.z - (wEW * 0.5 + t * 0.5));
                    dummy.scale.set(ts, 1, t);
                    dummy.updateMatrix();
                    sidewalk.setMatrixAt(s++, dummy.matrix);

                    // Curbs at asphalt edge (no crossing logic needed here)
                    // north curb
                    dummy.position.set(pos.x, curbY, pos.z + (wEW * 0.5 + curbT * 0.5));
                    dummy.scale.set(ts, curbH, curbT);
                    dummy.updateMatrix();
                    curbs.setMatrixAt(c++, dummy.matrix);

                    // south curb
                    dummy.position.set(pos.x, curbY, pos.z - (wEW * 0.5 + curbT * 0.5));
                    dummy.scale.set(ts, curbH, curbT);
                    dummy.updateMatrix();
                    curbs.setMatrixAt(c++, dummy.matrix);
                }

                continue;
            }

            // ----------------------------
            // STRAIGHT: NS
            // ----------------------------
            if (ax === AXIS.NS) {
                // Asphalt strip
                dummy.position.set(pos.x, roadY, pos.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(wNS, 1, ts);
                dummy.updateMatrix();
                asphalt.setMatrixAt(a++, dummy.matrix);

                // Sidewalk strips (east/west), same height as grass
                const t = (ts - wNS) * 0.5;
                if (t > 0.001) {
                    // east
                    dummy.position.set(pos.x + (wNS * 0.5 + t * 0.5), groundY, pos.z);
                    dummy.scale.set(t, 1, ts);
                    dummy.updateMatrix();
                    sidewalk.setMatrixAt(s++, dummy.matrix);

                    // west
                    dummy.position.set(pos.x - (wNS * 0.5 + t * 0.5), groundY, pos.z);
                    dummy.scale.set(t, 1, ts);
                    dummy.updateMatrix();
                    sidewalk.setMatrixAt(s++, dummy.matrix);

                    // Curbs at asphalt edge
                    // east curb
                    dummy.position.set(pos.x + (wNS * 0.5 + curbT * 0.5), curbY, pos.z);
                    dummy.scale.set(curbT, curbH, ts);
                    dummy.updateMatrix();
                    curbs.setMatrixAt(c++, dummy.matrix);

                    // west curb
                    dummy.position.set(pos.x - (wNS * 0.5 + curbT * 0.5), curbY, pos.z);
                    dummy.scale.set(curbT, curbH, ts);
                    dummy.updateMatrix();
                    curbs.setMatrixAt(c++, dummy.matrix);
                }

                continue;
            }

            // ----------------------------
            // INTERSECTION (CROSSING)
            // ✅ Fix: no curbs cutting through the crossing asphalt
            // Strategy:
            //   - Asphalt is FULL tile
            //   - Sidewalk is FOUR CORNERS at groundY
            //   - Curbs are only along the INNER edges of those corners (8 segments)
            // ----------------------------
            // Full-tile asphalt (corners will cover it with raised sidewalk)
            dummy.position.set(pos.x, roadY, pos.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(ts, 1, ts);
            dummy.updateMatrix();
            asphalt.setMatrixAt(a++, dummy.matrix);

            const cornerX = (ts - wNS) * 0.5;
            const cornerZ = (ts - wEW) * 0.5;

            // If roads fill the whole tile, no corners to place
            if (cornerX <= 0.001 || cornerZ <= 0.001) continue;

            // Corner centers offset
            const xOff = wNS * 0.5 + cornerX * 0.5;
            const zOff = wEW * 0.5 + cornerZ * 0.5;

            // ---- Sidewalk corners (same height as grass)
            // NE
            dummy.position.set(pos.x + xOff, groundY, pos.z + zOff);
            dummy.scale.set(cornerX, 1, cornerZ);
            dummy.updateMatrix();
            sidewalk.setMatrixAt(s++, dummy.matrix);

            // NW
            dummy.position.set(pos.x - xOff, groundY, pos.z + zOff);
            dummy.scale.set(cornerX, 1, cornerZ);
            dummy.updateMatrix();
            sidewalk.setMatrixAt(s++, dummy.matrix);

            // SE
            dummy.position.set(pos.x + xOff, groundY, pos.z - zOff);
            dummy.scale.set(cornerX, 1, cornerZ);
            dummy.updateMatrix();
            sidewalk.setMatrixAt(s++, dummy.matrix);

            // SW
            dummy.position.set(pos.x - xOff, groundY, pos.z - zOff);
            dummy.scale.set(cornerX, 1, cornerZ);
            dummy.updateMatrix();
            sidewalk.setMatrixAt(s++, dummy.matrix);

            // ---- Curbs: ONLY inner edges (8 segments), so nothing cuts through the crossing
            const xInner = wNS * 0.5; // boundary between N-S road strip and sidewalks
            const zInner = wEW * 0.5; // boundary between E-W road strip and sidewalks

            // Vertical curb segments (run along Z) at x = ±xInner
            // right-top (NE) vertical
            dummy.position.set(pos.x + xInner + curbT * 0.5, curbY, pos.z + zOff);
            dummy.scale.set(curbT, curbH, cornerZ);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // right-bottom (SE) vertical
            dummy.position.set(pos.x + xInner + curbT * 0.5, curbY, pos.z - zOff);
            dummy.scale.set(curbT, curbH, cornerZ);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // left-top (NW) vertical
            dummy.position.set(pos.x - xInner - curbT * 0.5, curbY, pos.z + zOff);
            dummy.scale.set(curbT, curbH, cornerZ);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // left-bottom (SW) vertical
            dummy.position.set(pos.x - xInner - curbT * 0.5, curbY, pos.z - zOff);
            dummy.scale.set(curbT, curbH, cornerZ);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // Horizontal curb segments (run along X) at z = ±zInner
            // top-right (NE) horizontal
            dummy.position.set(pos.x + xOff, curbY, pos.z + zInner + curbT * 0.5);
            dummy.scale.set(cornerX, curbH, curbT);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // top-left (NW) horizontal
            dummy.position.set(pos.x - xOff, curbY, pos.z + zInner + curbT * 0.5);
            dummy.scale.set(cornerX, curbH, curbT);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // bottom-right (SE) horizontal
            dummy.position.set(pos.x + xOff, curbY, pos.z - zInner - curbT * 0.5);
            dummy.scale.set(cornerX, curbH, curbT);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);

            // bottom-left (SW) horizontal
            dummy.position.set(pos.x - xOff, curbY, pos.z - zInner - curbT * 0.5);
            dummy.scale.set(cornerX, curbH, curbT);
            dummy.updateMatrix();
            curbs.setMatrixAt(c++, dummy.matrix);
        }
    }

    asphalt.count = a;
    sidewalk.count = s;
    curbs.count = c;

    asphalt.instanceMatrix.needsUpdate = true;
    sidewalk.instanceMatrix.needsUpdate = true;
    curbs.instanceMatrix.needsUpdate = true;

    group.add(asphalt);
    group.add(sidewalk);
    group.add(curbs);

    return { group, asphalt, sidewalk, curbs };
}
