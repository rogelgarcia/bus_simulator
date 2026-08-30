// Pure screen-space rules for conservative sun-bloom occluder selection.
// @ts-check

export const FULL_NDC_RECT = Object.freeze({ minX: -1, minY: -1, maxX: 1, maxY: 1 });

export function createEmptyNdcRect() {
    return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isFiniteNdcRect(rect) {
    return Number.isFinite(rect?.minX)
        && Number.isFinite(rect?.minY)
        && Number.isFinite(rect?.maxX)
        && Number.isFinite(rect?.maxY)
        && rect.minX <= rect.maxX
        && rect.minY <= rect.maxY;
}

export function includeNdcRect(target, source) {
    if (!target || !isFiniteNdcRect(source)) return target;
    target.minX = Math.min(target.minX, source.minX);
    target.minY = Math.min(target.minY, source.minY);
    target.maxX = Math.max(target.maxX, source.maxX);
    target.maxY = Math.max(target.maxY, source.maxY);
    return target;
}

export function expandNdcRect(rect, padX, padY) {
    if (!isFiniteNdcRect(rect)) return null;
    const x = Math.max(0, Number(padX) || 0);
    const y = Math.max(0, Number(padY) || 0);
    return {
        minX: rect.minX - x,
        minY: rect.minY - y,
        maxX: rect.maxX + x,
        maxY: rect.maxY + y
    };
}

export function ndcRectsOverlap(a, b) {
    if (!isFiniteNdcRect(a) || !isFiniteNdcRect(b)) return false;
    return a.minX <= b.maxX
        && a.maxX >= b.minX
        && a.minY <= b.maxY
        && a.maxY >= b.minY;
}

export function isNdcRectViewportRelevant(rect) {
    return ndcRectsOverlap(rect, FULL_NDC_RECT);
}

export function shouldRetainSunBloomOccluder({
    uncertain = false,
    occluderRect = null,
    occluderNearDepth = Infinity,
    effectRect = null,
    effectFarDepth = -Infinity
} = {}) {
    if (uncertain) return true;
    if (!isFiniteNdcRect(occluderRect) || !isFiniteNdcRect(effectRect)) return true;
    if (!Number.isFinite(occluderNearDepth) || !Number.isFinite(effectFarDepth)) return true;
    if (occluderNearDepth > effectFarDepth) return false;
    return ndcRectsOverlap(occluderRect, effectRect);
}
