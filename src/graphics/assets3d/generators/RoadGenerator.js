// src/graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { ROAD_DEFAULTS, DEBUG_ASPHALT, CURB_COLOR_PALETTE, createAsphaltPalette } from './GeneratorParams.js';
import { deepMerge } from './road/math/RoadMath.js';
import { createAsphaltBuilder } from './road/builders/AsphaltBuilder.js';
import { createCurbBuilder } from './road/builders/CurbBuilder.js';
import { createMarkingsBuilder } from './road/builders/MarkingsBuilder.js';
import { addConnectorCurbSegments } from './road/connectors/ConnectorCurbUtils.js';
import { renderSidewalksFromCurbs } from './road/render/RoadSidewalkRenderer.js';
import {
    ASPHALT_CAPACITY_PER_TILE,
    COLLISION_DEDUP_EPS,
    CURB_BOXES_PER_TILE,
    DASH_GAP_FACTOR,
    DASH_GAP_MIN,
    DASH_LEN_FACTOR,
    DASH_LEN_MIN,
    DEFAULT_CURB_COLOR_HEX,
    DEFAULT_CURB_ROUGHNESS,
    DEFAULT_ROAD_COLOR_HEX,
    DEFAULT_ROAD_ROUGHNESS,
    EPS,
    GEOMETRY_UNIT,
    HALF,
    LANE_MARK_ROUGHNESS,
    LANE_WHITE_COLOR_HEX,
    LANE_YELLOW_COLOR_HEX,
    MARKINGS_WHITE_PER_TILE,
    MARKINGS_YELLOW_PER_TILE,
    MIN_CAPACITY,
    PLANE_SEGMENTS,
    POLES_PER_TILE,
    POLE_DOT_COLOR_HEX,
    POLE_DOT_HEIGHT_FACTOR,
    POLE_DOT_HEIGHT_MIN,
    POLE_DOT_RADIUS_FACTOR,
    POLE_DOT_RADIUS_MIN,
    POLE_DOT_SCALE,
    POLE_DOT_SEGMENTS,
    ROAD_SURFACE_LIFT
} from './road/RoadConstants.js';
import { angleIndex, normalizeDir } from './road/math/RoadAngleUtils.js';
import { roadWidth } from './road/geometry/RoadGeometryCalc.js';
import { centerlineExtent, endPoleTrimForTile, tileKey, trimForRoad } from './road/math/RoadTileUtils.js';
import {
    assignConnectionPoleFlows,
    createPoleManager,
    detectCollisionPoles,
    initializeRoadPoles
} from './road/poles/RoadPoleManager.js';
import { buildCurbConnectors, createConnectorSolver } from './road/connectors/RoadConnectorSolver.js';
import { linkRoadPoles } from './road/poles/RoadPoleLinking.js';
import { renderStraightRoads } from './road/render/RoadRenderData.js';
import { renderCurveConnectors } from './road/render/RoadCurveRenderer.js';
import { renderIntersectionPolygons } from './road/render/RoadIntersectionPolygon.js';
import { generateRoadsFromRoadNetwork } from './road2/CenterlineRoadGenerator.js';

function generateRoadsLegacy({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';
    const curbConnectors = [];
    const collisionMarkers = [];
    const roadPoles = new Map();
    const connectionPolesByCollision = new Map();
    const connectorPairs = new Set();

    if (!map) {
        return {
            group,
            asphalt: null,
            sidewalk: null,
            curbBlocks: null,
            markingsWhite: null,
            markingsYellow: null,
            curbConnectors,
            collisionMarkers
        };
    }

    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const ts = map.tileSize;

    const baseRoadY = roadCfg.surfaceY ?? ROAD_DEFAULTS.surfaceY;
    const laneWidth = roadCfg.laneWidth ?? ROAD_DEFAULTS.laneWidth;
    const turnRadius = roadCfg.curves?.turnRadius ?? ROAD_DEFAULTS.curves.turnRadius;
    const asphaltArcSegs = roadCfg.curves?.asphaltArcSegments ?? ROAD_DEFAULTS.curves.asphaltArcSegments;
    const curbArcSegs = roadCfg.curves?.curbArcSegments ?? ROAD_DEFAULTS.curves.curbArcSegments;
    const shoulder = roadCfg.shoulder ?? ROAD_DEFAULTS.shoulder;
    const curbT = roadCfg.curb?.thickness ?? ROAD_DEFAULTS.curb.thickness;
    const curbHeight = roadCfg.curb?.height ?? ROAD_DEFAULTS.curb.height;
    const curbExtra = roadCfg.curb?.extraHeight ?? ROAD_DEFAULTS.curb.extraHeight;
    const curbSink = roadCfg.curb?.sink ?? ROAD_DEFAULTS.curb.sink;
    const sidewalkWidth = roadCfg.sidewalk?.extraWidth ?? ROAD_DEFAULTS.sidewalk.extraWidth;
    const sidewalkLift = roadCfg.sidewalk?.lift ?? ROAD_DEFAULTS.sidewalk.lift;
    const groundY = config?.ground?.surfaceY ?? (baseRoadY + curbHeight);
    const roadY = baseRoadY;
    const markLineW = roadCfg.markings?.lineWidth ?? ROAD_DEFAULTS.markings.lineWidth;
    const markEdgeInset = roadCfg.markings?.edgeInset ?? ROAD_DEFAULTS.markings.edgeInset;
    const markLift = roadCfg.markings?.lift ?? ROAD_DEFAULTS.markings.lift;
    const markY = roadY + markLift;
    const curveSampleStep = Math.max(0.25, (Math.PI * turnRadius) / Math.max(8, asphaltArcSegs));
    const curbBottom = roadY - curbSink;
    const curbTop = roadY + curbHeight + curbExtra;
    const curbH = Math.max(EPS, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * HALF;
    const sidewalkY = curbTop + (Number.isFinite(sidewalkLift) ? sidewalkLift : 0);

    const roadMatBase = materials?.road ?? new THREE.MeshStandardMaterial({ color: DEFAULT_ROAD_COLOR_HEX, roughness: DEFAULT_ROAD_ROUGHNESS });
    const sidewalkMatBase = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 1.0 });
    const curbMatBase = materials?.curb ?? new THREE.MeshStandardMaterial({ color: DEFAULT_CURB_COLOR_HEX, roughness: DEFAULT_CURB_ROUGHNESS });
    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: LANE_WHITE_COLOR_HEX, roughness: LANE_MARK_ROUGHNESS });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: LANE_YELLOW_COLOR_HEX, roughness: LANE_MARK_ROUGHNESS });
    const modeSetting = config?.render?.roadMode ?? null;
    const debugEnabled = modeSetting ? modeSetting === 'debug' : DEBUG_ASPHALT;
    const asphaltPalette = createAsphaltPalette(debugEnabled ? 'debug' : 'regular');
    const asphaltDebug = debugEnabled && asphaltPalette?.kind === 'debug';
    const asphaltMat = asphaltDebug
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : roadMatBase;

    if (asphaltMat) {
        asphaltMat.side = THREE.DoubleSide;
        asphaltMat.polygonOffset = true;
        asphaltMat.polygonOffsetFactor = -1;
        asphaltMat.polygonOffsetUnits = -1;
    }
    if (asphaltDebug && asphaltMat) asphaltMat.toneMapped = false;
    if (sidewalkMatBase) sidewalkMatBase.side = THREE.DoubleSide;

    const planeGeo = new THREE.PlaneGeometry(GEOMETRY_UNIT, GEOMETRY_UNIT, PLANE_SEGMENTS, PLANE_SEGMENTS);
    planeGeo.rotateX(-Math.PI / 2);
    const boxGeo = new THREE.BoxGeometry(GEOMETRY_UNIT, GEOMETRY_UNIT, GEOMETRY_UNIT);

    const roadCount = map.countRoadTiles();
    const asphalt = createAsphaltBuilder({
        planeGeo,
        material: asphaltMat,
        palette: asphaltPalette,
        capacity: Math.max(MIN_CAPACITY, roadCount * ASPHALT_CAPACITY_PER_TILE),
        name: 'Asphalt'
    });

    const sidewalk = (Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS)
        ? createAsphaltBuilder({
            planeGeo,
            material: sidewalkMatBase,
            palette: null,
            capacity: Math.max(MIN_CAPACITY, roadCount),
            name: 'Sidewalk'
        })
        : null;

    const markings = createMarkingsBuilder({
        planeGeo,
        whiteMaterial: laneWhiteMat,
        yellowMaterial: laneYellowMat,
        whiteCapacity: Math.max(MIN_CAPACITY, roadCount * MARKINGS_WHITE_PER_TILE),
        yellowCapacity: Math.max(MIN_CAPACITY, roadCount * MARKINGS_YELLOW_PER_TILE)
    });

    const curb = createCurbBuilder({
        boxGeo,
        instancedMaterial: CURB_COLOR_PALETTE.instancedMaterial(curbMatBase, 'curb'),
        baseMaterial: curbMatBase,
        palette: CURB_COLOR_PALETTE,
        capacity: Math.max(MIN_CAPACITY, roadCount * CURB_BOXES_PER_TILE),
        curbT,
        curbH,
        curbBottom,
        name: 'CurbBlocks'
    });

    const roads = Array.isArray(map.roadSegments) ? map.roadSegments.filter(Boolean) : [];
    let minRoadHalfWidth = Infinity;
    const tmpColor = new THREE.Color();
    const neutralCurbColor = curbMatBase?.color?.getHex?.() ?? DEFAULT_CURB_COLOR_HEX;
    const poleDotRadius = Math.max(POLE_DOT_RADIUS_MIN, curbT * POLE_DOT_RADIUS_FACTOR * POLE_DOT_SCALE);
    const poleDotHeight = Math.max(POLE_DOT_HEIGHT_MIN, curbH * POLE_DOT_HEIGHT_FACTOR * POLE_DOT_SCALE);
    const poleDotY = roadY - poleDotHeight * HALF;
    const poleDotGeo = asphaltDebug ? new THREE.CylinderGeometry(poleDotRadius, poleDotRadius, poleDotHeight, POLE_DOT_SEGMENTS, 1) : null;
    const poleDotMat = asphaltDebug ? new THREE.MeshBasicMaterial({ color: POLE_DOT_COLOR_HEX }) : null;
    const poleDots = (asphaltDebug && poleDotGeo && poleDotMat)
        ? new THREE.InstancedMesh(poleDotGeo, poleDotMat, Math.max(MIN_CAPACITY, roadCount * POLES_PER_TILE))
        : null;
    const poleCapacity = poleDots?.count ?? 0;
    const poleDummy = poleDots ? new THREE.Object3D() : null;
    let poleCount = 0;
    let roadIndex = 0;
    const dedupDistSq = COLLISION_DEDUP_EPS * COLLISION_DEDUP_EPS;
    let poleId = 0;
    const nextPoleId = () => poleId++;
    const collisionIdRef = { value: 0 };

    const addPoleDot = (p) => {
        if (!poleDots || !poleDummy) return;
        if (poleCount >= poleCapacity) return;
        poleDummy.position.set(p.x, poleDotY, p.y);
        poleDummy.updateMatrix();
        poleDots.setMatrixAt(poleCount, poleDummy.matrix);
        poleCount += 1;
    };

    const roadData = [];
    for (const road of roads) {
        const roadIdFallback = roadIndex;
        roadIndex += 1;
        const tiles = Array.isArray(road.tiles) ? road.tiles : [];
        if (!tiles.length) continue;

        const rawDir = normalizeDir(road.b.x - road.a.x, road.b.y - road.a.y);
        if (!rawDir) continue;

        const angleForColor = Number.isFinite(road.angle)
            ? road.angle
            : Math.atan2(rawDir.y, rawDir.x);
        const angleIdx = angleIndex(angleForColor);
        const width = roadWidth(road.lanesF, road.lanesB, laneWidth, shoulder, ts);
        const halfWidth = width * HALF;
        if (Number.isFinite(halfWidth) && halfWidth < minRoadHalfWidth) minRoadHalfWidth = halfWidth;

        const dir = rawDir;
        const normal = { x: -dir.y, y: dir.x };
        const curbOffset = halfWidth + curbT * HALF;
        const heading = Math.atan2(-dir.y, dir.x);
        const dashLen = Math.max(DASH_LEN_MIN, laneWidth * DASH_LEN_FACTOR);
        const dashGap = Math.max(DASH_GAP_MIN, laneWidth * DASH_GAP_FACTOR);
        const twoWay = road.lanesF > 0 && road.lanesB > 0;
        const totalLanes = (road.lanesF ?? 0) + (road.lanesB ?? 0);
        const halfTile = ts * HALF;
        const spanInset = centerlineExtent(halfTile, halfWidth, dir, normal);

        const startTile = tiles[0];
        const endTile = tiles[tiles.length - 1];
        const startCenterRaw = map.tileToWorldCenter(startTile.x, startTile.y);
        const endCenterRaw = map.tileToWorldCenter(endTile.x, endTile.y);
        const startCenter = { x: startCenterRaw.x, y: startCenterRaw.z };
        const endCenter = { x: endCenterRaw.x, y: endCenterRaw.z };
        const rawStart = {
            x: startCenter.x - dir.x * spanInset,
            y: startCenter.y - dir.y * spanInset
        };
        const rawEnd = {
            x: endCenter.x + dir.x * spanInset,
            y: endCenter.y + dir.y * spanInset
        };
        const length = Math.hypot(rawEnd.x - rawStart.x, rawEnd.y - rawStart.y);
        const startKey = tileKey(startTile);
        const endKey = tileKey(endTile);

        roadData.push({
            road,
            roadId: road.id ?? roadIdFallback,
            dir,
            normal,
            halfWidth,
            curbOffset,
            angleIdx,
            heading,
            dashLen,
            dashGap,
            twoWay,
            totalLanes,
            lanesF: road.lanesF ?? 0,
            lanesB: road.lanesB ?? 0,
            startTile,
            endTile,
            startCenter,
            endCenter,
            startKey,
            endKey,
            rawStart,
            rawEnd,
            length,
            boundaryHalf: halfWidth + curbT
        });
    }

    const roadById = new Map();
    for (const data of roadData) roadById.set(data.roadId, data);
    const poleManager = createPoleManager({
        roadPoles,
        connectionPolesByCollision,
        dedupDistSq,
        minRoadHalfWidth,
        nextPoleId
    });

    const endTileRoads = new Map();
    const registerEndTile = (key, roadId) => {
        if (!key) return;
        let set = endTileRoads.get(key);
        if (!set) {
            set = new Set();
            endTileRoads.set(key, set);
        }
        set.add(roadId);
    };
    for (const data of roadData) {
        registerEndTile(data.startKey, data.roadId);
        registerEndTile(data.endKey, data.roadId);
    }
    const endTileHalf = ts * HALF;
    for (const data of roadData) {
        const startSet = data.startKey ? endTileRoads.get(data.startKey) : null;
        const endSet = data.endKey ? endTileRoads.get(data.endKey) : null;
        data.sharedStartRoadIds = startSet ? Array.from(startSet).filter((id) => id !== data.roadId) : [];
        data.sharedEndRoadIds = endSet ? Array.from(endSet).filter((id) => id !== data.roadId) : [];
        let trimStart = 0;
        let trimEnd = 0;
        if (startSet && startSet.size > 1) {
            trimStart = endPoleTrimForTile(data, data.startCenter, endTileHalf, true);
        }
        if (endSet && endSet.size > 1) {
            trimEnd = endPoleTrimForTile(data, data.endCenter, endTileHalf, false);
        }
        if (trimStart > 0 || trimEnd > 0) {
            data.sharedOriginalStart = { x: data.rawStart.x, y: data.rawStart.y };
            data.sharedOriginalEnd = { x: data.rawEnd.x, y: data.rawEnd.y };
            data.sharedTrimStart = trimStart;
            data.sharedTrimEnd = trimEnd;
            const length = data.length ?? 0;
            if (length > EPS) {
                const maxTrim = Math.max(0, length - EPS);
                const totalTrim = trimStart + trimEnd;
                if (totalTrim > maxTrim && totalTrim > EPS) {
                    const scale = maxTrim / totalTrim;
                    trimStart *= scale;
                    trimEnd *= scale;
                }
                if (trimStart > 0) {
                    data.rawStart = {
                        x: data.rawStart.x + data.dir.x * trimStart,
                        y: data.rawStart.y + data.dir.y * trimStart
                    };
                }
                if (trimEnd > 0) {
                    data.rawEnd = {
                        x: data.rawEnd.x - data.dir.x * trimEnd,
                        y: data.rawEnd.y - data.dir.y * trimEnd
                    };
                }
                data.length = Math.hypot(data.rawEnd.x - data.rawStart.x, data.rawEnd.y - data.rawStart.y);
            }
        }
    }

    for (const data of roadData) {
        const trimmed = trimForRoad(data, roadData);
        if (!trimmed) continue;
        data.centerlineStart = trimmed.start;
        data.centerlineEnd = trimmed.end;
        data.length = Math.hypot(trimmed.end.x - trimmed.start.x, trimmed.end.y - trimmed.start.y);
    }
    initializeRoadPoles({ roadData, roadPoles, nextPoleId, addPoleDot });

    detectCollisionPoles({
        roadData,
        addCollisionPole: poleManager.addCollisionPole,
        addConnectionPolesForRoad: poleManager.addConnectionPolesForRoad,
        collisionMarkers,
        dedupDistSq,
        collisionIdRef
    });

    assignConnectionPoleFlows({ roadData });
    linkRoadPoles({ roadData, roadById, connectionPolesByCollision });
    const connectorSolver = createConnectorSolver({ curbT, roadById, connectorPairs });
    buildCurbConnectors({ roadData, roadById, curbConnectors, connectorSolver });

    if (curb) {
        const connectorCurbKey = CURB_COLOR_PALETTE.key('connector', 'all');
        for (const data of roadData) {
            const poles = data.road?.poles;
            if (!poles) continue;
            const allPoles = [];
            if (Array.isArray(poles.end)) allPoles.push(...poles.end);
            if (Array.isArray(poles.connection)) allPoles.push(...poles.connection);
            for (const pole of allPoles) {
                const connector = pole?.connector;
                if (!connector || !connector.ok) continue;
                addConnectorCurbSegments({
                    curb,
                    key: connectorCurbKey,
                    color: neutralCurbColor,
                    connector,
                    curveSegs: curbArcSegs,
                    curbY,
                    curbH,
                    curbT
                });
            }
        }
    }

    if (sidewalk) {
        renderSidewalksFromCurbs({
            roadData,
            roadById,
            sidewalk,
            sidewalkY,
            sidewalkWidth,
            curbT,
            arcSegs: curbArcSegs
        });
    }

    renderStraightRoads({
        roadData,
        asphalt,
        curb,
        markings,
        asphaltDebug,
        tmpColor,
        roadY,
        curbY,
        curbH,
        curbT,
        neutralCurbColor,
        laneWidth,
        markLineW,
        markEdgeInset,
        markY
    });

    renderCurveConnectors({
        curbConnectors,
        roadById,
        asphalt,
        markings,
        roadY,
        laneWidth,
        curbT,
        markLineW,
        markEdgeInset,
        markY,
        curveSampleStep,
        asphaltDebug,
        tmpColor
    });

    renderIntersectionPolygons({
        roadData,
        curbConnectors,
        roadById,
        asphalt,
        roadY,
        laneWidth,
        curveSampleStep,
        asphaltDebug,
        tmpColor
    });

    asphalt.finalize();
    group.add(asphalt.mesh);

    if (sidewalk) {
        sidewalk.finalize();
        group.add(sidewalk.mesh);
    }

    let markingsWhite = null;
    let markingsYellow = null;
    if (markings) {
        ({ markingsWhite, markingsYellow } = markings);
        markings.finalize();
        group.add(markingsWhite);
        group.add(markingsYellow);
    }

    if (curb) {
        curb.finalize();
        group.add(curb.mesh);
        for (const m of curb.buildCurveMeshes()) group.add(m);
    }

    if (poleDots) {
        poleDots.count = poleCount;
        poleDots.instanceMatrix.needsUpdate = true;
        poleDots.name = 'RoadPoleDots';
        group.add(poleDots);
    }

    return {
        group,
        asphalt: asphalt.mesh,
        sidewalk: sidewalk?.mesh ?? null,
        curbBlocks: curb?.mesh ?? null,
        markingsWhite,
        markingsYellow,
        curbConnectors,
        collisionMarkers
    };
}

export function generateRoads({ map, config, materials } = {}) {
    if (map?.roadNetwork) {
        return generateRoadsFromRoadNetwork({ network: map.roadNetwork, config, materials });
    }
    return generateRoadsLegacy({ map, config, materials });
}
