// src/physics/CurbCollisionDetector.js
import * as THREE from 'three';
import { ROAD_DEFAULTS, GROUND_DEFAULTS } from '../../graphics/assets3d/generators/GeneratorParams.js';

export const SURFACE = {
    UNKNOWN: 0,
    ASPHALT: 1,
    CURB: 2,
    GRASS: 3,
};

const WHEELS = ['fl', 'fr', 'rl', 'rr'];

const TILE_ROAD = 1;
const AXIS_NONE = 0;
const AXIS_EW = 1;
const AXIS_NS = 2;
const AXIS_INTERSECTION = 3;

export class CurbCollisionDetector {
    constructor(city, opts = {}) {
        this.city = city;
        this.map = city?.map ?? null;

        const generatorConfig = city?.generatorConfig ?? null;
        const legacyConfig = city?.genConfig ?? city?.cityConfig ?? city?.config ?? null;

        const roadCfg = generatorConfig?.road ?? legacyConfig?.road ?? ROAD_DEFAULTS;
        const groundCfg = generatorConfig?.ground ?? legacyConfig?.ground ?? GROUND_DEFAULTS;

        const roadY = roadCfg?.surfaceY ?? ROAD_DEFAULTS.surfaceY ?? 0.02;
        const curbHeight = roadCfg?.curb?.height ?? ROAD_DEFAULTS.curb.height ?? 0.17;

        this.roadY = roadY;
        this.groundY = groundCfg?.surfaceY ?? (roadY + curbHeight);

        this.curbThickness = roadCfg?.curb?.thickness ?? ROAD_DEFAULTS.curb.thickness ?? 0.25;
        this.laneWidth = roadCfg?.laneWidth ?? ROAD_DEFAULTS.laneWidth ?? 3.2;
        this.shoulder = roadCfg?.shoulder ?? ROAD_DEFAULTS.shoulder ?? 0.35;

        this.hysteresis = opts.hysteresis ?? 0.04;

        this.prevSurfaces = { fl: SURFACE.UNKNOWN, fr: SURFACE.UNKNOWN, rl: SURFACE.UNKNOWN, rr: SURFACE.UNKNOWN };
        this.surfaces = { fl: SURFACE.UNKNOWN, fr: SURFACE.UNKNOWN, rl: SURFACE.UNKNOWN, rr: SURFACE.UNKNOWN };
        this.heights = { fl: this.roadY, fr: this.roadY, rl: this.roadY, rr: this.roadY };
        this.transitions = [];

        this._tmp = new THREE.Vector3();
    }

    update(busApi, worldRoot) {
        if (!this.map || !busApi?.wheelRig || !worldRoot) return;

        this.transitions.length = 0;
        this.prevSurfaces = { ...this.surfaces };

        worldRoot.updateMatrixWorld(true);

        const pivots = this._getWheelPivots(busApi.wheelRig);

        for (const k of WHEELS) {
            const pivot = pivots[k];
            if (!pivot?.getWorldPosition) continue;

            pivot.getWorldPosition(this._tmp);
            const x = this._tmp.x;
            const z = this._tmp.z;

            const prev = this.prevSurfaces[k];
            const surface = this._detectSurface(x, z, prev);
            const h = this._heightForSurface(surface);

            this.surfaces[k] = surface;
            this.heights[k] = h;

            if (prev !== SURFACE.UNKNOWN && prev !== surface) {
                const dh = h - this._heightForSurface(prev);
                if (Math.abs(dh) > 1e-6) {
                    this.transitions.push({ wheel: k, from: prev, to: surface, height: dh });
                }
            }
        }
    }

    getWheelSurfaces() { return this.surfaces; }
    getWheelHeights() { return this.heights; }
    getTransitions() { return this.transitions; }

    _heightForSurface(surface) {
        if (surface === SURFACE.ASPHALT) return this.roadY;
        if (surface === SURFACE.CURB || surface === SURFACE.GRASS) return this.groundY;
        return this.roadY;
    }

    _getWheelPivots(wheelRig) {
        const front = Array.isArray(wheelRig.front) ? [...wheelRig.front] : [];
        const rear = Array.isArray(wheelRig.rear) ? [...wheelRig.rear] : [];

        const xOf = (w) =>
            w?.root?.position?.x ??
            w?.steerPivot?.position?.x ??
            w?.rollPivot?.position?.x ??
            0;

        front.sort((a, b) => xOf(a) - xOf(b));
        rear.sort((a, b) => xOf(a) - xOf(b));

        const fl = front[0] ?? null;
        const fr = front[1] ?? null;
        const rl = rear[0] ?? null;
        const rr = rear[1] ?? null;

        const pickPivot = (w) => w?.rollPivot ?? w?.steerPivot ?? w?.root ?? null;

        return {
            fl: pickPivot(fl),
            fr: pickPivot(fr),
            rl: pickPivot(rl),
            rr: pickPivot(rr),
        };
    }

    _detectSurface(worldX, worldZ, prevSurface) {
        const tile = this.map.worldToTile?.(worldX, worldZ);
        if (!tile) return SURFACE.UNKNOWN;

        if (!this.map.inBounds?.(tile.x, tile.y)) return SURFACE.GRASS;

        const idx = this.map.index?.(tile.x, tile.y);
        if (!Number.isFinite(idx)) return SURFACE.UNKNOWN;

        const kind = this.map.kind?.[idx];
        if (kind !== TILE_ROAD) return SURFACE.GRASS;

        const axis = this.map.axis?.[idx] ?? AXIS_NONE;
        const center = this.map.tileToWorldCenter?.(tile.x, tile.y);
        if (!center) return SURFACE.ASPHALT;

        const lanes = this.map.getLanesAtIndex?.(idx) ?? { n: 1, e: 1, s: 1, w: 1 };
        const lanesNS = (lanes.n ?? 0) + (lanes.s ?? 0);
        const lanesEW = (lanes.e ?? 0) + (lanes.w ?? 0);

        const widthNS = this.laneWidth * Math.max(1, lanesNS) + 2 * this.shoulder;
        const widthEW = this.laneWidth * Math.max(1, lanesEW) + 2 * this.shoulder;

        const dx = Math.abs(worldX - center.x);
        const dz = Math.abs(worldZ - center.z);

        let distOut = 0;

        if (axis === AXIS_EW) {
            distOut = dz - widthEW * 0.5;
        } else if (axis === AXIS_NS) {
            distOut = dx - widthNS * 0.5;
        } else if (axis === AXIS_INTERSECTION) {
            const outX = dx - widthNS * 0.5;
            const outZ = dz - widthEW * 0.5;
            distOut = Math.max(outX, outZ);
        } else {
            return SURFACE.ASPHALT;
        }

        const h = this.hysteresis;

        if (distOut <= -h) return SURFACE.ASPHALT;
        if (distOut >= this.curbThickness + h) return SURFACE.GRASS;

        if (distOut < +h) return (prevSurface === SURFACE.ASPHALT) ? SURFACE.ASPHALT : SURFACE.CURB;
        if (distOut <= this.curbThickness - h) return SURFACE.CURB;

        return (prevSurface === SURFACE.GRASS) ? SURFACE.GRASS : SURFACE.CURB;
    }
}
