// src/city/CityConfig.js
export function createCityConfig({
                                     size = 800,
                                     tileMeters = 2,
                                     mapTileSize = 16,
                                     seed = 'city-demo'
                                 } = {}) {
    const gridW = Math.max(1, Math.floor(size / mapTileSize));
    const gridH = gridW;

    const originX = -size / 2 + mapTileSize / 2;
    const originZ = -size / 2 + mapTileSize / 2;

    return {
        size,
        tileMeters,
        seed,
        map: {
            tileSize: mapTileSize,
            width: gridW,
            height: gridH,
            origin: { x: originX, z: originZ }
        }
    };
}
