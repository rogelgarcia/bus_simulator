// Helper for building small, deterministic CityMap specs for harness scenarios.
import { createCityConfig } from '/src/app/city/CityConfig.js';

export function createHarnessCitySpec({
    seed = 'harness',
    size = 200,
    tileMeters = 2,
    mapTileSize = 24,
    roads = [],
    buildings = []
} = {}) {
    const cfg = createCityConfig({ size, tileMeters, mapTileSize, seed });
    const tileSize = cfg.map.tileSize;
    const origin = cfg.map.origin;
    const toWorld = ([x, y]) => ({ x: origin.x + (x | 0) * tileSize, z: origin.z + (y | 0) * tileSize });

    return {
        version: 1,
        seed: cfg.seed,
        width: cfg.map.width,
        height: cfg.map.height,
        tileSize: cfg.map.tileSize,
        origin: cfg.map.origin,
        roads: roads.map((road, idx) => ({
            points: [toWorld(road.a), toWorld(road.b)],
            lanesF: Number.isFinite(road.lanesF) ? road.lanesF : 2,
            lanesB: Number.isFinite(road.lanesB) ? road.lanesB : 2,
            tag: road.tag ?? `road_${idx}`
        })),
        buildings: Array.isArray(buildings) ? buildings : []
    };
}

