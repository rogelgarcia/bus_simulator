// graphics/assets3d/generators/internal_road/RoadMath.js
export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function bitCount4(m) {
    m = m & 0x0f;
    m = (m & 0x05) + ((m >> 1) & 0x05);
    m = (m & 0x03) + ((m >> 2) & 0x03);
    return m;
}

function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, over) {
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

export function wrapAngle(a) {
    const twoPi = Math.PI * 2;
    a = a % twoPi;
    if (a < 0) a += twoPi;
    return a;
}

export function turnStartAngle(signX, signZ) {
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

export function intersectionCornerStartAngle(signX, signZ) {
    return wrapAngle(cornerStartAngle(signX, signZ) + Math.PI);
}

export function connToCornerSigns(connMask, DIR) {
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

export function orientFromSigns(signX, signZ) {
    if (signX === 1 && signZ === 1) return 'NE';
    if (signX === -1 && signZ === 1) return 'NW';
    if (signX === 1 && signZ === -1) return 'SE';
    return 'SW';
}

export function classifyJunctionType(degree) {
    if (degree === 4) return 'cross';
    if (degree === 3) return 't';
    if (degree === 2) return 'junction2';
    return 'junction1';
}

export function pushToMap(mapObj, key, geom) {
    const arr = mapObj.get(key);
    if (arr) arr.push(geom);
    else mapObj.set(key, [geom]);
}
