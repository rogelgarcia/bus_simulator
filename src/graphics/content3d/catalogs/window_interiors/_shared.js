// src/graphics/content3d/catalogs/window_interiors/_shared.js
// Shared helpers for per-atlas window interior coordinate catalogs.

const ATLAS_BASE_URL = new URL(
    '../../../../../assets/public/textures/window_interiors/',
    import.meta.url
);

export const WINDOW_INTERIOR_TYPE = Object.freeze({
    RESIDENTIAL: 'residential',
    OFFICE: 'office',
    BUSINESS: 'business'
});

export const DEFAULT_BUSINESS_TYPES = Object.freeze([
    'pharmacy',
    'church',
    'gym',
    'cafe',
    'bakery',
    'restaurant',
    'bookstore',
    'barbershop',
    'laundromat',
    'clinic',
    'grocery',
    'electronics',
    'flower_shop',
    'pet_shop',
    'hardware'
]);

function round6(value) {
    return Math.round(Number(value) * 1e6) / 1e6;
}

function toPositiveNumber(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return num;
}

function toNonNegativeNumber(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return num;
}

function normalizeEdgeInsetPx(value) {
    if (typeof value === 'number') {
        const n = toNonNegativeNumber(value, 0);
        return { left: n, right: n, top: n, bottom: n };
    }
    const src = value && typeof value === 'object' ? value : {};
    const xyX = toNonNegativeNumber(src.x, 0);
    const xyY = toNonNegativeNumber(src.y, 0);
    const left = toNonNegativeNumber(src.left, xyX);
    const right = toNonNegativeNumber(src.right, xyX);
    const top = toNonNegativeNumber(src.top, xyY);
    const bottom = toNonNegativeNumber(src.bottom, xyY);
    return { left, right, top, bottom };
}

function normalizeGutterPx(value) {
    if (typeof value === 'number') {
        const n = toNonNegativeNumber(value, 0);
        return { x: n, y: n };
    }
    const src = value && typeof value === 'object' ? value : {};
    const x = toNonNegativeNumber(src.x, toNonNegativeNumber(src.horizontal, 0));
    const y = toNonNegativeNumber(src.y, toNonNegativeNumber(src.vertical, 0));
    return { x, y };
}

function normalizeType(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === WINDOW_INTERIOR_TYPE.RESIDENTIAL) return WINDOW_INTERIOR_TYPE.RESIDENTIAL;
    if (raw === WINDOW_INTERIOR_TYPE.OFFICE) return WINDOW_INTERIOR_TYPE.OFFICE;
    return WINDOW_INTERIOR_TYPE.BUSINESS;
}

function normalizeBusinessTypes(type, businessTypes) {
    if (type !== WINDOW_INTERIOR_TYPE.BUSINESS) return Object.freeze([]);
    const list = Array.isArray(businessTypes)
        ? businessTypes
            .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
            .filter(Boolean)
        : [];
    const safe = list.length ? list : Array.from(DEFAULT_BUSINESS_TYPES);
    return Object.freeze(Array.from(new Set(safe)));
}

function makeWindowEntries({
    type,
    businessTypes,
    cols,
    rows,
    widthPx,
    heightPx,
    edgeInsetPx,
    gutterPx
}) {
    const c = Math.max(1, cols | 0);
    const r = Math.max(1, rows | 0);
    const imageW = toPositiveNumber(widthPx, 1);
    const imageH = toPositiveNumber(heightPx, 1);

    const gridCellW = imageW / c;
    const gridCellH = imageH / r;

    const totalGapX = gutterPx.x * Math.max(0, c - 1);
    const totalGapY = gutterPx.y * Math.max(0, r - 1);
    const usableW = imageW - edgeInsetPx.left - edgeInsetPx.right - totalGapX;
    const usableH = imageH - edgeInsetPx.top - edgeInsetPx.bottom - totalGapY;

    const roomW = usableW > 0 ? (usableW / c) : gridCellW;
    const roomH = usableH > 0 ? (usableH / r) : gridCellH;

    const out = [];
    for (let row = 0; row < r; row++) {
        for (let col = 0; col < c; col++) {
            const index = (row * c) + col;
            const id = `window_${String(index + 1).padStart(2, '0')}`;

            const cellX = gridCellW * col;
            const cellY = gridCellH * row;

            const roomX = (usableW > 0 ? edgeInsetPx.left : 0) + (col * (roomW + gutterPx.x));
            const roomY = (usableH > 0 ? edgeInsetPx.top : 0) + (row * (roomH + gutterPx.y));

            const businessType = type === WINDOW_INTERIOR_TYPE.BUSINESS
                ? businessTypes[index % Math.max(1, businessTypes.length)]
                : null;

            out.push(Object.freeze({
                id,
                index,
                col,
                row,
                type,
                businessType,
                aspect: round6(roomW / roomH),
                cellRectPx: Object.freeze({
                    x: round6(cellX),
                    y: round6(cellY),
                    width: round6(gridCellW),
                    height: round6(gridCellH)
                }),
                roomRectPx: Object.freeze({
                    x: round6(roomX),
                    y: round6(roomY),
                    width: round6(roomW),
                    height: round6(roomH)
                }),
                uvCell: Object.freeze({
                    u0: round6(cellX / imageW),
                    v0: round6(cellY / imageH),
                    u1: round6((cellX + gridCellW) / imageW),
                    v1: round6((cellY + gridCellH) / imageH)
                }),
                uvRoom: Object.freeze({
                    u0: round6(roomX / imageW),
                    v0: round6(roomY / imageH),
                    u1: round6((roomX + roomW) / imageW),
                    v1: round6((roomY + roomH) / imageH)
                })
            }));
        }
    }

    return Object.freeze(out);
}

export function createWindowInteriorAtlasEntry(config) {
    const src = config && typeof config === 'object' ? config : {};
    const id = typeof src.id === 'string' ? src.id : '';
    const label = typeof src.label === 'string' ? src.label : id;
    const fileName = typeof src.fileName === 'string' ? src.fileName : '';
    const type = normalizeType(src.type);

    const image = src.image && typeof src.image === 'object' ? src.image : {};
    const grid = src.grid && typeof src.grid === 'object' ? src.grid : {};
    const borders = src.borders && typeof src.borders === 'object' ? src.borders : {};

    const widthPx = toPositiveNumber(image.widthPx, 1);
    const heightPx = toPositiveNumber(image.heightPx, 1);
    const cols = Math.max(1, toPositiveNumber(grid.cols, 4) | 0);
    const rows = Math.max(1, toPositiveNumber(grid.rows, 4) | 0);
    const hasAlpha = !!image.hasAlpha;
    const channels = hasAlpha ? 'rgba' : 'rgb';

    const edgeInsetPx = normalizeEdgeInsetPx(borders.edgeInsetPx);
    const gutterPx = normalizeGutterPx(borders.gutterPx);
    const businessTypes = normalizeBusinessTypes(type, src.businessTypes);
    const windows = makeWindowEntries({
        type,
        businessTypes,
        cols,
        rows,
        widthPx,
        heightPx,
        edgeInsetPx,
        gutterPx
    });

    const gridCellW = widthPx / cols;
    const gridCellH = heightPx / rows;

    return Object.freeze({
        id,
        label,
        fileName,
        url: new URL(fileName, ATLAS_BASE_URL).toString(),
        type,
        businessTypes,
        analysis: Object.freeze({
            widthPx,
            heightPx,
            aspect: round6(widthPx / heightPx),
            channels,
            hasAlpha
        }),
        layout: Object.freeze({
            pattern: 'grid',
            cols,
            rows,
            windowCount: cols * rows,
            gridCellWidthPx: round6(gridCellW),
            gridCellHeightPx: round6(gridCellH)
        }),
        borders: Object.freeze({
            edgeInsetPx: Object.freeze({
                left: round6(edgeInsetPx.left),
                right: round6(edgeInsetPx.right),
                top: round6(edgeInsetPx.top),
                bottom: round6(edgeInsetPx.bottom)
            }),
            gutterPx: Object.freeze({
                x: round6(gutterPx.x),
                y: round6(gutterPx.y)
            })
        }),
        windows
    });
}

