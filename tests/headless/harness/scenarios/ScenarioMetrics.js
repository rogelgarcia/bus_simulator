// Scenario metrics helpers for deterministic harness scenarios.
export function createCityMetrics(city) {
    const map = city?.map ?? null;
    const roadNetwork = map?.roadNetwork ?? null;
    return {
        map: map ? {
            width: map.width ?? null,
            height: map.height ?? null,
            tileSize: map.tileSize ?? null,
            roadTiles: typeof map.countRoadTiles === 'function' ? map.countRoadTiles() : null
        } : null,
        roadNetwork: roadNetwork ? {
            nodes: Array.isArray(roadNetwork.nodeIds) ? roadNetwork.nodeIds.length : null,
            edges: Array.isArray(roadNetwork.edgeIds) ? roadNetwork.edgeIds.length : null
        } : null
    };
}

