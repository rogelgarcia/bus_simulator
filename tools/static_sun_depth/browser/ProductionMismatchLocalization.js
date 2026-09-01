// Pure bounded sampling and aggregation for the artifact-only AI 531 mismatch diagnostic.
// @ts-check

export const PRODUCTION_MISMATCH_LOCALIZATION_SCHEMA =
    'ai531-production-mismatch-caster-localization-v1';
export const PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID =
    'illum.game.low_sun_matrix.regional_dense.w.az135.el08';
export const PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT = 64;

/**
 * Select one stable candidate per 8x8 framebuffer stratum, then fill any empty
 * strata from a stable global ordering. Input pixels use WebGL's lower-left
 * framebuffer origin.
 * @param {readonly any[]} candidates
 * @param {{width: number, height: number, sampleCount?: number}} options
 */
export function selectProductionMismatchSamples(candidates, options) {
    const width = requirePositiveInteger(options?.width, 'sample width');
    const height = requirePositiveInteger(options?.height, 'sample height');
    const sampleCount = requirePositiveInteger(
        options?.sampleCount ?? PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT,
        'sample count'
    );
    if (!Array.isArray(candidates) || candidates.length < sampleCount) {
        throw new Error('strict missing-occluder candidates must cover the bounded sample');
    }
    const normalized = candidates.map((candidate, index) => {
        const pixel = candidate?.pixel;
        if (!Array.isArray(pixel) || pixel.length !== 2
            || !Number.isSafeInteger(pixel[0]) || !Number.isSafeInteger(pixel[1])
            || pixel[0] < 0 || pixel[0] >= width
            || pixel[1] < 0 || pixel[1] >= height) {
            throw new Error(`strict missing-occluder candidate[${index}] has an invalid pixel`);
        }
        return Object.freeze({
            ...candidate,
            pixel: Object.freeze([...pixel]),
            selectionHash: spatialHash(pixel[0], pixel[1])
        });
    });
    const unique = new Set(normalized.map((entry) => entry.pixel.join(',')));
    if (unique.size !== normalized.length) {
        throw new Error('strict missing-occluder candidate pixels must be unique');
    }
    const columns = Math.max(1, Math.min(8, sampleCount));
    const rows = Math.max(1, Math.ceil(sampleCount / columns));
    const strata = new Array(columns * rows).fill(null);
    for (const candidate of normalized) {
        const column = Math.min(columns - 1, Math.floor(candidate.pixel[0] * columns / width));
        const row = Math.min(rows - 1, Math.floor(candidate.pixel[1] * rows / height));
        const index = row * columns + column;
        const incumbent = strata[index];
        if (!incumbent || compareCandidates(candidate, incumbent) < 0) {
            strata[index] = candidate;
        }
    }
    const selected = strata.filter(Boolean).slice(0, sampleCount);
    const selectedKeys = new Set(selected.map((entry) => entry.pixel.join(',')));
    if (selected.length < sampleCount) {
        const remainder = normalized
            .filter((entry) => !selectedKeys.has(entry.pixel.join(',')))
            .sort(compareCandidates);
        for (const entry of remainder) {
            if (selected.length >= sampleCount) break;
            selected.push(entry);
        }
    }
    if (selected.length !== sampleCount) {
        throw new Error('bounded mismatch sample selection is incomplete');
    }
    selected.sort((left, right) => (
        left.pixel[1] - right.pixel[1] || left.pixel[0] - right.pixel[0]
    ));
    return Object.freeze(selected.map((entry, sampleIndex) => Object.freeze({
        ...entry,
        sampleIndex
    })));
}

/** @param {readonly any[]} samples */
export function aggregateProductionMismatchCasterSamples(samples) {
    if (!Array.isArray(samples) || samples.length < 1) {
        throw new Error('caster localization requires a nonempty sample');
    }
    const classCounts = new Map();
    const casterCounts = new Map();
    const materialCounts = new Map();
    let resolvedSampleCount = 0;
    let foliageSampleCount = 0;
    let cutoutSampleCount = 0;
    let opaqueSampleCount = 0;
    for (const [index, sample] of samples.entries()) {
        if (sample?.sampleIndex !== index) {
            throw new Error('caster localization sample indices must be contiguous');
        }
        const caster = sample.dominantAlphaEvaluatedCaster ?? null;
        if (!caster) continue;
        resolvedSampleCount += 1;
        const coverageMode = String(caster.coverageMode || 'unknown');
        const foliage = caster.isFoliage === true;
        const classKey = `${foliage ? 'foliage' : 'non_foliage'}:${coverageMode}`;
        increment(classCounts, classKey);
        if (foliage) foliageSampleCount += 1;
        if (coverageMode === 'cutout') cutoutSampleCount += 1;
        else if (coverageMode === 'opaque' || coverageMode === 'forced_opaque') {
            opaqueSampleCount += 1;
        }
        const casterKey = `${caster.objectPath}\u0000${caster.materialName}`;
        const casterEntry = casterCounts.get(casterKey) ?? {
            count: 0,
            coverageMode,
            isFoliage: foliage,
            materialName: caster.materialName,
            objectName: caster.objectName,
            objectPath: caster.objectPath
        };
        casterEntry.count += 1;
        casterCounts.set(casterKey, casterEntry);
        increment(materialCounts, String(caster.materialName || ''));
    }
    const unresolvedSampleCount = samples.length - resolvedSampleCount;
    const sortCountEntries = (entries) => entries.sort((left, right) => (
        right.count - left.count
        || compareStrings(left.objectPath ?? left.key, right.objectPath ?? right.key)
        || compareStrings(left.materialName ?? '', right.materialName ?? '')
    ));
    return Object.freeze({
        method: 'dominant-weighted-alpha-evaluated-vogel-linear-tap-caster-v1',
        sampleCount: samples.length,
        resolvedSampleCount,
        unresolvedSampleCount,
        resolvedFraction: resolvedSampleCount / samples.length,
        foliageSampleCount,
        cutoutSampleCount,
        opaqueSampleCount,
        foliageOrCutoutSampleCount: samples.filter((sample) => {
            const caster = sample.dominantAlphaEvaluatedCaster;
            return caster?.isFoliage === true || caster?.coverageMode === 'cutout';
        }).length,
        classCounts: Object.freeze(
            [...classCounts].sort(([left], [right]) => compareStrings(left, right))
                .map(([key, count]) => Object.freeze({key, count}))
        ),
        topCasters: Object.freeze(sortCountEntries([...casterCounts.values()]).slice(0, 20)
            .map((entry) => Object.freeze({...entry}))),
        topMaterials: Object.freeze(sortCountEntries([...materialCounts]
            .map(([key, count]) => ({key, count}))).slice(0, 20)
            .map((entry) => Object.freeze(entry)))
    });
}

function spatialHash(x, y) {
    let value = (Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b) >>> 0;
    return (value ^ (value >>> 16)) >>> 0;
}

function compareCandidates(left, right) {
    return left.selectionHash - right.selectionHash
        || left.pixel[1] - right.pixel[1]
        || left.pixel[0] - right.pixel[0];
}

function increment(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return value;
}

function compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
}
