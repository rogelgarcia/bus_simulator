// tests/road_connection_debugger.test.js
import { CityMap } from '../src/app/city/CityMap.js';
import { createCityConfig } from '../src/app/city/CityConfig.js';
import { createGeneratorConfig } from '../src/graphics/assets3d/generators/GeneratorParams.js';
import { generateRoads } from '../src/graphics/assets3d/generators/RoadGenerator.js';

const MAX_RADIUS = 270;
const TANGENT_DOT_MIN = 0.92;
const OUTWARD_DOT_MIN = 0.02;
const ROAD_DIR_DOT_MIN = 0.7;

const ALLOWED_DUBINS_TYPES = new Set(['LSL', 'RSR']);

const SCENARIOS = [
    {
        id: 'city_map',
        name: 'City map'
    }
];

const getRoadPoint = (point) => {
    if (Array.isArray(point)) return { x: point[0], y: point[1] };
    const x = point?.x;
    const y = point?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
};

const buildScenario = (scenario) => {
    const tileSize = scenario.tileSize ?? 24;
    const size = scenario.size ?? 400;
    const cityConfig = createCityConfig({
        size,
        tileMeters: tileSize,
        mapTileSize: tileSize,
        seed: scenario.id ?? 'road-debug'
    });
    const spec = CityMap.demoSpec(cityConfig);
    const map = CityMap.fromSpec(spec, cityConfig);
    const generatorConfig = createGeneratorConfig();
    const output = generateRoads({ map, config: generatorConfig, materials: {} });
    return { map, output, scenario, generatorConfig, cityConfig };
};

const buildRoadDirs = (map) => {
    const dirs = new Map();
    for (const road of map.roadSegments ?? []) {
        if (!road) continue;
        const a = getRoadPoint(road.a);
        const b = getRoadPoint(road.b);
        if (!a || !b) continue;
        const start = map.tileToWorldCenter(a.x, a.y);
        const end = map.tileToWorldCenter(b.x, b.y);
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const len = Math.hypot(dx, dz);
        if (!(len > 0)) continue;
        dirs.set(road.id, { x: dx / len, z: dz / len });
    }
    return dirs;
};

const polePosition = (pole) => {
    if (!pole) return null;
    const x = pole.x;
    const z = Number.isFinite(pole.z) ? pole.z : pole.y;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x, z };
};

const poleTile = (map, pole) => {
    const pos = polePosition(pole?.collision ?? pole);
    if (!pos) return null;
    const tile = map.worldToTile(pos.x, pos.z);
    if (!tile) return null;
    return { x: tile.x, y: tile.y };
};

const poleTileKey = (map, pole) => {
    const tile = poleTile(map, pole);
    if (!tile) return null;
    return `${tile.x},${tile.y}`;
};

const connectorTileKey = (map, record) => {
    const a = poleTileKey(map, record?.p0);
    const b = poleTileKey(map, record?.p1);
    if (a && b && a === b) return a;
    return a ?? b;
};

const tileKeyFromIndex = (map, idx) => {
    const w = map?.width ?? 0;
    if (!Number.isFinite(w) || w <= 0) return null;
    const x = idx % w;
    const y = Math.floor(idx / w);
    return `${x},${y}`;
};

const classifyFlow = (pole, dir, roadDirs) => {
    if (!pole || !dir) return null;
    const flow = pole.flow;
    if (flow === 'enter' || flow === 'exit') return flow;
    const roadDir = roadDirs.get(pole.roadId);
    if (!roadDir) return null;
    const dot = dir.x * roadDir.x + dir.z * roadDir.z;
    if (!Number.isFinite(dot) || Math.abs(dot) < ROAD_DIR_DOT_MIN) return null;
    return dot >= 0 ? 'exit' : 'enter';
};

const validateConnections = ({ map, output }) => {
    const issues = [];
    const connectors = Array.isArray(output?.curbConnectors) ? output.curbConnectors : [];
    const roadDirs = buildRoadDirs(map);
    const poleConnections = new Map();
    const connectorTiles = new Map();
    const connectorRoadsByTile = new Map();

    const addIssue = (kind, detail, record, pole, connectorIndex) => {
        issues.push({
            kind,
            detail,
            tileKey: pole ? poleTileKey(map, pole) : connectorTileKey(map, record),
            roadId: pole?.roadId ?? record?.roadId ?? null,
            otherRoadId: pole?.otherRoadId ?? record?.otherRoadId ?? null,
            connectorIndex: Number.isFinite(connectorIndex) ? connectorIndex : null
        });
    };
    const addTileIssue = (kind, detail, tileKey, roadCount, connectorCount) => {
        issues.push({
            kind,
            detail,
            tileKey,
            roadCount,
            connectorCount
        });
    };

    const registerPole = (pole, connectorIndex) => {
        if (!pole) return;
        let list = poleConnections.get(pole);
        if (!list) {
            list = [];
            poleConnections.set(pole, list);
        }
        list.push(connectorIndex);
    };
    const registerConnectorTile = (tileKey, connectorIndex, roadIds) => {
        if (!tileKey) return;
        let entry = connectorTiles.get(tileKey);
        if (!entry) {
            entry = new Set();
            connectorTiles.set(tileKey, entry);
        }
        entry.add(connectorIndex);
        let roadSet = connectorRoadsByTile.get(tileKey);
        if (!roadSet) {
            roadSet = new Set();
            connectorRoadsByTile.set(tileKey, roadSet);
        }
        for (const id of roadIds) {
            if (id != null) roadSet.add(id);
        }
    };

    for (let i = 0; i < connectors.length; i++) {
        const record = connectors[i];
        const p0 = record?.p0 ?? null;
        const p1 = record?.p1 ?? null;
        if (!p0 || !p1) {
            if (record?.tag !== 'end') {
                addIssue('missing-pole', 'Connector missing pole', record, p0 ?? p1, i);
            }
            continue;
        }
        registerPole(p0, i);
        registerPole(p1, i);
        const tileKeys = new Set();
        const tile0 = poleTileKey(map, p0);
        const tile1 = poleTileKey(map, p1);
        if (tile0) tileKeys.add(tile0);
        if (tile1) tileKeys.add(tile1);
        for (const key of tileKeys) {
            registerConnectorTile(key, i, [p0?.roadId, p1?.roadId]);
        }

        if (p0 === p1) addIssue('same-pole', 'Connector uses same pole for both ends', record, p0, i);
        if (p0.roadId == null || p1.roadId == null) addIssue('missing-road-id', 'Pole missing roadId', record, p0.roadId == null ? p0 : p1, i);
        if (p0.roadId === p1.roadId) addIssue('same-road', 'Connector connects poles from same road', record, p0, i);

        const connector = record?.connector ?? null;
        if (!connector || !connector.ok) {
            addIssue('connector-invalid', 'Connector path missing or invalid', record, p0, i);
        } else {
            if (connector.type && !ALLOWED_DUBINS_TYPES.has(connector.type)) {
                addIssue('dubins-type', `Unsupported dubins type ${connector.type}`, record, p0, i);
            }
            const radius = connector.radius;
            if (Number.isFinite(radius) && radius > MAX_RADIUS) {
                addIssue('radius-limit', `Radius ${radius.toFixed(2)} exceeds limit`, record, p0, i);
            }
            for (const segment of connector.segments ?? []) {
                const segRadius = segment?.radius;
                if (Number.isFinite(segRadius) && segRadius > MAX_RADIUS) {
                    addIssue('segment-radius-limit', `Segment radius ${segRadius.toFixed(2)} exceeds limit`, record, p0, i);
                }
            }
            const metrics = connector.metrics ?? null;
            if (metrics) {
                if (Number.isFinite(metrics.tangencyDotAtJoin0) && metrics.tangencyDotAtJoin0 < TANGENT_DOT_MIN) {
                    addIssue('tangent-join', `Tangency dot join0 ${metrics.tangencyDotAtJoin0.toFixed(3)}`, record, p0, i);
                }
                if (Number.isFinite(metrics.tangencyDotAtJoin1) && metrics.tangencyDotAtJoin1 < TANGENT_DOT_MIN) {
                    addIssue('tangent-join', `Tangency dot join1 ${metrics.tangencyDotAtJoin1.toFixed(3)}`, record, p1, i);
                }
            }
        }

        const dir0 = record?.dir0 ?? null;
        const dir1 = record?.dir1 ?? null;
        if (!dir0 || !Number.isFinite(dir0.x) || !Number.isFinite(dir0.z)) {
            addIssue('missing-dir', 'Connector missing dir0', record, p0, i);
        }
        if (!dir1 || !Number.isFinite(dir1.x) || !Number.isFinite(dir1.z)) {
            addIssue('missing-dir', 'Connector missing dir1', record, p1, i);
        }
        const roadDir0 = roadDirs.get(p0.roadId);
        const roadDir1 = roadDirs.get(p1.roadId);
        if (dir0 && roadDir0) {
            const dot0 = dir0.x * roadDir0.x + dir0.z * roadDir0.z;
            if (Math.abs(dot0) < ROAD_DIR_DOT_MIN) {
                addIssue('tangent-off-axis', `P0 dir off axis (${dot0.toFixed(3)})`, record, p0, i);
            }
        }
        if (dir1 && roadDir1) {
            const dot1 = dir1.x * roadDir1.x + dir1.z * roadDir1.z;
            if (Math.abs(dot1) < ROAD_DIR_DOT_MIN) {
                addIssue('tangent-off-axis', `P1 dir off axis (${dot1.toFixed(3)})`, record, p1, i);
            }
        }

        if (record?.p0?.arrowRole === 'p1' || record?.p1?.arrowRole === 'p0') {
            addIssue('p0p1-mismatch', 'Pole arrowRole does not match P0/P1', record, p0, i);
        }

        const flow0 = classifyFlow(p0, dir0, roadDirs);
        const flow1 = classifyFlow(p1, dir1, roadDirs);
        const loopKey0 = p0?.loopKey ?? null;
        const loopKey1 = p1?.loopKey ?? null;
        const sameLoop = loopKey0 && loopKey1 && loopKey0 === loopKey1;
        if (flow0 && flow1 && flow0 === flow1 && !sameLoop) {
            addIssue('tangent-flow', `Both poles marked ${flow0}`, record, p0, i);
        }

        const tileA = poleTile(map, p0);
        const tileB = poleTile(map, p1);
        if (tileA && tileB && tileA.x === tileB.x && tileA.y === tileB.y) {
            const idx = map.index(tileA.x, tileA.y);
            if (map.roadIntersections?.[idx]) {
                const center = map.tileToWorldCenter(tileA.x, tileA.y);
                const pos0 = polePosition(p0);
                const pos1 = polePosition(p1);
                if (pos0 && dir0) {
                    const dot0 = (pos0.x - center.x) * dir0.x + (pos0.z - center.z) * dir0.z;
                    if (dot0 <= OUTWARD_DOT_MIN) {
                        addIssue('tangent-inward', `P0 dir points inward (${dot0.toFixed(3)})`, record, p0, i);
                    }
                }
                if (pos1 && dir1) {
                    const dot1 = (pos1.x - center.x) * dir1.x + (pos1.z - center.z) * dir1.z;
                    if (dot1 <= OUTWARD_DOT_MIN) {
                        addIssue('tangent-inward', `P1 dir points inward (${dot1.toFixed(3)})`, record, p1, i);
                    }
                }
            }
        }
    }

    for (const [pole, list] of poleConnections) {
        if (list.length > 2) {
            addIssue('pole-connection-count', `Pole has ${list.length} connections`, null, pole, null);
        }
    }

    if (Array.isArray(map?.roadIds)) {
        for (let idx = 0; idx < map.roadIds.length; idx++) {
            const ids = map.roadIds[idx];
            if (!ids || ids.size < 3) continue;
            const tileKey = tileKeyFromIndex(map, idx);
            const connectorSet = tileKey ? connectorTiles.get(tileKey) : null;
            const connectorCount = connectorSet ? connectorSet.size : 0;
            const roadCount = ids.size;
            if (connectorCount < roadCount) {
                addTileIssue('intersection-connectors', `Connectors ${connectorCount} < roads ${roadCount}`, tileKey, roadCount, connectorCount);
            }
            const connectorRoads = tileKey ? connectorRoadsByTile.get(tileKey) : null;
            if (connectorRoads && connectorRoads.size < roadCount) {
                addTileIssue('intersection-missing-road', `Connector roads ${connectorRoads.size} < roads ${roadCount}`, tileKey, roadCount, connectorRoads.size);
            }
        }
    }

    return {
        issues,
        connectorCount: connectors.length,
        poleCount: poleConnections.size
    };
};

const runScenario = (scenario) => {
    const { map, output } = buildScenario(scenario);
    const report = validateConnections({ map, output });
    return { scenario, report };
};

const formatIssues = (issues) => {
    const parts = [];
    for (let i = 0; i < issues.length && i < 6; i++) {
        const issue = issues[i];
        const tile = issue?.tileKey ?? '--';
        const kind = issue?.kind ?? 'issue';
        const detail = issue?.detail ?? '';
        parts.push(`${kind}@${tile}${detail ? `:${detail}` : ''}`);
    }
    return parts.join('; ');
};

export function runRoadConnectionDebuggerTests({ test, assertTrue }) {
    for (const scenario of SCENARIOS) {
        test(`Road debugger: ${scenario.name}`, () => {
            const result = runScenario(scenario);
            const issues = result.report.issues ?? [];
            assertTrue(Array.isArray(issues), 'Issues array missing');
            const focusTile = scenario.focusTile ?? null;
            if (focusTile && issues.length) {
                const hasTile = issues.some((issue) => issue?.tileKey === focusTile);
                if (!hasTile) {
                    console.warn(`Road debugger warning: Issues not in focus tile ${focusTile}: ${formatIssues(issues)}`);
                }
            }
            if (issues.length) {
                console.warn(`Road debugger warning: Issues found (${issues.length}): ${formatIssues(issues)}`);
            }
        });
    }

    if (typeof window !== 'undefined') {
        window.__roadConnectionDebug = {
            scenarios: SCENARIOS,
            runScenario,
            validateConnections
        };
    }
}
