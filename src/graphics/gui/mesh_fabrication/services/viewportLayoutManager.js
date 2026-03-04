// src/graphics/gui/mesh_fabrication/services/viewportLayoutManager.js

export function resolveTileViewportCssPixels(tile, stageWidthCss, stageHeightCss, clampFn) {
    const clampValue = typeof clampFn === 'function'
        ? clampFn
        : (value, min, max) => Math.max(min, Math.min(max, value));

    const leftCss = clampValue(Math.round(Number(tile?.x) || 0), 0, stageWidthCss);
    const topCss = clampValue(Math.round(Number(tile?.y) || 0), 0, stageHeightCss);
    const rightCss = clampValue(
        Math.round(leftCss + Math.max(1, Number(tile?.width) || 1)),
        0,
        stageWidthCss
    );
    const bottomCss = clampValue(
        Math.round(topCss + Math.max(1, Number(tile?.height) || 1)),
        0,
        stageHeightCss
    );

    const x = leftCss;
    const y = stageHeightCss - bottomCss;
    const w = Math.max(1, rightCss - leftCss);
    const h = Math.max(1, bottomCss - topCss);
    return Object.freeze({ x, y, w, h });
}
