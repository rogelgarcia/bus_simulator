// src/graphics/assets3d/generators/building_fabrication/FacadeBaysSolver.js
// Simple deterministic bay repeater + width distribution solver for BF2 auth.
// @ts-check

const EPS = 1e-6;
const BAY_MIN_WIDTH_M = 0.1;
const MAX_EXPANDED_BAYS = 1200;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function centerOutOrder(count) {
    const n = clampInt(count, 0, 999999);
    if (n <= 0) return [];
    const out = [];
    if (n % 2 === 1) {
        const center = Math.floor(n / 2);
        out.push(center);
        for (let offset = 1; out.length < n; offset++) {
            const left = center - offset;
            const right = center + offset;
            if (left >= 0) out.push(left);
            if (right < n) out.push(right);
        }
        return out;
    }
    const leftCenter = n / 2 - 1;
    const rightCenter = n / 2;
    out.push(leftCenter, rightCenter);
    for (let offset = 1; out.length < n; offset++) {
        const left = leftCenter - offset;
        const right = rightCenter + offset;
        if (left >= 0) out.push(left);
        if (right < n) out.push(right);
    }
    return out;
}

function isMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    return (kind === 'texture' || kind === 'color') && !!id;
}

function normalizeMaterialSpec(value) {
    return isMaterialSpec(value) ? { kind: value.kind, id: value.id } : null;
}

function normalizeWallBase(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const tintRaw = src.tintHex ?? src.tint ?? src.albedoTint ?? src.albedoTintHex ?? 0xffffff;
    const tintHex = Number.isFinite(tintRaw) ? ((Number(tintRaw) >>> 0) & 0xffffff) : 0xffffff;
    const roughness = clamp(src.roughness ?? 0.85, 0.0, 1.0);
    const normalStrength = clamp(src.normalStrength ?? src.normal ?? 0.9, 0.0, 2.0);
    return { tintHex, roughness, normalStrength };
}

function normalizeTiling(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const enabled = !!src.enabled;
    const tileMeters = clamp(src.tileMeters ?? src.tileSizeMeters ?? 2.0, 0.1, 100.0);
    const tileMetersU = clamp(src.tileMetersU ?? src.tileSizeMetersU ?? tileMeters, 0.1, 100.0);
    const tileMetersV = clamp(src.tileMetersV ?? src.tileSizeMetersV ?? tileMeters, 0.01, 100.0);
    const uvEnabled = !!(src.uvEnabled ?? src.uvTransformEnabled ?? false);
    const offsetU = clamp(src.offsetU ?? src.uvOffsetU ?? 0.0, -10.0, 10.0);
    const offsetV = clamp(src.offsetV ?? src.uvOffsetV ?? 0.0, -10.0, 10.0);
    const rotationDegrees = clamp(src.rotationDegrees ?? src.uvRotationDegrees ?? 0.0, -180.0, 180.0);
    return { enabled, tileMeters, tileMetersU, tileMetersV, uvEnabled, offsetU, offsetV, rotationDegrees };
}

function deepClone(value) {
    if (Array.isArray(value)) return value.map((it) => deepClone(it));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

function normalizeMaterialVariation(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const seedOffset = clampInt(src.seedOffset ?? 0, -9999, 9999);
    return { ...deepClone(src), enabled: !!src.enabled, seedOffset };
}

function normalizeTextureFlow(value) {
    const typed = typeof value === 'string' ? value : '';
    if (typed === 'restart' || typed === 'repeats' || typed === 'overflow_left' || typed === 'overflow_right') return typed;
    return 'restart';
}

function normalizeExpandPreference(value) {
    const typed = typeof value === 'string' ? value : '';
    if (typed === 'no_repeat' || typed === 'prefer_repeat' || typed === 'prefer_expand') return typed;
    return null;
}

function normalizeGroupRepeatSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    const minRepeats = clampInt(src?.minRepeats ?? 1, 1, 9999);
    const maxRaw = src?.maxRepeats;
    if (maxRaw === 'auto' || maxRaw === null || maxRaw === undefined) return { minRepeats, maxRepeats: Infinity };
    return { minRepeats, maxRepeats: clampInt(maxRaw, minRepeats, 9999) };
}

function normalizeBayEdgeDepthSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const linked = (src.linked ?? true) !== false;
    const leftRaw = Number(src.left);
    const left = clamp(Number.isFinite(leftRaw) ? leftRaw : 0, -2.0, 2.0);
    const rightRaw = Number(src.right);
    const right = clamp(Number.isFinite(rightRaw) ? rightRaw : (linked ? left : 0), -2.0, 2.0);
    if (Math.abs(left) < 1e-6 && Math.abs(right) < 1e-6) return null;
    return { left, right };
}

/**
 * @typedef {Object} BaySizeFixed
 * @property {'fixed'} mode
 * @property {number} widthMeters
 *
 * @typedef {Object} BaySizeRange
 * @property {'range'} mode
 * @property {number} minMeters
 * @property {number | null} [maxMeters]
 *
 * @typedef {Object} FacadeBaySpec
 * @property {string} id
 * @property {BaySizeFixed | BaySizeRange} size
 * @property {'no_repeat'|'prefer_repeat'|'prefer_expand'} [expandPreference]
 * @property {boolean} [repeatable]
 * @property {string | null} [linkFromBayId]
 * @property {string | null} [materialLinkFromBayId]
 * @property {{left:number, right:number, linked?: boolean} | null} [depth]
 * @property {{kind:'texture'|'color', id:string} | null} [wallMaterialOverride]
 * @property {{tintHex:number, roughness:number, normalStrength:number} | null} [wallBase]
 * @property {{enabled:boolean, tileMeters:number, tileMetersU:number, tileMetersV:number, uvEnabled:boolean, offsetU:number, offsetV:number, rotationDegrees:number} | null} [tiling]
 * @property {object | null} [materialVariation]
 * @property {'restart'|'repeats'|'overflow_left'|'overflow_right'} [textureFlow]
 *
 * @typedef {Object} FacadeBayGroupSpec
 * @property {string} id
 * @property {string[]} bayIds
 * @property {{minRepeats?: number, maxRepeats?: number|'auto'} | null} [repeat]
 *
 * @typedef {Object} FacadeResolvedLayoutItem
 * @property {'bay'} type
 * @property {string} id
 * @property {string} sourceBayId
 * @property {'restart'|'repeats'|'overflow_left'|'overflow_right'} textureFlow
 * @property {number} widthFrac
 * @property {number} minWidthMeters
 * @property {number | null} [maxWidthMeters]
 * @property {{left:number, right:number} | null} [depth]
 * @property {{kind:'texture'|'color', id:string} | null} [wallMaterialOverride]
 * @property {{tintHex:number, roughness:number, normalStrength:number} | null} [wallBase]
 * @property {{enabled:boolean, tileMeters:number, tileMetersU:number, tileMetersV:number, uvEnabled:boolean, offsetU:number, offsetV:number, rotationDegrees:number} | null} [tiling]
 * @property {object | null} [materialVariation]
 */

function normalizeFracs(fracs) {
    const list = Array.isArray(fracs) ? fracs : [];
    let sum = 0;
    for (const f of list) sum += Number(f) || 0;
    if (!(sum > EPS)) return list.map(() => 1 / Math.max(1, list.length));
    return list.map((f) => (Number(f) || 0) / sum);
}

/**
 * @param {object} options
 * @param {FacadeBaySpec[]} options.bays
 * @param {FacadeBayGroupSpec[] | null} [options.groups]
 * @param {number} options.faceLengthMeters
 * @param {string[] | null} [options.warnings]
 * @returns {FacadeResolvedLayoutItem[]}
 */
export function solveFacadeBaysLayout({ bays, groups = null, faceLengthMeters, warnings = null } = {}) {
    const w = Array.isArray(warnings) ? warnings : null;
    const src = Array.isArray(bays) ? bays : [];
    const groupSrc = Array.isArray(groups) ? groups : [];
    const L = Number(faceLengthMeters) || 0;

    const normalizedBase = [];
    for (const entry of src) {
        const id = typeof entry?.id === 'string' ? entry.id : '';
        if (!id) continue;
        const size = entry?.size && typeof entry.size === 'object' ? entry.size : null;
        const mode = size?.mode === 'fixed' ? 'fixed' : 'range';

        let minWidth = BAY_MIN_WIDTH_M;
        let maxWidth = Infinity;
        if (mode === 'fixed') {
            const width = clamp(size?.widthMeters ?? 1.0, BAY_MIN_WIDTH_M, 9999);
            minWidth = width;
            maxWidth = width;
        } else {
            minWidth = clamp(size?.minMeters ?? BAY_MIN_WIDTH_M, BAY_MIN_WIDTH_M, 9999);
            const maxRaw = size?.maxMeters;
            if (maxRaw === null || maxRaw === undefined) {
                maxWidth = Infinity;
            } else {
                maxWidth = clamp(maxRaw, minWidth, 9999);
            }
        }

        let expandPreference = normalizeExpandPreference(entry?.expandPreference ?? null);
        if (!expandPreference) {
            if (entry?.repeatable !== undefined) {
                expandPreference = entry.repeatable ? 'prefer_repeat' : 'no_repeat';
            } else {
                expandPreference = 'prefer_expand';
                if (w) w.push(`Facade bays: bay "${id}" missing expandPreference (defaulting to Prefer Expand).`);
            }
        }

        normalizedBase.push({
            id,
            expandPreference,
            linkFromBayId: (typeof entry?.linkFromBayId === 'string' && entry.linkFromBayId)
                ? entry.linkFromBayId
                : ((typeof entry?.materialLinkFromBayId === 'string' && entry.materialLinkFromBayId) ? entry.materialLinkFromBayId : null),
            minWidth,
            maxWidth,
            depth: normalizeBayEdgeDepthSpec(entry?.depth ?? null),
            wallMaterialOverride: normalizeMaterialSpec(entry?.wallMaterialOverride ?? null),
            wallBase: normalizeWallBase(entry?.wallBase ?? null),
            tiling: normalizeTiling(entry?.tiling ?? null),
            materialVariation: normalizeMaterialVariation(entry?.materialVariation ?? null),
            textureFlow: normalizeTextureFlow(entry?.textureFlow ?? null)
        });
    }

    if (!normalizedBase.length) return [];

    const baseById = new Map(normalizedBase.map((it) => [it.id, it]));
    const resolveBaySource = (bayId) => {
        const startId = typeof bayId === 'string' ? bayId : '';
        if (!startId) return null;
        const visited = new Set();
        let curId = startId;
        for (let i = 0; i < 32; i++) {
            if (visited.has(curId)) break;
            visited.add(curId);
            const cur = baseById.get(curId) ?? null;
            if (!cur) break;
            const nextId = typeof cur.linkFromBayId === 'string' && cur.linkFromBayId ? cur.linkFromBayId : null;
            if (!nextId) return cur;
            if (nextId === curId) {
                if (w) w.push(`Facade bays: bay "${curId}" linkFromBayId points to itself (ignoring link).`);
                return cur;
            }
            const next = baseById.get(nextId) ?? null;
            if (!next) {
                if (w) w.push(`Facade bays: bay "${curId}" linkFromBayId "${nextId}" not found (ignoring link).`);
                return cur;
            }
            curId = nextId;
        }
        if (w) w.push(`Facade bays: bay "${startId}" linkFromBayId chain has a cycle or is too deep (ignoring link).`);
        return baseById.get(startId) ?? null;
    };

    const effectiveByIndex = normalizedBase.map((base) => resolveBaySource(base.id) ?? base);

    const bayIndexById = new Map(normalizedBase.map((b, idx) => [b.id, idx]));

    const groupCandidates = [];
    for (const entry of groupSrc) {
        const groupId = typeof entry?.id === 'string' ? entry.id : '';
        if (!groupId) {
            if (w) w.push('Facade bays: group is missing an id.');
            continue;
        }
        const ids = Array.isArray(entry?.bayIds) ? entry.bayIds : [];
        const uniqIds = new Set();
        const indices = [];
        for (const bidRaw of ids) {
            const bid = typeof bidRaw === 'string' ? bidRaw : '';
            if (!bid) continue;
            if (uniqIds.has(bid)) continue;
            uniqIds.add(bid);
            const idx = bayIndexById.get(bid);
            if (!Number.isInteger(idx)) {
                if (w) w.push(`Facade bays: group "${groupId}" references unknown bay "${bid}" (ignoring group).`);
                indices.length = 0;
                break;
            }
            indices.push(idx);
        }

        if (indices.length < 2) continue;
        indices.sort((a, b) => a - b);

        let contiguous = true;
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1) {
                contiguous = false;
                break;
            }
        }
        if (!contiguous) {
            if (w) w.push(`Facade bays: group "${groupId}" bayIds must be contiguous (ignoring group).`);
            continue;
        }

        const repeat = normalizeGroupRepeatSpec(entry?.repeat ?? null);
        const minWidthSum = indices.reduce((sum, idx) => sum + (effectiveByIndex[idx]?.minWidth ?? BAY_MIN_WIDTH_M), 0);
        groupCandidates.push({
            id: groupId,
            startIndex: indices[0],
            indices,
            minWidthSum,
            minRepeats: repeat.minRepeats,
            maxRepeats: repeat.maxRepeats
        });
    }

    groupCandidates.sort((a, b) => {
        const diff = a.startIndex - b.startIndex;
        if (diff) return diff;
        return String(a.id).localeCompare(String(b.id));
    });

    const claimedByGroup = new Array(normalizedBase.length).fill(false);
    const groupsByStartIndex = new Map();
    const normalizedGroups = [];
    for (const group of groupCandidates) {
        let overlaps = false;
        for (const idx of group.indices) {
            if (claimedByGroup[idx]) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) {
            if (w) w.push(`Facade bays: group "${group.id}" overlaps another group (ignoring group).`);
            continue;
        }

        for (const idx of group.indices) claimedByGroup[idx] = true;
        group.repeatCount = clampInt(group.minRepeats, 1, 9999);
        groupsByStartIndex.set(group.startIndex, group);
        normalizedGroups.push(group);
    }

    let totalMin = effectiveByIndex.reduce((sum, b) => sum + (b?.minWidth ?? BAY_MIN_WIDTH_M), 0);
    let expandedCount = normalizedBase.length;

    if (L > EPS) {
        for (const group of groupsByStartIndex.values()) {
            const minRepeats = clampInt(group.minRepeats, 1, 9999);
            if (minRepeats <= 1) continue;
            const extraRepeats = minRepeats - 1;
            const extraCount = group.indices.length * extraRepeats;
            const extraMin = group.minWidthSum * extraRepeats;
            if (expandedCount + extraCount > MAX_EXPANDED_BAYS || totalMin + extraMin > L + 1e-6) {
                if (w) w.push(`Facade bays: group "${group.id}" minRepeats does not fit (clamping to 1).`);
                group.minRepeats = 1;
                continue;
            }
            expandedCount += extraCount;
            totalMin += extraMin;
        }
    }

    for (const group of groupsByStartIndex.values()) group.repeatCount = group.minRepeats;

    const groupOrder = centerOutOrder(normalizedGroups.length);
    if (groupOrder.length && L > EPS) {
        for (let guard = 0; guard < 5000; guard++) {
            let changed = false;
            for (const orderIdx of groupOrder) {
                const group = normalizedGroups[orderIdx] ?? null;
                if (!group) continue;
                const repeatCount = clampInt(group.repeatCount ?? 1, 1, 9999);
                const max = Number.isFinite(group.maxRepeats) ? group.maxRepeats : Infinity;
                if (repeatCount >= max) continue;
                if (expandedCount + group.indices.length > MAX_EXPANDED_BAYS) continue;
                if (totalMin + group.minWidthSum > L + 1e-6) continue;
                group.repeatCount = repeatCount + 1;
                totalMin += group.minWidthSum;
                expandedCount += group.indices.length;
                changed = true;
            }
            if (!changed) break;
        }
    }

    const bayRepeats = new Array(normalizedBase.length).fill(1);
    const repeatableUngroupedIndices = effectiveByIndex
        .map((b, idx) => ({ idx, pref: b?.expandPreference ?? null }))
        .filter((b) => b.pref === 'prefer_repeat' && !claimedByGroup[b.idx])
        .map((b) => b.idx);

    if (repeatableUngroupedIndices.length && L > EPS) {
        const passMin = repeatableUngroupedIndices.reduce((sum, idx) => sum + (effectiveByIndex[idx]?.minWidth ?? BAY_MIN_WIDTH_M), 0);
        for (let guard = 0; guard < 5000; guard++) {
            if (!(passMin > EPS)) break;
            if (expandedCount + repeatableUngroupedIndices.length > MAX_EXPANDED_BAYS) break;
            if (totalMin + passMin > L + 1e-6) break;
            for (const idx of repeatableUngroupedIndices) {
                bayRepeats[idx] += 1;
                totalMin += effectiveByIndex[idx]?.minWidth ?? BAY_MIN_WIDTH_M;
                expandedCount += 1;
            }
        }
    }

    const expandedRefs = [];
    for (let i = 0; i < normalizedBase.length; i++) {
        const group = groupsByStartIndex.get(i) ?? null;
        if (group) {
            const count = clampInt(group.repeatCount ?? 1, 1, 9999);
            for (let gi = 0; gi < count; gi++) {
                for (const bayIndex of group.indices) expandedRefs.push(bayIndex);
            }
            i += group.indices.length - 1;
            continue;
        }
        const count = clampInt(bayRepeats[i] ?? 1, 1, 9999);
        for (let ri = 0; ri < count; ri++) expandedRefs.push(i);
    }

    const totalCountByBayId = new Map();
    for (const idx of expandedRefs) {
        const base = normalizedBase[idx] ?? null;
        const bid = typeof base?.id === 'string' ? base.id : '';
        if (!bid) continue;
        totalCountByBayId.set(bid, (totalCountByBayId.get(bid) ?? 0) + 1);
    }

    const nextInstanceByBayId = new Map();
    const expanded = [];
    for (const idx of expandedRefs) {
        const base = normalizedBase[idx] ?? null;
        if (!base) continue;
        const source = effectiveByIndex[idx] ?? base;
        const totalCount = totalCountByBayId.get(base.id) ?? 1;
        const next = (nextInstanceByBayId.get(base.id) ?? 0) + 1;
        nextInstanceByBayId.set(base.id, next);
        const id = totalCount > 1 ? `${base.id}_${next}` : base.id;

        expanded.push({
            type: 'bay',
            id,
            sourceBayId: base.id,
            expandPreference: source.expandPreference,
            textureFlow: source.textureFlow,
            minWidthMeters: source.minWidth,
            maxWidthMeters: Number.isFinite(source.maxWidth) ? source.maxWidth : null,
            maxWidth: source.maxWidth,
            depth: source.depth ? { left: source.depth.left, right: source.depth.right } : null,
            wallMaterialOverride: source.wallMaterialOverride,
            wallBase: source.wallBase,
            tiling: source.tiling,
            materialVariation: source.materialVariation
        });
    }

    const n = expanded.length;
    if (!(L > EPS) || n <= 0) {
        return expanded.map((it) => ({
            type: 'bay',
            id: it.id,
            sourceBayId: it.sourceBayId,
            textureFlow: normalizeTextureFlow(it.textureFlow),
            widthFrac: 1 / Math.max(1, n),
            minWidthMeters: it.minWidthMeters,
            maxWidthMeters: it.maxWidthMeters ?? null,
            ...(it.depth ? { depth: it.depth } : {}),
            ...(it.wallMaterialOverride ? { wallMaterialOverride: it.wallMaterialOverride } : {}),
            ...(it.wallBase ? { wallBase: it.wallBase } : {}),
            ...(it.tiling ? { tiling: it.tiling } : {}),
            ...(it.materialVariation ? { materialVariation: it.materialVariation } : {})
        }));
    }

    const widths = expanded.map((it) => it.minWidthMeters);
    const expandedMin = widths.reduce((sum, wm) => sum + (Number(wm) || 0), 0);
    if (expandedMin > L + 1e-6) {
        if (w) w.push(`Facade bays: min width ${expandedMin.toFixed(3)}m exceeds face length ${L.toFixed(3)}m (scaling down).`);
        const scale = L / expandedMin;
        const fracs = widths.map((mw) => (mw * scale) / L);
        const norm = normalizeFracs(fracs);
        return expanded.map((it, idx) => ({
            type: 'bay',
            id: it.id,
            sourceBayId: it.sourceBayId,
            textureFlow: normalizeTextureFlow(it.textureFlow),
            widthFrac: norm[idx] ?? (1 / Math.max(1, n)),
            minWidthMeters: it.minWidthMeters,
            maxWidthMeters: it.maxWidthMeters ?? null,
            ...(it.depth ? { depth: it.depth } : {}),
            ...(it.wallMaterialOverride ? { wallMaterialOverride: it.wallMaterialOverride } : {}),
            ...(it.wallBase ? { wallBase: it.wallBase } : {}),
            ...(it.tiling ? { tiling: it.tiling } : {}),
            ...(it.materialVariation ? { materialVariation: it.materialVariation } : {})
        }));
    }

    let leftover = L - expandedMin;
    let caps = expanded.map((it) => {
        const max = it.maxWidth;
        if (!Number.isFinite(max)) return Infinity;
        return Math.max(0, max - it.minWidthMeters);
    });

    const distributeLeftoverAcross = (indices) => {
        const allowed = Array.isArray(indices) ? indices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < n) : [];
        if (!allowed.length) return;
        const allowedSet = new Set(allowed);

        /** @type {number[]} */
        let growable = allowed.filter((idx) => caps[idx] > EPS);
        while (leftover > 1e-6 && growable.length) {
            const delta = leftover / growable.length;
            const nextGrowable = [];
            for (const idx of growable) {
                const cap = caps[idx];
                const take = Math.min(delta, cap);
                widths[idx] += take;
                leftover -= take;
                const remain = cap - take;
                caps[idx] = remain;
                if (remain > 1e-6) nextGrowable.push(idx);
            }
            growable = nextGrowable;
            if (delta <= 1e-12) break;
        }

        if (leftover > 1e-6) {
            const anyLeft = allowed.some((idx) => caps[idx] > EPS);
            if (anyLeft) {
                const order = centerOutOrder(n);
                for (const idx of order) {
                    if (!allowedSet.has(idx)) continue;
                    if (!(leftover > 1e-6)) break;
                    if (!(caps[idx] > EPS)) continue;
                    const take = Math.min(leftover, caps[idx]);
                    widths[idx] += take;
                    leftover -= take;
                    caps[idx] -= take;
                }
            }
        }
    };

    const preferExpandIndices = [];
    const noRepeatIndices = [];
    const preferRepeatIndices = [];
    for (let i = 0; i < expanded.length; i++) {
        const pref = expanded[i]?.expandPreference ?? null;
        if (pref === 'prefer_expand') preferExpandIndices.push(i);
        else if (pref === 'no_repeat') noRepeatIndices.push(i);
        else preferRepeatIndices.push(i);
    }

    distributeLeftoverAcross(preferExpandIndices);
    distributeLeftoverAcross(noRepeatIndices);
    distributeLeftoverAcross(preferRepeatIndices);

    if (leftover > 1e-3) {
        if (w) w.push(`Facade bays: leftover ${leftover.toFixed(3)}m could not be distributed within max widths.`);
        widths[widths.length - 1] += leftover;
    }

    const fracs = normalizeFracs(widths.map((wm) => wm / L));
    return expanded.map((it, idx) => ({
        type: 'bay',
        id: it.id,
        sourceBayId: it.sourceBayId,
        textureFlow: normalizeTextureFlow(it.textureFlow),
        widthFrac: fracs[idx] ?? (1 / Math.max(1, n)),
        minWidthMeters: it.minWidthMeters,
        maxWidthMeters: it.maxWidthMeters ?? null,
        ...(it.depth ? { depth: it.depth } : {}),
        ...(it.wallMaterialOverride ? { wallMaterialOverride: it.wallMaterialOverride } : {}),
        ...(it.wallBase ? { wallBase: it.wallBase } : {}),
        ...(it.tiling ? { tiling: it.tiling } : {}),
        ...(it.materialVariation ? { materialVariation: it.materialVariation } : {})
    }));
}
