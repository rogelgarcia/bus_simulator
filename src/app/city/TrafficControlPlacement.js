// src/app/city/TrafficControlPlacement.js
// Computes deterministic traffic control prop placements from a CityMap.
import { AXIS, DIR, TILE } from './CityMap.js';
import { ROAD_DEFAULTS } from '../../graphics/assets3d/generators/GeneratorParams.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export const TRAFFIC_CONTROL = Object.freeze({
    TRAFFIC_LIGHT: 'traffic_light',
    STOP_SIGN: 'stop_sign'
});

export const DEFAULT_TRAFFIC_LIGHT_LANE_THRESHOLD = 2;

export function isTrafficLightIntersection(lanes, threshold = DEFAULT_TRAFFIC_LIGHT_LANE_THRESHOLD) {
    const t = Number.isFinite(threshold) ? Math.max(1, threshold | 0) : DEFAULT_TRAFFIC_LIGHT_LANE_THRESHOLD;
    const n = Number(lanes?.n) || 0;
    const e = Number(lanes?.e) || 0;
    const s = Number(lanes?.s) || 0;
    const w = Number(lanes?.w) || 0;
    const hasNS = n > 0 && s > 0;
    const hasEW = e > 0 && w > 0;
    if (!hasNS || !hasEW) return false;
    return n >= t && s >= t && e >= t && w >= t;
}

export function classifyIntersectionTrafficControl(lanes, threshold = DEFAULT_TRAFFIC_LIGHT_LANE_THRESHOLD) {
    return isTrafficLightIntersection(lanes, threshold) ? TRAFFIC_CONTROL.TRAFFIC_LIGHT : TRAFFIC_CONTROL.STOP_SIGN;
}

function roadWidthFromTotalLanes(totalLanes, { laneWidth, shoulder, tileSize }) {
    const lanes = Number.isFinite(totalLanes) ? totalLanes : 0;
    if (!(lanes > 0)) return 0;
    const lw = Number.isFinite(laneWidth) ? laneWidth : ROAD_DEFAULTS.laneWidth;
    const sh = Number.isFinite(shoulder) ? shoulder : ROAD_DEFAULTS.shoulder;
    const ts = Number.isFinite(tileSize) ? tileSize : 1;
    const raw = lanes * lw + sh * 2;
    return clamp(raw, lw, ts);
}

function getWorldBounds(map) {
    const tileSize = map?.tileSize ?? 1;
    const half = tileSize * 0.5;
    const minX = map.origin.x - half;
    const minZ = map.origin.z - half;
    const maxX = map.origin.x + (map.width - 1) * tileSize + half;
    const maxZ = map.origin.z + (map.height - 1) * tileSize + half;
    return { minX, maxX, minZ, maxZ };
}

function withinBounds(bounds, x, z) {
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function computeTrafficControlPlacements({
    map,
    generatorConfig = null,
    laneThreshold = DEFAULT_TRAFFIC_LIGHT_LANE_THRESHOLD
} = {}) {
    if (!map) return [];

    const roadCfg = { ...ROAD_DEFAULTS, ...(generatorConfig?.road ?? {}) };
    roadCfg.curb = { ...(ROAD_DEFAULTS.curb ?? {}), ...(roadCfg.curb ?? {}) };
    roadCfg.sidewalk = { ...(ROAD_DEFAULTS.sidewalk ?? {}), ...(roadCfg.sidewalk ?? {}) };

    const laneWidth = Number.isFinite(roadCfg.laneWidth) ? roadCfg.laneWidth : ROAD_DEFAULTS.laneWidth;
    const shoulder = Number.isFinite(roadCfg.shoulder) ? roadCfg.shoulder : ROAD_DEFAULTS.shoulder;
    const curbT = Number.isFinite(roadCfg.curb?.thickness) ? roadCfg.curb.thickness : ROAD_DEFAULTS.curb.thickness;
    const curbH = Number.isFinite(roadCfg.curb?.height) ? roadCfg.curb.height : ROAD_DEFAULTS.curb.height;
    const curbExtra = Number.isFinite(roadCfg.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkWidth = Number.isFinite(roadCfg.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : ROAD_DEFAULTS.sidewalk.extraWidth;
    const sidewalkLift = Number.isFinite(roadCfg.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const roadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : ROAD_DEFAULTS.surfaceY;
    const sidewalkY = roadY + curbH + curbExtra + sidewalkLift;
    const bounds = getWorldBounds(map);
    const poleInset = clamp((Number.isFinite(sidewalkWidth) ? sidewalkWidth : 0) * 0.6, 0, map.tileSize * 0.25);
    const stopInsetBase = clamp((Number.isFinite(sidewalkWidth) ? sidewalkWidth : 0) * 0.15, 0, map.tileSize * 0.18);
    const stopInset = clamp(poleInset + (poleInset - stopInsetBase) * 2.0, 0, map.tileSize * 0.35);

    const placements = [];
    const added = new Set();

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] !== TILE.ROAD) continue;
            if (map.axis[idx] !== AXIS.INTERSECTION) continue;

            const lanes = map.getLanesAtIndex(idx);
            const kind = classifyIntersectionTrafficControl(lanes, laneThreshold);
            const ewLanes = (Number(lanes.e) || 0) + (Number(lanes.w) || 0);
            const nsLanes = (Number(lanes.n) || 0) + (Number(lanes.s) || 0);
            if (!(ewLanes > 0) || !(nsLanes > 0)) continue;

            const center = map.tileToWorldCenter(x, y);
            const widthEW = roadWidthFromTotalLanes(ewLanes, { laneWidth, shoulder, tileSize: map.tileSize });
            const widthNS = roadWidthFromTotalLanes(nsLanes, { laneWidth, shoulder, tileSize: map.tileSize });
            const offsetX = widthNS * 0.5 + curbT;
            const offsetZ = widthEW * 0.5 + curbT;

            const corners = {
                NE: { x: center.x + offsetX + stopInset, z: center.z - offsetZ - stopInset },
                NW: { x: center.x - offsetX - stopInset, z: center.z - offsetZ - stopInset },
                SE: { x: center.x + offsetX + stopInset, z: center.z + offsetZ + stopInset },
                SW: { x: center.x - offsetX - stopInset, z: center.z + offsetZ + stopInset }
            };

            if (kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT) {
                const majorAxis = ewLanes >= nsLanes ? 'EW' : 'NS';
                const conn = map.conn[idx] ?? 0;
                const tileHalf = map.tileSize * 0.5;
                const postOffset = clamp(map.tileSize * 0.12, 1.2, 3.6);
                const poleSideOffsetWorld = (majorAxis === 'EW' ? offsetZ : offsetX) + poleInset;

                const targetArm = 4.0;
                const scale = clamp(poleSideOffsetWorld / targetArm, 2.4, 3.2);
                const armLength = laneWidth / scale;
                const baseY = sidewalkY + 1.2 * scale;

                const addLight = ({ key, corner, px, pz, yaw }) => {
                    if (added.has(key)) return;
                    if (!withinBounds(bounds, px, pz)) return;
                    placements.push({
                        kind,
                        tile: { x, y },
                        corner,
                        position: { x: px, y: baseY, z: pz },
                        rotationY: yaw,
                        scale,
                        armLength
                    });
                    added.add(key);
                };

                if (majorAxis === 'EW') {
                    if (conn & DIR.W) {
                        addLight({
                            key: `${x},${y}:${kind}:NW`,
                            corner: 'NW',
                            px: center.x - tileHalf - postOffset,
                            pz: center.z - poleSideOffsetWorld,
                            yaw: Math.PI * 0.5
                        });
                    }
                    if (conn & DIR.E) {
                        addLight({
                            key: `${x},${y}:${kind}:SE`,
                            corner: 'SE',
                            px: center.x + tileHalf + postOffset,
                            pz: center.z + poleSideOffsetWorld,
                            yaw: -Math.PI * 0.5
                        });
                    }
                } else {
                    if (conn & DIR.N) {
                        addLight({
                            key: `${x},${y}:${kind}:NE`,
                            corner: 'NE',
                            px: center.x + poleSideOffsetWorld,
                            pz: center.z - tileHalf - postOffset,
                            yaw: 0
                        });
                    }
                    if (conn & DIR.S) {
                        addLight({
                            key: `${x},${y}:${kind}:SW`,
                            corner: 'SW',
                            px: center.x - poleSideOffsetWorld,
                            pz: center.z + tileHalf + postOffset,
                            yaw: Math.PI
                        });
                    }
                }
                continue;
            }

            const conn = map.conn[idx] ?? 0;
            const stopSlots = [];
            if (conn & DIR.N) stopSlots.push({ approach: 'N', corner: 'NW', rotationY: Math.PI });
            if (conn & DIR.S) stopSlots.push({ approach: 'S', corner: 'SE', rotationY: 0 });
            if (conn & DIR.E) stopSlots.push({ approach: 'E', corner: 'NE', rotationY: Math.PI * 0.5 });
            if (conn & DIR.W) stopSlots.push({ approach: 'W', corner: 'SW', rotationY: -Math.PI * 0.5 });

            for (const slot of stopSlots) {
                const key = `${x},${y}:${kind}:${slot.approach}`;
                if (added.has(key)) continue;
                const p = corners[slot.corner];
                if (!withinBounds(bounds, p.x, p.z)) continue;

                const scale = 1.1;
                const baseY = sidewalkY + 1.2 * scale;

                placements.push({
                    kind,
                    tile: { x, y },
                    approach: slot.approach,
                    corner: slot.corner,
                    position: { x: p.x, y: baseY, z: p.z },
                    rotationY: slot.rotationY,
                    scale
                });
                added.add(key);
            }
        }
    }

    return placements;
}
