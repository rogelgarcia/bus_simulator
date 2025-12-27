// graphics/assets3d/generators/RoadGenerator.js
import * as THREE from 'three';
import { TILE, AXIS, DIR } from '../../../src/city/CityMap.js';
import {
    ROAD_DEFAULTS,
    GROUND_DEFAULTS,
    CORNER_COLOR_PALETTE,
    ASPHALT_COLOR_PALETTE,
    DEBUG_ASPHALT,
    DEBUG_HIDE_CURBS_AND_SIDEWALKS,
    DEBUG_DISABLE_MARKINGS_IN_ASPHALT_DEBUG
} from './GeneratorParams.js';
import { clamp, deepMerge } from './internal_road/RoadMath.js';
import { createAsphaltBuilder } from './internal_road/AsphaltBuilder.js';
import { createSidewalkBuilder } from './internal_road/SidewalkBuilder.js';
import { createCurbBuilder } from './internal_road/CurbBuilder.js';
import { createMarkingsBuilder } from './internal_road/MarkingsBuilder.js';
import { processRoadTile } from './internal_road/RoadTileLogic.js';

export function generateRoads({ map, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const ts = map.tileSize;

    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const groundCfg = deepMerge(GROUND_DEFAULTS, config?.ground ?? {});

    const roadY = roadCfg.surfaceY ?? 0.02;
    const laneWidth = roadCfg.laneWidth ?? 3.2;
    const shoulder = roadCfg.shoulder ?? 0.35;

    const sidewalkExtra = roadCfg.sidewalk?.extraWidth ?? 0.0;
    const sidewalkLift = roadCfg.sidewalk?.lift ?? 0.001;
    const sidewalkInset = roadCfg.sidewalk?.inset ?? 0.06;
    const curbCornerRadius = roadCfg.sidewalk?.cornerRadius ?? 1.4;

    const curbT = roadCfg.curb?.thickness ?? 0.32;
    const curbHeight = roadCfg.curb?.height ?? 0.17;
    const curbExtra = roadCfg.curb?.extraHeight ?? 0.0;
    const curbSink = roadCfg.curb?.sink ?? 0.03;

    const curbJoinOverlap = clamp(roadCfg.curb?.joinOverlap ?? curbT * 0.75, 0.0, curbT * 2.5);

    const groundY = groundCfg.surfaceY ?? (roadY + curbHeight);

    const curbTop = groundY + curbExtra;
    const curbBottom = roadY - curbSink;
    const curbH = Math.max(0.04, curbTop - curbBottom);
    const curbY = (curbTop + curbBottom) * 0.5;

    const markLineW = roadCfg.markings?.lineWidth ?? 0.12;
    const markEdgeInset = roadCfg.markings?.edgeInset ?? 0.22;
    const markLift = roadCfg.markings?.lift ?? 0.003;
    const markY = roadY + markLift;

    const turnRadiusPref = roadCfg.curves?.turnRadius ?? 4.2;
    const asphaltArcSegs = clamp(roadCfg.curves?.asphaltArcSegments ?? 32, 12, 96) | 0;
    const curbArcSegs = clamp(roadCfg.curves?.curbArcSegments ?? 18, 8, 96) | 0;

    const roadMatBase = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
    const sidewalkMatBase = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 1.0 });
    const curbMatBase = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });

    const laneWhiteMat = materials?.laneWhite ?? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
    const laneYellowMat = materials?.laneYellow ?? new THREE.MeshStandardMaterial({ color: 0xf2d34f, roughness: 0.35 });

    const asphaltDebug = DEBUG_ASPHALT && ASPHALT_COLOR_PALETTE?.kind === 'debug';
    const asphaltMat = asphaltDebug
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : roadMatBase;

    if (asphaltDebug && asphaltMat) asphaltMat.toneMapped = false;

    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const roadCount = map.countRoadTiles();

    const asphalt = createAsphaltBuilder({
        planeGeo,
        material: asphaltMat,
        palette: ASPHALT_COLOR_PALETTE,
        capacity: Math.max(1, roadCount * 8),
        name: 'Asphalt'
    });

    const hideCurbSidewalk = asphaltDebug && DEBUG_HIDE_CURBS_AND_SIDEWALKS;
    const disableMarkings = asphaltDebug && DEBUG_DISABLE_MARKINGS_IN_ASPHALT_DEBUG;

    const sidewalk = hideCurbSidewalk
        ? null
        : createSidewalkBuilder({
            planeGeo,
            instancedMaterial: CORNER_COLOR_PALETTE.instancedMaterial(sidewalkMatBase, 'sidewalk'),
            baseMaterial: sidewalkMatBase,
            palette: CORNER_COLOR_PALETTE,
            capacity: Math.max(1, roadCount * 12),
            name: 'Sidewalk'
        });

    const curb = hideCurbSidewalk
        ? null
        : createCurbBuilder({
            boxGeo,
            instancedMaterial: CORNER_COLOR_PALETTE.instancedMaterial(curbMatBase, 'curb'),
            baseMaterial: curbMatBase,
            palette: CORNER_COLOR_PALETTE,
            capacity: Math.max(1, roadCount * 84),
            curbT,
            curbH,
            curbBottom,
            name: 'CurbBlocks'
        });

    const markings = disableMarkings
        ? null
        : createMarkingsBuilder({
            planeGeo,
            whiteMaterial: laneWhiteMat,
            yellowMaterial: laneYellowMat,
            whiteCapacity: Math.max(1, roadCount * 10),
            yellowCapacity: Math.max(1, roadCount * 8)
        });

    const ctx = {
        ts,
        AXIS,
        DIR,
        asphalt,
        sidewalk,
        curb,
        markings,
        palette: CORNER_COLOR_PALETTE,
        asphaltPalette: ASPHALT_COLOR_PALETTE,
        debugAsphaltOnly: hideCurbSidewalk,
        roadY,
        laneWidth,
        shoulder,
        sidewalkExtra,
        sidewalkLift,
        sidewalkInset,
        curbCornerRadius,
        curbT,
        curbH,
        curbY,
        curbJoinOverlap,
        groundY,
        markLineW,
        markEdgeInset,
        markY,
        turnRadiusPref,
        asphaltArcSegs,
        curbArcSegs
    };

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] !== TILE.ROAD) continue;

            const pos = map.tileToWorldCenter(x, y);
            const lanes = map.getLanesAtIndex(idx);

            const axis = map.axis[idx];
            const connMask = map.conn[idx] ?? 0;

            processRoadTile({ pos, lanes, axis, connMask, ctx });
        }
    }

    asphalt.finalize();
    group.add(asphalt.mesh);

    if (sidewalk) {
        sidewalk.finalize();
        group.add(sidewalk.mesh);
        for (const m of sidewalk.buildCurveMeshes()) group.add(m);
    }

    if (curb) {
        curb.finalize();
        group.add(curb.mesh);
        for (const m of curb.buildCurveMeshes()) group.add(m);
    }

    let markingsWhite = null;
    let markingsYellow = null;

    if (markings) {
        ({ markingsWhite, markingsYellow } = markings);
        markings.finalize();
        group.add(markingsWhite);
        group.add(markingsYellow);
    }

    return {
        group,
        asphalt: asphalt.mesh,
        sidewalk: sidewalk?.mesh ?? null,
        curbBlocks: curb?.mesh ?? null,
        markingsWhite,
        markingsYellow
    };
}
