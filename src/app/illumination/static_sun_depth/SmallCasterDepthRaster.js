// Rasterizes opaque static prop triangles into independent light-space depth layers.
export function rasterizeSmallCaster({ positions, bounds, size }) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = bounds;
    const scaleX = size / (maxX - minX), scaleY = size / (maxY - minY);
    const depths = new Float32Array(size * size).fill(Infinity);
    for (let i = 0; i < positions.length; i += 9) {
        const ax = (positions[i] - minX) * scaleX, ay = (positions[i + 1] - minY) * scaleY;
        const bx = (positions[i + 3] - minX) * scaleX, by = (positions[i + 4] - minY) * scaleY;
        const cx = (positions[i + 6] - minX) * scaleX, cy = (positions[i + 7] - minY) * scaleY;
        const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(determinant) < 1e-10) continue;
        const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - .5));
        const x1 = Math.min(size - 1, Math.floor(Math.max(ax, bx, cx) - .5));
        const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - .5));
        const y1 = Math.min(size - 1, Math.floor(Math.max(ay, by, cy) - .5));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const u = ((by - cy) * (x + .5 - cx) + (cx - bx) * (y + .5 - cy)) / determinant;
            const v = ((cy - ay) * (x + .5 - cx) + (ax - cx) * (y + .5 - cy)) / determinant;
            const w = 1 - u - v;
            if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
            const depth = u * positions[i + 2] + v * positions[i + 5] + w * positions[i + 8];
            depths[y * size + x] = Math.min(depths[y * size + x], depth);
        }
    }
    const raw = new Uint8Array(size * size * 2);
    for (let i = 0; i < depths.length; i++) {
        const code = Number.isFinite(depths[i]) ? Math.round(Math.max(0, Math.min(1, (depths[i] - minZ) / (maxZ - minZ))) * 65534) : 65535;
        raw[i * 2] = code >> 8; raw[i * 2 + 1] = code & 255;
    }
    return raw;
}
