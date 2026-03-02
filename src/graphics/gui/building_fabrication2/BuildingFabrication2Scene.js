// src/graphics/gui/building_fabrication2/BuildingFabrication2Scene.js
// Minimal Building Fabrication 2 3D scene (map + building, no roads).
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { CityMap } from '../../../app/city/CityMap.js';
import { createGeneratorConfig } from '../../assets3d/generators/GeneratorParams.js';
import { createCityWorld } from '../../assets3d/generators/TerrainGenerator.js';
import { buildBuildingFabricationVisualParts } from '../../assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';
import { BuildingWallTextureCache } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { createProceduralMeshAsset, PROCEDURAL_MESH } from '../../content3d/catalogs/ProceduralMeshCatalog.js';
import { FirstPersonCameraController } from '../../engine3d/camera/FirstPersonCameraController.js';
import {
    buildWallDecoratorShapeSpecs,
    sanitizeWallDecoratorDebuggerState
} from '../../../app/buildings/wall_decorators/index.js';
import { createWallDecoratorGeometryFromSpec as createSharedWallDecoratorGeometryFromSpec } from '../shared/wall_decorator/WallDecoratorGeometryFactory.js';
import {
    areWallDecoratorExplodedEntriesCorniceRoundedOnly,
    areWallDecoratorExplodedEntriesCurvedRingOnly,
    buildWallDecoratorExplodedFaceEntries,
    separateWallDecoratorExplodedCorniceRoundedFaces,
    separateWallDecoratorExplodedCurvedRingFaces,
    separateWallDecoratorExplodedFacesIterative
} from '../shared/wall_decorator/WallDecoratorExplodedView.js';
import { getBeltCourseColorOptions } from '../../../app/buildings/BeltCourseColor.js';
import { resolveWallBaseTintHexFromWallBase } from '../../../app/buildings/WallBaseTintModel.js';

const DOUBLE = 2;
const EPS = 1e-6;
const BACKGROUND_COLOR = 0xeaf9ff;
const FACE_HIGHLIGHT_COLOR = 0x64d2ff;
const FACE_HIGHLIGHT_LINEWIDTH = 6;
const FACE_HIGHLIGHT_OPACITY = 0.85;
const FACE_HIGHLIGHT_Y_LIFT = 0.08;
const LAYER_HIGHLIGHT_COLOR = FACE_HIGHLIGHT_COLOR;
const LAYER_HIGHLIGHT_OPACITY = 0.28;
const BAY_HIGHLIGHT_COLOR = 0x49adff;
const BAY_HIGHLIGHT_OPACITY = 0.28;
const RULER_LINE_COLOR = 0xfff1a6;
const RULER_LINEWIDTH = 3;
const RULER_LINE_OPACITY = 0.92;
const LAYOUT_FACE_OVERLAY_OPACITY = 0.2;
const LAYOUT_FACE_OVERLAY_COLOR = 0x7ee1ff;
const LAYOUT_FACE_LINE_Y_LIFT = 0.012;
const LAYOUT_WIDTH_GUIDE_COLOR = 0xffe08f;
const LAYOUT_WIDTH_GUIDE_LINEWIDTH = 3;
const LAYOUT_WIDTH_GUIDE_OPACITY = 0.9;
const LAYOUT_WIDTH_GUIDE_Y_LIFT = 0.014;
const LAYOUT_VERTEX_RING_COLOR = 0xffdf8e;
const LAYOUT_VERTEX_RING_RADIUS = 0.4;
const LAYOUT_VERTEX_RING_TUBE = 0.06;
const SUPPORT_SLAB_OVERHANG_M = 1.0;
const SUPPORT_SLAB_THICKNESS_M = 0.5;
const SUPPORT_SLAB_MATERIAL_ID = 'pbr.plastered_wall_02';
const WALL_DECORATION_DEFAULT_WALL_DEPTH_M = 0.30;
const AWNING_ROD_MATERIAL = Object.freeze({
    colorHex: 0x454545,
    roughness: 0.5,
    metalness: 0.6,
    envMapIntensity: 0.03
});
const OPENING_HEIGHT_MODE = Object.freeze({
    FIXED: 'fixed',
    FULL: 'full'
});
const OPENING_REPEAT_MIN = 1;
const OPENING_REPEAT_MAX = 5;
const WINDOW_ASSET_TYPE_WINDOW = 'window';

const FACE_NORMAL_BY_ID = Object.freeze({
    A: Object.freeze({ x: 0, y: 0, z: 1 }),
    B: Object.freeze({ x: 1, y: 0, z: 0 }),
    C: Object.freeze({ x: 0, y: 0, z: -1 }),
    D: Object.freeze({ x: -1, y: 0, z: 0 })
});

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function normalizeMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    return null;
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampUnit(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return clamp(fallback, 0, 1);
    return clamp(num, 0, 1);
}

function normalizeOpeningHeightMode(value, fallback = OPENING_HEIGHT_MODE.FIXED) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === OPENING_HEIGHT_MODE.FULL) return OPENING_HEIGHT_MODE.FULL;
    if (typed === OPENING_HEIGHT_MODE.FIXED) return OPENING_HEIGHT_MODE.FIXED;
    return fallback;
}

function normalizeOpeningRepeatCount(value, fallback = OPENING_REPEAT_MIN) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return clampInt(fallback, OPENING_REPEAT_MIN, OPENING_REPEAT_MAX);
    return clampInt(raw, OPENING_REPEAT_MIN, OPENING_REPEAT_MAX);
}

function normalizeOpeningAssetType(value, fallback = WINDOW_ASSET_TYPE_WINDOW) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === 'door') return 'door';
    if (typed === 'garage') return 'garage';
    if (typed === WINDOW_ASSET_TYPE_WINDOW) return WINDOW_ASSET_TYPE_WINDOW;
    return fallback;
}

function resolveBayWindowFromSpec(bay) {
    const spec = bay && typeof bay === 'object' ? bay : null;
    if (!spec) return null;
    if (spec.window && typeof spec.window === 'object') return spec.window;
    const legacyFeatures = spec.features && typeof spec.features === 'object' ? spec.features : null;
    if (legacyFeatures?.window && typeof legacyFeatures.window === 'object') return legacyFeatures.window;
    return null;
}

function resolveBayOpeningPlacementInSegment({
    segmentHeight,
    requestedHeight,
    heightMode,
    verticalOffsetMeters,
    top = null
}) {
    const hSeg = Math.max(0.1, Number(segmentHeight) || 0.1);
    const reqBottom = clamp(Number(requestedHeight) || 0.1, 0.1, 9999);
    const mode = normalizeOpeningHeightMode(heightMode, OPENING_HEIGHT_MODE.FIXED);
    const offsetRaw = Number(verticalOffsetMeters);
    const hasOffset = Number.isFinite(offsetRaw);

    const topCfg = top && typeof top === 'object' ? top : null;
    const topEnabled = !!topCfg?.enabled;
    const topGap = topEnabled && Number.isFinite(Number(topCfg?.gap))
        ? clamp(topCfg.gap, 0.0, 9999)
        : 0.0;
    const topMode = normalizeOpeningHeightMode(topCfg?.heightMode, OPENING_HEIGHT_MODE.FIXED);
    const topRequestedHeight = Number.isFinite(Number(topCfg?.height))
        ? clamp(topCfg.height, 0.1, 9999)
        : reqBottom;
    const topMinHeight = topEnabled
        ? (topMode === OPENING_HEIGHT_MODE.FULL ? 0.1 : topRequestedHeight)
        : 0.0;

    let yBottom = hasOffset
        ? clamp(offsetRaw, 0.0, hSeg)
        : (mode === OPENING_HEIGHT_MODE.FULL ? 0.0 : Math.max(0, (hSeg - reqBottom) * 0.5));
    const reservedTop = topEnabled ? (topGap + topMinHeight) : 0.0;
    const maxBottomY = Math.max(0, hSeg - reservedTop - 0.1);
    yBottom = clamp(yBottom, 0.0, maxBottomY);

    const availableBottom = Math.max(0.1, hSeg - yBottom - reservedTop);
    const bottomHeight = mode === OPENING_HEIGHT_MODE.FULL
        ? availableBottom
        : Math.min(reqBottom, availableBottom);

    const topStart = yBottom + bottomHeight + topGap;
    const availableTop = topEnabled ? Math.max(0.0, hSeg - topStart) : 0.0;
    const topHeight = (topEnabled && availableTop > EPS)
        ? (topMode === OPENING_HEIGHT_MODE.FULL ? availableTop : Math.min(topRequestedHeight, availableTop))
        : 0.0;

    return {
        bottom: { yBottom, height: bottomHeight },
        top: {
            enabled: topEnabled && topHeight > EPS,
            yBottom: topStart,
            height: topHeight
        }
    };
}

function isWallDecorationSpecOccludableByOpening(geometryKind) {
    const id = String(geometryKind ?? '').trim().toLowerCase();
    return id === 'flat_panel'
        || id === 'angled_support_profile'
        || id === 'curved_ring'
        || id === 'half_dome'
        || id === 'edge_brick_chain_course'
        || id === 'cornice_block'
        || id === 'cornice_rounded_block';
}

function buildBayOpeningOccludersForDecorationSegment({
    windowConfig = null,
    bayLengthMeters,
    segmentCanonicalStartMeters,
    segmentCanonicalEndMeters,
    segmentSpanMeters,
    reverseSegment = false,
    floorStartY,
    floorEndY
} = {}) {
    const windowCfg = windowConfig && typeof windowConfig === 'object' ? windowConfig : null;
    if (!windowCfg || windowCfg.enabled === false) return [];

    const span = Math.max(0.01, Number(bayLengthMeters) || 0.0);
    if (!(span > EPS)) return [];

    const padding = windowCfg?.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : null;
    const leftPad = clamp(padding?.leftMeters ?? 0.0, 0.0, 9999.0);
    const rightPad = clamp(padding?.rightMeters ?? 0.0, 0.0, 9999.0);
    const usable = span - leftPad - rightPad;
    if (!(usable > EPS)) return [];

    const assetType = normalizeOpeningAssetType(
        windowCfg?.assetType ?? windowCfg?.openingType,
        WINDOW_ASSET_TYPE_WINDOW
    );
    let repeatCount = normalizeOpeningRepeatCount(
        windowCfg?.repeat?.count ?? windowCfg?.repeatCount,
        OPENING_REPEAT_MIN
    );
    if (assetType !== WINDOW_ASSET_TYPE_WINDOW) repeatCount = OPENING_REPEAT_MIN;
    const slotWidth = usable / Math.max(OPENING_REPEAT_MIN, repeatCount);
    if (!(slotWidth > EPS)) return [];

    const sizeSpec = windowCfg?.size && typeof windowCfg.size === 'object' ? windowCfg.size : null;
    const requestedWidthRaw = Number(sizeSpec?.widthMeters ?? windowCfg?.widthMeters);
    let widthMeters = null;
    if (Number.isFinite(requestedWidthRaw)) {
        widthMeters = clamp(requestedWidthRaw, 0.1, 9999.0);
    } else {
        const widthSpec = windowCfg?.width && typeof windowCfg.width === 'object' ? windowCfg.width : null;
        const minWidthRaw = Number(widthSpec?.minMeters);
        const minWidth = Number.isFinite(minWidthRaw) ? clamp(minWidthRaw, 0.1, 9999.0) : 0.1;
        const maxRaw = widthSpec?.maxMeters;
        const maxWidth = (maxRaw === null || maxRaw === undefined) ? Infinity : clamp(maxRaw, minWidth, 9999.0);
        if (slotWidth + 1e-6 < minWidth) return [];
        widthMeters = clamp(minWidth, minWidth, Number.isFinite(maxWidth) ? maxWidth : 9999.0);
    }
    widthMeters = Math.min(widthMeters, slotWidth);
    if (!(widthMeters > EPS)) return [];

    const requestedHeightRaw = Number(sizeSpec?.heightMeters ?? windowCfg?.heightMeters);
    const requestedHeightMeters = Number.isFinite(requestedHeightRaw)
        ? clamp(requestedHeightRaw, 0.1, 9999.0)
        : 1.6;
    const heightMode = normalizeOpeningHeightMode(windowCfg?.heightMode, OPENING_HEIGHT_MODE.FIXED);
    const verticalOffsetRaw = Number(windowCfg?.verticalOffsetMeters ?? windowCfg?.yOffsetMeters ?? windowCfg?.offsetFromFloorMeters);
    const verticalOffsetMeters = Number.isFinite(verticalOffsetRaw)
        ? clamp(verticalOffsetRaw, 0.0, 9999.0)
        : null;

    const topSrc = windowCfg?.top && typeof windowCfg.top === 'object' ? windowCfg.top : null;
    const topEnabledRaw = topSrc?.enabled ?? windowCfg?.topEnabled ?? windowCfg?.secondEnabled ?? windowCfg?.topWindowEnabled;
    const topHeightMode = normalizeOpeningHeightMode(
        topSrc?.heightMode ?? topSrc?.mode ?? windowCfg?.topHeightMode,
        OPENING_HEIGHT_MODE.FIXED
    );
    const topHeightRaw = Number(topSrc?.heightMeters ?? topSrc?.height ?? windowCfg?.topHeightMeters);
    const topHeightMeters = Number.isFinite(topHeightRaw)
        ? clamp(topHeightRaw, 0.1, 9999.0)
        : requestedHeightMeters;
    const topGapRaw = Number(topSrc?.verticalGapMeters ?? topSrc?.gapMeters ?? windowCfg?.topGapMeters);
    const topGapMeters = Number.isFinite(topGapRaw)
        ? clamp(topGapRaw, 0.0, 9999.0)
        : 0.1;
    const topEnabled = !!topEnabledRaw && assetType !== 'garage';

    const floorMinY = Number(floorStartY);
    const floorMaxY = Number(floorEndY);
    if (!Number.isFinite(floorMinY) || !Number.isFinite(floorMaxY) || !(floorMaxY > floorMinY + EPS)) return [];
    const placement = resolveBayOpeningPlacementInSegment({
        segmentHeight: floorMaxY - floorMinY,
        requestedHeight: requestedHeightMeters,
        heightMode,
        verticalOffsetMeters,
        top: {
            enabled: topEnabled,
            heightMode: topHeightMode,
            height: topHeightMeters,
            gap: topGapMeters
        }
    });

    const canonicalStart = Math.min(
        Number(segmentCanonicalStartMeters) || 0.0,
        Number(segmentCanonicalEndMeters) || 0.0
    );
    const canonicalEnd = Math.max(
        Number(segmentCanonicalStartMeters) || 0.0,
        Number(segmentCanonicalEndMeters) || 0.0
    );
    const localSpan = Math.max(0.01, Number(segmentSpanMeters) || Math.abs(canonicalEnd - canonicalStart));
    const toLocalDistance = (canonicalDistance) => {
        const d = Number(canonicalDistance) || 0.0;
        return reverseSegment
            ? ((Number(segmentCanonicalEndMeters) || 0.0) - d)
            : (d - (Number(segmentCanonicalStartMeters) || 0.0));
    };

    const centers = [];
    const usableStart = leftPad;
    for (let i = 0; i < repeatCount; i += 1) {
        centers.push(usableStart + slotWidth * (i + 0.5));
    }

    const out = [];
    const appendOccluder = (openMinY, openMaxY) => {
        if (!(openMaxY > openMinY + EPS)) return;
        for (const center of centers) {
            const fullStart = center - widthMeters * 0.5;
            const fullEnd = center + widthMeters * 0.5;
            const segStart = Math.max(canonicalStart, fullStart);
            const segEnd = Math.min(canonicalEnd, fullEnd);
            if (!(segEnd > segStart + EPS)) continue;
            const localStart = toLocalDistance(segStart);
            const localEnd = toLocalDistance(segEnd);
            const localMin = Math.min(localStart, localEnd);
            const localMax = Math.max(localStart, localEnd);
            const uMin = localMin - localSpan * 0.5;
            const uMax = localMax - localSpan * 0.5;
            out.push({
                uMin: Math.min(uMin, uMax),
                uMax: Math.max(uMin, uMax),
                yMin: openMinY,
                yMax: openMaxY
            });
        }
    };

    const bottomYMin = floorMinY + (Number(placement?.bottom?.yBottom) || 0.0);
    const bottomYMax = bottomYMin + (Number(placement?.bottom?.height) || 0.0);
    appendOccluder(bottomYMin, bottomYMax);

    const topEnabledResolved = placement?.top?.enabled === true;
    if (topEnabledResolved) {
        const topYMin = floorMinY + (Number(placement?.top?.yBottom) || 0.0);
        const topYMax = topYMin + (Number(placement?.top?.height) || 0.0);
        appendOccluder(topYMin, topYMax);
    }

    return out;
}

function splitWallDecorationSpecByOpeningOccluders(spec, { openingOccluders = null, wallCenterY = 0.0 } = {}) {
    const src = spec && typeof spec === 'object' ? spec : null;
    if (!src) return [];
    const geometryKind = String(src.geometryKind ?? '').trim().toLowerCase();
    if (!isWallDecorationSpecOccludableByOpening(geometryKind)) return [src];
    const faceId = String(src.faceId ?? '').trim().toLowerCase();
    if (faceId !== 'front') return [src];

    const widthMeters = Math.max(0.01, Number(src.widthMeters) || 0.0);
    const centerU = Number(src.centerU) || 0.0;
    const minU = centerU - widthMeters * 0.5;
    const maxU = centerU + widthMeters * 0.5;
    if (!(maxU > minU + EPS)) return [src];

    const centerV = Number(src.centerV) || 0.0;
    const heightMeters = Math.max(0.01, Number(src.heightMeters) || 0.0);
    const wallY = Number(wallCenterY) || 0.0;
    const specMinY = wallY + centerV - heightMeters * 0.5;
    const specMaxY = wallY + centerV + heightMeters * 0.5;

    const occluders = Array.isArray(openingOccluders) ? openingOccluders : [];
    const intervals = [];
    for (const occluder of occluders) {
        const openMinY = Number(occluder?.yMin);
        const openMaxY = Number(occluder?.yMax);
        if (!Number.isFinite(openMinY) || !Number.isFinite(openMaxY)) continue;
        if (!(openMaxY > specMinY + EPS && openMinY < specMaxY - EPS)) continue;
        const blockMin = Math.max(minU, Number(occluder?.uMin) || 0.0);
        const blockMax = Math.min(maxU, Number(occluder?.uMax) || 0.0);
        if (!(blockMax > blockMin + 1e-6)) continue;
        intervals.push({ minU: blockMin, maxU: blockMax });
    }
    if (!intervals.length) return [src];

    intervals.sort((a, b) => (a.minU - b.minU) || (a.maxU - b.maxU));
    const merged = [];
    for (const interval of intervals) {
        const current = interval && typeof interval === 'object' ? interval : null;
        if (!current) continue;
        const prev = merged[merged.length - 1] ?? null;
        if (!prev || current.minU > prev.maxU + 1e-6) {
            merged.push({ minU: current.minU, maxU: current.maxU });
        } else {
            prev.maxU = Math.max(prev.maxU, current.maxU);
        }
    }

    const pieces = [];
    let cursor = minU;
    for (const interval of merged) {
        if (interval.minU > cursor + 0.01) {
            pieces.push({ minU: cursor, maxU: interval.minU });
        }
        cursor = Math.max(cursor, interval.maxU);
    }
    if (maxU > cursor + 0.01) pieces.push({ minU: cursor, maxU });
    if (!pieces.length) return [];

    if (pieces.length === 1 && Math.abs(pieces[0].minU - minU) <= 1e-6 && Math.abs(pieces[0].maxU - maxU) <= 1e-6) {
        return [src];
    }

    return pieces.map((piece, index) => {
        const partWidth = Math.max(0.01, piece.maxU - piece.minU);
        return {
            ...src,
            centerU: (piece.minU + piece.maxU) * 0.5,
            widthMeters: partWidth,
            role: `${String(src.role ?? 'decorator')}_part_${String(index + 1).padStart(2, '0')}`
        };
    });
}

function hasFlatCapFamilyFrontSpecs(specs) {
    const list = Array.isArray(specs) ? specs : [];
    if (!list.length) return false;
    let hasMain = false;
    let hasCap = false;
    for (const spec of list) {
        const src = spec && typeof spec === 'object' ? spec : null;
        if (!src) continue;
        const faceId = String(src.faceId ?? '').trim().toLowerCase();
        if (faceId !== 'front') continue;
        const geometryKind = String(src.geometryKind ?? '').trim().toLowerCase();
        if (geometryKind === 'flat_panel' || geometryKind === 'angled_support_profile') hasMain = true;
        if (geometryKind === 'flat_panel_cap' || geometryKind === 'flat_panel_side_cap') hasCap = true;
    }
    return hasMain && hasCap;
}

function resolveFlatCapFamilyFrontOffsetMeters(specs, fallback = 0.05) {
    const list = Array.isArray(specs) ? specs : [];
    for (const spec of list) {
        const src = spec && typeof spec === 'object' ? spec : null;
        if (!src) continue;
        const faceId = String(src.faceId ?? '').trim().toLowerCase();
        if (faceId !== 'front') continue;
        const geometryKind = String(src.geometryKind ?? '').trim().toLowerCase();
        if (geometryKind !== 'flat_panel' && geometryKind !== 'angled_support_profile') continue;
        const outset = Number(src.outsetMeters);
        if (Number.isFinite(outset) && outset > EPS) return clamp(outset, 0.005, 4.0);
        const depth = Number(src.depthMeters);
        if (Number.isFinite(depth) && depth > EPS) return clamp(depth, 0.005, 4.0);
    }
    return clamp(fallback, 0.005, 4.0);
}

function adjustFlatCapFamilyFrontSpecsForEdges(
    specs,
    {
        offsetMeters = 0.05,
        extendStart = false,
        extendEnd = false,
        hideStartCap = false,
        hideEndCap = false
    } = {}
) {
    const list = Array.isArray(specs) ? specs : [];
    const out = [];
    const edgeOffset = clamp(offsetMeters, 0.005, 4.0, 0.05);
    const extraStart = extendStart ? edgeOffset : 0.0;
    const extraEnd = extendEnd ? edgeOffset : 0.0;

    for (const spec of list) {
        const src = spec && typeof spec === 'object' ? spec : null;
        if (!src) continue;
        const next = { ...src };
        const faceId = String(next.faceId ?? '').trim().toLowerCase();
        const geometryKind = String(next.geometryKind ?? '').trim().toLowerCase();

        if (faceId === 'front' && (geometryKind === 'flat_panel' || geometryKind === 'angled_support_profile')) {
            const width = Math.max(0.01, Number(next.widthMeters) || 0.01);
            const centerU = Number(next.centerU) || 0.0;
            const minU = centerU - width * 0.5 - extraStart;
            const maxU = centerU + width * 0.5 + extraEnd;
            next.widthMeters = Math.max(0.01, maxU - minU);
            next.centerU = (minU + maxU) * 0.5;
        }

        if (faceId === 'front' && geometryKind === 'flat_panel_cap') {
            const bridgeStart = clamp(next.cornerBridgeStartMeters, 0.0, 4.0, 0.0);
            const bridgeEnd = clamp(next.cornerBridgeEndMeters, 0.0, 4.0, 0.0);
            next.cornerBridgeStartMeters = extendStart ? Math.max(bridgeStart, edgeOffset) : bridgeStart;
            next.cornerBridgeEndMeters = extendEnd ? Math.max(bridgeEnd, edgeOffset) : bridgeEnd;
        }

        if (faceId === 'front' && geometryKind === 'flat_panel_side_cap') {
            const yawDegrees = clamp(next.yawDegrees, -180.0, 180.0, 0.0);
            const isStartCap = Math.abs(Math.abs(yawDegrees) - 180.0) <= 1e-4;
            const isEndCap = !isStartCap;
            if ((hideStartCap && isStartCap) || (hideEndCap && isEndCap)) continue;
        }

        out.push(next);
    }

    return out;
}

function buildFlatCapFamilySameFaceContinuationSpecs(
    cornerSpecs,
    {
        continuationMeters = 0.0,
        edge = 'end',
        cornerStyle = 'exterior'
    } = {}
) {
    const list = Array.isArray(cornerSpecs) ? cornerSpecs : [];
    if (!list.length) return [];
    const continuation = clamp(continuationMeters, 0.0, 32.0, 0.0);
    if (!(continuation > 1e-6)) return [];

    const edgeTag = String(edge ?? '').trim().toLowerCase() === 'start' ? 'start' : 'end';
    const styleTag = String(cornerStyle ?? '').trim().toLowerCase() === 'interior' ? 'interior' : 'exterior';
    const out = [];

    for (const spec of list) {
        const src = spec && typeof spec === 'object' ? spec : null;
        if (!src) continue;
        const faceId = String(src.faceId ?? '').trim().toLowerCase();
        if (faceId !== 'right') continue;
        const geometryKind = String(src.geometryKind ?? '').trim().toLowerCase();

        let next = {
            ...src,
            __bf2CornerEdge: edgeTag,
            __bf2CornerStyle: styleTag
        };

        const widthOld = Math.max(0.01, Number(next.widthMeters) || 0.01);
        const centerUOld = Number(next.centerU) || 0.0;
        const minUOld = centerUOld - widthOld * 0.5;
        const widthNew = clamp(continuation, 0.01, 32.0);
        const minUNew = minUOld;
        const maxUNew = minUNew + widthNew;
        if (geometryKind === 'flat_panel_side_cap') {
            next.centerU = maxUNew;
        } else {
            next.widthMeters = widthNew;
            next.centerU = (minUNew + maxUNew) * 0.5;
        }

        if (geometryKind === 'flat_panel_cap') {
            const bridgeStart = clamp(next.cornerBridgeStartMeters, 0.0, 32.0);
            const bridgeEnd = clamp(next.cornerBridgeEndMeters, 0.0, 32.0);
            if (bridgeStart > widthNew + 1e-6 || bridgeEnd > widthNew + 1e-6) {
                next.cornerBridgeStartMeters = Math.min(bridgeStart, widthNew);
                next.cornerBridgeEndMeters = Math.min(bridgeEnd, widthNew);
            }
        }

        out.push(next);
    }

    return out;
}

function resolveFlatCapFamilyFrontMainSpec(specs) {
    const list = Array.isArray(specs) ? specs : [];
    for (const spec of list) {
        const src = spec && typeof spec === 'object' ? spec : null;
        if (!src) continue;
        const faceId = String(src.faceId ?? '').trim().toLowerCase();
        if (faceId !== 'front') continue;
        const geometryKind = String(src.geometryKind ?? '').trim().toLowerCase();
        if (geometryKind === 'flat_panel' || geometryKind === 'angled_support_profile') return src;
    }
    return null;
}

function computeFrontDecorationDrawSections(
    {
        uMin = 0.0,
        uMax = 0.0,
        yMin = 0.0,
        yMax = 0.0,
        openingOccluders = null,
        minSectionWidthMeters = 0.01
    } = {}
) {
    const start = Math.min(Number(uMin) || 0.0, Number(uMax) || 0.0);
    const end = Math.max(Number(uMin) || 0.0, Number(uMax) || 0.0);
    if (!(end > start + 1e-6)) return [];

    const blockIntervals = [];
    const occluders = Array.isArray(openingOccluders) ? openingOccluders : [];
    const areaMinY = Math.min(Number(yMin) || 0.0, Number(yMax) || 0.0);
    const areaMaxY = Math.max(Number(yMin) || 0.0, Number(yMax) || 0.0);
    for (const occluder of occluders) {
        const openMinY = Number(occluder?.yMin);
        const openMaxY = Number(occluder?.yMax);
        if (!Number.isFinite(openMinY) || !Number.isFinite(openMaxY)) continue;
        if (!(openMaxY > areaMinY + EPS && openMinY < areaMaxY - EPS)) continue;
        const blockMin = Math.max(start, Number(occluder?.uMin) || 0.0);
        const blockMax = Math.min(end, Number(occluder?.uMax) || 0.0);
        if (!(blockMax > blockMin + 1e-6)) continue;
        blockIntervals.push({ minU: blockMin, maxU: blockMax });
    }
    if (!blockIntervals.length) return [{ minU: start, maxU: end }];

    blockIntervals.sort((a, b) => (a.minU - b.minU) || (a.maxU - b.maxU));
    const mergedBlocks = [];
    for (const interval of blockIntervals) {
        const prev = mergedBlocks[mergedBlocks.length - 1] ?? null;
        if (!prev || interval.minU > prev.maxU + 1e-6) {
            mergedBlocks.push({ minU: interval.minU, maxU: interval.maxU });
        } else {
            prev.maxU = Math.max(prev.maxU, interval.maxU);
        }
    }

    const minSectionWidth = Math.max(0.001, Number(minSectionWidthMeters) || 0.01);
    const sections = [];
    let cursor = start;
    for (const block of mergedBlocks) {
        if (block.minU > cursor + minSectionWidth) {
            sections.push({ minU: cursor, maxU: block.minU });
        }
        cursor = Math.max(cursor, block.maxU);
    }
    if (end > cursor + minSectionWidth) sections.push({ minU: cursor, maxU: end });
    return sections;
}

function buildFlatCapFamilyFrontSectionSpecs(
    faceSpecs,
    {
        sectionMinU = 0.0,
        sectionMaxU = 0.0,
        sectionIndex = 0
    } = {}
) {
    const list = Array.isArray(faceSpecs) ? faceSpecs : [];
    const minU = Math.min(Number(sectionMinU) || 0.0, Number(sectionMaxU) || 0.0);
    const maxU = Math.max(Number(sectionMinU) || 0.0, Number(sectionMaxU) || 0.0);
    const sectionWidth = Math.max(0.01, maxU - minU);
    const sectionCenter = (minU + maxU) * 0.5;
    const suffix = `_section_${String(Math.max(0, Number(sectionIndex) || 0) + 1).padStart(2, '0')}`;
    const out = [];

    for (const spec of list) {
        const src = spec && typeof spec === 'object' ? spec : null;
        if (!src) continue;
        const faceId = String(src.faceId ?? '').trim().toLowerCase();
        if (faceId !== 'front') continue;
        const geometryKind = String(src.geometryKind ?? '').trim().toLowerCase();
        const next = {
            ...src,
            role: `${String(src.role ?? 'decorator')}${suffix}`
        };

        if (geometryKind === 'flat_panel' || geometryKind === 'angled_support_profile' || geometryKind === 'flat_panel_cap') {
            next.centerU = sectionCenter;
            next.widthMeters = sectionWidth;
            out.push(next);
            continue;
        }

        if (geometryKind === 'flat_panel_side_cap') {
            const yawDegrees = clamp(next.yawDegrees, -180.0, 180.0, 0.0);
            const isStartCap = Math.abs(Math.abs(yawDegrees) - 180.0) <= 1e-4;
            next.centerU = isStartCap ? minU : maxU;
            out.push(next);
            continue;
        }

        out.push(next);
    }

    return out;
}

function normalizeDecorationBayRef(value) {
    if (typeof value !== 'string') return '';
    const raw = value.trim();
    if (!raw) return '';
    const idx = raw.indexOf(':');
    if (idx <= 0 || idx >= raw.length - 1) return '';
    const faceId = raw.slice(0, idx).trim().toUpperCase();
    const bayId = raw.slice(idx + 1).trim();
    if (!isFaceId(faceId) || !bayId) return '';
    return `${faceId}:${bayId}`;
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const pairs = [];
        for (const key of keys) pairs.push(`${JSON.stringify(key)}:${stableStringify(value[key])}`);
        return `{${pairs.join(',')}}`;
    }
    return JSON.stringify(value);
}

function buildWallDecorationCompatibilityId({ safeState, spanStart = 0.0, spanEnd = 1.0 } = {}) {
    const state = sanitizeWallDecoratorDebuggerState(safeState);
    const minSpan = clampUnit(Math.min(Number(spanStart) || 0.0, Number(spanEnd) || 0.0), 0.0);
    const maxSpan = clampUnit(Math.max(Number(spanStart) || 0.0, Number(spanEnd) || 0.0), 1.0);
    return stableStringify({
        span: {
            start: minSpan,
            end: maxSpan
        },
        state: {
            decoratorId: state.decoratorId,
            whereToApply: state.whereToApply,
            mode: 'face',
            position: state.position,
            configuration: state.configuration ?? {},
            materialSelection: state.materialSelection ?? { kind: 'match_wall', id: 'match_wall' },
            wallBase: state.wallBase ?? {},
            tiling: state.tiling ?? {}
        }
    });
}

function buildWallDecorationEndpointKey(x, z) {
    const scale = 100000.0;
    const px = Math.round((Number(x) || 0.0) * scale);
    const pz = Math.round((Number(z) || 0.0) * scale);
    return `${px},${pz}`;
}

function parseDecorationBayRef(value) {
    const normalized = normalizeDecorationBayRef(value);
    if (!normalized) return null;
    const idx = normalized.indexOf(':');
    return {
        faceId: normalized.slice(0, idx),
        bayId: normalized.slice(idx + 1)
    };
}

function getFaceNormalVector(faceId) {
    const src = FACE_NORMAL_BY_ID[faceId];
    if (!src) return null;
    return new THREE.Vector3(src.x, src.y, src.z);
}

function createWallDecorationGeometryFromSpec(spec) {
    const built = createSharedWallDecoratorGeometryFromSpec(spec, { fallbackToBox: true });
    return {
        geometry: built?.geometry?.isBufferGeometry ? built.geometry : null,
        placementDepthMeters: Math.max(0.0, Number(built?.placementDepthMeters) || 0.0),
        surfaceWidthMeters: Math.max(0.01, Number(built?.surfaceWidthMeters) || (Number(spec?.widthMeters) || 1.0)),
        surfaceHeightMeters: Math.max(0.01, Number(built?.surfaceHeightMeters) || (Number(spec?.heightMeters) || 0.2)),
        geometryKind: String(built?.geometryKind ?? spec?.geometryKind ?? '').trim().toLowerCase()
    };
}

function applyTextureTransform(tex, { repeatU = 1, repeatV = 1, offsetU = 0, offsetV = 0, rotationDegrees = 0 } = {}) {
    const texture = tex?.isTexture ? tex : null;
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Number(repeatU) || 1.0, Number(repeatV) || 1.0);
    texture.offset.set(Number(offsetU) || 0.0, Number(offsetV) || 0.0);
    texture.center.set(0.5, 0.5);
    texture.rotation = (Number(rotationDegrees) || 0) * Math.PI / 180.0;
    texture.needsUpdate = true;
}

function computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight }) {
    const roadCfg = generatorConfig?.road ?? {};
    const baseRoadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : 0;
    const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
    const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
    const hasSidewalk = sidewalkWidth > EPS;

    const groundY = generatorConfig?.ground?.surfaceY ?? baseRoadY;
    const sidewalkSurfaceY = hasSidewalk ? (baseRoadY + curbHeight + curbExtra + sidewalkLift) : null;
    const baseSurfaceY = (hasSidewalk && Number.isFinite(sidewalkSurfaceY)) ? sidewalkSurfaceY : groundY;
    const baseY = (Number(baseSurfaceY) || 0) + 0.01;

    const extraFirstFloor = (hasSidewalk && Number.isFinite(sidewalkSurfaceY) && Number.isFinite(groundY))
        ? Math.max(0, sidewalkSurfaceY - groundY)
        : 0;

    const fh = clamp(floorHeight, 1.0, 12.0);
    const extra = clamp(extraFirstFloor, 0, Math.max(0, fh * 2));

    const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY))
        ? sidewalkSurfaceY
        : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
    const planY = planBase + 0.07;

    return { baseY, extraFirstFloor: extra, planY };
}

function disposeTextureProps(mat, disposedTextures) {
    if (!mat) return;
    const seen = disposedTextures instanceof Set ? disposedTextures : null;
    for (const k of Object.keys(mat)) {
        const v = mat[k];
        if (!v || !v.isTexture || v.userData?.buildingShared) continue;
        if (seen) {
            if (seen.has(v)) continue;
            seen.add(v);
        }
        v.dispose?.();
    }
}

function disposeObject3D(obj) {
    if (!obj) return;
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    const disposedTextures = new Set();

    obj.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isLineSegments && !o.isLine2 && !o.isLineSegments2) return;

        const geo = o.geometry ?? null;
        if (geo && !disposedGeometries.has(geo)) {
            disposedGeometries.add(geo);
            geo.dispose?.();
        }

        const mat = o.material;
        if (!mat) return;
        if (Array.isArray(mat)) {
            for (const m of mat) {
                if (!m || disposedMaterials.has(m)) continue;
                disposedMaterials.add(m);
                disposeTextureProps(m, disposedTextures);
                m.dispose?.();
            }
        } else if (!disposedMaterials.has(mat)) {
            disposedMaterials.add(mat);
            disposeTextureProps(mat, disposedTextures);
            mat.dispose?.();
        }
    });
}

function getCenteredRectFootprintTiles(gridSize, w, h) {
    const size = clampInt(gridSize, 1, 9999);
    const width = clampInt(w, 1, size);
    const height = clampInt(h, 1, size);

    const startX = Math.floor((size - width) * 0.5);
    const startY = Math.floor((size - height) * 0.5);

    const tiles = [];
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            tiles.push([x, y]);
        }
    }
    return tiles;
}

export class BuildingFabrication2Scene {
    constructor(engine, {
        gridSize = 5,
        tileSize = 24,
        occupyRatio = 1.0
    } = {}) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.gridSize = clampInt(gridSize, 3, 25);
        this.tileSize = Math.max(4, Number(tileSize) || 24);
        this.occupyRatio = Math.max(0.5, Math.min(1.0, Number(occupyRatio) || 1.0));

        this.generatorConfig = createGeneratorConfig({
            render: { treesEnabled: false }
        });
        this.tileMeters = 2;

        this.root = null;
        this.controls = null;
        this.map = null;
        this.world = null;

        this._wallTextures = new BuildingWallTextureCache({ renderer: this.engine?.renderer ?? null });
        this._building = null;
        this._wallDecorationsGroup = null;
        this._wallDecorationsExplodedGroup = null;
        this._explodedDecorationsEnabled = false;
        this._beltColorById = new Map(getBeltCourseColorOptions().map((opt) => [String(opt?.id ?? ''), Number(opt?.hex) || 0xffffff]));

        this._showWireframe = false;
        this._showFloorDivisions = false;
        this._showFloorplan = false;
        this._wireframeOriginalByMaterial = new WeakMap();

        this._focusBox = null;
        this._selectedFaceId = null;
        this._activeFaceLayerId = null;
        this._suppressFaceHighlight = false;
        this._faceHighlightLine = null;
        this._hoveredFloorLayerId = null;
        this._hoverHighlightLine = null;
        this._floorLayerYRangeById = new Map();
        this._bayHighlightDataByLayerId = null;
        this._hoveredBay = null;
        this._hoveredBayOverlay = null;
        this._lineResolution = new THREE.Vector2(1, 1);

        this._backgroundColor = new THREE.Color(BACKGROUND_COLOR);
        this._prevSceneBackground = null;
        this._renderSkyEnabled = true;

        this._showDummy = false;
        this._dummy = null;
        this._renderSlab = false;
        this._supportSlabMesh = null;
        this._sun = null;
        this._debugDisableSuspect1 = false;
        this._debugDisableSuspect4 = false;

        this._rulerRaycaster = new THREE.Raycaster();
        this._rulerRayHits = [];
        this._rulerLine = null;
        this._layoutAdjustEnabled = false;
        this._layoutLoop = null;
        this._layoutHoverFaceId = null;
        this._layoutHoverVertexIndex = null;
        this._layoutWidthGuideFaceIds = null;
        this._layoutFaceOverlay = null;
        this._layoutFaceLine = null;
        this._layoutWidthGuideLine = null;
        this._layoutVertexRing = null;
        this._layoutRayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._layoutRayPoint = new THREE.Vector3();

        this._facadeCornerStrategyId = null;
        this._facadeCornerDebug = false;
    }

    enter() {
        if (!this.scene) return;
        this._prevSceneBackground = this.scene.background ?? null;
        this._syncSceneBackground();

        this.root = new THREE.Group();
        this.root.name = 'building_fabrication2_root';
        this.scene.add(this.root);

        this._buildMap();
        this._buildWorld();
        this._buildLights();
        this._buildCamera();
    }

    exit() {
        this.controls?.dispose?.();
        this.controls = null;

        this._setDummyVisible(false);
        this._clearSupportSlab();

        this._clearBuilding();
        this._clearFaceHighlight();
        this._clearRulerLine();
        this._clearLayoutOverlays();

        if (this.world?.group) {
            this.world.group.removeFromParent();
            disposeObject3D(this.world.group);
        }
        this.world = null;
        this.map = null;
        this._focusBox = null;

        this._wallTextures?.dispose?.();
        this._wallTextures = null;

        if (this.root) {
            this.root.removeFromParent();
            disposeObject3D(this.root);
        }
        this.root = null;

        if (this.scene) this.scene.background = this._prevSceneBackground ?? null;
        this._prevSceneBackground = null;
        this._layoutAdjustEnabled = false;
        this._layoutLoop = null;
        this._layoutHoverFaceId = null;
        this._layoutHoverVertexIndex = null;
        this._sun = null;
        this._wallDecorationsExplodedGroup = null;
        this._explodedDecorationsEnabled = false;
        this._debugDisableSuspect1 = false;
        this._debugDisableSuspect4 = false;
    }

    update(dt) {
        this.controls?.update?.(dt);
    }

    setUiRoot(uiRoot) {
        this.controls?.setUiRoot?.(uiRoot);
    }

    setShowWireframe(enabled) {
        const next = !!enabled;
        if (next === this._showWireframe) return;
        this._showWireframe = next;
        this._syncSceneWireframe();
        this._syncBuildingRenderMode();
    }

    setShowFloorDivisions(enabled) {
        this._showFloorDivisions = !!enabled;
        this._syncBuildingRenderMode();
    }

    setShowFloorplan(enabled) {
        this._showFloorplan = !!enabled;
        this._syncBuildingRenderMode();
    }

    setRenderSky(enabled) {
        const next = !!enabled;
        if (next === this._renderSkyEnabled) return;
        this._renderSkyEnabled = next;
        this._syncSceneBackground();
    }

    setDebugDisableSuspect1(enabled) {
        const next = !!enabled;
        if (next === this._debugDisableSuspect1) return;
        this._debugDisableSuspect1 = next;
        this._applySuspect1ShadowDebugState();
    }

    setDebugDisableSuspect4(enabled) {
        this._debugDisableSuspect4 = !!enabled;
    }

    setSelectedFaceId(faceId) {
        const next = isFaceId(faceId) ? faceId : null;
        if (next === this._selectedFaceId) return;
        this._selectedFaceId = next;
        this._syncFaceHighlight();
    }

    setActiveFaceLayerId(layerId) {
        const next = typeof layerId === 'string' && layerId ? layerId : null;
        if (next === this._activeFaceLayerId) return;
        this._activeFaceLayerId = next;
        this._syncFaceHighlight();
    }

    setFaceHighlightSuppressed(suppressed) {
        const next = !!suppressed;
        if (next === this._suppressFaceHighlight) return;
        this._suppressFaceHighlight = next;

        if (this._faceHighlightLine) {
            this._faceHighlightLine.visible = !next;
            return;
        }
        if (!next) this._syncFaceHighlight();
    }

    setHoveredFloorLayerId(layerId) {
        const next = typeof layerId === 'string' && layerId ? layerId : null;
        if (next === this._hoveredFloorLayerId) return;
        this._hoveredFloorLayerId = next;
        this._syncHoverHighlight();
    }

    setHoveredBay({ layerId = null, faceId = null, bayId = null } = {}) {
        const nextLayerId = typeof layerId === 'string' && layerId ? layerId : null;
        const nextFaceId = isFaceId(faceId) ? faceId : null;
        const nextBayId = typeof bayId === 'string' && bayId ? bayId : null;
        const next = (nextLayerId && nextFaceId && nextBayId)
            ? { layerId: nextLayerId, faceId: nextFaceId, bayId: nextBayId }
            : null;

        const prev = this._hoveredBay;
        if ((prev?.layerId ?? null) === (next?.layerId ?? null)
            && (prev?.faceId ?? null) === (next?.faceId ?? null)
            && (prev?.bayId ?? null) === (next?.bayId ?? null)) return;
        this._hoveredBay = next;
        this._syncHoveredBayOverlay();
    }

    clearHoveredBay() {
        if (!this._hoveredBay) return;
        this._hoveredBay = null;
        this._syncHoveredBayOverlay();
    }

    setShowDummy(enabled) {
        const next = !!enabled;
        if (next === this._showDummy) return;
        this._showDummy = next;
        this._syncDummy();
    }

    setRenderSlab(enabled) {
        const next = !!enabled;
        if (next === this._renderSlab) return;
        this._renderSlab = next;
        this._syncSupportSlab();
    }

    setExplodedDecorationsEnabled(enabled) {
        const next = !!enabled;
        if (next === this._explodedDecorationsEnabled) {
            this._syncExplodedDecorationsState();
            return;
        }
        this._explodedDecorationsEnabled = next;
        this._syncExplodedDecorationsState();
    }

    getLayoutEditPlaneY() {
        if (this._focusBox && Number.isFinite(this._focusBox.min.y)) return Number(this._focusBox.min.y) + 0.02;
        return 0.02;
    }

    raycastHorizontalPlane(pointerNdc, { y = null } = {}) {
        const pointer = pointerNdc && typeof pointerNdc === 'object' ? pointerNdc : null;
        if (!pointer || !this.camera) return null;

        const planeY = Number.isFinite(y) ? Number(y) : this.getLayoutEditPlaneY();
        this._layoutRayPlane.constant = -planeY;

        this._rulerRaycaster.setFromCamera(pointer, this.camera);
        const hit = this._rulerRaycaster.ray.intersectPlane(this._layoutRayPlane, this._layoutRayPoint);
        if (!hit) return null;
        return hit.clone();
    }

    setLayoutEditState({
        enabled = false,
        loop = null,
        hoverFaceId = null,
        hoverVertexIndex = null,
        widthGuideFaceIds = null
    } = {}) {
        const nextEnabled = !!enabled;
        const nextLoop = Array.isArray(loop) ? loop : null;
        const nextFaceId = isFaceId(hoverFaceId) ? hoverFaceId : null;
        const nextVertexIndex = Number.isInteger(hoverVertexIndex) ? Math.max(0, hoverVertexIndex | 0) : null;
        const nextWidthGuideFaceIds = Array.isArray(widthGuideFaceIds)
            ? widthGuideFaceIds.filter((faceId) => isFaceId(faceId))
            : null;

        this._layoutAdjustEnabled = nextEnabled;
        this._layoutLoop = nextLoop;
        this._layoutHoverFaceId = nextFaceId;
        this._layoutHoverVertexIndex = nextVertexIndex;
        this._layoutWidthGuideFaceIds = nextWidthGuideFaceIds;
        this._syncLayoutEditOverlays();
    }

    raycastSurface(pointerNdc) {
        const pointer = pointerNdc && typeof pointerNdc === 'object' ? pointerNdc : null;
        if (!pointer || !this.camera) return null;

        const targets = [];
        if (this._building?.group) targets.push(this._building.group);
        if (this.world?.groundTiles) targets.push(this.world.groundTiles);
        if (this.world?.floor) targets.push(this.world.floor);
        if (!targets.length) return null;

        const hits = this._rulerRayHits;
        hits.length = 0;
        this._rulerRaycaster.setFromCamera(pointer, this.camera);
        for (const target of targets) {
            this._rulerRaycaster.intersectObject(target, true, hits);
        }
        if (!hits.length) return null;

        hits.sort((a, b) => a.distance - b.distance);
        const hit = hits[0];
        if (!hit?.point) return null;
        return hit.point.clone();
    }

    setRulerSegment(pointA, pointB) {
        const a = pointA && typeof pointA === 'object' ? pointA : null;
        const b = pointB && typeof pointB === 'object' ? pointB : null;
        if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)
            || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) {
            this._clearRulerLine();
            return;
        }
        if (!this.root) return;

        if (!this._rulerLine) {
            const geo = new LineSegmentsGeometry();
            geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);

            const mat = new LineMaterial({
                color: RULER_LINE_COLOR,
                linewidth: RULER_LINEWIDTH,
                worldUnits: false,
                transparent: true,
                opacity: RULER_LINE_OPACITY,
                depthTest: false,
                depthWrite: false
            });

            if (this.engine?.renderer) {
                const size = this.engine.renderer.getSize(this._lineResolution);
                mat.resolution.set(size.x, size.y);
            }

            const line = new LineSegments2(geo, mat);
            line.name = 'bf2_ruler_line';
            line.renderOrder = 190;
            line.frustumCulled = false;
            line.raycast = () => {};
            line.userData = line.userData ?? {};
            line.userData.bf2Ruler = true;
            this.root.add(line);
            this._rulerLine = line;
            return;
        }

        const geo = this._rulerLine.geometry;
        if (geo?.setPositions) geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
        this._rulerLine.visible = true;
    }

    getHasBuilding() {
        return !!this._building;
    }

    setFacadeCornerStrategyId(strategyId) {
        this._facadeCornerStrategyId = typeof strategyId === 'string' ? strategyId : null;
    }

    setFacadeCornerDebug(enabled) {
        this._facadeCornerDebug = !!enabled;
    }

    clearBuilding() {
        this._clearBuilding();
    }

    loadBuildingConfig(config, { preserveCamera = true } = {}) {
        if (!config || typeof config !== 'object') return false;
        const rawLayers = Array.isArray(config.layers) ? config.layers : null;
        if (!Array.isArray(rawLayers) || !rawLayers.length) return false;
        if (!this.root || !this.map) return false;

        const baseWallMaterial = normalizeMaterialSpec(config?.baseWallMaterial ?? null);
        const layers = baseWallMaterial
            ? rawLayers.map((layer) => {
                if (layer?.type !== 'floor') return layer;
                const has = !!normalizeMaterialSpec(layer?.material ?? null);
                return has ? layer : { ...layer, material: baseWallMaterial };
            })
            : rawLayers;

        const hadBuilding = this.getHasBuilding();
        const keepCamera = !!preserveCamera && hadBuilding && !!this.camera && !!this.controls;
        const cameraPos = keepCamera ? this.camera.position.clone() : null;
        const cameraTarget = keepCamera ? this.controls.target.clone() : null;

        this._clearBuilding({ preserveHoveredBay: true });

        const group = new THREE.Group();
        group.name = 'building_fabrication2_building';

        const solidGroup = new THREE.Group();
        solidGroup.name = 'solid';
        const featuresGroup = new THREE.Group();
        featuresGroup.name = 'features';
        const wireGroup = new THREE.Group();
        wireGroup.name = 'wire';
        const floorsGroup = new THREE.Group();
        floorsGroup.name = 'floors';
        const planGroup = new THREE.Group();
        planGroup.name = 'plan';
        const windowsGroup = new THREE.Group();
        windowsGroup.name = 'windows';

        group.add(solidGroup);
        group.add(featuresGroup);
        group.add(wireGroup);
        group.add(floorsGroup);
        group.add(planGroup);
        group.add(windowsGroup);

        const tiles = getCenteredRectFootprintTiles(this.gridSize, DOUBLE, 1);
        const footprintLoops = Array.isArray(config?.footprintLoops) ? config.footprintLoops : null;
        const wallInset = Number.isFinite(config.wallInset) ? config.wallInset : 0.0;
        const materialVariationSeed = Number.isFinite(config.materialVariationSeed) ? config.materialVariationSeed : null;
        const windowVisuals = config?.windowVisuals && typeof config.windowVisuals === 'object' ? config.windowVisuals : null;
        const windowVisualsIsOverride = !!windowVisuals;

        const parts = buildBuildingFabricationVisualParts({
            map: this.map,
            tiles,
            footprintLoops,
            generatorConfig: this.generatorConfig,
            tileSize: this.tileSize,
            occupyRatio: this.occupyRatio,
            layers,
            materialVariationSeed,
            textureCache: this._wallTextures,
            renderer: this.engine?.renderer ?? null,
            windowVisuals,
            windowVisualsIsOverride,
            facades: config?.facades ?? null,
            facadeCornerStrategyId: this._facadeCornerStrategyId,
            facadeCornerDebug: this._facadeCornerDebug,
            windowDefinitions: config?.windowDefinitions ?? null,
            overlays: { wire: true, floorplan: true, border: false, floorDivisions: true },
            walls: { inset: wallInset },
            debug: {
                disableSuspect4FaceOverrideOverlay: this._debugDisableSuspect4
            }
        });
        if (!parts) {
            disposeObject3D(group);
            return false;
        }

        for (const mesh of parts.solidMeshes ?? []) solidGroup.add(mesh);
        if (parts.beltCourse) featuresGroup.add(parts.beltCourse);
        if (parts.topBelt) featuresGroup.add(parts.topBelt);
        if (parts.wire) wireGroup.add(parts.wire);
        if (parts.floorDivisions) floorsGroup.add(parts.floorDivisions);
        if (parts.plan) planGroup.add(parts.plan);
        if (parts.windows) windowsGroup.add(parts.windows);

        this.root.add(group);
        group.userData = group.userData ?? {};
        group.userData.facadeCornerDebug = parts.facadeCornerDebug ?? null;

        this._building = { group, solidGroup, featuresGroup, wireGroup, floorsGroup, planGroup, windowsGroup };
        this._bayHighlightDataByLayerId = (parts.bayHighlightDataByLayerId && typeof parts.bayHighlightDataByLayerId === 'object')
            ? parts.bayHighlightDataByLayerId
            : null;
        this._syncBuildingRenderMode();
        this._syncSceneWireframe();
        this._updateFocusBoxFromObject(group);
        this._syncSupportSlab();
        this._syncDummy();

        this._floorLayerYRangeById = this._computeFloorLayerYRangeById(layers);
        this._rebuildWallDecorations({ config, layers });
        this._syncBuildingRenderMode();
        this._syncSceneWireframe();
        this._syncHoverHighlight();
        this._syncHoveredBayOverlay();
        this._syncFaceHighlight();
        this._syncLayoutEditOverlays();

        if (keepCamera && cameraPos && cameraTarget) {
            this.controls.setLookAt({ position: cameraPos, target: cameraTarget });
        } else {
            this.controls?.frame?.();
        }
        return true;
    }

    resetCamera() {
        if (!this.camera || !this.controls) return false;
        const span = this.tileSize * this.gridSize;
        const dist = span * 1.2;
        this.controls.setLookAt({
            position: new THREE.Vector3(0, dist * 0.75, dist * 0.9),
            target: new THREE.Vector3(0, 0, 0)
        });
        this.controls.setHomeFromCurrent();
        return true;
    }

    _syncBuildingRenderMode() {
        const b = this._building;
        if (!b) return;

        if (this._explodedDecorationsEnabled) {
            if (b.group) b.group.visible = false;
            if (this._wallDecorationsGroup) this._wallDecorationsGroup.visible = false;
            if (!this._wallDecorationsExplodedGroup) this._rebuildExplodedWallDecorations();
            return;
        }

        if (b.group) b.group.visible = true;
        const floorplan = this._showFloorplan;
        if (b.planGroup) b.planGroup.visible = floorplan;
        if (b.solidGroup) b.solidGroup.visible = !floorplan;
        if (b.featuresGroup) b.featuresGroup.visible = !floorplan;
        if (b.wireGroup) b.wireGroup.visible = false;
        if (b.floorsGroup) b.floorsGroup.visible = !floorplan && this._showFloorDivisions;
        if (b.windowsGroup) b.windowsGroup.visible = !floorplan;
        if (this._wallDecorationsGroup) this._wallDecorationsGroup.visible = !floorplan;
        this._clearWallDecorationsExploded();
    }

    _clearWallDecorationsExploded() {
        if (!this._wallDecorationsExplodedGroup) return;
        this._wallDecorationsExplodedGroup.removeFromParent();
        disposeObject3D(this._wallDecorationsExplodedGroup);
        this._wallDecorationsExplodedGroup = null;
        if (this._building && typeof this._building === 'object') this._building.decorationExplodedGroup = null;
    }

    _collectWallDecorationMeshes() {
        const out = [];
        const root = this._wallDecorationsGroup;
        if (!root) return out;
        root.traverse((obj) => {
            if (obj?.isMesh) out.push(obj);
        });
        return out;
    }

    _rebuildExplodedWallDecorations() {
        this._clearWallDecorationsExploded();
        if (!this.root || !this._explodedDecorationsEnabled) return;
        const sourceMeshes = this._collectWallDecorationMeshes();
        if (!sourceMeshes.length) return;

        const entries = buildWallDecoratorExplodedFaceEntries(sourceMeshes, {
            wireframe: !!this._showWireframe
        });
        if (!entries.length) return;

        if (areWallDecoratorExplodedEntriesCurvedRingOnly(entries)) {
            separateWallDecoratorExplodedCurvedRingFaces(entries);
        } else if (areWallDecoratorExplodedEntriesCorniceRoundedOnly(entries)) {
            separateWallDecoratorExplodedCorniceRoundedFaces(entries);
        } else {
            separateWallDecoratorExplodedFacesIterative(entries);
        }

        const group = new THREE.Group();
        group.name = 'bf2_wall_decorations_exploded';
        for (const entry of entries) {
            const mesh = entry?.mesh?.isMesh ? entry.mesh : null;
            if (!mesh) continue;
            mesh.position.copy(entry.centroid);
            group.add(mesh);
        }
        if (!group.children.length) {
            disposeObject3D(group);
            return;
        }

        this.root.add(group);
        this._wallDecorationsExplodedGroup = group;
        if (this._building && typeof this._building === 'object') this._building.decorationExplodedGroup = group;
    }

    _syncExplodedDecorationsState() {
        if (!this._building?.group) {
            this._clearWallDecorationsExploded();
            return;
        }
        this._syncBuildingRenderMode();
    }

    _clearWallDecorations() {
        this._clearWallDecorationsExploded();
        if (!this._wallDecorationsGroup) return;
        this._wallDecorationsGroup.removeFromParent();
        disposeObject3D(this._wallDecorationsGroup);
        this._wallDecorationsGroup = null;
        if (this._building && typeof this._building === 'object') this._building.decorationGroup = null;
    }

    _computeFloorLayerSegmentsById(layers) {
        const list = Array.isArray(layers) ? layers : [];
        const floorLayers = list.filter((l) => l?.type === 'floor');
        const firstFloor = floorLayers[0] ?? null;
        const firstFloorHeight = clamp(firstFloor?.floorHeight ?? 3.2, 1.0, 12.0);
        const { baseY, extraFirstFloor } = computeBuildingBaseAndSidewalk({
            generatorConfig: this.generatorConfig,
            floorHeight: firstFloorHeight
        });

        const map = new Map();
        let yCursor = baseY;
        let firstFloorPendingExtra = extraFirstFloor;

        for (const layer of floorLayers) {
            const id = typeof layer?.id === 'string' ? layer.id : '';
            if (!id) continue;

            const segments = [];
            const floors = clampInt(layer?.floors ?? 0, 0, 99);
            const floorHeight = clamp(layer?.floorHeight ?? firstFloorHeight, 1.0, 12.0);
            const beltEnabled = !!layer?.belt?.enabled;
            const beltHeight = beltEnabled ? clamp(layer?.belt?.height ?? 0.12, 0.02, 1.2) : 0.0;

            for (let floor = 0; floor < floors; floor += 1) {
                const startY = yCursor;
                const segHeight = floorHeight + (floor === 0 ? firstFloorPendingExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;
                yCursor += Math.max(0, segHeight);
                if (beltEnabled && beltHeight > EPS) yCursor += beltHeight;
                const endY = yCursor;
                segments.push({
                    floorNumber: floor + 1,
                    startY,
                    endY,
                    heightMeters: Math.max(0.0, endY - startY)
                });
            }
            map.set(id, segments);
        }

        return map;
    }

    _resolveWallDecorationMaterial(
        state,
        {
            layerMaterialSpec = null,
            surfaceSizeMeters = null,
            geometryKind = ''
        } = {}
    ) {
        const safeState = sanitizeWallDecoratorDebuggerState(state);
        const wallBase = safeState?.wallBase && typeof safeState.wallBase === 'object' ? safeState.wallBase : {};
        const roughness = clamp(
            Number.isFinite(Number(wallBase.roughness)) ? Number(wallBase.roughness) : 0.85,
            0.0,
            1.0
        );
        const normalStrength = clamp(
            Number.isFinite(Number(wallBase.normalStrength)) ? Number(wallBase.normalStrength) : 0.9,
            0.0,
            2.0
        );
        const widthMeters = clamp(
            Number.isFinite(Number(surfaceSizeMeters?.x)) ? Number(surfaceSizeMeters.x) : 1.0,
            0.01,
            256.0
        );
        const heightMeters = clamp(
            Number.isFinite(Number(surfaceSizeMeters?.y)) ? Number(surfaceSizeMeters.y) : 0.2,
            0.01,
            256.0
        );

        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness,
            metalness: 0.02,
            side: THREE.FrontSide
        });
        if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);

        const geometry = String(geometryKind ?? '').trim().toLowerCase();
        if (geometry === 'awning_support_rod') {
            mat.color.setHex(AWNING_ROD_MATERIAL.colorHex);
            mat.roughness = AWNING_ROD_MATERIAL.roughness;
            mat.metalness = AWNING_ROD_MATERIAL.metalness;
            mat.envMapIntensity = AWNING_ROD_MATERIAL.envMapIntensity;
            if (mat.normalScale?.set) mat.normalScale.set(1, 1);
            return mat;
        }

        const materialSelection = safeState?.materialSelection && typeof safeState.materialSelection === 'object'
            ? safeState.materialSelection
            : {};
        const materialKindRaw = typeof materialSelection.kind === 'string' ? materialSelection.kind.trim().toLowerCase() : '';
        const isMatchWall = materialKindRaw === 'match_wall' || materialKindRaw === 'match wall' || materialKindRaw === 'matchwall';
        const isColor = materialKindRaw === 'color';

        if (isColor) {
            const colorHex = this._beltColorById.get(String(materialSelection.id ?? '').trim()) ?? 0xffffff;
            mat.color.setHex((Number(colorHex) >>> 0) & 0xffffff);
            return mat;
        }

        let materialId = '';
        if (isMatchWall) {
            if (layerMaterialSpec?.kind === 'texture' && typeof layerMaterialSpec.id === 'string') {
                materialId = layerMaterialSpec.id.trim();
            }
        } else if (typeof materialSelection.id === 'string') {
            materialId = materialSelection.id.trim();
        }

        if (!materialId) {
            if (isMatchWall && layerMaterialSpec?.kind === 'color') {
                const colorHex = this._beltColorById.get(String(layerMaterialSpec.id ?? '').trim()) ?? 0xffffff;
                mat.color.setHex((Number(colorHex) >>> 0) & 0xffffff);
            } else {
                mat.color.setHex(isMatchWall ? 0xf4f4f4 : 0xffffff);
            }
            return mat;
        }

        const payload = this._wallTextures?.resolveMaterial?.(materialId, {
            cloneTextures: true,
            uvSpace: 'unit',
            surfaceSizeMeters: { x: widthMeters, y: heightMeters },
            diagnosticsTag: 'BuildingFabrication2Scene.wall_decoration'
        }) ?? null;
        if (payload) this._wallTextures?.applyResolvedMaterial?.(mat, payload, { clearOnMissing: true });

        if (isMatchWall) mat.color.setHex(0xffffff);
        else mat.color.setHex(resolveWallBaseTintHexFromWallBase(wallBase));

        const tiling = safeState?.tiling && typeof safeState.tiling === 'object' ? safeState.tiling : {};
        const tilingEnabled = !!tiling.enabled;
        const uvEnabled = !!tiling.uvEnabled;

        const probeTexture = mat.map ?? mat.normalMap ?? mat.roughnessMap ?? mat.metalnessMap ?? mat.aoMap ?? null;
        const baseRepeatU = Number(probeTexture?.repeat?.x);
        const baseRepeatV = Number(probeTexture?.repeat?.y);

        let repeatU = Number.isFinite(baseRepeatU) && Math.abs(baseRepeatU) > EPS ? baseRepeatU : 1.0;
        let repeatV = Number.isFinite(baseRepeatV) && Math.abs(baseRepeatV) > EPS ? baseRepeatV : 1.0;
        if (tilingEnabled) {
            const tileU = clamp(
                Number.isFinite(Number(tiling.tileMetersU)) ? Number(tiling.tileMetersU) : (widthMeters / Math.max(EPS, repeatU)),
                0.1,
                100.0
            );
            const tileV = clamp(
                Number.isFinite(Number(tiling.tileMetersV)) ? Number(tiling.tileMetersV) : (heightMeters / Math.max(EPS, repeatV)),
                0.1,
                100.0
            );
            repeatU = widthMeters / tileU;
            repeatV = heightMeters / tileV;
        }

        const offsetU = uvEnabled
            ? clamp(Number.isFinite(Number(tiling.offsetU)) ? Number(tiling.offsetU) : 0.0, -10.0, 10.0)
            : 0.0;
        const offsetV = uvEnabled
            ? clamp(Number.isFinite(Number(tiling.offsetV)) ? Number(tiling.offsetV) : 0.0, -10.0, 10.0)
            : 0.0;
        const rotationDegrees = uvEnabled
            ? clamp(Number.isFinite(Number(tiling.rotationDegrees)) ? Number(tiling.rotationDegrees) : 0.0, -180.0, 180.0)
            : 0.0;

        applyTextureTransform(mat.map, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.normalMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.roughnessMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.metalnessMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.aoMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        return mat;
    }

    _rebuildWallDecorations({ config, layers } = {}) {
        this._clearWallDecorations();
        if (!this._building?.group) return;

        const decorationRoot = config?.wallDecorations && typeof config.wallDecorations === 'object'
            ? config.wallDecorations
            : null;
        const sets = Array.isArray(decorationRoot?.sets) ? decorationRoot.sets : [];
        if (!sets.length) return;

        const bayHighlightByLayer = this._bayHighlightDataByLayerId && typeof this._bayHighlightDataByLayerId === 'object'
            ? this._bayHighlightDataByLayerId
            : null;
        if (!bayHighlightByLayer) return;

        const bayEntriesByLayerId = new Map();
        for (const [layerId, entriesRaw] of Object.entries(bayHighlightByLayer)) {
            const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
            if (!entries.length) continue;

            const byBayRef = new Map();
            const seenSegmentKeysByBayRef = new Map();
            for (const entry of entries) {
                const faceId = isFaceId(entry?.faceId) ? entry.faceId : null;
                const bayId = typeof entry?.bayId === 'string' ? entry.bayId : '';
                if (!faceId || !bayId) continue;
                const x0 = Number(entry.x0);
                const z0 = Number(entry.z0);
                const x1 = Number(entry.x1);
                const z1 = Number(entry.z1);
                const nx = Number(entry?.nx);
                const nz = Number(entry?.nz);
                if (!Number.isFinite(x0) || !Number.isFinite(z0) || !Number.isFinite(x1) || !Number.isFinite(z1)) continue;
                const bayRef = `${faceId}:${bayId}`;
                const scale = 100000.0;
                const pA = `${Math.round(x0 * scale)},${Math.round(z0 * scale)}`;
                const pB = `${Math.round(x1 * scale)},${Math.round(z1 * scale)}`;
                const segmentKey = pA <= pB ? `${pA}|${pB}` : `${pB}|${pA}`;
                let seenSegmentKeys = seenSegmentKeysByBayRef.get(bayRef);
                if (!seenSegmentKeys) {
                    seenSegmentKeys = new Set();
                    seenSegmentKeysByBayRef.set(bayRef, seenSegmentKeys);
                }
                if (seenSegmentKeys.has(segmentKey)) continue;
                seenSegmentKeys.add(segmentKey);
                const bucket = byBayRef.get(bayRef);
                const normalized = {
                    faceId,
                    bayId,
                    x0,
                    z0,
                    x1,
                    z1,
                    ...(Number.isFinite(nx) ? { nx } : {}),
                    ...(Number.isFinite(nz) ? { nz } : {})
                };
                if (bucket) bucket.push(normalized);
                else byBayRef.set(bayRef, [normalized]);
            }

            if (byBayRef.size) bayEntriesByLayerId.set(layerId, byBayRef);
        }
        if (!bayEntriesByLayerId.size) return;

        const floorSegmentsByLayerId = this._computeFloorLayerSegmentsById(layers);
        const floorLayerById = new Map();
        const list = Array.isArray(layers) ? layers : [];
        for (const layer of list) {
            if (layer?.type !== 'floor') continue;
            const id = typeof layer?.id === 'string' ? layer.id : '';
            if (!id) continue;
            if (!floorLayerById.has(id)) floorLayerById.set(id, layer);
        }
        const facadesByLayerId = config?.facades && typeof config.facades === 'object'
            ? config.facades
            : null;

        const resolveMasterFaceIdForLayer = (layer, faceId) => {
            const targetFaceId = isFaceId(faceId) ? faceId : null;
            if (!targetFaceId) return null;
            const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object'
                ? layer.faceLinking.links
                : null;
            if (!links) return targetFaceId;
            const seen = new Set();
            let cur = targetFaceId;
            for (let i = 0; i < 8; i += 1) {
                if (seen.has(cur)) break;
                seen.add(cur);
                const next = links?.[cur] ?? null;
                if (!isFaceId(next) || next === cur) break;
                cur = next;
            }
            return cur;
        };

        const resolveFaceMaterialSpec = (layer, faceId) => {
            const masterFaceId = resolveMasterFaceIdForLayer(layer, faceId);
            if (masterFaceId) {
                const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object'
                    ? layer.faceMaterials
                    : null;
                const faceCfg = faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
                    ? faceMaterials[masterFaceId]
                    : null;
                const faceMaterial = normalizeMaterialSpec(faceCfg?.material ?? null);
                if (faceMaterial) return faceMaterial;
            }
            return normalizeMaterialSpec(layer?.material ?? config?.baseWallMaterial ?? null);
        };

        const resolveLinkedBaySource = (baysById, bayId) => {
            const byId = baysById instanceof Map ? baysById : null;
            const startId = typeof bayId === 'string' ? bayId : '';
            if (!byId || !startId) return null;
            const visited = new Set();
            let curId = startId;
            let current = byId.get(curId) ?? null;
            for (let i = 0; i < 32; i += 1) {
                if (!current || typeof current !== 'object') break;
                if (visited.has(curId)) break;
                visited.add(curId);
                const nextLink = typeof current.materialLinkFromBayId === 'string' && current.materialLinkFromBayId
                    ? current.materialLinkFromBayId
                    : (typeof current.linkFromBayId === 'string' ? current.linkFromBayId : '');
                if (!nextLink || nextLink === curId) break;
                const next = byId.get(nextLink) ?? null;
                if (!next || typeof next !== 'object') break;
                curId = nextLink;
                current = next;
            }
            return current;
        };

        const resolveLinkedBayWindowSource = (baysById, bayId) => {
            const byId = baysById instanceof Map ? baysById : null;
            const startId = typeof bayId === 'string' ? bayId : '';
            if (!byId || !startId) return null;
            const visited = new Set();
            let curId = startId;
            let current = byId.get(curId) ?? null;
            for (let i = 0; i < 32; i += 1) {
                if (!current || typeof current !== 'object') break;
                if (visited.has(curId)) break;
                visited.add(curId);
                const nextLink = typeof current.linkFromBayId === 'string' && current.linkFromBayId
                    ? current.linkFromBayId
                    : (typeof current.materialLinkFromBayId === 'string' ? current.materialLinkFromBayId : '');
                if (!nextLink || nextLink === curId) break;
                const next = byId.get(nextLink) ?? null;
                if (!next || typeof next !== 'object') break;
                curId = nextLink;
                current = next;
            }
            return current;
        };

        const resolveActiveWallMaterialSpec = ({ layerId, layer, faceId, bayId }) => {
            const baseFaceMaterial = resolveFaceMaterialSpec(layer, faceId);
            const layerFacades = facadesByLayerId?.[layerId] && typeof facadesByLayerId[layerId] === 'object'
                ? facadesByLayerId[layerId]
                : null;
            const facade = layerFacades?.[faceId] && typeof layerFacades[faceId] === 'object'
                ? layerFacades[faceId]
                : null;
            const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
            if (!bays.length) return baseFaceMaterial;
            const byId = new Map();
            for (const entry of bays) {
                const id = typeof entry?.id === 'string' ? entry.id : '';
                if (!id || byId.has(id)) continue;
                byId.set(id, entry);
            }
            const sourceBay = resolveLinkedBaySource(byId, bayId);
            const bayMaterial = normalizeMaterialSpec(sourceBay?.wallMaterialOverride ?? null);
            return bayMaterial ?? baseFaceMaterial;
        };

        const resolveActiveBayWindowConfig = ({ layerId, faceId, bayId }) => {
            const layerFacades = facadesByLayerId?.[layerId] && typeof facadesByLayerId[layerId] === 'object'
                ? facadesByLayerId[layerId]
                : null;
            const facade = layerFacades?.[faceId] && typeof layerFacades[faceId] === 'object'
                ? layerFacades[faceId]
                : null;
            const bays = Array.isArray(facade?.layout?.bays?.items) ? facade.layout.bays.items : [];
            if (!bays.length) return null;
            const byId = new Map();
            for (const entry of bays) {
                const id = typeof entry?.id === 'string' ? entry.id : '';
                if (!id || byId.has(id)) continue;
                byId.set(id, entry);
            }
            const sourceBay = resolveLinkedBayWindowSource(byId, bayId);
            const windowCfg = resolveBayWindowFromSpec(sourceBay);
            return windowCfg && typeof windowCfg === 'object' ? windowCfg : null;
        };

        const resolveFloorSegmentsForSet = (layerId, floorIntervalRaw) => {
            const allSegments = Array.isArray(floorSegmentsByLayerId.get(layerId))
                ? floorSegmentsByLayerId.get(layerId)
                : [];
            const count = allSegments.length;
            if (!count) return [];
            const interval = floorIntervalRaw && typeof floorIntervalRaw === 'object' ? floorIntervalRaw : {};
            const start = clampInt(interval.start ?? 1, 1, count);
            const every = clampInt(interval.every ?? 1, 1, 99);
            const endRaw = Number(interval.end);
            const end = Number.isFinite(endRaw) && endRaw > 0
                ? clampInt(endRaw, start, count)
                : count;
            const out = [];
            for (let floor = start; floor <= end; floor += every) {
                const seg = allSegments[floor - 1] ?? null;
                if (seg) out.push(seg);
            }
            return out;
        };

        const up = new THREE.Vector3(0, 1, 0);
        const decorationGroup = new THREE.Group();
        decorationGroup.name = 'bf2_wall_decorations';
        decorationGroup.userData = decorationGroup.userData ?? {};
        decorationGroup.userData.bf2WallDecorations = true;

        for (const set of sets) {
            const layerId = typeof set?.target?.layerId === 'string' ? set.target.layerId : '';
            if (!layerId) continue;

            const byBayRef = bayEntriesByLayerId.get(layerId) ?? null;
            if (!byBayRef || !byBayRef.size) continue;

            const allBayRefs = Array.from(byBayRef.keys());
            const targetBayRefs = set?.target?.allBays === true
                ? allBayRefs
                : (Array.isArray(set?.target?.bayRefs)
                    ? set.target.bayRefs
                        .map((entry) => normalizeDecorationBayRef(entry))
                        .filter((entry, idx, arr) => !!entry && arr.indexOf(entry) === idx && byBayRef.has(entry))
                    : []);
            if (!targetBayRefs.length) continue;

            const floorSegments = resolveFloorSegmentsForSet(layerId, set?.floorInterval);
            if (!floorSegments.length) continue;

            const layer = floorLayerById.get(layerId) ?? null;
            const decorations = Array.isArray(set?.decorations) ? set.decorations : [];

            const setId = typeof set?.id === 'string' ? set.id : '';
            for (const decoration of decorations) {
                if (!decoration || typeof decoration !== 'object') continue;
                const decorationId = typeof decoration?.id === 'string' ? decoration.id : '';
                if (!decorationId) continue;
                const decorationKey = `${setId}:${decorationId}`;

                const safeState = sanitizeWallDecoratorDebuggerState(decoration?.state);
                const span = decoration?.span && typeof decoration.span === 'object' ? decoration.span : {};
                const spanStart = clampUnit(span.start, 0.0);
                const spanEnd = clampUnit(span.end, 1.0);
                const minSpan = Math.min(spanStart, spanEnd);
                const maxSpan = Math.max(spanStart, spanEnd);
                if (maxSpan - minSpan <= EPS) continue;
                const compatibilityId = buildWallDecorationCompatibilityId({
                    safeState,
                    spanStart: minSpan,
                    spanEnd: maxSpan
                });

                const autoCornerByBayRef = decoration?.autoCorner?.byBayRef && typeof decoration.autoCorner.byBayRef === 'object'
                    ? decoration.autoCorner.byBayRef
                    : null;
                const resolvedAutoTargetBayRefs = Array.isArray(decoration?.autoCorner?.resolvedBayRefs)
                    ? decoration.autoCorner.resolvedBayRefs
                        .map((entry) => normalizeDecorationBayRef(entry))
                        .filter((entry, idx, arr) => !!entry && arr.indexOf(entry) === idx && byBayRef.has(entry))
                    : [];
                const resolvedTargetBayRefSet = new Set(targetBayRefs);
                for (const ref of resolvedAutoTargetBayRefs) resolvedTargetBayRefSet.add(ref);
                const resolvedTargetBayRefs = Array.from(resolvedTargetBayRefSet);
                if (!resolvedTargetBayRefs.length) continue;

                const resolvedBayRenderItems = [];
                for (const bayRef of resolvedTargetBayRefs) {
                    const parsedBayRef = parseDecorationBayRef(bayRef);
                    if (!parsedBayRef) continue;
                    const bayEntries = byBayRef.get(bayRef) ?? [];
                    if (!bayEntries.length) continue;
                    const layerMaterialSpec = resolveActiveWallMaterialSpec({
                        layerId,
                        layer,
                        faceId: parsedBayRef.faceId,
                        bayId: parsedBayRef.bayId
                    });
                    const windowConfig = resolveActiveBayWindowConfig({
                        layerId,
                        faceId: parsedBayRef.faceId,
                        bayId: parsedBayRef.bayId
                    });
                    resolvedBayRenderItems.push({
                        bayRef,
                        parsedBayRef,
                        bayEntries,
                        layerMaterialSpec,
                        windowConfig
                    });
                }
                if (!resolvedBayRenderItems.length) continue;

                // Pass 1: resolve all targeted bay segments + compatibility id.
                const endpointAssignmentsByKey = new Map();
                const pushEndpointAssignment = ({ endpointKey, bayRef, faceId, segmentIndex, edge }) => {
                    if (!endpointKey) return;
                    const bucket = endpointAssignmentsByKey.get(endpointKey) ?? [];
                    bucket.push({
                        compatibilityId,
                        bayRef,
                        faceId,
                        segmentIndex: Math.max(0, Math.floor(Number(segmentIndex) || 0)),
                        edge: edge === 'start' ? 'start' : 'end'
                    });
                    endpointAssignmentsByKey.set(endpointKey, bucket);
                };
                for (const item of resolvedBayRenderItems) {
                    const faceId = item?.parsedBayRef?.faceId;
                    const bayRef = item?.bayRef;
                    const bayEntries = Array.isArray(item?.bayEntries) ? item.bayEntries : [];
                    for (let segmentIndex = 0; segmentIndex < bayEntries.length; segmentIndex += 1) {
                        const bayEntry = bayEntries[segmentIndex] ?? null;
                        if (!bayEntry) continue;
                        const startKey = buildWallDecorationEndpointKey(bayEntry.x0, bayEntry.z0);
                        const endKey = buildWallDecorationEndpointKey(bayEntry.x1, bayEntry.z1);
                        pushEndpointAssignment({ endpointKey: startKey, bayRef, faceId, segmentIndex, edge: 'start' });
                        pushEndpointAssignment({ endpointKey: endKey, bayRef, faceId, segmentIndex, edge: 'end' });
                    }
                }
                const resolveEdgeCompatibility = ({ bayRef, faceId, segmentIndex, endpointKey }) => {
                    const out = { any: false, corner: false, sameFace: false };
                    const candidates = Array.isArray(endpointAssignmentsByKey.get(endpointKey))
                        ? endpointAssignmentsByKey.get(endpointKey)
                        : [];
                    for (const candidate of candidates) {
                        if (!candidate || candidate.compatibilityId !== compatibilityId) continue;
                        const sameSegment = candidate.bayRef === bayRef
                            && Number(candidate.segmentIndex) === Number(segmentIndex);
                        if (sameSegment) continue;
                        out.any = true;
                        if (candidate.faceId === faceId) out.sameFace = true;
                        else out.corner = true;
                        if (out.corner && out.sameFace) break;
                    }
                    return out;
                };

                // Pass 2: render each segment using per-edge compatibility (corner/flat/cap ownership).
                for (const bayRenderItem of resolvedBayRenderItems) {
                    const bayRef = bayRenderItem.bayRef;
                    const parsedBayRef = bayRenderItem.parsedBayRef;
                    const layerMaterialSpec = bayRenderItem.layerMaterialSpec;
                    const windowConfig = bayRenderItem.windowConfig;
                    const bayEntries = bayRenderItem.bayEntries;

                    const cornerMeta = autoCornerByBayRef && typeof autoCornerByBayRef[bayRef] === 'object'
                        ? autoCornerByBayRef[bayRef]
                        : null;
                    const cornerStartMeta = cornerMeta?.start === true;
                    const cornerEndMeta = cornerMeta?.end === true;
                    const cornerStartStyle = String(cornerMeta?.startCornerStyle ?? '').trim().toLowerCase() === 'interior'
                        ? 'interior'
                        : 'exterior';
                    const cornerEndStyle = String(cornerMeta?.endCornerStyle ?? '').trim().toLowerCase() === 'interior'
                        ? 'interior'
                        : 'exterior';
                    const cornerStartRelation = String(cornerMeta?.startCornerRelation ?? '').trim().toLowerCase() === 'same_face'
                        ? 'same_face'
                        : 'face_boundary';
                    const cornerEndRelation = String(cornerMeta?.endCornerRelation ?? '').trim().toLowerCase() === 'same_face'
                        ? 'same_face'
                        : 'face_boundary';
                    const continuationStartMeters = clamp(cornerMeta?.continuationStartMeters, 0.0, 32.0);
                    const continuationEndMeters = clamp(cornerMeta?.continuationEndMeters, 0.0, 32.0);

                    for (let bayEntryIndex = 0; bayEntryIndex < bayEntries.length; bayEntryIndex += 1) {
                        const bayEntry = bayEntries[bayEntryIndex];
                        if (!bayEntry || typeof bayEntry !== 'object') continue;
                        const startKey = buildWallDecorationEndpointKey(bayEntry.x0, bayEntry.z0);
                        const endKey = buildWallDecorationEndpointKey(bayEntry.x1, bayEntry.z1);
                        const startEdgeCompatibility = resolveEdgeCompatibility({
                            bayRef,
                            faceId: parsedBayRef.faceId,
                            segmentIndex: bayEntryIndex,
                            endpointKey: startKey
                        });
                        const endEdgeCompatibility = resolveEdgeCompatibility({
                            bayRef,
                            faceId: parsedBayRef.faceId,
                            segmentIndex: bayEntryIndex,
                            endpointKey: endKey
                        });
                        const cornerStart = startEdgeCompatibility.corner || cornerStartMeta;
                        const cornerEnd = endEdgeCompatibility.corner || cornerEndMeta;
                        const useCornerMode = cornerStart || cornerEnd;
                        const reverseForCornerStart = cornerStart && !cornerEnd;
                        const activeCornerStyle = useCornerMode
                            ? ((cornerStart && cornerStartStyle === 'interior') || (cornerEnd && cornerEndStyle === 'interior')
                                ? 'interior'
                                : (reverseForCornerStart ? cornerStartStyle : cornerEndStyle))
                            : 'exterior';
                        const activeCornerRelation = useCornerMode
                            ? (reverseForCornerStart ? cornerStartRelation : cornerEndRelation)
                            : 'face_boundary';
                        const isInteriorCorner = useCornerMode && activeCornerStyle === 'interior';
                        const hasSameFaceStartTransition = cornerStartMeta
                            && cornerStartRelation === 'same_face'
                            && continuationStartMeters > 1e-6
                            && (startEdgeCompatibility.sameFace || !startEdgeCompatibility.any);
                        const hasSameFaceEndTransition = cornerEndMeta
                            && cornerEndRelation === 'same_face'
                            && continuationEndMeters > 1e-6
                            && (endEdgeCompatibility.sameFace || !endEdgeCompatibility.any);
                        const hasBoundaryStartTransition = cornerStartMeta
                            && cornerStartRelation === 'face_boundary'
                            && continuationStartMeters > 1e-6
                            && (startEdgeCompatibility.corner || !startEdgeCompatibility.any);
                        const hasBoundaryEndTransition = cornerEndMeta
                            && cornerEndRelation === 'face_boundary'
                            && continuationEndMeters > 1e-6
                            && (endEdgeCompatibility.corner || !endEdgeCompatibility.any);
                        const hasContinuationStartTransition = hasSameFaceStartTransition || hasBoundaryStartTransition;
                        const hasContinuationEndTransition = hasSameFaceEndTransition || hasBoundaryEndTransition;
                        const hasCompatibleStartCornerEdge = startEdgeCompatibility.corner;
                        const hasCompatibleEndCornerEdge = endEdgeCompatibility.corner;
                        const p0 = new THREE.Vector3(Number(bayEntry.x0) || 0.0, 0.0, Number(bayEntry.z0) || 0.0);
                        const p1 = new THREE.Vector3(Number(bayEntry.x1) || 0.0, 0.0, Number(bayEntry.z1) || 0.0);
                        const bayLength = p1.distanceTo(p0);
                        if (bayLength <= EPS) continue;

                        const spanWorldStart = p0.clone().lerp(p1, minSpan);
                        const spanWorldEnd = p0.clone().lerp(p1, maxSpan);
                        if (spanWorldEnd.distanceTo(spanWorldStart) <= EPS) continue;

                        const segmentStartCanonical = spanWorldStart;
                        const segmentEndCanonical = spanWorldEnd;
                        let segmentStartOriented = segmentStartCanonical;
                        let segmentEndOriented = segmentEndCanonical;
                        if (reverseForCornerStart) {
                            segmentStartOriented = segmentEndCanonical;
                            segmentEndOriented = segmentStartCanonical;
                        }

                        const frontTangent = segmentEndOriented.clone().sub(segmentStartOriented);
                        const spanMeters = frontTangent.length();
                        if (spanMeters <= EPS) continue;
                        frontTangent.multiplyScalar(1 / spanMeters);
                        const frontTangentCanonical = segmentEndCanonical.clone().sub(segmentStartCanonical);
                        if (frontTangentCanonical.lengthSq() <= EPS) continue;
                        frontTangentCanonical.normalize();

                        const frontNormal = new THREE.Vector3(Number(bayEntry?.nx) || 0.0, 0.0, Number(bayEntry?.nz) || 0.0);
                        if (frontNormal.lengthSq() <= EPS) {
                            const faceNormal = getFaceNormalVector(parsedBayRef.faceId);
                            if (!faceNormal || faceNormal.lengthSq() <= EPS) continue;
                            frontNormal.copy(faceNormal);
                        }
                        frontNormal.normalize();

                        const segmentCanonicalStartMeters = bayLength * minSpan;
                        const segmentCanonicalEndMeters = bayLength * maxSpan;

                        const stateForBay = sanitizeWallDecoratorDebuggerState({
                            ...safeState,
                            mode: useCornerMode ? 'corner' : 'face'
                        });
                        const stateForFace = sanitizeWallDecoratorDebuggerState({
                            ...safeState,
                            mode: 'face'
                        });
                        const stateForCorner = sanitizeWallDecoratorDebuggerState({
                            ...safeState,
                            mode: 'corner'
                        });

                        for (const floorSeg of floorSegments) {
                            const startY = Number(floorSeg?.startY);
                            const endY = Number(floorSeg?.endY);
                            if (!Number.isFinite(startY) || !Number.isFinite(endY)) continue;
                            const wallHeight = Math.max(0.05, endY - startY);
                            const wallCenterY = (startY + endY) * 0.5;
                            const continuationMeters = reverseForCornerStart
                                ? continuationStartMeters
                                : continuationEndMeters;
                            const hasCornerContinuationTransition = useCornerMode
                                && continuationMeters > 1e-6
                                && (activeCornerRelation === 'same_face' || activeCornerRelation === 'face_boundary');
                            const wallDepth = clamp(
                                WALL_DECORATION_DEFAULT_WALL_DEPTH_M + continuationMeters,
                                0.05,
                                32.0
                            );
                            let renderSegmentStart = segmentStartOriented;
                            let renderSegmentEnd = segmentEndOriented;
                            let renderFrontTangent = frontTangent;
                            let reverseSegmentForOccluders = reverseForCornerStart;
                            let usingFlatCapFamilyPipeline = false;
                            let openingSplitByAreas = false;

                            const faceSpecs = buildWallDecoratorShapeSpecs(stateForFace, {
                                widthMeters: spanMeters,
                                heightMeters: wallHeight,
                                depthMeters: wallDepth
                            });
                            const canUseFlatCapFamily = hasFlatCapFamilyFrontSpecs(faceSpecs);
                            if (canUseFlatCapFamily) {
                                usingFlatCapFamilyPipeline = true;
                                renderSegmentStart = segmentStartCanonical;
                                renderSegmentEnd = segmentEndCanonical;
                                renderFrontTangent = frontTangentCanonical;
                                reverseSegmentForOccluders = false;
                            }

                            const openingOccluders = buildBayOpeningOccludersForDecorationSegment({
                                windowConfig,
                                bayLengthMeters: bayLength,
                                segmentCanonicalStartMeters,
                                segmentCanonicalEndMeters,
                                segmentSpanMeters: spanMeters,
                                reverseSegment: reverseSegmentForOccluders,
                                floorStartY: startY,
                                floorEndY: endY
                            });
                            let specs = null;
                            if (canUseFlatCapFamily) {
                                const referenceMain = resolveFlatCapFamilyFrontMainSpec(faceSpecs);
                                if (referenceMain) {
                                    openingSplitByAreas = true;
                                    const refWidth = Math.max(0.01, Number(referenceMain.widthMeters) || 0.01);
                                    const refCenter = Number(referenceMain.centerU) || 0.0;
                                    const drawMinU = refCenter - refWidth * 0.5;
                                    const drawMaxU = refCenter + refWidth * 0.5;
                                    const refHeight = Math.max(0.01, Number(referenceMain.heightMeters) || 0.01);
                                    const refCenterV = Number(referenceMain.centerV) || 0.0;
                                    const drawMinY = wallCenterY + refCenterV - refHeight * 0.5;
                                    const drawMaxY = wallCenterY + refCenterV + refHeight * 0.5;
                                    const sections = computeFrontDecorationDrawSections({
                                        uMin: drawMinU,
                                        uMax: drawMaxU,
                                        yMin: drawMinY,
                                        yMax: drawMaxY,
                                        openingOccluders,
                                        minSectionWidthMeters: 0.01
                                    });
                                    const edgeOffsetMeters = resolveFlatCapFamilyFrontOffsetMeters(faceSpecs, 0.05);
                                    const cornerSpecs = (hasContinuationStartTransition || hasContinuationEndTransition)
                                        ? buildWallDecoratorShapeSpecs(stateForCorner, {
                                            widthMeters: spanMeters,
                                            heightMeters: wallHeight,
                                            depthMeters: wallDepth
                                        })
                                        : [];
                                    specs = [];
                                    const boundaryEps = 1e-4;
                                    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
                                        const section = sections[sectionIndex];
                                        if (!section || !(section.maxU > section.minU + 0.01)) continue;
                                        const touchesWallStart = Math.abs(section.minU - drawMinU) <= boundaryEps;
                                        const touchesWallEnd = Math.abs(section.maxU - drawMaxU) <= boundaryEps;
                                        const sectionSpecs = buildFlatCapFamilyFrontSectionSpecs(faceSpecs, {
                                            sectionMinU: section.minU,
                                            sectionMaxU: section.maxU,
                                            sectionIndex
                                        });
                                        const sectionWithEdges = adjustFlatCapFamilyFrontSpecsForEdges(sectionSpecs, {
                                            offsetMeters: edgeOffsetMeters,
                                            extendStart: hasCompatibleStartCornerEdge && touchesWallStart,
                                            extendEnd: hasCompatibleEndCornerEdge && touchesWallEnd,
                                            hideStartCap: (
                                                (hasCompatibleStartCornerEdge || cornerStartMeta)
                                                && touchesWallStart
                                            ),
                                            hideEndCap: (
                                                (hasCompatibleEndCornerEdge || cornerEndMeta)
                                                && touchesWallEnd
                                            )
                                        });
                                        specs.push(...sectionWithEdges);

                                        const sectionSuffix = `_section_${String(sectionIndex + 1).padStart(2, '0')}`;
                                        if (hasContinuationStartTransition && touchesWallStart) {
                                            const startContinuation = buildFlatCapFamilySameFaceContinuationSpecs(cornerSpecs, {
                                                continuationMeters: continuationStartMeters,
                                                edge: 'start',
                                                cornerStyle: cornerStartStyle
                                            }).map((entry) => ({
                                                ...entry,
                                                role: `${String(entry.role ?? 'decorator')}${sectionSuffix}_start`
                                            }));
                                            specs.push(...startContinuation);
                                        }
                                        if (hasContinuationEndTransition && touchesWallEnd) {
                                            const endContinuation = buildFlatCapFamilySameFaceContinuationSpecs(cornerSpecs, {
                                                continuationMeters: continuationEndMeters,
                                                edge: 'end',
                                                cornerStyle: cornerEndStyle
                                            }).map((entry) => ({
                                                ...entry,
                                                role: `${String(entry.role ?? 'decorator')}${sectionSuffix}_end`
                                            }));
                                            specs.push(...endContinuation);
                                        }
                                    }
                                }
                            }
                            if (!Array.isArray(specs)) {
                                specs = buildWallDecoratorShapeSpecs(stateForBay, {
                                    widthMeters: spanMeters,
                                    heightMeters: wallHeight,
                                    depthMeters: wallDepth
                                });
                            }
                            if (!Array.isArray(specs) || !specs.length) continue;

                            const wallStart = renderSegmentStart.clone();
                            const wallEnd = renderSegmentEnd.clone();
                            const wallCenter = wallStart.clone().add(wallEnd).multiplyScalar(0.5);

                            for (const spec of specs) {
                                const specGeometryKind = String(spec?.geometryKind ?? '').trim().toLowerCase();
                                let specForMesh = isInteriorCorner
                                    ? ((specGeometryKind === 'curved_ring' || specGeometryKind === 'half_dome' || specGeometryKind === 'edge_brick_chain_course')
                                        ? { ...spec, miterStyle: 'inward' }
                                        : spec)
                                    : spec;

                                if (!usingFlatCapFamilyPipeline
                                    && hasCornerContinuationTransition
                                    && String(specForMesh?.faceId ?? '').trim().toLowerCase() === 'right') {
                                    const widthOld = Math.max(0.01, Number(specForMesh?.widthMeters) || 0.01);
                                    const centerUOld = Number(specForMesh?.centerU) || 0.0;
                                    const minUOld = centerUOld - widthOld * 0.5;
                                    const widthNew = clamp(continuationMeters, 0.01, 32.0);
                                    const minUNew = minUOld;
                                    const maxUNew = minUNew + widthNew;
                                    specForMesh = {
                                        ...specForMesh,
                                        ...(specGeometryKind === 'flat_panel_side_cap'
                                            ? { centerU: maxUNew }
                                            : {
                                                widthMeters: widthNew,
                                                centerU: (minUNew + maxUNew) * 0.5
                                            }),
                                        ...(specGeometryKind === 'flat_panel_cap'
                                            ? {
                                                cornerBridgeStartMeters: clamp(specForMesh?.cornerBridgeStartMeters, 0.0, 32.0),
                                                cornerBridgeEndMeters: clamp(specForMesh?.cornerBridgeEndMeters, 0.0, 32.0)
                                            }
                                            : {})
                                    };
                                    // Keep cap bridge on the non-corner edge limited to the trimmed span.
                                    if (specGeometryKind === 'flat_panel_cap') {
                                        const bridgeStart = clamp(specForMesh?.cornerBridgeStartMeters, 0.0, 32.0);
                                        const bridgeEnd = clamp(specForMesh?.cornerBridgeEndMeters, 0.0, 32.0);
                                        if (bridgeStart > widthNew + 1e-6 || bridgeEnd > widthNew + 1e-6) {
                                            specForMesh.cornerBridgeStartMeters = Math.min(bridgeStart, widthNew);
                                            specForMesh.cornerBridgeEndMeters = Math.min(bridgeEnd, widthNew);
                                        }
                                    }
                                }
                                const clippedSpecs = openingSplitByAreas
                                    ? [specForMesh]
                                    : splitWallDecorationSpecByOpeningOccluders(specForMesh, {
                                        openingOccluders,
                                        wallCenterY
                                    });
                                for (const clippedSpec of clippedSpecs) {
                                    const built = createWallDecorationGeometryFromSpec(clippedSpec);
                                    const geometry = built?.geometry?.isBufferGeometry ? built.geometry : null;
                                    if (!geometry) continue;

                                    const specFace = String(clippedSpec?.faceId ?? '').trim().toLowerCase() === 'right' ? 'right' : 'front';
                                    const geometryKind = String(built?.geometryKind ?? clippedSpec?.geometryKind ?? '').trim().toLowerCase();
                                    const rightCornerEdge = String(clippedSpec?.__bf2CornerEdge ?? '').trim().toLowerCase() === 'start'
                                        ? 'start'
                                        : 'end';
                                    const rightCornerStyle = String(clippedSpec?.__bf2CornerStyle ?? '').trim().toLowerCase() === 'interior'
                                        ? 'interior'
                                        : (isInteriorCorner ? 'interior' : 'exterior');

                                    const frontUAxis = renderFrontTangent.clone();
                                    const frontNAxis = frontNormal.clone();
                                    const rightUAxis = frontNormal.clone().multiplyScalar(-1.0);
                                    const rightNAxisBase = renderFrontTangent.clone().multiplyScalar(rightCornerStyle === 'interior' ? -1.0 : 1.0);
                                    const rightNAxis = rightCornerEdge === 'start'
                                        ? rightNAxisBase.clone().multiplyScalar(-1.0)
                                        : rightNAxisBase;

                                    const uAxis = specFace === 'right' ? rightUAxis : frontUAxis;
                                    const nAxis = specFace === 'right' ? rightNAxis : frontNAxis;
                                    if (uAxis.lengthSq() <= EPS || nAxis.lengthSq() <= EPS) {
                                        geometry.dispose?.();
                                        continue;
                                    }
                                    uAxis.normalize();
                                    nAxis.normalize();

                                    if (Math.abs(uAxis.dot(nAxis)) > 0.999) {
                                        geometry.dispose?.();
                                        continue;
                                    }

                                    const xAxis = uAxis;
                                    const yAxis = up.clone();
                                    const zAxis = nAxis;
                                    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
                                    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
                                    const yawDegrees = clamp(
                                        Number.isFinite(Number(clippedSpec?.yawDegrees)) ? Number(clippedSpec.yawDegrees) : 0.0,
                                        -180.0,
                                        180.0
                                    );
                                    const yawRadians = yawDegrees * Math.PI / 180.0;
                                    if (Math.abs(yawRadians) > 1e-8) {
                                        const yaw = new THREE.Quaternion().setFromAxisAngle(up, yawRadians);
                                        quaternion.multiply(yaw);
                                    }

                                    const centerU = Number(clippedSpec?.centerU) || 0.0;
                                    const centerV = Number(clippedSpec?.centerV) || 0.0;
                                    const outsetMeters = Math.max(0.0, Number(clippedSpec?.outsetMeters ?? clippedSpec?.surfaceOffsetMeters) || 0.0);
                                    const placementDepthMeters = Math.max(0.0, Number(built?.placementDepthMeters) || 0.0);
                                    const anchor = specFace === 'right'
                                        ? (rightCornerEdge === 'start' ? wallStart : wallEnd)
                                        : wallCenter;

                                    const surfaceWidthMeters = clamp(
                                        Number.isFinite(Number(built?.surfaceWidthMeters)) ? Number(built.surfaceWidthMeters) : (Number(clippedSpec?.widthMeters) || 1.0),
                                        0.01,
                                        256.0
                                    );
                                    const surfaceHeightMeters = clamp(
                                        Number.isFinite(Number(built?.surfaceHeightMeters)) ? Number(built.surfaceHeightMeters) : (Number(clippedSpec?.heightMeters) || 0.2),
                                        0.01,
                                        256.0
                                    );
                                    const material = this._resolveWallDecorationMaterial(stateForBay, {
                                        layerMaterialSpec,
                                        surfaceSizeMeters: { x: surfaceWidthMeters, y: surfaceHeightMeters },
                                        geometryKind
                                    });
                                    const mesh = new THREE.Mesh(geometry, material);
                                    mesh.name = `bf2_wall_decoration_${String(clippedSpec?.role ?? geometryKind ?? 'mesh')}`;
                                    mesh.position.copy(anchor);
                                    mesh.position.addScaledVector(uAxis, centerU);
                                    mesh.position.addScaledVector(up, wallCenterY + centerV);
                                    mesh.position.addScaledVector(nAxis, outsetMeters + placementDepthMeters * 0.5);
                                    mesh.quaternion.copy(quaternion);
                                    mesh.castShadow = true;
                                    mesh.receiveShadow = true;
                                    mesh.userData = mesh.userData ?? {};
                                    mesh.userData.decorationKey = decorationKey;
                                    mesh.userData.decorationCompatibilityId = compatibilityId;
                                    mesh.userData.faceId = specFace;
                                    mesh.userData.role = String(clippedSpec?.role ?? 'decorator');
                                    mesh.userData.geometryKind = geometryKind || 'unknown';
                                    decorationGroup.add(mesh);
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!decorationGroup.children.length) {
            disposeObject3D(decorationGroup);
            return;
        }

        this._building.group.add(decorationGroup);
        this._wallDecorationsGroup = decorationGroup;
        this._building.decorationGroup = decorationGroup;
        this._syncBuildingRenderMode();
    }

    _syncSceneWireframe() {
        if (!this.root) return;
        const enabled = this._showWireframe;
        const floor = this.world?.floor ?? null;
        const tiles = this.world?.groundTiles ?? null;

        const setMaterialWireframe = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            if (!('wireframe' in mat)) return;

            if (enabled) {
                if (!this._wireframeOriginalByMaterial.has(mat)) {
                    this._wireframeOriginalByMaterial.set(mat, !!mat.wireframe);
                }
                if (!mat.wireframe) {
                    mat.wireframe = true;
                    mat.needsUpdate = true;
                }
                return;
            }

            if (!this._wireframeOriginalByMaterial.has(mat)) return;
            const prev = this._wireframeOriginalByMaterial.get(mat);
            if (mat.wireframe !== prev) {
                mat.wireframe = prev;
                mat.needsUpdate = true;
            }
        };

        this.root.traverse((obj) => {
            if (!obj?.isMesh && !obj?.isInstancedMesh) return;
            if (obj === floor || obj === tiles) return;

            const mat = obj.material ?? null;
            if (Array.isArray(mat)) {
                for (const m of mat) setMaterialWireframe(m);
                return;
            }
            setMaterialWireframe(mat);
        });

        if (!enabled) this._wireframeOriginalByMaterial = new WeakMap();
    }

    _syncSceneBackground() {
        if (!this.scene) return;
        this.scene.background = this._renderSkyEnabled ? this._backgroundColor : null;
    }

    _clearFaceHighlight() {
        if (!this._faceHighlightLine) return;
        this._faceHighlightLine.removeFromParent();
        disposeObject3D(this._faceHighlightLine);
        this._faceHighlightLine = null;
    }

    _clearHoverHighlight() {
        if (!this._hoverHighlightLine) return;
        this._hoverHighlightLine.removeFromParent();
        disposeObject3D(this._hoverHighlightLine);
        this._hoverHighlightLine = null;
    }

    _clearHoveredBayOverlay() {
        if (!this._hoveredBayOverlay) return;
        this._hoveredBayOverlay.removeFromParent();
        disposeObject3D(this._hoveredBayOverlay);
        this._hoveredBayOverlay = null;
    }

    _clearSupportSlab() {
        if (!this._supportSlabMesh) return;
        this._supportSlabMesh.removeFromParent();
        disposeObject3D(this._supportSlabMesh);
        this._supportSlabMesh = null;
    }

    _clearRulerLine() {
        if (!this._rulerLine) return;
        this._rulerLine.removeFromParent();
        disposeObject3D(this._rulerLine);
        this._rulerLine = null;
    }

    _clearLayoutOverlays() {
        if (this._layoutFaceOverlay) {
            this._layoutFaceOverlay.removeFromParent();
            disposeObject3D(this._layoutFaceOverlay);
            this._layoutFaceOverlay = null;
        }
        if (this._layoutFaceLine) {
            this._layoutFaceLine.removeFromParent();
            disposeObject3D(this._layoutFaceLine);
            this._layoutFaceLine = null;
        }
        if (this._layoutWidthGuideLine) {
            this._layoutWidthGuideLine.removeFromParent();
            disposeObject3D(this._layoutWidthGuideLine);
            this._layoutWidthGuideLine = null;
        }
        if (this._layoutVertexRing) {
            this._layoutVertexRing.removeFromParent();
            disposeObject3D(this._layoutVertexRing);
            this._layoutVertexRing = null;
        }
    }

    _getLayoutLoopFaceVertices(loop, faceId) {
        const points = Array.isArray(loop) ? loop : [];
        if (points.length < 4) return null;
        switch (faceId) {
            case 'A': return { a: points[0], b: points[1] };
            case 'B': return { a: points[1], b: points[2] };
            case 'C': return { a: points[2], b: points[3] };
            case 'D': return { a: points[3], b: points[0] };
            default: return null;
        }
    }

    _syncLayoutEditOverlays() {
        this._clearLayoutOverlays();

        if (!this.root || !this._layoutAdjustEnabled || !this._building) return;
        const loop = Array.isArray(this._layoutLoop) ? this._layoutLoop : null;
        if (!loop || loop.length < 4) return;

        const baseY = this.getLayoutEditPlaneY();
        const topY = this._focusBox && Number.isFinite(this._focusBox.max.y)
            ? Number(this._focusBox.max.y)
            : (baseY + 1.0);
        const yHeight = Math.max(0.5, topY - baseY);
        const widthGuideFaceIds = Array.isArray(this._layoutWidthGuideFaceIds) ? this._layoutWidthGuideFaceIds : [];
        if (widthGuideFaceIds.length) {
            const seen = new Set();
            const positions = [];
            for (const faceId of widthGuideFaceIds) {
                if (!isFaceId(faceId) || seen.has(faceId)) continue;
                seen.add(faceId);
                const edge = this._getLayoutLoopFaceVertices(loop, faceId);
                const a = edge?.a ?? null;
                const b = edge?.b ?? null;
                if (!a || !b) continue;
                positions.push(
                    Number(a.x) || 0, baseY + LAYOUT_WIDTH_GUIDE_Y_LIFT, Number(a.z) || 0,
                    Number(b.x) || 0, baseY + LAYOUT_WIDTH_GUIDE_Y_LIFT, Number(b.z) || 0
                );
            }
            if (positions.length >= 6) {
                const lineGeo = new LineSegmentsGeometry();
                lineGeo.setPositions(positions);
                const lineMat = new LineMaterial({
                    color: LAYOUT_WIDTH_GUIDE_COLOR,
                    linewidth: LAYOUT_WIDTH_GUIDE_LINEWIDTH,
                    worldUnits: false,
                    transparent: true,
                    opacity: LAYOUT_WIDTH_GUIDE_OPACITY,
                    depthTest: false,
                    depthWrite: false
                });
                if (this.engine?.renderer) {
                    const size = this.engine.renderer.getSize(this._lineResolution);
                    lineMat.resolution.set(size.x, size.y);
                }
                const line = new LineSegments2(lineGeo, lineMat);
                line.name = 'bf2_layout_width_guides';
                line.renderOrder = 209;
                line.frustumCulled = false;
                this.root.add(line);
                this._layoutWidthGuideLine = line;
            }
        }

        const faceId = this._layoutHoverFaceId;
        if (faceId) {
            const edge = this._getLayoutLoopFaceVertices(loop, faceId);
            const a = edge?.a ?? null;
            const b = edge?.b ?? null;
            if (a && b) {
                const dx = (Number(b.x) || 0) - (Number(a.x) || 0);
                const dz = (Number(b.z) || 0) - (Number(a.z) || 0);
                const len = Math.hypot(dx, dz);
                if (len > EPS) {
                    const tx = dx / len;
                    const tz = dz / len;
                    const nxRaw = { x: tz, z: -tx };
                    const cx = loop.reduce((sum, p) => sum + (Number(p?.x) || 0), 0) / loop.length;
                    const cz = loop.reduce((sum, p) => sum + (Number(p?.z) || 0), 0) / loop.length;
                    const mid = { x: (Number(a.x) + Number(b.x)) * 0.5, z: (Number(a.z) + Number(b.z)) * 0.5 };
                    const toMid = { x: mid.x - cx, z: mid.z - cz };
                    const dot = nxRaw.x * toMid.x + nxRaw.z * toMid.z;
                    const nx = dot >= 0 ? nxRaw.x : -nxRaw.x;
                    const nz = dot >= 0 ? nxRaw.z : -nxRaw.z;

                    const faceGeo = new THREE.PlaneGeometry(len, yHeight, 1, 1);
                    const faceMat = new THREE.MeshBasicMaterial({
                        color: LAYOUT_FACE_OVERLAY_COLOR,
                        transparent: true,
                        opacity: LAYOUT_FACE_OVERLAY_OPACITY,
                        depthTest: false,
                        depthWrite: false,
                        side: THREE.DoubleSide
                    });
                    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
                    faceMesh.name = `bf2_layout_face_overlay_${faceId}`;
                    faceMesh.renderOrder = 210;
                    faceMesh.position.set(mid.x, baseY + yHeight * 0.5, mid.z);
                    const basisX = new THREE.Vector3(tx, 0, tz);
                    const basisY = new THREE.Vector3(0, 1, 0);
                    const basisZ = new THREE.Vector3(nx, 0, nz);
                    const basis = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);
                    faceMesh.quaternion.setFromRotationMatrix(basis);
                    this.root.add(faceMesh);

                    const lineGeo = new LineSegmentsGeometry();
                    lineGeo.setPositions([a.x, baseY + LAYOUT_FACE_LINE_Y_LIFT, a.z, b.x, baseY + LAYOUT_FACE_LINE_Y_LIFT, b.z]);
                    const lineMat = new LineMaterial({
                        color: FACE_HIGHLIGHT_COLOR,
                        linewidth: FACE_HIGHLIGHT_LINEWIDTH,
                        worldUnits: false,
                        transparent: true,
                        opacity: FACE_HIGHLIGHT_OPACITY,
                        depthTest: false,
                        depthWrite: false
                    });
                    if (this.engine?.renderer) {
                        const size = this.engine.renderer.getSize(this._lineResolution);
                        lineMat.resolution.set(size.x, size.y);
                    }
                    const line = new LineSegments2(lineGeo, lineMat);
                    line.name = `bf2_layout_face_line_${faceId}`;
                    line.renderOrder = 211;
                    line.frustumCulled = false;
                    this.root.add(line);

                    this._layoutFaceOverlay = faceMesh;
                    this._layoutFaceLine = line;
                }
            }
        }

        if (Number.isInteger(this._layoutHoverVertexIndex) && this._layoutHoverVertexIndex >= 0 && this._layoutHoverVertexIndex < loop.length) {
            const p = loop[this._layoutHoverVertexIndex];
            const x = Number(p?.x);
            const z = Number(p?.z);
            if (Number.isFinite(x) && Number.isFinite(z)) {
                const geo = new THREE.TorusGeometry(LAYOUT_VERTEX_RING_RADIUS, LAYOUT_VERTEX_RING_TUBE, 12, 32);
                const mat = new THREE.MeshBasicMaterial({
                    color: LAYOUT_VERTEX_RING_COLOR,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                    depthWrite: false
                });
                const ring = new THREE.Mesh(geo, mat);
                ring.name = `bf2_layout_vertex_ring_${this._layoutHoverVertexIndex}`;
                ring.rotation.x = Math.PI * 0.5;
                ring.position.set(x, baseY + 0.08, z);
                ring.renderOrder = 212;
                ring.frustumCulled = false;
                this.root.add(ring);
                this._layoutVertexRing = ring;
            }
        }
    }

    _syncFaceHighlight() {
        this._clearFaceHighlight();

        if (this._layoutAdjustEnabled) return;
        if (!this.root || !this._building || !this._selectedFaceId || !this._focusBox) return;

        const faceId = this._selectedFaceId;
        const box = this._focusBox;
        const minX = box.min.x;
        const maxX = box.max.x;
        const minZ = box.min.z;
        const maxZ = box.max.z;
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;

        const baseLayerId = this._activeFaceLayerId ?? this._hoveredFloorLayerId;
        const range = baseLayerId ? (this._floorLayerYRangeById.get(baseLayerId) ?? null) : null;
        const baseY = Number.isFinite(range?.startY) ? Number(range.startY) : (Number.isFinite(box.min.y) ? box.min.y : 0);
        const y = baseY + FACE_HIGHLIGHT_Y_LIFT;

        let positions = null;
        switch (faceId) {
            case 'A':
                positions = [minX, y, maxZ, maxX, y, maxZ];
                break;
            case 'C':
                positions = [minX, y, minZ, maxX, y, minZ];
                break;
            case 'B':
                positions = [maxX, y, minZ, maxX, y, maxZ];
                break;
            case 'D':
                positions = [minX, y, minZ, minX, y, maxZ];
                break;
            default:
                return;
        }

        const geo = new LineSegmentsGeometry();
        geo.setPositions(positions);

        const mat = new LineMaterial({
            color: FACE_HIGHLIGHT_COLOR,
            linewidth: FACE_HIGHLIGHT_LINEWIDTH,
            worldUnits: false,
            transparent: true,
            opacity: FACE_HIGHLIGHT_OPACITY,
            depthTest: false,
            depthWrite: false
        });

        if (this.engine?.renderer) {
            const size = this.engine.renderer.getSize(this._lineResolution);
            mat.resolution.set(size.x, size.y);
        }

        const line = new LineSegments2(geo, mat);
        line.name = `bf2_face_${faceId}`;
        line.renderOrder = 180;
        line.frustumCulled = false;
        line.visible = !this._suppressFaceHighlight;
        this.root.add(line);
        this._faceHighlightLine = line;
    }

    _syncHoverHighlight() {
        this._clearHoverHighlight();

        if (!this.root || !this._building || !this._focusBox) return;
        const layerId = this._hoveredFloorLayerId;
        if (!layerId) return;
        const range = this._floorLayerYRangeById.get(layerId) ?? null;
        if (!range) return;

        const box = this._focusBox;
        const minX = box.min.x;
        const maxX = box.max.x;
        const minZ = box.min.z;
        const maxZ = box.max.z;
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;

        const y0 = Number(range.startY) + 0.002;
        const y1 = Number(range.endY) + 0.002;
        if (!(y1 > y0 + EPS)) return;

        const positions = [];
        const indices = [];
        const pushQuad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) => {
            const base = positions.length / 3;
            positions.push(
                ax, ay, az,
                bx, by, bz,
                cx, cy, cz,
                dx, dy, dz
            );
            indices.push(
                base, base + 1, base + 2,
                base, base + 2, base + 3
            );
        };

        // A (front +Z)
        pushQuad(minX, y0, maxZ, maxX, y0, maxZ, maxX, y1, maxZ, minX, y1, maxZ);
        // B (right +X)
        pushQuad(maxX, y0, maxZ, maxX, y0, minZ, maxX, y1, minZ, maxX, y1, maxZ);
        // C (back -Z)
        pushQuad(maxX, y0, minZ, minX, y0, minZ, minX, y1, minZ, maxX, y1, minZ);
        // D (left -X)
        pushQuad(minX, y0, minZ, minX, y0, maxZ, minX, y1, maxZ, minX, y1, minZ);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
            color: LAYER_HIGHLIGHT_COLOR,
            transparent: true,
            opacity: LAYER_HIGHLIGHT_OPACITY,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `bf2_layer_${layerId}`;
        mesh.renderOrder = 170;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        this.root.add(mesh);
        this._hoverHighlightLine = mesh;
    }

    _syncHoveredBayOverlay() {
        this._clearHoveredBayOverlay();

        if (!this.root || !this._building) return;
        const hovered = this._hoveredBay && typeof this._hoveredBay === 'object' ? this._hoveredBay : null;
        if (!hovered) return;
        const layerId = typeof hovered.layerId === 'string' ? hovered.layerId : '';
        const faceId = isFaceId(hovered.faceId) ? hovered.faceId : null;
        const bayId = typeof hovered.bayId === 'string' ? hovered.bayId : '';
        if (!layerId || !faceId || !bayId) return;

        const byLayerId = this._bayHighlightDataByLayerId && typeof this._bayHighlightDataByLayerId === 'object'
            ? this._bayHighlightDataByLayerId
            : null;
        const entries = Array.isArray(byLayerId?.[layerId]) ? byLayerId[layerId] : null;
        if (!entries || !entries.length) return;

        const range = this._floorLayerYRangeById.get(layerId) ?? null;
        const y0 = Number(range?.startY);
        const y1 = Number(range?.endY);
        if (!Number.isFinite(y0) || !Number.isFinite(y1) || !(y1 > y0 + EPS)) return;

        const positions = [];
        const indices = [];
        let vCursor = 0;
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;
            if ((entry.faceId ?? null) !== faceId) continue;
            if ((entry.bayId ?? null) !== bayId) continue;

            const x0 = Number(entry.x0);
            const z0 = Number(entry.z0);
            const x1 = Number(entry.x1);
            const z1 = Number(entry.z1);
            if (!Number.isFinite(x0) || !Number.isFinite(z0) || !Number.isFinite(x1) || !Number.isFinite(z1)) continue;
            if (Math.hypot(x1 - x0, z1 - z0) <= EPS) continue;

            positions.push(
                x0, y0, z0,
                x1, y0, z1,
                x1, y1, z1,
                x0, y1, z0
            );
            indices.push(
                vCursor, vCursor + 1, vCursor + 2,
                vCursor, vCursor + 2, vCursor + 3
            );
            vCursor += 4;
        }
        if (!positions.length || !indices.length) return;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
            color: BAY_HIGHLIGHT_COLOR,
            transparent: true,
            opacity: BAY_HIGHLIGHT_OPACITY,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'bf2_bay_hover_overlay';
        mesh.renderOrder = 175;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        this.root.add(mesh);
        this._hoveredBayOverlay = mesh;
    }

    _computeFloorLayerYRangeById(layers) {
        const list = Array.isArray(layers) ? layers : [];
        const floorLayers = list.filter((l) => l?.type === 'floor');
        const firstFloor = floorLayers[0] ?? null;
        const firstFloorHeight = clamp(firstFloor?.floorHeight ?? 3.2, 1.0, 12.0);
        const { baseY, extraFirstFloor } = computeBuildingBaseAndSidewalk({
            generatorConfig: this.generatorConfig,
            floorHeight: firstFloorHeight
        });

        const map = new Map();
        let yCursor = baseY;
        let firstFloorPendingExtra = extraFirstFloor;

        for (const layer of floorLayers) {
            const id = typeof layer?.id === 'string' ? layer.id : '';
            if (!id) continue;

            const startY = yCursor;
            const floors = clampInt(layer?.floors ?? 0, 0, 99);
            const floorHeight = clamp(layer?.floorHeight ?? firstFloorHeight, 1.0, 12.0);
            const beltEnabled = !!layer?.belt?.enabled;
            const beltHeight = beltEnabled ? clamp(layer?.belt?.height ?? 0.12, 0.02, 1.2) : 0.0;

            for (let floor = 0; floor < floors; floor++) {
                const segHeight = floorHeight + (floor === 0 ? firstFloorPendingExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;
                yCursor += Math.max(0, segHeight);
                if (beltEnabled && beltHeight > EPS) yCursor += beltHeight;
            }

            const endY = yCursor;
            map.set(id, { startY, endY });
        }

        return map;
    }

    _updateFocusBoxFromObject(obj) {
        if (!obj) {
            this._focusBox = null;
            return;
        }
        const box = new THREE.Box3().setFromObject(obj);
        if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
            this._focusBox = null;
            return;
        }
        this._focusBox = box;
    }

    _getCameraFocusTarget() {
        if (this._focusBox) return { box: this._focusBox };
        const span = this.tileSize * this.gridSize;
        return {
            center: { x: 0, y: 0, z: 0 },
            radius: span * 0.75
        };
    }

    _buildMap() {
        const origin = {
            x: -((this.gridSize - 1) * 0.5) * this.tileSize,
            z: -((this.gridSize - 1) * 0.5) * this.tileSize
        };
        this.map = new CityMap({
            width: this.gridSize,
            height: this.gridSize,
            tileSize: this.tileSize,
            origin
        });
        this.map.finalize();
    }

    _buildWorld() {
        if (!this.map || !this.root) return;
        const size = this.tileSize * this.gridSize;
        this.world = createCityWorld({
            size,
            tileMeters: this.tileMeters,
            map: this.map,
            config: this.generatorConfig,
            rng: null
        });
        if (this.world?.group) this.root.add(this.world.group);
    }

    _buildLights() {
        if (!this.root) return;
        const hemi = new THREE.HemisphereLight(0xe9f2ff, 0x1c1c1e, 0.65);
        hemi.name = 'bf2_hemi';

        const sun = new THREE.DirectionalLight(0xffffff, 1.35);
        sun.name = 'bf2_sun';
        sun.position.set(60, 70, 45);
        sun.castShadow = true;
        sun.shadow.bias = -0.0001;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 240;
        sun.shadow.camera.left = -120;
        sun.shadow.camera.right = 120;
        sun.shadow.camera.top = 120;
        sun.shadow.camera.bottom = -120;
        this._sun = sun;
        this._applySuspect1ShadowDebugState();

        this.root.add(hemi);
        this.root.add(sun);
        this.root.add(sun.target);
    }

    _applySuspect1ShadowDebugState() {
        const sun = this._sun;
        if (!sun) return;
        const wantsSunShadows = !this._debugDisableSuspect1;
        sun.castShadow = wantsSunShadows;
        if (sun.shadow && 'needsUpdate' in sun.shadow) sun.shadow.needsUpdate = true;
        const rendererShadowMap = this.engine?.renderer?.shadowMap ?? null;
        if (rendererShadowMap && 'needsUpdate' in rendererShadowMap) rendererShadowMap.needsUpdate = true;
    }

    _buildCamera() {
        if (!this.camera) return;
        const span = this.tileSize * this.gridSize;
        const dist = span * 1.2;
        this.controls = new FirstPersonCameraController(this.camera, this.canvas, {
            enabled: true,
            lookSpeed: 1.0,
            panSpeed: 1.0,
            zoomSpeed: 1.0,
            minPitchDeg: -89,
            maxPitchDeg: 89,
            getFocusTarget: () => this._getCameraFocusTarget()
        });
        this.controls.minDistance = Math.max(16, dist * 0.35);
        this.controls.maxDistance = dist * 2.2;
        this.resetCamera();
    }

    _clearBuilding({ preserveHoveredBay = false } = {}) {
        if (!this._building) {
            this._clearWallDecorations();
            this._clearLayoutOverlays();
            this._clearHoveredBayOverlay();
            this._clearSupportSlab();
            this._bayHighlightDataByLayerId = null;
            if (!preserveHoveredBay) this._hoveredBay = null;
            this._layoutLoop = null;
            this._layoutHoverFaceId = null;
            this._layoutHoverVertexIndex = null;
            this._layoutWidthGuideFaceIds = null;
            return;
        }
        this._clearWallDecorations();
        this._building.group?.removeFromParent?.();
        disposeObject3D(this._building.group);
        this._building = null;
        this._clearSupportSlab();
        this._focusBox = null;
        this._floorLayerYRangeById.clear();
        this._hoveredFloorLayerId = null;
        this._activeFaceLayerId = null;
        this._bayHighlightDataByLayerId = null;
        if (!preserveHoveredBay) this._hoveredBay = null;
        this._clearHoverHighlight();
        this._clearHoveredBayOverlay();
        this._clearLayoutOverlays();
        this._layoutLoop = null;
        this._layoutHoverFaceId = null;
        this._layoutHoverVertexIndex = null;
        this._layoutWidthGuideFaceIds = null;
        this._syncFaceHighlight();
        this._syncDummy();
    }

    _syncSupportSlab() {
        if (!this._renderSlab || !this.root || !this._building || !this._focusBox) {
            this._clearSupportSlab();
            return;
        }

        const box = this._focusBox;
        const minX = Number(box.min.x);
        const maxX = Number(box.max.x);
        const minZ = Number(box.min.z);
        const maxZ = Number(box.max.z);
        const topY = Number(box.min.y);
        if (!Number.isFinite(minX) || !Number.isFinite(maxX)
            || !Number.isFinite(minZ) || !Number.isFinite(maxZ)
            || !Number.isFinite(topY)) {
            this._clearSupportSlab();
            return;
        }

        const width = Math.max(EPS, (maxX - minX) + SUPPORT_SLAB_OVERHANG_M * DOUBLE);
        const depth = Math.max(EPS, (maxZ - minZ) + SUPPORT_SLAB_OVERHANG_M * DOUBLE);
        const thickness = Math.max(0.05, SUPPORT_SLAB_THICKNESS_M);
        const centerX = (minX + maxX) * 0.5;
        const centerZ = (minZ + maxZ) * 0.5;

        if (!this._supportSlabMesh) {
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 1.0,
                metalness: 0.0
            });
            if (this._wallTextures?.resolveMaterial && this._wallTextures?.applyResolvedMaterial) {
                const payload = this._wallTextures.resolveMaterial(SUPPORT_SLAB_MATERIAL_ID, {
                    cloneTextures: false,
                    diagnosticsTag: 'BuildingFabrication2Scene.support_slab'
                });
                this._wallTextures.applyResolvedMaterial(mat, payload, { clearOnMissing: true });
            }

            const slab = new THREE.Mesh(geo, mat);
            slab.name = 'bf2_support_slab';
            slab.castShadow = false;
            slab.receiveShadow = true;
            this.root.add(slab);
            this._supportSlabMesh = slab;
        }

        this._supportSlabMesh.position.set(centerX, topY - thickness * 0.5, centerZ);
        this._supportSlabMesh.scale.set(width, thickness, depth);
        this._supportSlabMesh.visible = true;
    }

    _setDummyVisible(visible) {
        const root = this.root;
        const dummy = this._dummy;
        if (!root || !dummy) return;
        dummy.visible = !!visible;
    }

    _syncDummy() {
        if (!this._showDummy || !this.root || !this._focusBox) {
            if (this._dummy) {
                this._dummy.removeFromParent?.();
                disposeObject3D(this._dummy);
                this._dummy = null;
            }
            return;
        }

        if (!this._dummy) {
            const asset = createProceduralMeshAsset(PROCEDURAL_MESH.BALL_V1);
            const mesh = asset?.mesh ?? null;
            if (!mesh) return;
            mesh.name = 'bf2_dummy';
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = mesh.userData ?? {};
            mesh.userData.bf2Dummy = true;
            mesh.raycast = () => {};
            this._dummy = mesh;
            this.root.add(mesh);
        }

        const box = this._focusBox;
        const padding = 1.25;
        const x = box.min.x - padding;
        const y = box.min.y;
        const z = box.max.z + padding;
        this._dummy.position.set(x, y, z);
        this._dummy.visible = true;
    }
}
