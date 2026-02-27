// src/app/buildings/wall_decorators/RibbonPatternCatalog.js
// Shared ribbon pattern metadata + grayscale samplers for ribbon normal generation.
// @ts-check

export const RIBBON_PATTERN_ID = Object.freeze({
    CIRCLE: 'circle',
    FLAT_BASE_X: 'flat_base_x'
});

export const RIBBON_PATTERN_DEFAULT_ID = RIBBON_PATTERN_ID.CIRCLE;

function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.0;
    return Math.max(0.0, Math.min(1.0, n));
}

function wrapUnit(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.0;
    return n - Math.floor(n);
}

function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
}

function makeSvgDataUrl(svgMarkup) {
    const raw = typeof svgMarkup === 'string' ? svgMarkup.trim() : '';
    if (!raw) return '';
    return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`;
}

function sampleCircleHeight(u, v) {
    const x = wrapUnit(u) - 0.5;
    const y = wrapUnit(v) - 0.5;
    const radius = Math.hypot(x, y);
    const ring = 1.0 - smoothstep(0.22, 0.30, radius);
    const core = 1.0 - smoothstep(0.05, 0.14, radius);
    return clamp01(Math.max(ring * 0.7, core));
}

function sampleFlatBaseXHeight(u, v) {
    const x = wrapUnit(u);
    const y = wrapUnit(v);
    const thickness = 0.075;
    const feather = 0.05;
    const diagA = 1.0 - smoothstep(thickness, thickness + feather, Math.abs(y - x));
    const diagBMask = smoothstep(0.20, 0.33, y);
    const diagB = (1.0 - smoothstep(thickness, thickness + feather, Math.abs(y - (1.0 - x)))) * diagBMask;
    const baseBand = 1.0 - smoothstep(0.06, 0.12, Math.abs(y - 0.14));
    const baseWidth = 1.0 - smoothstep(0.34, 0.46, Math.abs(x - 0.5));
    const base = baseBand * baseWidth;
    return clamp01(Math.max(diagA, Math.max(diagB, base)));
}

const RIBBON_PATTERN_CATALOG = Object.freeze([
    Object.freeze({
        id: RIBBON_PATTERN_ID.CIRCLE,
        label: 'Circle',
        previewUrl: makeSvgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="#111"/>
  <circle cx="48" cy="48" r="25" fill="#f2f2f2"/>
  <circle cx="48" cy="48" r="10" fill="#cbcbcb"/>
</svg>
        `),
        sampleHeight: (u, v) => sampleCircleHeight(u, v)
    }),
    Object.freeze({
        id: RIBBON_PATTERN_ID.FLAT_BASE_X,
        label: 'Flat-base X',
        previewUrl: makeSvgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="#111"/>
  <path d="M18 18 L78 78" stroke="#f2f2f2" stroke-width="10" stroke-linecap="round"/>
  <path d="M78 30 L40 68" stroke="#f2f2f2" stroke-width="10" stroke-linecap="round"/>
  <rect x="22" y="68" width="52" height="10" rx="5" fill="#f2f2f2"/>
</svg>
        `),
        sampleHeight: (u, v) => sampleFlatBaseXHeight(u, v)
    })
]);

const RIBBON_PATTERN_BY_ID = new Map(RIBBON_PATTERN_CATALOG.map((entry) => [entry.id, entry]));

export function normalizeRibbonPatternId(value, fallback = RIBBON_PATTERN_DEFAULT_ID) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === RIBBON_PATTERN_ID.FLAT_BASE_X) return RIBBON_PATTERN_ID.FLAT_BASE_X;
    if (raw === RIBBON_PATTERN_ID.CIRCLE) return RIBBON_PATTERN_ID.CIRCLE;
    return normalizeRibbonPatternId(fallback, RIBBON_PATTERN_DEFAULT_ID);
}

export function getRibbonPatternEntryById(value) {
    const id = normalizeRibbonPatternId(value);
    return RIBBON_PATTERN_BY_ID.get(id) ?? RIBBON_PATTERN_BY_ID.get(RIBBON_PATTERN_DEFAULT_ID) ?? null;
}

export function getRibbonPatternEntries() {
    return RIBBON_PATTERN_CATALOG;
}

export function getRibbonPatternOptions() {
    return RIBBON_PATTERN_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        previewUrl: entry.previewUrl
    }));
}

export function sampleRibbonPatternHeight(patternId, u, v) {
    const entry = getRibbonPatternEntryById(patternId);
    const sampler = typeof entry?.sampleHeight === 'function' ? entry.sampleHeight : null;
    if (!sampler) return 0.0;
    return clamp01(sampler(wrapUnit(u), wrapUnit(v)));
}

export function buildRibbonPatternHeightField({ patternId = RIBBON_PATTERN_DEFAULT_ID, size = 128 } = {}) {
    const safeSize = Math.max(16, Math.min(512, Math.round(Number(size) || 128)));
    const pixels = new Uint8Array(safeSize * safeSize);
    for (let y = 0; y < safeSize; y++) {
        for (let x = 0; x < safeSize; x++) {
            const u = (x + 0.5) / safeSize;
            const v = (y + 0.5) / safeSize;
            const h = sampleRibbonPatternHeight(patternId, u, v);
            pixels[y * safeSize + x] = Math.max(0, Math.min(255, Math.round(h * 255)));
        }
    }
    return {
        size: safeSize,
        pixels
    };
}
