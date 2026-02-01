// src/graphics/assets3d/generators/building_fabrication/FacadeLayoutFillSolver.js
// Deterministic facade layout "fill" solver with repeatable groups and center-out distribution.
// @ts-check

const EPS = 1e-6;

/**
 * @typedef {'bay'|'padding'} FacadeResolvedItemType
 */

/**
 * @typedef {Object} FacadeResolvedLayoutItem
 * @property {FacadeResolvedItemType} type
 * @property {string} id
 * @property {number} widthFrac
 * @property {number} minWidthMeters
 * @property {number | null} [maxWidthMeters]
 * @property {number} [marginLeft]
 * @property {number} [marginRight]
 * @property {any} [features]
 * @property {any} [wallMaterialOverride]
 * @property {number} [depthOffset]
 * @property {number} [wedgeAngleDeg]
 */

/**
 * @typedef {Object} FacadePatternRepeatRange
 * @property {number} min
 * @property {number} max
 */

/**
 * @typedef {Object} FacadePatternBayTemplate
 * @property {'bay'|'padding'} type
 * @property {string} templateId
 * @property {{minMeters:number, maxMeters:number}} width
 * @property {FacadePatternRepeatRange | null} [repeat]
 * @property {boolean} [omitIfLast]
 * @property {number} [marginLeft]
 * @property {number} [marginRight]
 * @property {any} [features]
 * @property {any} [wallMaterialOverride]
 * @property {number} [depthOffset]
 * @property {number} [wedgeAngleDeg]
 * @property {number} [minWidthMeters]
 * @property {number | null} [maxWidthMeters]
 */

/**
 * @typedef {Object} FacadePatternGroupItem
 * @property {'group'} type
 * @property {string} groupId
 * @property {{minRepeats:number, maxRepeats:number | 'auto'}} repeat
 * @property {'centerOut'} [ordering]
 * @property {(FacadePatternBayTemplate)[]} items
 */

/**
 * @typedef {Object} FacadeLayoutFillPattern
 * @property {'fill'} type
 * @property {'centerOut'} [ordering]
 * @property {(FacadePatternBayTemplate|FacadePatternGroupItem)[]} items
 */

/**
 * @typedef {Object} FacadeLayoutFillTopology
 * @property {'fill'} type
 * @property {Array<{groupId:string, repeats:number, locals: Array<{templateId:string, counts:number[]}>}>} groups
 */

/**
 * @typedef {Object} FacadeLayoutFillDebug
 * @property {'fill'} type
 * @property {number} faceLengthMeters
 * @property {Array<{groupId:string, repeats:number}>} groupRepeats
 * @property {Array<{groupId:string, templateId:string, counts:number[]}>} localRepeats
 * @property {Array<{groupId:string, templateId:string, instanceIndex:number}>} centerOutAssignments
 */

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

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
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

function normalizePattern(pattern, { warnings = null } = {}) {
    const src = pattern && typeof pattern === 'object' ? pattern : null;
    if (!src || src.type !== 'fill') return null;

    const ordering = src.ordering === 'centerOut' ? 'centerOut' : 'centerOut';
    const items = Array.isArray(src.items) ? src.items : [];
    if (!items.length) {
        if (warnings) warnings.push('Facade pattern: items array is empty.');
        return { type: 'fill', ordering, items: [] };
    }

    const normalized = [];
    for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        if (it.type === 'group') {
            const groupId = typeof it.groupId === 'string' ? it.groupId : '';
            const repeat = it.repeat && typeof it.repeat === 'object' ? it.repeat : {};
            const minRepeats = clampInt(repeat.minRepeats ?? 0, 0, 9999);
            const maxRepeatsRaw = repeat.maxRepeats;
            const maxRepeats = maxRepeatsRaw === 'auto' ? 'auto' : clampInt(maxRepeatsRaw ?? minRepeats, minRepeats, 9999);
            const groupItems = Array.isArray(it.items) ? it.items : [];
            const bayTemplates = [];
            for (const entry of groupItems) {
                const bay = normalizeBayTemplate(entry, { warnings, context: `group:${groupId}` });
                if (bay) bayTemplates.push(bay);
            }
            if (!groupId) {
                if (warnings) warnings.push('Facade pattern: groupId is missing.');
                continue;
            }
            if (!bayTemplates.length) {
                if (warnings) warnings.push(`Facade pattern: group "${groupId}" has no items.`);
                continue;
            }
            normalized.push({
                type: 'group',
                groupId,
                repeat: { minRepeats, maxRepeats },
                ordering: it.ordering === 'centerOut' ? 'centerOut' : ordering,
                items: bayTemplates
            });
            continue;
        }

        const bay = normalizeBayTemplate(it, { warnings, context: 'root' });
        if (bay) normalized.push(bay);
    }

    if (!normalized.length) {
        if (warnings) warnings.push('Facade pattern: normalized items are empty.');
    }

    return { type: 'fill', ordering, items: normalized };
}

function normalizeBayTemplate(value, { warnings = null, context = '' } = {}) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    const type = src.type === 'padding' ? 'padding' : 'bay';
    const templateId = typeof src.templateId === 'string' ? src.templateId : '';
    if (!templateId) {
        if (warnings) warnings.push(`Facade pattern (${context}): templateId is missing.`);
        return null;
    }

    const width = src.width && typeof src.width === 'object' ? src.width : {};
    const minMeters = clamp(width.minMeters ?? width.min ?? 0, 0, 9999);
    const maxMeters = clamp(width.maxMeters ?? width.max ?? minMeters, minMeters, 9999);
    if (!(minMeters > EPS)) {
        if (warnings) warnings.push(`Facade pattern (${context}:${templateId}): minMeters must be > 0.`);
        return null;
    }

    const repeat = src.repeat && typeof src.repeat === 'object' ? src.repeat : null;
    const repeatRange = repeat ? {
        min: clampInt(repeat.min ?? 1, 0, 9999),
        max: clampInt(repeat.max ?? repeat.min ?? 1, 0, 9999)
    } : null;
    if (repeatRange && repeatRange.max < repeatRange.min) {
        repeatRange.max = repeatRange.min;
    }

    const marginLeft = Number.isFinite(src.marginLeft) ? clamp(src.marginLeft, 0, 9999) : undefined;
    const marginRight = Number.isFinite(src.marginRight) ? clamp(src.marginRight, 0, 9999) : undefined;

    const out = {
        type,
        templateId,
        width: { minMeters, maxMeters },
        repeat: repeatRange,
        omitIfLast: !!src.omitIfLast,
        ...(marginLeft !== undefined ? { marginLeft } : {}),
        ...(marginRight !== undefined ? { marginRight } : {}),
        ...(src.features && typeof src.features === 'object' ? { features: src.features } : {}),
        ...(src.wallMaterialOverride !== undefined ? { wallMaterialOverride: src.wallMaterialOverride } : {}),
        ...(Number.isFinite(src.depthOffset) ? { depthOffset: Number(src.depthOffset) } : {}),
        ...(Number.isFinite(src.wedgeAngleDeg) ? { wedgeAngleDeg: Number(src.wedgeAngleDeg) } : {})
    };
    return out;
}

function computeTotals(expanded) {
    let minTotal = 0;
    let maxTotal = 0;
    for (const bay of expanded) {
        minTotal += bay.minWidth;
        maxTotal += bay.maxWidth;
    }
    return { minTotal, maxTotal };
}

function distributeWidthsEqually(expanded, faceLengthMeters, { warnings = null } = {}) {
    const L = Number(faceLengthMeters) || 0;
    const n = expanded.length;
    if (!(L > EPS) || n <= 0) {
        return new Array(n).fill(n > 0 ? 1 / n : 1);
    }

    const widths = expanded.map((bay) => bay.minWidth);
    let totalMin = widths.reduce((s, w) => s + w, 0);
    if (!(totalMin > EPS)) {
        const frac = 1 / n;
        return widths.map(() => frac);
    }

    if (totalMin > L + 1e-6) {
        if (warnings) warnings.push(`Facade solver: layout min width ${totalMin.toFixed(3)}m exceeds face length ${L.toFixed(3)}m.`);
        const scale = L / totalMin;
        const fracs = widths.map((w) => (w * scale) / L);
        return normalizeFracs(fracs);
    }

    let leftover = L - totalMin;
    const caps = expanded.map((bay) => Math.max(0, bay.maxWidth - bay.minWidth));
    let growable = caps
        .map((cap, idx) => ({ idx, cap }))
        .filter((entry) => entry.cap > EPS);

    while (leftover > 1e-6 && growable.length) {
        const delta = leftover / growable.length;
        const nextGrowable = [];
        for (const entry of growable) {
            const take = Math.min(delta, entry.cap);
            widths[entry.idx] += take;
            leftover -= take;
            const remaining = entry.cap - take;
            if (remaining > 1e-6) nextGrowable.push({ idx: entry.idx, cap: remaining });
        }
        growable = nextGrowable;
        if (delta <= 1e-12) break;
    }

    if (leftover > 1e-3) {
        if (warnings) warnings.push(`Facade solver: leftover ${leftover.toFixed(3)}m could not be distributed within max widths.`);
        widths[widths.length - 1] += leftover;
        leftover = 0;
    }

    const fracs = widths.map((w) => w / L);
    return normalizeFracs(fracs);
}

function normalizeFracs(fracs) {
    const list = Array.isArray(fracs) ? fracs : [];
    let sum = 0;
    for (const f of list) sum += Number(f) || 0;
    if (!(sum > EPS)) return list.map(() => 1 / Math.max(1, list.length));
    return list.map((f) => (Number(f) || 0) / sum);
}

function makeExpandedLayout(pattern, topology, { includeLastOmissions = true } = {}) {
    const normalized = normalizePattern(pattern);
    if (!normalized) return [];
    const top = topology && typeof topology === 'object' ? topology : null;
    const groupTopoById = new Map((top?.groups ?? []).map((g) => [g.groupId, g]));

    /** @type {Array<{type: FacadeResolvedItemType, id: string, minWidth:number, maxWidth:number, template: FacadePatternBayTemplate}>} */
    const expanded = [];

    for (const item of normalized.items) {
        if (item.type === 'group') {
            const groupId = item.groupId;
            const groupTopo = groupTopoById.get(groupId) ?? null;
            const repeats = clampInt(groupTopo?.repeats ?? item.repeat.minRepeats, 0, 9999);

            const localCountsByTemplateId = new Map();
            for (const entry of groupTopo?.locals ?? []) {
                if (typeof entry?.templateId === 'string' && Array.isArray(entry?.counts)) {
                    localCountsByTemplateId.set(entry.templateId, entry.counts.map((c) => clampInt(c, 0, 9999)));
                }
            }

            for (let gi = 0; gi < repeats; gi++) {
                const isLastGroupInstance = gi === repeats - 1;
                for (const template of item.items) {
                    const repeat = template.repeat;
                    const count = repeat ? (localCountsByTemplateId.get(template.templateId)?.[gi] ?? repeat.min) : 1;
                    const resolvedCount = repeat ? clampInt(count, repeat.min, repeat.max) : 1;
                    for (let ri = 0; ri < resolvedCount; ri++) {
                        if (includeLastOmissions && template.omitIfLast && isLastGroupInstance) continue;
                        const id = resolvedCount > 1
                            ? `${groupId}_${gi + 1}_${template.templateId}_${ri + 1}`
                            : `${groupId}_${gi + 1}_${template.templateId}`;
                        expanded.push({
                            type: template.type === 'padding' ? 'padding' : 'bay',
                            id,
                            minWidth: template.width.minMeters,
                            maxWidth: template.width.maxMeters,
                            template
                        });
                    }
                }
            }
            continue;
        }

        const template = item;
        const repeat = template.repeat;
        const count = repeat ? repeat.min : 1;
        const resolvedCount = repeat ? clampInt(count, repeat.min, repeat.max) : 1;
        for (let ri = 0; ri < resolvedCount; ri++) {
            const id = resolvedCount > 1 ? `${template.templateId}_${ri + 1}` : template.templateId;
            expanded.push({
                type: template.type === 'padding' ? 'padding' : 'bay',
                id,
                minWidth: template.width.minMeters,
                maxWidth: template.width.maxMeters,
                template
            });
        }
    }

    return expanded;
}

function initTopology(pattern) {
    const normalized = normalizePattern(pattern);
    if (!normalized) return null;

    const groups = [];
    for (const item of normalized.items) {
        if (item.type !== 'group') continue;
        const repeats = clampInt(item.repeat.minRepeats, 0, 9999);

        /** @type {Array<{templateId:string, counts:number[]}>} */
        const locals = [];
        for (const template of item.items) {
            if (!template.repeat) continue;
            const r = template.repeat;
            const counts = new Array(repeats).fill(clampInt(r.min, 0, 9999));
            locals.push({ templateId: template.templateId, counts });
        }
        groups.push({ groupId: item.groupId, repeats, locals });
    }
    return { type: 'fill', groups };
}

function cloneTopology(topology) {
    const src = topology && typeof topology === 'object' ? topology : null;
    if (!src || src.type !== 'fill') return null;
    const groups = Array.isArray(src.groups) ? src.groups : [];
    return {
        type: 'fill',
        groups: groups.map((g) => ({
            groupId: typeof g?.groupId === 'string' ? g.groupId : '',
            repeats: clampInt(g?.repeats ?? 0, 0, 9999),
            locals: Array.isArray(g?.locals) ? g.locals.map((l) => ({
                templateId: typeof l?.templateId === 'string' ? l.templateId : '',
                counts: Array.isArray(l?.counts) ? l.counts.map((c) => clampInt(c, 0, 9999)) : []
            })) : []
        }))
    };
}

function canIncreaseGroupRepeat(normalized, topology, groupId) {
    const group = normalized.items.find((it) => it.type === 'group' && it.groupId === groupId) ?? null;
    if (!group || group.type !== 'group') return false;
    const topoGroup = topology.groups.find((g) => g.groupId === groupId) ?? null;
    if (!topoGroup) return false;
    const maxRepeats = group.repeat.maxRepeats === 'auto' ? 9999 : clampInt(group.repeat.maxRepeats, 0, 9999);
    return topoGroup.repeats + 1 <= maxRepeats;
}

function increaseGroupRepeat(normalized, topology, groupId) {
    const group = normalized.items.find((it) => it.type === 'group' && it.groupId === groupId) ?? null;
    if (!group || group.type !== 'group') return false;
    const topoGroup = topology.groups.find((g) => g.groupId === groupId) ?? null;
    if (!topoGroup) return false;
    topoGroup.repeats += 1;

    for (const template of group.items) {
        if (!template.repeat) continue;
        const local = topoGroup.locals.find((l) => l.templateId === template.templateId) ?? null;
        if (!local) continue;
        local.counts.push(clampInt(template.repeat.min, 0, 9999));
    }
    return true;
}

function tryIncreaseLocalRepeat(normalized, topology, groupId, templateId, groupInstanceIndex, { faceLengthMeters, warnings, debugAssignments }) {
    const group = normalized.items.find((it) => it.type === 'group' && it.groupId === groupId) ?? null;
    if (!group || group.type !== 'group') return false;
    const template = group.items.find((it) => it.templateId === templateId) ?? null;
    if (!template || !template.repeat) return false;
    const r = template.repeat;

    const topoGroup = topology.groups.find((g) => g.groupId === groupId) ?? null;
    if (!topoGroup) return false;
    const local = topoGroup.locals.find((l) => l.templateId === templateId) ?? null;
    if (!local) return false;
    if (groupInstanceIndex < 0 || groupInstanceIndex >= topoGroup.repeats) return false;
    const prev = clampInt(local.counts[groupInstanceIndex] ?? r.min, r.min, r.max);
    if (prev >= r.max) return false;

    local.counts[groupInstanceIndex] = prev + 1;

    const expanded = makeExpandedLayout(normalized, topology);
    const totals = computeTotals(expanded);
    const L = Number(faceLengthMeters) || 0;
    if (totals.minTotal > L + 1e-6) {
        local.counts[groupInstanceIndex] = prev;
        if (warnings) warnings.push(`Facade solver: local repeat causes min width overflow (${groupId}:${templateId}).`);
        return false;
    }

    debugAssignments.push({ groupId, templateId, instanceIndex: groupInstanceIndex });
    return true;
}

/**
 * @param {object} options
 * @param {FacadeLayoutFillPattern} options.pattern
 * @param {number} options.faceLengthMeters
 * @param {FacadeLayoutFillTopology | null} [options.topology]
 * @param {string[] | null} [options.warnings]
 * @returns {{items: FacadeResolvedLayoutItem[], topology: FacadeLayoutFillTopology | null, debug: FacadeLayoutFillDebug}}
 */
export function solveFacadeLayoutFillPattern({ pattern, faceLengthMeters, topology = null, warnings = null } = {}) {
    const w = Array.isArray(warnings) ? warnings : null;
    const normalized = normalizePattern(pattern, { warnings: w });
    const faceLength = Number(faceLengthMeters) || 0;

    /** @type {FacadeLayoutFillDebug} */
    const debug = {
        type: 'fill',
        faceLengthMeters: faceLength,
        groupRepeats: [],
        localRepeats: [],
        centerOutAssignments: []
    };

    if (!normalized) {
        if (w) w.push('Facade solver: pattern is invalid.');
        return { items: [], topology: null, debug };
    }

    const topo = topology ? (cloneTopology(topology) ?? initTopology(normalized)) : initTopology(normalized);
    if (!topo) {
        if (w) w.push('Facade solver: failed to initialize topology.');
        return { items: [], topology: null, debug };
    }

    const L = Number(faceLengthMeters) || 0;
    if (!(L > EPS)) {
        if (w) w.push('Facade solver: face length is invalid.');
    }

    const localCursorByKey = new Map();

    for (let guard = 0; guard < 5000; guard++) {
        const expanded = makeExpandedLayout(normalized, topo);
        const { minTotal, maxTotal } = computeTotals(expanded);
        if (L <= maxTotal + 1e-6) break;

        let didExpandGroup = false;
        for (const item of normalized.items) {
            if (item.type !== 'group') continue;
            if (!canIncreaseGroupRepeat(normalized, topo, item.groupId)) continue;

            const trial = cloneTopology(topo);
            if (!trial) continue;
            if (!increaseGroupRepeat(normalized, trial, item.groupId)) continue;
            const trialExpanded = makeExpandedLayout(normalized, trial);
            const trialTotals = computeTotals(trialExpanded);
            if (trialTotals.minTotal > L + 1e-6) continue;

            topo.groups = trial.groups;
            didExpandGroup = true;
            break;
        }
        if (didExpandGroup) continue;

        let didExpandLocal = false;
        for (const groupItem of normalized.items) {
            if (groupItem.type !== 'group') continue;
            const topoGroup = topo.groups.find((g) => g.groupId === groupItem.groupId) ?? null;
            if (!topoGroup || topoGroup.repeats <= 0) continue;

            const groupOrder = groupItem.ordering === 'centerOut' ? centerOutOrder(topoGroup.repeats) : centerOutOrder(topoGroup.repeats);
            for (const localSpec of topoGroup.locals) {
                const templateId = localSpec.templateId;
                const key = `${groupItem.groupId}|${templateId}`;
                const start = clampInt(localCursorByKey.get(key) ?? 0, 0, Math.max(0, groupOrder.length - 1));
                for (let step = 0; step < groupOrder.length; step++) {
                    const pos = (start + step) % groupOrder.length;
                    const gi = groupOrder[pos];
                    const ok = tryIncreaseLocalRepeat(normalized, topo, groupItem.groupId, templateId, gi, {
                        faceLengthMeters: L,
                        warnings: w,
                        debugAssignments: debug.centerOutAssignments
                    });
                    if (ok) {
                        localCursorByKey.set(key, (pos + 1) % groupOrder.length);
                        didExpandLocal = true;
                        break;
                    }
                }
                if (didExpandLocal) break;
            }
            if (didExpandLocal) break;
        }

        if (!didExpandLocal) {
            if (w) w.push(`Facade solver: could not fill face length ${L.toFixed(3)}m within repeat constraints.`);
            break;
        }
    }

    for (const group of topo.groups) {
        if (!group?.groupId) continue;
        debug.groupRepeats.push({ groupId: group.groupId, repeats: group.repeats });
        for (const local of group.locals) {
            if (!local?.templateId) continue;
            debug.localRepeats.push({
                groupId: group.groupId,
                templateId: local.templateId,
                counts: local.counts.slice()
            });
        }
    }

    const expandedFinal = makeExpandedLayout(normalized, topo);
    const fracs = distributeWidthsEqually(expandedFinal, L, { warnings: w });

    /** @type {FacadeResolvedLayoutItem[]} */
    const items = expandedFinal.map((bay, idx) => {
        const template = bay.template;
        const widthFrac = fracs[idx] ?? (1 / Math.max(1, expandedFinal.length));
        const out = {
            type: bay.type,
            id: bay.id,
            widthFrac,
            minWidthMeters: template.width.minMeters,
            maxWidthMeters: Number.isFinite(template.width.maxMeters) ? template.width.maxMeters : null,
            ...(Number.isFinite(template.marginLeft) ? { marginLeft: template.marginLeft } : {}),
            ...(Number.isFinite(template.marginRight) ? { marginRight: template.marginRight } : {}),
            ...(template.features ? { features: deepClone(template.features) } : {}),
            ...(template.wallMaterialOverride !== undefined ? { wallMaterialOverride: deepClone(template.wallMaterialOverride) } : {}),
            ...(Number.isFinite(template.depthOffset) ? { depthOffset: template.depthOffset } : {}),
            ...(Number.isFinite(template.wedgeAngleDeg) ? { wedgeAngleDeg: template.wedgeAngleDeg } : {})
        };
        return out;
    });

    return { items, topology: topo, debug };
}

export function createLegacyWindowSpacingFacadeFillPattern({
    windowWidthMeters,
    spacingMeters,
    columnsEvery,
    columnWidthMeters
} = {}) {
    const winWidth = clamp(windowWidthMeters ?? 2.2, 0.3, 50);
    const spacing = clamp(spacingMeters ?? 1.6, 0, 50);
    const colEvery = clampInt(columnsEvery ?? 4, 1, 99);
    const colWidth = clamp(columnWidthMeters ?? 0.9, 0.1, 50);

    const halfSpacing = spacing * 0.5;
    const winMin = winWidth + spacing;
    const winMax = winMin + spacing;
    const windowFeature = Object.freeze({
        window: Object.freeze({
            defId: 'win_1',
            widthMeters: null,
            heightMeters: null,
            floorSkip: 1
        })
    });

    /** @type {FacadeLayoutFillPattern} */
    const pattern = {
        type: 'fill',
        ordering: 'centerOut',
        items: [
            {
                type: 'group',
                groupId: 'full',
                repeat: { minRepeats: 0, maxRepeats: 'auto' },
                ordering: 'centerOut',
                items: [
                    {
                        type: 'bay',
                        templateId: 'win',
                        width: { minMeters: winMin, maxMeters: winMax },
                        repeat: { min: colEvery, max: colEvery },
                        marginLeft: halfSpacing,
                        marginRight: halfSpacing,
                        features: windowFeature
                    },
                    {
                        type: 'padding',
                        templateId: 'col',
                        width: { minMeters: colWidth, maxMeters: colWidth }
                    }
                ]
            },
            {
                type: 'group',
                groupId: 'tail',
                repeat: { minRepeats: 1, maxRepeats: 1 },
                ordering: 'centerOut',
                items: [
                    {
                        type: 'bay',
                        templateId: 'win',
                        width: { minMeters: winMin, maxMeters: winMax },
                        repeat: { min: 1, max: colEvery },
                        marginLeft: halfSpacing,
                        marginRight: halfSpacing,
                        features: windowFeature
                    }
                ]
            }
        ]
    };

    return pattern;
}

export function createLegacyWindowSpacingOnlyFacadeFillPattern({
    windowWidthMeters,
    spacingMeters,
    maxWindows = 9999
} = {}) {
    const winWidth = clamp(windowWidthMeters ?? 2.2, 0.3, 50);
    const spacing = clamp(spacingMeters ?? 1.6, 0, 50);
    const halfSpacing = spacing * 0.5;
    const winMin = winWidth + spacing;
    const winMax = winMin + spacing;
    const maxRepeat = clampInt(maxWindows ?? 9999, 1, 9999);

    const windowFeature = Object.freeze({
        window: Object.freeze({
            defId: 'win_1',
            widthMeters: null,
            heightMeters: null,
            floorSkip: 1
        })
    });

    /** @type {FacadeLayoutFillPattern} */
    return {
        type: 'fill',
        ordering: 'centerOut',
        items: [
            {
                type: 'group',
                groupId: 'windows',
                repeat: { minRepeats: 1, maxRepeats: 1 },
                ordering: 'centerOut',
                items: [
                    {
                        type: 'bay',
                        templateId: 'win',
                        width: { minMeters: winMin, maxMeters: winMax },
                        repeat: { min: 1, max: maxRepeat },
                        marginLeft: halfSpacing,
                        marginRight: halfSpacing,
                        features: windowFeature
                    }
                ]
            }
        ]
    };
}
