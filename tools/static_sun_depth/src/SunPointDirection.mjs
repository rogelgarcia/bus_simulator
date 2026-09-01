// Converts canonical illumination sun profiles to world point directions.
// @ts-check

export function createSunPointDirectionWorld(azimuthDeg, elevationDeg) {
    if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg)) {
        throw new TypeError('sun azimuth and elevation must be finite');
    }
    const azimuth = azimuthDeg * Math.PI / 180;
    const elevation = elevationDeg * Math.PI / 180;
    const horizontal = Math.cos(elevation);
    return Object.freeze([
        Math.cos(azimuth) * horizontal,
        Math.sin(elevation),
        Math.sin(azimuth) * horizontal
    ]);
}
