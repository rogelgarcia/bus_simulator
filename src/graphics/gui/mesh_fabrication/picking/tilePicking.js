// src/graphics/gui/mesh_fabrication/picking/tilePicking.js

export function pickTileFromFrames(tiles, clientX, clientY) {
    const tileList = Array.isArray(tiles) ? tiles : [];
    for (const tile of tileList) {
        const left = Number(tile?.screenX);
        const top = Number(tile?.screenY);
        const width = Number(tile?.screenW);
        const height = Number(tile?.screenH);
        if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
            continue;
        }
        const right = left + width;
        const bottom = top + height;
        if (clientX >= left && clientX <= right && clientY >= top && clientY <= bottom) {
            return tile;
        }
    }
    return null;
}
