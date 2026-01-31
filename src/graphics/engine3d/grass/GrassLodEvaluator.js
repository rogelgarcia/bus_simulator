// src/graphics/engine3d/grass/GrassLodEvaluator.js
// Pure LOD evaluation utilities (no renderer dependencies).
// @ts-check

export const GRASS_LOD_TIERS = /** @type {const} */ (['master', 'near', 'mid', 'far']);

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function smoothstep(edge0, edge1, x) {
    const a = Number(edge0);
    const b = Number(edge1);
    if (!(Number.isFinite(a) && Number.isFinite(b))) return 0;
    const t = clamp((Number(x) - a) / (b - a), 0, 1, 0);
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function resolveAllowedTier(tier, allowedLods) {
    if (!allowedLods || typeof allowedLods !== 'object') return tier;
    if (allowedLods[tier]) return tier;

    const allowed = [];
    for (const t of GRASS_LOD_TIERS) if (allowedLods[t]) allowed.push(t);
    if (!allowed.length) return null;

    const idxOf = (t) => GRASS_LOD_TIERS.indexOf(t);
    const src = idxOf(tier);
    if (src < 0) return allowed[allowed.length - 1] ?? null;

    let best = allowed[0];
    let bestDist = Infinity;
    let bestIdx = idxOf(best);
    for (const cand of allowed) {
        const idx = idxOf(cand);
        const dist = Math.abs(idx - src);
        if (dist < bestDist || (dist === bestDist && idx > bestIdx)) {
            best = cand;
            bestDist = dist;
            bestIdx = idx;
        }
    }
    return best;
}

/**
 * @typedef {Object} GrassLodConfig
 * @property {boolean} enableMaster
 * @property {'auto'|'master'|'near'|'mid'|'far'|'none'} force
 * @property {{master:number, near:number, mid:number, far:number, cutoff:number}} distances
 * @property {number} transitionWidthMeters
 * @property {{grazingDeg:number, topDownDeg:number, grazingDistanceScale:number, topDownDistanceScale:number, masterMaxDeg:number}} angle
 */

/**
 * @typedef {Object} GrassLodEval
 * @property {number} effectiveDistance
 * @property {number} viewAngleDeg
 * @property {{master:number, near:number, mid:number, far:number}} weights
 * @property {'master'|'near'|'mid'|'far'|'none'} activeTier
 */

/**
 * @param {Object} args
 * @param {number} args.distance
 * @param {number} args.viewAngleDeg
 * @param {GrassLodConfig} args.lod
 * @param {Record<string, boolean>|null} [args.allowedLods]
 * @returns {GrassLodEval}
 */
export function evaluateGrassLod({ distance, viewAngleDeg, lod, allowedLods = null }) {
    const dist = Math.max(0, Number(distance) || 0);
    const angle = clamp(viewAngleDeg, 0, 90, 0);
    const w = Math.max(0.001, Number(lod?.transitionWidthMeters) || 0.001);

    const grazingDeg = clamp(lod?.angle?.grazingDeg, 0.0, 89.0, 12.0);
    const topDownDeg = clamp(lod?.angle?.topDownDeg, grazingDeg + 0.01, 90.0, 70.0);
    const angleT = clamp((angle - grazingDeg) / (topDownDeg - grazingDeg), 0, 1, 0);
    const scaleG = clamp(lod?.angle?.grazingDistanceScale, 0.1, 10.0, 0.75);
    const scaleT = clamp(lod?.angle?.topDownDistanceScale, 0.1, 10.0, 1.25);
    const angleScale = lerp(scaleG, scaleT, angleT);
    const effectiveDistance = dist * angleScale;

    /** @type {{master:number, near:number, mid:number, far:number}} */
    const base = { master: 0, near: 0, mid: 0, far: 0 };

    const nearEnd = Math.max(0, Number(lod?.distances?.near) || 0);
    const midEnd = Math.max(nearEnd, Number(lod?.distances?.mid) || nearEnd);
    const farEnd = Math.max(midEnd, Number(lod?.distances?.far) || midEnd);
    const cutoff = Math.max(farEnd, Number(lod?.distances?.cutoff) || farEnd);

    const tNearMid = smoothstep(nearEnd - w, nearEnd + w, effectiveDistance);
    base.near = 1 - tNearMid;
    base.mid = tNearMid;

    const tMidFar = smoothstep(midEnd - w, midEnd + w, effectiveDistance);
    base.mid *= (1 - tMidFar);
    base.far = tMidFar;

    if (cutoff > farEnd) {
        const tFade = smoothstep(farEnd, cutoff, effectiveDistance);
        base.far *= (1 - tFade);
    } else if (effectiveDistance > cutoff) {
        base.far = 0;
    }

    const enableMaster = lod?.enableMaster !== false;
    const masterMaxDeg = clamp(lod?.angle?.masterMaxDeg, 0.0, 89.0, 22.0);
    const masterDist = Math.max(0, Number(lod?.distances?.master) || 0);
    const masterActive = enableMaster && angle <= masterMaxDeg && masterDist > 0;
    if (masterActive) {
        const m = 1 - smoothstep(masterDist - w, masterDist + w, effectiveDistance);
        const masterWeight = clamp(m, 0, 1, 0);
        base.master = masterWeight;
        const scale = 1 - masterWeight;
        base.near *= scale;
        base.mid *= scale;
        base.far *= scale;
    }

    const forced = String(lod?.force ?? 'auto');
    if (forced === 'none') {
        base.master = 0;
        base.near = 0;
        base.mid = 0;
        base.far = 0;
    } else if (forced === 'master' || forced === 'near' || forced === 'mid' || forced === 'far') {
        base.master = forced === 'master' ? 1 : 0;
        base.near = forced === 'near' ? 1 : 0;
        base.mid = forced === 'mid' ? 1 : 0;
        base.far = forced === 'far' ? 1 : 0;
    }

    /** @type {{master:number, near:number, mid:number, far:number}} */
    const weights = { master: 0, near: 0, mid: 0, far: 0 };
    for (const tier of GRASS_LOD_TIERS) {
        const src = base[tier];
        if (!(src > 0)) continue;
        const mapped = resolveAllowedTier(tier, allowedLods);
        if (!mapped) continue;
        weights[mapped] += src;
    }

    const activeTier = (() => {
        let best = /** @type {'master'|'near'|'mid'|'far'|'none'} */ ('none');
        let bestW = 0;
        for (const tier of GRASS_LOD_TIERS) {
            const v = weights[tier];
            if (v > bestW) {
                bestW = v;
                best = /** @type {any} */ (tier);
            }
        }
        return bestW > 0 ? best : 'none';
    })();

    return { effectiveDistance, viewAngleDeg: angle, weights, activeTier };
}

