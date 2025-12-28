// graphics/assets3d/generators/GeneratorParams.js
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

function hashColor(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const r = 80 + (h & 0x7f);
    const g = 80 + ((h >> 8) & 0x7f);
    const b = 80 + ((h >> 16) & 0x7f);
    return (r << 16) | (g << 8) | b;
}

function makeKey(type, orient) {
    return `${type}|${orient}`;
}

function parseKey(key) {
    const s = String(key ?? '');
    const i = s.indexOf('|');
    if (i < 0) return { type: 'all', orient: 'all' };
    return { type: s.slice(0, i) || 'all', orient: s.slice(i + 1) || 'all' };
}

const DEBUG_COLORS = {
    asphalt: {
        straight: { EW: 0xff6b6b, NS: 0x34c759 },
        turn: { NE: 0x0a84ff, NW: 0xffd60a, SE: 0xbf5af2, SW: 0xff9f0a },
        cross: { all: 0x64d2ff },
        t: { all: 0xff375f },
        junction2: { all: 0xd0fd3e },
        junction1: { all: 0xac8e68 }
    },
    curb: {
        cross: { NE: 0xff3b30, NW: 0x34c759, SE: 0x0a84ff, SW: 0xffd60a },
        t: { NE: 0xbf5af2, NW: 0xff9f0a, SE: 0x64d2ff, SW: 0xff2d55 },
        junction2: { NE: 0xd0fd3e, NW: 0x5e5ce6, SE: 0x30d158, SW: 0xff453a },
        junction1: { NE: 0xac8e68, NW: 0x8e8e93, SE: 0x1c1c1e, SW: 0xa2845e },
        turn_outer: { NE: 0xff375f, NW: 0x32d74b, SE: 0x5ac8fa, SW: 0xffcc00 },
        turn_inner: { NE: 0xaf52de, NW: 0xff9500, SE: 0x40c8e0, SW: 0xff6482 }
    },
    sidewalk: {
        cross: { NE: 0xff6b60, NW: 0x6cf07a, SE: 0x5aa8ff, SW: 0xffe36a },
        t: { NE: 0xd9a6ff, NW: 0xffc266, SE: 0x9be7ff, SW: 0xff9fb3 },
        junction2: { NE: 0xe7ff7a, NW: 0xa7a7ff, SE: 0x77f0a1, SW: 0xff9a90 },
        junction1: { NE: 0xd0c4b6, NW: 0xc7c7cc, SE: 0x3a3a3c, SW: 0xd2b48c },
        turn_outer: { NE: 0xff9bb2, NW: 0x9cf6ae, SE: 0x9ed6ff, SW: 0xfff0a6 },
        turn_pad: { NE: 0xffb3c2, NW: 0xb6f8c7, SE: 0xb6deff, SW: 0xfff7c2 }
    }
};

function createCornerPalette(kind) {
    const materialCache = new WeakMap();

    const getCache = (baseMat) => {
        let m = materialCache.get(baseMat);
        if (!m) {
            m = new Map();
            materialCache.set(baseMat, m);
        }
        return m;
    };

    const regular = {
        kind: 'regular',
        key(type, orient) {
            return makeKey('all', 'all');
        },
        parseKey(key) {
            return parseKey(key);
        },
        instanceColor(part, type, orient) {
            return 0xffffff;
        },
        instancedMaterial(baseMat, part) {
            return baseMat;
        },
        curvedMaterial(baseMat, part, type, orient) {
            return baseMat;
        },
        meshName(part, type, orient) {
            if (part === 'curb') return 'CurbCurves';
            if (part === 'sidewalk') return 'SidewalkCurves';
            return `${part}_Curves`;
        }
    };

    const debug = {
        kind: 'debug',
        key(type, orient) {
            return makeKey(type ?? 'unknown', orient ?? 'unknown');
        },
        parseKey(key) {
            return parseKey(key);
        },
        instanceColor(part, type, orient) {
            if (!type || !orient) return 0xffffff;
            const c = DEBUG_COLORS?.[part]?.[type]?.[orient];
            if (Number.isFinite(c)) return c;
            return hashColor(`${part}:${type}:${orient}`);
        },
        instancedMaterial(baseMat, part) {
            const cache = getCache(baseMat);
            const k = `inst:${part}`;
            if (cache.has(k)) return cache.get(k);

            const m = baseMat.clone();
            m.vertexColors = true;
            if (m.color) m.color.setHex(0xffffff);
            if ('map' in m) m.map = null;

            cache.set(k, m);
            return m;
        },
        curvedMaterial(baseMat, part, type, orient) {
            const cache = getCache(baseMat);
            const k = `cur:${part}:${type}:${orient}`;
            if (cache.has(k)) return cache.get(k);

            const m = baseMat.clone();
            if ('map' in m) m.map = null;
            if (m.color) m.color.setHex(this.instanceColor(part, type, orient));

            cache.set(k, m);
            return m;
        },
        meshName(part, type, orient) {
            if (part === 'curb') return `CurbCorner_${type}_${orient}`;
            if (part === 'sidewalk') return `SidewalkCorner_${type}_${orient}`;
            return `${part}_${type}_${orient}`;
        }
    };

    return (kind === 'debug') ? debug : regular;
}

function createAsphaltPalette(kind) {
    const pick = (type, orient) => {
        if (!type || !orient) return undefined;
        const row = DEBUG_COLORS?.asphalt?.[type];
        if (!row) return undefined;
        if (Number.isFinite(row[orient])) return row[orient];
        if (Number.isFinite(row.all)) return row.all;
        return undefined;
    };

    const regular = {
        kind: 'regular',
        key(type, orient) {
            return makeKey('all', 'all');
        },
        parseKey(key) {
            return parseKey(key);
        },
        instanceColor(part, type, orient) {
            return 0xffffff;
        },
        instancedMaterial(baseMat, part) {
            return baseMat;
        },
        curvedMaterial(baseMat, part, type, orient) {
            return baseMat;
        },
        meshName(part, type, orient) {
            return 'AsphaltCurves';
        }
    };

    const debug = {
        kind: 'debug',
        key(type, orient) {
            return makeKey(type ?? 'unknown', orient ?? 'unknown');
        },
        parseKey(key) {
            return parseKey(key);
        },
        instanceColor(part, type, orient) {
            const c = pick(type, orient);
            if (Number.isFinite(c)) return c;
            return hashColor(`asphalt:${type}:${orient}`);
        },
        instancedMaterial(baseMat, part) {
            return baseMat;
        },
        curvedMaterial(baseMat, part, type, orient) {
            return baseMat;
        },
        meshName(part, type, orient) {
            return `Asphalt_${type}_${orient}`;
        }
    };

    return (kind === 'debug') ? debug : regular;
}

export const DEBUG_CORNERS = false;
export const DEBUG_ASPHALT = true;
export const DEBUG_HIDE_SIDEWALKS = true;
export const DEBUG_HIDE_CURBS = false;
export const DEBUG_DISABLE_MARKINGS_IN_ASPHALT_DEBUG = false;

export const CORNER_COLOR_PALETTE_KIND = DEBUG_CORNERS ? 'debug' : 'regular';
export const CORNER_COLOR_PALETTE = createCornerPalette(CORNER_COLOR_PALETTE_KIND);
export const CURB_COLOR_PALETTE = createCornerPalette(CORNER_COLOR_PALETTE_KIND);

export const ASPHALT_COLOR_PALETTE_KIND = DEBUG_ASPHALT ? 'debug' : 'regular';
export const ASPHALT_COLOR_PALETTE = createAsphaltPalette(ASPHALT_COLOR_PALETTE_KIND);

const ROAD_SCALE = 1.5;

export const ROAD_DEFAULTS = {
    surfaceY: 0.02,
    laneWidth: 3.2 * ROAD_SCALE,
    shoulder: 0.35 * ROAD_SCALE,
    sidewalk: {
        extraWidth: 1.25 * ROAD_SCALE,
        cornerRadius: 1.8 * ROAD_SCALE,
        lift: 0.001,
        inset: 0.06 * ROAD_SCALE
    },
    curves: {
        turnRadius: 6.8 * ROAD_SCALE,
        asphaltArcSegments: 40,
        curbArcSegments: 24
    },
    markings: {
        lineWidth: 0.12 * ROAD_SCALE,
        edgeInset: 0.22 * ROAD_SCALE,
        lift: 0.003
    },
    curb: {
        thickness: 0.32 * ROAD_SCALE,
        height: 0.17,
        extraHeight: 0.0,
        sink: 0.03,
        joinOverlap: 0.24 * ROAD_SCALE
    }
};

export const GROUND_DEFAULTS = {
    surfaceY: ROAD_DEFAULTS.surfaceY + ROAD_DEFAULTS.curb.height
};

export function createGeneratorConfig(overrides = {}) {
    const base = { road: ROAD_DEFAULTS, ground: GROUND_DEFAULTS };
    return deepMerge(base, overrides);
}
