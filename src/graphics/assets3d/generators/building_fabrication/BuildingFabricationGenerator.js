// src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js
// Generates building fabrication meshes from layer definitions.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { ROOF_COLOR, resolveRoofColorHex } from '../../../../app/buildings/RoofColor.js';
import { BELT_COURSE_COLOR, resolveBeltCourseColorHex } from '../../../../app/buildings/BeltCourseColor.js';
import { BUILDING_STYLE } from '../../../../app/buildings/BuildingStyle.js';
import { resolveWallBaseTintHexFromWallBase } from '../../../../app/buildings/WallBaseTintModel.js';
import { fitBuildingFootprintToLot } from '../../../../app/buildings/footprint_fitting/BuildingFootprintLotFitter.js';
import { createFootprintPlan, footprintPlanToLoop, getFootprintRunFrame } from '../../../../app/buildings/footprint_edits/BuildingFootprintEdits.js';
import {
    LAYER_SILHOUETTE_MODE,
    createFacadeRunContinuityKey,
    createSilhouetteRunTraversal,
    createSilhouetteStretchProvenance,
    planLayerSilhouetteTransitionSurfaces,
    replaySilhouetteLotFitApplications,
    resolveLayerSilhouette,
    tessellateLayerSilhouetteLoopForGeometry
} from '../../../../app/buildings/silhouette_authoring/BuildingLayerSilhouetteModel.js';
import {
    normalizeFootprintArcMetadata,
    resolveFootprintArcRun,
    reverseFootprintArcMetadata,
    sampleResolvedFootprintArc
} from '../../../../app/buildings/footprint_curves/BuildingFootprintCurves.js';
import {
    buildWallDecoratorShapeSpecs,
    sanitizeWallDecoratorDebuggerState
} from '../../../../app/buildings/wall_decorators/index.js';
import {
    getWindowFabricationCatalogEntries,
    normalizeOpeningInsetsConfig,
    normalizePortalConfig,
    normalizeStorefrontConfig,
    normalizeWindowFabricationAssetType,
    PARALLAX_INTERIOR_PRESET_ID,
    resolveWindowDecorationState,
    sanitizeWindowMeshSettings,
    STOREFRONT_TRANSOM_MODE,
    WINDOW_DECORATION_JAMBS_RUN_MODE,
    WINDOW_DECORATION_MATERIAL_MODE,
    WINDOW_DECORATION_PART,
    WINDOW_DECORATION_STYLE,
    WINDOW_FABRICATION_ASSET_TYPE
} from '../../../../app/buildings/window_mesh/index.js';
import {
    buildWindowHeaderSurroundGeometry,
    buildWindowJambsSurroundGeometry,
    isWindowHeaderProfileStyle
} from '../../../engine3d/buildings/window_mesh/WindowDecorationSurroundGeometry.js';
import {
    WINDOW_TYPE,
    getDefaultWindowParams,
    getWindowGlassMaskTexture,
    getWindowNormalMapTexture,
    getWindowRoughnessMapTexture,
    getWindowTexture,
    isWindowTypeId
} from '../buildings/WindowTextureGenerator.js';
import { WindowMeshGenerator } from '../buildings/WindowMeshGenerator.js';
import { computeBuildingLoopsFromTiles, offsetOrthogonalLoopXZ, resolveBuildingStyleWallMaterialUrls } from '../buildings/BuildingGenerator.js';
import {
    LAYER_TYPE,
    normalizeBuildingLayers,
    normalizeCornerTreatmentConfig,
    CORNER_TREATMENT_MODE,
    CORNER_TREATMENT_RHYTHM,
    CORNER_TREATMENT_CORNER_IDS
} from './BuildingFabricationTypes.js';
import { applyMaterialVariationToMeshStandardMaterial, computeMaterialVariationSeedFromTiles, MATERIAL_VARIATION_ROOT } from '../../materials/MaterialVariationSystem.js';
import { resolveBuildingConfigMaterials } from '../../../../app/buildings/BuildingMaterialSlots.js';
import {
    BALCONY_PLACEMENT,
    BALCONY_RAILING_INFILL,
    BALCONY_GRID_PATTERN,
    BALCONY_PLATFORM_WIDTH_MODE,
    BALCONY_SUPPORT_MODE,
    normalizeBalconyConfig,
    resolveBalconySideCoverage
} from '../../../../app/buildings/BayBalconyModel.js';
import {
    balconyContinuityEndpointKey,
    resolveBalconyContinuityLinks
} from '../../../../app/buildings/BalconyContinuityModel.js';
import {
    BAY_BOUNDARY_EDGE,
    BAY_BOUNDARY_TYPE,
    bayBoundaryEndpointKey,
    normalizeBayBoundaryConnectionsConfig,
    resolveBayBoundaryConnections,
    validateBayBoundaryConnectionsConfig
} from '../../../../app/buildings/BayBoundaryConnectionsModel.js';
import { solveBayBoundaryTransitionPath } from '../../../../app/buildings/BayBoundaryTransitionPath.js';
import {
    FACADE_ATTACHMENT_TYPE,
    normalizeFacadeAttachmentsConfig,
    shouldPlaceAcUnit
} from '../../../../app/buildings/FacadeAttachmentsModel.js';
import {
    ROOFTOP_PROP_MATERIAL_ROLE_IDS,
    normalizeRooftopPropsConfig,
    solveRooftopPropPlacements
} from '../../../../app/buildings/RooftopPropsModel.js';
import { buildRooftopPropParts } from './RooftopPropGeometry.js';
import { applyUvTilingToMeshStandardMaterial } from '../../materials/MaterialUvTilingSystem.js';
import { getPbrMaterialTileMeters, isPbrMaterialId, tryGetPbrMaterialIdFromUrl } from '../../materials/PbrMaterialCatalog.js';
import { solveFacadeLayoutFillPattern } from './FacadeLayoutFillSolver.js';
import { computeFacadeBaysTopology, solveFacadeBaysLayout } from './FacadeBaysSolver.js';
import {
    EDGE_BEVEL_CORNER_IDS,
    EDGE_BEVEL_OPENING_REVEAL_ALLOWANCE_METERS,
    EDGE_BEVEL_SCOPE,
    bevelConvexLoopVertices,
    bevelRectLoopMainCorners,
    normalizeEdgeBevelConfig,
    resolveCornerBevelWidth
} from '../../../../app/buildings/EdgeBevelModel.js';
import {
    ARCADE_SPRINGING_MODE,
    FACADE_BAY_STACKING_MODE,
    normalizeFacadeStackingSpec,
    resolveArcadeArchHeightRatio,
    resolveArcadeSpringingOffset
} from '../../../../app/buildings/FacadeBayGroupModel.js';
import { resolveRectFacadeCornerStrategy } from './FacadeCornerResolutionStrategies.js';
import { createWallDecoratorGeometryFromSpec as createSharedWallDecoratorGeometryFromSpec } from '../../../gui/shared/wall_decorator/WallDecoratorGeometryFactory.js';
import { resolveWallDecoratorSurfacePlacement } from '../../../gui/shared/wall_decorator/WallDecoratorPlacement.js';
import {
    FACADE_LETTERING_DEFAULT_SPACING_RATIO,
    buildFacadeLetteringGeometry,
    layoutFacadeLetteringText
} from './FacadeLetteringGeometry.js';
import {
    getPortalFabricationCatalogEntries,
    normalizePortalFabricationDef
} from '../../../../app/buildings/PortalFabricationCatalog.js';
import {
    getPortalOrnamentPartDef,
    getPortalOrnamentTemplate,
    instantiatePortalOrnamentPart
} from './PortalOrnamentParts.js';

const EPS = 1e-6;
const QUANT = 1000;

function filterZeroAreaTriangleIndices(positionValues, indices) {
    const kept = [];
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
        const ia = indices[offset] * 3;
        const ib = indices[offset + 1] * 3;
        const ic = indices[offset + 2] * 3;
        const ax = Math.fround(positionValues[ia]);
        const ay = Math.fround(positionValues[ia + 1]);
        const az = Math.fround(positionValues[ia + 2]);
        const abx = Math.fround(positionValues[ib]) - ax;
        const aby = Math.fround(positionValues[ib + 1]) - ay;
        const abz = Math.fround(positionValues[ib + 2]) - az;
        const acx = Math.fround(positionValues[ic]) - ax;
        const acy = Math.fround(positionValues[ic + 1]) - ay;
        const acz = Math.fround(positionValues[ic + 2]) - az;
        const crossX = aby * acz - abz * acy;
        const crossY = abz * acx - abx * acz;
        const crossZ = abx * acy - aby * acx;
        if (crossX !== 0 || crossY !== 0 || crossZ !== 0) {
            kept.push(indices[offset], indices[offset + 1], indices[offset + 2]);
        }
    }
    return kept;
}

const WEDGE_ANGLE_STEP_DEG = 15;
const WEDGE_ANGLE_MAX_DEG = 75;
const FACADE_DEPTH_MIN_M = -2.0;
const FACADE_DEPTH_MAX_M = 2.0;
const FLOOR_INTERIOR_MATERIAL_SPEC = Object.freeze({ kind: 'texture', id: 'pbr.painted_plaster_wall' });
const FLOOR_INTERIOR_TILE_METERS = 1.0;
const FLOOR_INTERIOR_SHELL_INSET_METERS = 0.01;
// Keeps interior floors/ceilings off the coplanar layer cap slabs (z-fighting).
const FLOOR_INTERIOR_SURFACE_NUDGE_METERS = 0.01;
const WALL_DECORATION_DEFAULT_WALL_DEPTH_M = 0.30;
// The room's lining stops a little short of the structural opening — which is
// what a reveal is. It also keeps the shell opaque where a window mesh does not
// quite fill its wall cutout, a gap grazing sightlines would otherwise slip
// through now that every opening is cut (AI 495).
const INTERIOR_SHELL_REVEAL_METERS = 0.08;
// When an opening's frame sits at or behind the shell plane, the shell hole is
// grown past the wall cut instead, so its edge hides behind the facade's own
// reveal walls rather than meeting them edge-on (AI 507).
const INTERIOR_SHELL_CLEARANCE_METERS = 0.02;
const FACE_NORMAL_BY_ID = Object.freeze({
    A: Object.freeze({ x: 0, y: 0, z: 1 }),
    B: Object.freeze({ x: 1, y: 0, z: 0 }),
    C: Object.freeze({ x: 0, y: 0, z: -1 }),
    D: Object.freeze({ x: -1, y: 0, z: 0 })
});
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
const OPENING_INTERIOR_MODE = Object.freeze({
    NONE: 'none',
    RES: 'res',
    OFFICE: 'office',
    SHOP: 'shop'
});
const GARAGE_INTERIOR_MATERIAL_ID = 'pbr.concrete_layers_02';
const GARAGE_FACADE_STATE = Object.freeze({
    OPEN: 'open',
    CLOSED: 'closed'
});
const GARAGE_FACADE_ROTATION_DEGREES = Object.freeze({
    DEG_0: 0,
    DEG_90: 90
});

function normalizeHexColor(value, fallback = 0xffffff) {
    if (Number.isFinite(value)) return (Number(value) >>> 0) & 0xffffff;
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return (Number(fallback) >>> 0) & 0xffffff;
    const hex = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16) & 0xffffff;
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        return parseInt(`${r}${r}${g}${g}${b}${b}`, 16) & 0xffffff;
    }
    return (Number(fallback) >>> 0) & 0xffffff;
}

function deepClone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out;
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

// AI 512: N-face model — a face id is any single letter A–Z. Rect footprints
// keep resolving to A–D; N-gon footprints generate E, F, … in loop order.
function isFaceId(faceId) {
    return typeof faceId === 'string' && faceId.length === 1 && faceId >= 'A' && faceId <= 'Z';
}

const FACADE_MAX_FACES = 26;
// A quad-path connector run wider than this cannot stay an anonymous corner
// facet: the footprint re-resolves through the N-face path and the chamfer
// becomes a real face (the AI 499 bevel default stays centimetres, so all
// existing beveled rects keep their facets).
const FACADE_QUAD_FACET_MAX_RUN_METERS = 1.55;
// N-face path: runs shorter than this bridge as corner facets, not faces.
const FACADE_NFACE_FACET_MAX_RUN_METERS = 0.6;

// The face ids of a resolved frames object, in loop-chain order (each face's
// end meets the next face's start, possibly across a corner facet).
function facadeFaceIdsOf(frames) {
    const order = Array.isArray(frames?.order) ? frames.order : null;
    return order && order.length ? order : ['A', 'B', 'C', 'D'];
}

// The face ids a facade/faceMaterials-style config object actually authors.
function facadeSpecFaceIds(spec) {
    if (!spec || typeof spec !== 'object') return [];
    return Object.keys(spec).filter(isFaceId);
}

function facadeFaceIdAt(index) {
    return String.fromCharCode(65 + clampInt(index, 0, FACADE_MAX_FACES - 1));
}

function shouldReverseLinkedFaceBayOrder({ faceId, masterFaceId, reverseByFace }) {
    if (!isFaceId(faceId) || !isFaceId(masterFaceId)) return false;
    if (faceId === masterFaceId) return false;
    const reverse = reverseByFace && typeof reverseByFace === 'object' ? reverseByFace : null;
    return !!reverse?.[faceId];
}

function resolveLinkedFaceBaysForSolve({ bays, faceId, masterFaceId, reverseByFace }) {
    const src = Array.isArray(bays) ? bays : null;
    if (!src || !src.length) return src;
    if (!shouldReverseLinkedFaceBayOrder({ faceId, masterFaceId, reverseByFace })) return src;
    // Reverse assignment order only. Bay specs are reused as-is; geometry/content is not mirrored.
    return src.slice().reverse();
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

function isFloorLayerInteriorEnabled(layer) {
    const src = layer && typeof layer === 'object' ? layer : null;
    const interior = src?.interior && typeof src.interior === 'object' ? src.interior : null;
    const enabledRaw = interior?.enabled ?? src?.interiorEnabled;
    return !!enabledRaw;
}

function normalizeOpeningInteriorMode(value, fallback = OPENING_INTERIOR_MODE.RES) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!typed) return fallback;
    if (typed === OPENING_INTERIOR_MODE.NONE || typed === 'off' || typed === 'disabled') return OPENING_INTERIOR_MODE.NONE;
    if (typed === OPENING_INTERIOR_MODE.OFFICE) return OPENING_INTERIOR_MODE.OFFICE;
    if (typed === OPENING_INTERIOR_MODE.SHOP || typed === 'business' || typed === 'store') return OPENING_INTERIOR_MODE.SHOP;
    if (typed === OPENING_INTERIOR_MODE.RES || typed === 'residential') return OPENING_INTERIOR_MODE.RES;
    return fallback;
}

function resolveOpeningInteriorModeFromSettings(settings, fallback = OPENING_INTERIOR_MODE.RES) {
    const interior = settings?.interior;
    if (!interior || typeof interior !== 'object') return fallback;
    if (interior.enabled === false) return OPENING_INTERIOR_MODE.NONE;

    const presetId = typeof interior.parallaxInteriorPresetId === 'string'
        ? interior.parallaxInteriorPresetId.toLowerCase()
        : '';
    if (presetId.includes('office')) return OPENING_INTERIOR_MODE.OFFICE;
    if (presetId.includes('shop')) return OPENING_INTERIOR_MODE.SHOP;
    if (presetId.includes('residential')) return OPENING_INTERIOR_MODE.RES;

    const atlasId = typeof interior.atlasId === 'string' ? interior.atlasId.toLowerCase() : '';
    if (atlasId.includes('office')) return OPENING_INTERIOR_MODE.OFFICE;
    if (atlasId.includes('shop')) return OPENING_INTERIOR_MODE.SHOP;
    if (atlasId.includes('residential')) return OPENING_INTERIOR_MODE.RES;

    return interior.enabled === false ? OPENING_INTERIOR_MODE.NONE : OPENING_INTERIOR_MODE.RES;
}

function resolveOpeningVisualConfig(windowCfg, definitionSettings) {
    const visualSrc = windowCfg?.visual && typeof windowCfg.visual === 'object' ? windowCfg.visual : null;
    const shadeEnabledRaw = definitionSettings?.shade?.enabled;
    const disableShadesFallback = shadeEnabledRaw === undefined ? false : !shadeEnabledRaw;
    const disableShades = !!(
        visualSrc?.disableShades
        ?? windowCfg?.disableShades
        ?? windowCfg?.shadesDisabled
        ?? disableShadesFallback
    );
    const interiorFallback = resolveOpeningInteriorModeFromSettings(definitionSettings, OPENING_INTERIOR_MODE.RES);
    const interiorMode = normalizeOpeningInteriorMode(
        visualSrc?.interior
        ?? visualSrc?.interiorMode
        ?? windowCfg?.interiorPreset
        ?? windowCfg?.interiorMode,
        interiorFallback
    );
    return {
        disableShades,
        interior: interiorMode
    };
}

function applyOpeningVisualOverridesToSettings(settings, visual) {
    const base = settings && typeof settings === 'object' ? settings : {};
    let next = base;

    if (visual?.disableShades) {
        next = {
            ...next,
            shade: {
                ...(next?.shade ?? {}),
                enabled: false
            }
        };
    }

    const interiorMode = normalizeOpeningInteriorMode(
        visual?.interior,
        resolveOpeningInteriorModeFromSettings(next, OPENING_INTERIOR_MODE.RES)
    );
    if (interiorMode === OPENING_INTERIOR_MODE.NONE) {
        next = {
            ...next,
            interior: {
                ...(next?.interior ?? {}),
                enabled: false
            }
        };
    } else {
        // The opening's visual mode is COARSE (res/office/shop); a definition
        // may refine WHICH preset of that mode renders (e.g. the silhouette
        // shop glass). Keep the definition's preset when it already belongs
        // to the requested mode — only stomp it on an actual mode change.
        const currentPresetId = typeof next?.interior?.parallaxInteriorPresetId === 'string'
            ? next.interior.parallaxInteriorPresetId
            : '';
        const currentLower = currentPresetId.toLowerCase();
        const currentMode = currentLower.includes('office')
            ? OPENING_INTERIOR_MODE.OFFICE
            : (currentLower.includes('shop')
                ? OPENING_INTERIOR_MODE.SHOP
                : (currentLower.includes('residential') ? OPENING_INTERIOR_MODE.RES : null));
        const stockPresetId = interiorMode === OPENING_INTERIOR_MODE.OFFICE
            ? PARALLAX_INTERIOR_PRESET_ID.OFFICE
            : (interiorMode === OPENING_INTERIOR_MODE.SHOP
                ? PARALLAX_INTERIOR_PRESET_ID.SHOP
                : PARALLAX_INTERIOR_PRESET_ID.RESIDENTIAL);
        const presetId = currentMode === interiorMode ? currentPresetId : stockPresetId;
        next = {
            ...next,
            interior: {
                ...(next?.interior ?? {}),
                enabled: true,
                parallaxInteriorPresetId: presetId
            }
        };
    }

    return next;
}

function normalizeGarageFacadeState(value, fallback = GARAGE_FACADE_STATE.CLOSED) {
    const typed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (typed === GARAGE_FACADE_STATE.OPEN) return GARAGE_FACADE_STATE.OPEN;
    if (typed === GARAGE_FACADE_STATE.CLOSED) return GARAGE_FACADE_STATE.CLOSED;
    return fallback;
}

function normalizeGarageFacadeRotationDegrees(value, fallback = GARAGE_FACADE_ROTATION_DEGREES.DEG_0) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fallback;
    if (Math.abs(raw - GARAGE_FACADE_ROTATION_DEGREES.DEG_90) < 0.5) return GARAGE_FACADE_ROTATION_DEGREES.DEG_90;
    return GARAGE_FACADE_ROTATION_DEGREES.DEG_0;
}

function normalizeGarageFacadeConfig(value, fallback = null) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    if (!src && !fb) return null;
    const resolved = src ?? fb ?? {};
    return {
        state: normalizeGarageFacadeState(
            resolved?.state,
            normalizeGarageFacadeState(fb?.state, GARAGE_FACADE_STATE.CLOSED)
        ),
        closedMaterialId: String(resolved?.closedMaterialId ?? fb?.closedMaterialId ?? ''),
        rotationDegrees: normalizeGarageFacadeRotationDegrees(
            resolved?.rotationDegrees,
            normalizeGarageFacadeRotationDegrees(fb?.rotationDegrees, GARAGE_FACADE_ROTATION_DEGREES.DEG_0)
        )
    };
}

function normalizeOpeningWallCutConfig(value, fallback = null) {
    const src = value && typeof value === 'object' ? value : null;
    const fb = fallback && typeof fallback === 'object' ? fallback : null;
    const cutWidthRaw = Number(src?.cutWidthLerp ?? src?.cutX ?? fb?.cutWidthLerp ?? fb?.cutX ?? 0);
    const cutHeightRaw = Number(src?.cutHeightLerp ?? src?.cutY ?? fb?.cutHeightLerp ?? fb?.cutY ?? 0);
    return {
        cutWidthLerp: Number.isFinite(cutWidthRaw) ? clamp(cutWidthRaw, -1.0, 1.0) : 0,
        cutHeightLerp: Number.isFinite(cutHeightRaw) ? clamp(cutHeightRaw, -1.0, 1.0) : 0
    };
}

function getFrameWidths(settings) {
    const frame = settings?.frame && typeof settings.frame === 'object' ? settings.frame : {};
    const legacy = Math.max(0, Number(frame.width) || 0);
    const verticalRaw = Number(frame.verticalWidth);
    const horizontalRaw = Number(frame.horizontalWidth);
    return {
        vertical: Number.isFinite(verticalRaw) ? Math.max(0, verticalRaw) : legacy,
        horizontal: Number.isFinite(horizontalRaw) ? Math.max(0, horizontalRaw) : legacy
    };
}

function hasFrameBottomPiece(settings) {
    const frame = settings?.frame && typeof settings.frame === 'object' ? settings.frame : {};
    if (!frame.openBottom) return true;
    const bottom = frame.doorBottomFrame && typeof frame.doorBottomFrame === 'object' ? frame.doorBottomFrame : null;
    if (!bottom) return false;
    const mode = typeof bottom.mode === 'string' ? bottom.mode.trim().toLowerCase() : '';
    return !!bottom.enabled && mode === 'match';
}

function resolveOpeningCutMetrics(settings, { cutX = 0, cutY = 0 } = {}) {
    const safeSettings = settings && typeof settings === 'object' ? settings : {};
    const frameWidths = getFrameWidths(safeSettings);
    const frameOpenBottom = !hasFrameBottomPiece(safeSettings);
    const width = Math.max(EPS, Number(safeSettings?.width) || 0);
    const height = Math.max(EPS, Number(safeSettings?.height) || 0);
    const xRatio = clamp(cutX, -1.0, 1.0);
    const yRatio = clamp(cutY, -1.0, 1.0);
    const xMargin = frameWidths.vertical * xRatio;
    const topMargin = frameWidths.horizontal * yRatio;
    const bottomMargin = frameOpenBottom ? 0 : topMargin;
    const cutCenterYOffset = (bottomMargin - topMargin) * 0.5;
    const cutWidth = Math.max(EPS, width - xMargin * 2);
    const cutHeight = Math.max(EPS, height - topMargin - bottomMargin);
    return {
        frameVerticalWidth: frameWidths.vertical,
        frameHorizontalWidth: frameWidths.horizontal,
        frameOpenBottom,
        baseWidth: width,
        baseHeight: height,
        xMargin,
        topMargin,
        bottomMargin,
        cutCenterYOffset,
        cutWidth,
        cutHeight,
        cutX: xRatio,
        cutY: yRatio
    };
}

// AI 511: nested wall insets — resolve the CONTOUR STACK around an opening
// cut. Steps are authored OUTERMOST first (the portal-level dialect); their
// paddings accumulate outward from the opening, so contours[0] is the hole
// actually carved into the wall face and contours[last] is the opening
// itself. An arched opening keeps every contour CONCENTRIC with its arch
// circle: a step grows the radius by its width padding, the top edge rises
// by exactly that padding, and the step's own rise follows from the chord
// identity (w'^2/8r' + r'/2 reproduces the grown circle). Rectangular heads
// grow by the top padding instead.
function resolveOpeningInsetContours({ cutWidth, cutHeight, cutCenterY, archRise = 0, steps = null } = {}) {
    const list = Array.isArray(steps) ? steps : [];
    const w0 = Math.max(EPS, Number(cutWidth) || 0);
    const h0 = Math.max(EPS, Number(cutHeight) || 0);
    const cy = Number(cutCenterY) || 0;
    const rise0 = Math.max(0, Number(archRise) || 0);
    const wantsArch = rise0 > EPS;
    let contour = {
        width: w0,
        top: cy + h0 * 0.5,
        bottom: cy - h0 * 0.5,
        wantsArch,
        archRise: wantsArch ? rise0 : 0
    };
    const contours = [contour];
    let R = wantsArch ? ((w0 * w0) / (8 * rise0) + rise0 / 2) : 0;
    // Walk the authored list INNER→OUTER so each step wraps the contour
    // built so far.
    for (let i = list.length - 1; i >= 0; i--) {
        const step = list[i];
        const wp = clamp(step?.widthPaddingMeters, 0.03, 0.6);
        const tp = clamp(step?.topPaddingMeters, 0.0, 0.6);
        const bp = clamp(step?.bottomPaddingMeters, 0.0, 1.5);
        const width = contour.width + wp * 2;
        let top;
        let rise = 0;
        if (wantsArch) {
            const grown = R + wp;
            const halfW = width * 0.5;
            rise = grown - Math.sqrt(Math.max(0, grown * grown - halfW * halfW));
            top = contour.top + wp;
            R = grown;
        } else {
            top = contour.top + tp;
        }
        const bottom = contour.bottom - bp;
        contour = {
            width,
            top,
            bottom,
            wantsArch,
            archRise: wantsArch ? Math.min(rise, Math.max(0, top - bottom - 0.02)) : 0
        };
        contours.push(contour);
    }
    contours.reverse();
    return contours;
}

// AI 510 (rework): portal LEVEL geometry. A portal is a box inserted into
// the facade; nested inset levels telescope inward (each level cuts a
// smaller hole into the previous face and steps `depthMeters` deeper) until
// the innermost hole is the door cut. Levels are authored OUTERMOST first.
// Arch math matches the wall builder's: for a rise r over chord w the circle
// has R = w^2/8r + r/2 and its center sits at apex - R, so every level hole
// (and every ring moulding contouring it) is CONCENTRIC with the door arch.
// A level with `arch: false` keeps a rectangular hole ("follows the
// rectangular wall") even over an arched door.
function resolvePortalLevelGeometry({ cutWidth, cutHeight, archRise = 0, def = null, maxHalfWidth = Infinity } = {}) {
    const w = Math.max(0.1, Number(cutWidth) || 0);
    const h = Math.max(0.1, Number(cutHeight) || 0);
    const rise = Math.max(0, Number(archRise) || 0);
    const hasArch = rise > EPS;
    const R = hasArch ? ((w * w) / (8 * rise) + rise / 2) : 0;
    const centerY = hasArch ? (h - R) : 0;
    const boxCfg = def?.box && typeof def.box === 'object' ? def.box : {};
    const sideMargin = clamp(boxCfg.sideMarginMeters, 0.15, 1.5);
    const topMargin = clamp(boxCfg.topMarginMeters, 0.1, 1.5);
    const projection = clamp(boxCfg.projectionMeters, 0.0, 0.4);

    const junctionY = (halfWidth, radius) => {
        const inner = Math.max(0, radius * radius - halfWidth * halfWidth);
        return centerY + Math.sqrt(inner);
    };
    // Top of a hole grown `offset` outward from the door cut, per topology.
    const holeTopAt = (offset, arched) => (arched ? centerY + R + offset : h + offset);

    const srcLevels = Array.isArray(def?.levels) ? def.levels : [];
    const totalFrameWidth = srcLevels.reduce((acc, lvl) => acc + clamp(lvl?.frameWidthMeters, 0.05, 0.9), 0);

    const levels = [];
    let outerOffset = totalFrameWidth;
    let frontZ = projection;
    let sumDepth = 0;
    for (let i = 0; i < srcLevels.length; i++) {
        const lvl = srcLevels[i];
        const frameWidth = clamp(lvl?.frameWidthMeters, 0.05, 0.9);
        const depth = clamp(lvl?.depthMeters, 0.05, 1.2);
        frontZ -= depth;
        sumDepth += depth;
        const innerOffset = outerOffset - frameWidth;
        const holeArched = hasArch && lvl?.arch !== false;
        const next = srcLevels[i + 1] ?? null;
        const innerArched = next ? (hasArch && next.arch !== false) : hasArch;
        levels.push({
            frameWidthMeters: frameWidth,
            depthMeters: depth,
            ring: lvl?.ring ?? null,
            innerOffset,
            outerOffset,
            innerHalfWidth: w * 0.5 + innerOffset,
            outerHalfWidth: w * 0.5 + outerOffset,
            frontZ,
            // topology of this level's own hole and of the hole inside it
            holeArched,
            innerArched,
            holeJunctionY: holeArched ? junctionY(w * 0.5 + outerOffset, R + outerOffset) : holeTopAt(outerOffset, false),
            holeApexY: holeTopAt(outerOffset, holeArched)
        });
        outerOffset = innerOffset;
    }

    const boxHoleArched = levels.length ? levels[0].holeArched : hasArch;
    const boxTopY = holeTopAt(totalFrameWidth, boxHoleArched) + topMargin;
    // The box lives inside its bay strip: a wider box would cut into the
    // neighbouring bays' wall runs, so the pier margin gives way first.
    const boxMaxHW = Number.isFinite(maxHalfWidth) ? maxHalfWidth : Infinity;
    const boxHalfWidth = Math.max(
        w * 0.5 + totalFrameWidth + 0.05,
        Math.min(w * 0.5 + totalFrameWidth + sideMargin, boxMaxHW)
    );

    return {
        hasArch,
        circleRadius: R,
        circleCenterY: centerY,
        springY: hasArch ? (h - rise) : h,
        levels,
        totalFrameWidth,
        projection,
        depthBehindWall: Math.max(0, sumDepth - projection),
        doorPlaneZ: projection - sumDepth,
        boxHalfWidth,
        boxTopY,
        boxHoleArched,
        // The facade opens to the box's rectangle; the box mass fills it.
        boxCut: { width: boxHalfWidth * 2, height: boxTopY }
    };
}

// AI 488: storefront zone layout. Zones stack inside one opening bottom to
// top: bulkhead -> display glazing -> transom -> sign fascia. Glazing absorbs
// whatever height the fixed zones leave over; when the opening is too short
// the fixed zones shrink proportionally so glazing keeps its minimum height.
// Heights are relative to the opening bottom (yBottom 0 = opening bottom).
function resolveStorefrontZoneLayout({ storefront, totalHeightMeters } = {}) {
    const cfg = normalizeStorefrontConfig(storefront);
    const totalH = Math.max(0.2, Number(totalHeightMeters) || 0.2);

    let bulkheadH = cfg.bulkhead.enabled ? cfg.bulkhead.heightMeters : 0;
    let transomH = cfg.transom.mode === STOREFRONT_TRANSOM_MODE.NONE ? 0 : cfg.transom.heightMeters;
    let fasciaH = cfg.fascia.enabled ? cfg.fascia.heightMeters : 0;

    const minGlazing = Math.min(cfg.minGlazingHeightMeters, totalH);
    const fixedH = bulkheadH + transomH + fasciaH;
    const available = totalH - minGlazing;
    if (fixedH > available && fixedH > EPS) {
        const scale = Math.max(0, available) / fixedH;
        bulkheadH *= scale;
        transomH *= scale;
        fasciaH *= scale;
    }
    const glazingH = Math.max(0.1, totalH - bulkheadH - transomH - fasciaH);

    // Band order above the glazing: default is transom -> fascia (top);
    // `fasciaBelowTransom` swaps them so the dark sign band sits directly on
    // the glazing head with the transom band above it (the classic order).
    const fasciaFirst = cfg.fasciaBelowTransom === true;
    const firstH = fasciaFirst ? fasciaH : transomH;
    return {
        config: cfg,
        totalHeight: totalH,
        bulkhead: { height: bulkheadH, yBottom: 0 },
        glazing: { height: glazingH, yBottom: bulkheadH },
        transom: {
            height: transomH,
            yBottom: bulkheadH + glazingH + (fasciaFirst ? firstH : 0),
            mode: cfg.transom.mode
        },
        fascia: {
            height: fasciaH,
            yBottom: bulkheadH + glazingH + (fasciaFirst ? 0 : firstH)
        }
    };
}

// AI 488: per-zone window settings derived from the storefront's base settings.
// The glazing zone IS the base window (mullion grid, glass, shop parallax
// interior); the transom reuses the frame look with its own muntin columns.
// Both zones are rectangular regardless of the base arch flag.
function makeStorefrontZoneSettings({ baseSettings, width, layout } = {}) {
    const base = baseSettings && typeof baseSettings === 'object' ? baseSettings : {};
    const rectArch = { ...(base.arch ?? {}), enabled: false };

    const glazing = sanitizeWindowMeshSettings({
        ...base,
        width,
        height: layout.glazing.height,
        arch: rectArch
    });

    let transom = null;
    // Solid mode has no glazed band: the zone renders as a plain slab (the
    // fascia construction), so no window-mesh settings and no wall cut.
    const transomWantsGlass = layout.transom.mode === STOREFRONT_TRANSOM_MODE.GLAZED
        || layout.transom.mode === STOREFRONT_TRANSOM_MODE.BACKLIT;
    if (transomWantsGlass && layout.transom.height > 0.05) {
        transom = sanitizeWindowMeshSettings({
            ...base,
            width,
            height: layout.transom.height,
            arch: rectArch,
            frame: {
                ...(base.frame ?? {}),
                openBottom: false,
                addHandles: false,
                doorStyle: 'single'
            },
            muntins: {
                ...(base.muntins ?? {}),
                enabled: layout.transom.mode === STOREFRONT_TRANSOM_MODE.GLAZED,
                columns: layout.config.transom.columns,
                rows: 1
            },
            shade: {
                ...(base.shade ?? {}),
                enabled: false
            },
            // Transom glass is a narrow band: the shop parallax room would
            // read as a squashed repeat, so the band stays plain glass and the
            // backlit mode adds its own emissive panel behind it.
            interior: {
                ...(base.interior ?? {}),
                enabled: false
            }
        });
    }

    return { glazing, transom };
}

function clampFacadeDepthMeters(value) {
    return clamp(value, FACADE_DEPTH_MIN_M, FACADE_DEPTH_MAX_M);
}

function normalizeWedgeAngleDeg(value) {
    const raw = Number(value) || 0;
    if (!(raw > 0)) return 0;
    const clamped = clamp(raw, 0, WEDGE_ANGLE_MAX_DEG);
    return clampInt(clamped / WEDGE_ANGLE_STEP_DEG, 0, Math.round(WEDGE_ANGLE_MAX_DEG / WEDGE_ANGLE_STEP_DEG)) * WEDGE_ANGLE_STEP_DEG;
}

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function qf(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * QUANT) / QUANT;
}

function disableIblOnMaterial(mat) {
    if (!mat || !('envMapIntensity' in mat)) return;
    mat.userData = mat.userData ?? {};
    mat.userData.iblNoAutoEnvMapIntensity = true;
    mat.envMapIntensity = 0;
    mat.needsUpdate = true;
}

function hashUint32(x) {
    let v = (Number.isFinite(x) ? x : 0) >>> 0;
    v ^= v >>> 16;
    v = Math.imul(v, 0x7feb352d);
    v ^= v >>> 15;
    v = Math.imul(v, 0x846ca68b);
    v ^= v >>> 16;
    return v >>> 0;
}

function resolvePbrTileMetersFromUrls(urls, styleId) {
    const direct = typeof styleId === 'string' ? styleId : '';
    const pbrId = isPbrMaterialId(direct) ? direct : tryGetPbrMaterialIdFromUrl(urls?.baseColorUrl ?? null);
    if (!pbrId) return 1.0;
    const tileMeters = getPbrMaterialTileMeters(pbrId);
    const t = Number(tileMeters);
    return (Number.isFinite(t) && t > EPS) ? t : 1.0;
}

function computeUvTilingParams({ tiling, urls, styleId } = {}) {
    const cfg = tiling && typeof tiling === 'object' ? tiling : null;
    const uvEnabled = !!cfg?.uvEnabled;
    const offsetU = uvEnabled ? clamp(cfg?.offsetU, -10.0, 10.0) : 0.0;
    const offsetV = uvEnabled ? clamp(cfg?.offsetV, -10.0, 10.0) : 0.0;
    const rotationDegrees = uvEnabled ? clamp(cfg?.rotationDegrees, -180.0, 180.0) : 0.0;

    let scaleU = 1.0;
    let scaleV = 1.0;
    if (cfg?.enabled) {
        const baseTileMeters = resolvePbrTileMetersFromUrls(urls, styleId);
        const desiredTileMetersU = clamp(cfg?.tileMetersU ?? cfg?.tileMeters, 0.1, 100.0);
        const desiredTileMetersV = clamp(cfg?.tileMetersV ?? cfg?.tileMeters, 0.01, 100.0);
        scaleU = baseTileMeters / desiredTileMetersU;
        scaleV = baseTileMeters / desiredTileMetersV;
    }

    const apply = uvEnabled
        || Math.abs(scaleU - 1.0) > 1e-6
        || Math.abs(scaleV - 1.0) > 1e-6;

    return { apply, scaleU, scaleV, offsetU, offsetV, rotationDegrees };
}

function applyFixedTileMetersToMaterial(material, { materialSpec, tileMeters = 1.0 } = {}) {
    const mat = material && typeof material === 'object' ? material : null;
    if (!mat) return;
    const spec = materialSpec && typeof materialSpec === 'object' ? materialSpec : null;
    const styleId = spec?.kind === 'texture' ? spec.id : '';
    if (!styleId) return;

    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const baseTileMeters = resolvePbrTileMetersFromUrls(urls, styleId);
    const targetTileMeters = clamp(tileMeters, 0.1, 100.0);
    const scale = baseTileMeters / targetTileMeters;
    applyUvTilingToMeshStandardMaterial(mat, { scaleU: scale, scaleV: scale });
}

function resolveBuildingWindowReflectiveConfig(windowVisuals) {
    const windowVisualsObj = windowVisuals && typeof windowVisuals === 'object' ? windowVisuals : null;
    const reflectiveObj = windowVisualsObj?.reflective && typeof windowVisualsObj.reflective === 'object'
        ? windowVisualsObj.reflective
        : {};
    const enabled = reflectiveObj.enabled !== undefined ? !!reflectiveObj.enabled : false;
    const glassObj = reflectiveObj.glass && typeof reflectiveObj.glass === 'object' ? reflectiveObj.glass : {};

    const colorHex = Number.isFinite(glassObj.colorHex) ? ((Number(glassObj.colorHex) >>> 0) & 0xffffff) : 0xffffff;
    const metalness = Number.isFinite(glassObj.metalness) ? clamp(glassObj.metalness, 0.0, 1.0) : 0.0;
    const roughness = Number.isFinite(glassObj.roughness) ? clamp(glassObj.roughness, 0.0, 1.0) : 0.02;
    const transmission = Number.isFinite(glassObj.transmission) ? clamp(glassObj.transmission, 0.0, 1.0) : 0.0;
    const ior = Number.isFinite(glassObj.ior) ? clamp(glassObj.ior, 1.0, 2.5) : 2.2;
    const envMapIntensity = Number.isFinite(glassObj.envMapIntensity) ? clamp(glassObj.envMapIntensity, 0.0, 5.0) : 4.0;

    const wantsTransmission = transmission > 0.01;
    const opacityDefault = wantsTransmission ? 1.0 : 0.85;
    const opacity = Number.isFinite(reflectiveObj.opacity)
        ? clamp(reflectiveObj.opacity, 0.0, 1.0)
        : opacityDefault;
    const offsetRaw = reflectiveObj.layerOffset ?? reflectiveObj.offset;
    const layerOffset = Number.isFinite(offsetRaw)
        ? clamp(offsetRaw, -0.1, 0.1)
        : 0.02;

    return {
        enabled,
        opacity,
        layerOffset,
        glass: {
            colorHex,
            metalness,
            roughness,
            transmission,
            ior,
            envMapIntensity
        }
    };
}

function signedArea(points) {
    let sum = 0;
    const n = points.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        sum += a.x * b.z - b.x * a.z;
    }
    return sum * 0.5;
}

function splitLoops(loops) {
    const list = Array.isArray(loops) ? loops : [];
    const outer = [];
    const holes = [];
    for (const loop of list) {
        if (!loop || loop.length < 3) continue;
        if (signedArea(loop) >= 0) outer.push(loop);
        else holes.push(loop);
    }
    return { outer, holes };
}

function normalizeFootprintLoopsInput(footprintLoops) {
    const srcLoops = Array.isArray(footprintLoops) ? footprintLoops : [];
    if (!srcLoops.length) return [];

    const samePointXZ = (a, b) => (
        !!a && !!b && Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= 1e-6 && Math.abs((Number(a.z) || 0) - (Number(b.z) || 0)) <= 1e-6
    );

    const out = [];
    for (const rawLoop of srcLoops) {
        const src = Array.isArray(rawLoop) ? rawLoop : [];
        if (!src.length) continue;

        const loop = [];
        for (const entry of src) {
            const x = Number(entry?.x ?? entry?.[0]);
            const z = Number(entry?.z ?? entry?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            const p = { x: qf(x), z: qf(z) };
            if (typeof entry?.cornerId === 'string' && entry.cornerId) p.cornerId = entry.cornerId;
            if (isFaceId(entry?.runId)) p.runId = entry.runId;
            if (typeof entry?.runForward === 'boolean') p.runForward = entry.runForward;
            if (entry?.split === true) p.split = true;
            const arc = normalizeFootprintArcMetadata(entry?.arc);
            if (arc) p.arc = arc;
            if (!loop.length || !samePointXZ(loop[loop.length - 1], p)) loop.push(p);
        }

        if (loop.length > 2 && samePointXZ(loop[0], loop[loop.length - 1])) loop.pop();
        if (loop.length < 3) continue;

        const area = signedArea(loop);
        if (!(Math.abs(area) > EPS)) continue;
        if (area >= 0) {
            out.push(loop);
        } else {
            const reversed = [];
            for (let i = loop.length - 1; i >= 0; i--) {
                const sourceEdgeIndex = (i - 1 + loop.length) % loop.length;
                const sourceEdge = loop[sourceEdgeIndex];
                const point = { x: loop[i].x, z: loop[i].z };
                if (typeof loop[i]?.cornerId === 'string' && loop[i].cornerId) point.cornerId = loop[i].cornerId;
                if (isFaceId(sourceEdge?.runId)) point.runId = sourceEdge.runId;
                if (typeof sourceEdge?.runForward === 'boolean') point.runForward = !sourceEdge.runForward;
                if (loop[i]?.split === true) point.split = true;
                const arc = reverseFootprintArcMetadata(sourceEdge?.arc);
                if (arc) point.arc = arc;
                reversed.push(point);
            }
            out.push(reversed);
        }
    }

    return out;
}

function computeLoopsBoundsXZ(loops) {
    const list = Array.isArray(loops) ? loops : [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const loop of list) {
        const points = Array.isArray(loop) ? loop : [];
        for (const point of points) {
            const x = Number(point?.x);
            const z = Number(point?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
    return { minX, maxX, minZ, maxZ };
}

function transformLoopsXZ(loops, { scale = 1.0, pivotX = 0.0, pivotZ = 0.0, translateX = 0.0, translateZ = 0.0 } = {}) {
    const s = Number.isFinite(scale) ? scale : 1.0;
    const px = Number.isFinite(pivotX) ? pivotX : 0.0;
    const pz = Number.isFinite(pivotZ) ? pivotZ : 0.0;
    const tx = Number.isFinite(translateX) ? translateX : 0.0;
    const tz = Number.isFinite(translateZ) ? translateZ : 0.0;
    const out = [];
    const list = Array.isArray(loops) ? loops : [];
    for (const rawLoop of list) {
        const src = Array.isArray(rawLoop) ? rawLoop : [];
        const loop = [];
        for (const point of src) {
            const x = Number(point?.x);
            const z = Number(point?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            loop.push({
                x: qf(px + (x - px) * s + tx),
                z: qf(pz + (z - pz) * s + tz),
                ...(typeof point?.cornerId === 'string' && point.cornerId ? { cornerId: point.cornerId } : {}),
                ...(isFaceId(point?.runId) ? { runId: point.runId } : {}),
                ...(typeof point?.runForward === 'boolean' ? { runForward: point.runForward } : {}),
                ...(point?.split === true ? { split: true } : {}),
                ...(normalizeFootprintArcMetadata(point?.arc) ? { arc: normalizeFootprintArcMetadata(point.arc) } : {})
            });
        }
        if (loop.length >= 3) out.push(loop);
    }
    return out;
}

function extractPositiveDepthMeters(value) {
    let maxDepth = 0.0;
    const read = (entry) => {
        const num = Number(entry);
        if (Number.isFinite(num) && num > maxDepth) maxDepth = num;
    };
    const visit = (entry, depth = 0) => {
        if (depth > 4 || entry === null || entry === undefined) return;
        if (Array.isArray(entry)) {
            for (const item of entry) visit(item, depth + 1);
            return;
        }
        if (typeof entry === 'number') {
            read(entry);
            return;
        }
        if (typeof entry !== 'object') return;
        const keys = ['depth', 'left', 'right', 'start', 'end', 'value', 'meters', 'depth0', 'depth1', 'outward', 'offset'];
        for (const key of keys) visit(entry?.[key], depth + 1);
    };
    visit(value, 0);
    return maxDepth;
}

function estimateLayoutOutwardDepthMeters(layout) {
    const src = layout && typeof layout === 'object' ? layout : null;
    if (!src) return 0.0;

    let maxDepth = 0.0;
    const ingestItem = (item) => {
        const entry = item && typeof item === 'object' ? item : null;
        if (!entry) return;
        maxDepth = Math.max(
            maxDepth,
            extractPositiveDepthMeters(entry?.depth),
            extractPositiveDepthMeters(entry?.depthLeft),
            extractPositiveDepthMeters(entry?.depthRight),
            extractPositiveDepthMeters(entry?.depth0),
            extractPositiveDepthMeters(entry?.depth1)
        );
    };

    const bays = Array.isArray(src?.bays?.items) ? src.bays.items : [];
    for (const bay of bays) ingestItem(bay);
    const items = Array.isArray(src?.items) ? src.items : [];
    for (const item of items) ingestItem(item);

    return maxDepth;
}

function estimateFacadesOutwardDepthMeters(facades) {
    const src = facades && typeof facades === 'object' ? facades : null;
    if (!src) return 0.0;

    let maxDepth = 0.0;
    const stack = [src];
    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;

        let hasFaceEntries = false;
        for (const faceId of facadeSpecFaceIds(node)) {
            const face = node?.[faceId];
            if (!face || typeof face !== 'object') continue;
            hasFaceEntries = true;
            maxDepth = Math.max(
                maxDepth,
                extractPositiveDepthMeters(face?.depthOffset),
                estimateLayoutOutwardDepthMeters(face?.layout)
            );
        }
        if (hasFaceEntries) continue;

        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') stack.push(value);
        }
    }

    return maxDepth;
}

function estimateCorniceOutwardReserveMeters(layer) {
    const cornice = layer?.cornice ?? null;
    if (!cornice?.enabled) return 0.0;
    const projection = clamp(cornice.projection, 0.02, 1.5);
    const ornamentDepth = cornice?.ornament?.type && cornice.ornament.type !== 'none'
        ? clamp(cornice.ornament.depth, 0.02, 1.5)
        : 0.0;
    let outward = Math.max(projection, ornamentDepth);
    if (layer?.type === LAYER_TYPE.ROOF) {
        const ring = layer?.ring ?? {};
        const ringOuter = ring?.enabled ? clamp(ring.outerRadius, 0.0, 8.0) : 0.0;
        const coping = cornice?.parapet?.coping ?? null;
        const copingOverhang = coping?.enabled ? clamp(coping.overhang, 0.0, 0.4) : 0.0;
        outward = ringOuter + Math.max(outward, copingOverhang);
    }
    return outward;
}

function estimatePortalAndStorefrontOutwardReserveMeters({ windowDefinitions, facades } = {}) {
    let reserve = 0.0;
    const considerPortal = (portalRaw) => {
        const portal = normalizePortalConfig(portalRaw);
        if (!portal) return;
        reserve = Math.max(reserve, portal.steps.count * portal.steps.treadDepthMeters);
    };
    const considerStorefront = (storefrontRaw) => {
        if (!storefrontRaw || typeof storefrontRaw !== 'object') return;
        const cfg = normalizeStorefrontConfig(storefrontRaw);
        reserve = Math.max(reserve, cfg.bulkhead.projectionMeters, cfg.fascia.projectionMeters);
    };
    const items = Array.isArray(windowDefinitions?.items) ? windowDefinitions.items : [];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        considerPortal(item.portal ?? null);
        if (item.storefront) considerStorefront(item.storefront);
    }
    const facadeGroups = facades && typeof facades === 'object' ? Object.values(facades) : [];
    for (const group of facadeGroups) {
        if (!group || typeof group !== 'object') continue;
        // Global facades keyed A-D hold the facade directly; per-layer maps
        // hold another level of face ids.
        const faceEntries = ('layout' in group) ? [group] : Object.values(group);
        for (const face of faceEntries) {
            const bays = face?.layout?.bays?.items;
            if (!Array.isArray(bays)) continue;
            for (const bay of bays) {
                considerPortal(bay?.window?.portal ?? null);
            }
        }
    }
    return reserve;
}

// AI 489: projecting balconies extend past the facade plane; their platform
// depth must count toward the outward footprint reserve like portal steps.
function estimateBalconyOutwardReserveMeters(facades) {
    let reserve = 0.0;
    const facadeGroups = facades && typeof facades === 'object' ? Object.values(facades) : [];
    for (const group of facadeGroups) {
        if (!group || typeof group !== 'object') continue;
        const faceEntries = ('layout' in group) ? [group] : Object.values(group);
        for (const face of faceEntries) {
            const bays = face?.layout?.bays?.items;
            if (!Array.isArray(bays)) continue;
            for (const bay of bays) {
                const cfg = normalizeBalconyConfig(bay?.balcony ?? null);
                if (!cfg || cfg.placement !== BALCONY_PLACEMENT.PROJECTING) continue;
                const depth = Number.isFinite(cfg.platform.depthMeters) ? cfg.platform.depthMeters : 1.4;
                reserve = Math.max(reserve, depth + 0.1);
            }
        }
    }
    return reserve;
}

// AI 489: right-triangle prism for corbel/knee-brace balcony supports.
// Local space: x spans [-width/2, width/2], the top face spans z in
// [0, depth] at y=0, and the underside slopes back to the wall at y=-height.
function makeBalconyBracketGeometry({ widthMeters, depthMeters, heightMeters }) {
    const w = Math.max(0.02, Number(widthMeters) || 0.08);
    const d = Math.max(0.05, Number(depthMeters) || 0.4);
    const h = Math.max(0.05, Number(heightMeters) || 0.35);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(d, 0);
    shape.lineTo(0, -h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, steps: 1 });
    // Shape X (outward) -> local +Z, extrusion axis -> local X, then center X.
    geo.rotateY(-Math.PI / 2);
    geo.translate(w * 0.5, 0, 0);
    geo.computeVertexNormals();
    return geo;
}

// AI 490: window AC unit — body box + front grille fins, origin at the
// bottom-center of the body so a slight forward tilt drops the front edge
// below the sill like the references.
const _acUnitGeometryCache = new Map();
function makeAcUnitGeometryTemplate({ widthMeters, heightMeters, depthMeters }) {
    const w = Math.max(0.2, Number(widthMeters) || 0.66);
    const h = Math.max(0.15, Number(heightMeters) || 0.42);
    const d = Math.max(0.15, Number(depthMeters) || 0.52);
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    let template = _acUnitGeometryCache.get(key);
    if (!template) {
        const boxes = [];
        const body = new THREE.BoxGeometry(w, h, d);
        body.translate(0, h * 0.5, 0);
        boxes.push(body);
        const finCount = 5;
        for (let i = 0; i < finCount; i++) {
            const fin = new THREE.BoxGeometry(w * 0.82, 0.02, 0.016);
            fin.translate(0, h * (0.28 + (0.5 * i) / (finCount - 1)), d * 0.5 + 0.008);
            boxes.push(fin);
        }
        const lip = new THREE.BoxGeometry(w * 0.9, 0.025, 0.03);
        lip.translate(0, 0.05, d * 0.5 + 0.012);
        boxes.push(lip);
        template = mergeGeometries(boxes, false);
        for (const g of boxes) g.dispose();
        _acUnitGeometryCache.set(key, template);
    }
    return template.clone();
}

// AI 490: straight railing run in the AI 489 balcony-kit language (corner and
// spaced posts, top rail cap, vertical grid bars) — the fire escape landings
// reuse this look 1:1.
function appendMetalRailingRunGeometries({
    geos,
    axis,
    fixed,
    from,
    to,
    baseY,
    railingHeightMeters = 1.0,
    postWidthMeters = 0.04,
    postMaxSpacingMeters = 1.1,
    topRailWidthMeters = 0.05,
    topRailHeightMeters = 0.04,
    barWidthMeters = 0.016,
    barSpacingMeters = 0.14,
    anchoredStart = false,
    anchoredEnd = false,
    postKeys = null
} = {}) {
    const len = to - from;
    if (!(len > 0.08) || !Array.isArray(geos)) return;
    const railH = Math.max(0.3, railingHeightMeters);
    const postW = Math.max(0.02, postWidthMeters);
    const keys = postKeys instanceof Set ? postKeys : new Set();

    const addPost = (t) => {
        const px = axis === 'x' ? t : fixed;
        const pz = axis === 'x' ? fixed : t;
        const key = `${px.toFixed(2)}|${pz.toFixed(2)}`;
        if (keys.has(key)) return;
        keys.add(key);
        const g = new THREE.BoxGeometry(postW, railH, postW);
        g.translate(px, baseY + railH * 0.5, pz);
        geos.push(g);
    };

    if (!anchoredStart) addPost(from);
    if (!anchoredEnd) addPost(to);
    const nPosts = Math.max(0, Math.ceil(len / Math.max(0.3, postMaxSpacingMeters)) - 1);
    for (let p = 1; p <= nPosts; p++) addPost(from + (len * p) / (nPosts + 1));

    const mid = (from + to) * 0.5;
    const cap = axis === 'x'
        ? new THREE.BoxGeometry(len + postW, topRailHeightMeters, topRailWidthMeters)
        : new THREE.BoxGeometry(topRailWidthMeters, topRailHeightMeters, len + postW);
    cap.translate(axis === 'x' ? mid : fixed, baseY + railH - topRailHeightMeters * 0.5, axis === 'x' ? fixed : mid);
    geos.push(cap);

    const innerLen = len - 2 * postW;
    const barH = railH - topRailHeightMeters - 0.05;
    if (innerLen > barSpacingMeters && barH > 0.1) {
        const nBars = Math.max(1, Math.floor(innerLen / Math.max(0.05, barSpacingMeters)));
        const step = innerLen / (nBars + 1);
        for (let b = 1; b <= nBars; b++) {
            const t = from + postW + step * b;
            const g = new THREE.BoxGeometry(barWidthMeters, barH, barWidthMeters);
            g.translate(axis === 'x' ? t : fixed, baseY + 0.04 + barH * 0.5, axis === 'x' ? fixed : t);
            geos.push(g);
        }
    }
}

function estimateBf2OutwardFootprintReserveMeters({ layers, facades, cornerTreatment = null, windowDefinitions = null } = {}) {
    let reserve = 0.0;
    if (cornerTreatment?.enabled) {
        reserve = Math.max(reserve, clamp(cornerTreatment.projection, 0.005, 0.5));
    }
    reserve = Math.max(reserve, estimatePortalAndStorefrontOutwardReserveMeters({ windowDefinitions, facades }));
    reserve = Math.max(reserve, estimateBalconyOutwardReserveMeters(facades));
    const safeLayers = Array.isArray(layers) ? layers : [];
    for (const layer of safeLayers) {
        if (!layer || typeof layer !== 'object') continue;
        if (layer?.type === LAYER_TYPE.ROOF) {
            reserve = Math.max(reserve, estimateCorniceOutwardReserveMeters(layer));
            continue;
        }
        if (layer?.type !== LAYER_TYPE.FLOOR) continue;
        const planOffset = Number(layer?.planOffset);
        if (Number.isFinite(planOffset) && planOffset < 0) reserve = Math.max(reserve, Math.abs(planOffset));
        const beltExtrusion = Number(layer?.belt?.enabled ? layer?.belt?.extrusion : 0.0);
        if (Number.isFinite(beltExtrusion) && beltExtrusion > 0) reserve = Math.max(reserve, beltExtrusion);
        reserve = Math.max(reserve, estimateCorniceOutwardReserveMeters(layer));
    }
    reserve = Math.max(reserve, estimateFacadesOutwardDepthMeters(facades));
    return reserve;
}

// How a placed building's authored footprint meets the build area its tiles
// claim. ONE feature with modes rather than a flag per behaviour:
//   'center' (default) — scale down if needed, then centre in the area.
//   'anchor'           — keep the authored world placement exactly; warn only.
//   'shift'            — keep the authored size, translate back into the area.
function normalizeFootprintPlacementMode(value) {
    const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (mode === 'anchor') return 'anchor';
    if (mode === 'shift') return 'shift';
    return 'center';
}

function createFacadeLotFitSolvability({ layers, facades, footprintLoop }) {
    const safeLayers = Array.isArray(layers) ? layers.filter((layer) => layer?.type === LAYER_TYPE.FLOOR) : [];
    const facadeRoot = facades && typeof facades === 'object' ? facades : null;
    const facadesAreGlobal = !!facadeRoot && facadeSpecFaceIds(facadeRoot).length > 0;
    const globalFacades = facadesAreGlobal ? facadeRoot : null;
    const byLayerId = facadesAreGlobal ? null : facadeRoot;

    const layoutsForFace = (faceId) => {
        const layouts = [];
        for (const layer of safeLayers) {
            const layerFacades = globalFacades
                ?? ((byLayerId?.[layer.id] && typeof byLayerId[layer.id] === 'object') ? byLayerId[layer.id] : null);
            if (!layerFacades) continue;
            const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object'
                ? layer.faceLinking.links
                : null;
            const visited = new Set();
            let master = faceId;
            for (let i = 0; i < 8; i++) {
                if (visited.has(master)) break;
                visited.add(master);
                const next = links?.[master];
                if (typeof next !== 'string' || next === master) break;
                master = next;
            }
            const layout = layerFacades?.[master]?.layout ?? null;
            if (Array.isArray(layout?.bays?.items) && layout.bays.items.length) layouts.push(layout);
        }
        return layouts;
    };

    const invalidSolverWarning = (warning) => /min width .* exceeds|minrepeats does not fit|locked column widths need/i.test(warning);
    const runLengthIsSolvable = (faceId, length) => {
        const layouts = layoutsForFace(faceId);
        for (const layout of layouts) {
            const probeWarnings = [];
            solveFacadeBaysLayout({
                bays: layout.bays.items,
                groups: Array.isArray(layout?.groups?.items) ? layout.groups.items : null,
                faceLengthMeters: length,
                warnings: probeWarnings
            });
            if (probeWarnings.some(invalidSolverWarning)) return false;
        }
        return true;
    };

    const sourcePlan = createFootprintPlan(footprintLoop);
    const minLengthByRunId = {};
    for (const faceId of sourcePlan.runIds) {
        const authoredLength = getFootprintRunFrame(sourcePlan, faceId).length;
        if (!layoutsForFace(faceId).length) {
            minLengthByRunId[faceId] = 0.01;
            continue;
        }
        if (!runLengthIsSolvable(faceId, authoredLength)) {
            minLengthByRunId[faceId] = authoredLength;
            continue;
        }
        let low = 0.01;
        let high = authoredLength;
        for (let i = 0; i < 32; i++) {
            const mid = (low + high) * 0.5;
            if (runLengthIsSolvable(faceId, mid)) high = mid;
            else low = mid;
        }
        minLengthByRunId[faceId] = high;
    }

    return {
        minLengthByRunId,
        isFootprintSolvable: (plan, affectedRunIds) => affectedRunIds.every((faceId) => (
            runLengthIsSolvable(faceId, getFootprintRunFrame(plan, faceId).length)
        ))
    };
}

function fitFootprintLoopsToBuildArea({
    footprintLoops,
    buildAreaLoops,
    reserveInsetMeters = 0.0,
    mode = 'center',
    fitToLot = false,
    footprintStretch = null,
    fitSeed = 0,
    lotFitSolvability = null,
    warnings = null,
    fitCapture = null
} = {}) {
    const sourceLoops = normalizeFootprintLoopsInput(footprintLoops);
    const areaLoops = normalizeFootprintLoopsInput(buildAreaLoops);
    if (!sourceLoops.length || !areaLoops.length) return sourceLoops;

    // 'anchor': the loops are an authored world placement — keep them exactly.
    // The tile-derived build area skips road tiles and insets road edges, so
    // centering/clamping into it drags an authored building off its lot line
    // (and scaling silently squeezes fixed bays and doors). Warn instead of
    // moving when the placement leaves the claimed area.
    if (mode === 'anchor' && !fitToLot) {
        const src = computeLoopsBoundsXZ(sourceLoops);
        const area = computeLoopsBoundsXZ(areaLoops);
        if (warnings && src && area) {
            const out = src.minX < area.minX - 0.01 || src.maxX > area.maxX + 0.01
                || src.minZ < area.minZ - 0.01 || src.maxZ > area.maxZ + 0.01;
            if (out) warnings.push('Anchored footprint extends outside the claimed tile area (authored placement kept).');
        }
        return sourceLoops;
    }

    const reserve = clamp(reserveInsetMeters, 0.0, 12.0);
    let effectiveAreaLoops = areaLoops;
    if (reserve > EPS) {
        const split = splitLoops(areaLoops);
        const outer = split.outer
            .map((loop) => offsetOrthogonalLoopXZ(loop, reserve))
            .filter((loop) => Array.isArray(loop) && loop.length >= 3);
        const holes = split.holes
            .map((loop) => offsetOrthogonalLoopXZ(loop, -reserve))
            .filter((loop) => Array.isArray(loop) && loop.length >= 3);
        const inset = normalizeFootprintLoopsInput([...outer, ...holes]);
        if (inset.length) effectiveAreaLoops = inset;
    }

    if (fitToLot) {
        if (sourceLoops.length !== 1) {
            if (warnings) warnings.push('Lot fit supports one authored outer footprint loop; fixed placement was kept for this multi-loop building.');
            return sourceLoops;
        }
        if (sourceLoops[0].some((point) => normalizeFootprintArcMetadata(point?.arc))) {
            if (warnings) warnings.push('Lot fit keeps curved footprints fixed; arc runs are not supported by the straight-run fitter.');
            return sourceLoops;
        }
        const fitted = fitBuildingFootprintToLot({
            footprint: sourceLoops[0],
            buildAreaLoops: effectiveAreaLoops,
            stretchMetadata: footprintStretch,
            seed: fitSeed,
            minLengthByRunId: lotFitSolvability?.minLengthByRunId ?? null,
            isFootprintSolvable: lotFitSolvability?.isFootprintSolvable ?? null
        });
        if (fitCapture && typeof fitCapture === 'object') {
            fitCapture.sourceLoop = sourceLoops[0];
            fitCapture.result = fitted;
            const bandsById = new Map();
            for (const application of fitted.applications ?? []) {
                const runId = application?.faceId ?? application?.runId;
                const end = application?.end;
                if (!isFaceId(runId) || (end !== 'start' && end !== 'end')) continue;
                const id = typeof application?.bandId === 'string' && application.bandId
                    ? application.bandId
                    : `${runId}:${end}`;
                bandsById.set(id, { id, runId, end, stretchable: true, curveRule: 'pinned' });
            }
            fitCapture.provenance = createSilhouetteStretchProvenance({
                sourceLoop: sourceLoops[0],
                stretchBands: [...bandsById.values()],
                applications: fitted.applications,
                sourceLayerId: 'building_default',
                lineageId: 'building_default'
            });
        }
        if (warnings) warnings.push(...fitted.warnings);
        return [footprintPlanToLoop(fitted.footprint)];
    }

    const sourceBounds = computeLoopsBoundsXZ(sourceLoops);
    const targetBounds = computeLoopsBoundsXZ(effectiveAreaLoops);
    if (!sourceBounds || !targetBounds) return sourceLoops;

    const sourceW = sourceBounds.maxX - sourceBounds.minX;
    const sourceD = sourceBounds.maxZ - sourceBounds.minZ;
    const targetW = targetBounds.maxX - targetBounds.minX;
    const targetD = targetBounds.maxZ - targetBounds.minZ;
    if (!(sourceW > EPS) || !(sourceD > EPS) || !(targetW > EPS) || !(targetD > EPS)) return sourceLoops;

    // 'shift': the authored placement is a street line, not a lot centre. Keep
    // the size and only TRANSLATE the loops back inside the build area — so a
    // design authored flush with the kerb is pushed off the road rather than
    // squeezed to fit it (scaling a fixed-bay facade squeezes doors) or
    // re-centred away from the street it was drawn against.
    const isShift = mode === 'shift';
    if (isShift && warnings && (sourceW > targetW + 0.01 || sourceD > targetD + 0.01)) {
        warnings.push(`Shifted footprint (${sourceW.toFixed(1)}x${sourceD.toFixed(1)}m) is larger than its build area (${targetW.toFixed(1)}x${targetD.toFixed(1)}m); it was pushed as far in as the area allows and still overhangs.`);
    }

    const sx = targetW / sourceW;
    const sz = targetD / sourceD;
    const scale = isShift ? 1.0 : Math.min(1.0, sx, sz);
    if (!(scale > EPS) || !Number.isFinite(scale)) return sourceLoops;

    const sourceCenterX = (sourceBounds.minX + sourceBounds.maxX) * 0.5;
    const sourceCenterZ = (sourceBounds.minZ + sourceBounds.maxZ) * 0.5;
    const targetCenterX = (targetBounds.minX + targetBounds.maxX) * 0.5;
    const targetCenterZ = (targetBounds.minZ + targetBounds.maxZ) * 0.5;

    let fitted = isShift
        ? sourceLoops
        : transformLoopsXZ(sourceLoops, {
            scale,
            pivotX: sourceCenterX,
            pivotZ: sourceCenterZ,
            translateX: targetCenterX - sourceCenterX,
            translateZ: targetCenterZ - sourceCenterZ
        });

    const fittedBounds = computeLoopsBoundsXZ(fitted);
    if (!fittedBounds) return sourceLoops;

    let shiftX = 0.0;
    let shiftZ = 0.0;
    if (fittedBounds.minX < targetBounds.minX) shiftX += targetBounds.minX - fittedBounds.minX;
    if (fittedBounds.maxX > targetBounds.maxX) shiftX += targetBounds.maxX - fittedBounds.maxX;
    if (fittedBounds.minZ < targetBounds.minZ) shiftZ += targetBounds.minZ - fittedBounds.minZ;
    if (fittedBounds.maxZ > targetBounds.maxZ) shiftZ += targetBounds.maxZ - fittedBounds.maxZ;
    if (Math.abs(shiftX) > EPS || Math.abs(shiftZ) > EPS) {
        fitted = transformLoopsXZ(fitted, { translateX: shiftX, translateZ: shiftZ });
    }

    const normalized = normalizeFootprintLoopsInput(fitted);
    return normalized.length ? normalized : sourceLoops;
}

function computeMaterialVariationSeedFromFootprintLoops(loops, { salt = 'building' } = {}) {
    const srcLoops = Array.isArray(loops) ? loops : [];
    let h = 2166136261 >>> 0;
    const mix = (v) => {
        h ^= hashUint32(v);
        h = Math.imul(h, 16777619) >>> 0;
    };

    const s = typeof salt === 'string' ? salt : '';
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
    mix(srcLoops.length);

    for (const loop of srcLoops) {
        const pts = Array.isArray(loop) ? loop : [];
        mix(pts.length);
        for (const p of pts) {
            mix(q(p?.x ?? 0));
            mix(q(p?.z ?? 0));
        }
    }

    return h >>> 0;
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

function normalize2(v) {
    const len = Math.hypot(v.x, v.z);
    if (!(len > EPS)) return { x: 0, z: 0, len: 0 };
    return { x: v.x / len, z: v.z / len, len };
}

function cross2(a, b) {
    return a.x * b.z - a.z * b.x;
}

function dot2(a, b) {
    return a.x * b.x + a.z * b.z;
}

function rightNormal2(v) {
    return { x: v.z, z: -v.x };
}

function leftNormal2(v) {
    return { x: -v.z, z: v.x };
}

function intersectLines2(p, r, q, s) {
    const denom = cross2(r, s);
    if (Math.abs(denom) < 1e-9) return null;
    const qp = { x: q.x - p.x, z: q.z - p.z };
    const t = cross2(qp, s) / denom;
    const x = p.x + r.x * t;
    const z = p.z + r.z * t;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x, z };
}

function buildExteriorRunsFromLoop(loop, { keepFaceSplits = false } = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 2) return [];

    const runs = [];
    const collinear = (a, b) => Math.abs(cross2(a, b)) < 1e-6 && dot2(a, b) > 0.999;

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        const v = normalize2({ x: b.x - a.x, z: b.z - a.z });
        const L = v.len;
        if (!(L > EPS)) continue;

        const last = runs[runs.length - 1] ?? null;
        const startsAtFaceSplit = keepFaceSplits && a?.split === true;
        if (last && collinear(last.dir, v) && !startsAtFaceSplit) {
            last.b = b;
            last.length += L;
            continue;
        }

        runs.push({
            a,
            b,
            dir: { x: v.x, z: v.z },
            length: L,
            startsAtFaceSplit
        });
    }

    if (runs.length > 1) {
        const first = runs[0];
        const last = runs[runs.length - 1];
        if (first && last && collinear(first.dir, last.dir) && !(keepFaceSplits && pts[0]?.split === true)) {
            first.a = last.a;
            first.length += last.length;
            first.startsAtFaceSplit = last.startsAtFaceSplit;
            runs.pop();
        }
    }

    for (let i = 0; i < runs.length; i++) {
        const next = runs[(i + 1) % runs.length];
        runs[i].endsAtFaceSplit = !!next?.startsAtFaceSplit;
    }

    return runs;
}

function computeQuadFacadeFramesFromLoop(loop, { warnings = null, tol = 1e-4 } = {}) {
    const w = Array.isArray(warnings) ? warnings : null;
    const runs = buildExteriorRunsFromLoop(loop);
    // AI 499: a plan-edge bevel turns each cut corner into a short diagonal
    // connector run, so a beveled rect has up to 8 runs. The four axis-aligned
    // runs still are A–D (a bevel shortens a face, it does not move its plane);
    // the diagonals are corner facets and carry no face of their own.
    if (runs.length < 4 || runs.length > 8) {
        if (w) w.push('Facade silhouette: footprint is not a simple 4-face loop (A–D).');
        return null;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of loop) {
        if (!p) continue;
        const x = Number(p.x);
        const z = Number(p.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }

    const hasBounds = Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ);
    if (hasBounds) {
        const classifyRun = (run) => {
            const a = run?.a ?? null;
            const b = run?.b ?? null;
            if (!a || !b) return null;
            const ax = Number(a.x);
            const az = Number(a.z);
            const bx = Number(b.x);
            const bz = Number(b.z);
            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return null;

            const isH = Math.abs(az - bz) <= tol && Math.abs(ax - bx) > tol;
            const isV = Math.abs(ax - bx) <= tol && Math.abs(az - bz) > tol;
            if (isH) {
                if (Math.abs(az - maxZ) <= tol && Math.abs(bz - maxZ) <= tol) return 'A';
                if (Math.abs(az - minZ) <= tol && Math.abs(bz - minZ) <= tol) return 'C';
            }
            if (isV) {
                if (Math.abs(ax - maxX) <= tol && Math.abs(bx - maxX) <= tol) return 'B';
                if (Math.abs(ax - minX) <= tol && Math.abs(bx - minX) <= tol) return 'D';
            }
            return null;
        };

        const runByFaceId = {};
        const runIndexByFaceId = {};
        let connectorCount = 0;
        let maxConnectorLength = 0;
        let mappingOk = true;
        for (let runIndex = 0; runIndex < runs.length; runIndex++) {
            const run = runs[runIndex];
            const faceId = classifyRun(run);
            if (!faceId) {
                connectorCount += 1;
                maxConnectorLength = Math.max(maxConnectorLength, Number(run?.length) || 0);
                continue;
            }
            if (runByFaceId[faceId]) {
                mappingOk = false;
                break;
            }
            runByFaceId[faceId] = run;
            runIndexByFaceId[faceId] = runIndex;
        }

        // AI 512: a connector wide enough to read as a facade is not a corner
        // facet — refuse the quad mapping so the N-face path promotes it to a
        // real face.
        if (mappingOk && runByFaceId.A && runByFaceId.B && runByFaceId.C && runByFaceId.D && connectorCount <= 4
            && maxConnectorLength <= FACADE_QUAD_FACET_MAX_RUN_METERS) {
            const faceIds = ['A', 'B', 'C', 'D'];
            const normals = Object.freeze({
                A: { x: 0, z: 1 },
                B: { x: 1, z: 0 },
                C: { x: 0, z: -1 },
                D: { x: -1, z: 0 }
            });

            const orientRun = (run, faceId) => {
                const a = run?.a ?? null;
                const b = run?.b ?? null;
                if (!a || !b) return null;
                switch (faceId) {
                    case 'A': return (a.x <= b.x) ? { a, b } : { a: b, b: a };
                    case 'B': return (a.z >= b.z) ? { a, b } : { a: b, b: a };
                    case 'C': return (a.x >= b.x) ? { a, b } : { a: b, b: a };
                    case 'D': return (a.z <= b.z) ? { a, b } : { a: b, b: a };
                    default: return null;
                }
            };

            const frames = {};
            for (let i = 0; i < 4; i++) {
                const faceId = faceIds[i];
                const run = runByFaceId[faceId];
                const L = Number(run?.length) || 0;
                if (!(L > EPS)) {
                    if (w) w.push(`Facade silhouette: face ${faceId} has invalid length.`);
                    return null;
                }

                const oriented = orientRun(run, faceId);
                if (!oriented) return null;
                const t = normalize2({ x: oriented.b.x - oriented.a.x, z: oriented.b.z - oriented.a.z });
                if (!(t.len > EPS)) {
                    if (w) w.push(`Facade silhouette: face ${faceId} has invalid tangent.`);
                    return null;
                }

                const n = normals[faceId];
                if (!n) return null;
                frames[faceId] = {
                    faceId,
                    start: { x: qf(oriented.a.x), z: qf(oriented.a.z) },
                    end: { x: qf(oriented.b.x), z: qf(oriented.b.z) },
                    t: { x: t.x, z: t.z },
                    n: { x: n.x, z: n.z },
                    length: L
                };
            }

            // Every corner is either sharp (the faces meet) or a bevel facet
            // (exactly one connector run between them in loop order). Anything
            // else means this is not a plan loop at all — a resolved silhouette
            // with bay relief, say — and is refused the same way a non-quad
            // footprint always was.
            // A–D may sit either way round the loop depending on its winding,
            // so the direction is read off the loop once and the gaps counted
            // in it.
            const runCount = runs.length;
            const forwardGap = (fromId, toId) => (((runIndexByFaceId[toId] - runIndexByFaceId[fromId]) % runCount) + runCount) % runCount;
            const faceOrderIsForward = forwardGap('A', 'B') <= forwardGap('A', 'D');
            const runsBetweenFaces = (fromId, toId) => {
                const gap = faceOrderIsForward ? forwardGap(fromId, toId) : forwardGap(toId, fromId);
                return Math.max(0, gap - 1);
            };

            const cornerFacets = {};
            for (let i = 0; i < 4; i++) {
                const aId = faceIds[i];
                const bId = faceIds[(i + 1) % 4];
                const a = frames[aId];
                const b = frames[bId];
                if (!a || !b) return null;

                const between = runsBetweenFaces(aId, bId);
                if (between === 0) {
                    if (!pointsEqualXZ(a.end, b.start, tol) && w) {
                        w.push(`Facade silhouette: corner mismatch at ${aId}→${bId}.`);
                    }
                    continue;
                }
                if (between !== 1) {
                    if (w) w.push('Facade silhouette: footprint is not a simple 4-face loop (A–D).');
                    return null;
                }

                const cornerId = `${aId}${bId}`;
                const t = normalize2({ x: b.start.x - a.end.x, z: b.start.z - a.end.z });
                if (!(t.len > EPS)) continue;
                // The facet looks out between the two faces it folds.
                const n = normalize2({ x: a.n.x + b.n.x, z: a.n.z + b.n.z });
                cornerFacets[cornerId] = {
                    cornerId,
                    faces: [aId, bId],
                    start: { x: qf(a.end.x), z: qf(a.end.z) },
                    end: { x: qf(b.start.x), z: qf(b.start.z) },
                    t: { x: t.x, z: t.z },
                    n: n.len > EPS ? { x: n.x, z: n.z } : { x: t.z, z: -t.x },
                    length: qf(t.len)
                };
            }
            frames.cornerFacets = cornerFacets;
            frames.order = ['A', 'B', 'C', 'D'];

            return frames;
        }
    }

    if (runs.length !== 4) {
        if (w) w.push('Facade silhouette: footprint is not a simple 4-face loop (A–D).');
        return null;
    }

    const faceIds = ['A', 'B', 'C', 'D'];
    const center = { x: 0, z: 0 };
    for (const p of loop) {
        center.x += Number(p?.x) || 0;
        center.z += Number(p?.z) || 0;
    }
    if (loop.length > 0) {
        center.x /= loop.length;
        center.z /= loop.length;
    }

    const runInfos = runs.map((run, idx) => {
        const a = run?.a ?? null;
        const b = run?.b ?? null;
        const t = normalize2({ x: (Number(b?.x) || 0) - (Number(a?.x) || 0), z: (Number(b?.z) || 0) - (Number(a?.z) || 0) });
        const mid = {
            x: ((Number(a?.x) || 0) + (Number(b?.x) || 0)) * 0.5,
            z: ((Number(a?.z) || 0) + (Number(b?.z) || 0)) * 0.5
        };
        const outwardHint = { x: mid.x - center.x, z: mid.z - center.z };
        const right = rightNormal2(t);
        const outward = dot2(right, outwardHint) >= 0 ? right : { x: -right.x, z: -right.z };
        return { idx, run, t, outward, mid };
    });

    const takeBest = (scoreFn, taken) => {
        let best = -1;
        let bestScore = -Infinity;
        for (const info of runInfos) {
            if (taken.has(info.idx)) continue;
            const score = Number(scoreFn(info)) || -Infinity;
            if (score > bestScore) {
                bestScore = score;
                best = info.idx;
            }
        }
        return best;
    };

    const taken = new Set();
    const runIndexByFaceId = {};
    runIndexByFaceId.A = takeBest((info) => info.outward.z, taken);
    if (runIndexByFaceId.A < 0) return null;
    taken.add(runIndexByFaceId.A);
    runIndexByFaceId.C = takeBest((info) => -info.outward.z, taken);
    if (runIndexByFaceId.C < 0) return null;
    taken.add(runIndexByFaceId.C);
    runIndexByFaceId.B = takeBest((info) => info.outward.x, taken);
    if (runIndexByFaceId.B < 0) return null;
    taken.add(runIndexByFaceId.B);
    runIndexByFaceId.D = takeBest((info) => -info.outward.x, taken);
    if (runIndexByFaceId.D < 0) return null;

    const runByFaceId = {};
    for (const faceId of faceIds) {
        const idx = runIndexByFaceId[faceId];
        runByFaceId[faceId] = runs[idx] ?? null;
        if (!runByFaceId[faceId]) return null;
    }

    const orientRun = (run, reverse) => {
        const a = run?.a ?? null;
        const b = run?.b ?? null;
        if (!a || !b) return null;
        return reverse ? { a: b, b: a } : { a, b };
    };

    let bestMask = 0;
    let bestError = Infinity;
    for (let mask = 0; mask < 16; mask++) {
        const oriented = {};
        let invalid = false;
        for (let i = 0; i < 4; i++) {
            const faceId = faceIds[i];
            const rev = ((mask >> i) & 1) === 1;
            const edge = orientRun(runByFaceId[faceId], rev);
            if (!edge) {
                invalid = true;
                break;
            }
            oriented[faceId] = edge;
        }
        if (invalid) continue;

        let err = 0;
        for (let i = 0; i < 4; i++) {
            const faceId = faceIds[i];
            const nextFaceId = faceIds[(i + 1) % 4];
            const a = oriented[faceId];
            const b = oriented[nextFaceId];
            const dx = (Number(a?.b?.x) || 0) - (Number(b?.a?.x) || 0);
            const dz = (Number(a?.b?.z) || 0) - (Number(b?.a?.z) || 0);
            err += dx * dx + dz * dz;
        }

        if (err < bestError) {
            bestError = err;
            bestMask = mask;
        }
    }

    const frames = {};
    for (let i = 0; i < 4; i++) {
        const faceId = faceIds[i];
        const run = runByFaceId[faceId];
        const reverse = ((bestMask >> i) & 1) === 1;
        const oriented = orientRun(run, reverse);
        if (!oriented) return null;

        const L = Number(run?.length) || 0;
        if (!(L > EPS)) {
            if (w) w.push(`Facade silhouette: face ${faceId} has invalid length.`);
            return null;
        }

        const t = normalize2({ x: oriented.b.x - oriented.a.x, z: oriented.b.z - oriented.a.z });
        if (!(t.len > EPS)) {
            if (w) w.push(`Facade silhouette: face ${faceId} has invalid tangent.`);
            return null;
        }

        const mid = { x: (oriented.a.x + oriented.b.x) * 0.5, z: (oriented.a.z + oriented.b.z) * 0.5 };
        const outwardHint = { x: mid.x - center.x, z: mid.z - center.z };
        const right = rightNormal2(t);
        const nRaw = dot2(right, outwardHint) >= 0 ? right : { x: -right.x, z: -right.z };
        const n = normalize2(nRaw);
        if (!(n.len > EPS)) {
            if (w) w.push(`Facade silhouette: face ${faceId} has invalid normal.`);
            return null;
        }

        frames[faceId] = {
            faceId,
            start: { x: qf(oriented.a.x), z: qf(oriented.a.z) },
            end: { x: qf(oriented.b.x), z: qf(oriented.b.z) },
            t: { x: t.x, z: t.z },
            n: { x: n.x, z: n.z },
            length: L
        };
    }

    for (let i = 0; i < 4; i++) {
        const a = frames[faceIds[i]];
        const b = frames[faceIds[(i + 1) % 4]];
        if (!a || !b) return null;
        if (!pointsEqualXZ(a.end, b.start, tol) && w) w.push(`Facade silhouette: corner mismatch at ${faceIds[i]}→${faceIds[(i + 1) % 4]}.`);
    }

    frames.order = ['A', 'B', 'C', 'D'];
    return frames;
}

function computePersistedFacadeFramesFromLoop(loop, { warnings = null } = {}) {
    const points = Array.isArray(loop) ? loop : [];
    if (points.length < 3 || points.length > FACADE_MAX_FACES) return null;
    const ids = points.map((point) => point?.runId);
    if (!ids.every((id) => isFaceId(id)) || new Set(ids).size !== ids.length) return null;
    const directions = points.map((point) => point?.runForward !== false);

    const area = signedArea(points);
    if (!(Math.abs(area) > EPS)) return null;
    // `order` is the physical polygon traversal. `runForward` is independent:
    // it defines the stable run's authored local-u direction and may differ on
    // every run after an explicit target remap. Reversing the whole traversal
    // from one run's flag relabelled unrelated faces positionally and made
    // mixed-orientation silhouettes impossible to join.
    const indices = createSilhouetteRunTraversal(points).map((entry) => entry.loopIndex);

    const frames = {};
    const order = [];
    for (const index of indices) {
        const rawStart = points[index];
        const rawEnd = points[(index + 1) % points.length];
        const rawTangent = normalize2({ x: rawEnd.x - rawStart.x, z: rawEnd.z - rawStart.z });
        if (!(rawTangent.len > EPS)) return null;
        const forward = directions[index];
        const faceId = ids[index];
        const normal = area >= 0 ? rightNormal2(rawTangent) : leftNormal2(rawTangent);
        const orientedStart = forward ? rawStart : rawEnd;
        const orientedEnd = forward ? rawEnd : rawStart;
        const orientedArc = forward
            ? normalizeFootprintArcMetadata(rawStart?.arc)
            : reverseFootprintArcMetadata(rawStart?.arc);
        const curve = resolveFootprintArcRun(orientedStart, orientedEnd, orientedArc);
        const normalSide = ((area >= 0) === forward) ? 'right' : 'left';
        const startSample = curve ? sampleResolvedFootprintArc(curve, 0) : null;
        const endSample = curve ? sampleResolvedFootprintArc(curve, curve.length) : null;
        const startT = startSample?.tangent ?? {
            x: forward ? rawTangent.x : -rawTangent.x,
            z: forward ? rawTangent.z : -rawTangent.z
        };
        const endT = endSample?.tangent ?? startT;
        const normalAt = (tangent) => normalSide === 'right' ? rightNormal2(tangent) : leftNormal2(tangent);
        const startN = curve ? normalAt(startT) : normal;
        const endN = curve ? normalAt(endT) : normal;
        frames[faceId] = {
            faceId,
            runIndex: index,
            runForward: forward,
            start: {
                x: qf(orientedStart.x),
                z: qf(orientedStart.z)
            },
            end: {
                x: qf(orientedEnd.x),
                z: qf(orientedEnd.z)
            },
            t: { x: startT.x, z: startT.z },
            n: { x: startN.x, z: startN.z },
            startT: { x: startT.x, z: startT.z },
            endT: { x: endT.x, z: endT.z },
            startN: { x: startN.x, z: startN.z },
            endN: { x: endN.x, z: endN.z },
            normalSide,
            length: curve?.length ?? rawTangent.len,
            ...(curve ? { curve } : {})
        };
        order.push(faceId);
    }
    frames.cornerFacets = {};
    frames.order = order;
    frames.persistedRunIds = true;
    return frames;
}

// AI 512: N-face frames. Rect(ish) footprints keep resolving through the quad
// path above — identical A–D layouts as ever. Anything else (L/V/W wings,
// hexagons, chamfered corners wider than a facet, arbitrary simple polygons)
// derives ONE first-class face per exterior run: ids are assigned in loop
// order starting from the most street-facing run (max outward +z, ties to the
// longest), which gets 'A'; traversal runs toward the neighbour that leans
// +x, so a rect-like N-gon still reads A=front, B=right. Runs shorter than
// FACADE_NFACE_FACET_MAX_RUN_METERS become corner facets between their
// neighbouring faces, exactly like the AI 499 bevel facets.
// Exported: the BF2 plan-view face picker resolves the same frames.
export function computeFacadeFramesFromLoop(loop, { warnings = null, tol = 1e-4 } = {}) {
    const w = Array.isArray(warnings) ? warnings : null;
    const persisted = computePersistedFacadeFramesFromLoop(loop, { warnings: w });
    if (persisted) return persisted;
    const hasFaceSplits = Array.isArray(loop) && loop.some((point) => point?.split === true);
    if (!hasFaceSplits) {
        const quadWarnings = [];
        const quad = computeQuadFacadeFramesFromLoop(loop, { warnings: quadWarnings, tol });
        if (quad) {
            if (w) w.push(...quadWarnings);
            return quad;
        }
    }

    const runsRaw = buildExteriorRunsFromLoop(loop, { keepFaceSplits: hasFaceSplits });
    if (runsRaw.length < 3) {
        if (w) w.push('Facade silhouette: footprint has fewer than 3 exterior runs.');
        return null;
    }

    const area = signedArea(loop);
    const orientRuns = [];
    for (const run of runsRaw) {
        const a = run?.a ?? null;
        const b = run?.b ?? null;
        if (!a || !b) continue;
        const t = normalize2({ x: (Number(b.x) || 0) - (Number(a.x) || 0), z: (Number(b.z) || 0) - (Number(a.z) || 0) });
        if (!(t.len > EPS)) continue;
        const nRaw = area >= 0 ? rightNormal2(t) : leftNormal2(t);
        orientRuns.push({
            a: { x: Number(a.x) || 0, z: Number(a.z) || 0 },
            b: { x: Number(b.x) || 0, z: Number(b.z) || 0 },
            t: { x: t.x, z: t.z },
            n: { x: nRaw.x, z: nRaw.z },
            length: Number(run?.length) || t.len,
            isFace: !!run?.startsAtFaceSplit
                || !!run?.endsAtFaceSplit
                || (Number(run?.length) || t.len) >= FACADE_NFACE_FACET_MAX_RUN_METERS
        });
    }

    const faceCount = orientRuns.filter((r) => r.isFace).length;
    if (faceCount < 3) {
        if (w) w.push('Facade silhouette: footprint has fewer than 3 face-length runs.');
        return null;
    }
    if (faceCount > FACADE_MAX_FACES) {
        if (w) w.push(`Facade silhouette: footprint has more than ${FACADE_MAX_FACES} faces.`);
        return null;
    }

    // Pick the 'A' run: most street-facing (max outward z), ties to length.
    let startIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < orientRuns.length; i++) {
        const r = orientRuns[i];
        if (!r.isFace) continue;
        const score = r.n.z * 1000 + r.length;
        if (score > bestScore + 1e-9) {
            bestScore = score;
            startIdx = i;
        }
    }
    if (startIdx < 0) return null;

    // Traverse toward the neighbouring face that leans +x (so B sits to the
    // right of the front, like the quad mapping). Reversing the traversal
    // flips every run's direction but keeps its outward normal.
    const m = orientRuns.length;
    const faceAfter = (idx, step) => {
        for (let k = 1; k <= m; k++) {
            const r = orientRuns[(idx + step * k + m * k) % m];
            if (r.isFace) return r;
        }
        return null;
    };
    const nextFace = faceAfter(startIdx, 1);
    const prevFace = faceAfter(startIdx, -1);
    const forward = (Number(nextFace?.n?.x) || 0) >= (Number(prevFace?.n?.x) || 0);
    const ordered = [];
    for (let k = 0; k < m; k++) {
        const idx = forward ? (startIdx + k) % m : (startIdx - k + m * 2) % m;
        const src = orientRuns[idx];
        ordered.push(forward ? src : { ...src, a: src.b, b: src.a, t: { x: -src.t.x, z: -src.t.z } });
    }

    const frames = {};
    const order = [];
    const facetRunsBefore = new Map();
    let pendingFacets = [];
    for (const run of ordered) {
        if (!run.isFace) {
            pendingFacets.push(run);
            continue;
        }
        const faceId = facadeFaceIdAt(order.length);
        frames[faceId] = {
            faceId,
            start: { x: qf(run.a.x), z: qf(run.a.z) },
            end: { x: qf(run.b.x), z: qf(run.b.z) },
            t: { x: run.t.x, z: run.t.z },
            n: { x: run.n.x, z: run.n.z },
            length: run.length
        };
        if (pendingFacets.length) facetRunsBefore.set(faceId, pendingFacets);
        pendingFacets = [];
        order.push(faceId);
    }
    // Facets between the last face and the first wrap around.
    if (pendingFacets.length && order.length) {
        const firstId = order[0];
        facetRunsBefore.set(firstId, [...(facetRunsBefore.get(firstId) ?? []), ...pendingFacets]);
    }

    const cornerFacets = {};
    for (let i = 0; i < order.length; i++) {
        const aId = order[i];
        const bId = order[(i + 1) % order.length];
        const a = frames[aId];
        const b = frames[bId];
        const facetRuns = facetRunsBefore.get(bId) ?? null;
        if (!facetRuns || !facetRuns.length) {
            if (!pointsEqualXZ(a.end, b.start, tol) && w) {
                w.push(`Facade silhouette: corner mismatch at ${aId}→${bId}.`);
            }
            continue;
        }
        if (facetRuns.length > 1 && w) {
            w.push(`Facade silhouette: merged ${facetRuns.length} short runs into corner facet ${aId}${bId}.`);
        }
        const cornerId = `${aId}${bId}`;
        const t = normalize2({ x: b.start.x - a.end.x, z: b.start.z - a.end.z });
        if (!(t.len > EPS)) continue;
        const n = normalize2({ x: a.n.x + b.n.x, z: a.n.z + b.n.z });
        cornerFacets[cornerId] = {
            cornerId,
            faces: [aId, bId],
            start: { x: qf(a.end.x), z: qf(a.end.z) },
            end: { x: qf(b.start.x), z: qf(b.start.z) },
            t: { x: t.x, z: t.z },
            n: n.len > EPS ? { x: n.x, z: n.z } : { x: t.z, z: -t.x },
            length: qf(t.len)
        };
    }

    frames.cornerFacets = cornerFacets;
    frames.order = order;
    return frames;
}

function computeEvenWindowLayoutMinGap({
    length,
    windowWidth,
    minGap
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const g = clamp(minGap, 0, 50);
    if (!Number.isFinite(L) || !(L > 0) || !(w > 0)) return { count: 0, gap: 0, starts: [] };

    let count = Math.floor((L - g) / (w + g));
    if (!Number.isFinite(count) || count < 0) count = 0;
    if (count === 0) return { count: 0, gap: 0, starts: [] };

    const gap = (L - count * w) / (count + 1);
    if (!(gap >= g - 1e-6)) return { count: 0, gap: 0, starts: [] };

    const starts = [];
    for (let i = 0; i < count; i++) starts.push(gap + i * (w + gap));
    return { count, gap, starts };
}

function computeWindowSegmentsWithSpacers({
    length,
    windowWidth,
    desiredGap,
    cornerEps,
    spacerEnabled,
    spacerEvery,
    spacerWidth
} = {}) {
    const L = Number(length);
    const w = clamp(windowWidth, 0.2, 50);
    const desired = clamp(desiredGap, 0, 50);
    const eps = clamp(cornerEps, 0.001, 2.0);
    const minGap = Math.max(desired, eps);
    const enabled = !!spacerEnabled && clampInt(spacerEvery, 0, 9999) > 0 && (Number(spacerWidth) || 0) > EPS;
    const band = enabled ? clamp(spacerWidth, 0.01, 10.0) : 0;
    const N = enabled ? clampInt(spacerEvery, 1, 9999) : 0;

    if (!enabled) {
        return {
            segments: [{
                offset: 0,
                layout: computeEvenWindowLayoutMinGap({ length: L, windowWidth: w, minGap })
            }],
            spacerCenters: []
        };
    }

    let layout = computeEvenWindowLayoutMinGap({ length: L, windowWidth: w, minGap });
    let count = clampInt(layout.count, 0, 9999);
    if (count === 0) return { segments: [{ offset: 0, layout }], spacerCenters: [] };

    let spacerCount = 0;
    let effectiveLength = L;

    for (let i = 0; i < 16; i++) {
        spacerCount = Math.floor(Math.max(0, count - 1) / N);
        effectiveLength = L - spacerCount * band;
        if (!(effectiveLength > w + minGap * 2)) {
            count = 0;
            layout = { count: 0, gap: 0, starts: [] };
            break;
        }

        const nextLayout = computeEvenWindowLayoutMinGap({ length: effectiveLength, windowWidth: w, minGap });
        const nextCount = clampInt(nextLayout.count, 0, 9999);
        layout = nextLayout;
        if (nextCount === count) break;
        count = nextCount;
    }

    spacerCount = count > N ? Math.floor(Math.max(0, count - 1) / N) : 0;

    const segments = [];
    for (let group = 0; group * N < count; group++) {
        const startIndex = group * N;
        const endIndex = Math.min(count, (group + 1) * N);
        segments.push({
            offset: group * band,
            layout: { starts: layout.starts.slice(startIndex, endIndex) }
        });
    }

    const spacerCenters = [];
    for (let k = 1; k <= spacerCount; k++) {
        const leftIndex = k * N - 1;
        const rightIndex = k * N;
        if (leftIndex < 0 || rightIndex >= count) break;
        const leftEndEff = layout.starts[leftIndex] + w;
        const rightStartEff = layout.starts[rightIndex];
        const leftEnd = leftEndEff + (k - 1) * band;
        const rightStart = rightStartEff + k * band;
        spacerCenters.push((leftEnd + rightStart) * 0.5);
    }

    return { segments, spacerCenters };
}

function getRendererResolution(renderer, out = new THREE.Vector2()) {
    if (!renderer?.getSize) return null;
    renderer.getSize(out);
    return out;
}

function createLineMaterial({ renderer, color, linewidth, opacity, renderOrder }) {
    const mat = new LineMaterial({
        color,
        linewidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false
    });

    const res = getRendererResolution(renderer);
    if (res) mat.resolution.set(res.x, res.y);

    mat.userData = mat.userData ?? {};
    if (Number.isFinite(renderOrder)) mat.userData.renderOrder = renderOrder;
    return mat;
}

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function collectGeometryVertexIndicesForMaterialIndex(geometry, materialIndex) {
    const geo = geometry ?? null;
    const groups = Array.isArray(geo?.groups) ? geo.groups : [];
    if (!groups.length) return null;

    const target = Number.isFinite(materialIndex) ? Number(materialIndex) : 0;
    const out = new Set();
    const index = geo.index ?? null;

    for (const group of groups) {
        if (!group) continue;
        const idx = Number(group.materialIndex) || 0;
        if (idx !== target) continue;
        const start = Math.max(0, Number(group.start) || 0);
        const count = Math.max(0, Number(group.count) || 0);
        if (!count) continue;

        if (index?.getX) {
            for (let i = start; i < start + count; i++) out.add(index.getX(i));
            continue;
        }

        for (let i = start; i < start + count; i++) out.add(i);
    }

    return out.size ? Array.from(out) : null;
}

function applyUvYContinuityOffsetToGeometry(geometry, { yOffset = 0.0, materialIndex = 1 } = {}) {
    const geo = geometry ?? null;
    const uv = geo?.getAttribute?.('uv') ?? null;
    const pos = geo?.getAttribute?.('position') ?? null;
    if (!uv?.getY || !uv?.setY || !pos?.getY) return;

    const dy = Number(yOffset) || 0.0;
    if (Math.abs(dy) < 1e-9) return;

    const vertexIndices = collectGeometryVertexIndicesForMaterialIndex(geo, materialIndex);
    if (!vertexIndices?.length) return;

    let n = 0;
    let sumY = 0;
    let sumV = 0;
    let sumYV = 0;
    const step = Math.max(1, Math.floor(vertexIndices.length / 128));
    for (let i = 0; i < vertexIndices.length; i += step) {
        const vi = vertexIndices[i];
        const y = pos.getY(vi);
        const v = uv.getY(vi);
        if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
        n += 1;
        sumY += y;
        sumV += v;
        sumYV += y * v;
    }
    if (!n) return;

    const meanY = sumY / n;
    const meanV = sumV / n;
    const cov = sumYV / n - meanY * meanV;
    const dir = cov >= 0 ? 1 : -1;
    const delta = dir * dy;

    for (const vi of vertexIndices) {
        const v = uv.getY(vi);
        if (!Number.isFinite(v)) continue;
        uv.setY(vi, v + delta);
    }
    uv.needsUpdate = true;
}

function collectLoopCornerPointsXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    if (n < 3) return [];

    const corners = [];
    for (let i = 0; i < n; i++) {
        const prev = pts[(i + n - 1) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        if (!prev || !curr || !next) continue;

        const a = normalize2({ x: curr.x - prev.x, z: curr.z - prev.z });
        const b = normalize2({ x: next.x - curr.x, z: next.z - curr.z });
        if (!(a.len > EPS) || !(b.len > EPS)) continue;

        const dot = Math.abs(a.x * b.x + a.z * b.z);
        if (dot > 0.999) continue;
        corners.push({ x: curr.x, z: curr.z });
    }

    return corners;
}

function applyMatVarCornerDistanceToGeometry(geometry, { loops } = {}) {
    const geo = geometry ?? null;
    const pos = geo?.getAttribute?.('position') ?? null;
    if (!pos?.count || !pos.getX || !pos.getZ) return;

    const srcLoops = Array.isArray(loops) ? loops : [];
    const corners = [];
    for (const loop of srcLoops) corners.push(...collectLoopCornerPointsXZ(loop));
    if (!corners.length) return;

    const data = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        let best = Infinity;
        for (const c of corners) {
            const d = Math.hypot(x - c.x, z - c.z);
            if (d < best) best = d;
        }
        data[i] = Number.isFinite(best) ? best : 0.0;
    }
    geo.setAttribute('matVarCornerDist', new THREE.Float32BufferAttribute(data, 1));
}

function facadeStripSegmentKey(faceId, u0, depth0, u1, depth1) {
    const f = (n) => qf(Number(n) || 0);
    const aU = f(u0);
    const aD = f(depth0);
    const bU = f(u1);
    const bD = f(depth1);

    const ordered = (aU < bU) || (aU === bU && aD <= bD);
    const p0 = ordered ? { u: aU, d: aD } : { u: bU, d: bD };
    const p1 = ordered ? { u: bU, d: bD } : { u: aU, d: aD };
    return `${faceId}|${p0.u}|${p0.d}|${p1.u}|${p1.d}`;
}

function facadeWorldSegmentKey(x0, z0, x1, z1) {
    const f = (n) => qf(Number(n) || 0);
    const a = { x: f(x0), z: f(z0) };
    const b = { x: f(x1), z: f(z1) };
    const ordered = a.x < b.x || (a.x === b.x && a.z <= b.z);
    const p0 = ordered ? a : b;
    const p1 = ordered ? b : a;
    return `__world__:${p0.x}|${p0.z}|${p1.x}|${p1.z}`;
}

function sortUniqueNumbers(values, { tol = 1e-5 } = {}) {
    const list = [];
    for (const v of values) {
        const num = Number(v);
        if (!Number.isFinite(num)) continue;
        list.push(num);
    }
    list.sort((a, b) => a - b);
    const out = [];
    for (const v of list) {
        if (!out.length || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
    }
    return out;
}

function normalizeFacadeRangeEntry(entry, order) {
    if (!entry || typeof entry !== 'object') return null;
    const u0 = Number(entry.u0);
    const u1 = Number(entry.u1);
    if (!Number.isFinite(u0) || !Number.isFinite(u1)) return null;

    const depth0Raw = Number(entry.depth0);
    const depth1Raw = Number(entry.depth1);
    const depthRaw = Number(entry.depth);
    const depth0 = Number.isFinite(depth0Raw) ? depth0Raw : (Number.isFinite(depthRaw) ? depthRaw : 0.0);
    const depth1 = Number.isFinite(depth1Raw) ? depth1Raw : (Number.isFinite(depthRaw) ? depthRaw : depth0);

    return {
        materialIndex: clampInt(entry.materialIndex, 0, 9999),
        u0,
        u1,
        depth0,
        depth1,
        uvStart: Number(entry.uvStart) || 0.0,
        order
    };
}

function sampleFacadeRangeDepthAtU(range, u) {
    const u0 = Number(range?.u0) || 0;
    const u1 = Number(range?.u1) || 0;
    const d0 = Number(range?.depth0) || 0;
    const d1 = Number(range?.depth1) || d0;
    const denom = u1 - u0;
    if (!(Math.abs(denom) > 1e-6)) return d0;
    const t = clamp((u - u0) / denom, 0.0, 1.0);
    return d0 + (d1 - d0) * t;
}

function chooseDeterministicFacadeRangeCandidate(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.materialIndex !== b.materialIndex) return a.materialIndex < b.materialIndex ? a : b;
    const aMin = Math.min(a.u0, a.u1);
    const bMin = Math.min(b.u0, b.u1);
    if (Math.abs(aMin - bMin) > 1e-6) return aMin < bMin ? a : b;
    const aMax = Math.max(a.u0, a.u1);
    const bMax = Math.max(b.u0, b.u1);
    if (Math.abs(aMax - bMax) > 1e-6) return aMax < bMax ? a : b;
    return a.order <= b.order ? a : b;
}

function resolveFacadeRangeOverrideForSegment(ranges, { uA, uB, depthA, depthB, tol = 1e-4 } = {}) {
    const list = Array.isArray(ranges)
        ? ranges.map((entry, idx) => normalizeFacadeRangeEntry(entry, idx)).filter(Boolean)
        : [];
    if (!list.length) return null;

    const segUA = Number(uA) || 0;
    const segUB = Number(uB) || 0;
    const segDepthMid = ((Number(depthA) || 0) + (Number(depthB) || 0)) * 0.5;
    const uMin = Math.min(segUA, segUB);
    const uMax = Math.max(segUA, segUB);
    const uSpan = Math.abs(segUB - segUA);

    if (uSpan > tol) {
        const segMid = (uMin + uMax) * 0.5;
        let best = null;
        let bestOverlap = -Infinity;
        let bestCenterDist = Infinity;
        let bestDepth = -Infinity;

        for (const r of list) {
            const rMin = Math.min(r.u0, r.u1);
            const rMax = Math.max(r.u0, r.u1);
            const overlap = Math.min(uMax, rMax) - Math.max(uMin, rMin);
            if (!(overlap > tol)) continue;

            const center = (rMin + rMax) * 0.5;
            const centerDist = Math.abs(center - segMid);
            const depthMid = sampleFacadeRangeDepthAtU(r, segMid);

            if (overlap > bestOverlap + 1e-6) {
                best = r;
                bestOverlap = overlap;
                bestCenterDist = centerDist;
                bestDepth = depthMid;
                continue;
            }

            if (Math.abs(overlap - bestOverlap) <= 1e-6) {
                if (centerDist < bestCenterDist - 1e-6) {
                    best = r;
                    bestCenterDist = centerDist;
                    bestDepth = depthMid;
                    continue;
                }
                if (Math.abs(centerDist - bestCenterDist) <= 1e-6) {
                    if (depthMid > bestDepth + 1e-6) {
                        best = r;
                        bestDepth = depthMid;
                        continue;
                    }
                    if (Math.abs(depthMid - bestDepth) <= 1e-6) best = chooseDeterministicFacadeRangeCandidate(best, r);
                }
            }
        }
        return best;
    }

    const sideTol = Math.max(tol * 2, 1e-4);
    const uBoundary = (segUA + segUB) * 0.5;
    const touching = [];
    const lowerSide = [];
    const upperSide = [];

    for (const r of list) {
        const rMin = Math.min(r.u0, r.u1);
        const rMax = Math.max(r.u0, r.u1);
        if (uBoundary < rMin - sideTol || uBoundary > rMax + sideTol) continue;
        const depthAtBoundary = sampleFacadeRangeDepthAtU(r, uBoundary);
        const candidate = { ...r, depthAtBoundary, rMin, rMax };
        touching.push(candidate);
        if (Math.abs(uBoundary - rMax) <= sideTol) lowerSide.push(candidate);
        if (Math.abs(uBoundary - rMin) <= sideTol) upperSide.push(candidate);
    }
    if (!touching.length) return null;

    const pickLower = () => {
        let best = null;
        let bestUMin = -Infinity;
        for (const c of lowerSide) {
            if (c.rMin > bestUMin + 1e-6) {
                best = c;
                bestUMin = c.rMin;
                continue;
            }
            if (Math.abs(c.rMin - bestUMin) <= 1e-6) {
                if (!best || c.depthAtBoundary > best.depthAtBoundary + 1e-6) {
                    best = c;
                    continue;
                }
                if (best && Math.abs(c.depthAtBoundary - best.depthAtBoundary) <= 1e-6) best = chooseDeterministicFacadeRangeCandidate(best, c);
            }
        }
        return best;
    };

    const pickUpper = () => {
        let best = null;
        let bestUMax = Infinity;
        for (const c of upperSide) {
            if (c.rMax < bestUMax - 1e-6) {
                best = c;
                bestUMax = c.rMax;
                continue;
            }
            if (Math.abs(c.rMax - bestUMax) <= 1e-6) {
                if (!best || c.depthAtBoundary > best.depthAtBoundary + 1e-6) {
                    best = c;
                    continue;
                }
                if (best && Math.abs(c.depthAtBoundary - best.depthAtBoundary) <= 1e-6) best = chooseDeterministicFacadeRangeCandidate(best, c);
            }
        }
        return best;
    };

    const lower = pickLower();
    const upper = pickUpper();
    if (lower && upper) {
        if (Math.abs(lower.depthAtBoundary - upper.depthAtBoundary) > 1e-6) {
            return lower.depthAtBoundary > upper.depthAtBoundary ? lower : upper;
        }
        const lowerErr = Math.abs(segDepthMid - lower.depthAtBoundary);
        const upperErr = Math.abs(segDepthMid - upper.depthAtBoundary);
        if (Math.abs(lowerErr - upperErr) > 1e-6) return lowerErr < upperErr ? lower : upper;
        return chooseDeterministicFacadeRangeCandidate(lower, upper);
    }
    if (lower) return lower;
    if (upper) return upper;

    let best = null;
    let bestDepth = -Infinity;
    let bestErr = Infinity;
    for (const c of touching) {
        const err = Math.abs(segDepthMid - c.depthAtBoundary);
        if (c.depthAtBoundary > bestDepth + 1e-6) {
            best = c;
            bestDepth = c.depthAtBoundary;
            bestErr = err;
            continue;
        }
        if (Math.abs(c.depthAtBoundary - bestDepth) <= 1e-6) {
            if (err < bestErr - 1e-6) {
                best = c;
                bestErr = err;
                continue;
            }
            if (Math.abs(err - bestErr) <= 1e-6) best = chooseDeterministicFacadeRangeCandidate(best, c);
        }
    }
    return best;
}

// How close a cut's top/bottom edge has to be to the wall's own floor/ceiling
// line to count as REACHING it (a full-height opening the storey above or
// below continues). Tight on purpose: a real sill sits centimetres up, so
// 0.1 mm only catches edges that are meant to coincide.
const REVEAL_OPEN_EDGE_TOL = 1e-4;

function segmentOverOpeningRange(oa, ob, openings) {
    if (!Array.isArray(openings) || !openings.length) return false;
    const faceId = oa?.faceId ?? ob?.faceId;
    if (!isFaceId(faceId)) return false;
    const ua = Number(oa?.u);
    const ub = Number(ob?.u);
    if (!Number.isFinite(ua) && !Number.isFinite(ub)) return false;
    const u0 = Number.isFinite(ua) && Number.isFinite(ub) ? Math.min(ua, ub) : (Number.isFinite(ua) ? ua : ub);
    const u1 = Number.isFinite(ua) && Number.isFinite(ub) ? Math.max(ua, ub) : (Number.isFinite(ua) ? ua : ub);
    const tol = 1e-3;
    return openings.some((opening) => {
        if (opening?.faceId !== faceId) return false;
        const openingU0 = Number(opening.u0);
        const openingU1 = Number(opening.u1);
        if (u1 - u0 <= tol) return u0 >= openingU0 - tol && u0 <= openingU1 + tol;
        return u1 > openingU0 + tol && u0 < openingU1 - tol;
    });
}

function buildWallSidesGeometryFromLoopDetailXZ(loop, {
    height,
    uvBaseV = 0.0,
    minEdge = 1e-5,
    segmentOverrides = null,
    cutouts = null,
    ySlices = null,
    yBands = null,
    cutoutTol = 0.02,
    cutoutCurveSegments = 18,
    // Reveal walls extrude along the loop's inward direction. The interior
    // shell loop is wound to face the room, which flips its inward toward
    // the facade — its cut linings must run the other way (into the room),
    // so it passes -1. Flipped reveals render inside-out; the shell's
    // DoubleSide material covers that.
    revealDirectionSign = 1
} = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    const h = Number(height) || 0;
    if (n < 3 || !(h > EPS)) return null;

    const overrides = segmentOverrides instanceof Map ? segmentOverrides : null;
    const cutList = Array.isArray(cutouts) ? cutouts.filter((entry) => entry && typeof entry === 'object') : null;
    const cutTol = clamp(cutoutTol, 1e-4, 0.5);
    const revealSign = Number(revealDirectionSign) < 0 ? -1 : 1;
    const curveSegments = clampInt(cutoutCurveSegments, 6, 64);
    const rawYSlices = Array.isArray(ySlices) ? ySlices : null;
    const cutoutsByFaceId = (() => {
        if (!cutList?.length) return null;
        const map = new Map();
        for (const entry of cutList) {
            const faceId = typeof entry?.faceId === 'string' ? entry.faceId : '';
            if (!isFaceId(faceId)) continue;
            const x = Number(entry?.x);
            const y = Number(entry?.y);
            const z = Number(entry?.z);
            const u = Number(entry?.u);
            const width = Number(entry?.width);
            const height = Number(entry?.height);
            const wantsArch = !!entry?.wantsArch;
            const archRise = Number(entry?.archRise) || 0;
            const revealDepth = Math.max(0, Number(entry?.revealDepth) || 0);
            const revealMaterialIndex = Number.isInteger(entry?.revealMaterialIndex) ? entry.revealMaterialIndex : null;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > EPS) || !(height > EPS)) continue;
            // AI 511: nested inset stack — inner contours (outer→inner) with
            // their reveal depth spans and per-step material overrides. Any
            // malformed entry drops the whole stack (the outer cut still
            // carves normally).
            const insetSteps = (() => {
                const raw = Array.isArray(entry?.insetSteps) ? entry.insetSteps : null;
                if (!raw?.length) return null;
                const out = [];
                for (const s of raw) {
                    const w = Number(s?.width);
                    const h = Number(s?.height);
                    const cy = Number(s?.y);
                    const frontDepth = Number(s?.frontDepth);
                    const backDepth = Number(s?.backDepth);
                    if (!Number.isFinite(w) || !(w > EPS) || !Number.isFinite(h) || !(h > EPS)) return null;
                    if (!Number.isFinite(cy) || !Number.isFinite(frontDepth) || !Number.isFinite(backDepth)) return null;
                    out.push({
                        width: w,
                        height: h,
                        y: cy,
                        wantsArch: !!s?.wantsArch,
                        archRise: s?.wantsArch ? Math.max(0, Number(s?.archRise) || 0) : 0,
                        frontDepth: Math.max(0, frontDepth),
                        backDepth: Math.max(0, backDepth),
                        ringMaterialIndex: Number.isInteger(s?.ringMaterialIndex) ? s.ringMaterialIndex : null,
                        revealMaterialIndex: Number.isInteger(s?.revealMaterialIndex) ? s.revealMaterialIndex : null
                    });
                }
                return out.length ? out : null;
            })();
            const list = map.get(faceId);
            const item = {
                faceId,
                x,
                y,
                z,
                ...(Number.isFinite(u) ? { u } : {}),
                width,
                height,
                wantsArch,
                archRise: wantsArch ? archRise : 0.0,
                revealDepth,
                revealMaterialIndex,
                insetSteps
            };
            if (list) list.push(item);
            else map.set(faceId, [item]);
        }
        return map.size ? map : null;
    })();

    const normalizedYSlices = (() => {
        if (!rawYSlices?.length) return null;
        const tmp = [];
        for (const entry of rawYSlices) {
            const y0 = Number(entry?.y0);
            const y1 = Number(entry?.y1);
            if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
            const a = clamp(Math.min(y0, y1), 0.0, h);
            const b = clamp(Math.max(y0, y1), 0.0, h);
            if (!(b - a > EPS)) continue;
            tmp.push({ y0: a, y1: b });
        }
        if (!tmp.length) return null;
        tmp.sort((a, b) => a.y0 - b.y0);

        const out = [];
        let cursor = 0.0;
        for (const slice of tmp) {
            if (slice.y1 <= cursor + EPS) continue;
            if (slice.y0 > cursor + EPS) out.push({ y0: cursor, y1: slice.y0 });
            out.push({ y0: Math.max(cursor, slice.y0), y1: slice.y1 });
            cursor = slice.y1;
            if (cursor >= h - EPS) break;
        }
        if (cursor < h - EPS) out.push({ y0: cursor, y1: h });
        return out.length ? out : null;
    })();

    // Facade banding (AI 491): horizontal ranges that override the base wall
    // material (segments already carrying a facade override keep it).
    const normalizedYBands = (() => {
        const list = Array.isArray(yBands) ? yBands : null;
        if (!list?.length) return null;
        const out = [];
        for (const entry of list) {
            const y0 = Number(entry?.y0);
            const y1 = Number(entry?.y1);
            const materialIndex = Number(entry?.materialIndex);
            if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isInteger(materialIndex)) continue;
            const a = clamp(Math.min(y0, y1), 0.0, h);
            const b = clamp(Math.max(y0, y1), 0.0, h);
            if (!(b - a > EPS)) continue;
            out.push({ y0: a, y1: b, materialIndex });
        }
        if (!out.length) return null;
        out.sort((a, b) => a.y0 - b.y0);
        return out;
    })();

    const resolveBandMaterialIndex = (baseIndex, y) => {
        if (!normalizedYBands || baseIndex !== 0) return baseIndex;
        for (const band of normalizedYBands) {
            if (y > band.y0 && y < band.y1) return band.materialIndex;
        }
        return baseIndex;
    };

    const v0 = Number(uvBaseV) || 0;
    const v1 = v0 + h;
    const positions = [];
    const uvs = [];
    const groups = [];
    let uCursor = 0.0;

    let curGroupMatIndex = null;
    let curGroupStart = 0;
    let curGroupCount = 0;

    const flushGroup = () => {
        if (curGroupMatIndex === null) return;
        if (curGroupCount <= 0) return;
        groups.push({ start: curGroupStart, count: curGroupCount, materialIndex: curGroupMatIndex });
    };

    const setActiveMaterialIndex = (idx) => {
        if (curGroupMatIndex === idx) return;
        flushGroup();
        curGroupMatIndex = idx;
        curGroupStart = Math.floor(positions.length / 3);
        curGroupCount = 0;
    };

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > minEdge)) continue;

        const baseU0 = uCursor;
        const baseU1 = uCursor + segLen;
        uCursor = baseU1;

        let matIndex = 0;
        let uAtA = baseU0;
        let uAtB = baseU1;

        const worldOverride = overrides?.get?.(facadeWorldSegmentKey(a.x, a.z, b.x, b.z)) ?? null;
        if (worldOverride) {
            matIndex = clampInt(worldOverride.materialIndex, 0, 9999);
            const uvStart = Number(worldOverride.uvStart) || 0;
            const forward = Math.hypot(a.x - Number(worldOverride.x0), a.z - Number(worldOverride.z0))
                <= Math.hypot(a.x - Number(worldOverride.x1), a.z - Number(worldOverride.z1));
            uAtA = forward ? uvStart : uvStart + segLen;
            uAtB = forward ? uvStart + segLen : uvStart;
        }

        const faceId = a.faceId;
        if (!worldOverride && overrides && a.kind === 'profile' && b.kind === 'profile' && faceId && faceId === b.faceId) {
            const segKey = facadeStripSegmentKey(faceId, a.u, a.depth, b.u, b.depth);
            let ovr = overrides.get(segKey) ?? null;

            if (!ovr) {
                const ranges = overrides.get(`__ranges__:${faceId}`) ?? null;
                ovr = resolveFacadeRangeOverrideForSegment(ranges, {
                    uA: Number(a.u) || 0,
                    uB: Number(b.u) || 0,
                    depthA: Number(a.depth) || 0,
                    depthB: Number(b.depth) || 0,
                    tol: 1e-4
                });
            }

            if (ovr) {
                matIndex = clampInt(ovr.materialIndex, 0, 9999);
                const u0 = Number(ovr.u0) || 0;
                const u1 = Number(ovr.u1) || 0;
                const uvStart = Number(ovr.uvStart) || 0;
                const uA = Number(a.u) || 0;
                const uB = Number(b.u) || 0;
                const depthA = Number(a.depth);
                const depthB = Number(b.depth);
                const sideTol = 1e-4;
                const isBoundarySideSegment = Math.abs(uB - uA) <= sideTol
                    && Number.isFinite(depthA)
                    && Number.isFinite(depthB)
                    && Math.abs(depthB - depthA) > sideTol;

                if (isBoundarySideSegment) {
                    // Boundary side face (a relief step's return): map U along
                    // depth so side textures do not collapse or stretch. The
                    // override resolver picked the prouder neighbour — the wall
                    // the return steps off — so its texture continues through
                    // the shared arris onto the return, and U keeps marching in
                    // that texture's direction along the loop. It must NOT
                    // follow the sign of the depth delta: that flips between
                    // the two returns of one pier and mirrored the courses
                    // into a chevron (AI 502).
                    const boundaryU = (uA + uB) * 0.5;
                    const reversedFaceU = faceId === 'B' || faceId === 'D';
                    const anchorU = reversedFaceU
                        ? (uvStart + (u1 - boundaryU))
                        : (uvStart + (boundaryU - u0));

                    // March direction in face u, read off a neighbouring front
                    // point (the return itself has no u extent).
                    const prevPt = pts[(i - 1 + n) % n];
                    const nextPt = pts[(i + 2) % n];
                    let uMarch = 0;
                    if (prevPt?.faceId === faceId && Number.isFinite(Number(prevPt.u))) {
                        uMarch = Math.sign(uA - Number(prevPt.u)) || 0;
                    }
                    if (!uMarch && nextPt?.faceId === faceId && Number.isFinite(Number(nextPt.u))) {
                        uMarch = Math.sign(Number(nextPt.u) - uB) || 0;
                    }
                    if (!uMarch) uMarch = 1;
                    const texDir = reversedFaceU ? -uMarch : uMarch;

                    // The endpoint at the anchor strip's own depth is the
                    // shared arris; the strip's front ends there, so the
                    // texture runs off it onto the return.
                    const stepMeters = Math.abs(depthB - depthA);
                    const ovrDepthAtBoundary = Number.isFinite(Number(ovr.depthAtBoundary))
                        ? Number(ovr.depthAtBoundary)
                        : sampleFacadeRangeDepthAtU(ovr, boundaryU);
                    const arrisAtA = Math.abs(depthA - ovrDepthAtBoundary) <= Math.abs(depthB - ovrDepthAtBoundary);
                    if (arrisAtA) {
                        uAtA = anchorU;
                        uAtB = anchorU + texDir * stepMeters;
                    } else {
                        uAtB = anchorU;
                        uAtA = anchorU - texDir * stepMeters;
                    }
                } else if (faceId === 'B' || faceId === 'D') {
                    uAtA = uvStart + (u1 - uA);
                    uAtB = uvStart + (u1 - uB);
                } else {
                    uAtA = uvStart + (uA - u0);
                    uAtB = uvStart + (uB - u0);
                }
            }
        }

        setActiveMaterialIndex(matIndex);

        const slices = normalizedYSlices ?? null;
        const wantsYCutlines = !!slices || !!normalizedYBands;

        const segCuts = [];
        const wantsSegmentCutouts = !!cutoutsByFaceId && a.kind === 'profile' && b.kind === 'profile' && faceId && faceId === b.faceId;
        if (wantsSegmentCutouts) {
            const cuts = cutoutsByFaceId.get(faceId) ?? null;
            if (cuts?.length) {
                const tx = dx / segLen;
                const tz = dz / segLen;
                for (const cut of cuts) {
                    const cutU = Number(cut?.u);
                    const aU = Number(a?.u);
                    const bU = Number(b?.u);
                    const hasFaceU = Number.isFinite(cutU) && Number.isFinite(aU) && Number.isFinite(bU)
                        && Math.abs(bU - aU) > EPS;
                    const physicalLocalX = (cut.x - a.x) * tx + (cut.z - a.z) * tz;
                    const perp = Math.abs((cut.x - a.x) * tz - (cut.z - a.z) * tx);
                    // Arc samples carry facade-u explicitly because their
                    // projected point lies on the curve rather than its chord.
                    // A straight shell run must stay in world space: corner
                    // mitres can extend its physical endpoints past u=0/length,
                    // and scaling u across that longer segment shifts every
                    // opening toward one end as a visible plaster strip.
                    const useFaceUProjection = hasFaceU
                        && a?.cutoutProjectionMode === 'face_u'
                        && b?.cutoutProjectionMode === 'face_u';
                    const localX = useFaceUProjection
                        ? ((cutU - aU) / (bU - aU)) * segLen
                        : physicalLocalX;
                    const cutHalfWidth = Math.max(EPS, Number(cut.width) || 0) * 0.5;
                    if (localX + cutHalfWidth < -cutTol || localX - cutHalfWidth > segLen + cutTol) continue;
                    if (!useFaceUProjection && perp > cutTol) continue;
                    segCuts.push({ ...cut, localX });
                }
            }
        }

        if (wantsYCutlines || segCuts.length) {
            const tx = dx / segLen;
            const tz = dz / segLen;
            const sliceList = slices ?? [{ y0: 0.0, y1: h }];

            for (const slice of sliceList) {
                const sliceY0 = Number(slice?.y0) || 0;
                const sliceY1 = Number(slice?.y1) || 0;
                if (!(sliceY1 - sliceY0 > EPS)) continue;

                const xCuts = [0.0, segLen];
                const yCuts = [sliceY0, sliceY1];
                const sliceCuts = [];

                if (normalizedYBands) {
                    for (const band of normalizedYBands) {
                        if (band.y0 > sliceY0 + EPS && band.y0 < sliceY1 - EPS) yCuts.push(band.y0);
                        if (band.y1 > sliceY0 + EPS && band.y1 < sliceY1 - EPS) yCuts.push(band.y1);
                    }
                }

                const continuesAtVerticalEdge = (cut, edgeY, above) => {
                    const cutHalfW = Math.max(EPS, Number(cut.width) || 0) * 0.5;
                    const cutX0 = (Number(cut.localX) || 0) - cutHalfW;
                    const cutX1 = (Number(cut.localX) || 0) + cutHalfW;
                    return segCuts.some((other) => {
                        if (other === cut) return false;
                        const otherHalfW = Math.max(EPS, Number(other.width) || 0) * 0.5;
                        const otherX0 = (Number(other.localX) || 0) - otherHalfW;
                        const otherX1 = (Number(other.localX) || 0) + otherHalfW;
                        const otherHalfH = Math.max(EPS, Number(other.height) || 0) * 0.5;
                        const otherY = (Number(other.y) || 0) + (above ? -otherHalfH : otherHalfH);
                        return Math.abs(otherY - edgeY) <= REVEAL_OPEN_EDGE_TOL
                            && otherX0 <= cutX0 + REVEAL_OPEN_EDGE_TOL
                            && otherX1 >= cutX1 - REVEAL_OPEN_EDGE_TOL;
                    });
                };

                for (const cut of segCuts) {
                    const cx = Number(cut.localX) || 0;
                    const cy = Number(cut.y) || 0;
                    const wCut = Math.max(EPS, Number(cut.width) || 0);
                    const hCut = Math.max(EPS, Number(cut.height) || 0);
                    const halfW = wCut * 0.5;
                    const halfH = hCut * 0.5;
                    const x0 = cx - halfW;
                    const x1 = cx + halfW;
                    const y0 = cy - halfH;
                    const y1 = cy + halfH;

                    if (y1 <= sliceY0 + EPS || y0 >= sliceY1 - EPS) continue;

                    const sx0 = clamp(x0, 0.0, segLen);
                    const sx1 = clamp(x1, 0.0, segLen);
                    const sy0 = clamp(y0, sliceY0, sliceY1);
                    const sy1 = clamp(y1, sliceY0, sliceY1);
                    if (!(sx1 - sx0 > EPS) || !(sy1 - sy0 > EPS)) continue;

                    xCuts.push(sx0, sx1);
                    yCuts.push(sy0, sy1);
                    sliceCuts.push({
                        x0: sx0,
                        x1: sx1,
                        y0: sy0,
                        y1: sy1,
                        // The cut genuinely extends past this segment (it was
                        // clamped): its side there is mid-opening, no jamb.
                        openStart: x0 < -cutTol,
                        openEnd: x1 > segLen + cutTol,
                        // Same rule on the vertical axis: a cut that reaches
                        // this wall's own floor/ceiling line, or that spills
                        // into another y-slice, has no sill or head THERE.
                        // Emitting one drops a horizontal face exactly on the
                        // storey line, where the floor-slab cap, the closure
                        // band and the next storey's matching reveal already
                        // sit — coplanar surfaces that shadow one another and
                        // stripe the reveal ledge.
                        openBottom: y0 <= REVEAL_OPEN_EDGE_TOL || y0 < sliceY0 - EPS
                            || continuesAtVerticalEdge(cut, y0, false),
                        openTop: y1 >= h - REVEAL_OPEN_EDGE_TOL || y1 > sliceY1 + EPS
                            || continuesAtVerticalEdge(cut, y1, true),
                        wantsArch: !!cut.wantsArch,
                        archRise: Math.max(0, Number(cut.archRise) || 0),
                        revealDepth: Math.max(0, Number(cut.revealDepth) || 0),
                        revealMaterialIndex: Number.isInteger(cut.revealMaterialIndex) ? cut.revealMaterialIndex : null,
                        // AI 511: the inset stack only makes sense when the
                        // slice holds the whole outer contour un-clamped.
                        insetSteps: (cut.insetSteps
                            && Math.abs(sx0 - x0) <= EPS && Math.abs(sx1 - x1) <= EPS
                            && Math.abs(sy0 - y0) <= EPS && Math.abs(sy1 - y1) <= EPS)
                            ? cut.insetSteps
                            : null
                    });
                }

                const xs = sortUniqueNumbers(xCuts);
                const ys = sortUniqueNumbers(yCuts);

                for (let xi = 0; xi + 1 < xs.length; xi++) {
                    const x0 = xs[xi];
                    const x1 = xs[xi + 1];
                    if (!(x1 - x0 > minEdge)) continue;

                    for (let yi = 0; yi + 1 < ys.length; yi++) {
                        const y0 = ys[yi];
                        const y1 = ys[yi + 1];
                        if (!(y1 - y0 > minEdge)) continue;

                        let isHole = false;
                        for (const cut of sliceCuts) {
                            if (
                                x0 >= cut.x0 - EPS
                                && x1 <= cut.x1 + EPS
                                && y0 >= cut.y0 - EPS
                                && y1 <= cut.y1 + EPS
                            ) {
                                isHole = true;
                                break;
                            }
                        }
                        if (isHole) continue;

                        const pushVertex = (lx, ly) => {
                            const tU = segLen > EPS ? clamp(lx / segLen, 0, 1) : 0;
                            positions.push(
                                a.x + tx * lx,
                                ly,
                                a.z + tz * lx
                            );
                            uvs.push(
                                uAtA + (uAtB - uAtA) * tU,
                                v0 + ly
                            );
                        };

                        if (normalizedYBands) setActiveMaterialIndex(resolveBandMaterialIndex(matIndex, (y0 + y1) * 0.5));

                        pushVertex(x0, y0);
                        pushVertex(x1, y1);
                        pushVertex(x1, y0);

                        pushVertex(x0, y0);
                        pushVertex(x0, y1);
                        pushVertex(x1, y1);

                        curGroupCount += 6;
                    }
                }

                for (const cut of sliceCuts) {
                    if (!cut.wantsArch || !(cut.archRise > EPS)) continue;

                    const x0 = cut.x0;
                    const x1 = cut.x1;
                    const yTop = cut.y1;
                    const yChord = yTop - cut.archRise;

                    if (yChord <= cut.y0 + EPS) continue;
                    if (sliceY0 > yChord + 1e-4 || sliceY1 < yTop - 1e-4) continue;

                    const w = Math.abs(x1 - x0);
                    const R = (w * w) / (8 * cut.archRise) + cut.archRise / 2;
                    const cx = (x0 + x1) * 0.5;
                    const circleY = yChord + cut.archRise - R;
                    const arcYAt = (xp) => {
                        const dxp = xp - cx;
                        const inner = R * R - dxp * dxp;
                        if (!(inner > 0)) return yChord;
                        return circleY + Math.sqrt(inner);
                    };

                    const arcSegments = clampInt(curveSegments, 6, 64);
                    const addSpandrel = (side) => {
                        const shape = new THREE.Shape();
                        if (side === 'left') {
                            shape.moveTo(x0, yTop);
                            shape.lineTo(x0, yChord);
                            for (let s = 1; s <= arcSegments; s++) {
                                const t = s / arcSegments;
                                const x = x0 + (cx - x0) * t;
                                shape.lineTo(x, arcYAt(x));
                            }
                            shape.lineTo(x0, yTop);
                        } else {
                            shape.moveTo(x1, yTop);
                            shape.lineTo(x1, yChord);
                            for (let s = 1; s <= arcSegments; s++) {
                                const t = s / arcSegments;
                                const x = x1 + (cx - x1) * t;
                                shape.lineTo(x, arcYAt(x));
                            }
                            shape.lineTo(x1, yTop);
                        }

                        const indexed = new THREE.ShapeGeometry(shape, arcSegments);
                        const geo = indexed.index ? indexed.toNonIndexed() : indexed;
                        if (geo !== indexed) indexed.dispose();
                        const pos = geo.getAttribute('position');
                        const count = pos?.count ?? 0;
                        let wantsWindingFlip = false;
                        for (let k = 0; k + 2 < count; k += 3) {
                            const x0 = pos.getX(k);
                            const y0 = pos.getY(k);
                            const x1 = pos.getX(k + 1);
                            const y1 = pos.getY(k + 1);
                            const x2 = pos.getX(k + 2);
                            const y2 = pos.getY(k + 2);
                            const triZ = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
                            if (!(Math.abs(triZ) > 1e-8)) continue;
                            wantsWindingFlip = triZ > 0;
                            break;
                        }
                        for (let k = 0; k + 2 < count; k += 3) {
                            const a0 = k;
                            const a1 = wantsWindingFlip ? (k + 2) : (k + 1);
                            const a2 = wantsWindingFlip ? (k + 1) : (k + 2);
                            for (const idx of [a0, a1, a2]) {
                                const lx = pos.getX(idx);
                                const ly = pos.getY(idx);
                                const tU = segLen > EPS ? clamp(lx / segLen, 0, 1) : 0;
                                positions.push(
                                    a.x + tx * lx,
                                    ly,
                                    a.z + tz * lx
                                );
                                uvs.push(
                                    uAtA + (uAtB - uAtA) * tU,
                                    v0 + ly
                                );
                            }
                        }
                        curGroupCount += count;
                        geo.dispose();
                    };

                    if (normalizedYBands) setActiveMaterialIndex(resolveBandMaterialIndex(matIndex, (yChord + yTop) * 0.5));
                    addSpandrel('left');
                    addSpandrel('right');
                }

                const inwardX = -tz;
                const inwardZ = tx;
                const du = uAtB - uAtA;
                const invSegLen = segLen > EPS ? (1 / segLen) : 0;

                const pushRevealVertex = (lx, ly, depth, addDepthToV) => {
                    const tU = invSegLen ? clamp(lx * invSegLen, 0, 1) : 0;
                    const baseU = uAtA + du * tU;
                    const baseV = v0 + ly;
                    const u = addDepthToV ? baseU : (baseU + depth);
                    const v = addDepthToV ? (baseV + depth) : baseV;
                    positions.push(
                        a.x + tx * lx + inwardX * depth * revealSign,
                        ly,
                        a.z + tz * lx + inwardZ * depth * revealSign
                    );
                    uvs.push(u, v);
                };

                // AI 509: a cut may route its reveal walls to a dedicated
                // material (the portal recess hook) instead of the wall run's.
                // AI 511: nested insets need reveal walls spanning an arbitrary
                // depth range, not just [0, depth] off the wall face.
                let activeRevealMaterialOverride = null;
                const pushRevealQuadRange = (x0, y0, x1, y1, d0, d1) => {
                    if (!(d1 - d0 > EPS)) return;
                    if (!(Math.hypot(x1 - x0, y1 - y0) > minEdge)) return;
                    if (activeRevealMaterialOverride !== null) setActiveMaterialIndex(activeRevealMaterialOverride);
                    else if (normalizedYBands) setActiveMaterialIndex(resolveBandMaterialIndex(matIndex, (y0 + y1) * 0.5));
                    const addDepthToV = Math.abs(y1 - y0) <= 1e-6;

                    pushRevealVertex(x0, y0, d0, addDepthToV);
                    pushRevealVertex(x0, y0, d1, addDepthToV);
                    pushRevealVertex(x1, y1, d1, addDepthToV);

                    pushRevealVertex(x0, y0, d0, addDepthToV);
                    pushRevealVertex(x1, y1, d1, addDepthToV);
                    pushRevealVertex(x1, y1, d0, addDepthToV);

                    curGroupCount += 6;
                };
                const pushRevealQuad = (x0, y0, x1, y1, depth) => pushRevealQuadRange(x0, y0, x1, y1, 0.0, depth);

                let revealOverrideWasUsed = false;
                for (const cut of sliceCuts) {
                    const depth = Number(cut.revealDepth) || 0;
                    if (!(depth > EPS)) continue;
                    activeRevealMaterialOverride = Number.isInteger(cut.revealMaterialIndex) ? cut.revealMaterialIndex : null;
                    if (activeRevealMaterialOverride !== null) revealOverrideWasUsed = true;

                    const y0 = cut.y0;
                    const y1 = cut.y1;
                    if (!(cut.x1 - cut.x0 > minEdge) || !(y1 - y0 > minEdge)) continue;
                    // A jamb is skipped only when the cut genuinely CONTINUES
                    // into the neighbouring segment (openStart/openEnd). A cut
                    // that merely ENDS at the segment boundary — a bay whose
                    // width derives from the opening with zero padding — still
                    // needs its jamb, or the recess flank opens (the
                    // interior lining shows as a pale strip, and a deeper
                    // opening depth turns it into a real hole). The jamb and a
                    // neighbouring strip's depth return meet only along their
                    // shared edge, so moving the jamb inward creates a visible
                    // hairline hole instead of preventing overlap.
                    const x0 = cut.x0;
                    const x1 = cut.x1;

                    if (!cut.wantsArch || !(cut.archRise > EPS)) {
                        if (!cut.openBottom) pushRevealQuad(x0, y0, x1, y0, depth);
                        if (!cut.openEnd) pushRevealQuad(x1, y0, x1, y1, depth);
                        if (!cut.openTop) pushRevealQuad(x1, y1, x0, y1, depth);
                        if (!cut.openStart) pushRevealQuad(x0, y1, x0, y0, depth);
                        continue;
                    }

                    const yTop = y1;
                    const yChord = yTop - cut.archRise;
                    if (yChord <= y0 + EPS) {
                        if (!cut.openBottom) pushRevealQuad(x0, y0, x1, y0, depth);
                        if (!cut.openEnd) pushRevealQuad(x1, y0, x1, y1, depth);
                        if (!cut.openTop) pushRevealQuad(x1, y1, x0, y1, depth);
                        if (!cut.openStart) pushRevealQuad(x0, y1, x0, y0, depth);
                        continue;
                    }

                    const w = Math.abs(x1 - x0);
                    if (!(w > EPS)) continue;
                    const R = (w * w) / (8 * cut.archRise) + cut.archRise / 2;
                    const cx = (x0 + x1) * 0.5;
                    const circleY = yChord + cut.archRise - R;
                    const arcYAt = (xp) => {
                        const dxp = xp - cx;
                        const inner = R * R - dxp * dxp;
                        if (!(inner > 0)) return yChord;
                        return circleY + Math.sqrt(inner);
                    };

                    const arcSegments = clampInt(curveSegments, 6, 64);
                    if (!cut.openBottom) pushRevealQuad(x0, y0, x1, y0, depth);
                    if (!cut.openEnd) pushRevealQuad(x1, y0, x1, yChord, depth);
                    let prevX = x1;
                    let prevY = yChord;
                    for (let s = 1; s < arcSegments; s++) {
                        const t = s / arcSegments;
                        const x = x1 + (x0 - x1) * t;
                        const y = arcYAt(x);
                        pushRevealQuad(prevX, prevY, x, y, depth);
                        prevX = x;
                        prevY = y;
                    }
                    if (!cut.openStart) {
                        pushRevealQuad(prevX, prevY, x0, yChord, depth);
                        pushRevealQuad(x0, yChord, x0, y0, depth);
                    }
                }
                if (revealOverrideWasUsed) {
                    // Hand the group back to the wall run's material so the
                    // next slice's face cells do not inherit the reveal's.
                    activeRevealMaterialOverride = null;
                    setActiveMaterialIndex(matIndex);
                }

                // AI 511: nested inset stacks. The loop above carved the wall
                // hole to the OUTERMOST contour and walled its reveal down to
                // the first step plane; here each inner contour adds its
                // shoulder ring (the visible recessed face between two
                // contours, parallel to the wall) and its own reveal walls
                // stepping to the next plane. Ring paths and reveal walks
                // share one arc sampling so their edges meet exactly.
                let insetStackWasEmitted = false;
                for (const cut of sliceCuts) {
                    const stack = cut.insetSteps;
                    if (!stack?.length) continue;
                    insetStackWasEmitted = true;
                    const centerX = (cut.x0 + cut.x1) * 0.5;
                    const arcSegments = clampInt(curveSegments, 6, 64);
                    const localContour = (width, yBottom, yTop, wantsArch, archRise) => {
                        const halfW = Math.max(EPS, width * 0.5);
                        const c = {
                            x0: centerX - halfW,
                            x1: centerX + halfW,
                            y0: yBottom,
                            y1: yTop,
                            wantsArch: !!wantsArch && archRise > EPS,
                            archRise: Math.max(0, archRise)
                        };
                        if (c.wantsArch && !(c.y1 - c.archRise > c.y0 + EPS)) c.wantsArch = false;
                        return c;
                    };
                    const contourArcYAt = (c) => {
                        const w = Math.abs(c.x1 - c.x0);
                        const R = (w * w) / (8 * c.archRise) + c.archRise / 2;
                        const cx = (c.x0 + c.x1) * 0.5;
                        const yChord = c.y1 - c.archRise;
                        const circleY = c.y1 - R;
                        return (xp) => {
                            const dxp = xp - cx;
                            const inner = R * R - dxp * dxp;
                            if (!(inner > 0)) return yChord;
                            return circleY + Math.sqrt(inner);
                        };
                    };
                    const addContourPath = (path, c) => {
                        path.moveTo(c.x0, c.y0);
                        path.lineTo(c.x1, c.y0);
                        if (c.wantsArch) {
                            const yChord = c.y1 - c.archRise;
                            path.lineTo(c.x1, yChord);
                            const arcYAt = contourArcYAt(c);
                            for (let s = 1; s < arcSegments; s++) {
                                const x = c.x1 + (c.x0 - c.x1) * (s / arcSegments);
                                path.lineTo(x, arcYAt(x));
                            }
                            path.lineTo(c.x0, yChord);
                        } else {
                            path.lineTo(c.x1, c.y1);
                            path.lineTo(c.x0, c.y1);
                        }
                        path.closePath();
                    };
                    const emitRingFace = (outerC, innerC, depth, materialIndex) => {
                        // A hole edge flush with the shape edge (zero bottom or
                        // top padding) breaks the triangulation: pull it 1mm
                        // inside — the sliver hides behind the reveal arris.
                        let hc = innerC;
                        if (hc.y0 <= outerC.y0 + 1e-4) hc = { ...hc, y0: outerC.y0 + 0.001 };
                        if (!hc.wantsArch && hc.y1 >= outerC.y1 - 1e-4) hc = { ...hc, y1: outerC.y1 - 0.001 };
                        if (!(hc.y1 - hc.y0 > EPS)) return;
                        const shape = new THREE.Shape();
                        addContourPath(shape, outerC);
                        const hole = new THREE.Path();
                        addContourPath(hole, hc);
                        shape.holes.push(hole);
                        const indexed = new THREE.ShapeGeometry(shape, 1);
                        const geo = indexed.index ? indexed.toNonIndexed() : indexed;
                        if (geo !== indexed) indexed.dispose();
                        const pos = geo.getAttribute('position');
                        const count = pos?.count ?? 0;
                        let wantsWindingFlip = false;
                        for (let k = 0; k + 2 < count; k += 3) {
                            const ax = pos.getX(k);
                            const ay = pos.getY(k);
                            const bx = pos.getX(k + 1);
                            const by = pos.getY(k + 1);
                            const cx2 = pos.getX(k + 2);
                            const cy2 = pos.getY(k + 2);
                            const triZ = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
                            if (!(Math.abs(triZ) > 1e-8)) continue;
                            wantsWindingFlip = triZ > 0;
                            break;
                        }
                        if (materialIndex !== null) setActiveMaterialIndex(materialIndex);
                        else if (normalizedYBands) setActiveMaterialIndex(resolveBandMaterialIndex(matIndex, (outerC.y0 + outerC.y1) * 0.5));
                        else setActiveMaterialIndex(matIndex);
                        for (let k = 0; k + 2 < count; k += 3) {
                            const order = wantsWindingFlip ? [k, k + 2, k + 1] : [k, k + 1, k + 2];
                            for (const idx of order) {
                                const lx = pos.getX(idx);
                                const ly = pos.getY(idx);
                                const tU = segLen > EPS ? clamp(lx / segLen, 0, 1) : 0;
                                positions.push(
                                    a.x + tx * lx + inwardX * depth,
                                    ly,
                                    a.z + tz * lx + inwardZ * depth
                                );
                                uvs.push(uAtA + du * tU, v0 + ly);
                            }
                        }
                        curGroupCount += count;
                        geo.dispose();
                    };
                    const emitContourReveal = (c, d0, d1) => {
                        if (!(d1 - d0 > EPS)) return;
                        pushRevealQuadRange(c.x0, c.y0, c.x1, c.y0, d0, d1);
                        if (!c.wantsArch) {
                            pushRevealQuadRange(c.x1, c.y0, c.x1, c.y1, d0, d1);
                            pushRevealQuadRange(c.x1, c.y1, c.x0, c.y1, d0, d1);
                            pushRevealQuadRange(c.x0, c.y1, c.x0, c.y0, d0, d1);
                            return;
                        }
                        const yChord = c.y1 - c.archRise;
                        const arcYAt = contourArcYAt(c);
                        pushRevealQuadRange(c.x1, c.y0, c.x1, yChord, d0, d1);
                        let prevX = c.x1;
                        let prevY = yChord;
                        for (let s = 1; s < arcSegments; s++) {
                            const x = c.x1 + (c.x0 - c.x1) * (s / arcSegments);
                            const y = arcYAt(x);
                            pushRevealQuadRange(prevX, prevY, x, y, d0, d1);
                            prevX = x;
                            prevY = y;
                        }
                        pushRevealQuadRange(prevX, prevY, c.x0, yChord, d0, d1);
                        pushRevealQuadRange(c.x0, yChord, c.x0, c.y0, d0, d1);
                    };

                    let prevContour = localContour(cut.x1 - cut.x0, cut.y0, cut.y1, cut.wantsArch, cut.archRise);
                    for (const entry of stack) {
                        const c = localContour(
                            entry.width,
                            entry.y - entry.height * 0.5,
                            entry.y + entry.height * 0.5,
                            entry.wantsArch,
                            entry.archRise
                        );
                        emitRingFace(prevContour, c, entry.frontDepth, entry.ringMaterialIndex);
                        activeRevealMaterialOverride = entry.revealMaterialIndex;
                        // A ring override may have switched the group; a
                        // no-override reveal must not silently join it.
                        if (entry.revealMaterialIndex === null && !normalizedYBands) setActiveMaterialIndex(matIndex);
                        emitContourReveal(c, entry.frontDepth, entry.backDepth);
                        prevContour = c;
                    }
                    activeRevealMaterialOverride = null;
                }
                if (insetStackWasEmitted) setActiveMaterialIndex(matIndex);
            }

            continue;
        }

        // Tri 1: bottomA, topB, bottomB (CCW for CCW loops → outward normals).
        positions.push(
            a.x, 0, a.z,
            b.x, h, b.z,
            b.x, 0, b.z
        );
        uvs.push(
            uAtA, v0,
            uAtB, v1,
            uAtB, v0
        );

        // Tri 2: bottomA, topA, topB
        positions.push(
            a.x, 0, a.z,
            a.x, h, a.z,
            b.x, h, b.z
        );
        uvs.push(
            uAtA, v0,
            uAtA, v1,
            uAtB, v1
        );

        curGroupCount += 6;
    }

    if (!positions.length) return null;
    flushGroup();

    let finalPositions = positions;
    let finalUvs = uvs;
    let finalGroups = groups;
    if (normalizedYBands && groups.length > 1) {
        // Banding interleaves materials cell by cell; regroup the triangles
        // by material so the mesh keeps one draw range per material instead
        // of hundreds of tiny groups.
        const byMaterial = new Map();
        for (const group of groups) {
            const bucket = byMaterial.get(group.materialIndex);
            if (bucket) bucket.push(group);
            else byMaterial.set(group.materialIndex, [group]);
        }
        const orderedIndices = Array.from(byMaterial.keys()).sort((a, b) => a - b);
        finalPositions = new Array(positions.length);
        finalUvs = new Array(uvs.length);
        finalGroups = [];
        let vertexCursor = 0;
        for (const materialIndex of orderedIndices) {
            const start = vertexCursor;
            for (const group of byMaterial.get(materialIndex)) {
                const srcV = group.start;
                const count = group.count;
                for (let i = 0; i < count; i++) {
                    const src = srcV + i;
                    const dst = vertexCursor + i;
                    finalPositions[dst * 3] = positions[src * 3];
                    finalPositions[dst * 3 + 1] = positions[src * 3 + 1];
                    finalPositions[dst * 3 + 2] = positions[src * 3 + 2];
                    finalUvs[dst * 2] = uvs[src * 2];
                    finalUvs[dst * 2 + 1] = uvs[src * 2 + 1];
                }
                vertexCursor += count;
            }
            finalGroups.push({ start, count: vertexCursor - start, materialIndex });
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(finalPositions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(finalUvs), 2));
    geo.clearGroups();
    for (const group of finalGroups) geo.addGroup(group.start, group.count, group.materialIndex);
    geo.computeVertexNormals();
    return geo;
}

function buildWallSidesGeometryFromLoopXZ(loop, { height, uvBaseV = 0.0, minEdge = 1e-5 } = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    const h = Number(height) || 0;
    if (n < 3 || !(h > EPS)) return null;

    const v0 = Number(uvBaseV) || 0;
    const v1 = v0 + h;
    const positions = [];
    const uvs = [];
    let uCursor = 0.0;

    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > minEdge)) continue;

        const u0 = uCursor;
        const u1 = uCursor + segLen;
        uCursor = u1;

        // Tri 1: bottomA, topB, bottomB (CCW for CCW loops → outward normals).
        positions.push(
            a.x, 0, a.z,
            b.x, h, b.z,
            b.x, 0, b.z
        );
        uvs.push(
            u0, v0,
            u1, v1,
            u1, v0
        );

        // Tri 2: bottomA, topA, topB
        positions.push(
            a.x, 0, a.z,
            a.x, h, a.z,
            b.x, h, b.z
        );
        uvs.push(
            u0, v0,
            u0, v1,
            u1, v1
        );
    }

    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.computeVertexNormals();
    geo.clearGroups();
    geo.addGroup(0, geo.getAttribute('position').count, 1);
    return geo;
}

function estimateFabricationHeightMax({ baseY, extraFirstFloor, layers } = {}) {
    const safeLayers = Array.isArray(layers) ? layers : [];
    let yCursor = Number.isFinite(baseY) ? Number(baseY) : 0;
    let firstExtra = Number.isFinite(extraFirstFloor) ? Math.max(0, Number(extraFirstFloor)) : 0;

    for (let layerIndex = 0; layerIndex < safeLayers.length; layerIndex++) {
        const layer = safeLayers[layerIndex];
        const type = layer?.type;

        if (type === LAYER_TYPE.FLOOR) {
            const floors = clampInt(layer?.floors, 0, 99);
            const floorHeight = clamp(layer?.floorHeight, 1.0, 12.0);

            const beltCfg = layer?.belt ?? {};
            const beltEnabled = !!beltCfg.enabled;
            const beltHeight = beltEnabled ? clamp(beltCfg.height, 0.02, 1.2) : 0.0;

            for (let floor = 0; floor < floors; floor++) {
                const segHeight = floorHeight + (floor === 0 ? firstExtra : 0);
                if (floor === 0) firstExtra = 0;
                yCursor += segHeight;
                if (beltEnabled && beltHeight > EPS) yCursor += beltHeight;
            }
            yCursor += resolveCorniceHeights(layer?.cornice).total;
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const nextLayer = safeLayers[layerIndex + 1] ?? null;
            const hasFloorsAboveRoof = nextLayer?.type === LAYER_TYPE.FLOOR;
            if (!hasFloorsAboveRoof) yCursor += resolveRoofLayerTopExtraHeight(layer);
        }
    }

    return yCursor;
}

function makeWallMaterial({ style, baseColorHex, textureCache }) {
    const styleId = typeof style === 'string' && style ? style : BUILDING_STYLE.DEFAULT;
    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const url = urls?.baseColorUrl ?? null;
    const normalUrl = urls?.normalUrl ?? null;
    const ormUrl = urls?.ormUrl ?? null;
    const pbrMaterialId = tryGetPbrMaterialIdFromUrl(url);
    const mat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness: 0.85,
        metalness: 0.05
    });

    if (pbrMaterialId && textureCache?.resolveMaterial && textureCache?.applyResolvedMaterial) {
        const payload = textureCache.resolveMaterial(pbrMaterialId, {
            cloneTextures: false,
            diagnosticsTag: 'BuildingFabricationGenerator.makeWallMaterial'
        });
        textureCache.applyResolvedMaterial(mat, payload, { clearOnMissing: true });
        mat.color.setHex(0xffffff);
        mat.normalScale.set(0.9, 0.9);
        mat.roughness = 1.0;
        mat.metalness = 0.0;
    }

    if (!pbrMaterialId && url && textureCache) {
        mat.color.setHex(0xffffff);
        const tex = textureCache.trackMaterial(url, mat, { slot: 'map', srgb: true });
        if (tex) mat.map = tex;
    }

    if (!pbrMaterialId && normalUrl && textureCache) {
        const tex = textureCache.trackMaterial(normalUrl, mat, { slot: 'normalMap', srgb: false });
        if (tex) mat.normalMap = tex;
        mat.normalScale.set(0.9, 0.9);
    }

    if (!pbrMaterialId && ormUrl && textureCache) {
        const rough = textureCache.trackMaterial(ormUrl, mat, { slot: 'roughnessMap', srgb: false });
        if (rough) {
            mat.roughnessMap = rough;
            mat.metalnessMap = rough;
            mat.aoMap = rough;
        }
        mat.roughness = 1.0;
        mat.metalness = 0.0;
    }

    disableIblOnMaterial(mat);
    return mat;
}

function makeTextureMaterialFromBuildingStyle({
    style,
    baseColorHex,
    textureCache,
    roughness = 0.9,
    metalness = 0.0,
    polygonOffset = false,
    polygonOffsetFactor = 0,
    polygonOffsetUnits = 0
} = {}) {
    const styleId = typeof style === 'string' && style ? style : BUILDING_STYLE.DEFAULT;
    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
    const url = urls?.baseColorUrl ?? null;
    const normalUrl = urls?.normalUrl ?? null;
    const ormUrl = urls?.ormUrl ?? null;
    const pbrMaterialId = tryGetPbrMaterialIdFromUrl(url);
    const mat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        roughness,
        metalness,
        polygonOffset: !!polygonOffset,
        polygonOffsetFactor,
        polygonOffsetUnits
    });

    if (pbrMaterialId && textureCache?.resolveMaterial && textureCache?.applyResolvedMaterial) {
        const payload = textureCache.resolveMaterial(pbrMaterialId, {
            cloneTextures: false,
            diagnosticsTag: 'BuildingFabricationGenerator.makeTextureMaterialFromBuildingStyle'
        });
        textureCache.applyResolvedMaterial(mat, payload, { clearOnMissing: true });
        mat.color.setHex(0xffffff);
        mat.normalScale.set(0.9, 0.9);
    }

    if (!pbrMaterialId && url && textureCache) {
        mat.color.setHex(0xffffff);
        const tex = textureCache.trackMaterial(url, mat, { slot: 'map', srgb: true });
        if (tex) mat.map = tex;
    }

    if (!pbrMaterialId && normalUrl && textureCache) {
        const tex = textureCache.trackMaterial(normalUrl, mat, { slot: 'normalMap', srgb: false });
        if (tex) mat.normalMap = tex;
        mat.normalScale.set(0.9, 0.9);
    }

    if (!pbrMaterialId && ormUrl && textureCache) {
        const tex = textureCache.trackMaterial(ormUrl, mat, { slot: 'roughnessMap', srgb: false });
        if (tex) {
            mat.roughnessMap = tex;
            mat.metalnessMap = tex;
            mat.aoMap = tex;
        }
    }

    disableIblOnMaterial(mat);
    return mat;
}

function makeWallMaterialFromSpec({ material, baseColorHex, textureCache, wallBase }) {
    const base = wallBase && typeof wallBase === 'object' ? wallBase : null;
    const roughness = Number.isFinite(base?.roughness) ? base.roughness : 0.85;
    const normalStrength = Number.isFinite(base?.normalStrength) ? base.normalStrength : 0.9;
    const tintHex = resolveWallBaseTintHexFromWallBase(base ?? null);

    if (material?.kind === 'color') {
        const mat = new THREE.MeshStandardMaterial({
            color: resolveBeltCourseColorHex(material.id),
            roughness,
            metalness: 0.05
        });
        disableIblOnMaterial(mat);
        return mat;
    }

    const style = material?.kind === 'texture' ? material.id : BUILDING_STYLE.DEFAULT;
    const mat = makeWallMaterial({ style, baseColorHex, textureCache, roughness, metalness: 0.05 });
    if (mat?.map) mat.color.setHex(tintHex);
    if (mat?.normalScale) mat.normalScale.set(normalStrength, normalStrength);
    mat.roughness = roughness;
    return mat;
}

function makeBeltLikeMaterialFromSpec({ material, baseColorHex, textureCache, wallBase = null }) {
    if (material?.kind === 'texture') {
        if (wallBase && typeof wallBase === 'object') {
            return makeWallMaterialFromSpec({ material, baseColorHex, textureCache, wallBase });
        }
        return makeTextureMaterialFromBuildingStyle({
            style: material.id,
            baseColorHex,
            textureCache,
            roughness: 0.9,
            metalness: 0.0
        });
    }

    const mat = new THREE.MeshStandardMaterial({
        color: resolveBeltCourseColorHex(material?.id),
        roughness: 0.9,
        metalness: 0.0
    });
    disableIblOnMaterial(mat);
    return mat;
}

function makeWindowDecorationPartMaterial({
    part,
    fallbackMode = WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL,
    settings,
    layerMaterial,
    layerWallBase,
    baseColorHex,
    textureCache
} = {}) {
    const materialMode = String(part?.material?.mode ?? fallbackMode);
    const decorationMaterialId = typeof part?.material?.materialId === 'string'
        ? part.material.materialId.trim()
        : '';

    let mat = null;
    if (materialMode === WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
        || materialMode === WINDOW_DECORATION_MATERIAL_MODE.SLOT) {
        // 'slot' only reaches this point unresolved (missing slot); fall back
        // to the legacy match_wall behavior.
        mat = makeWallMaterialFromSpec({
            material: layerMaterial ?? null,
            baseColorHex,
            textureCache,
            wallBase: layerWallBase ?? null
        });
    } else if (materialMode === WINDOW_DECORATION_MATERIAL_MODE.PBR && decorationMaterialId) {
        mat = makeBeltLikeMaterialFromSpec({
            material: { kind: 'texture', id: decorationMaterialId },
            baseColorHex,
            textureCache
        });
    } else if (materialMode === 'color' && Number.isFinite(Number(part?.material?.colorHex))) {
        // Explicit flat color (storefront-zone dialect 'color' mode). Keep
        // the environment reflection low so a dark band stays dark instead
        // of washing out under the sky IBL.
        const spec = part.material;
        mat = new THREE.MeshStandardMaterial({
            color: (Number(spec.colorHex) >>> 0) & 0xffffff,
            roughness: Number.isFinite(Number(spec.roughness)) ? clamp(spec.roughness, 0.0, 1.0) : 0.75,
            metalness: Number.isFinite(Number(spec.metalness)) ? clamp(spec.metalness, 0.0, 1.0) : 0.0
        });
        mat.envMapIntensity = 0.25;
        mat.userData = mat.userData ?? {};
        mat.userData.iblEnvMapIntensity = 0.25;
    }

    if (!mat) {
        const frame = settings?.frame && typeof settings.frame === 'object' ? settings.frame : {};
        const frameMat = frame?.material && typeof frame.material === 'object' ? frame.material : {};
        const frameColor = normalizeHexColor(frame?.colorHex, 0xffffff);
        const frameRoughness = Number.isFinite(Number(frameMat?.roughness)) ? clamp(frameMat.roughness, 0.0, 1.0) : 0.72;
        const frameMetalness = Number.isFinite(Number(frameMat?.metalness)) ? clamp(frameMat.metalness, 0.0, 1.0) : 0.0;
        const frameEnvMapIntensity = Number.isFinite(Number(frameMat?.envMapIntensity)) ? clamp(frameMat.envMapIntensity, 0.0, 8.0) : 0.0;
        const frameNormalStrength = Number.isFinite(Number(frameMat?.normalStrength)) ? clamp(frameMat.normalStrength, 0.0, 5.0) : 1.0;
        mat = new THREE.MeshStandardMaterial({
            color: frameColor,
            roughness: frameRoughness,
            metalness: frameMetalness
        });
        mat.envMapIntensity = frameEnvMapIntensity;
        if (mat.normalScale) {
            mat.normalScale.set(frameNormalStrength, frameNormalStrength);
        }
    }

    return mat;
}

function createCustomOpeningSillDecorationMesh({
    bucket,
    layerMaterial,
    layerWallBase,
    baseColorHex,
    textureCache
} = {}) {
    const src = bucket && typeof bucket === 'object' ? bucket : null;
    if (!src) return null;

    const assetType = normalizeWindowFabricationAssetType(src?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    if (assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return null;

    const instances = Array.isArray(src?.instances) ? src.instances : [];
    if (!instances.length) return null;

    const settings = sanitizeWindowMeshSettings(src?.settings ?? null);
    const wallMaterialId = layerMaterial?.kind === 'texture' && typeof layerMaterial?.id === 'string'
        ? layerMaterial.id
        : '';
    const resolvedDecoration = resolveWindowDecorationState(src?.decoration ?? null, { wallMaterialId });
    const sill = resolvedDecoration?.[WINDOW_DECORATION_PART.SILL] ?? null;
    if (!sill?.enabled) return null;

    const style = String(sill?.type ?? WINDOW_DECORATION_STYLE.SIMPLE).toLowerCase();
    if (style !== WINDOW_DECORATION_STYLE.SIMPLE && style !== WINDOW_DECORATION_STYLE.BOTTOM_COVER) return null;

    const widthScaleRaw = Number(sill?.widthScale);
    const widthScale = Number.isFinite(widthScaleRaw) ? Math.max(0.01, widthScaleRaw) : 1.0;
    const template = sill?.template && typeof sill.template === 'object' ? sill.template : {};
    const width = Math.max(0.01, (Number(settings?.width) || 1.0) * widthScale);
    const height = Math.max(0.005, Number(template?.height) || 0.08);
    const depth = Math.max(0.001, Number(template?.depth) || 0.08);
    const gap = Number.isFinite(Number(template?.gap)) ? Number(template.gap) : 0.0;
    const offset = template?.offset && typeof template.offset === 'object' ? template.offset : {};
    const offsetX = Number(offset?.x) || 0.0;
    const offsetY = Number(offset?.y) || 0.0;
    const offsetZ = Number(offset?.z) || 0.0;
    const frameDepth = Math.max(0.0, Number(settings?.frame?.depth) || 0.0);
    const windowHeight = Math.max(0.01, Number(settings?.height) || 1.0);
    const yBase = style === WINDOW_DECORATION_STYLE.BOTTOM_COVER
        ? (-windowHeight * 0.5 + gap + height * 0.5)
        : (-windowHeight * 0.5 - gap - height * 0.5);

    const geo = new THREE.BoxGeometry(width, height, depth);
    geo.translate(0, 0, depth * 0.5);
    geo.computeVertexNormals();

    const mat = makeWindowDecorationPartMaterial({
        part: sill,
        fallbackMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME,
        settings,
        layerMaterial,
        layerWallBase,
        baseColorHex,
        textureCache
    });

    const mesh = new THREE.InstancedMesh(geo, mat, instances.length);
    mesh.name = 'bf2_window_decoration_sill';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < instances.length; i++) {
        const instance = instances[i] && typeof instances[i] === 'object' ? instances[i] : {};
        const p = instance?.position && typeof instance.position === 'object' ? instance.position : instance;
        const px = Number(p?.x) || 0.0;
        const py = Number(p?.y) || 0.0;
        const pz = Number(p?.z) || 0.0;
        const yaw = Number(instance?.yaw) || 0.0;
        const sinYaw = Math.sin(yaw);
        const cosYaw = Math.cos(yaw);
        const rightX = cosYaw;
        const rightZ = -sinYaw;
        const forwardX = sinYaw;
        const forwardZ = cosYaw;
        const forwardOffset = frameDepth + offsetZ;

        dummy.position.set(
            px + rightX * offsetX + forwardX * forwardOffset,
            py + yBase + offsetY,
            pz + rightZ * offsetX + forwardZ * forwardOffset
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    mesh.userData = mesh.userData ?? {};
    mesh.userData.buildingWindowSource = 'bf2_window_decoration';
    mesh.userData.windowDefinitionId = typeof src?.defId === 'string' ? src.defId : null;
    mesh.userData.windowAssetType = assetType;
    mesh.userData.windowDecorationPart = WINDOW_DECORATION_PART.SILL;
    mesh.userData.windowDecorationStyle = style;

    return mesh;
}

function createWindowDecorationInstancedMesh({
    geometry,
    material,
    instances,
    frameDepth,
    template,
    placeInstance
}) {
    const offset = template?.offset && typeof template.offset === 'object' ? template.offset : {};
    const offsetX = Number(offset?.x) || 0.0;
    const offsetY = Number(offset?.y) || 0.0;
    const offsetZ = Number(offset?.z) || 0.0;

    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < instances.length; i++) {
        const instance = instances[i] && typeof instances[i] === 'object' ? instances[i] : {};
        const p = instance?.position && typeof instance.position === 'object' ? instance.position : instance;
        const px = Number(p?.x) || 0.0;
        const py = Number(p?.y) || 0.0;
        const pz = Number(p?.z) || 0.0;
        const yaw = Number(instance?.yaw) || 0.0;
        const sinYaw = Math.sin(yaw);
        const cosYaw = Math.cos(yaw);
        const rightX = cosYaw;
        const rightZ = -sinYaw;
        const forwardX = sinYaw;
        const forwardZ = cosYaw;
        const forwardOffset = frameDepth + offsetZ;

        const local = placeInstance({ instance, windowCenterY: py });
        dummy.position.set(
            px + rightX * (offsetX + (local?.x ?? 0)) + forwardX * forwardOffset,
            (local?.absoluteY ?? (py + (local?.y ?? 0))) + offsetY,
            pz + rightZ * (offsetX + (local?.x ?? 0)) + forwardZ * forwardOffset
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, Math.max(EPS, Number(local?.scaleY) || 1), 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
}

function createCustomOpeningSurroundDecorationMeshes({
    bucket,
    layerMaterial,
    layerWallBase,
    baseColorHex,
    textureCache
} = {}) {
    const src = bucket && typeof bucket === 'object' ? bucket : null;
    if (!src) return [];

    const assetType = normalizeWindowFabricationAssetType(src?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
    if (assetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) return [];

    const instances = Array.isArray(src?.instances) ? src.instances : [];
    if (!instances.length) return [];

    const settings = sanitizeWindowMeshSettings(src?.settings ?? null);
    const wallMaterialId = layerMaterial?.kind === 'texture' && typeof layerMaterial?.id === 'string'
        ? layerMaterial.id
        : '';
    const resolvedDecoration = resolveWindowDecorationState(src?.decoration ?? null, { wallMaterialId });
    const meshes = [];

    const windowWidth = Math.max(0.01, Number(settings?.width) || 1.0);
    const windowHeight = Math.max(0.01, Number(settings?.height) || 1.0);
    const frameDepth = Math.max(0.0, Number(settings?.frame?.depth) || 0.0);
    const archEnabled = !!settings?.arch?.enabled;
    const archHeightRatio = Number(settings?.arch?.heightRatio) || 0.0;
    const defId = typeof src?.defId === 'string' ? src.defId : null;

    const header = resolvedDecoration?.[WINDOW_DECORATION_PART.HEADER] ?? null;
    const headerStyle = String(header?.type ?? '').toLowerCase();
    const headerTemplate = header?.template && typeof header.template === 'object' ? header.template : {};
    const headerHeight = Math.max(0.005, Number(headerTemplate?.height) || 0.08);
    const headerGap = Number.isFinite(Number(headerTemplate?.gap)) ? Number(headerTemplate.gap) : 0.0;
    if (header?.enabled && (isWindowHeaderProfileStyle(headerStyle) || headerStyle === WINDOW_DECORATION_STYLE.SIMPLE)) {
        const isProfile = isWindowHeaderProfileStyle(headerStyle);
        const geometry = isProfile
            ? buildWindowHeaderSurroundGeometry({
                style: headerStyle,
                openingWidth: windowWidth,
                widthScale: Number(header?.widthScale) || 1.0,
                height: headerHeight,
                depth: Math.max(0.001, Number(headerTemplate?.depth) || 0.08),
                earsMeters: Number(header?.earsMeters) || 0.0,
                archEnabled,
                archHeightRatio,
                windowHeight,
                bands: header?.bands,
                bandStepMeters: header?.bandStepMeters,
                curveSegments: 24
            })
            : (() => {
                const width = windowWidth * Math.max(0.01, Number(header?.widthScale) || 1.0);
                const depth = Math.max(0.001, Number(headerTemplate?.depth) || 0.08);
                const geo = new THREE.BoxGeometry(width, headerHeight, depth);
                geo.translate(0, 0, depth * 0.5);
                geo.computeVertexNormals();
                return geo;
            })();
        const material = makeWindowDecorationPartMaterial({
            part: header,
            fallbackMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL,
            settings,
            layerMaterial,
            layerWallBase,
            baseColorHex,
            textureCache
        });
        const mesh = createWindowDecorationInstancedMesh({
            geometry,
            material,
            instances,
            frameDepth,
            template: headerTemplate,
            placeInstance: () => (isProfile
                // Profile geometries anchor y=0 at the header bottom.
                ? { y: windowHeight * 0.5 + headerGap }
                : { y: windowHeight * 0.5 + headerGap + headerHeight * 0.5 })
        });
        mesh.name = 'bf2_window_decoration_header';
        mesh.userData = mesh.userData ?? {};
        mesh.userData.buildingWindowSource = 'bf2_window_decoration';
        mesh.userData.windowDefinitionId = defId;
        mesh.userData.windowAssetType = assetType;
        mesh.userData.windowDecorationPart = WINDOW_DECORATION_PART.HEADER;
        mesh.userData.windowDecorationStyle = headerStyle;
        meshes.push(mesh);
    }

    const jambs = resolvedDecoration?.[WINDOW_DECORATION_PART.JAMBS] ?? null;
    if (jambs?.enabled) {
        const jambsTemplate = jambs?.template && typeof jambs.template === 'object' ? jambs.template : {};
        const jambWidth = Math.max(0.01, Number(jambsTemplate?.height) || 0.1);
        const jambDepth = Math.max(0.001, Number(jambsTemplate?.depth) || 0.08);
        const runMode = String(jambs?.runMode ?? WINDOW_DECORATION_JAMBS_RUN_MODE.SILL_TO_HEADER);
        const fullBay = runMode === WINDOW_DECORATION_JAMBS_RUN_MODE.FULL_BAY;

        const geometry = buildWindowJambsSurroundGeometry({
            openingWidth: windowWidth,
            jambWidth,
            runHeight: fullBay ? 1.0 : windowHeight,
            depth: jambDepth
        });
        const material = makeWindowDecorationPartMaterial({
            part: jambs,
            fallbackMode: WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL,
            settings,
            layerMaterial,
            layerWallBase,
            baseColorHex,
            textureCache
        });
        const mesh = createWindowDecorationInstancedMesh({
            geometry,
            material,
            instances,
            frameDepth,
            template: jambsTemplate,
            placeInstance: ({ instance, windowCenterY }) => {
                if (!fullBay) return { y: 0 };
                const baseY = Number(instance?.floorBaseY);
                const topY = Number(instance?.floorTopY);
                if (!Number.isFinite(baseY) || !Number.isFinite(topY) || !(topY - baseY > EPS)) {
                    // Missing floor bounds: fall back to the opening run.
                    return { y: 0, scaleY: Math.max(EPS, windowHeight) };
                }
                return {
                    absoluteY: (baseY + topY) * 0.5,
                    scaleY: topY - baseY
                };
            }
        });
        mesh.name = 'bf2_window_decoration_jambs';
        mesh.userData = mesh.userData ?? {};
        mesh.userData.buildingWindowSource = 'bf2_window_decoration';
        mesh.userData.windowDefinitionId = defId;
        mesh.userData.windowAssetType = assetType;
        mesh.userData.windowDecorationPart = WINDOW_DECORATION_PART.JAMBS;
        mesh.userData.windowDecorationStyle = String(jambs?.type ?? WINDOW_DECORATION_STYLE.SIMPLE);
        mesh.userData.windowDecorationRunMode = runMode;
        meshes.push(mesh);
    }

    return meshes;
}

function makeRoofSurfaceMaterialFromSpec({ material, baseColorHex, textureCache }) {
    if (material?.kind === 'texture') {
        return makeTextureMaterialFromBuildingStyle({
            style: material.id,
            baseColorHex,
            textureCache,
            roughness: 0.85,
            metalness: 0.05,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
    }

    const mat = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(material?.id, baseColorHex),
        roughness: 0.85,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    disableIblOnMaterial(mat);
    return mat;
}

function makeWindowMaterial({ typeId, params, windowWidth, windowHeight, fakeDepth, pbr } = {}) {
    const safeTypeId = isWindowTypeId(typeId) ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
    const safeParams = { ...getDefaultWindowParams(safeTypeId), ...(params ?? {}) };
    const wantsAlpha = safeTypeId === WINDOW_TYPE.ARCH_V1;
    const pbrCfg = pbr && typeof pbr === 'object' ? pbr : {};
    const normalCfg = pbrCfg?.normal && typeof pbrCfg.normal === 'object' ? pbrCfg.normal : {};
    const roughCfg = pbrCfg?.roughness && typeof pbrCfg.roughness === 'object' ? pbrCfg.roughness : {};
    const borderCfg = pbrCfg?.border && typeof pbrCfg.border === 'object' ? pbrCfg.border : {};
    const normalEnabled = normalCfg.enabled === undefined ? true : !!normalCfg.enabled;
    const normalStrength = clamp(normalCfg.strength ?? 0.85, 0.0, 2.0);
    const roughEnabled = roughCfg.enabled === undefined ? true : !!roughCfg.enabled;
    const roughnessContrast = clamp(roughCfg.contrast ?? 1.0, 0.0, 4.0);

    const normalMap = normalEnabled ? getWindowNormalMapTexture({
        typeId: safeTypeId,
        params: safeParams,
        windowWidth,
        windowHeight,
        border: borderCfg
    }) : null;

    const roughnessMap = roughEnabled ? getWindowRoughnessMapTexture({
        typeId: safeTypeId,
        params: safeParams,
        windowWidth,
        windowHeight,
        roughness: { contrast: roughnessContrast }
    }) : null;

    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: getWindowTexture({ typeId: safeTypeId, params: safeParams, windowWidth, windowHeight }),
        normalMap,
        roughnessMap,
        roughness: roughnessMap ? 1.0 : 0.4,
        metalness: 0.0,
        emissive: new THREE.Color(0x0b1f34),
        emissiveIntensity: 0.35,
        transparent: wantsAlpha,
        alphaTest: wantsAlpha ? 0.01 : 0.0
    });
    disableIblOnMaterial(mat);
    if (normalMap && mat.normalScale) mat.normalScale.set(normalStrength, normalStrength);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;

    const fd = fakeDepth && typeof fakeDepth === 'object' ? fakeDepth : null;
    const enabled = !!fd?.enabled;
    if (enabled) {
        const strength = clamp(fd?.strength ?? 0.06, 0.0, 0.25);
        const insetStrength = clamp(fd?.insetStrength ?? 0.25, 0.0, 1.0);
        const frameWidth = clamp(safeParams?.frameWidth ?? 0.06, 0.0, 0.25);
        const aspect = clamp((Number(windowHeight) || 1) / Math.max(0.01, Number(windowWidth) || 1), 0.1, 10.0);

        mat.userData = mat.userData ?? {};
        mat.userData.windowFakeDepth = { strength, insetStrength, frameWidth, aspect };
        mat.customProgramCacheKey = () => 'window_fake_depth_v1';
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uWinFakeDepth = { value: new THREE.Vector4(strength, insetStrength, frameWidth, aspect) };

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform vec4 uWinFakeDepth;
#ifdef USE_NORMALMAP
vec3 mvWinPerturbNormal2Arb(vec3 eye_pos, vec3 surf_norm, vec3 mapN, float faceDirection, vec2 uv){
    vec3 q0 = dFdx( eye_pos.xyz );
    vec3 q1 = dFdy( eye_pos.xyz );
    vec2 st0 = dFdx( uv.st );
    vec2 st1 = dFdy( uv.st );
    vec3 N = normalize( surf_norm );
    vec3 q0perp = cross( N, q0 );
    vec3 q1perp = cross( q1, N );
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max( dot( T, T ), dot( B, B ) );
    float scale = (det == 0.0) ? 0.0 : faceDirection * inversesqrt( det );
    return normalize( T * ( mapN.x * scale ) + B * ( mapN.y * scale ) + N * mapN.z );
}
#endif
`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4( diffuse, opacity );
vec2 mvWinUv = vec2(0.0);
float mvWinOcclusion = 0.0;`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#ifdef USE_MAP
{
vec2 mvUvBase = vMapUv;
mvWinUv = mvUvBase;
vec3 mvNormal = normalize(vNormal);
vec3 mvViewDir = normalize(vViewPosition);
vec3 mvUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 mvTanU = cross(mvUp, mvNormal);
mvTanU /= max(1e-5, length(mvTanU));
vec3 mvTanV = normalize(cross(mvNormal, mvTanU));
vec3 mvViewTS = vec3(dot(mvViewDir, mvTanU), dot(mvViewDir, mvTanV), dot(mvViewDir, mvNormal));

float mvFrame = clamp(uWinFakeDepth.z, 0.0, 0.45);
float mvAspect = max(0.1, uWinFakeDepth.w);
float mvFrameU = mvFrame * min(1.0, mvAspect);
float mvFrameV = mvFrame * min(1.0, 1.0 / mvAspect);
float mvBlur = 0.02;
float mvInX = smoothstep(mvFrameU, mvFrameU + mvBlur, mvUvBase.x) * (1.0 - smoothstep(1.0 - mvFrameU - mvBlur, 1.0 - mvFrameU, mvUvBase.x));
float mvInY = smoothstep(mvFrameV, mvFrameV + mvBlur, mvUvBase.y) * (1.0 - smoothstep(1.0 - mvFrameV - mvBlur, 1.0 - mvFrameV, mvUvBase.y));
float mvInterior = mvInX * mvInY;

vec2 mvParDir = mvViewTS.xy / max(0.35, mvViewTS.z);
float mvDepth = clamp(uWinFakeDepth.x, 0.0, 0.25);
mvWinUv = mix(mvWinUv, mvUvBase - mvParDir * mvDepth, mvInterior);
mvWinUv = clamp(mvWinUv, vec2(0.0), vec2(1.0));

float mvInset = clamp(uWinFakeDepth.y, 0.0, 1.0);
float mvEdgeDist = min(min(mvUvBase.x, 1.0 - mvUvBase.x), min(mvUvBase.y, 1.0 - mvUvBase.y));
float mvOuterOcc = (1.0 - smoothstep(0.0, 0.08, mvEdgeDist)) * 0.55;
float mvDx = min(mvUvBase.x - mvFrameU, (1.0 - mvFrameU) - mvUvBase.x);
float mvDy = min(mvUvBase.y - mvFrameV, (1.0 - mvFrameV) - mvUvBase.y);
float mvInnerDist = max(0.0, min(mvDx, mvDy));
float mvInnerOcc = (1.0 - smoothstep(0.0, 0.12, mvInnerDist)) * mvInterior;
mvWinOcclusion = clamp(mvInset * (mvInnerOcc * 0.65 + mvOuterOcc * 0.35), 0.0, 1.0);

vec4 texelColor = texture2D(map, mvWinUv);
diffuseColor *= texelColor;
diffuseColor.rgb *= (1.0 - mvWinOcclusion * 0.35);
}
#endif`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#ifdef USE_NORMALMAP
vec3 mvNormalTex = texture2D( normalMap, mvWinUv ).xyz * 2.0 - 1.0;
mvNormalTex.xy *= normalScale;
#ifdef USE_TANGENT
normal = normalize( vTBN * mvNormalTex );
#else
normal = mvWinPerturbNormal2Arb( -vViewPosition, normal, mvNormalTex, faceDirection, mvWinUv );
#endif
#endif
`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
vec4 mvRoughnessTexel = texture2D( roughnessMap, mvWinUv );
roughnessFactor *= mvRoughnessTexel.g;
#endif`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
totalEmissiveRadiance *= (1.0 - mvWinOcclusion * 0.55);`
            );
        };
    }

    mat.needsUpdate = true;
    return mat;
}

function applyPlanOffset({ loops, offset }) {
    const { outer, holes } = splitLoops(loops);
    const d = clamp(offset, -8.0, 8.0);
    if (!(Math.abs(d) > EPS)) return { outer, holes, all: [...outer, ...holes] };

    const nextOuter = outer.map((loop) => offsetOrthogonalLoopXZ(loop, d));
    const nextHoles = holes.map((loop) => offsetOrthogonalLoopXZ(loop, -d));
    return { outer: nextOuter, holes: nextHoles, all: [...nextOuter, ...nextHoles] };
}

/**
 * Resolves the authored silhouette owner before the existing per-floor
 * plan-offset pass. Field-absent layers deliberately retain the legacy
 * cumulative-offset path; an explicit ownership mode opts into the AI 520
 * default/previous/detached contract.
 */
export function resolveFloorLayerPlanLoops({
    layers,
    defaultLoops,
    authoredDefaultLoops = null,
    lotFitCapture = null,
    minRunLengthsForLayer = null,
    warnings = null
} = {}) {
    const fallbackLoops = normalizeFootprintLoopsInput(defaultLoops);
    const authoredLoops = normalizeFootprintLoopsInput(authoredDefaultLoops);
    const byLayerId = new Map();
    const floorLayers = (Array.isArray(layers) ? layers : []).filter((layer) => layer?.type === LAYER_TYPE.FLOOR);
    const usesSilhouetteOwnership = floorLayers.some((layer) => (
        layer?.silhouette && typeof layer.silhouette === 'object'
    ));
    let previousLoops = fallbackLoops;
    let previousResolved = fallbackLoops[0]
        ? { layerId: 'building_default', sourceLayerId: 'building_default', loop: fallbackLoops[0] }
        : null;

    const authoredBounds = computeLoopsBoundsXZ(authoredLoops);
    const placedBounds = computeLoopsBoundsXZ(fallbackLoops);
    const translateX = authoredBounds && placedBounds
        ? ((placedBounds.minX + placedBounds.maxX) - (authoredBounds.minX + authoredBounds.maxX)) * 0.5
        : 0;
    const translateZ = authoredBounds && placedBounds
        ? ((placedBounds.minZ + placedBounds.maxZ) - (authoredBounds.minZ + authoredBounds.maxZ)) * 0.5
        : 0;

    for (const layer of Array.isArray(layers) ? layers : []) {
        if (layer?.type !== LAYER_TYPE.FLOOR) continue;
        const explicit = layer?.silhouette && typeof layer.silhouette === 'object'
            ? layer.silhouette
            : null;
        // Once a building opts into per-layer ownership, a field-absent layer
        // remains the backwards-compatible building-default owner. It must not
        // silently inherit a detached neighbour merely because the old offset
        // pipeline carried `previousLoops` forward. Entirely legacy configs
        // keep their cumulative plan-offset behaviour unchanged.
        let ownedLoops = usesSilhouetteOwnership ? fallbackLoops : previousLoops;
        let resolved = null;

        if (explicit) {
            let minimumSourceLoop = fallbackLoops[0] ?? [];
            if (explicit.mode === LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS && previousResolved?.loop?.length) {
                minimumSourceLoop = previousResolved.loop;
            } else if (explicit.mode === LAYER_SILHOUETTE_MODE.DETACHED && Array.isArray(explicit.loop)) {
                minimumSourceLoop = explicit.loop;
            }
            let minRunLengths = null;
            if (typeof minRunLengthsForLayer === 'function') {
                try {
                    minRunLengths = minRunLengthsForLayer({ layer, loop: minimumSourceLoop }) ?? null;
                } catch (error) {
                    if (warnings) warnings.push(`Layer ${layer.id}: facade minima could not be resolved (${error instanceof Error ? error.message : String(error)}).`);
                }
            }
            resolved = resolveLayerSilhouette({
                layer,
                defaultLoop: fallbackLoops[0] ?? [],
                previousResolved,
                minRunLengths
            });
            for (const entry of resolved.issues ?? []) {
                if (warnings && entry?.message) warnings.push(`Layer ${layer.id}: ${entry.message}`);
            }

            let outer = resolved.loop;
            if (resolved.mode === LAYER_SILHOUETTE_MODE.DETACHED) {
                const fitApplications = lotFitCapture?.result?.applications;
                if (Array.isArray(fitApplications) && fitApplications.length) {
                    const replay = replaySilhouetteLotFitApplications({
                        loop: outer,
                        provenance: lotFitCapture?.provenance ?? null,
                        applications: fitApplications,
                        bandMap: explicit.stretchProvenance?.bandMap ?? explicit.lotFitBandMap ?? null,
                        minRunLengths,
                        targetSourceLayerId: explicit.sourceLayerId ?? layer.id,
                        targetLineageId: explicit.stretchProvenance?.lineageId ?? explicit.sourceLayerId ?? layer.id
                    });
                    outer = replay.loop;
                    for (const entry of replay.issues ?? []) {
                        if (warnings && entry?.message) warnings.push(`Layer ${layer.id}: ${entry.message}`);
                    }
                } else if (Math.abs(translateX) > EPS || Math.abs(translateZ) > EPS) {
                    // Placement translations carry every detached design frame;
                    // dimensions remain authored meters and are never scaled.
                    outer = transformLoopsXZ([outer], { translateX, translateZ })[0] ?? outer;
                }
            }

            const inheritedHoles = resolved.mode === LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS
                ? previousLoops.slice(1)
                : fallbackLoops.slice(1);
            ownedLoops = normalizeFootprintLoopsInput([outer, ...inheritedHoles]);
        }

        const offset = clamp(layer?.planOffset ?? 0.0, -8.0, 8.0);
        const planLoops = applyPlanOffset({ loops: ownedLoops, offset }).all;
        const finalLoops = planLoops.length ? planLoops : ownedLoops;
        if (typeof layer?.id === 'string' && layer.id) byLayerId.set(layer.id, finalLoops);
        previousLoops = finalLoops;
        previousResolved = finalLoops[0]
            ? {
                layerId: typeof layer?.id === 'string' ? layer.id : '',
                sourceLayerId: resolved?.sourceLayerId
                    ?? (usesSilhouetteOwnership ? 'building_default' : previousResolved?.sourceLayerId)
                    ?? 'building_default',
                loop: finalLoops[0]
            }
            : previousResolved;
    }

    return byLayerId;
}

function applyWallInset({ loops, inset }) {
    const { outer, holes } = splitLoops(loops);
    const d = clamp(inset, 0.0, 4.0);
    if (!(d > EPS)) return { outer, holes, all: [...outer, ...holes] };

    const nextOuter = outer.map((loop) => offsetOrthogonalLoopXZ(loop, d));
    const nextHoles = holes.map((loop) => offsetOrthogonalLoopXZ(loop, -d));
    return { outer: nextOuter, holes: nextHoles, all: [...nextOuter, ...nextHoles] };
}

function buildShapeFromLoops({ outerLoop, holeLoops }) {
    const shapePts = tessellateLayerSilhouetteLoopForGeometry(outerLoop)
        .map((p) => new THREE.Vector2(p.x, -p.z));
    shapePts.reverse();
    const shape = new THREE.Shape(shapePts);

    for (const hole of holeLoops ?? []) {
        const holePts = tessellateLayerSilhouetteLoopForGeometry(hole)
            .map((p) => new THREE.Vector2(p.x, -p.z));
        holePts.reverse();
        shape.holes.push(new THREE.Path(holePts));
    }

    return shape;
}

const CORNICE_BURIAL_METERS = 0.02;
const CORNICE_ORNAMENT_BACK_BURIAL_METERS = 0.01;
const CORNICE_ORNAMENT_CORNER_CLEARANCE_METERS = 0.05;

// Fractional (o = outward projection 0..1, y = height 0..1) profile polylines,
// bottom to top. Every profile ends at full projection so the top shelf is the
// widest point, as on real cornices.
function resolveCorniceProfileFractions(profile) {
    if (profile === 'wedge') {
        // Splayed band: the underside slopes outward to full projection,
        // then a vertical face to the top (the angled transition band).
        return [
            { o: 0.12, y: 0.0 },
            { o: 1.0, y: 0.55 },
            { o: 1.0, y: 1.0 }
        ];
    }
    if (profile === 'stepped') {
        return [
            { o: 0.45, y: 0.0 }, { o: 0.45, y: 0.34 },
            { o: 0.72, y: 0.34 }, { o: 0.72, y: 0.67 },
            { o: 1.0, y: 0.67 }, { o: 1.0, y: 1.0 }
        ];
    }
    if (profile === 'crown_molding') {
        return [
            { o: 0.32, y: 0.0 }, { o: 0.32, y: 0.18 },
            { o: 0.42, y: 0.34 }, { o: 0.62, y: 0.5 },
            { o: 0.82, y: 0.64 }, { o: 0.95, y: 0.78 },
            { o: 1.0, y: 0.86 }, { o: 1.0, y: 1.0 }
        ];
    }
    if (profile === 'corbelled_brick') {
        const out = [];
        const steps = 5;
        for (let i = 0; i < steps; i++) {
            const o = (i + 1) / steps;
            out.push({ o, y: i / steps });
            out.push({ o, y: (i + 1) / steps });
        }
        return out;
    }
    return [{ o: 1.0, y: 0.0 }, { o: 1.0, y: 1.0 }];
}

// Closed cross-section swept around the layer loop. Offsets are outward from
// the loop plane. With `buryInner` the inner return sinks into the body behind
// it (a roof cornice wraps a parapet standing in its range); a layer cornice
// consumes its own elevation — nothing stands behind it — and a buried
// underside ring would lie exactly in the capY closure-band plane (z-fight),
// so it starts flush at the loop line instead.
function resolveCorniceCrossSection({ profile, heightMeters, projectionMeters, baseOutset = 0.0, buryInner = true, innerTopExtendMeters = 0.0 }) {
    const h = Math.max(0.02, Number(heightMeters) || 0);
    const p = Math.max(0.01, Number(projectionMeters) || 0);
    const base = Number(baseOutset) || 0;
    // The TOP inner point is always buried: the shelf tucks under the wall
    // standing above it, hiding the mesh-to-mesh T-junction that otherwise
    // rasterizes as a bright crack line along the shelf's back edge. A layer
    // cornice CONSUMES elevation, so its top shelf is the GROUND the next
    // floor stands on — `innerTopExtendMeters` widens it inward to reach
    // under the next layer's recessed strips (a shelf stopping at the wall
    // plane leaves those walls starting in the air: the "floating brick"
    // gap, user report 2026-08-28).
    const innerTop = base - CORNICE_BURIAL_METERS - Math.max(0, Number(innerTopExtendMeters) || 0);
    const innerBottom = buryInner ? base - CORNICE_BURIAL_METERS : base;
    const section = [{ o: innerBottom, y: 0 }];
    for (const f of resolveCorniceProfileFractions(profile)) {
        section.push({ o: base + f.o * p, y: f.y * h });
    }
    section.push({ o: innerTop, y: h });
    return section;
}

// Deepest recessed strip a facade spec authors (bay edge depths; negative =
// recessed behind the face plane). Zero when nothing recesses.
function minFacadeBayDepthMeters(layerFacades) {
    let min = 0;
    if (!layerFacades || typeof layerFacades !== 'object') return min;
    for (const faceId of facadeSpecFaceIds(layerFacades)) {
        const items = layerFacades[faceId]?.layout?.bays?.items;
        if (!Array.isArray(items)) continue;
        for (const bay of items) {
            const depth = bay?.depth;
            if (!depth || typeof depth !== 'object') continue;
            const left = Number(depth.left);
            const right = Number(depth.right);
            if (Number.isFinite(left)) min = Math.min(min, left);
            if (Number.isFinite(right)) min = Math.min(min, right);
        }
    }
    return min;
}

// Lofts a closed cross-section around a footprint loop with mitered corners.
// offsetOrthogonalLoopXZ preserves vertex count/order, so ring k vertex j always
// pairs with ring k+1 vertex j and corners stay watertight.
function buildCorniceLoftGeometryFromLoop({ loop, crossSection, yBase }) {
    const pts = Array.isArray(loop) ? loop : [];
    const n = pts.length;
    const m = Array.isArray(crossSection) ? crossSection.length : 0;
    if (n < 3 || m < 2) return null;

    const rings = crossSection.map((cs) => {
        const off = Number(cs?.o) || 0;
        return Math.abs(off) > EPS ? offsetOrthogonalLoopXZ(pts, -off) : pts;
    });

    const uAt = new Array(n + 1);
    uAt[0] = 0;
    for (let j = 0; j < n; j++) {
        const a = pts[j];
        const b = pts[(j + 1) % n];
        uAt[j + 1] = uAt[j] + Math.hypot(b.x - a.x, b.z - a.z);
    }

    const vAt = new Array(m + 1);
    vAt[0] = 0;
    for (let k = 0; k < m; k++) {
        const a = crossSection[k];
        const b = crossSection[(k + 1) % m];
        vAt[k + 1] = vAt[k] + Math.hypot((Number(b.o) || 0) - (Number(a.o) || 0), (Number(b.y) || 0) - (Number(a.y) || 0));
    }

    const positions = [];
    const uvs = [];
    const y0Base = Number(yBase) || 0;

    for (let k = 0; k < m; k++) {
        const k1 = (k + 1) % m;
        const csA = crossSection[k];
        const csB = crossSection[k1];
        const segLen = vAt[k + 1] - vAt[k];
        if (!(segLen > EPS)) continue;
        const ringA = rings[k];
        const ringB = rings[k1];
        const yA = y0Base + (Number(csA.y) || 0);
        const yB = y0Base + (Number(csB.y) || 0);
        const v0 = vAt[k];
        const v1 = vAt[k + 1];

        for (let j = 0; j < n; j++) {
            const j1 = (j + 1) % n;
            if (!(uAt[j + 1] - uAt[j] > EPS)) continue;
            const u0 = uAt[j];
            const u1 = uAt[j + 1];
            const p00 = ringA[j];
            const p10 = ringA[j1];
            const p01 = ringB[j];
            const p11 = ringB[j1];
            if (!p00 || !p10 || !p01 || !p11) continue;

            if (k1 === 0) {
                // Closing segment = the inner return. Consistent traversal
                // would wind it toward the building core, making it a
                // backface from outside: over a recessed strip a grazing
                // sightline read the ring as hollow (straight through its
                // back into the closure notch). Wound outward it renders as
                // the ring's visible back wall; behind a parapet it is
                // buried either way.
                positions.push(
                    p00.x, yA, p00.z, p11.x, yB, p11.z, p01.x, yB, p01.z,
                    p00.x, yA, p00.z, p10.x, yA, p10.z, p11.x, yB, p11.z
                );
                uvs.push(
                    u0, v0, u1, v1, u0, v1,
                    u0, v0, u1, v0, u1, v1
                );
                continue;
            }

            // Outward-facing winding for CCW outer loops: (P00, P01, P11), (P00, P11, P10)
            positions.push(
                p00.x, yA, p00.z, p01.x, yB, p01.z, p11.x, yB, p11.z,
                p00.x, yA, p00.z, p11.x, yB, p11.z, p10.x, yA, p10.z
            );
            uvs.push(
                u0, v0, u0, v1, u1, v1,
                u0, v0, u1, v1, u1, v0
            );
        }
    }

    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.computeVertexNormals();
    return geo;
}

// Repeating dentil/bracket modules along each straight face run, snap-to-fit and
// centered so both sides of every corner keep the same end margin. All modules
// share one BufferGeometry: a single mesh, never per-module draw calls.
function buildCorniceOrnamentGeometryFromLoop({ loop, ornament, baseOutset, yBase }) {
    const pts = Array.isArray(loop) ? loop : [];
    if (pts.length < 3 || !ornament || ornament.type === 'none') return null;

    const w = clamp(ornament.width, 0.02, 2.0);
    const d = clamp(ornament.depth, 0.02, 1.5);
    const gap = clamp(ornament.spacing, 0.0, 4.0);
    const h = clamp(ornament.height, 0.02, 1.5);
    const base = Number(baseOutset) || 0;
    const oBack = base - CORNICE_ORNAMENT_BACK_BURIAL_METERS;
    const oFront = base + d;
    const margin = Math.max(0.0, base) + d + CORNICE_ORNAMENT_CORNER_CLEARANCE_METERS;
    const isBracket = ornament.type === 'brackets';
    const y0 = Number(yBase) || 0;
    const y1 = y0 + h;

    const positions = [];
    const uvs = [];

    const pushQuad = (A, B, C, D, wantNx, wantNy, wantNz) => {
        const abx = B[0] - A[0];
        const aby = B[1] - A[1];
        const abz = B[2] - A[2];
        const acx = C[0] - A[0];
        const acy = C[1] - A[1];
        const acz = C[2] - A[2];
        const cx = aby * acz - abz * acy;
        const cy = abz * acx - abx * acz;
        const cz = abx * acy - aby * acx;
        const flip = (cx * wantNx + cy * wantNy + cz * wantNz) < 0;
        const b = flip ? D : B;
        const dd = flip ? B : D;
        positions.push(
            A[0], A[1], A[2], b[0], b[1], b[2], C[0], C[1], C[2],
            A[0], A[1], A[2], C[0], C[1], C[2], dd[0], dd[1], dd[2]
        );
        uvs.push(
            0, 0, 1, 0, 1, 1,
            0, 0, 1, 1, 0, 1
        );
    };

    const runs = buildExteriorRunsFromLoop(pts);
    for (const run of runs) {
        const L = Number(run?.length) || 0;
        if (!(L > EPS)) continue;

        const tx = run.dir.x;
        const tz = run.dir.z;
        const nx = tz;
        const nz = -tx;
        const P = (u, o, y) => [run.a.x + tx * u + nx * o, y, run.a.z + tz * u + nz * o];

        // Backing band: the ornament range replaced the solid cornice base
        // ring, so between (and beside) the modules the band opened straight
        // into the building. A full-run band at the module back plane keeps
        // the ring closed — including short runs (chamfers) that fit no
        // module at all. Nudged slightly proud so it never z-fights a
        // parapet ring standing at the same outset; corner overlap by `base`
        // closes outset mitres.
        {
            const bandO = base + 0.005;
            const ext = Math.max(0.0, base);
            const A = P(-ext, bandO, y0);
            const B = P(L + ext, bandO, y0);
            const C = P(L + ext, bandO, y1);
            const D = P(-ext, bandO, y1);
            positions.push(
                A[0], A[1], A[2], C[0], C[1], C[2], B[0], B[1], B[2],
                A[0], A[1], A[2], D[0], D[1], D[2], C[0], C[1], C[2]
            );
            const uSpan = L + ext * 2;
            uvs.push(
                0, 0, uSpan, h, uSpan, 0,
                0, 0, 0, h, uSpan, h
            );
        }

        const usable = L - margin * 2;
        if (!(usable >= w)) continue;

        const pitch = w + Math.max(0.02, gap);
        const count = Math.max(1, Math.floor((usable - w) / pitch) + 1);
        const step = count > 1 ? (usable - w) / (count - 1) : 0;

        for (let i = 0; i < count; i++) {
            const uc = count > 1 ? (margin + w * 0.5 + i * step) : (L * 0.5);
            const u0 = uc - w * 0.5;
            const u1 = uc + w * 0.5;

            if (isBracket) {
                const oBmid = oBack + (oFront - oBack) * 0.35;
                // slanted front
                pushQuad(P(u0, oBmid, y0), P(u1, oBmid, y0), P(u1, oFront, y1), P(u0, oFront, y1), nx, 0, nz);
                // top / bottom
                pushQuad(P(u0, oBack, y1), P(u1, oBack, y1), P(u1, oFront, y1), P(u0, oFront, y1), 0, 1, 0);
                pushQuad(P(u0, oBack, y0), P(u1, oBack, y0), P(u1, oBmid, y0), P(u0, oBmid, y0), 0, -1, 0);
                // sides
                pushQuad(P(u0, oBack, y0), P(u0, oBack, y1), P(u0, oFront, y1), P(u0, oBmid, y0), -tx, 0, -tz);
                pushQuad(P(u1, oBack, y0), P(u1, oBack, y1), P(u1, oFront, y1), P(u1, oBmid, y0), tx, 0, tz);
            } else {
                // dentil box (back face buried in the wall is skipped)
                pushQuad(P(u0, oFront, y0), P(u1, oFront, y0), P(u1, oFront, y1), P(u0, oFront, y1), nx, 0, nz);
                pushQuad(P(u0, oBack, y1), P(u1, oBack, y1), P(u1, oFront, y1), P(u0, oFront, y1), 0, 1, 0);
                pushQuad(P(u0, oBack, y0), P(u1, oBack, y0), P(u1, oFront, y0), P(u0, oFront, y0), 0, -1, 0);
                pushQuad(P(u0, oBack, y0), P(u0, oBack, y1), P(u0, oFront, y1), P(u0, oFront, y0), -tx, 0, -tz);
                pushQuad(P(u1, oBack, y0), P(u1, oBack, y1), P(u1, oFront, y1), P(u1, oFront, y0), tx, 0, tz);
            }
        }
    }

    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.computeVertexNormals();
    return geo;
}

function makeCorniceMaterialFromSpec({
    material,
    tiling,
    layerMaterial,
    layerWallBase,
    layerTiling,
    baseColorHex,
    textureCache,
    applyUvTiling = true
}) {
    if (material?.kind === 'match_wall') {
        const mat = makeWallMaterialFromSpec({
            material: layerMaterial ?? null,
            baseColorHex,
            textureCache,
            wallBase: layerWallBase ?? null
        });
        const styleId = layerMaterial?.kind === 'texture' ? layerMaterial.id : null;
        if (styleId && applyUvTiling) {
            const urls = resolveBuildingStyleWallMaterialUrls(styleId);
            const uvCfg = computeUvTilingParams({ tiling: layerTiling ?? null, urls, styleId });
            if (uvCfg.apply) {
                applyUvTilingToMeshStandardMaterial(mat, {
                    scaleU: uvCfg.scaleU,
                    scaleV: uvCfg.scaleV,
                    offsetU: uvCfg.offsetU,
                    offsetV: uvCfg.offsetV,
                    rotationDegrees: uvCfg.rotationDegrees
                });
            }
        }
        return mat;
    }

    const mat = makeBeltLikeMaterialFromSpec({ material, baseColorHex, textureCache });
    const styleId = material?.kind === 'texture' ? material.id : null;
    if (styleId && applyUvTiling) {
        const urls = resolveBuildingStyleWallMaterialUrls(styleId);
        const uvCfg = computeUvTilingParams({ tiling: tiling ?? null, urls, styleId });
        if (uvCfg.apply) {
            applyUvTilingToMeshStandardMaterial(mat, {
                scaleU: uvCfg.scaleU,
                scaleV: uvCfg.scaleV,
                offsetU: uvCfg.offsetU,
                offsetV: uvCfg.offsetV,
                rotationDegrees: uvCfg.rotationDegrees
            });
        }
    }
    return mat;
}

// Total vertical extent a layer's cornice block adds on top of its walls.
function resolveCorniceHeights(cornice) {
    if (!cornice?.enabled) return { total: 0.0, ornament: 0.0, profile: 0.0 };
    const total = clamp(cornice.height, 0.05, 2.0);
    const hasOrnament = cornice?.ornament?.type && cornice.ornament.type !== 'none';
    const ornament = hasOrnament ? Math.min(clamp(cornice.ornament.height, 0.02, 1.5), total * 0.6) : 0.0;
    return { total, ornament, profile: Math.max(0.02, total - ornament) };
}

// Vertical extent the roof layer adds above the roofline: parapet ring, crown
// cornice, stepped parapet blocks and coping cap all wrap the same range, so
// the building top is their max.
function resolveRoofLayerTopExtraHeight(layer) {
    const ring = layer?.ring ?? {};
    const ringEnabled = !!ring.enabled;
    const ringHeight = ringEnabled ? clamp(ring.height, 0.02, 2.0) : 0.0;
    let top = ringHeight;

    const cornice = layer?.cornice ?? null;
    if (cornice?.enabled) {
        const { total } = resolveCorniceHeights(cornice);
        top = Math.max(top, total);

        const hasParapetRing = ringEnabled && ringHeight > EPS;
        const coping = cornice?.parapet?.coping ?? null;
        const stepped = cornice?.parapet?.stepped ?? null;
        const copingHeight = coping?.enabled ? clamp(coping.height, 0.02, 0.5) : 0.0;
        if (stepped?.enabled && hasParapetRing) {
            top = Math.max(top, ringHeight + clamp(stepped.raise, 0.05, 2.0) + copingHeight);
        }
        if (coping?.enabled) {
            top = Math.max(top, (hasParapetRing ? ringHeight : total) + copingHeight);
        }
    }

    return top;
}

const CORNER_TREATMENT_BURIAL_METERS = 0.02;
const CORNER_TREATMENT_CORNER_SNAP_TOLERANCE_METERS = 2.0;

// Resolves the four rect corners (AB/BC/CD/DA pairing faces A=maxZ, B=maxX,
// C=minZ, D=minX) on the layer's resolved silhouette loop. Uses the nominal
// bounding-box corner as the anchor and snaps to the nearest convex loop
// vertex, so corners shifted by facade depth offsets still get their frames.
function resolveCornerTreatmentCornerFrames({ rectLoop, resolvedLoop, corners, skipCornerIds = null, warnings }) {
    const rect = Array.isArray(rectLoop) ? rectLoop : [];
    if (rect.length < 3) return [];

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of rect) {
        const x = Number(p?.x);
        const z = Number(p?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return [];

    const nominalByCornerId = {
        AB: { x: maxX, z: maxZ },
        BC: { x: maxX, z: minZ },
        CD: { x: minX, z: minZ },
        DA: { x: minX, z: maxZ }
    };

    const loopRaw = Array.isArray(resolvedLoop) && resolvedLoop.length >= 3 ? resolvedLoop : rect;
    const loop = signedArea(loopRaw) < 0 ? loopRaw.slice().reverse() : loopRaw;
    const n = loop.length;

    const frames = [];
    const skipSet = Array.isArray(skipCornerIds) ? new Set(skipCornerIds) : null;
    for (const cornerId of CORNER_TREATMENT_CORNER_IDS) {
        if (corners?.[cornerId]?.enabled === false) continue;
        // AI 499: a beveled corner is a facet, not an arris — nothing to wrap.
        if (skipSet?.has(cornerId)) continue;
        const nominal = nominalByCornerId[cornerId];

        let bestIndex = -1;
        let bestDist = CORNER_TREATMENT_CORNER_SNAP_TOLERANCE_METERS;
        for (let i = 0; i < n; i++) {
            const v = loop[i];
            const d = Math.hypot((Number(v?.x) || 0) - nominal.x, (Number(v?.z) || 0) - nominal.z);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = i;
            }
        }
        if (bestIndex < 0) {
            warnings?.push(`Corner treatment: no silhouette vertex near corner ${cornerId}; skipped.`);
            continue;
        }

        const v = loop[bestIndex];
        const prev = loop[(bestIndex - 1 + n) % n];
        const next = loop[(bestIndex + 1) % n];
        const inLen = Math.hypot(v.x - prev.x, v.z - prev.z);
        const outLen = Math.hypot(next.x - v.x, next.z - v.z);
        if (!(inLen > EPS) || !(outLen > EPS)) continue;
        const dirIn = { x: (v.x - prev.x) / inLen, z: (v.z - prev.z) / inLen };
        const dirOut = { x: (next.x - v.x) / outLen, z: (next.z - v.z) / outLen };
        const cross = dirIn.x * dirOut.z - dirIn.z * dirOut.x;
        if (!(cross > 0.3)) {
            warnings?.push(`Corner treatment: corner ${cornerId} is not convex enough; skipped.`);
            continue;
        }

        frames.push({
            cornerId,
            p: { x: v.x, z: v.z },
            tX: { x: -dirIn.x, z: -dirIn.z },
            nX: { x: dirIn.z, z: -dirIn.x },
            tY: { x: dirOut.x, z: dirOut.z },
            nY: { x: dirOut.z, z: -dirOut.x }
        });
    }
    return frames;
}

function resolveCornerTreatmentCourses({ cfg, spanStartY, spanEndY, floorSegmentStartYs }) {
    const span = Math.max(0, spanEndY - spanStartY);
    if (!(span > EPS)) return [];

    if (cfg.mode === CORNER_TREATMENT_MODE.STRIP) {
        return [{ y0: spanStartY, y1: spanEndY, phase: 0, strip: true }];
    }

    const blockHeight = clamp(cfg.blockHeight, 0.05, 2.0);
    const courses = [];

    if (cfg.rhythm?.mode === CORNER_TREATMENT_RHYTHM.FLOOR_ZONE) {
        const segStarts = Array.isArray(floorSegmentStartYs) && floorSegmentStartYs.length
            ? floorSegmentStartYs
            : [spanStartY];
        const everyFloors = clampInt(cfg.rhythm.everyFloors, 1, 12);
        const zoneCourses = clampInt(cfg.rhythm.zoneCourses, 1, 12);
        for (let f = 0; f < segStarts.length; f += everyFloors) {
            const base = Number(segStarts[f]);
            if (!Number.isFinite(base)) continue;
            for (let c = 0; c < zoneCourses; c++) {
                const y0 = base + c * blockHeight;
                const y1 = y0 + blockHeight;
                if (y1 > spanEndY + EPS) break;
                courses.push({ y0, y1, phase: c % 2, strip: false });
            }
        }
        return courses;
    }

    const count = Math.max(1, Math.round(span / blockHeight));
    const h = span / count;
    for (let k = 0; k < count; k++) {
        courses.push({ y0: spanStartY + k * h, y1: spanStartY + (k + 1) * h, phase: k % 2, strip: false });
    }
    return courses;
}

// Interlocked corner blocks: per course, the wrapping leg lies on one face,
// extends `projection` past the arris (its end face is the return the other
// face sees), and the tucked leg continues the header on the other face.
// The wrapping face alternates each course, so a long block on one face pairs
// with a short header on the other — true quoin bond, not symmetric teeth.
function buildCornerTreatmentGeometry({ cornerFrames, courses, cfg }) {
    const frames = Array.isArray(cornerFrames) ? cornerFrames : [];
    const list = Array.isArray(courses) ? courses : [];
    if (!frames.length || !list.length) return null;

    const projection = clamp(cfg.projection, 0.005, 0.5);
    const burial = CORNER_TREATMENT_BURIAL_METERS;
    const longWidth = clamp(cfg.longWidth, 0.05, 2.0);
    const shortWidth = clamp(cfg.shortWidth, 0.05, 2.0);
    const stripWidth = clamp(cfg.stripWidth, 0.05, 2.0);

    const positions = [];
    const uvs = [];

    const pushQuad = (A, B, C, D, uvA, uvB, uvC, uvD, wantNx, wantNy, wantNz) => {
        const abx = B[0] - A[0];
        const aby = B[1] - A[1];
        const abz = B[2] - A[2];
        const acx = C[0] - A[0];
        const acy = C[1] - A[1];
        const acz = C[2] - A[2];
        const cx = aby * acz - abz * acy;
        const cy = abz * acx - abx * acz;
        const cz = abx * acy - aby * acx;
        const flip = (cx * wantNx + cy * wantNy + cz * wantNz) < 0;
        const b = flip ? D : B;
        const d = flip ? B : D;
        const uvB2 = flip ? uvD : uvB;
        const uvD2 = flip ? uvB : uvD;
        positions.push(
            A[0], A[1], A[2], b[0], b[1], b[2], C[0], C[1], C[2],
            A[0], A[1], A[2], C[0], C[1], C[2], d[0], d[1], d[2]
        );
        uvs.push(
            uvA[0], uvA[1], uvB2[0], uvB2[1], uvC[0], uvC[1],
            uvA[0], uvA[1], uvC[0], uvC[1], uvD2[0], uvD2[1]
        );
    };

    // Each block maps its faces into roughly one texture tile with a
    // per-block offset — cut-stone blocks read as individual stones instead of
    // continuing the wall's texture flow (which made them visually vanish).
    const QUOIN_UV_BLOCK_METERS = 0.45;
    const emitLeg = ({ origin, t, n, u0, u1, y0, y1, seed, proj = projection }) => {
        if (!(u1 > u0 + EPS) || !(y1 > y0 + EPS)) return;
        const W = (u, v, y) => [origin.x + t.x * u + n.x * v, y, origin.z + t.z * u + n.z * v];
        const vIn = -burial;
        const vOut = proj;
        const s = Number(seed) || 0;
        const uOff = (s * 0.618034) % 1;
        const vOff = (s * 0.381966) % 1;
        const bu = (u) => uOff + (u - u0) / QUOIN_UV_BLOCK_METERS;
        const bv = (y) => vOff + (y - y0) / QUOIN_UV_BLOCK_METERS;

        // front (proud of the wall)
        pushQuad(
            W(u0, vOut, y0), W(u1, vOut, y0), W(u1, vOut, y1), W(u0, vOut, y1),
            [bu(u0), bv(y0)], [bu(u1), bv(y0)], [bu(u1), bv(y1)], [bu(u0), bv(y1)],
            n.x, 0, n.z
        );
        // top / bottom
        pushQuad(
            W(u0, vIn, y1), W(u1, vIn, y1), W(u1, vOut, y1), W(u0, vOut, y1),
            [bu(u0), vOff], [bu(u1), vOff], [bu(u1), vOff + 0.2], [bu(u0), vOff + 0.2],
            0, 1, 0
        );
        pushQuad(
            W(u0, vIn, y0), W(u1, vIn, y0), W(u1, vOut, y0), W(u0, vOut, y0),
            [bu(u0), vOff], [bu(u1), vOff], [bu(u1), vOff + 0.2], [bu(u0), vOff + 0.2],
            0, -1, 0
        );
        // ends (the near end of the wrapping leg is the visible return)
        pushQuad(
            W(u1, vIn, y0), W(u1, vOut, y0), W(u1, vOut, y1), W(u1, vIn, y1),
            [uOff, bv(y0)], [uOff + 0.25, bv(y0)], [uOff + 0.25, bv(y1)], [uOff, bv(y1)],
            t.x, 0, t.z
        );
        pushQuad(
            W(u0, vIn, y0), W(u0, vOut, y0), W(u0, vOut, y1), W(u0, vIn, y1),
            [uOff, bv(y0)], [uOff + 0.25, bv(y0)], [uOff + 0.25, bv(y1)], [uOff, bv(y1)],
            -t.x, 0, -t.z
        );
    };

    let frameIndex = 0;
    for (const frame of frames) {
        let courseIndex = 0;
        for (const course of list) {
            const baseSeed = frameIndex * 131 + courseIndex * 2;
            if (course.strip) {
                emitLeg({ origin: frame.p, t: frame.tX, n: frame.nX, u0: -projection, u1: stripWidth, y0: course.y0, y1: course.y1, seed: baseSeed });
                emitLeg({ origin: frame.p, t: frame.tY, n: frame.nY, u0: burial, u1: stripWidth, y0: course.y0, y1: course.y1, seed: baseSeed + 1 });
                courseIndex += 1;
                continue;
            }

            // Depth steps with width (as in the reference towers: the wider
            // element also projects further from the wall), giving the zig-zag
            // shadow. Matched bond scales per course; interlocked scales per
            // leg (the long stone wraps proud, the short header sits shallower).
            const xWraps = course.phase === 0;
            const matchedBond = cfg.bond !== 'interlocked';
            const shortProj = projection * clamp(cfg.shortProjectionScale ?? 0.55, 0.1, 1.0);
            const courseLen = course.phase === 0 ? longWidth : shortWidth;
            const xLen = matchedBond ? courseLen : (xWraps ? longWidth : shortWidth);
            const yLen = matchedBond ? courseLen : (xWraps ? shortWidth : longWidth);
            const xProj = matchedBond
                ? (course.phase === 0 ? projection : shortProj)
                : (xLen === longWidth ? projection : shortProj);
            const yProj = matchedBond
                ? (course.phase === 0 ? projection : shortProj)
                : (yLen === longWidth ? projection : shortProj);
            emitLeg({
                origin: frame.p,
                t: frame.tX,
                n: frame.nX,
                u0: xWraps ? -xProj : burial,
                u1: xLen,
                y0: course.y0,
                y1: course.y1,
                seed: baseSeed,
                proj: xProj
            });
            emitLeg({
                origin: frame.p,
                t: frame.tY,
                n: frame.nY,
                u0: xWraps ? burial : -yProj,
                u1: yLen,
                y0: course.y0,
                y1: course.y1,
                seed: baseSeed + 1,
                proj: yProj
            });
            courseIndex += 1;
        }
        frameIndex += 1;
    }

    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.computeVertexNormals();
    return geo;
}

// AI 487: window surrounds on a recessed bay must stay inside the reveal —
// a surround deeper than the bay recession would poke past the pier plane.
// Deterministic rule: clamp the offending part depths and warn.
function clampWindowDecorationDepthsToBayRecession(decoration, { recessionMeters, warnings = null, contextLabel = '' } = {}) {
    if (!decoration || typeof decoration !== 'object') return decoration;
    const recession = Number(recessionMeters) || 0;
    if (!(recession > EPS)) return decoration;
    for (const part of ['sill', 'header', 'jambs']) {
        const cfg = decoration[part];
        if (!cfg || typeof cfg !== 'object' || cfg.enabled === false) continue;
        const depthRaw = Number(cfg.depthMeters);
        if (Number.isFinite(depthRaw) && depthRaw > recession + 1e-6) {
            cfg.depthMeters = recession;
            warnings?.push(`${contextLabel}: window ${part} depth ${depthRaw.toFixed(3)}m exceeds bay recession; clamped to ${recession.toFixed(3)}m.`);
        }
    }
    return decoration;
}

function clampUnit(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return clamp(fallback, 0, 1);
    return clamp(num, 0, 1);
}

function normalizeMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    return null;
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

function parseDecorationBayRef(value) {
    const normalized = normalizeDecorationBayRef(value);
    if (!normalized) return null;
    const idx = normalized.indexOf(':');
    return {
        faceId: normalized.slice(0, idx),
        bayId: normalized.slice(idx + 1)
    };
}

// AI 508: facade lettering items live on the wallDecorations root
// (`wallDecorations.lettering`), so they ride the existing config plumbing
// (CityMap/City/export treat the root opaquely). One item = one sign.
const FACADE_LETTERING_ZONES = Object.freeze(['bay', 'opening_header']);

function normalizeFacadeLetteringItems(wallDecorations, warnings = null) {
    const list = Array.isArray(wallDecorations?.lettering) ? wallDecorations.lettering : [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
        const raw = list[i] && typeof list[i] === 'object' ? list[i] : null;
        if (!raw) continue;
        const id = (typeof raw.id === 'string' && raw.id.trim()) ? raw.id.trim() : `lettering_${i + 1}`;
        const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 64) : '';
        if (!text) {
            warnings?.push(`Lettering ${id}: empty text; skipped.`);
            continue;
        }
        const target = raw.target && typeof raw.target === 'object' ? raw.target : {};
        const layerId = typeof target.layerId === 'string' ? target.layerId.trim() : '';
        const bayRef = parseDecorationBayRef(target.bayRef);
        if (!layerId || !bayRef) {
            warnings?.push(`Lettering ${id}: target needs layerId and bayRef "<face>:<bay>"; skipped.`);
            continue;
        }
        const zoneRaw = typeof target.zone === 'string' ? target.zone.trim().toLowerCase() : '';
        const zone = FACADE_LETTERING_ZONES.includes(zoneRaw) ? zoneRaw : 'bay';
        if (zoneRaw && zone !== zoneRaw) warnings?.push(`Lettering ${id}: unknown zone "${zoneRaw}"; using "bay".`);
        const styleRaw = typeof raw.style === 'string' ? raw.style.trim().toLowerCase() : '';
        if (styleRaw && styleRaw !== 'raised_block') warnings?.push(`Lettering ${id}: unknown style "${styleRaw}"; using "raised_block".`);
        const yOffsetRaw = Number(target.yOffsetMeters);
        out.push({
            id,
            text,
            layerId,
            faceId: bayRef.faceId,
            bayId: bayRef.bayId,
            zone,
            floor: clampInt(target.floor ?? 1, 1, 200),
            yOffsetMeters: Number.isFinite(yOffsetRaw) ? clamp(yOffsetRaw, -30.0, 30.0) : 0.0,
            heightMeters: clamp(raw.heightMeters ?? 0.4, 0.05, 3.0),
            depthMeters: clamp(raw.depthMeters ?? 0.04, 0.005, 0.3),
            letterSpacingRatio: clamp(raw.letterSpacingRatio ?? FACADE_LETTERING_DEFAULT_SPACING_RATIO, 0.0, 2.0),
            style: 'raised_block',
            material: raw.material && typeof raw.material === 'object' ? raw.material : null
        });
    }
    return out;
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

function getFaceNormalVector(faceId) {
    const src = FACE_NORMAL_BY_ID[faceId];
    if (!src) return null;
    return new THREE.Vector3(src.x, src.y, src.z);
}

function flipGeometryWinding(geometry) {
    const geo = geometry?.isBufferGeometry ? geometry : null;
    if (!geo) return;
    let flipped = false;
    const index = geo.getIndex?.() ?? null;
    if (index?.array && index.array.length >= 3) {
        const arr = index.array;
        for (let i = 0; i + 2 < arr.length; i += 3) {
            const t = arr[i + 1];
            arr[i + 1] = arr[i + 2];
            arr[i + 2] = t;
        }
        index.needsUpdate = true;
        flipped = true;
    } else {
        const pos = geo.getAttribute?.('position');
        if (!pos?.array || pos.itemSize !== 3) return;
        const attrNames = Object.keys(geo.attributes ?? {});
        for (const name of attrNames) {
            const attr = geo.getAttribute(name);
            const itemSize = Number(attr?.itemSize) || 0;
            const arr = attr?.array;
            if (!arr || !(itemSize > 0)) continue;
            const stride = itemSize * 3;
            for (let i = 0; i + stride - 1 < arr.length; i += stride) {
                for (let k = 0; k < itemSize; k += 1) {
                    const t = arr[i + itemSize + k];
                    arr[i + itemSize + k] = arr[i + itemSize * 2 + k];
                    arr[i + itemSize * 2 + k] = t;
                }
            }
            attr.needsUpdate = true;
        }
        flipped = true;
    }

    if (!flipped) return;
    const normal = geo.getAttribute?.('normal');
    if (!normal?.array || normal.itemSize < 3) return;
    const normals = normal.array;
    for (let i = 0; i + 2 < normals.length; i += normal.itemSize) {
        normals[i] = -normals[i];
        normals[i + 1] = -normals[i + 1];
        normals[i + 2] = -normals[i + 2];
    }
    normal.needsUpdate = true;
}

function computeGeometryFirstTriangleNormalDotAxis(geometry, quaternion, axis) {
    const geo = geometry?.isBufferGeometry ? geometry : null;
    const q = quaternion?.isQuaternion ? quaternion : null;
    const target = axis?.isVector3 ? axis : null;
    if (!geo || !q || !target) return 1.0;
    const pos = geo.getAttribute?.('position');
    if (!pos || pos.count < 3) return 1.0;

    let i0 = 0;
    let i1 = 1;
    let i2 = 2;
    const index = geo.getIndex?.() ?? null;
    if (index?.array && index.array.length >= 3) {
        i0 = Number(index.array[0]) || 0;
        i1 = Number(index.array[1]) || 1;
        i2 = Number(index.array[2]) || 2;
    }
    if (i0 >= pos.count || i1 >= pos.count || i2 >= pos.count) return 1.0;

    const v0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyQuaternion(q);
    const v1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyQuaternion(q);
    const v2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyQuaternion(q);
    const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
    const len = n.length();
    if (!(len > EPS)) return 1.0;
    n.multiplyScalar(1.0 / len);
    return n.dot(target);
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

/**
 * Whether a decoration follows a bay recession onto its derived surfaces.
 * Defaults to true, matching the SHOULD in
 * `BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC` §5.2.
 * @param {object} decoration
 */
function resolveDecorationInheritOnDerivedSurfaces(decoration) {
    return decoration?.inheritOnDerivedSurfaces !== false;
}

/**
 * Extend a decoration onto the **connector walls** a bay recession generates.
 *
 * When bay B sits at a different depth from its neighbours A and C, the
 * silhouette extrudes a connector wall at each boundary. Those walls are
 * derived geometry (BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC §5.2) — they have no bay
 * id, so no decoration set can ever target them, which is exactly why they
 * inherit. Neighbouring bay fronts are authorable and are never claimed here.
 *
 * Ownership is by depth: the **proud** side of the step owns the connector,
 * because the connector is the side wall of that bay's own mass. Inset B takes
 * its band from A and C; extruded B wraps its own band onto both connectors.
 * Two bays can never claim the same connector — equal depths produce no
 * connector at all.
 *
 * Both sides of the joint are marked so the panels butt with their end caps
 * dropped, turning the corner as an L instead of overlapping. The connector band
 * is built to the connector's true width; a decorator that clamps a decorated
 * surface up to some minimum makes it overhang the corner instead.
 *
 * @param {Array<object>} renderItems bay items, appended to in place
 * @param {object} options
 * @param {boolean} options.inheritOnDerivedSurfaces
 * @param {boolean} options.isBandFamily band-shaped decorators only
 * @param {Record<string, Array<object>> | null} options.surfaceRunsByFaceId
 */
function appendDerivedSurfaceRenderItems(renderItems, {
    inheritOnDerivedSurfaces,
    isBandFamily,
    surfaceRunsByFaceId
}) {
    const items = Array.isArray(renderItems) ? renderItems : [];
    if (!items.length || !surfaceRunsByFaceId) return;
    if (!inheritOnDerivedSurfaces || !isBandFamily) return;

    const frontDepthOf = (element) => Math.max(Number(element?.depth0) || 0, Number(element?.depth1) || 0);

    // Snapshot: only the bay items can claim a connector, and the loop appends.
    for (const item of items.slice()) {
        if (!(item.runIndex >= 0)) continue;
        const run = surfaceRunsByFaceId[item.faceId];
        if (!Array.isArray(run)) continue;
        const source = run[item.runIndex] ?? null;
        if (source?.kind !== 'face') continue;
        const sourceDepth = frontDepthOf(source);

        for (const direction of [-1, 1]) {
            // A partial span stops short of the bay edge, so there is no joint
            // to turn at on that side.
            if (direction < 0 && item.spanStart > EPS) continue;
            if (direction > 0 && item.spanEnd < 1.0 - EPS) continue;

            const connectorIndex = item.runIndex + direction;
            const connector = run[connectorIndex] ?? null;
            if (connector?.kind !== 'return') continue;
            // Only the proud side of the step owns the connector.
            const opposite = run[connectorIndex + direction] ?? null;
            if (opposite?.kind === 'face' && frontDepthOf(opposite) > sourceDepth + 1e-4) continue;

            if (direction < 0) item.joinStart = true;
            else item.joinEnd = true;

            items.push({
                bayRef: item.bayRef,
                faceId: item.faceId,
                layerMaterialSpec: item.layerMaterialSpec,
                segment: connector,
                spanStart: 0.0,
                spanEnd: 1.0,
                cornerStart: false,
                cornerEnd: false,
                hasAnyStart: false,
                hasAnyEnd: false,
                cornerStartStyle: 'exterior',
                cornerEndStyle: 'exterior',
                derivedSurface: 'return',
                runIndex: connectorIndex,
                // A run element's segment always starts on the `index - 1` side,
                // so the joint with the owning bay is whichever end faces it.
                joinStart: direction > 0,
                joinEnd: direction < 0
            });
        }
    }
}

function buildGameplayWallDecorationMeshes({
    wallDecorations = null,
    bayHighlightDataByLayerId = null,
    facadeSurfaceRunsByLayerId = null,
    floorSegmentsByLayerId = null,
    floorLayerById = null,
    facadesByLayerId = null,
    globalFacadeSpec = null,
    baseColorHex = 0xffffff,
    textureCache = null
} = {}) {
    const decorationRoot = wallDecorations && typeof wallDecorations === 'object'
        ? wallDecorations
        : null;
    const sets = Array.isArray(decorationRoot?.sets) ? decorationRoot.sets : [];
    if (!sets.length) return [];

    const bayEntriesByLayerId = new Map();
    const surfaceRunsByLayerId = facadeSurfaceRunsByLayerId && typeof facadeSurfaceRunsByLayerId === 'object'
        ? facadeSurfaceRunsByLayerId
        : null;
    const sourceByLayer = bayHighlightDataByLayerId && typeof bayHighlightDataByLayerId === 'object'
        ? bayHighlightDataByLayerId
        : {};
    for (const [layerId, entriesRaw] of Object.entries(sourceByLayer)) {
        const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
        if (!entries.length) continue;
        const byBayRef = new Map();
        const seenByBayRef = new Map();
        for (const entry of entries) {
            const faceId = isFaceId(entry?.faceId) ? entry.faceId : null;
            const bayId = typeof entry?.bayId === 'string' ? entry.bayId : '';
            if (!faceId || !bayId) continue;
            const x0 = Number(entry?.x0);
            const z0 = Number(entry?.z0);
            const x1 = Number(entry?.x1);
            const z1 = Number(entry?.z1);
            if (!Number.isFinite(x0) || !Number.isFinite(z0) || !Number.isFinite(x1) || !Number.isFinite(z1)) continue;
            const nx = Number(entry?.nx);
            const nz = Number(entry?.nz);
            const bayRef = `${faceId}:${bayId}`;
            const pA = buildWallDecorationEndpointKey(x0, z0);
            const pB = buildWallDecorationEndpointKey(x1, z1);
            const segKey = pA <= pB ? `${pA}|${pB}` : `${pB}|${pA}`;
            let seen = seenByBayRef.get(bayRef);
            if (!seen) {
                seen = new Set();
                seenByBayRef.set(bayRef, seen);
            }
            if (seen.has(segKey)) continue;
            seen.add(segKey);
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
            const bucket = byBayRef.get(bayRef);
            if (bucket) bucket.push(normalized);
            else byBayRef.set(bayRef, [normalized]);
        }
        if (byBayRef.size) bayEntriesByLayerId.set(layerId, byBayRef);
    }
    if (!bayEntriesByLayerId.size) return [];

    const floorSegsByLayer = floorSegmentsByLayerId instanceof Map ? floorSegmentsByLayerId : new Map();
    const floorLayersById = floorLayerById instanceof Map ? floorLayerById : new Map();
    const up = new THREE.Vector3(0, 1, 0);

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
        return normalizeMaterialSpec(layer?.material ?? null);
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

    const resolveActiveWallMaterialSpec = ({ layerId, layer, faceId, bayId }) => {
        const baseFaceMaterial = resolveFaceMaterialSpec(layer, faceId);
        const layerFacades = globalFacadeSpec && typeof globalFacadeSpec === 'object'
            ? globalFacadeSpec
            : ((facadesByLayerId?.[layerId] && typeof facadesByLayerId[layerId] === 'object') ? facadesByLayerId[layerId] : null);
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

    const resolveFloorSegmentsForSet = (layerId, floorIntervalRaw) => {
        const allSegments = Array.isArray(floorSegsByLayer.get(layerId))
            ? floorSegsByLayer.get(layerId)
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

    const materialCache = new Map();
    const resolveWallDecorationMaterial = ({
        safeState,
        layerMaterialSpec,
        surfaceSizeMeters = null,
        geometryKind = ''
    }) => {
        const state = sanitizeWallDecoratorDebuggerState(safeState);
        const wallBase = state?.wallBase && typeof state.wallBase === 'object' ? state.wallBase : {};
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
        const geomKind = String(geometryKind ?? '').trim().toLowerCase();
        const materialSelection = state?.materialSelection && typeof state.materialSelection === 'object'
            ? state.materialSelection
            : {};
        const materialKindRaw = typeof materialSelection.kind === 'string'
            ? materialSelection.kind.trim().toLowerCase()
            : '';
        const isMatchWall = materialKindRaw === 'match_wall' || materialKindRaw === 'match wall' || materialKindRaw === 'matchwall';
        const isColor = materialKindRaw === 'color';

        let materialId = '';
        if (isMatchWall) {
            if (layerMaterialSpec?.kind === 'texture' && typeof layerMaterialSpec.id === 'string') {
                materialId = layerMaterialSpec.id.trim();
            }
        } else if (materialKindRaw === 'texture' && typeof materialSelection.id === 'string') {
            materialId = materialSelection.id.trim();
        }
        const colorId = isColor && typeof materialSelection.id === 'string'
            ? materialSelection.id.trim()
            : '';
        const key = stableStringify({
            geomKind,
            roughness,
            normalStrength,
            widthMeters,
            heightMeters,
            isMatchWall,
            colorId,
            materialId,
            layerColorId: layerMaterialSpec?.kind === 'color' ? String(layerMaterialSpec?.id ?? '') : '',
            wallBase: wallBase ?? {},
            tiling: state?.tiling ?? {}
        });
        const cached = materialCache.get(key);
        if (cached) return cached;

        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness,
            metalness: 0.02,
            side: THREE.FrontSide
        });
        if (material.normalScale?.set) material.normalScale.set(normalStrength, normalStrength);

        if (geomKind === 'awning_support_rod') {
            material.color.setHex(AWNING_ROD_MATERIAL.colorHex);
            material.roughness = AWNING_ROD_MATERIAL.roughness;
            material.metalness = AWNING_ROD_MATERIAL.metalness;
            material.envMapIntensity = AWNING_ROD_MATERIAL.envMapIntensity;
            if (material.normalScale?.set) material.normalScale.set(1, 1);
            materialCache.set(key, material);
            return material;
        }

        if (isColor) {
            material.color.setHex(resolveBeltCourseColorHex(colorId));
            materialCache.set(key, material);
            return material;
        }

        if (!materialId) {
            if (isMatchWall && layerMaterialSpec?.kind === 'color') {
                material.color.setHex(resolveBeltCourseColorHex(String(layerMaterialSpec?.id ?? '').trim()));
            } else {
                material.color.setHex(isMatchWall ? 0xf4f4f4 : 0xffffff);
            }
            materialCache.set(key, material);
            return material;
        }

        const payload = textureCache?.resolveMaterial?.(materialId, {
            cloneTextures: true,
            uvSpace: 'unit',
            surfaceSizeMeters: { x: widthMeters, y: heightMeters },
            diagnosticsTag: 'BuildingFabricationGenerator.wall_decoration'
        }) ?? null;
        if (payload) textureCache?.applyResolvedMaterial?.(material, payload, { clearOnMissing: true });

        if (isMatchWall) material.color.setHex(0xffffff);
        else material.color.setHex(resolveWallBaseTintHexFromWallBase(wallBase));

        const tiling = state?.tiling && typeof state.tiling === 'object' ? state.tiling : {};
        const tilingEnabled = !!tiling.enabled;
        const uvEnabled = !!tiling.uvEnabled;

        const probeTexture = material.map ?? material.normalMap ?? material.roughnessMap ?? material.metalnessMap ?? material.aoMap ?? null;
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

        const offsetU = uvEnabled ? clamp(Number(tiling.offsetU) || 0.0, -10.0, 10.0) : 0.0;
        const offsetV = uvEnabled ? clamp(Number(tiling.offsetV) || 0.0, -10.0, 10.0) : 0.0;
        const rotationDegrees = uvEnabled ? clamp(Number(tiling.rotationDegrees) || 0.0, -180.0, 180.0) : 0.0;
        const applyTexXform = (tex) => {
            if (!tex) return;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatU, repeatV);
            tex.offset.set(offsetU, offsetV);
            tex.rotation = rotationDegrees * Math.PI / 180.0;
            tex.needsUpdate = true;
        };
        applyTexXform(material.map);
        applyTexXform(material.normalMap);
        applyTexXform(material.roughnessMap);
        applyTexXform(material.metalnessMap);
        applyTexXform(material.aoMap);

        materialCache.set(key, material);
        return material;
    };

    const createdMeshes = [];
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

        const layer = floorLayersById.get(layerId) ?? null;
        const surfaceRunsByFaceId = surfaceRunsByLayerId?.[layerId] ?? null;
        // Bay segments and face run elements are both built from the same
        // (u, depth) frame points, so a bay is located in its run by endpoints.
        const surfaceRunIndexByKey = new Map();
        for (const [faceId, run] of Object.entries(surfaceRunsByFaceId ?? {})) {
            if (!Array.isArray(run)) continue;
            for (let index = 0; index < run.length; index += 1) {
                const element = run[index];
                if (element?.kind !== 'face') continue;
                const key = `${faceId}|${buildWallDecorationEndpointKey(element.x0, element.z0)}|${buildWallDecorationEndpointKey(element.x1, element.z1)}`;
                if (!surfaceRunIndexByKey.has(key)) surfaceRunIndexByKey.set(key, index);
            }
        }
        const resolveSurfaceRunIndex = (faceId, startKey, endKey) => {
            const index = surfaceRunIndexByKey.get(`${faceId}|${startKey}|${endKey}`);
            return Number.isFinite(index) ? index : -1;
        };
        const decorations = Array.isArray(set?.decorations) ? set.decorations : [];
        const setId = typeof set?.id === 'string' ? set.id : '';
        for (const decoration of decorations) {
            if (!decoration || typeof decoration !== 'object') continue;
            const decorationId = typeof decoration?.id === 'string' ? decoration.id : '';
            if (!decorationId) continue;
            const decorationKey = `${setId}:${decorationId}`;
            const safeState = sanitizeWallDecoratorDebuggerState(decoration?.state);
            const span = decoration?.span && typeof decoration.span === 'object' ? decoration.span : {};
            const minSpan = Math.min(clampUnit(span.start, 0.0), clampUnit(span.end, 1.0));
            const maxSpan = Math.max(clampUnit(span.start, 0.0), clampUnit(span.end, 1.0));
            if (maxSpan - minSpan <= EPS) continue;
            const compatibilityId = buildWallDecorationCompatibilityId({
                safeState,
                spanStart: minSpan,
                spanEnd: maxSpan
            });

            // AI 494: bands turn onto the connector walls a bay recession
            // generates. Only band-shaped decorators (a flat course plus its
            // caps) can do that meaningfully — a projecting awning or a dentil
            // cornice has no sensible reading on a 0.3m return — so the flag is
            // a no-op for the rest.
            const inheritOnDerivedSurfaces = resolveDecorationInheritOnDerivedSurfaces(decoration);
            const decorationIsBandFamily = hasFlatCapFamilyFrontSpecs(buildWallDecoratorShapeSpecs(
                sanitizeWallDecoratorDebuggerState({ ...safeState, mode: 'face' }),
                {
                    widthMeters: 1.0,
                    heightMeters: 3.0,
                    depthMeters: WALL_DECORATION_DEFAULT_WALL_DEPTH_M
                }
            ));

            const autoCornerByBayRef = decoration?.autoCorner?.byBayRef && typeof decoration.autoCorner.byBayRef === 'object'
                ? decoration.autoCorner.byBayRef
                : null;
            const resolvedAutoTargetBayRefs = Array.isArray(decoration?.autoCorner?.resolvedBayRefs)
                ? decoration.autoCorner.resolvedBayRefs
                    .map((entry) => normalizeDecorationBayRef(entry))
                    .filter((entry, idx, arr) => !!entry && arr.indexOf(entry) === idx && byBayRef.has(entry))
                : [];
            const targetSet = new Set(targetBayRefs);
            for (const ref of resolvedAutoTargetBayRefs) targetSet.add(ref);
            const resolvedTargetBayRefs = Array.from(targetSet);
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
                resolvedBayRenderItems.push({
                    bayRef,
                    parsedBayRef,
                    bayEntries,
                    layerMaterialSpec
                });
            }
            if (!resolvedBayRenderItems.length) continue;

            const endpointAssignmentsByKey = new Map();
            const pushEndpointAssignment = ({ endpointKey, bayRef, faceId, segmentIndex }) => {
                if (!endpointKey) return;
                const bucket = endpointAssignmentsByKey.get(endpointKey) ?? [];
                bucket.push({
                    compatibilityId,
                    bayRef,
                    faceId,
                    segmentIndex: Math.max(0, Math.floor(Number(segmentIndex) || 0))
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
                    pushEndpointAssignment({ endpointKey: startKey, bayRef, faceId, segmentIndex });
                    pushEndpointAssignment({ endpointKey: endKey, bayRef, faceId, segmentIndex });
                }
            }
            const resolveEdgeCompatibility = ({ bayRef, faceId, segmentIndex, endpointKey }) => {
                const out = { any: false, corner: false, sameFace: false };
                const candidates = Array.isArray(endpointAssignmentsByKey.get(endpointKey))
                    ? endpointAssignmentsByKey.get(endpointKey)
                    : [];
                for (const candidate of candidates) {
                    if (!candidate || candidate.compatibilityId !== compatibilityId) continue;
                    const sameSegment = candidate.bayRef === bayRef && Number(candidate.segmentIndex) === Number(segmentIndex);
                    if (sameSegment) continue;
                    out.any = true;
                    if (candidate.faceId === faceId) out.sameFace = true;
                    else out.corner = true;
                    if (out.corner && out.sameFace) break;
                }
                return out;
            };

            const renderItems = [];
            for (const bayRenderItem of resolvedBayRenderItems) {
                const bayRef = bayRenderItem.bayRef;
                const parsedBayRef = bayRenderItem.parsedBayRef;
                const layerMaterialSpec = bayRenderItem.layerMaterialSpec;
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
                    renderItems.push({
                        bayRef,
                        faceId: parsedBayRef.faceId,
                        layerMaterialSpec,
                        segment: bayEntry,
                        spanStart: minSpan,
                        spanEnd: maxSpan,
                        cornerStart: startEdgeCompatibility.corner || cornerStartMeta,
                        cornerEnd: endEdgeCompatibility.corner || cornerEndMeta,
                        hasAnyStart: startEdgeCompatibility.any || cornerStartMeta,
                        hasAnyEnd: endEdgeCompatibility.any || cornerEndMeta,
                        cornerStartStyle,
                        cornerEndStyle,
                        derivedSurface: null,
                        runIndex: resolveSurfaceRunIndex(parsedBayRef.faceId, startKey, endKey)
                    });
                }
            }

            appendDerivedSurfaceRenderItems(renderItems, {
                inheritOnDerivedSurfaces,
                isBandFamily: decorationIsBandFamily,
                surfaceRunsByFaceId
            });

            for (const renderItem of renderItems) {
                const bayRef = renderItem.bayRef;
                const layerMaterialSpec = renderItem.layerMaterialSpec;
                const bayEntry = renderItem.segment;
                const itemSpanStart = renderItem.spanStart;
                const itemSpanEnd = renderItem.spanEnd;
                const cornerStartStyle = renderItem.cornerStartStyle;
                const cornerEndStyle = renderItem.cornerEndStyle;
                const cornerStart = renderItem.cornerStart;
                const cornerEnd = renderItem.cornerEnd;
                // A derived joint (recess return meeting a front plane) butts
                // like an exterior corner — extend and drop the cap — but it
                // must not switch the decorator into corner mode, which would
                // emit a second, competing return.
                const joinStart = renderItem.joinStart === true;
                const joinEnd = renderItem.joinEnd === true;
                const extendStart = cornerStart || joinStart;
                const extendEnd = cornerEnd || joinEnd;
                const hasAnyStart = renderItem.hasAnyStart || joinStart;
                const hasAnyEnd = renderItem.hasAnyEnd || joinEnd;
                const useCornerMode = cornerStart || cornerEnd;
                const reverseForCornerStart = cornerStart && !cornerEnd;
                const activeCornerStyle = useCornerMode
                    ? ((cornerStart && cornerStartStyle === 'interior') || (cornerEnd && cornerEndStyle === 'interior')
                        ? 'interior'
                        : (reverseForCornerStart ? cornerStartStyle : cornerEndStyle))
                    : 'exterior';
                const isInteriorCorner = useCornerMode && activeCornerStyle === 'interior';

                const wallStartCanonical = new THREE.Vector3(Number(bayEntry.x0) || 0.0, 0.0, Number(bayEntry.z0) || 0.0);
                const wallEndCanonical = new THREE.Vector3(Number(bayEntry.x1) || 0.0, 0.0, Number(bayEntry.z1) || 0.0);
                const frontTangentCanonical = wallEndCanonical.clone().sub(wallStartCanonical);
                const bayLength = frontTangentCanonical.length();
                if (!(bayLength > EPS)) continue;
                frontTangentCanonical.multiplyScalar(1.0 / bayLength);
                const spanStartMeters = bayLength * itemSpanStart;
                const spanEndMeters = bayLength * itemSpanEnd;
                if (!(spanEndMeters > spanStartMeters + EPS)) continue;
                const spanMeters = spanEndMeters - spanStartMeters;
                const segmentStartCanonical = wallStartCanonical.clone().addScaledVector(frontTangentCanonical, spanStartMeters);
                const segmentEndCanonical = wallStartCanonical.clone().addScaledVector(frontTangentCanonical, spanEndMeters);

                // Use the resolved bay segment normal from facade frame data.
                // This is the same deterministic outward normal used to place wall runs,
                // and avoids face-id assumptions that can flip orientation on transformed/derived segments.
                const frontNormal = new THREE.Vector3(Number(bayEntry?.nx) || 0.0, 0.0, Number(bayEntry?.nz) || 0.0);
                if (frontNormal.lengthSq() <= EPS) {
                    const faceNormal = getFaceNormalVector(renderItem.faceId);
                    if (!faceNormal || faceNormal.lengthSq() <= EPS) continue;
                    frontNormal.copy(faceNormal);
                }
                frontNormal.normalize();

                const capConnectedStart = reverseForCornerStart ? hasAnyEnd : hasAnyStart;
                const capConnectedEnd = reverseForCornerStart ? hasAnyStart : hasAnyEnd;

                for (const floorSeg of floorSegments) {
                    const startY = Number(floorSeg?.startY);
                    const endY = Number(floorSeg?.endY);
                    if (!Number.isFinite(startY) || !Number.isFinite(endY) || !(endY > startY + EPS)) continue;
                    const wallHeight = endY - startY;
                    const wallCenterY = (startY + endY) * 0.5;
                    const wallDepth = WALL_DECORATION_DEFAULT_WALL_DEPTH_M;
                    const stateForBay = sanitizeWallDecoratorDebuggerState({
                        ...safeState,
                        mode: useCornerMode ? 'corner' : 'face'
                    });
                    const stateForFace = sanitizeWallDecoratorDebuggerState({
                        ...safeState,
                        mode: 'face'
                    });
                    const wallSpecForDecorator = {
                        widthMeters: spanMeters,
                        heightMeters: wallHeight,
                        depthMeters: wallDepth
                    };
                    const faceSpecs = buildWallDecoratorShapeSpecs(stateForFace, wallSpecForDecorator);
                    const canUseFlatCapFamily = hasFlatCapFamilyFrontSpecs(faceSpecs);
                    // The flat-cap family bridges a corner by extending the
                    // band and dropping its cap, so it never needs the
                    // segment reversed to put the corner at the local end —
                    // it renders canonically, exactly as the authoring path
                    // (BuildingFabrication2Scene) does.
                    const reverseSegment = reverseForCornerStart && !canUseFlatCapFamily;
                    const renderSegmentStart = reverseSegment ? segmentEndCanonical : segmentStartCanonical;
                    const renderSegmentEnd = reverseSegment ? segmentStartCanonical : segmentEndCanonical;
                    const renderFrontTangent = reverseSegment
                        ? frontTangentCanonical.clone().multiplyScalar(-1.0)
                        : frontTangentCanonical;
                    const specsRaw = canUseFlatCapFamily
                        ? adjustFlatCapFamilyFrontSpecsForEdges(faceSpecs, {
                            offsetMeters: resolveFlatCapFamilyFrontOffsetMeters(faceSpecs, 0.05),
                            extendStart,
                            extendEnd,
                            hideStartCap: hasAnyStart,
                            hideEndCap: hasAnyEnd
                        })
                        : buildWallDecoratorShapeSpecs(stateForBay, wallSpecForDecorator);
                    if (!Array.isArray(specsRaw) || !specsRaw.length) continue;

                    const specs = [];
                    for (const spec of specsRaw) {
                        if (!canUseFlatCapFamily) {
                            const specFace = String(spec?.faceId ?? '').trim().toLowerCase();
                            const geometryKind = String(spec?.geometryKind ?? '').trim().toLowerCase();
                            if (specFace === 'front' && geometryKind === 'flat_panel_side_cap') {
                                const yawDegrees = clamp(
                                    Number.isFinite(Number(spec?.yawDegrees)) ? Number(spec.yawDegrees) : 0.0,
                                    -180.0,
                                    180.0
                                );
                                const isStartCap = Math.abs(Math.abs(yawDegrees) - 180.0) <= 1e-4;
                                if ((isStartCap && capConnectedStart) || (!isStartCap && capConnectedEnd)) continue;
                            }
                        }
                        specs.push(spec);
                    }
                    if (!specs.length) continue;

                    const wallStart = renderSegmentStart.clone();
                    const wallEnd = renderSegmentEnd.clone();
                    const wallCenter = wallStart.clone().add(wallEnd).multiplyScalar(0.5);
                    for (const specRaw of specs) {
                        const specFace = String(specRaw?.faceId ?? '').trim().toLowerCase() === 'right' ? 'right' : 'front';
                        const rightCornerEdge = String(specRaw?.__bf2CornerEdge ?? '').trim().toLowerCase() === 'start'
                            ? 'start'
                            : 'end';
                        const rightCornerStyle = String(specRaw?.__bf2CornerStyle ?? '').trim().toLowerCase() === 'interior'
                            ? 'interior'
                            : (isInteriorCorner ? 'interior' : 'exterior');
                        const frontUAxis = renderFrontTangent.clone();
                        const frontNAxis = frontNormal.clone();
                        const rightUAxis = frontNormal.clone().multiplyScalar(-1.0);
                        const rightNAxisBase = renderFrontTangent.clone().multiplyScalar(rightCornerStyle === 'interior' ? -1.0 : 1.0);
                        const rightNAxis = rightCornerEdge === 'start'
                            ? rightNAxisBase.clone().multiplyScalar(-1.0)
                            : rightNAxisBase;
                        // A reversed segment asks for a U axis that would make
                        // (U, up, N) a reflection; the shared placement mirrors
                        // the spec instead so the rotation stays proper.
                        const placement = resolveWallDecoratorSurfacePlacement({
                            spec: specRaw,
                            uAxis: specFace === 'right' ? rightUAxis : frontUAxis,
                            nAxis: specFace === 'right' ? rightNAxis : frontNAxis,
                            up
                        });
                        if (!placement) continue;
                        const { quaternion, uAxis: logicalUAxis, nAxis, spec } = placement;

                        const built = createWallDecorationGeometryFromSpec(spec);
                        const geometry = built?.geometry?.isBufferGeometry ? built.geometry : null;
                        if (!geometry) continue;
                        const geometryKind = String(built?.geometryKind ?? spec?.geometryKind ?? '').trim().toLowerCase();

                        const enforceFrontOutward = specFace === 'front'
                            && (geometryKind === 'flat_panel' || geometryKind === 'angled_support_profile' || geometryKind === 'awning_front_quad');
                        if (enforceFrontOutward) {
                            const normalDot = computeGeometryFirstTriangleNormalDotAxis(geometry, quaternion, nAxis);
                            if (normalDot < 0.0) flipGeometryWinding(geometry);
                        }
                        if (geometryKind === 'awning_slanted_plane') {
                            const normalDotUp = computeGeometryFirstTriangleNormalDotAxis(geometry, quaternion, up);
                            if (normalDotUp < 0.0) flipGeometryWinding(geometry);
                        }
                        if (geometryKind === 'flat_panel_side_cap') {
                            const yawDegrees = clamp(
                                Number.isFinite(Number(spec?.yawDegrees)) ? Number(spec.yawDegrees) : 0.0,
                                -180.0,
                                180.0
                            );
                            const isStartCap = Math.abs(Math.abs(yawDegrees) - 180.0) <= 1e-4;
                            const expectedU = isStartCap ? -1.0 : 1.0;
                            const normalDotU = computeGeometryFirstTriangleNormalDotAxis(geometry, quaternion, logicalUAxis);
                            if ((normalDotU * expectedU) < 0.0) flipGeometryWinding(geometry);
                        }
                        if (geometryKind === 'flat_panel_cap') {
                            const capSide = String(spec?.capSide ?? '').trim().toLowerCase() === 'bottom' ? 'bottom' : 'top';
                            const expectedUp = capSide === 'bottom' ? -1.0 : 1.0;
                            const normalDotUp = computeGeometryFirstTriangleNormalDotAxis(geometry, quaternion, up);
                            if ((normalDotUp * expectedUp) < 0.0) flipGeometryWinding(geometry);
                        }

                        const centerU = Number(spec?.centerU) || 0.0;
                        const centerV = Number(spec?.centerV) || 0.0;
                        const outsetMeters = Math.max(0.0, Number(spec?.outsetMeters ?? spec?.surfaceOffsetMeters) || 0.0);
                        const placementDepthMeters = Math.max(0.0, Number(built?.placementDepthMeters) || 0.0);
                        const anchor = specFace === 'right'
                            ? (rightCornerEdge === 'start' ? wallStart : wallEnd)
                            : wallCenter;

                        const material = resolveWallDecorationMaterial({
                            safeState: stateForBay,
                            layerMaterialSpec,
                            surfaceSizeMeters: {
                                x: clamp(
                                    Number.isFinite(Number(built?.surfaceWidthMeters)) ? Number(built.surfaceWidthMeters) : (Number(spec?.widthMeters) || 1.0),
                                    0.01,
                                    256.0
                                ),
                                y: clamp(
                                    Number.isFinite(Number(built?.surfaceHeightMeters)) ? Number(built.surfaceHeightMeters) : (Number(spec?.heightMeters) || 0.2),
                                    0.01,
                                    256.0
                                )
                            },
                            geometryKind
                        });
                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.name = `building_wall_decoration_${String(spec?.role ?? 'mesh')}`;
                        mesh.position.copy(anchor);
                        mesh.position.addScaledVector(logicalUAxis, centerU);
                        mesh.position.addScaledVector(up, wallCenterY + centerV);
                        mesh.position.addScaledVector(nAxis, outsetMeters + placementDepthMeters * 0.5);
                        mesh.quaternion.copy(quaternion);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.userData = mesh.userData ?? {};
                        mesh.userData.buildingFab2Role = 'wall_decoration';
                        mesh.userData.decorationKey = decorationKey;
                        mesh.userData.decorationCompatibilityId = compatibilityId;
                        mesh.userData.faceId = specFace;
                        mesh.userData.role = String(spec?.role ?? 'decorator');
                        mesh.userData.geometryKind = geometryKind || 'unknown';
                        mesh.userData.layerId = layerId;
                        mesh.userData.bayRef = bayRef;
                        if (renderItem.derivedSurface) mesh.userData.derivedSurface = renderItem.derivedSurface;
                        createdMeshes.push(mesh);
                    }
                }
            }
        }
    }
    return createdMeshes;
}

function appendLoopLinePositions(dst, loops, y) {
    for (const loop of loops ?? []) {
        if (!loop || loop.length < 2) continue;
        for (let i = 0; i < loop.length; i++) {
            const a = loop[i];
            const b = loop[(i + 1) % loop.length];
            const curve = resolveFootprintArcRun(a, b, a?.arc);
            if (!curve) {
                dst.push(a.x, y, a.z, b.x, y, b.z);
                continue;
            }
            let previous = sampleResolvedFootprintArc(curve, 0);
            for (let sampleIndex = 1; sampleIndex <= curve.segments; sampleIndex++) {
                const next = sampleResolvedFootprintArc(curve, curve.length * (sampleIndex / curve.segments));
                if (previous && next) dst.push(previous.x, y, previous.z, next.x, y, next.z);
                previous = next;
            }
        }
    }
}

function appendWirePositions(dst, geometry, yShift) {
    if (!geometry) return;
    const arr = geometry.attributes?.position?.array;
    if (!arr) return;
    const shift = Number(yShift) || 0;
    for (let i = 0; i < arr.length; i += 3) {
        dst.push(arr[i], arr[i + 1] + shift, arr[i + 2]);
    }
}

function appendWirePositionsTransformed(dst, geometry, matrix) {
    if (!geometry || !matrix) return;
    const arr = geometry.attributes?.position?.array;
    if (!arr) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
        v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(matrix);
        dst.push(v.x, v.y, v.z);
    }
}

function pointsEqualXZ(a, b, tol = 1e-6) {
    if (!a || !b) return false;
    return Math.abs(a.x - b.x) <= tol && Math.abs(a.z - b.z) <= tol;
}

function appendPointIfChanged(points, p, tol = 1e-6) {
    const list = Array.isArray(points) ? points : null;
    if (!list || !p) return;
    const last = list[list.length - 1] ?? null;
    if (last && pointsEqualXZ(last, p, tol)) return;
    list.push(p);
}

function simplifyOpenPolylineConsecutiveCollinearXZ(points, tol = 1e-5) {
    const source = Array.isArray(points) ? points : [];
    const clean = [];
    for (const point of source) appendPointIfChanged(clean, point, tol);
    if (clean.length < 3) return clean;

    const out = [clean[0]];
    for (let index = 1; index < clean.length - 1; index += 1) {
        const previous = out[out.length - 1];
        const current = clean[index];
        const next = clean[index + 1];
        const ax = current.x - previous.x;
        const az = current.z - previous.z;
        const bx = next.x - current.x;
        const bz = next.z - current.z;
        const aLength = Math.hypot(ax, az);
        const bLength = Math.hypot(bx, bz);
        if (aLength > tol && bLength > tol) {
            const cross = Math.abs(ax * bz - az * bx) / (aLength * bLength);
            const dot = (ax * bx + az * bz) / (aLength * bLength);
            if (cross <= tol && dot > 0.9999) continue;
        }
        out.push(current);
    }
    out.push(clean[clean.length - 1]);
    return out;
}

function buildOpenPolylineStripLoopXZ(points, widthMeters, { miterLimit = 4 } = {}) {
    const path = simplifyOpenPolylineConsecutiveCollinearXZ(points);
    const half = Math.max(0.001, Number(widthMeters) || 0.001) * 0.5;
    if (path.length < 2) return null;

    const segments = [];
    for (let index = 0; index < path.length - 1; index += 1) {
        const a = path[index];
        const b = path[index + 1];
        const direction = normalize2({ x: b.x - a.x, z: b.z - a.z });
        if (!(direction.len > EPS)) continue;
        segments.push({
            a,
            b,
            t: { x: direction.x, z: direction.z },
            n: { x: -direction.z, z: direction.x }
        });
    }
    if (segments.length < 1) return null;

    const offsetSide = (sign) => {
        const side = [];
        const first = segments[0];
        side.push({
            x: first.a.x + first.n.x * half * sign,
            z: first.a.z + first.n.z * half * sign
        });
        for (let index = 1; index < path.length - 1; index += 1) {
            const previous = segments[index - 1];
            const next = segments[index];
            const vertex = path[index];
            const previousOffset = {
                x: vertex.x + previous.n.x * half * sign,
                z: vertex.z + previous.n.z * half * sign
            };
            const nextOffset = {
                x: vertex.x + next.n.x * half * sign,
                z: vertex.z + next.n.z * half * sign
            };
            const join = intersectLines2(previousOffset, previous.t, nextOffset, next.t);
            if (join && Math.hypot(join.x - vertex.x, join.z - vertex.z) <= half * Math.max(1, miterLimit)) {
                side.push({ x: join.x, z: join.z });
            } else {
                appendPointIfChanged(side, previousOffset);
                appendPointIfChanged(side, nextOffset);
            }
        }
        const last = segments[segments.length - 1];
        side.push({
            x: last.b.x + last.n.x * half * sign,
            z: last.b.z + last.n.z * half * sign
        });
        return side;
    };

    const left = offsetSide(1);
    const right = offsetSide(-1).reverse();
    const loop = [];
    for (const point of [...left, ...right]) appendPointIfChanged(loop, point);
    if (loop.length > 2 && pointsEqualXZ(loop[0], loop[loop.length - 1])) loop.pop();
    return loop.length >= 3 ? loop : null;
}

function isSimplePlanLoopXZ(loop, tolerance = 1e-6) {
    const points = Array.isArray(loop) ? loop : [];
    if (points.length < 3 || Math.abs(signedArea(points)) <= tolerance) return false;
    const orient = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const onSegment = (a, b, point) => (
        point.x >= Math.min(a.x, b.x) - tolerance
        && point.x <= Math.max(a.x, b.x) + tolerance
        && point.z >= Math.min(a.z, b.z) - tolerance
        && point.z <= Math.max(a.z, b.z) + tolerance
    );
    const segmentsIntersect = (a, b, c, d) => {
        const abC = orient(a, b, c);
        const abD = orient(a, b, d);
        const cdA = orient(c, d, a);
        const cdB = orient(c, d, b);
        if (((abC > tolerance && abD < -tolerance) || (abC < -tolerance && abD > tolerance))
            && ((cdA > tolerance && cdB < -tolerance) || (cdA < -tolerance && cdB > tolerance))) return true;
        if (Math.abs(abC) <= tolerance && onSegment(a, b, c)) return true;
        if (Math.abs(abD) <= tolerance && onSegment(a, b, d)) return true;
        if (Math.abs(cdA) <= tolerance && onSegment(c, d, a)) return true;
        if (Math.abs(cdB) <= tolerance && onSegment(c, d, b)) return true;
        return false;
    };

    for (let i = 0; i < points.length; i += 1) {
        const iNext = (i + 1) % points.length;
        if (pointsEqualXZ(points[i], points[iNext], tolerance)) return false;
        for (let j = i + 1; j < points.length; j += 1) {
            const jNext = (j + 1) % points.length;
            if (i === j || iNext === j || jNext === i) continue;
            if (i === 0 && jNext === 0) continue;
            if (segmentsIntersect(points[i], points[iNext], points[j], points[jNext])) return false;
        }
    }
    return true;
}

function makePlanExtrusionGeometryXZ(loop, height, { downward = false } = {}) {
    const source = simplifyLoopConsecutiveCollinearXZ(loop);
    if (!Array.isArray(source) || source.length < 3 || !(height > EPS)) return null;
    const planLoop = signedArea(source) < 0 ? source.slice().reverse() : source.slice();
    const shape = buildShapeFromLoops({ outerLoop: planLoop, holeLoops: [] });
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    if (downward) geometry.translate(0, -height, 0);
    geometry.computeVertexNormals();
    return geometry;
}

function balconyContinuityCandidateKey(faceId, bayId) {
    const face = typeof faceId === 'string' ? faceId : '';
    const bay = typeof bayId === 'string' ? bayId : '';
    return JSON.stringify([face, bay]);
}

function balconyContinuityEdgeU(candidate, edge) {
    return edge === 'end' ? candidate.u1 : candidate.u0;
}

function balconyContinuityEdgePoint(candidate, edge, depth) {
    return pointOnFacadeFrame({
        frame: candidate.frame,
        u: balconyContinuityEdgeU(candidate, edge),
        depth
    });
}

/**
 * Pairwise topology gate for AI 537. Endpoints are already expressed in the
 * solved physical face's local-u, so linked-face reversal is deliberately not
 * repeated here. The link must either join touching bays on one straight run,
 * or the physical loop end of one straight face to the next face's loop start.
 */
function resolveBalconyContinuityAdjacency({
    aEndpoint,
    aCandidate,
    bEndpoint,
    bCandidate,
    frames,
    boundaryTransitions = null,
    toleranceMeters = 0.04
}) {
    const tol = Math.max(1e-4, Number(toleranceMeters) || 0.04);
    if (!aCandidate || !bCandidate || aCandidate.key === bCandidate.key) {
        return { valid: false, reason: 'must target two different balcony bays' };
    }
    const roundedTransition = (Array.isArray(boundaryTransitions) ? boundaryTransitions : []).find((transition) => {
        const startStrip = transition?.startEndpoint?.strip ?? null;
        const endStrip = transition?.endEndpoint?.strip ?? null;
        return (startStrip === aCandidate.strip && endStrip === bCandidate.strip)
            || (startStrip === bCandidate.strip && endStrip === aCandidate.strip);
    }) ?? null;
    if (roundedTransition) {
        return {
            valid: true,
            kind: 'rounded_boundary',
            firstKey: roundedTransition.startEndpoint.strip === aCandidate.strip ? aCandidate.key : bCandidate.key,
            secondKey: roundedTransition.endEndpoint.strip === bCandidate.strip ? bCandidate.key : aCandidate.key,
            facet: null,
            nonCollinear: true,
            transition: roundedTransition
        };
    }
    if (aCandidate.frame?.curve || bCandidate.frame?.curve) {
        return { valid: false, reason: 'curved facade runs are not supported yet' };
    }

    const aEdge = aEndpoint?.edge;
    const bEdge = bEndpoint?.edge;
    const aU = balconyContinuityEdgeU(aCandidate, aEdge);
    const bU = balconyContinuityEdgeU(bCandidate, bEdge);
    if (aCandidate.faceId === bCandidate.faceId) {
        const ordered = (aEdge === 'end' && bEdge === 'start' && Math.abs(aCandidate.u1 - bCandidate.u0) <= tol)
            || (bEdge === 'end' && aEdge === 'start' && Math.abs(bCandidate.u1 - aCandidate.u0) <= tol);
        if (!ordered || Math.abs(aU - bU) > tol) {
            return { valid: false, reason: 'same-face endpoints are not adjacent bay edges' };
        }
        if (Math.abs(aCandidate.stripDepth - bCandidate.stripDepth) > 1e-4) {
            return { valid: false, reason: 'same-face balcony bays have incompatible facade depths' };
        }
        return {
            valid: true,
            kind: 'same_run',
            firstKey: aEdge === 'end' ? aCandidate.key : bCandidate.key,
            secondKey: aEdge === 'end' ? bCandidate.key : aCandidate.key,
            facet: null,
            nonCollinear: false
        };
    }

    const order = facadeFaceIdsOf(frames);
    const aIndex = order.indexOf(aCandidate.faceId);
    const bIndex = order.indexOf(bCandidate.faceId);
    if (aIndex < 0 || bIndex < 0) return { valid: false, reason: 'targets an unresolved facade face' };

    let firstCandidate = null;
    let firstEndpoint = null;
    let secondCandidate = null;
    let secondEndpoint = null;
    if (order[(aIndex + 1) % order.length] === bCandidate.faceId) {
        firstCandidate = aCandidate;
        firstEndpoint = aEndpoint;
        secondCandidate = bCandidate;
        secondEndpoint = bEndpoint;
    } else if (order[(bIndex + 1) % order.length] === aCandidate.faceId) {
        firstCandidate = bCandidate;
        firstEndpoint = bEndpoint;
        secondCandidate = aCandidate;
        secondEndpoint = aEndpoint;
    } else {
        return { valid: false, reason: 'targets non-adjacent facade faces' };
    }

    const firstBoundaryU = facadeFrameLoopEndU(firstCandidate.frame);
    const secondBoundaryU = facadeFrameLoopStartU(secondCandidate.frame);
    const firstU = balconyContinuityEdgeU(firstCandidate, firstEndpoint.edge);
    const secondU = balconyContinuityEdgeU(secondCandidate, secondEndpoint.edge);
    if (Math.abs(firstU - firstBoundaryU) > tol || Math.abs(secondU - secondBoundaryU) > tol) {
        return { valid: false, reason: 'cross-face endpoints do not reach their shared physical corner' };
    }

    const collinear = framesContinueCollinearly(firstCandidate.frame, secondCandidate.frame);
    const firstT = facadeFrameLoopEndT(firstCandidate.frame);
    const secondN = facadeFrameLoopStartN(secondCandidate.frame);
    if (!collinear && (!firstT || !secondN || dot2(firstT, secondN) <= 1e-5)) {
        return { valid: false, reason: 'concave or re-entrant balcony corners are not supported yet' };
    }

    const cornerId = `${firstCandidate.faceId}${secondCandidate.faceId}`;
    return {
        valid: true,
        kind: 'corner',
        firstKey: firstCandidate.key,
        secondKey: secondCandidate.key,
        facet: frames?.cornerFacets?.[cornerId] ?? null,
        nonCollinear: !collinear
    };
}

function orderBalconyContinuityComponent(links) {
    const source = Array.isArray(links) ? links : [];
    const byCandidate = new Map();
    for (const link of source) {
        for (let endpointIndex = 0; endpointIndex < 2; endpointIndex += 1) {
            const endpoint = link?.endpoints?.[endpointIndex] ?? null;
            const key = endpoint?.candidate?.key ?? '';
            if (!key) continue;
            if (!byCandidate.has(key)) byCandidate.set(key, []);
            byCandidate.get(key).push({ link, endpointIndex });
        }
    }
    if (byCandidate.size < 2 || source.length !== byCandidate.size - 1) {
        return { valid: false, reason: 'closed or branching continuity components are not supported yet' };
    }
    for (const entries of byCandidate.values()) {
        if (entries.length < 1 || entries.length > 2) {
            return { valid: false, reason: 'a balcony bay may continue through at most its two distinct edges' };
        }
    }

    const starts = [...byCandidate.entries()]
        .filter(([, entries]) => entries.length === 1)
        .map(([key]) => key)
        .sort();
    if (starts.length !== 2) return { valid: false, reason: 'continuity component must be an open chain' };

    const ordered = [];
    const orderedLinks = [];
    const seenCandidates = new Set();
    let currentKey = starts[0];
    let incomingLink = null;
    let guard = 0;
    while (currentKey && guard <= byCandidate.size) {
        guard += 1;
        if (seenCandidates.has(currentKey)) return { valid: false, reason: 'continuity component contains a cycle' };
        seenCandidates.add(currentKey);
        const entries = byCandidate.get(currentKey) ?? [];
        const incomingEntry = incomingLink ? entries.find((entry) => entry.link === incomingLink) : null;
        const outgoingEntry = entries.find((entry) => entry.link !== incomingLink) ?? null;
        const orientationEdge = incomingEntry
            ? incomingEntry.link.endpoints[incomingEntry.endpointIndex].edge
            : outgoingEntry?.link.endpoints[outgoingEntry.endpointIndex]?.edge;
        const forward = incomingEntry ? orientationEdge === 'start' : orientationEdge === 'end';
        const candidate = (incomingEntry ?? outgoingEntry)?.link.endpoints[(incomingEntry ?? outgoingEntry).endpointIndex]?.candidate ?? null;
        if (!candidate) return { valid: false, reason: 'continuity component lost a resolved balcony bay' };
        const exitEdge = forward ? 'end' : 'start';
        if (outgoingEntry && outgoingEntry.link.endpoints[outgoingEntry.endpointIndex]?.edge !== exitEdge) {
            return { valid: false, reason: 'continuity links reuse the same side of a balcony bay' };
        }
        ordered.push({ candidate, forward });
        if (!outgoingEntry) break;
        orderedLinks.push(outgoingEntry.link);
        const nextIndex = outgoingEntry.endpointIndex === 0 ? 1 : 0;
        currentKey = outgoingEntry.link.endpoints[nextIndex]?.candidate?.key ?? '';
        incomingLink = outgoingEntry.link;
    }
    if (ordered.length !== byCandidate.size || orderedLinks.length !== source.length) {
        return { valid: false, reason: 'continuity component is disconnected' };
    }
    return { valid: true, ordered, links: orderedLinks };
}

function balconyContinuityJoinPair({ current, next, link, depthOf }) {
    const currentEntry = link.endpoints.find((endpoint) => endpoint.candidate.key === current.candidate.key);
    const nextEntry = link.endpoints.find((endpoint) => endpoint.candidate.key === next.candidate.key);
    if (!currentEntry || !nextEntry) return null;
    if (link.relation.kind === 'rounded_boundary') {
        const transition = link.relation.transition;
        const forward = transition.startEndpoint.strip === current.candidate.strip;
        const sourceSamples = forward ? transition.samples : transition.samples.slice().reverse();
        const points = sourceSamples.map((sample) => {
            const ownerIsStart = sample.owner === 'left';
            const ownerStrip = ownerIsStart ? transition.startEndpoint.strip : transition.endEndpoint.strip;
            const ownerStation = ownerIsStart ? transition.startStation : transition.endStation;
            const ownerCandidate = ownerStrip === current.candidate.strip ? current.candidate : next.candidate;
            const offset = depthOf(ownerCandidate) - ownerStation.depth;
            return {
                x: qf(sample.x + sample.normal.x * offset),
                y: 0,
                z: qf(sample.z + sample.normal.z * offset)
            };
        });
        return {
            current: points[0],
            next: points[points.length - 1],
            between: points.slice(1, -1)
        };
    }
    if (link.relation.kind === 'same_run') {
        return {
            current: balconyContinuityEdgePoint(current.candidate, currentEntry.edge, depthOf(current.candidate)),
            next: balconyContinuityEdgePoint(next.candidate, nextEntry.edge, depthOf(next.candidate))
        };
    }

    const first = link.relation.firstKey === current.candidate.key ? current.candidate : next.candidate;
    const second = link.relation.secondKey === current.candidate.key ? current.candidate : next.candidate;
    const pair = cornerJoinPairWithDepths(
        first.frame,
        depthOf(first),
        second.frame,
        depthOf(second),
        link.relation.facet
    );
    return current.candidate.key === link.relation.firstKey
        ? { current: pair.aEnd, next: pair.bStart }
        : { current: pair.bStart, next: pair.aEnd };
}

function buildBalconyContinuityDepthPath({ ordered, links, depthOf }) {
    if (!Array.isArray(ordered) || !ordered.length) return null;
    const points = [];
    const joins = [];
    const first = ordered[0];
    appendPointIfChanged(points, balconyContinuityEdgePoint(first.candidate, first.forward ? 'start' : 'end', depthOf(first.candidate)));
    for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        const pair = balconyContinuityJoinPair({ current: ordered[index], next: ordered[index + 1], link, depthOf });
        if (!pair) return null;
        appendPointIfChanged(points, pair.current);
        for (const point of pair.between ?? []) appendPointIfChanged(points, point);
        appendPointIfChanged(points, pair.next);
        joins.push({
            link,
            nonCollinear: !!link.relation.nonCollinear,
            point: {
                x: qf((pair.current.x + pair.next.x) * 0.5),
                z: qf((pair.current.z + pair.next.z) * 0.5)
            }
        });
    }
    const last = ordered[ordered.length - 1];
    appendPointIfChanged(points, balconyContinuityEdgePoint(last.candidate, last.forward ? 'end' : 'start', depthOf(last.candidate)));
    return { points: simplifyOpenPolylineConsecutiveCollinearXZ(points), joins };
}
function simplifyLoopConsecutiveCollinearXZ(loop, {
    tol = 1e-4,
    minEdge = 1e-3,
    maxPasses = 6
} = {}) {
    const pts = Array.isArray(loop) ? loop : [];
    if (pts.length < 4) return loop;

    const base = [];
    for (const p of pts) appendPointIfChanged(base, p, tol);
    if (base.length < 4) return loop;

    if (pointsEqualXZ(base[0], base[base.length - 1], tol)) base.pop();

    let cur = base;
    for (let pass = 0; pass < maxPasses; pass++) {
        const n = cur.length;
        if (n < 4) break;

        const next = [];
        let changed = false;

        for (let i = 0; i < n; i++) {
            const prev = cur[(i - 1 + n) % n];
            const curr = cur[i];
            const after = cur[(i + 1) % n];
            if (!prev || !curr || !after) continue;

            const dx0 = curr.x - prev.x;
            const dz0 = curr.z - prev.z;
            const dx1 = after.x - curr.x;
            const dz1 = after.z - curr.z;
            const len0 = Math.hypot(dx0, dz0);
            const len1 = Math.hypot(dx1, dz1);

            if (!(len0 > minEdge) || !(len1 > minEdge)) {
                changed = true;
                continue;
            }

            const vx = after.x - prev.x;
            const vz = after.z - prev.z;
            const vLen = Math.hypot(vx, vz);
            if (vLen > minEdge) {
                const wx = curr.x - prev.x;
                const wz = curr.z - prev.z;
                const dist = Math.abs(vx * wz - vz * wx) / vLen;
                const dot = (dx0 * dx1 + dz0 * dz1) / (len0 * len1);
                if (dist <= tol && dot > 0) {
                    changed = true;
                    continue;
                }
            }

            appendPointIfChanged(next, curr, tol);
        }

        if (next.length >= 2 && pointsEqualXZ(next[0], next[next.length - 1], tol)) {
            next.pop();
            changed = true;
        }

        if (!changed) return next.length >= 4 ? next : cur;
        if (next.length < 4) break;
        cur = next;
    }

    return cur.length >= 4 ? cur : base;
}

function resolveFacadeLayoutItems(facade) {
    const list = Array.isArray(facade?.layout?.items) ? facade.layout.items : [];
    return list.filter((it) => it && typeof it === 'object');
}

function normalizeLayoutWidthFracs(items, { warnings = null, faceId = '' } = {}) {
    const list = Array.isArray(items) ? items : [];
    let sum = 0;
    const fracs = list.map((it) => {
        const next = clamp(it?.widthFrac, 0, 1);
        sum += next;
        return next;
    });

    if (!(sum > EPS)) {
        if (warnings) warnings.push(`${faceId || 'Facade'}: layout has no width (sum=0).`);
        return list.map((_it, idx) => ({ ...list[idx], widthFrac: 1 / Math.max(1, list.length) }));
    }

    if (Math.abs(sum - 1.0) > 1e-3 && warnings) warnings.push(`${faceId || 'Facade'}: layout widths sum to ${sum.toFixed(4)} (expected 1.0).`);
    return list.map((it, idx) => ({ ...it, widthFrac: fracs[idx] / sum }));
}

function resolveFacadeWallMaterialSpec({ layerMaterial, facadeMaterial, bayMaterialOverride }) {
    const bay = bayMaterialOverride && typeof bayMaterialOverride === 'object' ? bayMaterialOverride : null;
    if (bay && (bay.kind === 'texture' || bay.kind === 'color') && typeof bay.id === 'string' && bay.id) return bay;
    const facade = facadeMaterial && typeof facadeMaterial === 'object' ? facadeMaterial : null;
    if (facade && (facade.kind === 'texture' || facade.kind === 'color') && typeof facade.id === 'string' && facade.id) return facade;
    const layer = layerMaterial && typeof layerMaterial === 'object' ? layerMaterial : null;
    if (layer && (layer.kind === 'texture' || layer.kind === 'color') && typeof layer.id === 'string' && layer.id) return layer;
    return null;
}

function pointsEqualUD(a, b, tol = 1e-6) {
    if (!a || !b) return false;
    return Math.abs(a.u - b.u) <= tol && Math.abs(a.depth - b.depth) <= tol;
}

function appendPointIfChangedUD(points, p, tol = 1e-6) {
    const list = Array.isArray(points) ? points : null;
    if (!list || !p) return;
    const last = list[list.length - 1] ?? null;
    if (last && pointsEqualUD(last, p, tol)) return;
    list.push(p);
}

function sampleFacadeFrameAtU(frame, u) {
    const f = frame && typeof frame === 'object' ? frame : null;
    if (!f) return null;
    const distance = clamp(Number(u) || 0, 0, Math.max(0, Number(f.length) || 0));
    const curveSample = f.curve ? sampleResolvedFootprintArc(f.curve, distance) : null;
    if (curveSample) {
        const tangent = curveSample.tangent;
        const normal = f.normalSide === 'left' ? leftNormal2(tangent) : rightNormal2(tangent);
        return {
            x: curveSample.x,
            z: curveSample.z,
            t: { x: tangent.x, z: tangent.z },
            n: { x: normal.x, z: normal.z },
            u: distance
        };
    }
    return {
        x: (Number(f.start?.x) || 0) + (Number(f.t?.x) || 0) * distance,
        z: (Number(f.start?.z) || 0) + (Number(f.t?.z) || 0) * distance,
        t: { x: Number(f.t?.x) || 0, z: Number(f.t?.z) || 0 },
        n: { x: Number(f.n?.x) || 0, z: Number(f.n?.z) || 0 },
        u: distance
    };
}

function pointOnFacadeFrame({ frame, u, depth }) {
    const sample = sampleFacadeFrameAtU(frame, u);
    if (!sample) return { x: 0, y: 0, z: 0 };
    const d = Number(depth) || 0;
    const x = sample.x + sample.n.x * d;
    const z = sample.z + sample.n.z * d;
    return { x: qf(x), y: 0, z: qf(z) };
}

function facadeFrameRunsForward(frame) {
    return frame?.runForward !== false;
}

function facadeFrameLoopStart(frame) {
    return facadeFrameRunsForward(frame) ? frame?.start : frame?.end;
}

function facadeFrameLoopEnd(frame) {
    return facadeFrameRunsForward(frame) ? frame?.end : frame?.start;
}

function facadeFrameLoopStartT(frame) {
    const tangent = facadeFrameRunsForward(frame)
        ? (frame?.startT ?? frame?.t)
        : (frame?.endT ?? frame?.t);
    const sign = facadeFrameRunsForward(frame) ? 1 : -1;
    return tangent ? { x: (Number(tangent.x) || 0) * sign, z: (Number(tangent.z) || 0) * sign } : null;
}

function facadeFrameLoopEndT(frame) {
    const tangent = facadeFrameRunsForward(frame)
        ? (frame?.endT ?? frame?.t)
        : (frame?.startT ?? frame?.t);
    const sign = facadeFrameRunsForward(frame) ? 1 : -1;
    return tangent ? { x: (Number(tangent.x) || 0) * sign, z: (Number(tangent.z) || 0) * sign } : null;
}

function facadeFrameLoopStartN(frame) {
    return facadeFrameRunsForward(frame)
        ? (frame?.startN ?? frame?.n)
        : (frame?.endN ?? frame?.n);
}

function facadeFrameLoopEndN(frame) {
    return facadeFrameRunsForward(frame)
        ? (frame?.endN ?? frame?.n)
        : (frame?.startN ?? frame?.n);
}

function facadeFrameLoopStartU(frame) {
    return facadeFrameRunsForward(frame) ? 0 : Math.max(0, Number(frame?.length) || 0);
}

function facadeFrameLoopEndU(frame) {
    return facadeFrameRunsForward(frame) ? Math.max(0, Number(frame?.length) || 0) : 0;
}

function facadeProfileLoopStartDepth(frame, profile) {
    return facadeFrameRunsForward(frame)
        ? (Number(profile?.startDepth) || 0)
        : (Number(profile?.endDepth) || 0);
}

function facadeProfileLoopEndDepth(frame, profile) {
    return facadeFrameRunsForward(frame)
        ? (Number(profile?.endDepth) || 0)
        : (Number(profile?.startDepth) || 0);
}

function resolveCurvedWindowBend({ frame, point, nx, nz, settings, poseOffset }) {
    const curve = frame?.curve ?? null;
    if (!curve) return null;
    const normalLength = Math.hypot(nx, nz);
    if (!(normalLength > EPS)) throw new Error('Curved window placement requires a valid facade normal.');
    const normalX = nx / normalLength;
    const normalZ = nz / normalLength;
    const pointX = Number(point?.x) || 0;
    const pointZ = Number(point?.z) || 0;
    const centerX = Number(curve?.center?.x);
    const centerZ = Number(curve?.center?.z);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
        throw new Error('Curved window placement requires a resolved footprint arc center.');
    }
    const frameInset = Math.max(0, Number(settings?.frame?.inset) || 0);
    const centerDistance = (centerX - pointX) * normalX + (centerZ - pointZ) * normalZ;
    const bendCenterZ = qf(centerDistance - ((Number(poseOffset) || 0) - frameInset));
    const width = Math.max(0.1, Number(settings?.width) || 0.1);
    return {
        centerZ: bendCenterZ,
        segments: clampInt(Math.ceil(width / 0.3), 4, 24)
    };
}

/**
 * Ordered wall surfaces of each facade face, in plan.
 *
 * A face is a run of `bay`/`padding` fronts joined by the `return` walls the
 * silhouette extrudes wherever two neighbours sit at different depths. Returns
 * are derived geometry (BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC §5.2), so they carry
 * no face id of their own; decorations follow them to stay continuous across a
 * recessed bay (AI 494).
 *
 * Wedge strips are skipped as joint partners: their slanted front already
 * bridges the depth change, so there is no return wall to decorate.
 *
 * @param {object} params
 * @param {Array<object>} params.facadeStrips strips from `computeQuadFacadeSilhouette`
 * @param {object} params.facadeFrames per-face `{start, t, n, length}` frames
 * @param {Array<object>} [params.boundaryTransitions] AI 541 derived curve segments
 * @returns {Record<string, Array<object>> | null}
 */
function buildFacadeSurfaceRunsByFaceId({ facadeStrips, facadeFrames, boundaryTransitions = null }) {
    const strips = Array.isArray(facadeStrips) ? facadeStrips : [];
    if (!strips.length || !facadeFrames) return null;

    const byFaceId = {};
    for (const faceId of facadeFaceIdsOf(facadeFrames)) {
        const frame = facadeFrames?.[faceId] ?? null;
        if (!frame) continue;
        const tx = Number(frame?.t?.x) || 0;
        const tz = Number(frame?.t?.z) || 0;

        const fronts = [];
        for (const strip of strips) {
            if (strip?.faceId !== faceId) continue;
            const u0 = Number(strip?.u0) || 0;
            const u1 = Number(strip?.u1) || 0;
            const frontU0 = Number.isFinite(Number(strip?.frontU0)) ? Number(strip.frontU0) : u0;
            const frontU1 = Number.isFinite(Number(strip?.frontU1)) ? Number(strip.frontU1) : u1;
            if (!(frontU1 > frontU0 + EPS)) continue;
            const depthFallback = Number.isFinite(Number(strip?.depth)) ? Number(strip.depth) : 0;
            const depth0 = Number.isFinite(Number(strip?.depth0)) ? Number(strip.depth0) : depthFallback;
            const depth1 = Number.isFinite(Number(strip?.depth1)) ? Number(strip.depth1) : depthFallback;
            const a = pointOnFacadeFrame({ frame, u: frontU0, depth: depth0 });
            const b = pointOnFacadeFrame({ frame, u: frontU1, depth: depth1 });
            fronts.push({
                kind: 'face',
                faceId,
                bayId: (typeof strip?.sourceBayId === 'string' && strip.sourceBayId)
                    ? strip.sourceBayId
                    : (typeof strip?.id === 'string' ? strip.id : ''),
                isBay: strip?.type === 'bay',
                isWedge: (frontU0 > u0 + EPS) || (frontU1 < u1 - EPS),
                u0: frontU0,
                u1: frontU1,
                depth0,
                depth1,
                x0: Number(a.x) || 0,
                z0: Number(a.z) || 0,
                x1: Number(b.x) || 0,
                z1: Number(b.z) || 0,
                nx: Number(frame?.n?.x) || 0,
                nz: Number(frame?.n?.z) || 0,
                strip
            });
        }
        if (!fronts.length) continue;

        const transitions = Array.isArray(boundaryTransitions) ? boundaryTransitions : [];
        const connectedPairs = new Set();
        const beforeByStrip = new Map();
        const afterByStrip = new Map();
        const addSegments = (map, strip, segments) => {
            if (!strip || !segments.length) return;
            const existing = map.get(strip) ?? [];
            existing.push(...segments);
            map.set(strip, existing);
        };
        for (const transition of transitions) {
            const startStrip = transition?.startEndpoint?.strip ?? null;
            const endStrip = transition?.endEndpoint?.strip ?? null;
            if (startStrip && endStrip) connectedPairs.add(`${startStrip.id}|${endStrip.id}`);
            const toRunSegment = (segment) => ({
                kind: 'transition',
                faceId: segment.ownerFaceId,
                bayId: segment.ownerBayId,
                isBay: true,
                isWedge: false,
                x0: segment.x0,
                z0: segment.z0,
                x1: segment.x1,
                z1: segment.z1,
                nx: segment.nx,
                nz: segment.nz
            });
            const startSegments = (transition.segments ?? [])
                .filter((segment) => segment.ownerFaceId === faceId && segment.ownerStrip === startStrip)
                .map(toRunSegment);
            const endSegments = (transition.segments ?? [])
                .filter((segment) => segment.ownerFaceId === faceId && segment.ownerStrip === endStrip)
                .map(toRunSegment);
            addSegments(afterByStrip, startStrip, startSegments);
            addSegments(beforeByStrip, endStrip, endSegments);
        }

        const run = [];
        for (let i = 0; i < fronts.length; i += 1) {
            const front = fronts[i];
            if (i > 0) {
                const prev = fronts[i - 1];
                const step = front.depth0 - prev.depth1;
                const ownedByTransition = connectedPairs.has(`${prev.strip?.id}|${front.strip?.id}`);
                if (!ownedByTransition && !prev.isWedge && !front.isWedge && Math.abs(step) > 1e-4) {
                    // The return runs from the previous front's depth to the
                    // next one's, at the shared u. Deeper-along-+t means the
                    // return looks back down the tangent.
                    const sign = step < 0 ? 1.0 : -1.0;
                    run.push({
                        kind: 'return',
                        faceId,
                        bayId: '',
                        depth0: prev.depth1,
                        depth1: front.depth0,
                        x0: prev.x1,
                        z0: prev.z1,
                        x1: front.x0,
                        z1: front.z0,
                        nx: tx * sign,
                        nz: tz * sign
                    });
                }
            }
            run.push(...(beforeByStrip.get(front.strip) ?? []));
            run.push(front);
            run.push(...(afterByStrip.get(front.strip) ?? []));
        }
        byFaceId[faceId] = run;
    }

    return Object.keys(byFaceId).length ? byFaceId : null;
}

/**
 * Move a facade opening cutout onto the interior shell plane of its face.
 *
 * The shell is a separate loop set back from the facade, so a cutout authored on
 * the facade plane is too far off it for the wall builder's segment test to
 * match. Sliding it along the face normal to the shell's depth keeps the same
 * opening, in the same place along the wall (AI 495).
 *
 * Every opening is cut, whether or not it has a parallax panel behind its glass.
 * A window is a hole: looking through one you see the room, and if the far wall
 * has an opening on the same line you see out the other side. What must never
 * happen is seeing *through solid wall*, and that is the shell's own opacity to
 * enforce, not something to fake by leaving holes uncut.
 *
 * The hole's size depends on where the opening's frame plane sits (AI 507). A
 * near-flush frame is in front of the shell, so the hole shrinks by the reveal
 * margin and the ring reads as the room's plastered window return behind the
 * glass. A frame inset to or past the shell plane would show that ring IN FRONT
 * of the frame as a pale surround; there the hole grows past the wall cut
 * instead, and the facade's reveal walls (wall material, `revealDepth` on the
 * facade cutout) are what read as the reveal.
 *
 * @param {object} cutout facade cutout (`{faceId, x, y, z, width, height, revealDepth}`)
 * @param {object} params
 * @param {object} params.frames per-face `{start, t, n}` frames
 * @param {(faceId: string) => number} params.shellDepthOf shell depth per face
 */
function projectFacadeCutoutOntoShell(cutout, { frames, shellDepthOf }) {
    const faceId = typeof cutout?.faceId === 'string' ? cutout.faceId : '';
    if (!isFaceId(faceId)) return null;
    const frame = frames?.[faceId] ?? null;
    if (!frame) return null;
    // Bay openings already carry their solved arc-length u. Legacy cutouts do
    // not, so project them through the same facade-frame helper; its curved
    // path resolves angle to arc distance while its straight path is the
    // original tangent dot product.
    const fallbackProjection = projectPointToFacadeFrame({
        frame,
        x: Number(cutout.x) || 0,
        z: Number(cutout.z) || 0
    });
    const authoredU = Number(cutout.u);
    const u = Number.isFinite(authoredU)
        ? clamp(authoredU, 0, Math.max(0, Number(frame.length) || 0))
        : fallbackProjection.u;
    const shellDepth = shellDepthOf(faceId);
    const point = pointOnFacadeFrame({ frame, u, depth: shellDepth });
    const facadeSample = sampleFacadeFrameAtU(frame, u);
    const outerDepth = ((Number(cutout.x) || 0) - (Number(facadeSample?.x) || 0))
        * (Number(facadeSample?.n?.x) || 0)
        + ((Number(cutout.z) || 0) - (Number(facadeSample?.z) || 0))
        * (Number(facadeSample?.n?.z) || 0);
    // AI 510: a portal's visible reveal box may stop at its outermost carved
    // order while the door sits deeper; `shellRevealDepth` carries the true
    // frame-plane depth for the shell decision when the two differ.
    const shellDepthBehindFront = Number.isFinite(Number(cutout.shellRevealDepth))
        ? Math.max(0, Number(cutout.shellRevealDepth))
        : Math.max(0, Number(cutout.revealDepth) || 0);
    const framePlaneDepth = outerDepth - shellDepthBehindFront;
    const frameClearsShell = framePlaneDepth - shellDepth >= FLOOR_INTERIOR_SHELL_INSET_METERS * 0.5;
    const marginPerSide = frameClearsShell ? INTERIOR_SHELL_REVEAL_METERS : -INTERIOR_SHELL_CLEARANCE_METERS;
    const width = Math.max(0.05, (Number(cutout.width) || 0) - marginPerSide * 2);
    const height = Math.max(0.05, (Number(cutout.height) || 0) - marginPerSide * 2);
    // The facade owns the reveal faces; the shell just needs the hole — an
    // inset stack (AI 511) must NOT re-emit its step rings on the shell.
    //
    // Except for an UNBACKED grown-hole case: the facade jamb stops at the frame's
    // FRONT plane, so a grazing sightline through the recess can slip past
    // the frame body, through the grown shell hole, and see the far side of
    // the room (a see-through slit beside a deeply inset door whenever the
    // cut edge sits mid-wall — e.g. a fixed-width opening with padding 0).
    // Lining the grown hole with its own reveal walls, running inward past
    // the frame body, seals that corridor; the lining shares the shell's
    // plaster, which is what a room-side return would be. A backed opening's
    // parallax panel already seals the corridor. Giving it the same lining
    // leaks pale plaster fins past the facade reveal at grazing angles.
    const needsShellLining = !frameClearsShell && !cutout.backed;
    const linedRevealDepth = needsShellLining
        ? clamp((framePlaneDepth - shellDepth) + 0.4, 0.2, 1.2)
        : 0;
    return { ...cutout, x: point.x, z: point.z, u, width, height, revealDepth: linedRevealDepth, insetSteps: null };
}

function cornerJoinPointWithDepths(aFrame, aDepth, bFrame, bDepth, corner) {
    const da = Number(aDepth) || 0;
    const db = Number(bDepth) || 0;
    const c = corner && typeof corner === 'object' ? corner : { x: 0, z: 0 };
    const aEnd = facadeFrameLoopEnd(aFrame) ?? { x: 0, z: 0 };
    const bStart = facadeFrameLoopStart(bFrame) ?? { x: 0, z: 0 };
    const aEndT = facadeFrameLoopEndT(aFrame) ?? { x: 0, z: 0 };
    const bStartT = facadeFrameLoopStartT(bFrame) ?? { x: 0, z: 0 };
    const aEndN = facadeFrameLoopEndN(aFrame) ?? { x: 0, z: 0 };
    const bStartN = facadeFrameLoopStartN(bFrame) ?? { x: 0, z: 0 };

    // Each face's line is anchored on its OWN frame point. On a plan with
    // beveled corners the two faces do not meet at `corner` (it is a fold point
    // on one face only), and offsetting it along the other face's normal used
    // to collapse the mitre onto the fold — which tilted every loop derived
    // from these joins off its face line (AI 501).
    const pa = {
        x: (Number(aEnd.x) || 0) + (Number(aEndN.x) || 0) * da,
        z: (Number(aEnd.z) || 0) + (Number(aEndN.z) || 0) * da
    };
    const pb = {
        x: (Number(bStart.x) || 0) + (Number(bStartN.x) || 0) * db,
        z: (Number(bStart.z) || 0) + (Number(bStartN.z) || 0) * db
    };
    const ia = intersectLines2(pa, aEndT, pb, bStartT);
    const out = ia ?? {
        x: c.x + (Number(aEndN.x) || 0) * da,
        z: c.z + (Number(aEndN.z) || 0) * da
    };
    return { x: qf(out.x), y: 0, z: qf(out.z) };
}

function framesContinueCollinearly(aFrame, bFrame) {
    const aT = facadeFrameLoopEndT(aFrame);
    const bT = facadeFrameLoopStartT(bFrame);
    if (!aT || !bT) return false;
    return Math.abs(cross2(aT, bT)) < 1e-6 && dot2(aT, bT) > 0.999999;
}

/**
 * Corner points for a loop offset to per-face depths, honouring a plan-edge
 * bevel facet. A sharp corner mitres to one shared join point; a beveled
 * corner has no shared point — each face ends on its own fold line and the
 * chamfer facet bridges them, so the offset loop must follow the facet or its
 * mitre pokes through it (AI 501).
 *
 * @returns {{aEnd: {x,y,z}, bStart: {x,y,z}}} equal points when mitred
 */
function cornerJoinPairWithDepths(aFrame, aDepth, bFrame, bDepth, facet) {
    const aEnd = facadeFrameLoopEnd(aFrame) ?? { x: 0, z: 0 };
    const bStart = facadeFrameLoopStart(bFrame) ?? { x: 0, z: 0 };
    const aEndN = facadeFrameLoopEndN(aFrame) ?? { x: 0, z: 0 };
    const bStartN = facadeFrameLoopStartN(bFrame) ?? { x: 0, z: 0 };
    if (!facet && framesContinueCollinearly(aFrame, bFrame)) {
        const da = Number(aDepth) || 0;
        const db = Number(bDepth) || 0;
        const corner = aEnd ?? bStart;
        if (Math.abs(da - db) <= 1e-6) {
            const join = {
                x: qf((Number(corner.x) || 0) + (Number(aEndN.x) || 0) * da),
                y: 0,
                z: qf((Number(corner.z) || 0) + (Number(aEndN.z) || 0) * da)
            };
            return { aEnd: join, bStart: join };
        }
        return {
            aEnd: {
                x: qf((Number(aEnd.x) || 0) + (Number(aEndN.x) || 0) * da),
                y: 0,
                z: qf((Number(aEnd.z) || 0) + (Number(aEndN.z) || 0) * da)
            },
            bStart: {
                x: qf((Number(bStart.x) || 0) + (Number(bStartN.x) || 0) * db),
                y: 0,
                z: qf((Number(bStart.z) || 0) + (Number(bStartN.z) || 0) * db)
            }
        };
    }
    if (!facet) {
        const join = cornerJoinPointWithDepths(aFrame, aDepth, bFrame, bDepth, aEnd);
        // AI 512: arbitrary-angle corners cap the mitre. Past the spike limit
        // (an acute meeting with a real offset) the corner falls back to a
        // bevel pair: each face ends on its own offset corner and the short
        // chamfer bridges them, exactly like an authored facet.
        const cx = Number(aEnd.x) || 0;
        const cz = Number(aEnd.z) || 0;
        const maxDepth = Math.max(Math.abs(Number(aDepth) || 0), Math.abs(Number(bDepth) || 0));
        const spikeLimit = Math.max(1.5, maxDepth * 3);
        if (Math.hypot(join.x - cx, join.z - cz) <= spikeLimit) {
            return { aEnd: join, bStart: join };
        }
    }
    const da = Number(aDepth) || 0;
    const db = Number(bDepth) || 0;
    return {
        aEnd: {
            x: qf((Number(aEnd.x) || 0) + (Number(aEndN.x) || 0) * da),
            y: 0,
            z: qf((Number(aEnd.z) || 0) + (Number(aEndN.z) || 0) * da)
        },
        bStart: {
            x: qf((Number(bStart.x) || 0) + (Number(bStartN.x) || 0) * db),
            y: 0,
            z: qf((Number(bStart.z) || 0) + (Number(bStartN.z) || 0) * db)
        }
    };
}

/**
 * Offset core loop at per-face depths (roof surfaces, shell floors): one
 * mitred point per sharp corner, the two fold points per beveled corner, with
 * the zero-length hops at mitred corners dropped.
 */
function buildCornerJoinLoopWithDepths({ frames, depthOf }) {
    const order = facadeFaceIdsOf(frames);
    const pairs = order.map((aId, i) => {
        const bId = order[(i + 1) % order.length];
        return cornerJoinPairWithDepths(
            frames[aId], depthOf(aId),
            frames[bId], depthOf(bId),
            frames?.cornerFacets?.[`${aId}${bId}`] ?? null
        );
    });
    const raw = [];
    for (let i = 0; i < order.length; i++) {
        const faceId = order[i];
        const frame = frames?.[faceId] ?? null;
        const depth = Number(depthOf(faceId)) || 0;
        const start = pairs[(i - 1 + pairs.length) % pairs.length]?.bStart ?? null;
        const end = pairs[i]?.aEnd ?? null;
        if (start) raw.push(start);
        const segments = clampInt(frame?.curve?.segments ?? 1, 1, 96);
        if (frame?.curve && segments > 1) {
            for (let k = 1; k < segments; k++) {
                const fraction = k / segments;
                const u = facadeFrameRunsForward(frame)
                    ? frame.length * fraction
                    : frame.length * (1 - fraction);
                raw.push(pointOnFacadeFrame({ frame, u, depth }));
            }
        }
        if (end) raw.push(end);
    }
    const out = [];
    for (const p of raw) {
        const prev = out[out.length - 1] ?? null;
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 1e-6) continue;
        out.push(p);
    }
    if (out.length > 1) {
        const first = out[0];
        const last = out[out.length - 1];
        if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) out.pop();
    }
    return out;
}

/**
 * Room-facing wall profile for an interior shell at per-face depths.
 *
 * Unlike the floor/ceiling outline, the wall builder needs face ids and
 * facade-u on every point so it can route opening cuts to the correct wall
 * segment. Curved faces therefore retain their authored arc samples here;
 * collapsing one to its endpoint chord would put a flat wall behind curved
 * glazing and leave its projected cuts with no matching segment.
 */
function buildInteriorShellLoopDetailWithDepths({ frames, depthOf }) {
    const order = facadeFaceIdsOf(frames);
    if (order.length < 3) return [];
    const pairs = order.map((aId, i) => {
        const bId = order[(i + 1) % order.length];
        return cornerJoinPairWithDepths(
            frames[aId], depthOf(aId),
            frames[bId], depthOf(bId),
            frames?.cornerFacets?.[`${aId}${bId}`] ?? null
        );
    });
    const raw = [];
    for (let i = 0; i < order.length; i++) {
        const faceId = order[i];
        const frame = frames?.[faceId] ?? null;
        if (!frame) continue;
        const depth = Number(depthOf(faceId)) || 0;
        const length = Math.max(0, Number(frame.length) || 0);
        const cutoutProjection = frame?.curve ? { cutoutProjectionMode: 'face_u' } : {};
        const start = pairs[(i - 1 + pairs.length) % pairs.length]?.bStart ?? null;
        const end = pairs[i]?.aEnd ?? null;
        if (start) raw.push({ ...start, kind: 'profile', faceId, u: facadeFrameLoopStartU(frame), depth, ...cutoutProjection });
        const segments = clampInt(frame?.curve?.segments ?? 1, 1, 96);
        if (frame?.curve && segments > 1) {
            for (let k = 1; k < segments; k++) {
                const fraction = k / segments;
                const u = facadeFrameRunsForward(frame)
                    ? length * fraction
                    : length * (1 - fraction);
                raw.push({
                    ...pointOnFacadeFrame({ frame, u, depth }),
                    kind: 'profile',
                    faceId,
                    u,
                    depth,
                    ...cutoutProjection
                });
            }
        }
        if (end) raw.push({ ...end, kind: 'profile', faceId, u: facadeFrameLoopEndU(frame), depth, ...cutoutProjection });
    }
    // Negative signed area is the winding that points wall faces into the
    // room. Facade-u remains valid when traversal reverses; the wall builder
    // explicitly supports both increasing and decreasing u segments.
    return signedArea(raw) > 0 ? raw.slice().reverse() : raw;
}

function projectPointToFacadeFrame({ frame, x, z }) {
    const f = frame && typeof frame === 'object' ? frame : null;
    if (!f) return { u: 0, depth: 0 };
    const px = Number(x) || 0;
    const pz = Number(z) || 0;
    if (f.curve) {
        const cx = Number(f.curve?.center?.x) || 0;
        const cz = Number(f.curve?.center?.z) || 0;
        const angle = Math.atan2(pz - cz, px - cx);
        const sweep = Number(f.curve.sweep) || 0;
        const twoPi = Math.PI * 2;
        let delta = angle - (Number(f.curve.startAngle) || 0);
        if (sweep >= 0) {
            while (delta < 0) delta += twoPi;
            while (delta > twoPi) delta -= twoPi;
        } else {
            while (delta > 0) delta -= twoPi;
            while (delta < -twoPi) delta += twoPi;
        }
        const fraction = Math.abs(sweep) > EPS ? clamp(delta / sweep, 0, 1) : 0;
        const u = fraction * (Number(f.length) || 0);
        const sample = sampleFacadeFrameAtU(f, u);
        const dx = px - (Number(sample?.x) || 0);
        const dz = pz - (Number(sample?.z) || 0);
        return {
            u: qf(u),
            depth: qf(dx * (Number(sample?.n?.x) || 0) + dz * (Number(sample?.n?.z) || 0))
        };
    }
    const sx = Number(f.start?.x) || 0;
    const sz = Number(f.start?.z) || 0;
    const tx = Number(f.t?.x) || 0;
    const tz = Number(f.t?.z) || 0;
    const nx = Number(f.n?.x) || 0;
    const nz = Number(f.n?.z) || 0;
    const dx = px - sx;
    const dz = pz - sz;
    return {
        u: qf(dx * tx + dz * tz),
        depth: qf(dx * nx + dz * nz)
    };
}

function resolveFacadeFaceIdForExteriorRun({ a, tx, tz, nx, nz, length, frames } = {}) {
    if (!a || !frames || typeof frames !== 'object') return null;
    const runLen = Number(length) || 0;
    if (!(runLen > EPS)) return null;
    const tanX = Number(tx) || 0;
    const tanZ = Number(tz) || 0;
    const normalX = Number(nx) || 0;
    const normalZ = Number(nz) || 0;

    const midX = (Number(a.x) || 0) + tanX * (runLen * 0.5);
    const midZ = (Number(a.z) || 0) + tanZ * (runLen * 0.5);
    const faceIds = facadeFaceIdsOf(frames);

    let bestFaceId = null;
    let bestScore = -Infinity;
    for (const faceId of faceIds) {
        const frame = frames?.[faceId] ?? null;
        if (!frame) continue;
        const frameNormalX = Number(frame?.n?.x) || 0;
        const frameNormalZ = Number(frame?.n?.z) || 0;
        const frameTanX = Number(frame?.t?.x) || 0;
        const frameTanZ = Number(frame?.t?.z) || 0;
        const dotNormal = normalX * frameNormalX + normalZ * frameNormalZ;
        const dotTanAbs = Math.abs(tanX * frameTanX + tanZ * frameTanZ);
        if (!(dotNormal > 0.65) || !(dotTanAbs > 0.65)) continue;

        const coords = projectPointToFacadeFrame({ frame, x: midX, z: midZ });
        const u = Number(coords?.u) || 0;
        const faceLen = Number(frame?.length) || 0;
        if (!(faceLen > EPS)) continue;
        if (u < -0.35 || u > faceLen + 0.35) continue;

        const depth = Number(coords?.depth) || 0;
        const score = dotNormal * 2.0 + dotTanAbs - Math.abs(depth) * 0.02;
        if (score > bestScore) {
            bestScore = score;
            bestFaceId = faceId;
        }
    }
    return bestFaceId;
}

function buildFacadeFaceProfile({
    faceId,
    frame,
    facade,
    layerMaterial,
    boundaryDepthByEndpointKey = null,
    warnings
}) {
    const faceLength = Number(frame?.length) || 0;
    if (!(faceLength > EPS)) {
        if (warnings) warnings.push(`${faceId}: face length is invalid.`);
        return { profile: [], startDepth: 0.0, endDepth: 0.0, strips: [], faceLength };
    }

    const baseDepth = qf(clampFacadeDepthMeters(facade?.depthOffset ?? 0.0));
    const rawItems = resolveFacadeLayoutItems(facade);
    const items = normalizeLayoutWidthFracs(rawItems.length ? rawItems : [{ type: 'padding', id: `${faceId}_pad`, widthFrac: 1.0 }], { warnings, faceId });

    const strips = [];
    const profile = [];
    let uCursor = 0.0;
    const depthEps = 1e-4;
    const pointTol = 1e-4;
    const minEdge = 1e-3;

    for (let i = 0; i < items.length; i++) {
        const it = items[i] ?? {};
        const type = it?.type === 'padding' ? 'padding' : 'bay';
        const id = typeof it?.id === 'string' && it.id ? it.id : `${faceId}_${type}_${i + 1}`;
        const sourceBayId = type === 'bay' && typeof it?.sourceBayId === 'string' ? it.sourceBayId : null;

        const frac = clamp(it?.widthFrac, 0, 1);
        const w = (i === items.length - 1) ? (faceLength - uCursor) : (frac * faceLength);
        const widthMeters = Math.max(0, w);
        const u0 = qf(uCursor);
        const u1 = (i === items.length - 1) ? qf(faceLength) : qf(uCursor + widthMeters);
        uCursor = u1;

        const isBay = type === 'bay';
        const depthSpec = isBay && it?.depth && typeof it.depth === 'object' ? it.depth : null;
        const depthLinked = (depthSpec?.linked ?? true) !== false;
        const depthLeftRaw = Number(depthSpec?.left);
        let deltaDepthLeft = qf(depthSpec
            ? (Number.isFinite(depthLeftRaw) ? clampFacadeDepthMeters(depthLeftRaw) : 0.0)
            : (isBay ? clampFacadeDepthMeters(it?.depthOffset ?? 0.0) : 0.0));
        const depthRightRaw = Number(depthSpec?.right);
        let deltaDepthRight = qf(depthSpec
            ? (Number.isFinite(depthRightRaw) ? clampFacadeDepthMeters(depthRightRaw) : (depthLinked ? deltaDepthLeft : 0.0))
            : deltaDepthLeft);

        if (isBay && sourceBayId && boundaryDepthByEndpointKey instanceof Map) {
            const startKey = bayBoundaryEndpointKey({ faceId, bayId: sourceBayId, edge: BAY_BOUNDARY_EDGE.START });
            const endKey = bayBoundaryEndpointKey({ faceId, bayId: sourceBayId, edge: BAY_BOUNDARY_EDGE.END });
            const startDepth = startKey ? boundaryDepthByEndpointKey.get(startKey) : undefined;
            const endDepth = endKey ? boundaryDepthByEndpointKey.get(endKey) : undefined;
            if (Number.isFinite(Number(startDepth))) deltaDepthLeft = qf(clampFacadeDepthMeters(startDepth));
            if (Number.isFinite(Number(endDepth))) deltaDepthRight = qf(clampFacadeDepthMeters(endDepth));
        }

        const wedgeAngleDeg = isBay && !depthSpec ? normalizeWedgeAngleDeg(it?.wedgeAngleDeg) : 0;
        const wantsWedge = isBay && !depthSpec && wedgeAngleDeg > 0 && Math.abs(deltaDepthLeft) > depthEps;

        if (isBay && !depthSpec && wedgeAngleDeg > 0 && !(Math.abs(deltaDepthLeft) > depthEps) && warnings) {
            warnings.push(`${faceId}:${id}: wedge angle set but depth is 0.`);
        }

        const boundaryDepth0 = qf(baseDepth + (isBay && !wantsWedge ? deltaDepthLeft : 0.0));
        const boundaryDepth1 = qf(baseDepth + (isBay && !wantsWedge ? deltaDepthRight : 0.0));

        appendPointIfChangedUD(profile, { u: u0, depth: boundaryDepth0 }, pointTol);

        let frontU0 = u0;
        let frontU1 = u1;
        if (wantsWedge) {
            const absDepth = Math.abs(deltaDepthLeft);
            const rad = wedgeAngleDeg * (Math.PI / 180);
            const tan = Math.tan(rad);
            const dx = tan > EPS ? (absDepth / tan) : (widthMeters * 0.5);
            const f0 = qf(u0 + dx);
            const f1 = qf(u1 - dx);
            if (f1 <= f0 + minEdge) {
                if (warnings) warnings.push(`${faceId}:${id}: wedge too narrow for depth (${widthMeters.toFixed(2)}m @ ${wedgeAngleDeg}°).`);
            } else {
                frontU0 = f0;
                frontU1 = f1;
            }
        }

        const resolvedMaterial = resolveFacadeWallMaterialSpec({
            layerMaterial,
            facadeMaterial: facade?.wallMaterial ?? null,
            bayMaterialOverride: isBay ? (it?.wallMaterialOverride ?? null) : null
        });

        const frontDepth0 = qf(baseDepth + (isBay ? deltaDepthLeft : 0.0));
        const frontDepth1 = qf(baseDepth + (isBay ? deltaDepthRight : 0.0));
        const stripDepth0 = frontDepth0;
        const stripDepth1 = wantsWedge ? frontDepth0 : frontDepth1;
        const frontDepth = (stripDepth0 + stripDepth1) * 0.5;
        const textureFlow = isBay && typeof it?.textureFlow === 'string' ? it.textureFlow : null;
        const wallBase = isBay && it?.wallBase && typeof it.wallBase === 'object' ? it.wallBase : null;
        const tiling = isBay && it?.tiling && typeof it.tiling === 'object' ? it.tiling : null;
        const materialVariation = isBay && it?.materialVariation && typeof it.materialVariation === 'object' ? it.materialVariation : null;
        const window = isBay && it?.window && typeof it.window === 'object' ? deepClone(it.window) : null;
        const capital = isBay && it?.capital && typeof it.capital === 'object' ? deepClone(it.capital) : null;
        const arcade = isBay && it?.arcade && typeof it.arcade === 'object' ? deepClone(it.arcade) : null;
        const balcony = isBay && it?.balcony && typeof it.balcony === 'object' ? deepClone(it.balcony) : null;
        strips.push({
            faceId,
            id,
            type,
            ...(sourceBayId ? { sourceBayId } : {}),
            ...(textureFlow ? { textureFlow } : {}),
            ...(wallBase ? { wallBase } : {}),
            ...(tiling ? { tiling } : {}),
            ...(materialVariation ? { materialVariation } : {}),
            ...(window ? { window } : {}),
            ...(capital ? { capital } : {}),
            ...(arcade ? { arcade } : {}),
            ...(balcony ? { balcony } : {}),
            u0,
            u1,
            frontU0,
            frontU1,
            depth0: stripDepth0,
            depth1: stripDepth1,
            depth: frontDepth,
            material: resolvedMaterial
        });

        if (wantsWedge && frontU1 > frontU0 + minEdge) {
            const dFront = qf(baseDepth + deltaDepthLeft);
            appendPointIfChangedUD(profile, { u: frontU0, depth: dFront }, pointTol);
            appendPointIfChangedUD(profile, { u: frontU1, depth: dFront }, pointTol);
            appendPointIfChangedUD(profile, { u: u1, depth: baseDepth }, pointTol);
            continue;
        }

        appendPointIfChangedUD(profile, { u: u1, depth: boundaryDepth1 }, pointTol);
    }

    const startDepth = profile.length ? (Number(profile[0].depth) || 0) : 0.0;
    const last = profile[profile.length - 1] ?? null;
    const endDepth = last ? (Number(last.depth) || 0) : startDepth;

    return { profile, startDepth, endDepth, strips, faceLength };
}

function resolveBayBoundaryDepthOverrides(config, warnings) {
    const validated = validateBayBoundaryConnectionsConfig(config);
    const invalid = new Set(validated.diagnostics
        .map((entry) => entry.connectionIndex)
        .filter((index) => Number.isInteger(index)));
    for (const entry of validated.diagnostics) warnings?.push?.(`Bay boundary: ${entry.message}`);
    const values = new Map();
    for (let index = 0; index < (validated.config?.connections?.length ?? 0); index += 1) {
        if (invalid.has(index)) continue;
        const connection = validated.config.connections[index];
        if (!connection?.depthLink?.enabled) continue;
        for (const endpoint of connection.endpoints) {
            const key = bayBoundaryEndpointKey(endpoint);
            if (key) values.set(key, Number(connection.depthLink.valueMeters) || 0);
        }
    }
    return { config: validated.config, values };
}

function facadeStripFrontU(strip, edge) {
    const raw = Number(edge === BAY_BOUNDARY_EDGE.END ? strip?.frontU1 : strip?.frontU0);
    if (Number.isFinite(raw)) return raw;
    return Number(edge === BAY_BOUNDARY_EDGE.END ? strip?.u1 : strip?.u0) || 0;
}

function facadeStripDepthAtU(strip, u) {
    const u0 = facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.START);
    const u1 = facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.END);
    const fallback = Number(strip?.depth) || 0;
    const d0 = Number.isFinite(Number(strip?.depth0)) ? Number(strip.depth0) : fallback;
    const d1 = Number.isFinite(Number(strip?.depth1)) ? Number(strip.depth1) : fallback;
    const t = u1 > u0 + EPS ? clamp(((Number(u) || 0) - u0) / (u1 - u0), 0, 1) : 0;
    return qf(d0 + (d1 - d0) * t);
}

function facadeStripPointAtU(frame, strip, u) {
    return pointOnFacadeFrame({ frame, u, depth: facadeStripDepthAtU(strip, u) });
}

function facadeStripPathLength(frame, strip, u0, u1, segments = 16) {
    const count = clampInt(segments, 4, 64);
    let length = 0;
    let previous = facadeStripPointAtU(frame, strip, u0);
    for (let index = 1; index <= count; index += 1) {
        const u = u0 + (u1 - u0) * (index / count);
        const point = facadeStripPointAtU(frame, strip, u);
        length += Math.hypot(point.x - previous.x, point.z - previous.z);
        previous = point;
    }
    return length;
}

function resolveFacadeStripRunoutStation({ frame, strip, edge, runoutMeters }) {
    const start = facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.START);
    const end = facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.END);
    const requested = Number(runoutMeters) || 0;
    if (!(end > start + 1e-4) || !(requested > 0)) return null;
    const total = facadeStripPathLength(frame, strip, start, end);
    if (!(total > requested + 0.1)) return null;
    let low = start;
    let high = end;
    for (let iteration = 0; iteration < 24; iteration += 1) {
        const mid = (low + high) * 0.5;
        const distance = edge === BAY_BOUNDARY_EDGE.END
            ? facadeStripPathLength(frame, strip, mid, end, 12)
            : facadeStripPathLength(frame, strip, start, mid, 12);
        if (edge === BAY_BOUNDARY_EDGE.END) {
            if (distance > requested) low = mid;
            else high = mid;
        } else if (distance > requested) {
            high = mid;
        } else {
            low = mid;
        }
    }
    const u = qf((low + high) * 0.5);
    return {
        u,
        depth: facadeStripDepthAtU(strip, u),
        point: facadeStripPointAtU(frame, strip, u),
        availableMeters: total
    };
}

function facadeStripWorldTangent(frame, strip, u, direction = 1) {
    const start = facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.START);
    const end = facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.END);
    const du = Math.max(1e-4, Math.min(0.01, (end - start) * 0.02));
    const ua = clamp((Number(u) || 0) - du, start, end);
    const ub = clamp((Number(u) || 0) + du, start, end);
    const a = facadeStripPointAtU(frame, strip, ua);
    const b = facadeStripPointAtU(frame, strip, ub);
    const sign = direction < 0 ? -1 : 1;
    const dx = (b.x - a.x) * sign;
    const dz = (b.z - a.z) * sign;
    const length = Math.hypot(dx, dz);
    return length > EPS ? { x: dx / length, z: dz / length } : null;
}

/**
 * Resolve the local mounting pose of an opening on a bay front.
 *
 * A bay with independent left/right depths is a sloped world-space wall even
 * when its parent facade is straight. Opening assemblies used to sample the
 * parent face normal and one average bay depth, leaving their frames parallel
 * to the original facade while the wall (and its cutout) followed the sloped
 * strip. Keep the opening on the exact strip point and derive its outward
 * normal from the strip tangent so windows, doors, storefronts, and their
 * attached decorations share the wall's resolved plane.
 */
function resolveFacadeStripOpeningPose(frame, strip, u) {
    const point = facadeStripPointAtU(frame, strip, u);
    const tangent = facadeStripWorldTangent(frame, strip, u) ?? sampleFacadeFrameAtU(frame, u)?.t ?? frame?.t ?? null;
    const tangentLength = Math.hypot(Number(tangent?.x) || 0, Number(tangent?.z) || 0);
    if (!(tangentLength > EPS)) return null;

    const tx = (Number(tangent?.x) || 0) / tangentLength;
    const tz = (Number(tangent?.z) || 0) / tangentLength;
    const baseSample = sampleFacadeFrameAtU(frame, u);
    const baseNx = Number(baseSample?.n?.x ?? frame?.n?.x) || 0;
    const baseNz = Number(baseSample?.n?.z ?? frame?.n?.z) || 0;
    const right = { x: tz, z: -tx };
    const left = { x: -tz, z: tx };
    const rightAlignment = right.x * baseNx + right.z * baseNz;
    const leftAlignment = left.x * baseNx + left.z * baseNz;
    const normal = rightAlignment >= leftAlignment ? right : left;

    return {
        ...point,
        u: Number(u) || 0,
        depth: facadeStripDepthAtU(strip, u),
        tx,
        tz,
        nx: normal.x,
        nz: normal.z,
        yaw: Math.atan2(normal.x, normal.z)
    };
}

function facadeStripTransitionClearance(strip, stationU, edge) {
    const remaining = edge === BAY_BOUNDARY_EDGE.END
        ? stationU - facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.START)
        : facadeStripFrontU(strip, BAY_BOUNDARY_EDGE.END) - stationU;
    const win = strip?.window && typeof strip.window === 'object' && strip.window.enabled !== false ? strip.window : null;
    const windowReserve = win
        ? clamp(win?.padding?.leftMeters ?? 0, 0, 9999)
            + clamp(win?.padding?.rightMeters ?? 0, 0, 9999)
            + Math.max(0.3, Number(win?.size?.widthMeters ?? win?.width?.minMeters) || 0.3)
        : 0;
    return { valid: remaining > Math.max(0.1, windowReserve) + 1e-4, remaining, required: Math.max(0.1, windowReserve) };
}

function buildResolvedBayBoundaryTransition({
    connection,
    instance,
    frames,
    startEndpoint,
    endEndpoint,
    startDirection = 1,
    endDirection = 1,
    instanceIndex = 0,
    warnings
}) {
    const transition = connection?.transition ?? null;
    const startStrip = startEndpoint?.strip ?? null;
    const endStrip = endEndpoint?.strip ?? null;
    const startFrame = frames?.[startEndpoint?.faceId] ?? null;
    const endFrame = frames?.[endEndpoint?.faceId] ?? null;
    if (!transition || !startStrip || !endStrip || !startFrame || !endFrame) return null;
    const startStation = resolveFacadeStripRunoutStation({
        frame: startFrame,
        strip: startStrip,
        edge: startEndpoint.edge,
        runoutMeters: transition.leftRunoutMeters
    });
    const endStation = resolveFacadeStripRunoutStation({
        frame: endFrame,
        strip: endStrip,
        edge: endEndpoint.edge,
        runoutMeters: transition.rightRunoutMeters
    });
    if (!startStation || !endStation) {
        warnings?.push?.(`Bay boundary "${connection.id}": a runout exceeds its solved bay frontage; the rounded join was blocked.`);
        return null;
    }
    const startClearance = facadeStripTransitionClearance(startStrip, startStation.u, startEndpoint.edge);
    const endClearance = facadeStripTransitionClearance(endStrip, endStation.u, endEndpoint.edge);
    if (!startClearance.valid || !endClearance.valid) {
        warnings?.push?.(`Bay boundary "${connection.id}": the rounded span would enter an opening or collapse usable bay frontage; the join was blocked.`);
        return null;
    }
    const tangent0 = facadeStripWorldTangent(startFrame, startStrip, startStation.u, startDirection);
    const tangent1 = facadeStripWorldTangent(endFrame, endStrip, endStation.u, endDirection);
    const startFrameSample = sampleFacadeFrameAtU(startFrame, startStation.u);
    const endFrameSample = sampleFacadeFrameAtU(endFrame, endStation.u);
    const path = solveBayBoundaryTransitionPath({
        id: connection.id,
        p0: startStation.point,
        p1: endStation.point,
        tangent0,
        tangent1,
        outward0: startFrameSample?.n,
        outward1: endFrameSample?.n,
        leftRunoutMeters: transition.leftRunoutMeters,
        rightRunoutMeters: transition.rightRunoutMeters,
        meeting: transition.meeting,
        maxChordErrorMeters: 0.01
    });
    if (!path.valid) {
        for (const entry of path.diagnostics) warnings?.push?.(`Bay boundary "${connection.id}": ${entry.message}`);
        return null;
    }
    const id = `${connection.id}:${instanceIndex + 1}`;
    const samples = path.samples.map((sample) => ({
        ...sample,
        x: sample.position.x,
        y: 0,
        z: sample.position.z,
        boundaryTransitionId: id
    }));
    const segments = [];
    for (let index = 0; index < samples.length - 1; index += 1) {
        const a = samples[index];
        const b = samples[index + 1];
        const ownerIsStart = ((a.t + b.t) * 0.5) < path.meeting;
        const ownerEndpoint = ownerIsStart ? startEndpoint : endEndpoint;
        const ownerStrip = ownerIsStart ? startStrip : endStrip;
        const ownerStation = ownerIsStart ? startStation : endStation;
        segments.push({
            x0: a.x,
            z0: a.z,
            x1: b.x,
            z1: b.z,
            s0: a.sMeters,
            s1: b.sMeters,
            nx: qf((a.normal.x + b.normal.x) * 0.5),
            nz: qf((a.normal.z + b.normal.z) * 0.5),
            ownerFaceId: ownerEndpoint.faceId,
            ownerBayId: ownerEndpoint.bayId,
            ownerStrip,
            ownerWallDepth: ownerStation.depth
        });
    }
    return {
        id,
        connectionId: connection.id,
        instance,
        startEndpoint,
        endEndpoint,
        startStation,
        endStation,
        samples,
        segments,
        meeting: path.meeting,
        meetingPoint: path.meetingPoint,
        lengthMeters: path.lengthMeters
    };
}

function applySameFaceBayBoundaryTransition(transition, profile) {
    const faceId = transition?.startEndpoint?.faceId;
    if (!faceId || faceId !== transition?.endEndpoint?.faceId || !profile) return false;
    const u0 = transition.startStation.u;
    const u1 = transition.endStation.u;
    if (!(u1 > u0 + 1e-4)) return false;
    const next = [];
    for (const point of profile.profile ?? []) {
        const u = Number(point?.u) || 0;
        if (u < u0 - 1e-5 || u > u1 + 1e-5) appendPointIfChangedUD(next, point, 1e-5);
    }
    const projected = transition.samples.map((sample) => ({
        u: sample.t === 0 ? u0 : (sample.t === 1 ? u1 : null),
        depth: null,
        sample
    }));
    const faceFrame = transition.faceFrame ?? null;
    if (!faceFrame) return false;
    for (const entry of projected) {
        const coords = entry.u === null
            ? projectPointToFacadeFrame({ frame: faceFrame, x: entry.sample.x, z: entry.sample.z })
            : { u: entry.u, depth: entry.sample.t === 0 ? transition.startStation.depth : transition.endStation.depth };
        next.push({
            u: qf(coords.u),
            depth: qf(coords.depth),
            boundaryTransitionId: transition.id,
            boundaryTransitionT: entry.sample.t
        });
    }
    next.sort((a, b) => (Number(a.u) || 0) - (Number(b.u) || 0));
    profile.profile = [];
    for (const point of next) appendPointIfChangedUD(profile.profile, point, 1e-5);
    const startStrip = transition.startEndpoint.strip;
    const endStrip = transition.endEndpoint.strip;
    startStrip.frontU1 = qf(u0);
    startStrip.depth1 = qf(transition.startStation.depth);
    startStrip.depth = qf((Number(startStrip.depth0) + Number(startStrip.depth1)) * 0.5);
    endStrip.frontU0 = qf(u1);
    endStrip.depth0 = qf(transition.endStation.depth);
    endStrip.depth = qf((Number(endStrip.depth0) + Number(endStrip.depth1)) * 0.5);
    return true;
}

function trimFacePointsAtBoundaryTransition(points, endpoint, station) {
    const list = Array.isArray(points) ? points : [];
    const kept = list.filter((point) => endpoint.edge === BAY_BOUNDARY_EDGE.END
        ? Number(point?.u) < station.u - 1e-5
        : Number(point?.u) > station.u + 1e-5);
    const stationPoint = {
        ...station.point,
        kind: 'profile',
        faceId: endpoint.faceId,
        u: station.u,
        depth: station.depth
    };
    if (endpoint.edge === BAY_BOUNDARY_EDGE.END) kept.push(stationPoint);
    else kept.unshift(stationPoint);
    return kept;
}

// Pier/spandrel grids (AI_487, refs 7/6/m1) are a RECIPE over this facade
// silhouette system — no dedicated feature is needed for the planes:
//   - pier: a narrow wall bay with an outward depth offset (proud strip),
//   - spandrel: the window bay recessed inward with its OWN per-bay material —
//     the recessed strip between stacked windows IS the spandrel panel,
//   - glass: the window inset further via face-relative inset / frame depth.
// The silhouette emits the return walls at every depth step, so the reveal
// edges are correct by construction. Global facades repeat the same bay
// layout on every layer, which keeps pier bays aligned vertically.
function computeQuadFacadeSilhouette({
    wallOuter,
    facades,
    layerMaterial,
    bayBoundaryConnections = null,
    warnings,
    cornerStrategy = null,
    cornerDebug = null,
    edgeBevel = null
} = {}) {
    const outerList = Array.isArray(wallOuter) ? wallOuter : [];
    const main = outerList[0] ?? null;
    if (!main || main.length < 3) return null;

    const frames = computeFacadeFramesFromLoop(main, { warnings });
    if (!frames) return null;
    const faceOrder = facadeFaceIdsOf(frames);
    const faceCount = faceOrder.length;
    const cornerIdAt = (i) => `${faceOrder[i % faceCount]}${faceOrder[(i + 1) % faceCount]}`;

    // AI 499: corners the plan-edge bevel already cut arrive here as facets
    // between two faces, so those faces end on their own fold line instead of
    // sharing one mitred corner point. AI 512 adds a second source: an acute
    // corner whose offset mitre would spike past the limit falls back to the
    // same fold-line treatment (a synthetic zero-facet bevel).
    const cornerFacets = frames.cornerFacets && typeof frames.cornerFacets === 'object' ? frames.cornerFacets : null;
    const spikyCorners = new Set();
    const depthStepCorners = new Set();
    const isBeveledCorner = (cornerId) => !!cornerFacets?.[cornerId] || spikyCorners.has(cornerId) || depthStepCorners.has(cornerId);

    const pointTol = 1e-4;
    const minEdge = 1e-3;
    const resolvedCornerStrategy = cornerStrategy && typeof cornerStrategy === 'object' && typeof cornerStrategy.resolve === 'function'
        ? cornerStrategy
        : resolveRectFacadeCornerStrategy(null);
    const cornerDebugList = Array.isArray(cornerDebug) ? cornerDebug : null;

    const fac = facades && typeof facades === 'object' ? facades : null;
    const getFacade = (id) => (fac?.[id] && typeof fac[id] === 'object') ? fac[id] : null;
    const boundaryDepthState = resolveBayBoundaryDepthOverrides(
        normalizeBayBoundaryConnectionsConfig(bayBoundaryConnections),
        warnings
    );

    const profByFaceId = {};
    for (const faceId of faceOrder) {
        const prof = buildFacadeFaceProfile({
            faceId,
            frame: frames[faceId],
            facade: getFacade(faceId),
            layerMaterial,
            boundaryDepthByEndpointKey: boundaryDepthState.values,
            warnings
        });
        if (!prof?.profile?.length) {
            if (warnings) warnings.push('Facade silhouette: missing face profiles.');
            return null;
        }
        profByFaceId[faceId] = prof;
    }

    const joinPairByCornerId = {};
    const joinByCornerId = {};
    for (let i = 0; i < faceCount; i++) {
        const aId = faceOrder[i];
        const bId = faceOrder[(i + 1) % faceCount];
        const cornerId = `${aId}${bId}`;
        const aProf = profByFaceId[aId];
        const bProf = profByFaceId[bId];
        const pair = cornerJoinPairWithDepths(
            frames[aId], facadeProfileLoopEndDepth(frames[aId], aProf),
            frames[bId], facadeProfileLoopStartDepth(frames[bId], bProf),
            cornerFacets?.[cornerId] ?? null
        );
        joinPairByCornerId[cornerId] = pair;
        joinByCornerId[cornerId] = pair.aEnd;
        if (framesContinueCollinearly(frames[aId], frames[bId])
            && Math.abs(facadeProfileLoopEndDepth(frames[aId], aProf)
                - facadeProfileLoopStartDepth(frames[bId], bProf)) > 1e-6) {
            depthStepCorners.add(cornerId);
        } else if (!cornerFacets?.[cornerId]) {
            // AI 512: acute-mitre limit — same rule as cornerJoinPairWithDepths.
            if (Math.hypot(pair.aEnd.x - pair.bStart.x, pair.aEnd.z - pair.bStart.z) > 1e-6) {
                spikyCorners.add(cornerId);
            }
        }
    }

    const facadeStripsByFaceId = {};
    for (const faceId of faceOrder) facadeStripsByFaceId[faceId] = profByFaceId[faceId].strips;
    const boundaryResolution = resolveBayBoundaryConnections({
        connections: boundaryDepthState.config,
        stripsByFaceId: facadeStripsByFaceId,
        faceOrder
    });
    for (const entry of boundaryResolution.diagnostics) {
        if (entry.code === 'bay_boundary_endpoint_missing' || entry.code === 'bay_boundary_endpoints_not_adjacent') {
            warnings?.push?.(`Bay boundary: ${entry.message}`);
        }
    }
    const boundaryTransitions = [];
    const crossBoundaryTransitionByCornerId = {};
    const sameFaceSpans = {};
    const trimStripEndpoint = (endpoint, station) => {
        const strip = endpoint?.strip ?? null;
        if (!strip || !station) return;
        if (endpoint.edge === BAY_BOUNDARY_EDGE.END) {
            strip.frontU1 = qf(station.u);
            strip.depth1 = qf(station.depth);
        } else {
            strip.frontU0 = qf(station.u);
            strip.depth0 = qf(station.depth);
        }
        strip.depth = qf(((Number(strip.depth0) || 0) + (Number(strip.depth1) || 0)) * 0.5);
    };
    for (const connection of boundaryResolution.connections) {
        if (connection.type !== BAY_BOUNDARY_TYPE.ROUNDED) continue;
        connection.instances.forEach((instance, instanceIndex) => {
            const [rawA, rawB] = instance.endpoints;
            if (rawA.faceId === rawB.faceId) {
                const startEndpoint = rawA.edge === BAY_BOUNDARY_EDGE.END ? rawA : rawB;
                const endEndpoint = startEndpoint === rawA ? rawB : rawA;
                const transition = buildResolvedBayBoundaryTransition({
                    connection,
                    instance,
                    frames,
                    startEndpoint,
                    endEndpoint,
                    startDirection: 1,
                    endDirection: 1,
                    instanceIndex,
                    warnings
                });
                if (!transition) return;
                transition.faceFrame = frames[startEndpoint.faceId];
                const span = { u0: transition.startStation.u, u1: transition.endStation.u };
                const claimed = sameFaceSpans[startEndpoint.faceId] ?? [];
                if (claimed.some((entry) => span.u1 > entry.u0 + 1e-4 && span.u0 < entry.u1 - 1e-4)) {
                    warnings?.push?.(`Bay boundary "${connection.id}": its rounded runout overlaps another transition; the join was blocked.`);
                    return;
                }
                if (!applySameFaceBayBoundaryTransition(transition, profByFaceId[startEndpoint.faceId])) return;
                claimed.push(span);
                sameFaceSpans[startEndpoint.faceId] = claimed;
                boundaryTransitions.push(transition);
                return;
            }

            const aIndex = faceOrder.indexOf(rawA.faceId);
            const bIndex = faceOrder.indexOf(rawB.faceId);
            let startEndpoint = null;
            let endEndpoint = null;
            if (aIndex >= 0 && faceOrder[(aIndex + 1) % faceCount] === rawB.faceId) {
                startEndpoint = rawA;
                endEndpoint = rawB;
            } else if (bIndex >= 0 && faceOrder[(bIndex + 1) % faceCount] === rawA.faceId) {
                startEndpoint = rawB;
                endEndpoint = rawA;
            }
            if (!startEndpoint || !endEndpoint) return;
            const expectedStartEdge = facadeFrameRunsForward(frames[startEndpoint.faceId])
                ? BAY_BOUNDARY_EDGE.END
                : BAY_BOUNDARY_EDGE.START;
            const expectedEndEdge = facadeFrameRunsForward(frames[endEndpoint.faceId])
                ? BAY_BOUNDARY_EDGE.START
                : BAY_BOUNDARY_EDGE.END;
            if (startEndpoint.edge !== expectedStartEdge || endEndpoint.edge !== expectedEndEdge) {
                warnings?.push?.(`Bay boundary "${connection.id}": endpoint identities do not meet at the selected physical corner; the rounded join was blocked.`);
                return;
            }
            const cornerId = `${startEndpoint.faceId}${endEndpoint.faceId}`;
            if (cornerFacets?.[cornerId]) {
                warnings?.push?.(`Bay boundary "${connection.id}": corner ${cornerId} already belongs to a plan edge bevel; the rounded join was blocked.`);
                return;
            }
            if (crossBoundaryTransitionByCornerId[cornerId]) {
                warnings?.push?.(`Bay boundary "${connection.id}": corner ${cornerId} is already owned by another rounded transition.`);
                return;
            }
            const transition = buildResolvedBayBoundaryTransition({
                connection,
                instance,
                frames,
                startEndpoint,
                endEndpoint,
                startDirection: facadeFrameRunsForward(frames[startEndpoint.faceId]) ? 1 : -1,
                endDirection: facadeFrameRunsForward(frames[endEndpoint.faceId]) ? 1 : -1,
                instanceIndex,
                warnings
            });
            if (!transition) return;
            trimStripEndpoint(startEndpoint, transition.startStation);
            trimStripEndpoint(endEndpoint, transition.endStation);
            transition.cornerId = cornerId;
            crossBoundaryTransitionByCornerId[cornerId] = transition;
            boundaryTransitions.push(transition);
        });
    }

    const getUAtJoin = (frame, depth, p) => {
        const f = frame && typeof frame === 'object' ? frame : null;
        if (!f || !p) return 0;
        if (f.curve) return projectPointToFacadeFrame({ frame: f, x: p.x, z: p.z }).u;
        const sx = Number(f.start?.x) || 0;
        const sz = Number(f.start?.z) || 0;
        const tx = Number(f.t?.x) || 0;
        const tz = Number(f.t?.z) || 0;
        const nx = Number(f.n?.x) || 0;
        const nz = Number(f.n?.z) || 0;
        const d = Number(depth) || 0;
        const vx = (Number(p.x) || 0) - sx - nx * d;
        const vz = (Number(p.z) || 0) - sz - nz * d;
        return qf(vx * tx + vz * tz);
    };

    const resolveCornerCutWants = (facade) => {
        const src = facade && typeof facade === 'object' ? facade : null;
        const cfg = (src?.cornerCutouts && typeof src.cornerCutouts === 'object')
            ? src.cornerCutouts
            : ((src?.cornerCut && typeof src.cornerCut === 'object') ? src.cornerCut : null);

        const startRaw = cfg?.startMeters ?? cfg?.start ?? null;
        const endRaw = cfg?.endMeters ?? cfg?.end ?? null;
        const start = clamp(Number(startRaw) || 0, 0, 9999);
        const end = clamp(Number(endRaw) || 0, 0, 9999);
        return { start, end };
    };

    const dropCutForBeveledCorner = (cornerId, faceId, want) => {
        if (!isBeveledCorner(cornerId) || !(want > 0)) return want;
        if (warnings) {
            warnings.push(`Facade silhouette: corner ${cornerId} is beveled; ignoring the corner cutout on face ${faceId}.`);
        }
        return 0;
    };

    const sampleProfileDepthAtU = (list, u) => {
        const pts = Array.isArray(list) ? list : [];
        const uu = Number(u) || 0;
        if (!pts.length) return 0;

        const u0 = Number(pts[0]?.u) || 0;
        const d0 = Number(pts[0]?.depth) || 0;
        if (uu <= u0) return qf(d0);

        for (let i = 1; i < pts.length; i++) {
            const p = pts[i];
            if (!p || typeof p !== 'object') continue;
            const u1 = Number(p.u) || 0;
            const d1 = Number(p.depth) || 0;
            if (uu <= u1 + EPS) {
                const prev = pts[i - 1];
                const ua = Number(prev?.u) || 0;
                const da = Number(prev?.depth) || 0;
                const ub = u1;
                const db = d1;
                const t = (ub - ua) > EPS ? clamp((uu - ua) / (ub - ua), 0, 1) : 0;
                return qf(da + (db - da) * t);
            }
        }

        const last = pts[pts.length - 1];
        return qf(Number(last?.depth) || 0);
    };

    const isOddWinnerFaceId = (faceId) => {
        const id = typeof faceId === 'string' ? faceId : '';
        const code = id ? (id.charCodeAt(0) - 65) : 0;
        return (code % 2) === 0;
    };

    const minCornerCutBayWidth = 0.1;
    const cornerCutEps = 1e-4;

    const computeMaxCutStart = ({ prof, uStartJoin, uEndJoin }) => {
        const list = Array.isArray(prof?.profile) ? prof.profile : [];
        let nextU = uEndJoin;
        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            const u = Number(p.u) || 0;
            if (u > uStartJoin + pointTol) {
                nextU = Math.min(nextU, u);
                break;
            }
        }
        const segW = Math.max(0, nextU - uStartJoin);
        return Math.max(0, segW - minCornerCutBayWidth);
    };

    const computeMaxCutEnd = ({ prof, uStartJoin, uEndJoin }) => {
        const list = Array.isArray(prof?.profile) ? prof.profile : [];
        let prevU = uStartJoin;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            if (!p || typeof p !== 'object') continue;
            const u = Number(p.u) || 0;
            if (u < uEndJoin - pointTol) {
                prevU = Math.max(prevU, u);
                break;
            }
        }
        const segW = Math.max(0, uEndJoin - prevU);
        return Math.max(0, segW - minCornerCutBayWidth);
    };

    const cutWantsByFaceId = {};
    const faceInfoByFaceId = {};
    for (let i = 0; i < faceCount; i++) {
        const faceId = faceOrder[i];
        cutWantsByFaceId[faceId] = resolveCornerCutWants(getFacade(faceId));
        const loopStartCornerId = cornerIdAt(i - 1 + faceCount);
        const loopEndCornerId = cornerIdAt(i);
        const runsForward = facadeFrameRunsForward(frames[faceId]);
        faceInfoByFaceId[faceId] = {
            faceId,
            frame: frames[faceId],
            prof: profByFaceId[faceId],
            startJoin: runsForward
                ? joinPairByCornerId[loopStartCornerId].bStart
                : joinPairByCornerId[loopEndCornerId].aEnd,
            endJoin: runsForward
                ? joinPairByCornerId[loopEndCornerId].aEnd
                : joinPairByCornerId[loopStartCornerId].bStart,
            startCornerId: runsForward ? loopStartCornerId : loopEndCornerId,
            endCornerId: runsForward ? loopEndCornerId : loopStartCornerId,
            loopStartCornerId,
            loopEndCornerId
        };
    }

    for (const faceId of faceOrder) {
        const info = faceInfoByFaceId[faceId];
        const f = info?.frame ?? null;
        const prof = info?.prof ?? null;
        const startDepth = qf(Number(prof?.startDepth) || 0);
        const endDepth = qf(Number(prof?.endDepth) || startDepth);
        // AI 499: at a beveled corner there is no mitre to project onto — the
        // face simply runs the whole (already shortened) frame length, so the
        // join u must come from the frame rather than from the virtual sharp
        // corner the two face planes would still intersect at.
        const faceLength = Number(prof?.faceLength) || Number(f?.length) || 0;
        info.uStartJoin = isBeveledCorner(info.startCornerId) ? 0 : getUAtJoin(f, startDepth, info.startJoin);
        info.uEndJoin = isBeveledCorner(info.endCornerId) ? qf(faceLength) : getUAtJoin(f, endDepth, info.endJoin);
        for (const strip of prof.strips) {
            strip.frontU0 = qf(Math.max(Number(strip.frontU0) || 0, info.uStartJoin));
            strip.frontU1 = qf(Math.min(Number(strip.frontU1) || 0, info.uEndJoin));
        }
        info.maxCutStart = computeMaxCutStart(info);
        info.maxCutEnd = computeMaxCutEnd(info);
    }

    const resolveCornerCut = (cornerId, prevFaceId, nextFaceId) => {
        if (crossBoundaryTransitionByCornerId[cornerId]) {
            return { cutPrev: 0, cutNext: 0, q: null };
        }
        const prev = faceInfoByFaceId[prevFaceId];
        const next = faceInfoByFaceId[nextFaceId];
        if (!prev || !next) return { cutPrev: 0, cutNext: 0, q: null };
        const prevEndpoint = facadeFrameRunsForward(prev.frame) ? 'end' : 'start';
        const nextEndpoint = facadeFrameRunsForward(next.frame) ? 'start' : 'end';
        const endpointValue = (info, endpoint, kind) => {
            if (kind === 'want') return Number(cutWantsByFaceId?.[info.faceId]?.[endpoint]) || 0;
            if (kind === 'max') return Number(endpoint === 'start' ? info.maxCutStart : info.maxCutEnd) || 0;
            if (kind === 'u') return Number(endpoint === 'start' ? info.uStartJoin : info.uEndJoin) || 0;
            if (kind === 'depth') return Number(endpoint === 'start' ? info.prof.startDepth : info.prof.endDepth) || 0;
            return null;
        };
        const cutU = (info, endpoint, cut) => qf(endpointValue(info, endpoint, 'u')
            + (endpoint === 'start' ? 1 : -1) * (Number(cut) || 0));
        const uIsInside = (info, endpoint, u) => endpoint === 'start'
            ? u < (Number(info.uEndJoin) || 0) - minEdge
            : u > (Number(info.uStartJoin) || 0) + minEdge;

        const wantPrev = dropCutForBeveledCorner(cornerId, prevFaceId, endpointValue(prev, prevEndpoint, 'want'));
        const wantNext = dropCutForBeveledCorner(cornerId, nextFaceId, endpointValue(next, nextEndpoint, 'want'));
        const maxPrev = endpointValue(prev, prevEndpoint, 'max');
        const maxNext = endpointValue(next, nextEndpoint, 'max');

        let cutPrev = qf(clamp(wantPrev, 0, maxPrev));
        let cutNext = qf(clamp(wantNext, 0, maxNext));
        if (!(cutPrev > cornerCutEps) && !(cutNext > cornerCutEps)) return { cutPrev: 0, cutNext: 0, q: null };

        const computeQ = (cp, cn) => {
            const uPrev = cutU(prev, prevEndpoint, cp);
            const uNext = cutU(next, nextEndpoint, cn);
            if (!uIsInside(prev, prevEndpoint, uPrev) || !uIsInside(next, nextEndpoint, uNext)) return null;

            const usePrevJoin = (Number(cp) || 0) <= cornerCutEps;
            const useNextJoin = (Number(cn) || 0) <= cornerCutEps;

            const dPrev = usePrevJoin ? qf(endpointValue(prev, prevEndpoint, 'depth')) : sampleProfileDepthAtU(prev.prof.profile, uPrev);
            const dNext = useNextJoin ? qf(endpointValue(next, nextEndpoint, 'depth')) : sampleProfileDepthAtU(next.prof.profile, uNext);
            const prevJoin = prevEndpoint === 'start' ? prev.startJoin : prev.endJoin;
            const nextJoin = nextEndpoint === 'start' ? next.startJoin : next.endJoin;
            const pPrev = usePrevJoin ? { x: qf(prevJoin.x), y: 0, z: qf(prevJoin.z) } : pointOnFacadeFrame({ frame: prev.frame, u: uPrev, depth: dPrev });
            const pNext = useNextJoin ? { x: qf(nextJoin.x), y: 0, z: qf(nextJoin.z) } : pointOnFacadeFrame({ frame: next.frame, u: uNext, depth: dNext });

            const r = next.frame?.t ?? null;
            const s = prev.frame?.t ?? null;
            if (!r || !s) return null;

            const q = intersectLines2(pPrev, r, pNext, { x: -Number(s.x) || 0, z: -Number(s.z) || 0 });
            if (!q) return null;

            const qx = qf(q.x);
            const qz = qf(q.z);
            const d0 = Math.hypot(qx - pPrev.x, qz - pPrev.z);
            const d1 = Math.hypot(qx - pNext.x, qz - pNext.z);
            if (!(d0 > minEdge) || !(d1 > minEdge)) return null;
            return { x: qx, y: 0, z: qz, cornerId };
        };

        let q = computeQ(cutPrev, cutNext);
        if (!q && cutPrev > cornerCutEps && cutNext > cornerCutEps) {
            const winner = isOddWinnerFaceId(prevFaceId) ? prevFaceId : nextFaceId;
            if (winner === prevFaceId) cutNext = 0;
            else cutPrev = 0;
            q = computeQ(cutPrev, cutNext);
        }

        if (!q) {
            if (warnings) warnings.push(`Facade silhouette: corner cutout "${cornerId}" could not be resolved.`);
            return { cutPrev: 0, cutNext: 0, q: null };
        }

        return { cutPrev, cutNext, prevEndpoint, nextEndpoint, q };
    };

    const cornerCuts = {};
    const cutStartByFaceId = {};
    const cutEndByFaceId = {};
    for (const faceId of faceOrder) {
        cutStartByFaceId[faceId] = 0;
        cutEndByFaceId[faceId] = 0;
    }
    for (let i = 0; i < faceCount; i++) {
        const aId = faceOrder[i];
        const bId = faceOrder[(i + 1) % faceCount];
        const cut = resolveCornerCut(`${aId}${bId}`, aId, bId);
        cornerCuts[`${aId}${bId}`] = cut;
        if (cut.prevEndpoint === 'start') cutStartByFaceId[aId] = qf(Number(cut.cutPrev) || 0);
        else cutEndByFaceId[aId] = qf(Number(cut.cutPrev) || 0);
        if (cut.nextEndpoint === 'start') cutStartByFaceId[bId] = qf(Number(cut.cutNext) || 0);
        else cutEndByFaceId[bId] = qf(Number(cut.cutNext) || 0);
    }

    const buildTrimmedFaceWorldPoints = ({
        faceId,
        profile,
        frame,
        startCornerId,
        endCornerId,
        startJoin,
        endJoin,
        uStartJoin,
        uEndJoin,
        cutStartMeters,
        cutEndMeters,
        bevelStart = false,
        bevelEnd = false
    }) => {
        const f = frame && typeof frame === 'object' ? frame : null;
        const prof = profile && typeof profile === 'object' ? profile : null;
        if (!f || !prof) return null;
        const list = Array.isArray(prof.profile) ? prof.profile : [];
        if (!list.length) return null;

        const faceLength = Number(prof.faceLength) || 0;
        if (!(faceLength > minEdge)) return null;

        const wantsStartJoin = (Number(cutStartMeters) || 0) <= cornerCutEps;
        const wantsEndJoin = (Number(cutEndMeters) || 0) <= cornerCutEps;
        const uStart = qf((Number(uStartJoin) || 0) + (wantsStartJoin ? 0 : (Number(cutStartMeters) || 0)));
        const uEnd = qf((Number(uEndJoin) || 0) - (wantsEndJoin ? 0 : (Number(cutEndMeters) || 0)));
        if (!(uEnd > uStart + minEdge)) {
            if (warnings) warnings.push(`Facade silhouette: face ${faceId} collapsed after corner trims (uStart=${uStart.toFixed(3)}, uEnd=${uEnd.toFixed(3)}).`);
            return null;
        }

        const joinStartDepth = qf(Number(prof.startDepth) || 0);
        const joinEndDepth = qf(Number(prof.endDepth) || joinStartDepth);
        const startDepth = wantsStartJoin ? joinStartDepth : sampleProfileDepthAtU(list, uStart);
        const endDepth = wantsEndJoin ? joinEndDepth : sampleProfileDepthAtU(list, uEnd);

        // A beveled corner has no shared mitre point: the face simply ends on
        // its own fold line and the facet edge spans to the next face.
        const useStartJoin = wantsStartJoin && !bevelStart;
        const useEndJoin = wantsEndJoin && !bevelEnd;

        const pts = [];
        const startWorld = useStartJoin
            ? { x: qf(startJoin.x), y: 0, z: qf(startJoin.z) }
            : pointOnFacadeFrame({ frame: f, u: uStart, depth: startDepth });
        const endWorld = useEndJoin
            ? { x: qf(endJoin.x), y: 0, z: qf(endJoin.z) }
            : pointOnFacadeFrame({ frame: f, u: uEnd, depth: endDepth });

        pts.push({
            ...startWorld,
            kind: 'profile',
            faceId,
            u: uStart,
            depth: startDepth,
            ...(useStartJoin ? { cornerId: startCornerId } : {})
        });

        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            const u = Number(p.u) || 0;
            if (!(u > pointTol && u < faceLength - pointTol)) continue;
            if (!(u > uStart + pointTol && u < uEnd - pointTol)) continue;
            const d = qf(Number(p.depth) || 0);
            const world = pointOnFacadeFrame({ frame: f, u, depth: d });
            appendPointIfChanged(pts, {
                ...world,
                kind: 'profile',
                faceId,
                u: qf(u),
                depth: d,
                ...(p.boundaryTransitionId ? {
                    boundaryTransitionId: p.boundaryTransitionId,
                    boundaryTransitionT: p.boundaryTransitionT
                } : {})
            }, pointTol);
        }

        appendPointIfChanged(pts, {
            ...endWorld,
            kind: 'profile',
            faceId,
            u: uEnd,
            depth: endDepth,
            ...(useEndJoin ? { cornerId: endCornerId } : {})
        }, pointTol);
        if (!f.curve || pts.length < 2) return pts;
        const curvedPts = pts.map((point) => ({ ...point, cutoutProjectionMode: 'face_u' }));

        // AI 516: the authored profile remains expressed in arc-length u, but
        // every interval is tessellated onto the same circular frame. Wall
        // panels, cutouts, UVs, bands, and the later cornice/roof sweeps all
        // consume this one curved loop rather than independently guessing a
        // radius. Depth is interpolated across wedge strips before sampling.
        const dense = [];
        const segmentCount = clampInt(f.curve.segments ?? 3, 3, 96);
        const arcStep = f.length / segmentCount;
        for (let i = 0; i < curvedPts.length - 1; i++) {
            const a = curvedPts[i];
            const b = curvedPts[i + 1];
            appendPointIfChanged(dense, a, pointTol);
            const ua = Number(a?.u);
            const ub = Number(b?.u);
            if (!Number.isFinite(ua) || !Number.isFinite(ub) || !(ub > ua + pointTol)) continue;
            const first = Math.floor(ua / arcStep) + 1;
            const last = Math.ceil(ub / arcStep) - 1;
            for (let k = first; k <= last; k++) {
                const u = k * arcStep;
                if (!(u > ua + pointTol && u < ub - pointTol)) continue;
                const t = (u - ua) / (ub - ua);
                const depth = qf((Number(a?.depth) || 0) + ((Number(b?.depth) || 0) - (Number(a?.depth) || 0)) * t);
                const world = pointOnFacadeFrame({ frame: f, u, depth });
                appendPointIfChanged(dense, {
                    ...world,
                    kind: 'profile',
                    faceId,
                    u: qf(u),
                    depth,
                    cutoutProjectionMode: 'face_u'
                }, pointTol);
            }
        }
        appendPointIfChanged(dense, curvedPts[curvedPts.length - 1], pointTol);
        return dense;
    };

    const ptsByFaceId = {};
    for (const faceId of faceOrder) {
        const info = faceInfoByFaceId[faceId];
        const pts = buildTrimmedFaceWorldPoints({
            faceId,
            profile: info.prof,
            frame: info.frame,
            startCornerId: info.startCornerId,
            endCornerId: info.endCornerId,
            startJoin: info.startJoin,
            endJoin: info.endJoin,
            uStartJoin: info.uStartJoin,
            uEndJoin: info.uEndJoin,
            cutStartMeters: cutStartByFaceId[faceId],
            cutEndMeters: cutEndByFaceId[faceId],
            bevelStart: isBeveledCorner(info.startCornerId),
            bevelEnd: isBeveledCorner(info.endCornerId)
        });
        if (!pts) return null;
        ptsByFaceId[faceId] = pts;
    }
    for (const transition of Object.values(crossBoundaryTransitionByCornerId)) {
        ptsByFaceId[transition.startEndpoint.faceId] = trimFacePointsAtBoundaryTransition(
            ptsByFaceId[transition.startEndpoint.faceId],
            transition.startEndpoint,
            transition.startStation
        );
        ptsByFaceId[transition.endEndpoint.faceId] = trimFacePointsAtBoundaryTransition(
            ptsByFaceId[transition.endEndpoint.faceId],
            transition.endEndpoint,
            transition.endStation
        );
    }

    if (cornerDebugList) {
        const corners = [];
        for (let i = 0; i < faceCount; i++) {
            const aId = faceOrder[i];
            const bId = faceOrder[(i + 1) % faceCount];
            const cornerId = `${aId}${bId}`;
            const aEndpoint = facadeFrameRunsForward(frames[aId]) ? 'end' : 'start';
            const bEndpoint = facadeFrameRunsForward(frames[bId]) ? 'start' : 'end';
            corners.push({
                cornerId,
                a: { faceId: aId, end: aEndpoint, depth: facadeProfileLoopEndDepth(frames[aId], profByFaceId[aId]) },
                b: { faceId: bId, end: bEndpoint, depth: facadeProfileLoopStartDepth(frames[bId], profByFaceId[bId]) },
                join: joinByCornerId[cornerId],
                frameCorner: facadeFrameLoopEnd(frames[aId])
            });
        }
        for (const c of corners) {
            const res = resolvedCornerStrategy.resolve(c.a, c.b, { cornerId: c.cornerId });
            const winnerFaceId = res?.winnerFaceId === c.a.faceId || res?.winnerFaceId === c.b.faceId ? res.winnerFaceId : c.a.faceId;
            cornerDebugList.push({
                cornerId: c.cornerId,
                strategyId: typeof resolvedCornerStrategy.id === 'string' ? resolvedCornerStrategy.id : null,
                winnerFaceId,
                a: c.a,
                b: c.b,
                join: c.join ? { x: c.join.x, z: c.join.z } : null,
                footprint: c.frameCorner ? { x: Number(c.frameCorner.x) || 0, z: Number(c.frameCorner.z) || 0 } : null
            });
        }
    }

    // Opening spans per face, in face u. A bevel cut may approach one of these
    // but never enter it, so a chamfer can never clip a window reveal.
    const openingSpansByFaceId = (() => {
        const byFace = {};
        for (const faceId of faceOrder) byFace[faceId] = [];
        for (const strip of faceOrder.flatMap((faceId) => profByFaceId[faceId].strips)) {
            if (strip?.type !== 'bay') continue;
            const faceId = strip?.faceId;
            if (!byFace[faceId]) continue;
            const win = strip?.window && typeof strip.window === 'object' ? strip.window : null;
            if (!win || win.enabled === false) continue;

            const u0 = Number.isFinite(Number(strip.frontU0)) ? Number(strip.frontU0) : (Number(strip.u0) || 0);
            const u1 = Number.isFinite(Number(strip.frontU1)) ? Number(strip.frontU1) : (Number(strip.u1) || 0);
            const span = Math.max(0, u1 - u0);
            if (!(span > EPS)) continue;

            const leftPad = clamp(win?.padding?.leftMeters ?? 0, 0, 9999);
            const rightPad = clamp(win?.padding?.rightMeters ?? 0, 0, 9999);
            const usable = Math.max(0, span - leftPad - rightPad);
            if (!(usable > EPS)) continue;

            const repeatCount = clampInt(win?.repeat?.count ?? 1, 1, 5);
            const slot = usable / repeatCount;
            const requested = Number(win?.size?.widthMeters ?? win?.width?.minMeters);
            const width = Math.min(slot, Number.isFinite(requested) && requested > 0 ? requested : slot);
            const slack = Math.max(0, (slot - width) * 0.5);
            const start = u0 + leftPad + slack;
            const end = u1 - rightPad - slack;
            if (end > start + EPS) byFace[faceId].push({ u0: start, u1: end });
        }
        return byFace;
    })();

    // The hole a window carves is wider than its glass — reveal, frame and any
    // surround live outside the glass line, and their width is only resolved
    // later in the opening pass. A chamfer that ate into that margin used to
    // shorten the wall segment the cut had to land on, and the opening lost its
    // hole entirely, so the glass span is padded by a reveal allowance here.
    const openingClearanceAtU = (faceId, u) => {
        const spans = openingSpansByFaceId?.[faceId] ?? null;
        if (!spans || !spans.length) return Infinity;
        let best = Infinity;
        for (const span of spans) {
            if (u > span.u0 - EPS && u < span.u1 + EPS) return 0;
            best = Math.min(best, u <= span.u0 ? (span.u0 - u) : (u - span.u1));
        }
        return Math.max(0, best - EDGE_BEVEL_OPENING_REVEAL_ALLOWANCE_METERS);
    };

    const cutPoint = (cornerId) => {
        const p = cornerCuts?.[cornerId]?.q ?? null;
        if (!p || typeof p !== 'object') return null;
        return { x: qf(p.x), y: 0, z: qf(p.z), kind: 'corner_cut' };
    };

    const loopDetail = [];
    for (let i = 0; i < faceCount; i++) {
        const faceId = faceOrder[i];
        const facePoints = ptsByFaceId[faceId];
        loopDetail.push(...(facadeFrameRunsForward(frames[faceId]) ? facePoints : facePoints.slice().reverse()));
        const cornerId = cornerIdAt(i);
        const boundaryTransition = crossBoundaryTransitionByCornerId[cornerId] ?? null;
        if (boundaryTransition) {
            for (const sample of boundaryTransition.samples.slice(1, -1)) {
                appendPointIfChanged(loopDetail, {
                    x: sample.x,
                    y: 0,
                    z: sample.z,
                    kind: 'boundary_transition',
                    boundaryTransitionId: boundaryTransition.id,
                    boundaryTransitionT: sample.t
                }, pointTol);
            }
        } else {
            const cut = cutPoint(cornerId);
            if (cut) loopDetail.push(cut);
        }
    }

    // AI 499 `all_convex_edges`: cut the arrises the bay relief itself creates
    // (relief steps, pier edges). This runs on the RESOLVED loop, after layout,
    // so it needs no solver involvement — but a cut may never reach into an
    // opening, so each vertex is capped by the distance from it to the nearest
    // opening on its own face.
    const bevelCfg = normalizeEdgeBevelConfig(edgeBevel);
    const wantsConvexBevel = !!bevelCfg && bevelCfg.scope === EDGE_BEVEL_SCOPE.ALL_CONVEX_EDGES;
    const beveledDetail = wantsConvexBevel
        ? bevelConvexLoopVertices({
            loop: loopDetail,
            widthMeters: bevelCfg.widthMeters,
            includeConcave: bevelCfg.includeConcave,
            // Corner facets and face joins are already resolved; only arrises
            // inside one face are "remaining" convex edges.
            skipVertex: ({ index }) => {
                const n = loopDetail.length;
                const cur = loopDetail[index];
                const prev = loopDetail[(index - 1 + n) % n];
                const next = loopDetail[(index + 1) % n];
                const faceId = cur?.faceId ?? null;
                if (!faceId || cur?.kind !== 'profile') return true;
                return prev?.faceId !== faceId || next?.faceId !== faceId;
            },
            maxCutbackFor: ({ vertex }) => {
                const faceId = vertex?.faceId ?? null;
                const u = Number(vertex?.u);
                if (!faceId || !Number.isFinite(u)) return 0;
                return openingClearanceAtU(faceId, u);
            },
            lerpVertex: (cur, toward, t) => ({
                ...cur,
                x: qf(cur.x + ((Number(toward.x) || 0) - cur.x) * t),
                z: qf(cur.z + ((Number(toward.z) || 0) - cur.z) * t),
                u: qf((Number(cur.u) || 0) + ((Number(toward.u) || 0) - (Number(cur.u) || 0)) * t),
                depth: qf((Number(cur.depth) || 0) + ((Number(toward.depth) || 0) - (Number(cur.depth) || 0)) * t)
            }),
            warnings
        }).loop
        : loopDetail;

    const simplified = simplifyLoopConsecutiveCollinearXZ(beveledDetail, { tol: pointTol, minEdge });
    if (!simplified || simplified.length < 4) {
        if (warnings) warnings.push('Facade silhouette: produced invalid loop.');
        return null;
    }
    if (boundaryTransitions.length && !isSimplePlanLoopXZ(simplified)) {
        if (warnings) warnings.push('Facade silhouette: a rounded bay boundary produced a self-intersecting wall loop.');
        return null;
    }

    const area = signedArea(simplified);
    const finalLoop = area < 0 ? simplified.slice().reverse() : simplified;
    const finalDetail = area < 0 ? beveledDetail.slice().reverse() : beveledDetail;

    const depthMinsByFaceId = {};
    for (const faceId of faceOrder) {
        depthMinsByFaceId[faceId] = qf(Math.min(...profByFaceId[faceId].profile.map((p) => Number(p?.depth) || 0)));
    }
    return {
        frames,
        cornerFacets,
        loop: finalLoop,
        loopDetail: finalDetail,
        strips: faceOrder.flatMap((faceId) => profByFaceId[faceId].strips),
        boundaryTransitions,
        depthMinsByFaceId
    };
}

// AI 492: rooftop props — ONE roof feature with a prop set (water tower, roof
// bulkhead, mech boxes, vent pipes) and seeded placement rules. Every part is
// emitted under a shared material role and merged per role, so a fully dressed
// roof costs at most four draw calls. The bulkhead defaults to the wall
// material below it: roof access is built out of the building, not dropped
// onto it.
const ROOFTOP_PROP_ROLE_DEFAULT_MATERIALS = Object.freeze({
    tank: Object.freeze({ colorHex: 0x6f4c31, roughness: 0.93, metalness: 0.0 }),
    frame: Object.freeze({ colorHex: 0x3a4046, roughness: 0.62, metalness: 0.55 }),
    bulkhead: Object.freeze({ colorHex: 0x9a958c, roughness: 0.9, metalness: 0.0 }),
    mech: Object.freeze({ colorHex: 0xb4b9be, roughness: 0.52, metalness: 0.35 })
});

function makeRooftopPropRoleMaterial({
    role,
    spec,
    layerMaterial,
    layerWallBase,
    layerTiling,
    baseColorHex,
    textureCache
}) {
    const wantsWallMatch = !spec && role === 'bulkhead' && !!layerMaterial;
    if (spec || wantsWallMatch) {
        return makeCorniceMaterialFromSpec({
            material: spec ?? { kind: 'match_wall' },
            tiling: null,
            layerMaterial,
            layerWallBase,
            layerTiling,
            baseColorHex,
            textureCache
        });
    }

    const defaults = ROOFTOP_PROP_ROLE_DEFAULT_MATERIALS[role];
    const mat = new THREE.MeshStandardMaterial({
        color: defaults.colorHex,
        roughness: defaults.roughness,
        metalness: defaults.metalness
    });
    disableIblOnMaterial(mat);
    return mat;
}

function buildRooftopPropMeshes({
    props = null,
    outerLoops = null,
    holeLoops = null,
    baseY = 0,
    seed = 0,
    layerMaterial = null,
    layerWallBase = null,
    layerTiling = null,
    baseColorHex = 0xffffff,
    textureCache = null,
    warnings = null
} = {}) {
    const cfg = normalizeRooftopPropsConfig(props);
    if (!cfg) return [];

    const loops = Array.isArray(outerLoops) ? outerLoops.filter((loop) => Array.isArray(loop) && loop.length >= 3) : [];
    if (!loops.length) return [];

    const geosByRole = new Map();
    let placedCount = 0;
    for (let loopIndex = 0; loopIndex < loops.length; loopIndex++) {
        const placements = solveRooftopPropPlacements({
            config: loopIndex === 0 ? cfg : { ...cfg, seedOffset: cfg.seedOffset + (loopIndex * 101) },
            outerLoop: loops[loopIndex],
            holeLoops,
            seed,
            warnings
        });
        placedCount += placements.length;
        for (const placement of placements) {
            for (const part of buildRooftopPropParts({ placement, baseY })) {
                let list = geosByRole.get(part.role);
                if (!list) {
                    list = [];
                    geosByRole.set(part.role, list);
                }
                list.push(part.geometry);
            }
        }
    }
    if (!placedCount) return [];

    const meshes = [];
    for (const role of ROOFTOP_PROP_MATERIAL_ROLE_IDS) {
        const geos = geosByRole.get(role);
        if (!geos?.length) continue;
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (geos.length > 1) for (const g of geos) g.dispose();
        if (!merged) continue;

        const mesh = new THREE.Mesh(merged, makeRooftopPropRoleMaterial({
            role,
            spec: cfg.materials?.[role] ?? null,
            layerMaterial,
            layerWallBase,
            layerTiling,
            baseColorHex,
            textureCache
        }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = mesh.userData ?? {};
        mesh.userData.buildingFab2Role = 'rooftop_prop';
        mesh.userData.rooftopPropMaterialRole = role;
        mesh.userData.rooftopPropCount = placedCount;
        meshes.push(mesh);
    }
    return meshes;
}

export function buildBuildingFabricationVisualParts({
    map,
    tiles,
    footprintLoops = null,
    buildAreaLoops = null,
    footprintPlacement = null,
    fitToLot = false,
    footprintStretch = null,
    generatorConfig = null,
    tileSize = null,
    occupyRatio = 1.0,
    layers = null,
    materialVariationSeed = null,
    textureCache = null,
    renderer = null,
    windowVisuals = null,
    windowVisualsIsOverride = false,
    facades = null,
    wallDecorations = null,
    attachments = null,
    cornerTreatment = null,
    edgeBevel = null,
    materialSlots = null,
    facadeCornerStrategy = null,
    facadeCornerStrategyId = null,
    facadeCornerDebug = false,
    windowDefinitions = null,
    portalDefinitions = null,
    colors = null,
    overlays = null,
    walls = null,
    debug = null
} = {}) {
    // AI 499: the plan-edge bevel cuts the wall silhouette itself, so it is
    // resolved once here and applied to every layer's wall-outer loop before
    // facade solving — the faces then lay their bays out on the shortened
    // length instead of having their outer bays clipped afterwards.
    const edgeBevelCfg = normalizeEdgeBevelConfig(edgeBevel);
    const edgeBevelFacetsByCornerId = {};
    const applyEdgeBevelToOuterLoops = (loops, { collectFacets = false, warnings: bevelWarnings = null } = {}) => {
        const list = Array.isArray(loops) ? loops : [];
        if (!edgeBevelCfg || !list.length) return list;
        return list.map((loop, index) => {
            if (index > 0) return loop;
            const res = bevelRectLoopMainCorners({ loop, config: edgeBevelCfg, warnings: bevelWarnings });
            if (collectFacets) {
                for (const facet of res.facets) edgeBevelFacetsByCornerId[facet.cornerId] = facet;
            }
            return res.loop;
        });
    };
    const warnings = [];
    const explicitFootprintLoops = normalizeFootprintLoopsInput(footprintLoops);
    const explicitBuildAreaLoops = normalizeFootprintLoopsInput(buildAreaLoops);
    // Slot / brick preset resolution needs the per-building seed (tint
    // jitter); footprint fitting only reads dimensional fields, so it runs on
    // the unresolved layers first.
    const safeLayersForFit = normalizeBuildingLayers(layers);
    const cornerTreatmentCfgForFit = normalizeCornerTreatmentConfig(cornerTreatment);
    const lotFitSolvability = fitToLot && explicitFootprintLoops.length === 1
        ? createFacadeLotFitSolvability({ layers: safeLayersForFit, facades, footprintLoop: explicitFootprintLoops[0] })
        : null;
    const fitSeed = Number.isFinite(materialVariationSeed)
        ? (Number(materialVariationSeed) >>> 0)
        : ((Array.isArray(tiles) && tiles.length)
            ? computeMaterialVariationSeedFromTiles(tiles, { salt: 'lot_fit' })
            : computeMaterialVariationSeedFromFootprintLoops(explicitFootprintLoops, { salt: 'lot_fit' }));
    const lotFitCapture = { sourceLoop: null, result: null, provenance: null };
    const fittedExplicitFootprintLoops = (explicitFootprintLoops.length && explicitBuildAreaLoops.length)
        ? fitFootprintLoopsToBuildArea({
            footprintLoops: explicitFootprintLoops,
            buildAreaLoops: explicitBuildAreaLoops,
            reserveInsetMeters: estimateBf2OutwardFootprintReserveMeters({ layers: safeLayersForFit, facades, cornerTreatment: cornerTreatmentCfgForFit, windowDefinitions }),
            mode: normalizeFootprintPlacementMode(footprintPlacement),
            fitToLot,
            footprintStretch,
            fitSeed,
            lotFitSolvability,
            warnings,
            fitCapture: lotFitCapture
        })
        : explicitFootprintLoops;
    const sourceFootprintLoops = fittedExplicitFootprintLoops.length
        ? fittedExplicitFootprintLoops
        : computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
    if (!sourceFootprintLoops.length) return null;

    const tileCount = Array.isArray(tiles) ? tiles.length : 0;
    const baseColorHex = makeDeterministicColor(tileCount * 97 + safeLayersForFit.length * 31).getHex();
    const matVarSeed = Number.isFinite(materialVariationSeed)
        ? (Number(materialVariationSeed) >>> 0)
        : ((tileCount > 0)
            ? computeMaterialVariationSeedFromTiles(tiles, { salt: 'building' })
            : computeMaterialVariationSeedFromFootprintLoops(sourceFootprintLoops, { salt: 'building' }));

    // Config pre-pass (AI 491): resolve building-level material slot and
    // brick preset references into explicit specs. Resolution order per
    // feature: explicit material > slot reference > legacy match_* modes.
    const materialResolution = resolveBuildingConfigMaterials({
        layers,
        facades,
        wallDecorations,
        cornerTreatment,
        windowDefinitions,
        portalDefinitions,
        materialSlots,
        seed: matVarSeed,
        warnings
    });
    const safeLayers = normalizeBuildingLayers(materialResolution.layers);
    const cornerTreatmentCfg = normalizeCornerTreatmentConfig(materialResolution.cornerTreatment);
    const resolvedFacades = materialResolution.facades;
    const resolvedWallDecorations = materialResolution.wallDecorations;

    // AI 490: facade attachments — ONE feature with types as modes. AC units
    // scatter over eligible opening instances (deterministic per building
    // seed); fire escapes run down a targeted window column.
    const attachmentsCfg = normalizeFacadeAttachmentsConfig(attachments);
    const acAttachmentItems = attachmentsCfg
        ? attachmentsCfg.items.filter((it) => it.type === FACADE_ATTACHMENT_TYPE.AC_UNIT)
        : [];
    const fireEscapeAttachmentItems = attachmentsCfg
        ? attachmentsCfg.items.filter((it) => it.type === FACADE_ATTACHMENT_TYPE.FIRE_ESCAPE)
        : [];
    // AI 508: facade lettering signs (slot refs already resolved by the
    // material pre-pass above).
    const facadeLetteringItems = normalizeFacadeLetteringItems(resolvedWallDecorations, warnings);
    const acUnitGeosByItemIndex = new Map();
    const resolvedWindowDefinitions = materialResolution.windowDefinitions;

    const firstFloorLayer = safeLayers.find((layer) => layer?.type === LAYER_TYPE.FLOOR) ?? null;
    const firstFloorHeight = clamp(firstFloorLayer?.floorHeight ?? 3.2, 1.0, 12.0);
    const { baseY, extraFirstFloor, planY } = computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight: firstFloorHeight });
    const matVarHeightMax = estimateFabricationHeightMax({ baseY, extraFirstFloor, layers: safeLayers });
    const layerPlanLoopsById = resolveFloorLayerPlanLoops({
        layers: safeLayers,
        defaultLoops: sourceFootprintLoops,
        authoredDefaultLoops: explicitFootprintLoops,
        lotFitCapture,
        minRunLengthsForLayer: ({ layer, loop }) => createFacadeLotFitSolvability({
            layers: [layer],
            facades: resolvedFacades,
            footprintLoop: loop
        }).minLengthByRunId,
        warnings
    });
    const floorLayerTransitionPlans = planLayerSilhouetteTransitionSurfaces({ layers: safeLayers, layerPlanLoopsById });
    const transitionSurfaceUpperLayerIds = new Set(floorLayerTransitionPlans.map((entry) => entry.upperLayerId));
    const transitionLowerLayerIdByUpperLayerId = new Map(
        floorLayerTransitionPlans.map((entry) => [entry.upperLayerId, entry.lowerLayerId])
    );
    const overlayLoops = (typeof firstFloorLayer?.id === 'string'
        ? layerPlanLoopsById.get(firstFloorLayer.id)
        : null)
        ?? applyPlanOffset({ loops: sourceFootprintLoops, offset: firstFloorLayer?.planOffset ?? 0.0 }).all;

    const wallInset = clamp(walls?.inset, 0.0, 4.0);
    const lineColor = colors?.line ?? 0xff3b30;
    const borderColor = colors?.border ?? 0x64d2ff;

    const enabled = overlays ?? {};
    const showWire = enabled.wire ?? true;
    const showPlan = enabled.floorplan ?? true;
    const showBorder = enabled.border ?? true;
    const showFloors = enabled.floorDivisions ?? true;
    const debugFlags = debug && typeof debug === 'object' ? debug : null;
    const debugDisableSuspect4FaceOverrideOverlay = !!debugFlags?.disableSuspect4FaceOverrideOverlay;

    const solidMeshes = [];
    const wirePositions = [];
    const floorPositions = [];
    const facadeSolverDebug = {};
    const facadeCornerDebugByLayerId = facadeCornerDebug ? {} : null;

    const windowsGroup = new THREE.Group();
    windowsGroup.name = 'windows';
    windowsGroup.userData = windowsGroup.userData ?? {};
    const baseReflectiveCfg = resolveBuildingWindowReflectiveConfig(windowVisuals);
    const baseVisualsOverride = !!windowVisualsIsOverride;
    const windowDefinitionById = new Map();
    const registerWindowDefinition = (entry, { fallbackAssetType = WINDOW_FABRICATION_ASSET_TYPE.WINDOW } = {}) => {
        const id = typeof entry?.id === 'string' ? entry.id : '';
        if (!id) return;
        const settings = sanitizeWindowMeshSettings(entry?.settings ?? null);
        const widthMetersRaw = Number(settings?.width);
        const heightMetersRaw = Number(settings?.height);
        const widthMeters = Number.isFinite(widthMetersRaw) ? clamp(widthMetersRaw, 0.1, 20.0) : null;
        const heightMeters = Number.isFinite(heightMetersRaw) ? clamp(heightMetersRaw, 0.1, 20.0) : null;
        const assetType = normalizeWindowFabricationAssetType(
            entry?.assetType ?? entry?.openingType,
            fallbackAssetType
        );
        const garageFacade = normalizeGarageFacadeConfig(entry?.garageFacade ?? null, null);
        const wall = normalizeOpeningWallCutConfig(entry?.wall ?? null, null);
        const decoration = deepClone(entry?.decoration ?? null);
        const storefront = assetType === WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT
            ? normalizeStorefrontConfig(entry?.storefront ?? null)
            : null;
        const portal = normalizePortalConfig(entry?.portal ?? null);
        const insets = normalizeOpeningInsetsConfig(entry?.insets ?? null);
        windowDefinitionById.set(id, {
            id,
            assetType,
            settings,
            garageFacade,
            wall,
            decoration,
            storefront,
            portal,
            insets,
            widthMeters,
            heightMeters
        });
    };
    const catalogDefinitions = getWindowFabricationCatalogEntries();
    for (const entry of catalogDefinitions) {
        registerWindowDefinition(entry, { fallbackAssetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW });
    }
    const windowDefinitionItems = Array.isArray(resolvedWindowDefinitions?.items) ? resolvedWindowDefinitions.items : [];
    for (const entry of windowDefinitionItems) {
        registerWindowDefinition(entry, { fallbackAssetType: WINDOW_FABRICATION_ASSET_TYPE.WINDOW });
    }

    // AI 510: portal fabrication defs — catalog entries plus building-level
    // overrides (slot refs already resolved by the material pre-pass).
    const resolvedPortalDefinitions = materialResolution.portalDefinitions;
    const portalDefById = new Map();
    for (const entry of getPortalFabricationCatalogEntries()) portalDefById.set(entry.id, entry);
    for (const entry of (Array.isArray(resolvedPortalDefinitions?.items) ? resolvedPortalDefinitions.items : [])) {
        const def = normalizePortalFabricationDef(entry);
        if (def) portalDefById.set(def.id, def);
    }
    const defaultWindowDefinitionByAssetType = new Map();
    for (const entry of windowDefinitionById.values()) {
        const assetType = normalizeWindowFabricationAssetType(
            entry?.assetType,
            WINDOW_FABRICATION_ASSET_TYPE.WINDOW
        );
        if (!defaultWindowDefinitionByAssetType.has(assetType)) {
            defaultWindowDefinitionByAssetType.set(assetType, entry);
        }
    }
    const windowMeshGenerator = new WindowMeshGenerator({ renderer, curveSegments: 28 });

    windowsGroup.userData.buildingWindowVisuals = Object.freeze({
        reflective: Object.freeze({
            enabled: baseReflectiveCfg.enabled,
            opacity: baseReflectiveCfg.opacity,
            layerOffset: baseReflectiveCfg.layerOffset,
            glass: Object.freeze({
                colorHex: baseReflectiveCfg.glass.colorHex,
                metalness: baseReflectiveCfg.glass.metalness,
                roughness: baseReflectiveCfg.glass.roughness,
                transmission: baseReflectiveCfg.glass.transmission,
                ior: baseReflectiveCfg.glass.ior,
                envMapIntensity: baseReflectiveCfg.glass.envMapIntensity
            })
        })
    });

    const makeGlassMaterial = (alphaMap, reflectiveCfg = null, { isOverride = false } = {}) => {
        const cfg = reflectiveCfg && typeof reflectiveCfg === 'object' ? reflectiveCfg : baseReflectiveCfg;
        const wantsTransmission = cfg.glass.transmission > 0.01;
        const mat = new THREE.MeshPhysicalMaterial({
            color: cfg.glass.colorHex,
            metalness: cfg.glass.metalness,
            roughness: cfg.glass.roughness,
            transmission: wantsTransmission ? cfg.glass.transmission : 0.0,
            ior: cfg.glass.ior,
            envMapIntensity: cfg.glass.envMapIntensity,
            opacity: cfg.opacity
        });
        mat.transparent = true;
        mat.alphaMap = alphaMap ?? null;
        mat.alphaTest = 0.5;
        mat.depthWrite = false;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
        mat.userData = mat.userData ?? {};
        mat.userData.iblEnvMapIntensityScale = cfg.glass.envMapIntensity;
        mat.userData.buildingWindowGlass = true;
        mat.userData.buildingWindowGlassOverride = !!isOverride;
        mat.userData.buildingWindowGlassEnabled = !!cfg.enabled;
        return mat;
    };

    const resolvedCornerStrategy = facadeCornerStrategy && typeof facadeCornerStrategy === 'object' && typeof facadeCornerStrategy.resolve === 'function'
        ? facadeCornerStrategy
        : resolveRectFacadeCornerStrategy(facadeCornerStrategyId);

    const planeGeoCache = new Map();
    const getPlaneGeometry = (width, height) => {
        const w = Number(width) || 1;
        const h = Number(height) || 1;
        const key = `${q(w)}|${q(h)}`;
        let geo = planeGeoCache.get(key);
        if (!geo) {
            geo = new THREE.PlaneGeometry(w, h);
            planeGeoCache.set(key, geo);
        }
        return geo;
    };

    const instancedBuckets = new Map();
    const addWindowInstance = ({ geometry, material, x, y, z, yaw, renderOrder }) => {
        if (!geometry || !material) return;
        const ro = Number.isFinite(renderOrder) ? renderOrder : 0;
        const key = `${geometry.uuid}|${material.uuid}|ro:${ro}`;
        let bucket = instancedBuckets.get(key);
        if (!bucket) {
            bucket = {
                geometry,
                material,
                renderOrder: ro,
                transforms: []
            };
            instancedBuckets.set(key, bucket);
        }
        bucket.transforms.push(Number(x) || 0, Number(y) || 0, Number(z) || 0, Number(yaw) || 0);
    };

    const beltsGroup = new THREE.Group();
    beltsGroup.name = 'belts';

    const roofRingGroup = new THREE.Group();
    roofRingGroup.name = 'roof_rings';

    const roofMatTemplate = new THREE.MeshStandardMaterial({
        color: resolveRoofColorHex(ROOF_COLOR.DEFAULT, baseColorHex),
        roughness: 0.85,
        metalness: 0.05
    });
    disableIblOnMaterial(roofMatTemplate);

    // Slabs between stacked layers are floors, not roofs: they share the
    // interior floor material so interior and exposed slab areas always match.
    const floorSlabMatTemplate = makeWallMaterialFromSpec({
        material: FLOOR_INTERIOR_MATERIAL_SPEC,
        baseColorHex,
        textureCache
    });
    applyFixedTileMetersToMaterial(floorSlabMatTemplate, {
        materialSpec: FLOOR_INTERIOR_MATERIAL_SPEC,
        tileMeters: FLOOR_INTERIOR_TILE_METERS
    });

    let currentLoops = sourceFootprintLoops;
    let yCursor = baseY;
    let firstFloorPendingExtra = extraFirstFloor;

    const facadesRaw = resolvedFacades && typeof resolvedFacades === 'object' ? resolvedFacades : null;
    const facadesAreGlobal = !!facadesRaw && facadeSpecFaceIds(facadesRaw).length > 0;
    const globalFacadeSpec = facadesAreGlobal ? facadesRaw : null;
    const facadesByLayerId = facadesAreGlobal ? null : facadesRaw;

    const wantsFacadePatterns = !!globalFacadeSpec && facadeSpecFaceIds(globalFacadeSpec).some((id) => !!globalFacadeSpec?.[id]?.layout?.pattern);

    // AI 493: bay repeat topology is resolved ONCE per face and replayed on
    // every layer that authors the SAME bay layout, so a setback layer keeps
    // the column rhythm of the layers below instead of re-fitting to its own
    // shorter face. Keying by the layout (not by "the facade spec is global")
    // is what makes the lock work for per-layer facades too, which is the only
    // shape the BF2 editor writes — layers that deliberately author different
    // bays stay independent because their key differs.
    const facadeBayLockWanted = (layout) => {
        const bays = Array.isArray(layout?.bays?.items) ? layout.bays.items : null;
        if (!bays || !bays.length) return false;
        return normalizeFacadeStackingSpec(layout?.stacking ?? null).mode === FACADE_BAY_STACKING_MODE.LOCK_COLUMNS;
    };
    const silhouetteCompatibilityGroupByLayerId = new Map();
    let previousSilhouetteCompatibilityGroup = 'building_default';
    for (const candidate of safeLayers) {
        if (candidate?.type !== LAYER_TYPE.FLOOR) continue;
        const silhouette = candidate?.silhouette && typeof candidate.silhouette === 'object'
            ? candidate.silhouette
            : null;
        let group = 'building_default';
        if (silhouette?.mode === LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS) {
            group = previousSilhouetteCompatibilityGroup;
        } else if (silhouette?.mode === LAYER_SILHOUETTE_MODE.DETACHED) {
            group = silhouetteCompatibilityGroupByLayerId.get(silhouette.sourceLayerId)
                ?? (silhouette.sourceLayerId === 'building_default' ? 'building_default' : null)
                ?? `detached:${candidate.id}`;
        }
        silhouetteCompatibilityGroupByLayerId.set(candidate.id, group);
        previousSilhouetteCompatibilityGroup = group;
    }
    const facadeFrameCompatibilityKey = (frame) => {
        if (!frame) return 'unknown';
        const mid = sampleFacadeFrameAtU(frame, (Number(frame.length) || 0) * 0.5);
        const tx = Math.round((Number(mid?.t?.x) || 0) * 1000) / 1000;
        const tz = Math.round((Number(mid?.t?.z) || 0) * 1000) / 1000;
        const curveKind = frame.curve
            ? `arc:${Math.sign(Number(frame.curve?.sweep) || 0)}`
            : 'line';
        return `${curveKind}:${tx}:${tz}`;
    };
    const facadeBayLockKey = (layer, faceId, layout, frame = null) => {
        if (!facadeBayLockWanted(layout)) return null;
        const group = silhouetteCompatibilityGroupByLayerId.get(layer?.id) ?? 'building_default';
        return `${group}:${faceId}:${facadeFrameCompatibilityKey(frame)}:${stableStringify({ bays: layout.bays.items, groups: layout?.groups?.items ?? null })}`;
    };
    const facadeSpecForLayer = (layer) => globalFacadeSpec
        ?? ((facadesByLayerId?.[layer?.id] && typeof facadesByLayerId[layer.id] === 'object')
            ? facadesByLayerId[layer.id]
            : null);

    // AI 487/520: capital/base continuity is semantic, not positional. Two
    // stacked bays suppress their touching ornaments only when the actual run
    // identity, direction (including linked-face reversal), silhouette lineage
    // and facade design all continue across the layer boundary.
    const capitalBayKeysByLayerId = new Map();
    const capitalBayKeyByLayerFaceBayRef = new Map();
    for (const layer of safeLayers) {
        if (layer?.type !== LAYER_TYPE.FLOOR || typeof layer?.id !== 'string') continue;
        const keys = new Set();
        const keyByFaceBayRef = new Map();
        const layerFacades = facadeSpecForLayer(layer);
        const planLoop = layerPlanLoopsById.get(layer.id)?.[0] ?? null;
        const frames = planLoop ? computeFacadeFramesFromLoop(planLoop, { warnings: null }) : null;
        const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object'
            ? layer.faceLinking.links
            : null;
        const reverseByFace = layer?.faceLinking?.reverseByFace && typeof layer.faceLinking.reverseByFace === 'object'
            ? layer.faceLinking.reverseByFace
            : null;
        const resolveMaster = (faceId) => {
            const seen = new Set();
            let cur = faceId;
            for (let i = 0; i < 8; i++) {
                if (seen.has(cur)) break;
                seen.add(cur);
                const next = links?.[cur] ?? null;
                if (!isFaceId(next) || next === cur) return cur;
                cur = next;
            }
            return faceId;
        };
        const lineageId = silhouetteCompatibilityGroupByLayerId.get(layer.id) ?? `detached:${layer.id}`;
        for (const faceId of facadeFaceIdsOf(frames)) {
            const masterFaceId = resolveMaster(faceId);
            const facade = layerFacades?.[masterFaceId] && typeof layerFacades[masterFaceId] === 'object'
                ? layerFacades[masterFaceId]
                : null;
            const bays = facade?.layout?.bays?.items;
            if (!Array.isArray(bays)) continue;
            const runPoint = Array.isArray(planLoop)
                ? (planLoop.find((point) => point?.runId === faceId) ?? null)
                : null;
            const geometricForward = runPoint?.runForward !== false;
            const effectiveForward = reverseByFace?.[faceId] ? !geometricForward : geometricForward;
            const frame = frames?.[faceId] ?? null;
            const designKey = stableStringify({
                bays,
                groups: facade?.layout?.groups?.items ?? null,
                frame: frame ? {
                    start: [qf(frame.start?.x), qf(frame.start?.z)],
                    end: [qf(frame.end?.x), qf(frame.end?.z)],
                    length: qf(frame.length),
                    curve: frame.curve ? [
                        qf(frame.curve.center?.x),
                        qf(frame.curve.center?.z),
                        qf(frame.curve.radius),
                        qf(frame.curve.sweep)
                    ] : null
                } : null
            });
            for (const bay of bays) {
                const bayId = typeof bay?.id === 'string' ? bay.id : '';
                if (!bayId || !bay?.capital || typeof bay.capital !== 'object') continue;
                const key = createFacadeRunContinuityKey({
                    lineageId,
                    runId: runPoint?.runId ?? faceId,
                    runForward: effectiveForward,
                    bayId,
                    designKey
                });
                if (key) {
                    keys.add(key);
                    keyByFaceBayRef.set(`${faceId}:${bayId}`, key);
                }
            }
        }
        capitalBayKeysByLayerId.set(layer.id, keys);
        capitalBayKeyByLayerFaceBayRef.set(layer.id, keyByFaceBayRef);
    }
    const wantsFacadeBayLock = safeLayers.some((layer) => {
        if (layer?.type !== LAYER_TYPE.FLOOR) return false;
        const spec = facadeSpecForLayer(layer);
        return facadeSpecFaceIds(spec).some((id) => facadeBayLockWanted(spec?.[id]?.layout ?? null));
    });


    const facadePatternTopologyByFaceId = new Map();
    const facadeBayTopologyByKey = new Map();
    const bayHighlightDataByLayerId = {};
    // Per-layer face edge lines in built (world) space, so editors highlight
    // the actual face — the bounding-box quad mapping is wrong on N-gons.
    const facadeFaceLinesByLayerId = {};
    const facadeSurfaceRunsByLayerId = {};
    const floorSegmentsByLayerId = new Map();
    const floorLayerById = new Map();
    if (wantsFacadePatterns || wantsFacadeBayLock) {
        const minFaceLengthByFaceId = {};
        const bayLockProbeByKey = new Map();
        for (const layer of safeLayers) {
            if (layer?.type !== LAYER_TYPE.FLOOR) continue;
            const planLoops = layerPlanLoopsById.get(layer.id) ?? sourceFootprintLoops;
            const { outer: wallOuterRaw } = applyWallInset({ loops: planLoops, inset: wallInset });
            const wallOuter = applyEdgeBevelToOuterLoops(wallOuterRaw);
            const main = Array.isArray(wallOuter) ? wallOuter[0] : null;
            const frames = main ? computeFacadeFramesFromLoop(main, { warnings: null }) : null;
            if (frames) {
                const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object'
                    ? layer.faceLinking.links
                    : null;
                const resolveMaster = (faceId) => {
                    const seen = new Set();
                    let cur = faceId;
                    for (let i = 0; i < 8; i++) {
                        if (seen.has(cur)) break;
                        seen.add(cur);
                        const next = links?.[cur] ?? null;
                        if (next === null || next === undefined || next === cur) return cur;
                        cur = next;
                    }
                    return faceId;
                };
                const layerFacadeSpec = facadeSpecForLayer(layer);
                for (const faceId of facadeFaceIdsOf(frames)) {
                    const L = Number(frames?.[faceId]?.length) || 0;
                    if (!(L > EPS)) continue;
                    minFaceLengthByFaceId[faceId] = Math.min(minFaceLengthByFaceId[faceId] ?? Infinity, L);

                    if (!wantsFacadeBayLock) continue;
                    const layout = layerFacadeSpec?.[resolveMaster(faceId)]?.layout ?? null;
                    const key = facadeBayLockKey(layer, faceId, layout, frames?.[faceId] ?? null);
                    if (!key) continue;
                    const probe = bayLockProbeByKey.get(key) ?? null;
                    if (probe) probe.referenceLength = Math.max(probe.referenceLength, L);
                    else bayLockProbeByKey.set(key, { referenceLength: L, layout });
                }
            }
        }

        for (const [key, probe] of bayLockProbeByKey) {
            const layout = probe?.layout ?? null;
            const bays = Array.isArray(layout?.bays?.items) ? layout.bays.items : null;
            if (!bays || !bays.length) continue;
            if (!Number.isFinite(probe.referenceLength) || !(probe.referenceLength > EPS)) continue;
            facadeBayTopologyByKey.set(key, computeFacadeBaysTopology({
                bays,
                groups: Array.isArray(layout?.groups?.items) ? layout.groups.items : null,
                faceLengthMeters: probe.referenceLength,
                warnings
            }));
        }

        for (const faceId of facadeSpecFaceIds(globalFacadeSpec)) {
            if (!wantsFacadePatterns) break;
            const facade = globalFacadeSpec?.[faceId] ?? null;
            const pattern = facade?.layout?.pattern ?? null;
            if (!pattern || typeof pattern !== 'object') continue;
            const refLen = minFaceLengthByFaceId[faceId];
            if (!Number.isFinite(refLen) || !(refLen > EPS)) continue;
            const res = solveFacadeLayoutFillPattern({
                pattern,
                faceLengthMeters: refLen,
                topology: null,
                warnings
            });
            if (res?.topology) facadePatternTopologyByFaceId.set(faceId, res.topology);
            facadeSolverDebug[faceId] = {
                referenceFaceLengthMeters: refLen,
                debug: res?.debug ?? null,
                topology: res?.topology ?? null
            };
        }
    }

    let lastFloorLayer = null;
    for (let layerIndex = 0; layerIndex < safeLayers.length; layerIndex++) {
        const layer = safeLayers[layerIndex];
        const type = layer?.type;
        if (type === LAYER_TYPE.FLOOR) {
            lastFloorLayer = layer;
            const planLoops = layerPlanLoopsById.get(layer.id) ?? currentLoops;
            const { outer: planOuter, holes: planHoles } = splitLoops(planLoops);

            const { outer: wallOuterRaw, holes: wallHoles } = applyWallInset({ loops: planLoops, inset: wallInset });
            const wallOuter = applyEdgeBevelToOuterLoops(wallOuterRaw, { collectFacets: true, warnings });
            let wallOuterFacade = wallOuter;
            let facadeFrames = null;
            let facadeLoopDetail = null;
            let facadeStrips = null;
            let facadeBoundaryTransitions = null;
            let facadeDepthMinsByFaceId = null;

            const floors = clampInt(layer.floors, 0, 99);
            const floorHeight = clamp(layer.floorHeight, 1.0, 12.0);
            const wallMat = makeWallMaterialFromSpec({
                material: layer.material,
                baseColorHex,
                textureCache,
                wallBase: layer?.wallBase ?? null
            });
            const wallStyleId = layer.material?.kind === 'texture' ? layer.material.id : null;
            const wallUrls = wallStyleId ? resolveBuildingStyleWallMaterialUrls(wallStyleId) : null;
            const wallTiling = layer?.tiling ?? null;
            const wallUvCfg = computeUvTilingParams({ tiling: wallTiling, urls: wallUrls, styleId: wallStyleId });
            if (wallUvCfg.apply) {
                applyUvTilingToMeshStandardMaterial(wallMat, {
                    scaleU: wallUvCfg.scaleU,
                    scaleV: wallUvCfg.scaleV,
                    offsetU: wallUvCfg.offsetU,
                    offsetV: wallUvCfg.offsetV,
                    rotationDegrees: wallUvCfg.rotationDegrees
                });
            }

            const wallMatVar = layer?.materialVariation ?? null;
            if (wallMatVar?.enabled) {
                applyMaterialVariationToMeshStandardMaterial(wallMat, {
                    seed: matVarSeed,
                    seedOffset: clampInt(wallMatVar?.seedOffset ?? 0, -9999, 9999),
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    config: wallMatVar,
                    root: MATERIAL_VARIATION_ROOT.WALL,
                    cornerDist: true
                });
            }

            const layerId = typeof layer?.id === 'string' ? layer.id : '';
            if (layerId && !floorLayerById.has(layerId)) floorLayerById.set(layerId, layer);
            const layerFacadeSpec = globalFacadeSpec
                ? globalFacadeSpec
                : ((layerId && facadesByLayerId?.[layerId] && typeof facadesByLayerId[layerId] === 'object') ? facadesByLayerId[layerId] : null);
            const hasAuthoredCurvedRun = wallOuter.some((loop) => (
                Array.isArray(loop) && loop.some((point, index) => (
                    !!resolveFootprintArcRun(point, loop[(index + 1) % loop.length], point?.arc)
                ))
            ));
            // The facade-profile path is also the curved-wall path. A layer
            // with no facade layout still needs its authored arcs sampled into
            // the vertical shell rather than falling back to chord-only planes.
            const wantsFacadeSilhouette = hasAuthoredCurvedRun
                || (!!layerFacadeSpec && facadeSpecFaceIds(layerFacadeSpec).length > 0);

            if (wantsFacadeSilhouette && wallOuter.length) {
                const main = wallOuter[0] ?? null;
                const frames = main ? computeFacadeFramesFromLoop(main, { warnings }) : null;
                if (frames) {
                    const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object' ? layer.faceLinking.links : null;
                    const reverseByFace = layer?.faceLinking?.reverseByFace && typeof layer.faceLinking.reverseByFace === 'object'
                        ? layer.faceLinking.reverseByFace
                        : null;
                    const resolveMasterFaceId = (faceId) => {
                        const seen = new Set();
                        let cur = faceId;
                        for (let i = 0; i < 8; i++) {
                            if (seen.has(cur)) break;
                            seen.add(cur);
                            const next = links?.[cur] ?? null;
                            if (next === null || next === undefined) return cur;
                            if (next === cur) return cur;
                            cur = next;
                        }
                        return faceId;
                    };

                    const next = {};
                    for (const faceId of facadeFaceIdsOf(frames)) {
                        const masterFaceId = resolveMasterFaceId(faceId);
                        const srcFacade = (layerFacadeSpec?.[masterFaceId] && typeof layerFacadeSpec[masterFaceId] === 'object')
                            ? layerFacadeSpec[masterFaceId]
                            : null;

                        const srcLayout = srcFacade?.layout && typeof srcFacade.layout === 'object' ? srcFacade.layout : null;
                        const len = Number(frames?.[faceId]?.length) || 0;

                        const bays = Array.isArray(srcLayout?.bays?.items) ? srcLayout.bays.items : null;
                        const groups = Array.isArray(srcLayout?.groups?.items) ? srcLayout.groups.items : null;
                        const hasBays = !!bays && bays.length > 0;
                        const baysForSolve = hasBays
                            ? resolveLinkedFaceBaysForSolve({ bays, faceId, masterFaceId, reverseByFace })
                            : null;
                        const bayItems = hasBays
                            ? solveFacadeBaysLayout({
                                bays: baysForSolve,
                                groups,
                                faceLengthMeters: len,
                                topology: facadeBayTopologyByKey.get(facadeBayLockKey(layer, faceId, srcLayout, frames?.[faceId] ?? null) ?? '') ?? null,
                                warnings
                            })
                            : null;

                        let solvedPatternItems = null;
                        if (!hasBays) {
                            const pattern = srcLayout?.pattern ?? null;
                            if (pattern && typeof pattern === 'object') {
                                const topology = facadePatternTopologyByFaceId.get(masterFaceId) ?? null;
                                const solved = solveFacadeLayoutFillPattern({
                                    pattern,
                                    faceLengthMeters: len,
                                    topology: globalFacadeSpec ? topology : null,
                                    warnings
                                });
                                solvedPatternItems = Array.isArray(solved?.items) ? solved.items : null;
                            }
                        }

                        const faceCfg = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
                            ? faceMaterials[masterFaceId]
                            : null;
                        const faceMaterialSpec = faceCfg?.material && typeof faceCfg.material === 'object' ? faceCfg.material : null;
                        const hasFaceMaterialSpec = !!faceMaterialSpec
                            && (faceMaterialSpec.kind === 'texture' || faceMaterialSpec.kind === 'color')
                            && typeof faceMaterialSpec.id === 'string'
                            && !!faceMaterialSpec.id;

                        if (!srcFacade && !hasFaceMaterialSpec && !hasBays && !solvedPatternItems && !hasAuthoredCurvedRun) continue;

                        const base = srcFacade ? { ...srcFacade } : {};
                        const layout = (base.layout && typeof base.layout === 'object') ? { ...base.layout } : {};
                        if (Array.isArray(bayItems)) layout.items = bayItems;
                        else if (Array.isArray(solvedPatternItems)) layout.items = solvedPatternItems;
                        base.layout = layout;

                        if (hasFaceMaterialSpec) {
                            base.wallMaterial = { kind: faceMaterialSpec.kind, id: faceMaterialSpec.id };
                        }
                        next[faceId] = base;
                    }

                    const cornerDebugList = facadeCornerDebugByLayerId ? [] : null;
                    const res = computeQuadFacadeSilhouette({
                        wallOuter,
                        facades: next,
                        layerMaterial: layer.material,
                        bayBoundaryConnections: layer?.bayBoundaryConnections ?? null,
                        warnings,
                        cornerStrategy: resolvedCornerStrategy,
                        cornerDebug: cornerDebugList,
                        edgeBevel: edgeBevelCfg
                    });
                    if (res?.loop?.length) {
                        wallOuterFacade = [res.loop];
                        facadeFrames = res.frames ?? null;
                        facadeLoopDetail = res.loopDetail ?? null;
                        facadeStrips = Array.isArray(res.strips) ? res.strips : null;
                        facadeBoundaryTransitions = Array.isArray(res.boundaryTransitions) ? res.boundaryTransitions : null;
                        facadeDepthMinsByFaceId = res.depthMinsByFaceId ?? null;
                        if (facadeCornerDebugByLayerId && layerId && cornerDebugList && cornerDebugList.length) {
                            facadeCornerDebugByLayerId[layerId] = {
                                frames: res.frames ?? null,
                                corners: cornerDebugList
                            };
                        }
                    } else {
                        warnings.push('Facade silhouette: falling back to inset wall loop.');
                    }
                }
            }

            const beltCfg = layer.belt ?? {};
            const beltEnabled = !!beltCfg.enabled;
            const beltHeight = beltEnabled ? clamp(beltCfg.height, 0.02, 1.2) : 0.0;
            const beltExtrusion = beltEnabled ? clamp(beltCfg.extrusion, 0.0, 4.0) : 0.0;
            const beltOuter = wallOuterFacade.map((loop) => (beltExtrusion > EPS ? offsetOrthogonalLoopXZ(loop, -beltExtrusion) : loop));
            const beltHoles = wallHoles;
            const beltMat = makeBeltLikeMaterialFromSpec({
                material: beltCfg.material,
                baseColorHex,
                textureCache,
                wallBase: beltCfg.wallBase ?? null
            });
            const beltStyleId = beltCfg.material?.kind === 'texture' ? beltCfg.material.id : null;
            const beltUrls = beltStyleId ? resolveBuildingStyleWallMaterialUrls(beltStyleId) : null;
            const beltTiling = beltCfg?.tiling ?? null;
            if (beltStyleId) {
                const beltUvCfg = computeUvTilingParams({ tiling: beltTiling, urls: beltUrls, styleId: beltStyleId });
                if (beltUvCfg.apply) {
                    applyUvTilingToMeshStandardMaterial(beltMat, {
                        scaleU: beltUvCfg.scaleU,
                        scaleV: beltUvCfg.scaleV,
                        offsetU: beltUvCfg.offsetU,
                        offsetV: beltUvCfg.offsetV,
                        rotationDegrees: beltUvCfg.rotationDegrees
                    });
                }
            }

            const winCfg = layer.windows ?? null;
            const winEnabled = !!winCfg?.enabled;
            const hasBayWindowFeatures = Array.isArray(facadeStrips) && facadeStrips.some((strip) => {
                const window = strip?.window && typeof strip.window === 'object' ? strip.window : null;
                return !!window && window.enabled !== false;
            });
            if (layerId && facadeFrames && !facadeFaceLinesByLayerId[layerId]) {
                const lines = [];
                for (const lineFaceId of facadeFaceIdsOf(facadeFrames)) {
                    const frame = facadeFrames?.[lineFaceId] ?? null;
                    if (!frame?.start || !frame?.end) continue;
                    const sampleCount = frame.curve
                        ? Math.max(2, Math.min(96, Number(frame.curve.segments) || Math.ceil((Number(frame.length) || 0) / 0.5)))
                        : 1;
                    const path = [];
                    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex++) {
                        const sample = sampleFacadeFrameAtU(frame, (Number(frame.length) || 0) * (sampleIndex / sampleCount));
                        if (sample) path.push({ x: Number(sample.x) || 0, z: Number(sample.z) || 0 });
                    }
                    lines.push({
                        faceId: lineFaceId,
                        x0: Number(frame.start.x) || 0,
                        z0: Number(frame.start.z) || 0,
                        x1: Number(frame.end.x) || 0,
                        z1: Number(frame.end.z) || 0,
                        nx: Number(frame?.n?.x) || 0,
                        nz: Number(frame?.n?.z) || 0,
                        path
                    });
                }
                if (lines.length) facadeFaceLinesByLayerId[layerId] = lines;
            }
            if (layerId && facadeFrames && Array.isArray(facadeStrips) && facadeStrips.length) {
                const entries = [];
                const surfaceRuns = buildFacadeSurfaceRunsByFaceId({
                    facadeStrips,
                    facadeFrames,
                    boundaryTransitions: facadeBoundaryTransitions
                });
                for (const strip of facadeStrips) {
                    const type = typeof strip?.type === 'string' ? strip.type : '';
                    if (type !== 'bay') continue;
                    const faceId = strip?.faceId;
                    if (!isFaceId(faceId)) continue;
                    const frame = facadeFrames?.[faceId] ?? null;
                    if (!frame) continue;
                    const bayId = (typeof strip?.sourceBayId === 'string' && strip.sourceBayId)
                        ? strip.sourceBayId
                        : (typeof strip?.id === 'string' ? strip.id : '');
                    if (!bayId) continue;

                    const rawU0 = Number(strip?.frontU0);
                    const rawU1 = Number(strip?.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip?.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip?.u1) || 0);
                    if (!(u1 > u0 + EPS)) continue;

                    const depthRaw = Number(strip?.depth);
                    const depthFallback = Number.isFinite(depthRaw) ? depthRaw : 0;
                    const depth0Raw = Number(strip?.depth0);
                    const depth1Raw = Number(strip?.depth1);
                    const depth0 = Number.isFinite(depth0Raw) ? depth0Raw : depthFallback;
                    const depth1 = Number.isFinite(depth1Raw) ? depth1Raw : depthFallback;

                    const a = pointOnFacadeFrame({ frame, u: u0, depth: depth0 });
                    const b = pointOnFacadeFrame({ frame, u: u1, depth: depth1 });
                    if (!a || !b) continue;
                    entries.push({
                        faceId,
                        bayId,
                        x0: Number(a.x) || 0,
                        z0: Number(a.z) || 0,
                        x1: Number(b.x) || 0,
                        z1: Number(b.z) || 0,
                        nx: Number(frame?.n?.x) || 0,
                        nz: Number(frame?.n?.z) || 0
                    });
                }
                for (const transition of facadeBoundaryTransitions ?? []) {
                    for (const segment of transition.segments ?? []) {
                        if (!isFaceId(segment?.ownerFaceId) || !segment?.ownerBayId) continue;
                        entries.push({
                            faceId: segment.ownerFaceId,
                            bayId: segment.ownerBayId,
                            x0: Number(segment.x0) || 0,
                            z0: Number(segment.z0) || 0,
                            x1: Number(segment.x1) || 0,
                            z1: Number(segment.z1) || 0,
                            nx: Number(segment.nx) || 0,
                            nz: Number(segment.nz) || 0,
                            boundaryTransitionId: transition.id
                        });
                    }
                }
                if (entries.length) bayHighlightDataByLayerId[layerId] = entries;
                if (surfaceRuns) facadeSurfaceRunsByLayerId[layerId] = surfaceRuns;
            }
            const winWidth = clamp(winCfg?.width, 0.3, 12.0);
            const winSpacing = clamp(winCfg?.spacing, 0.0, 24.0);
            const winDesiredHeight = clamp(winCfg?.height, 0.3, 10.0);
            const winSill = clamp(winCfg?.sillHeight, 0.0, 12.0);
            const winTypeId = typeof winCfg?.typeId === 'string' ? winCfg.typeId : WINDOW_TYPE.STYLE_DEFAULT;
            const winParams = winCfg?.params ?? null;
            const winFakeDepth = winCfg?.fakeDepth ?? null;
            const winPbr = winCfg?.pbr ?? null;
            const winVisualsOverride = winCfg?.windowVisuals ?? null;

            const columns = winCfg?.spaceColumns ?? null;
            const colsEnabled = !!columns?.enabled;
            const colsEvery = clampInt(columns?.every, 1, 99);
            const colsWidth = clamp(columns?.width, 0.1, 10.0);
            const colsExtrude = !!columns?.extrude;
            const colsExtrudeDistance = clamp(columns?.extrudeDistance, 0.0, 1.0);
            const colsMat = makeBeltLikeMaterialFromSpec({
                material: columns?.material,
                baseColorHex,
                textureCache
            });
            const colsStyleId = columns?.material?.kind === 'texture' ? columns.material.id : null;
            const colsUrls = colsStyleId ? resolveBuildingStyleWallMaterialUrls(colsStyleId) : null;
            const colsTiling = columns?.tiling ?? null;
            if (colsStyleId) {
                const colsUvCfg = computeUvTilingParams({ tiling: colsTiling, urls: colsUrls, styleId: colsStyleId });
                if (colsUvCfg.apply) {
                    applyUvTilingToMeshStandardMaterial(colsMat, {
                        scaleU: colsUvCfg.scaleU,
                        scaleV: colsUvCfg.scaleV,
                        offsetU: colsUvCfg.offsetU,
                        offsetV: colsUvCfg.offsetV,
                        rotationDegrees: colsUvCfg.rotationDegrees
                    });
                }
            }

            const windowOffset = clamp(winCfg?.offset, 0.0, 0.2);
            const cornerEps = clamp(winCfg?.cornerEps, 0.01, 2.0);
            const wantsAnyWindowPlacement = winEnabled || hasBayWindowFeatures;
            const materialWindowWidth = winEnabled ? winWidth : 1.2;
            const materialWindowHeight = winEnabled ? winDesiredHeight : 1.6;

            const windowMat = wantsAnyWindowPlacement ? makeWindowMaterial({
                typeId: winTypeId,
                params: winParams,
                windowWidth: materialWindowWidth,
                windowHeight: materialWindowHeight,
                fakeDepth: winFakeDepth,
                pbr: winPbr
            }) : null;

            const reflectiveCfg = winVisualsOverride ? resolveBuildingWindowReflectiveConfig(winVisualsOverride) : baseReflectiveCfg;
            const glassLift = reflectiveCfg.layerOffset;
            const glassIsOverride = baseVisualsOverride || !!winVisualsOverride;
            const windowGlassMat = (wantsAnyWindowPlacement && windowMat) ? makeGlassMaterial(getWindowGlassMaskTexture({
                typeId: winTypeId,
                params: winParams,
                windowWidth: materialWindowWidth,
                windowHeight: materialWindowHeight
            }), reflectiveCfg, { isOverride: glassIsOverride }) : null;

            // DEPRECATED (engine 1): fixed-spacing window placement
            // (layer.windows + spaceColumns) — kept only so existing configs
            // render. New buildings and features use engine 2: facades/bays +
            // window definitions. Do not extend this path.
            const windowRuns = [];
            if (winEnabled && windowMat && wallOuterFacade.length) {
                for (const loop of wallOuterFacade) {
                    if (!loop || loop.length < 2) continue;
                    const runs = buildExteriorRunsFromLoop(loop);
                    for (const run of runs) {
                        const a = run?.a ?? null;
                        const dir = run?.dir ?? null;
                        const L = Number(run?.length) || 0;
                        if (!a || !dir || !(L > EPS)) continue;
                        if (!(L > winWidth + cornerEps * 2)) continue;

                        const tx = dir.x;
                        const tz = dir.z;
                        const nx = tz;
                        const nz = -tx;
                        const yaw = Math.atan2(nx, nz);
                        const faceId = resolveFacadeFaceIdForExteriorRun({
                            a,
                            tx,
                            tz,
                            nx,
                            nz,
                            length: L,
                            frames: facadeFrames
                        });

                        const placement = computeWindowSegmentsWithSpacers({
                            length: L,
                            windowWidth: winWidth,
                            desiredGap: winSpacing,
                            cornerEps,
                            spacerEnabled: colsEnabled,
                            spacerEvery: colsEvery,
                            spacerWidth: colsWidth
                        });

                        windowRuns.push({
                            a,
                            faceId,
                            tx,
                            tz,
                            nx,
                            nz,
                            yaw,
                            length: L,
                            segments: placement?.segments ?? [],
                            spacerCenters: placement?.spacerCenters ?? []
                        });
                    }
                }
            }

            const bayWindowPlacements = [];
            if (hasBayWindowFeatures && windowMat && facadeFrames && Array.isArray(facadeStrips)) {
                for (const strip of facadeStrips) {
                    const type = typeof strip?.type === 'string' ? strip.type : '';
                    if (type !== 'bay') continue;

                    const windowCfg = strip?.window && typeof strip.window === 'object' ? strip.window : null;
                    if (!windowCfg || windowCfg.enabled === false) continue;

                    const faceId = strip?.faceId;
                    if (!isFaceId(faceId)) continue;
                    const frame = facadeFrames?.[faceId] ?? null;
                    if (!frame) continue;

                    const rawU0 = Number(strip?.frontU0);
                    const rawU1 = Number(strip?.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip?.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip?.u1) || 0);
                    const span = Math.max(0, u1 - u0);
                    if (!(span > EPS)) continue;

                    const padding = windowCfg?.padding && typeof windowCfg.padding === 'object' ? windowCfg.padding : null;
                    const leftPad = clamp(padding?.leftMeters ?? 0, 0, 9999);
                    const rightPad = clamp(padding?.rightMeters ?? 0, 0, 9999);
                    const usable = span - leftPad - rightPad;
                    if (!(usable > EPS)) {
                        warnings.push(`${faceId}:${strip?.id || 'bay'}: window padding leaves no usable bay width.`);
                        continue;
                    }

                    const requestedAssetType = normalizeWindowFabricationAssetType(
                        windowCfg?.assetType ?? windowCfg?.openingType,
                        WINDOW_FABRICATION_ASSET_TYPE.WINDOW
                    );
                    const requestedDefId = typeof windowCfg?.defId === 'string' ? windowCfg.defId : '';
                    const defById = requestedDefId ? (windowDefinitionById.get(requestedDefId) ?? null) : null;
                    const def = defById
                        ?? defaultWindowDefinitionByAssetType.get(requestedAssetType)
                        ?? defaultWindowDefinitionByAssetType.get(WINDOW_FABRICATION_ASSET_TYPE.WINDOW)
                        ?? null;
                    const defId = defById?.id ?? def?.id ?? requestedDefId;
                    if (!def) {
                        warnings.push(`${faceId}:${strip?.id || 'bay'}: window definition "${requestedDefId || '(missing)'}" not found.`);
                        continue;
                    }
                    const assetType = normalizeWindowFabricationAssetType(
                        windowCfg?.assetType ?? windowCfg?.openingType,
                        normalizeWindowFabricationAssetType(def?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW)
                    );
                    const topDefId = defId;
                    const topDefSettings = def.settings;
                    const topDefDecoration = def.decoration;
                    let repeatCount = normalizeOpeningRepeatCount(windowCfg?.repeat?.count ?? windowCfg?.repeatCount, OPENING_REPEAT_MIN);
                    // Storefronts repeat like windows (one shop per slot between piers).
                    if (assetType !== WINDOW_FABRICATION_ASSET_TYPE.WINDOW
                        && assetType !== WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT) {
                        repeatCount = OPENING_REPEAT_MIN;
                    }
                    const slotWidth = usable / Math.max(OPENING_REPEAT_MIN, repeatCount);
                    if (!(slotWidth > EPS)) {
                        warnings.push(`${faceId}:${strip?.id || 'bay'}: opening repeat leaves no usable slot width.`);
                        continue;
                    }

                    const sizeSpec = windowCfg?.size && typeof windowCfg.size === 'object' ? windowCfg.size : null;
                    const requestedWidthRaw = Number(sizeSpec?.widthMeters ?? windowCfg?.widthMeters);
                    let width = null;
                    if (Number.isFinite(requestedWidthRaw)) {
                        width = clamp(requestedWidthRaw, 0.1, 9999);
                        if (slotWidth + 1e-6 < width) {
                            warnings.push(`${faceId}:${strip?.id || 'bay'}: slot width ${slotWidth.toFixed(2)}m clamps requested width ${width.toFixed(2)}m.`);
                        }
                    } else {
                        const widthSpec = windowCfg?.width && typeof windowCfg.width === 'object' ? windowCfg.width : null;
                        const minWidthRaw = Number(widthSpec?.minMeters);
                        const minWidth = Number.isFinite(minWidthRaw)
                            ? clamp(minWidthRaw, 0.1, 9999)
                            : (Number.isFinite(def.widthMeters) ? def.widthMeters : 0.1);
                        const maxRaw = widthSpec?.maxMeters;
                        const maxWidth = (maxRaw === null || maxRaw === undefined) ? Infinity : clamp(maxRaw, minWidth, 9999);
                        if (slotWidth + 1e-6 < minWidth) {
                            warnings.push(`${faceId}:${strip?.id || 'bay'}: slot width ${slotWidth.toFixed(2)}m is below opening min ${minWidth.toFixed(2)}m.`);
                            continue;
                        }
                        width = Number.isFinite(def.widthMeters) ? def.widthMeters : minWidth;
                        width = clamp(width, minWidth, Number.isFinite(maxWidth) ? maxWidth : 9999);
                    }
                    width = Math.min(width, slotWidth);
                    if (!(width > EPS)) continue;

                    const repeatCentersU = [];
                    const startU = u0 + leftPad;
                    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
                        const centerU = startU + slotWidth * (repeatIndex + 0.5);
                        repeatCentersU.push(centerU);
                    }

                    const fallbackSample = sampleFacadeFrameAtU(frame, (u0 + u1) * 0.5);
                    const fallbackNx = Number(fallbackSample?.n?.x ?? frame?.n?.x) || 0;
                    const fallbackNz = Number(fallbackSample?.n?.z ?? frame?.n?.z) || 0;
                    const fallbackYaw = Math.atan2(fallbackNx, fallbackNz);
                    const points = repeatCentersU.map((centerU) => (
                        resolveFacadeStripOpeningPose(frame, strip, centerU) ?? {
                            ...facadeStripPointAtU(frame, strip, centerU),
                            u: centerU,
                            nx: fallbackNx,
                            nz: fallbackNz,
                            yaw: fallbackYaw
                        }
                    ));
                    const nx = Number(points[0]?.nx ?? fallbackNx) || 0;
                    const nz = Number(points[0]?.nz ?? fallbackNz) || 0;
                    const yaw = Number(points[0]?.yaw ?? fallbackYaw) || 0;
                    const requestedHeightRaw = Number(sizeSpec?.heightMeters ?? windowCfg?.heightMeters);
                    const height = Number.isFinite(requestedHeightRaw)
                        ? clamp(requestedHeightRaw, 0.1, 9999)
                        : (Number.isFinite(def.heightMeters) ? def.heightMeters : winDesiredHeight);
                    const heightMode = normalizeOpeningHeightMode(windowCfg?.heightMode, OPENING_HEIGHT_MODE.FIXED);
                    const verticalOffsetRaw = Number(windowCfg?.verticalOffsetMeters ?? windowCfg?.yOffsetMeters ?? windowCfg?.offsetFromFloorMeters);
                    const verticalOffsetMeters = Number.isFinite(verticalOffsetRaw)
                        ? clamp(verticalOffsetRaw, 0.0, 9999.0)
                        : null;

                    const muntinsSrc = windowCfg?.muntins && typeof windowCfg.muntins === 'object' ? windowCfg.muntins : null;
                    const muntinsBottomEnabled = muntinsSrc?.bottomEnabled !== undefined
                        ? !!muntinsSrc.bottomEnabled
                        : (windowCfg?.muntinsBottomEnabled !== undefined ? !!windowCfg.muntinsBottomEnabled : true);
                    const muntinsTopEnabled = muntinsSrc?.topEnabled !== undefined
                        ? !!muntinsSrc.topEnabled
                        : (windowCfg?.muntinsTopEnabled !== undefined ? !!windowCfg.muntinsTopEnabled : true);

                    const topSrc = windowCfg?.top && typeof windowCfg.top === 'object' ? windowCfg.top : null;
                    const topEnabledRaw = topSrc?.enabled ?? windowCfg?.topEnabled ?? windowCfg?.secondEnabled ?? windowCfg?.topWindowEnabled;
                    const topHeightMode = normalizeOpeningHeightMode(
                        topSrc?.heightMode ?? topSrc?.mode ?? windowCfg?.topHeightMode,
                        OPENING_HEIGHT_MODE.FIXED
                    );
                    const topHeightRaw = Number(topSrc?.heightMeters ?? topSrc?.height ?? windowCfg?.topHeightMeters);
                    const topHeight = Number.isFinite(topHeightRaw)
                        ? clamp(topHeightRaw, 0.1, 9999)
                        : height;
                    const topGapRaw = Number(topSrc?.verticalGapMeters ?? topSrc?.gapMeters ?? windowCfg?.topGapMeters);
                    const topGap = Number.isFinite(topGapRaw)
                        ? clamp(topGapRaw, 0.0, 9999)
                        : 0.1;
                    const topFrameWidthRaw = Number(topSrc?.frameWidthMeters ?? topSrc?.frameWidth ?? windowCfg?.topFrameWidthMeters);
                    const topFrameWidth = Number.isFinite(topFrameWidthRaw)
                        ? clamp(topFrameWidthRaw, 0.002, 3.0)
                        : null;
                    // Storefronts own their vertical band composition (transom/fascia),
                    // so the secondary `top` opening stays off for them.
                    const topEnabled = !!topEnabledRaw
                        && assetType !== WINDOW_FABRICATION_ASSET_TYPE.GARAGE
                        && assetType !== WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT;
                    const visual = resolveOpeningVisualConfig(windowCfg, def.settings);
                    const garageFacade = normalizeGarageFacadeConfig(
                        windowCfg?.garageFacade ?? null,
                        def?.garageFacade ?? null
                    );
                    const wall = normalizeOpeningWallCutConfig(
                        windowCfg?.wall ?? null,
                        def?.wall ?? null
                    );

                    const stripDepthForClamp = Number(strip?.depth);
                    const bayRecessionMeters = Math.max(0, Number.isFinite(stripDepthForClamp) ? stripDepthForClamp : 0);
                    const clampLabel = `Bay ${strip?.id ?? ''} (${faceId})`;

                    // AI 488: entrance portal. The recessed entry rides the frame
                    // inset (which also drives the wall reveal), and the steps
                    // raise the door threshold by their total rise so the stair
                    // climbs from grade to the door.
                    const portalCfgRaw = assetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR
                        ? (normalizePortalConfig(windowCfg?.portal ?? null) ?? def?.portal ?? null)
                        : null;
                    // AI 510: resolve the referenced portal fabrication def and
                    // merge — parts the config explicitly authored override the
                    // def's; unset part materials fall back to the def palette,
                    // never silently to the wall texture.
                    let portalDef = null;
                    if (portalCfgRaw?.defId) {
                        portalDef = portalDefById.get(portalCfgRaw.defId) ?? null;
                        if (!portalDef) {
                            warnings.push(`Portal def "${portalCfgRaw.defId}" not found; using the inline portal config only.`);
                        }
                    }
                    let portalCfg = portalCfgRaw;
                    let portalCarvedDepth = 0;
                    let portalOrderExtraHalfWidth = 0;
                    if (portalDef) {
                        const palette = portalDef.palette ?? {};
                        const withPalette = (part, key) => (part ? { ...part, material: part.material ?? palette[key] ?? null } : null);
                        const defSteps = portalDef.steps
                            ? { ...portalDef.steps, material: portalDef.steps.material ?? palette.steps ?? null }
                            : portalCfgRaw.steps;
                        portalCfg = {
                            enabled: true,
                            defId: portalDef.id,
                            // With a def, the door's depth comes from the
                            // level stack; authored inline recess adds only
                            // when the author explicitly wrote it.
                            recessMeters: portalCfgRaw.authoredRecess ? portalCfgRaw.recessMeters : 0,
                            steps: portalCfgRaw.authoredSteps ? portalCfgRaw.steps : defSteps,
                            colonettes: withPalette(portalCfgRaw.colonettes ?? portalDef.colonettes, 'colonettes'),
                            frieze: withPalette(portalCfgRaw.frieze ?? portalDef.frieze, 'frieze'),
                            recessMaterial: portalCfgRaw.recessMaterial ?? palette.recess ?? null
                        };
                        // Levels step the door inward; the box face stands
                        // `projectionMeters` of that in front of the wall.
                        const levelDepthSum = (portalDef.levels ?? []).reduce(
                            (acc, lvl) => acc + clamp(lvl?.depthMeters, 0.05, 1.2), 0
                        );
                        portalCarvedDepth = Math.max(0, levelDepthSum - clamp(portalDef.box?.projectionMeters, 0.0, 0.4));
                        for (const lvl of portalDef.levels ?? []) {
                            portalOrderExtraHalfWidth += clamp(lvl?.frameWidthMeters, 0.05, 0.9);
                        }
                    }
                    // AI 511: nested wall insets — the bay-level override wins
                    // over the definition's. A portal def owns the whole facade
                    // opening (its box replaces the wall there), so insets do
                    // not combine with one.
                    let insetSteps = (assetType === WINDOW_FABRICATION_ASSET_TYPE.WINDOW
                        || assetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR)
                        ? (normalizeOpeningInsetsConfig(windowCfg?.insets ?? null) ?? def?.insets ?? null)
                        : null;
                    if (insetSteps && portalDef) {
                        warnings.push(`Bay ${strip?.id ?? ''} (${faceId}): opening insets are ignored when a portal def opens the facade.`);
                        insetSteps = null;
                    }
                    let insetCarvedDepth = 0;
                    if (insetSteps) {
                        // The outermost contour may not cut past its slot: with
                        // repeats the neighbouring opening sits one slot over
                        // (their contours may just touch, like an arcade's
                        // springing points), and a single opening owns the bay
                        // strip (slot plus the opening paddings). Shrink the
                        // width paddings proportionally, or drop the stack when
                        // there is no room at all.
                        const insetMaxHalfWidth = repeatCount > 1
                            ? Math.max(0.3, slotWidth * 0.5 - 0.01)
                            : Math.max(0.3, slotWidth * 0.5 + Math.min(leftPad, rightPad) - 0.02);
                        const growth = insetSteps.reduce((acc, s) => acc + s.widthPaddingMeters, 0);
                        const room = insetMaxHalfWidth - width * 0.5;
                        if (growth > room - EPS) {
                            const scale = Math.max(0, room - 0.01) / growth;
                            const scaled = insetSteps.map((s) => ({ ...s, widthPaddingMeters: s.widthPaddingMeters * scale }));
                            if (scaled.some((s) => s.widthPaddingMeters < 0.02)) {
                                warnings.push(`Bay ${strip?.id ?? ''} (${faceId}): no room for opening insets in the bay strip; insets skipped.`);
                                insetSteps = null;
                            } else {
                                warnings.push(`Bay ${strip?.id ?? ''} (${faceId}): opening insets clamped to the bay strip.`);
                                insetSteps = scaled;
                            }
                        }
                        if (insetSteps) insetCarvedDepth = insetSteps.reduce((acc, s) => acc + s.depthMeters, 0);
                    }
                    // AI 496: the parallax interior panel is oversized so grazing
                    // sightlines cannot slip past its edge. Tell the window mesh
                    // how much wall it may hide behind, so an oversized panel
                    // never reaches into the neighbouring opening: within a bay
                    // the neighbour is the next repeat slot, and at the bay edge
                    // it is (at least) half the slack plus this bay's padding.
                    // Quantized so near-identical bays still share one geometry
                    // bucket instead of fragmenting the instancing.
                    const openingSlackMeters = Math.max(0, slotWidth - width);
                    const gapToBayEdgeMeters = openingSlackMeters * 0.5 + Math.min(leftPad, rightPad);
                    const neighborGapMeters = repeatCount > 1
                        ? Math.min(openingSlackMeters, gapToBayEdgeMeters)
                        : gapToBayEdgeMeters;
                    const overscanClampMeters = Math.round(Math.max(0, neighborGapMeters) * 20) / 20;

                    let placementSettings = {
                        ...def.settings,
                        interior: {
                            ...(def.settings?.interior ?? {}),
                            overscanClampMeters
                        }
                    };
                    let placementVerticalOffset = verticalOffsetMeters;
                    if (portalCfg) {
                        const stepsRise = portalCfg.steps.count * portalCfg.steps.riseMeters;
                        if (stepsRise > EPS) {
                            placementVerticalOffset = (Number.isFinite(Number(placementVerticalOffset)) ? Number(placementVerticalOffset) : 0) + stepsRise;
                        }
                        // The door mounts at the portal's innermost plane: the
                        // authored recess plus whatever the carved orders sink.
                        const effectiveRecess = portalCfg.recessMeters + portalCarvedDepth;
                        if (effectiveRecess > EPS) {
                            placementSettings = {
                                ...placementSettings,
                                frame: {
                                    ...(def.settings?.frame ?? {}),
                                    inset: (Number(def.settings?.frame?.inset) || 0) + effectiveRecess
                                }
                            };
                        }
                    }
                    // AI 511: the frame mounts at the innermost inset plane —
                    // its `inset` measures from there, so the mesh placement
                    // gains the carved step depth (the portal recess pattern).
                    // Chained AFTER any inline-portal bump so both stack.
                    if (insetCarvedDepth > EPS) {
                        placementSettings = {
                            ...placementSettings,
                            frame: {
                                ...(placementSettings.frame ?? {}),
                                inset: (Number(placementSettings.frame?.inset) || 0) + insetCarvedDepth
                            }
                        };
                    }
                    // Bay-level opening depth: moves just the door/window
                    // assembly in and out of the wall, independent of the
                    // bay's edge depth (which moves the whole wall strip).
                    // Rides frame.inset so the wall cut, reveal walls and
                    // shell hole all follow for free; negative pulls the
                    // opening toward flush with the wall face.
                    const openingDepthRaw = Number(windowCfg?.depthMeters);
                    if (Number.isFinite(openingDepthRaw) && Math.abs(openingDepthRaw) > EPS) {
                        const depthBump = clamp(openingDepthRaw, -0.5, 1.0);
                        placementSettings = {
                            ...placementSettings,
                            frame: {
                                ...(placementSettings.frame ?? {}),
                                inset: Math.max(0, (Number(placementSettings.frame?.inset) || 0) + depthBump)
                            }
                        };
                    }

                    const basePlacement = {
                        faceId,
                        bayId: typeof strip?.id === 'string' ? strip.id : '',
                        arcade: strip?.arcade && typeof strip.arcade === 'object' ? strip.arcade : null,
                        defId,
                        assetType,
                        settings: placementSettings,
                        storefront: assetType === WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT
                            ? (def?.storefront ?? normalizeStorefrontConfig(null))
                            : null,
                        portal: portalCfg,
                        portalDef,
                        portalCarvedDepth,
                        portalOrderExtraHalfWidth,
                        insets: insetSteps,
                        insetCarvedDepth,
                        // The portal box may not cut past its bay strip (the
                        // full bay: slot plus the opening paddings).
                        portalBoxMaxHalfWidth: Math.max(0.3, slotWidth * 0.5 + Math.min(leftPad, rightPad) - 0.02),
                        decoration: clampWindowDecorationDepthsToBayRecession(deepClone(def?.decoration ?? null), {
                            recessionMeters: bayRecessionMeters,
                            warnings,
                            contextLabel: clampLabel
                        }),
                        points,
                        yaw,
                        nx,
                        nz,
                        width,
                        height,
                        heightMode,
                        verticalOffsetMeters: placementVerticalOffset,
                        repeatCount,
                        visual,
                        wall,
                        muntins: {
                            bottomEnabled: muntinsBottomEnabled,
                            topEnabled: muntinsTopEnabled
                        },
                        top: {
                            enabled: topEnabled,
                            assetType,
                            defId: topDefId,
                            settings: topDefSettings,
                            decoration: clampWindowDecorationDepthsToBayRecession(deepClone(topDefDecoration ?? null), {
                                recessionMeters: bayRecessionMeters,
                                warnings,
                                contextLabel: clampLabel
                            }),
                            heightMode: topHeightMode,
                            height: topHeight,
                            gap: topGap,
                            frameWidthMeters: topFrameWidth
                        },
                        garageFacade
                    };

                    bayWindowPlacements.push(basePlacement);
                }
            }

            const resolveBayOpeningPlacementInSegment = ({
                segmentHeight,
                requestedHeight,
                heightMode,
                verticalOffsetMeters,
                top = null
            }) => {
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
            };

            // AI 493: an arcade run shares ONE springing line. `archRise =
            // arch.heightRatio * width`, so a run of unequal widths only lines
            // up if each opening's ratio is re-derived from the shared line.
            // The line itself is the HIGHEST natural springing in the run, so
            // every arch flattens toward segmental at most and none is stilted
            // past its own semicircle into a horseshoe. Resolved per floor
            // (segment height decides where the opening head lands) and cached,
            // because both the wall-cutout pass and the window-mesh pass need
            // the same answer.
            const arcadeSegmentCache = new Map();
            const resolveArcadeForSegment = (segmentHeight) => {
                const key = (Number(segmentHeight) || 0).toFixed(4);
                const cached = arcadeSegmentCache.get(key);
                if (cached) return cached;

                const overridesByIndex = new Map();
                const springingByRunKey = new Map();
                const runs = new Map();

                for (let i = 0; i < bayWindowPlacements.length; i++) {
                    const placement = bayWindowPlacements[i];
                    const arcade = placement?.arcade && typeof placement.arcade === 'object' ? placement.arcade : null;
                    if (!arcade?.enabled) continue;
                    const settings = placement?.settings && typeof placement.settings === 'object' ? placement.settings : null;
                    const naturalRatio = settings?.arch?.enabled ? (Number(settings?.arch?.heightRatio) || 0) : 0;
                    if (!(naturalRatio > 0.001)) continue;

                    const resolved = resolveBayOpeningPlacementInSegment({
                        segmentHeight,
                        requestedHeight: Number(placement?.height) || 0.1,
                        heightMode: placement?.heightMode,
                        verticalOffsetMeters: placement?.verticalOffsetMeters,
                        top: placement?.top
                    });
                    // The arch rides the topmost opening of the placement.
                    const topHeight = Math.max(0, Number(resolved?.top?.height) || 0);
                    const target = topHeight > EPS ? 'top' : 'bottom';
                    const part = target === 'top' ? resolved?.top : resolved?.bottom;
                    const partHeight = Math.max(0, Number(part?.height) || 0);
                    if (!(partHeight > EPS)) continue;

                    const runKey = `${placement.faceId}:${typeof arcade.groupId === 'string' ? arcade.groupId : ''}`;
                    let run = runs.get(runKey);
                    if (!run) {
                        run = { arcade, faceId: placement.faceId, members: [] };
                        runs.set(runKey, run);
                    }
                    run.members.push({
                        index: i,
                        target,
                        headOffsetMeters: (Number(part?.yBottom) || 0) + partHeight,
                        widthMeters: Math.max(0.1, Number(placement?.width) || 0.1),
                        archHeightRatio: naturalRatio
                    });
                }

                for (const [runKey, run] of runs) {
                    const springing = resolveArcadeSpringingOffset({
                        members: run.members,
                        springing: run.arcade.springing
                    });
                    if (!Number.isFinite(springing)) continue;
                    springingByRunKey.set(runKey, springing);

                    let unmet = 0;
                    for (const member of run.members) {
                        const { heightRatio, met } = resolveArcadeArchHeightRatio({
                            member,
                            springingOffsetMeters: springing
                        });
                        if (met) overridesByIndex.set(member.index, { target: member.target, heightRatio });
                        else unmet += 1;
                    }
                    if (unmet > 0) {
                        const label = run.arcade.springing?.mode === ARCADE_SPRINGING_MODE.FIXED ? 'fixed' : 'auto';
                        warnings.push(`${run.faceId}: arcade "${run.arcade.groupId ?? ''}" ${label} springing line is out of reach for ${unmet} opening(s) (they keep their own arch rise).`);
                    }
                }

                const out = { overridesByIndex, springingByRunKey };
                arcadeSegmentCache.set(key, out);
                return out;
            };

            // The arch patch one opening needs to meet its run's springing line.
            const arcadeArchPatch = ({ segmentHeight, placementIndex, target, source }) => {
                const override = resolveArcadeForSegment(segmentHeight).overridesByIndex.get(placementIndex) ?? null;
                if (!override || override.target !== target) return null;
                return { arch: { ...(source?.arch ?? {}), heightRatio: override.heightRatio } };
            };

            const hadSolidMeshesBeforeLayer = solidMeshes.length;
            const layerStartY = yCursor;
            const continuousWalls = true;

            if (continuousWalls) {
                let totalWallHeight = 0.0;
                let pendingExtra = firstFloorPendingExtra;
                const floorSegments = [];
                let floorCursorY = 0.0;
                for (let floor = 0; floor < floors; floor++) {
                    const segHeight = floorHeight + (floor === 0 ? pendingExtra : 0);
                    if (floor === 0) pendingExtra = 0;
                    floorSegments.push({ yBottom: floorCursorY, height: segHeight });
                    totalWallHeight += segHeight;
                    floorCursorY += segHeight;
                    if (beltEnabled && beltHeight > EPS) totalWallHeight += beltHeight;
                    if (beltEnabled && beltHeight > EPS) floorCursorY += beltHeight;
                }
                if (layerId) {
                    floorSegmentsByLayerId.set(layerId, floorSegments.map((seg) => {
                        const yBottom = Number(seg?.yBottom) || 0;
                        const height = Math.max(0, Number(seg?.height) || 0);
                        return {
                            yBottom,
                            height,
                            startY: layerStartY + yBottom,
                            endY: layerStartY + yBottom + height
                        };
                    }));
                }

                if (totalWallHeight > EPS) {
                    const wantsFacadeWall = wantsFacadeSilhouette
                        && facadeLoopDetail
                        && wallOuterFacade.length === 1
                        && !wallHoles.length;

                    const outerLoop = wallOuterFacade[0] ?? null;
                    const yOffset = layerStartY - baseY;
                    const facadeWallMaterials = [wallMat];
                    const facadeWallSegmentOverrides = new Map();

                    if (wantsFacadeWall && facadeFrames && Array.isArray(facadeStrips) && facadeStrips.length) {
                        const materialKey = (spec) => {
                            const m = spec && typeof spec === 'object' ? spec : null;
                            const kind = m?.kind;
                            const id = typeof m?.id === 'string' ? m.id : '';
                            return (kind === 'texture' || kind === 'color') && id ? `${kind}:${id}` : '';
                        };
                        const configKey = ({ materialSpec = null, wallBase = null, tiling = null, materialVariation = null } = {}) => JSON.stringify({
                            material: materialSpec && typeof materialSpec === 'object' ? { kind: materialSpec.kind, id: materialSpec.id } : null,
                            wallBase: wallBase && typeof wallBase === 'object' ? wallBase : null,
                            tiling: tiling && typeof tiling === 'object' ? tiling : null,
                            materialVariation: materialVariation && typeof materialVariation === 'object' ? materialVariation : null
                        });

                        const baseKey = configKey({
                            materialSpec: layer.material,
                            wallBase: layer?.wallBase ?? null,
                            tiling: wallTiling ?? null,
                            materialVariation: wallMatVar ?? null
                        });

                        const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                        const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object' ? layer.faceLinking.links : null;
                        const resolveMasterFaceId = (faceId) => {
                            const seen = new Set();
                            let cur = faceId;
                            for (let i = 0; i < 8; i++) {
                                if (seen.has(cur)) break;
                                seen.add(cur);
                                const next = links?.[cur] ?? null;
                                if (next === null || next === undefined) return cur;
                                if (next === cur) return cur;
                                cur = next;
                            }
                            return faceId;
                        };

                        const cache = new Map();
                        const getFacadeMaterialIndex = ({ materialSpec = null, wallBase = null, tiling = null, materialVariation = null } = {}) => {
                            const specKey = materialKey(materialSpec);
                            if (!specKey) return 0;
                            const key = configKey({ materialSpec, wallBase, tiling, materialVariation });
                            if (key === baseKey) return 0;
                            const existing = cache.get(key);
                            if (Number.isInteger(existing)) return existing;

                            const mat = makeWallMaterialFromSpec({
                                material: materialSpec,
                                baseColorHex,
                                textureCache,
                                wallBase
                            });

                            const styleId = materialSpec?.kind === 'texture' ? materialSpec.id : null;
                            if (styleId) {
                                const urls = resolveBuildingStyleWallMaterialUrls(styleId);
                                const uvCfg = computeUvTilingParams({ tiling, urls, styleId });
                                if (uvCfg.apply) {
                                    applyUvTilingToMeshStandardMaterial(mat, {
                                        scaleU: uvCfg.scaleU,
                                        scaleV: uvCfg.scaleV,
                                        offsetU: uvCfg.offsetU,
                                        offsetV: uvCfg.offsetV,
                                        rotationDegrees: uvCfg.rotationDegrees
                                    });
                                }
                            }

                            if (materialVariation?.enabled) {
                                applyMaterialVariationToMeshStandardMaterial(mat, {
                                    seed: matVarSeed,
                                    seedOffset: clampInt(materialVariation?.seedOffset ?? 0, -9999, 9999),
                                    heightMin: baseY,
                                    heightMax: matVarHeightMax,
                                    config: materialVariation,
                                    root: MATERIAL_VARIATION_ROOT.WALL,
                                    cornerDist: true
                                });
                            }

                            facadeWallMaterials.push(mat);
                            const idx = facadeWallMaterials.length - 1;
                            cache.set(key, idx);
                            return idx;
                        };

                        let prevFaceIdForUv = null;
                        let prevMaterialKeyForUv = '';
                        let prevUvStartForUv = 0;
                        let prevWidthForUv = 0;

                        for (const strip of facadeStrips) {
                            const faceId = strip?.faceId;
                            if (!isFaceId(faceId)) continue;
                            const masterFaceId = faceId ? resolveMasterFaceId(faceId) : null;
                            const faceCfg = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
                                ? faceMaterials[masterFaceId]
                                : null;

                            const faceWallBase = faceCfg?.wallBase && typeof faceCfg.wallBase === 'object' ? faceCfg.wallBase : (layer?.wallBase ?? null);
                            const faceTiling = faceCfg?.tiling && typeof faceCfg.tiling === 'object' ? faceCfg.tiling : wallTiling;
                            const faceMaterialVariation = faceCfg?.materialVariation && typeof faceCfg.materialVariation === 'object'
                                ? faceCfg.materialVariation
                                : wallMatVar;

                            const resolvedSpec = strip?.material ?? null;
                            const stripType = typeof strip?.type === 'string' ? strip.type : '';
                            const isBayStrip = stripType === 'bay';
                            const bayWallBase = isBayStrip && strip?.wallBase && typeof strip.wallBase === 'object' ? strip.wallBase : null;
                            const bayTiling = isBayStrip && strip?.tiling && typeof strip.tiling === 'object' ? strip.tiling : null;
                            const bayMaterialVariation = isBayStrip && strip?.materialVariation && typeof strip.materialVariation === 'object' ? strip.materialVariation : null;
                            const wallBase = bayWallBase ?? faceWallBase;
                            const tiling = bayTiling ?? faceTiling;
                            const materialVariation = bayMaterialVariation ?? faceMaterialVariation;
                            const key = configKey({ materialSpec: resolvedSpec, wallBase, tiling, materialVariation });
                            const u0 = Number(strip?.frontU0) || 0;
                            const u1 = Number(strip?.frontU1) || 0;
                            const w = Math.max(0, u1 - u0);
                            const depthFallback = Number(strip?.depth) || 0;
                            const depth0Raw = Number(strip?.depth0);
                            const depth1Raw = Number(strip?.depth1);
                            const depth0 = Number.isFinite(depth0Raw) ? depth0Raw : depthFallback;
                            const depth1 = Number.isFinite(depth1Raw) ? depth1Raw : depthFallback;

                            if (faceId !== prevFaceIdForUv) {
                                prevFaceIdForUv = faceId ?? null;
                                prevMaterialKeyForUv = '';
                                prevUvStartForUv = 0;
                                prevWidthForUv = 0;
                            }

                            const matKey = materialKey(resolvedSpec);

                            // AI 506: consecutive strips sharing a resolved wall
                            // material CONTINUE the face's texture run — uvStart
                            // carries the accumulated width so the pattern never
                            // resets mid-wall (whether a reset was VISIBLE used
                            // to depend on strip width vs texture period). The
                            // old `textureFlow` gates ('repeats'/'overflow_*')
                            // are subsumed: they were same-material continuations
                            // with this exact accumulation. A material change
                            // starts a fresh run.
                            const sameMaterial = !!matKey && prevMaterialKeyForUv === matKey;
                            const continueOffset = (faceId === 'B' || faceId === 'D') ? -w : prevWidthForUv;
                            const uvStart = sameMaterial ? (prevUvStartForUv + continueOffset) : 0;

                            if (w > 1e-5) {
                                const materialIndex = getFacadeMaterialIndex({ materialSpec: resolvedSpec, wallBase, tiling, materialVariation });
                                const shouldApplyDirect = !!matKey && key !== baseKey;
                                if (shouldApplyDirect) {
                                    const segKey = facadeStripSegmentKey(faceId, u0, depth0, u1, depth1);
                                    facadeWallSegmentOverrides.set(segKey, { materialIndex, faceId, u0, u1, depth0, depth1, uvStart });
                                }

                                const rangeKey = `__ranges__:${faceId}`;
                                const ranges = facadeWallSegmentOverrides.get(rangeKey);
                                if (Array.isArray(ranges)) {
                                    ranges.push({ materialIndex, faceId, u0, u1, depth0, depth1, uvStart });
                                } else if (ranges === undefined) {
                                    facadeWallSegmentOverrides.set(rangeKey, [{ materialIndex, faceId, u0, u1, depth0, depth1, uvStart }]);
                                }
                            }

                            prevMaterialKeyForUv = matKey;
                            prevUvStartForUv = uvStart;
                            prevWidthForUv = w;
                        }

                        // AI 541: each adaptive curve segment keeps the wall
                        // material owned by its left/right source bay. The
                        // override is keyed in world space because a rounded
                        // cross-face segment has no single facade-local u.
                        for (const transition of facadeBoundaryTransitions ?? []) {
                            for (const segment of transition.segments ?? []) {
                                const ownerStrip = segment?.ownerStrip ?? null;
                                const faceId = segment?.ownerFaceId;
                                if (!ownerStrip || !isFaceId(faceId)) continue;
                                const masterFaceId = resolveMasterFaceId(faceId);
                                const faceCfg = masterFaceId && faceMaterials?.[masterFaceId] && typeof faceMaterials[masterFaceId] === 'object'
                                    ? faceMaterials[masterFaceId]
                                    : null;
                                const wallBase = ownerStrip?.wallBase && typeof ownerStrip.wallBase === 'object'
                                    ? ownerStrip.wallBase
                                    : (faceCfg?.wallBase ?? layer?.wallBase ?? null);
                                const tiling = ownerStrip?.tiling && typeof ownerStrip.tiling === 'object'
                                    ? ownerStrip.tiling
                                    : (faceCfg?.tiling ?? wallTiling);
                                const materialVariation = ownerStrip?.materialVariation && typeof ownerStrip.materialVariation === 'object'
                                    ? ownerStrip.materialVariation
                                    : (faceCfg?.materialVariation ?? wallMatVar);
                                const materialSpec = ownerStrip?.material ?? null;
                                const matKey = materialKey(materialSpec);
                                const key = configKey({ materialSpec, wallBase, tiling, materialVariation });
                                if (!matKey || key === baseKey) continue;
                                const materialIndex = getFacadeMaterialIndex({ materialSpec, wallBase, tiling, materialVariation });
                                facadeWallSegmentOverrides.set(
                                    facadeWorldSegmentKey(segment.x0, segment.z0, segment.x1, segment.z1),
                                    {
                                        materialIndex,
                                        x0: segment.x0,
                                        z0: segment.z0,
                                        x1: segment.x1,
                                        z1: segment.z1,
                                        uvStart: Number(segment.s0) || 0
                                    }
                                );
                            }
                        }
                    }

                    let facadeWallCutouts = null;
                    let facadeWallYSlices = null;
                    if (wantsFacadeWall && facadeFrames && (bayWindowPlacements.length || windowRuns.length)) {
                        facadeWallCutouts = [];
                        facadeWallYSlices = [];
                        const facadeWallFaceIds = facadeFaceIdsOf(facadeFrames);
                        const streetFloorOpeningsByFaceId = {};
                        const depthFallbackByFaceId = {};
                        for (const faceId of facadeWallFaceIds) {
                            streetFloorOpeningsByFaceId[faceId] = [];
                            depthFallbackByFaceId[faceId] = Number(facadeDepthMinsByFaceId?.[faceId]);
                        }
                        const streetFloorCutoutEntries = [];

                        // AI 509: `portal.recessMaterial` routes the recess
                        // reveal walls to their own facade material index so a
                        // recessed entry can read as shadowed masonry instead
                        // of the wall run's material.
                        const recessRevealIndexCache = new Map();
                        const getRecessRevealMaterialIndex = (materialCfg) => {
                            const mode = typeof materialCfg?.mode === 'string' ? materialCfg.mode : '';
                            const materialId = typeof materialCfg?.materialId === 'string' ? materialCfg.materialId.trim() : '';
                            if (mode !== 'pbr' || !materialId) return null;
                            const cached = recessRevealIndexCache.get(materialId);
                            if (Number.isInteger(cached)) return cached;
                            const mat = makeWallMaterialFromSpec({
                                material: { kind: 'texture', id: materialId },
                                baseColorHex,
                                textureCache
                            });
                            const urls = resolveBuildingStyleWallMaterialUrls(materialId);
                            const uvCfg = computeUvTilingParams({ tiling: null, urls, styleId: materialId });
                            if (uvCfg.apply) {
                                applyUvTilingToMeshStandardMaterial(mat, {
                                    scaleU: uvCfg.scaleU,
                                    scaleV: uvCfg.scaleV,
                                    offsetU: uvCfg.offsetU,
                                    offsetV: uvCfg.offsetV,
                                    rotationDegrees: uvCfg.rotationDegrees
                                });
                            }
                            facadeWallMaterials.push(mat);
                            const idx = facadeWallMaterials.length - 1;
                            recessRevealIndexCache.set(materialId, idx);
                            return idx;
                        };

                        for (let floor = 0; floor < floorSegments.length; floor++) {
                            const seg = floorSegments[floor];
                            const segHeight = Number(seg?.height) || 0;
                            const yCursorLocal = Number(seg?.yBottom) || 0;
                            const isStreetFloor = floor === 0;
                            facadeWallYSlices.push({ y0: yCursorLocal, y1: yCursorLocal + segHeight });

                            for (let i = 0; i < bayWindowPlacements.length; i++) {
                                const placement = bayWindowPlacements[i];
                                const faceId = placement?.faceId;
                                if (!isFaceId(faceId)) continue;
                                const frame = facadeFrames?.[faceId] ?? null;
                                if (!frame) continue;
                                const placementAssetType = normalizeWindowFabricationAssetType(
                                    placement?.assetType,
                                    WINDOW_FABRICATION_ASSET_TYPE.WINDOW
                                );

                                const width = Math.max(0.1, Number(placement?.width) || 0.1);
                                const defSettings = placement?.settings && typeof placement.settings === 'object' ? placement.settings : null;
                                if (!defSettings) continue;
                                const points = Array.isArray(placement?.points) ? placement.points : [];
                                if (!points.length) continue;

                                const placementInSegment = resolveBayOpeningPlacementInSegment({
                                    segmentHeight: segHeight,
                                    requestedHeight: Number(placement?.height) || 0.1,
                                    heightMode: placement?.heightMode,
                                    verticalOffsetMeters: placement?.verticalOffsetMeters,
                                    top: placement?.top
                                });
                                const bottomHeight = Math.max(0.1, Number(placementInSegment?.bottom?.height) || 0.1);
                                const bottomYBottom = clamp(Number(placementInSegment?.bottom?.yBottom) || 0, 0, Math.max(0, segHeight - bottomHeight));
                                const bottomY = yCursorLocal + bottomYBottom + bottomHeight * 0.5;

                                const topCfg = placement?.top && typeof placement.top === 'object' ? placement.top : null;
                                const topHeight = Math.max(0, Number(placementInSegment?.top?.height) || 0);
                                const topYBottom = Math.max(0, Number(placementInSegment?.top?.yBottom) || 0);
                                const topY = yCursorLocal + topYBottom + topHeight * 0.5;
                                const topFrameWidth = Number(topCfg?.frameWidthMeters);
                                const hasTopFrameWidthOverride = Number.isFinite(topFrameWidth);
                                const topPlacementAssetType = normalizeWindowFabricationAssetType(
                                    topCfg?.assetType,
                                    placementAssetType
                                );

                                const bottomSettings = sanitizeWindowMeshSettings(applyOpeningVisualOverridesToSettings({
                                    ...defSettings,
                                    ...(arcadeArchPatch({ segmentHeight: segHeight, placementIndex: i, target: 'bottom', source: defSettings }) ?? {}),
                                    width,
                                    height: bottomHeight
                                }, placement?.visual));
                                const topSettingsSource = bottomSettings;
                                const topFrameSettings = hasTopFrameWidthOverride
                                    ? {
                                        ...(topSettingsSource?.frame ?? {}),
                                        width: topFrameWidth,
                                        verticalWidth: topFrameWidth,
                                        horizontalWidth: topFrameWidth
                                    }
                                    : (topSettingsSource?.frame ?? {});
                                if (topPlacementAssetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR) {
                                    topFrameSettings.addHandles = false;
                                    topFrameSettings.doorStyle = 'single';
                                }
                                const topSettings = topHeight > EPS
                                    ? sanitizeWindowMeshSettings({
                                        ...topSettingsSource,
                                        ...(arcadeArchPatch({ segmentHeight: segHeight, placementIndex: i, target: 'top', source: topSettingsSource }) ?? {}),
                                        frame: topFrameSettings,
                                        width,
                                        height: topHeight
                                    })
                                    : null;

                                // Bay openings carve facade cutouts only; they do not drive the legacy interior-shell pass.
                                const portalRecessRevealIndex = placement?.portal
                                    ? getRecessRevealMaterialIndex(placement.portal.recessMaterial)
                                    : null;
                                const appendCutoutsFromSettings = ({ settings, openingHeight, openingY, wall, applyPortalOrders = false, applyInsets = false }) => {
                                    const resolvedWall = normalizeOpeningWallCutConfig(wall ?? null, null);
                                    const cutMetrics = resolveOpeningCutMetrics(settings, {
                                        cutX: resolvedWall.cutWidthLerp,
                                        cutY: resolvedWall.cutHeightLerp
                                    });
                                    const cutWidth = Number(cutMetrics?.cutWidth) || 0;
                                    const cutHeight = Number(cutMetrics?.cutHeight) || 0;
                                    if (!(cutWidth > 0.02) || !(cutHeight > 0.02)) return;

                                    const wantsArch = !!settings?.arch?.enabled;
                                    const archRatio = Number(settings?.arch?.heightRatio) || 0;
                                    const outerArchRise = wantsArch ? (archRatio * (Number(cutMetrics?.baseWidth) || width)) : 0;
                                    const innerWantsArch = wantsArch && outerArchRise > EPS;
                                    const archRiseCandidate = innerWantsArch ? (archRatio * cutWidth) : 0;
                                    const archRise = Math.min(
                                        archRiseCandidate,
                                        Math.max(0, cutHeight - Math.max(0, Number(cutMetrics?.frameHorizontalWidth) || 0))
                                    );
                                    const cutWantsArch = innerWantsArch && archRise > EPS;
                                    const frameInset = Math.max(0, Number(settings?.frame?.inset) || 0);
                                    const cutCenterY = openingY + (Number(cutMetrics?.cutCenterYOffset) || 0);

                                    // AI 510 (rework): a portal def opens the facade to the
                                    // BOX's rectangle — the box mass replaces the wall there
                                    // and its own level stack forms the deep reveal, so the
                                    // wall's visible reveal is a token sliver hidden behind
                                    // the box flange. The shell keeps the full door depth
                                    // (AI 507) via shellRevealDepth.
                                    let outWidth = cutWidth;
                                    let outHeight = cutHeight;
                                    let outCenterY = cutCenterY;
                                    let outWantsArch = cutWantsArch;
                                    let outArchRise = archRise;
                                    let revealDepth = frameInset;
                                    if (applyPortalOrders && placement?.portalDef) {
                                        const levelGeo = resolvePortalLevelGeometry({
                                            cutWidth,
                                            cutHeight,
                                            archRise: cutWantsArch ? archRise : 0,
                                            def: placement.portalDef,
                                            maxHalfWidth: Number(placement?.portalBoxMaxHalfWidth) || Infinity
                                        });
                                        const cutBottom = cutCenterY - cutHeight * 0.5;
                                        outWidth = levelGeo.boxCut.width;
                                        outHeight = levelGeo.boxCut.height;
                                        outCenterY = cutBottom + levelGeo.boxCut.height * 0.5;
                                        outWantsArch = false;
                                        outArchRise = 0;
                                        revealDepth = 0.02;
                                    }

                                    // AI 511: nested wall insets — the wall opens to the
                                    // OUTERMOST step contour; the stack carves shoulder
                                    // rings and stepped reveals down to the innermost
                                    // plane where the frame mounts. `frameInset` is
                                    // already the TOTAL depth (placement bumped it by the
                                    // carved sum), so the AI 507 shell rule keeps
                                    // clearing the true frame plane via shellRevealDepth.
                                    let insetStack = null;
                                    let insetRevealMaterialIndex = null;
                                    if (applyInsets && Array.isArray(placement?.insets) && placement.insets.length
                                        && !(applyPortalOrders && placement?.portalDef)) {
                                        const steps = placement.insets;
                                        const contours = resolveOpeningInsetContours({
                                            cutWidth,
                                            cutHeight,
                                            cutCenterY,
                                            archRise: cutWantsArch ? archRise : 0,
                                            steps
                                        });
                                        if (contours.length === steps.length + 1) {
                                            const outer = contours[0];
                                            outWidth = outer.width;
                                            outHeight = outer.top - outer.bottom;
                                            outCenterY = (outer.top + outer.bottom) * 0.5;
                                            outWantsArch = outer.wantsArch && outer.archRise > EPS;
                                            outArchRise = outer.archRise;
                                            revealDepth = steps[0].depthMeters;
                                            insetRevealMaterialIndex = getRecessRevealMaterialIndex(steps[0].material);
                                            let planeDepth = 0;
                                            insetStack = [];
                                            for (let j = 1; j < contours.length; j++) {
                                                const c = contours[j];
                                                const stepBefore = steps[j - 1];
                                                const stepAfter = j < contours.length - 1 ? steps[j] : null;
                                                planeDepth += stepBefore.depthMeters;
                                                insetStack.push({
                                                    width: c.width,
                                                    height: c.top - c.bottom,
                                                    y: (c.top + c.bottom) * 0.5,
                                                    wantsArch: c.wantsArch && c.archRise > EPS,
                                                    archRise: c.archRise,
                                                    frontDepth: planeDepth,
                                                    backDepth: stepAfter ? planeDepth + stepAfter.depthMeters : frameInset,
                                                    ringMaterialIndex: getRecessRevealMaterialIndex(stepBefore.material),
                                                    // The innermost contour is the opening;
                                                    // its own reveal keeps the wall material
                                                    // unless an inline portal routed it to a
                                                    // recess material (AI 509).
                                                    revealMaterialIndex: stepAfter
                                                        ? getRecessRevealMaterialIndex(stepAfter.material)
                                                        : portalRecessRevealIndex
                                                });
                                            }
                                        }
                                    }
                                    const cutRevealMaterialIndex = insetStack ? insetRevealMaterialIndex : portalRecessRevealIndex;

                                    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
                                        const point = points[pointIndex] && typeof points[pointIndex] === 'object' ? points[pointIndex] : null;
                                        const px = Number(point?.x) || 0;
                                        const pz = Number(point?.z) || 0;
                                        const cutout = {
                                            faceId,
                                            x: px,
                                            y: outCenterY,
                                            z: pz,
                                            ...(Number.isFinite(Number(point?.u)) ? { u: Number(point.u) } : {}),
                                            width: outWidth,
                                            height: outHeight,
                                            wantsArch: outWantsArch,
                                            archRise: outWantsArch ? outArchRise : 0,
                                            revealDepth,
                                            shellRevealDepth: frameInset,
                                            ...(cutRevealMaterialIndex !== null ? { revealMaterialIndex: cutRevealMaterialIndex } : {}),
                                            ...(insetStack ? { insetSteps: insetStack } : {}),
                                            // AI 495: whether this opening has a parallax
                                            // interior panel behind its glass. A shade does
                                            // not count — its shader discards every fragment
                                            // when the blind is up, which is what
                                            // `disableShades` produces.
                                            backed: !!settings?.interior?.enabled
                                        };
                                        facadeWallCutouts.push(cutout);
                                    }
                                };

                                // Storefronts open ONE hole for the whole stack —
                                // glazing + fascia + transom together (the bulkhead
                                // stays solid wall below). The band slabs and the
                                // glazing mesh sit inside it at their own depths, so
                                // no wall slivers ever appear between the door, the
                                // fascia and the transom. The hole is a hair narrower
                                // than the opening so the frame and the band slabs
                                // tuck behind the reveal jambs instead of z-fighting
                                // them; the reveal runs to the deepest element (the
                                // glazing frame plane).
                                if (placementAssetType === WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT && placement?.storefront) {
                                    const layout = resolveStorefrontZoneLayout({
                                        storefront: placement.storefront,
                                        totalHeightMeters: bottomHeight
                                    });
                                    const openingBottomLocal = yCursorLocal + bottomYBottom;
                                    const stackBottom = layout.glazing.yBottom;
                                    const stackHeight = Math.max(0.1, bottomHeight - stackBottom);
                                    const stackCutWidth = Math.max(0.05, width - 0.01);
                                    const stackFrameInset = Math.max(0, Number(placement?.settings?.frame?.inset) || 0);
                                    const stackCutY = openingBottomLocal + stackBottom + stackHeight * 0.5;
                                    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
                                        const point = points[pointIndex] && typeof points[pointIndex] === 'object' ? points[pointIndex] : null;
                                        facadeWallCutouts.push({
                                            faceId,
                                            x: Number(point?.x) || 0,
                                            y: stackCutY,
                                            z: Number(point?.z) || 0,
                                            ...(Number.isFinite(Number(point?.u)) ? { u: Number(point.u) } : {}),
                                            width: stackCutWidth,
                                            height: stackHeight,
                                            wantsArch: false,
                                            archRise: 0,
                                            revealDepth: stackFrameInset,
                                            shellRevealDepth: stackFrameInset,
                                            backed: !!placement?.settings?.interior?.enabled
                                        });
                                    }
                                    continue;
                                }

                                appendCutoutsFromSettings({
                                    settings: bottomSettings,
                                    openingHeight: bottomHeight,
                                    openingY: bottomY,
                                    wall: placement?.wall ?? null,
                                    applyPortalOrders: true,
                                    applyInsets: true
                                });
                                if (topSettings && topHeight > EPS) {
                                    appendCutoutsFromSettings({
                                        settings: topSettings,
                                        openingHeight: topHeight,
                                        openingY: topY,
                                        wall: placement?.wall ?? null
                                    });
                                }
                            }

                            if (isStreetFloor && winEnabled && windowRuns.length) {
                                const windowHeight = Math.min(winDesiredHeight, Math.max(0.3, segHeight * 0.95));
                                const windowYOffset = Math.min(winSill, Math.max(0, segHeight - windowHeight));
                                const y = yCursorLocal + windowYOffset + windowHeight * 0.5;

                                for (const run of windowRuns) {
                                    const faceId = run?.faceId;
                                    if (!isFaceId(faceId)) continue;
                                    const frame = facadeFrames?.[faceId] ?? null;
                                    if (!frame) continue;

                                    const runLength = Number(run?.length) || 0;
                                    if (!(runLength > EPS)) continue;
                                    const a = run?.a ?? null;
                                    if (!a) continue;
                                    const tx = Number(run?.tx) || 0;
                                    const tz = Number(run?.tz) || 0;

                                    for (const seg of run?.segments ?? []) {
                                        const segOffset = Number(seg?.offset) || 0;
                                        const starts = Array.isArray(seg?.layout?.starts) ? seg.layout.starts : [];
                                        for (const start of starts) {
                                            const leftDist = segOffset + start;
                                            const rightDist = leftDist + winWidth;
                                            if (leftDist < cornerEps - 1e-6 || rightDist > runLength - cornerEps + 1e-6) continue;

                                            const centerDist = leftDist + winWidth * 0.5;
                                            const px = (Number(a.x) || 0) + tx * centerDist;
                                            const pz = (Number(a.z) || 0) + tz * centerDist;
                                            const outerDepth = Number(projectPointToFacadeFrame({ frame, x: px, z: pz })?.depth) || 0;

                                            const cutout = {
                                                faceId,
                                                x: px,
                                                y,
                                                z: pz,
                                                width: winWidth,
                                                height: windowHeight,
                                                wantsArch: false,
                                                archRise: 0.0,
                                                revealDepth: 0.0
                                            };
                                            facadeWallCutouts.push(cutout);
                                            (streetFloorOpeningsByFaceId[faceId] ??= []).push(outerDepth);
                                            streetFloorCutoutEntries.push({ cutout, faceId, outerDepth });
                                        }
                                    }
                                }
                            }

                            if (beltEnabled && beltHeight > EPS) {
                                const beltY0 = yCursorLocal + segHeight;
                                facadeWallYSlices.push({ y0: beltY0, y1: beltY0 + beltHeight });
                            }
                        }

                        if (streetFloorCutoutEntries.length) {
                            const faceIds = facadeWallFaceIds;
                            let globalMinOpeningDepth = Infinity;
                            const interiorDepthByFaceId = {};
                            for (const faceId of faceIds) {
                                const list = streetFloorOpeningsByFaceId[faceId];
                                if (Array.isArray(list) && list.length) {
                                    const minDepth = Math.min(...list.map((v) => Number(v) || 0));
                                    interiorDepthByFaceId[faceId] = minDepth;
                                    if (minDepth < globalMinOpeningDepth) globalMinOpeningDepth = minDepth;
                                }
                            }
                            if (!Number.isFinite(globalMinOpeningDepth)) globalMinOpeningDepth = 0;

                            for (const faceId of faceIds) {
                                if (Number.isFinite(interiorDepthByFaceId[faceId])) continue;
                                const fallback = depthFallbackByFaceId[faceId];
                                interiorDepthByFaceId[faceId] = Number.isFinite(fallback) ? fallback : globalMinOpeningDepth;
                            }

                            for (const entry of streetFloorCutoutEntries) {
                                const cutout = entry?.cutout ?? null;
                                const faceId = entry?.faceId;
                                if (!cutout || !isFaceId(faceId)) continue;
                                const targetDepth = Number(interiorDepthByFaceId[faceId]) || 0;
                                const outerDepth = Number(entry?.outerDepth) || 0;
                                cutout.revealDepth = Math.max(0, outerDepth - targetDepth);
                            }
                        }

                        if (!facadeWallCutouts.length) {
                            facadeWallCutouts = null;
                            facadeWallYSlices = null;
                        }
                    }

                    // Facade banding (AI 491): alternate the base wall material
                    // with a secondary one in horizontal bands. The secondary
                    // material shares the layer's material variation config, so
                    // world-space wear/streaks stay continuous across bands.
                    let facadeWallYBands = null;
                    const bandingCfg = layer?.banding && typeof layer.banding === 'object' ? layer.banding : null;
                    if (bandingCfg?.enabled) {
                        if (!wantsFacadeWall) {
                            warnings.push(`Layer ${layerId || layerIndex}: facade banding needs the facade wall path (facades on this layer); banding skipped.`);
                        } else {
                            const bandSpec = (bandingCfg.material?.kind === 'texture' || bandingCfg.material?.kind === 'color')
                                ? bandingCfg.material
                                : { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE };
                            const bandWallBase = bandingCfg.wallBase && typeof bandingCfg.wallBase === 'object'
                                ? bandingCfg.wallBase
                                : (layer?.wallBase ?? null);
                            const bandMat = makeWallMaterialFromSpec({
                                material: bandSpec,
                                baseColorHex,
                                textureCache,
                                wallBase: bandWallBase
                            });
                            const bandStyleId = bandSpec.kind === 'texture' ? bandSpec.id : null;
                            if (bandStyleId) {
                                const bandUrls = resolveBuildingStyleWallMaterialUrls(bandStyleId);
                                const bandTiling = bandingCfg.tiling && typeof bandingCfg.tiling === 'object' ? bandingCfg.tiling : wallTiling;
                                const bandUvCfg = computeUvTilingParams({ tiling: bandTiling, urls: bandUrls, styleId: bandStyleId });
                                if (bandUvCfg.apply) {
                                    applyUvTilingToMeshStandardMaterial(bandMat, {
                                        scaleU: bandUvCfg.scaleU,
                                        scaleV: bandUvCfg.scaleV,
                                        offsetU: bandUvCfg.offsetU,
                                        offsetV: bandUvCfg.offsetV,
                                        rotationDegrees: bandUvCfg.rotationDegrees
                                    });
                                }
                            }
                            if (wallMatVar?.enabled) {
                                applyMaterialVariationToMeshStandardMaterial(bandMat, {
                                    seed: matVarSeed,
                                    seedOffset: clampInt(wallMatVar?.seedOffset ?? 0, -9999, 9999),
                                    heightMin: baseY,
                                    heightMax: matVarHeightMax,
                                    config: wallMatVar,
                                    root: MATERIAL_VARIATION_ROOT.WALL,
                                    cornerDist: true
                                });
                            }
                            facadeWallMaterials.push(bandMat);
                            const bandMaterialIndex = facadeWallMaterials.length - 1;

                            // Unit size: meters directly, or brick courses derived
                            // from the layer's per-brick layout (explicit override
                            // wins, 0.1m fallback).
                            let unitMeters = 1.0;
                            if (bandingCfg.unit === 'courses') {
                                let course = Number(bandingCfg.courseHeightMeters);
                                if (!(Number.isFinite(course) && course > 0)) {
                                    const bricksY = Number(wallMatVar?.brick?.perBrick?.layout?.bricksPerTileY);
                                    const tileVRaw = (wallTiling?.enabled ? Number(wallTiling?.tileMetersV) : NaN);
                                    const tileV = Number.isFinite(tileVRaw) && tileVRaw > 0
                                        ? tileVRaw
                                        : (resolvePbrTileMetersFromUrls(wallUrls, wallStyleId) ?? 2.0);
                                    course = (Number.isFinite(bricksY) && bricksY > 0) ? (tileV / bricksY) : NaN;
                                }
                                unitMeters = (Number.isFinite(course) && course > 0) ? course : 0.1;
                            }

                            const bandPrimary = Math.max(0.02, (Number(bandingCfg.primaryHeight) || 0) * unitMeters);
                            const bandSecondary = Math.max(0.02, (Number(bandingCfg.secondaryHeight) || 0) * unitMeters);
                            const period = bandPrimary + bandSecondary;
                            const offsetMeters = (Number(bandingCfg.offset) || 0) * unitMeters;
                            const startShift = ((offsetMeters % period) + period) % period;

                            facadeWallYBands = [];
                            for (let y = -startShift - period; y < totalWallHeight + period; y += period) {
                                const b0 = y + bandPrimary;
                                const b1 = y + period;
                                if (b1 <= EPS || b0 >= totalWallHeight - EPS) continue;
                                facadeWallYBands.push({ y0: b0, y1: b1, materialIndex: bandMaterialIndex });
                            }
                            if (!facadeWallYBands.length) facadeWallYBands = null;
                        }
                    }

                    const facadeGeo = wantsFacadeWall
                        ? buildWallSidesGeometryFromLoopDetailXZ(facadeLoopDetail, {
                            height: totalWallHeight,
                            uvBaseV: yOffset,
                            segmentOverrides: facadeWallSegmentOverrides,
                            cutouts: facadeWallCutouts,
                            ySlices: facadeWallYSlices,
                            yBands: facadeWallYBands
                        })
                        : null;

                    if (wantsFacadeWall && outerLoop && facadeGeo) {
                        applyMatVarCornerDistanceToGeometry(facadeGeo, { loops: [outerLoop] });

                        const mesh = new THREE.Mesh(facadeGeo, facadeWallMaterials);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = layerStartY;
                        mesh.userData = mesh.userData ?? {};
                        mesh.userData.buildingFab2Role = 'wall';
                        mesh.userData.buildingFab2WallKind = 'facade';
                        mesh.userData.buildingFab2WallBaseMaterialIndex = 0;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(facadeGeo, 1);
                            appendWirePositions(wirePositions, edgeGeo, layerStartY);
                            edgeGeo.dispose();
                        }

                        if (transitionSurfaceUpperLayerIds.has(layerId)) {
                            // Facade walls are side-only geometry. When this
                            // layer owns a different plan from the floor below,
                            // close its complete lower outline so an overhang is
                            // a real soffit instead of an open shell. The lower
                            // layer's existing top cap supplies the complementary
                            // terrace surface for setbacks/partial overlaps.
                            const transitionShape = buildShapeFromLoops({ outerLoop, holeLoops: [] });
                            const transitionGeo = new THREE.ShapeGeometry(transitionShape);
                            transitionGeo.rotateX(-Math.PI / 2);
                            transitionGeo.computeVertexNormals();
                            const transitionMat = floorSlabMatTemplate.clone();
                            transitionMat.side = THREE.DoubleSide;
                            const transitionMesh = new THREE.Mesh(transitionGeo, transitionMat);
                            transitionMesh.castShadow = false;
                            transitionMesh.receiveShadow = true;
                            transitionMesh.position.y = layerStartY;
                            transitionMesh.userData = transitionMesh.userData ?? {};
                            transitionMesh.userData.buildingFab2Role = 'roof';
                            transitionMesh.userData.buildingFab2RoofKind = 'layer_transition_underside';
                            transitionMesh.userData.lowerLayerId = transitionLowerLayerIdByUpperLayerId.get(layerId) ?? null;
                            transitionMesh.userData.upperLayerId = layerId;
                            solidMeshes.push(transitionMesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(transitionGeo, 1);
                                appendWirePositions(wirePositions, edgeGeo, transitionMesh.position.y);
                                edgeGeo.dispose();
                            }
                        }

                        const frames = facadeFrames && typeof facadeFrames === 'object' ? facadeFrames : null;
                        const depthMins = facadeDepthMinsByFaceId && typeof facadeDepthMinsByFaceId === 'object'
                            ? facadeDepthMinsByFaceId
                            : null;

                        // AI 495: an opening with no parallax panel behind its
                        // glass is one you can see into, so there has to be an
                        // inside to see. Without a shell the floor is a hollow box
                        // and the view runs straight out the far side.
                        const unbackedOpenings = Array.isArray(facadeWallCutouts)
                            ? facadeWallCutouts.filter((cut) => !cut?.backed)
                            : [];
                        const wantsOcclusionShell = !isFloorLayerInteriorEnabled(layer) && unbackedOpenings.length > 0;
                        if (wantsOcclusionShell) {
                            const faces = Array.from(new Set(unbackedOpenings.map((cut) => cut.faceId))).sort().join('/');
                            warnings.push(`Layer ${layerId || layerIndex}: ${unbackedOpenings.length} opening(s) on face(s) ${faces} have no parallax interior behind the glass and the layer has interior disabled; the interior shell was enabled so there is a room to see.`);
                        }

                        if ((isFloorLayerInteriorEnabled(layer) || wantsOcclusionShell) && frames && depthMins && floorSegments.length) {
                            // Built corner-join by corner-join at the shell's own
                            // depth rather than by offsetting a finished loop, so
                            // every point stays tagged with the face it belongs to —
                            // which is what lets the facade's opening cutouts be
                            // projected onto it.
                            const shellDepthOf = (faceId) => (Number(depthMins[faceId]) || 0) - FLOOR_INTERIOR_SHELL_INSET_METERS;
                            const interiorLoopRaw = buildCornerJoinLoopWithDepths({ frames, depthOf: shellDepthOf });
                            const interiorLoop = simplifyLoopConsecutiveCollinearXZ(interiorLoopRaw, { tol: 1e-4, minEdge: 1e-3 });
                            if (interiorLoop && interiorLoop.length >= 3) {
                                const interiorArea = signedArea(interiorLoop);
                                const interiorShellLoop = interiorArea < 0 ? interiorLoop.slice().reverse() : interiorLoop;
                                // Wall detail keeps the same corner joins as the
                                // floor/ceiling outline, plus arc samples tagged
                                // with face-u so curved openings cut the correct
                                // shell segments.
                                const interiorShellLoopDetail = buildInteriorShellLoopDetailWithDepths({
                                    frames,
                                    depthOf: shellDepthOf
                                });
                                const interiorCutouts = (Array.isArray(facadeWallCutouts) ? facadeWallCutouts : [])
                                    .map((cut) => projectFacadeCutoutOntoShell(cut, { frames, shellDepthOf }))
                                    .filter((cut) => !!cut);
                                let interiorAnchorX = 0;
                                let interiorAnchorZ = 0;
                                for (const point of interiorShellLoop) {
                                    interiorAnchorX += Number(point?.x) || 0;
                                    interiorAnchorZ += Number(point?.z) || 0;
                                }
                                interiorAnchorX /= interiorShellLoop.length;
                                interiorAnchorZ /= interiorShellLoop.length;
                                const interiorShellLoopLocal = interiorShellLoop.map((point) => ({
                                    x: (Number(point?.x) || 0) - interiorAnchorX,
                                    z: (Number(point?.z) || 0) - interiorAnchorZ
                                }));
                                const interiorShape = buildShapeFromLoops({ outerLoop: interiorShellLoopLocal, holeLoops: [] });
                                const createInteriorMaterial = () => {
                                    const mat = makeWallMaterialFromSpec({
                                        material: FLOOR_INTERIOR_MATERIAL_SPEC,
                                        baseColorHex,
                                        textureCache
                                    });
                                    applyFixedTileMetersToMaterial(mat, {
                                        materialSpec: FLOOR_INTERIOR_MATERIAL_SPEC,
                                        tileMeters: FLOOR_INTERIOR_TILE_METERS
                                    });
                                    // AI 495: the shell is wound to face the room, so a
                                    // single-sided material makes it vanish when seen
                                    // from the other side — a sightline through a glazed
                                    // opening then leaves the building through what
                                    // should be solid wall. A wall is opaque from both
                                    // sides.
                                    mat.side = THREE.DoubleSide;
                                    return mat;
                                };

                                for (let segIndex = 0; segIndex < floorSegments.length; segIndex++) {
                                    const seg = floorSegments[segIndex];
                                    const interiorHeight = Math.max(0, Number(seg?.height) || 0);
                                    if (!(interiorHeight > EPS)) continue;
                                    const segmentYBottom = Number(seg?.yBottom) || 0;
                                    const segmentBaseY = layerStartY + segmentYBottom;

                                    // Interior walls should face into the interior room volume.
                                    // Cutouts are authored in layer-local Y; this run
                                    // starts at the segment, so rebase and clip them.
                                    const segmentCutouts = interiorCutouts
                                        .map((cut) => ({ ...cut, y: Number(cut.y) - segmentYBottom }))
                                        .filter((cut) => {
                                            const half = Math.max(0, Number(cut.height) || 0) * 0.5;
                                            return cut.y + half > EPS && cut.y - half < interiorHeight - EPS;
                                        });
                                    const interiorWallGeo = buildWallSidesGeometryFromLoopDetailXZ(interiorShellLoopDetail, {
                                        height: interiorHeight,
                                        uvBaseV: yOffset + segmentYBottom,
                                        cutouts: segmentCutouts.length ? segmentCutouts : null,
                                        // Cut linings must run into the room, not
                                        // toward the facade (room-facing winding).
                                        revealDirectionSign: -1
                                    });
                                    if (interiorWallGeo) {
                                        const interiorWallMat = createInteriorMaterial();
                                        const interiorWallMesh = new THREE.Mesh(interiorWallGeo, interiorWallMat);
                                        interiorWallMesh.castShadow = false;
                                        interiorWallMesh.receiveShadow = false;
                                        interiorWallMesh.position.y = segmentBaseY;
                                        interiorWallMesh.userData = interiorWallMesh.userData ?? {};
                                        interiorWallMesh.userData.buildingFab2Role = 'interior';
                                        interiorWallMesh.userData.buildingFab2InteriorKind = 'wall';
                                        solidMeshes.push(interiorWallMesh);

                                        if (showWire) {
                                            const edgeGeo = new THREE.EdgesGeometry(interiorWallGeo, 1);
                                            appendWirePositions(wirePositions, edgeGeo, segmentBaseY);
                                            edgeGeo.dispose();
                                        }
                                    }

                                    const interiorFloorGeo = new THREE.ShapeGeometry(interiorShape);
                                    interiorFloorGeo.rotateX(-Math.PI / 2);
                                    interiorFloorGeo.computeVertexNormals();
                                    const interiorFloorMat = createInteriorMaterial();
                                    const interiorFloorMesh = new THREE.Mesh(interiorFloorGeo, interiorFloorMat);
                                    // Interior room surfaces must not cast: the exterior
                                    // already shadows the world, and these full-footprint
                                    // slabs leak through the thin walls (shadow bias),
                                    // dimming the whole facade and striping ground + sky.
                                    interiorFloorMesh.castShadow = false;
                                    interiorFloorMesh.receiveShadow = true;
                                    interiorFloorMesh.position.set(
                                        interiorAnchorX,
                                        segmentBaseY + FLOOR_INTERIOR_SURFACE_NUDGE_METERS,
                                        interiorAnchorZ
                                    );
                                    interiorFloorMesh.userData = interiorFloorMesh.userData ?? {};
                                    interiorFloorMesh.userData.buildingFab2Role = 'interior';
                                    interiorFloorMesh.userData.buildingFab2InteriorKind = 'floor';
                                    solidMeshes.push(interiorFloorMesh);

                                    if (showWire) {
                                        const edgeGeo = new THREE.EdgesGeometry(interiorFloorGeo, 1);
                                        interiorFloorMesh.updateMatrix();
                                        appendWirePositionsTransformed(wirePositions, edgeGeo, interiorFloorMesh.matrix);
                                        edgeGeo.dispose();
                                    }

                                    const interiorCeilingGeo = new THREE.ShapeGeometry(interiorShape);
                                    interiorCeilingGeo.rotateX(-Math.PI / 2);
                                    flipGeometryWinding(interiorCeilingGeo);
                                    interiorCeilingGeo.computeVertexNormals();
                                    const interiorCeilingMat = createInteriorMaterial();
                                    const interiorCeilingMesh = new THREE.Mesh(interiorCeilingGeo, interiorCeilingMat);
                                    interiorCeilingMesh.castShadow = false;
                                    interiorCeilingMesh.receiveShadow = true;
                                    interiorCeilingMesh.position.set(
                                        interiorAnchorX,
                                        segmentBaseY + interiorHeight - FLOOR_INTERIOR_SURFACE_NUDGE_METERS,
                                        interiorAnchorZ
                                    );
                                    interiorCeilingMesh.userData = interiorCeilingMesh.userData ?? {};
                                    interiorCeilingMesh.userData.buildingFab2Role = 'interior';
                                    interiorCeilingMesh.userData.buildingFab2InteriorKind = 'ceiling';
                                    solidMeshes.push(interiorCeilingMesh);

                                    if (showWire) {
                                        const edgeGeo = new THREE.EdgesGeometry(interiorCeilingGeo, 1);
                                        interiorCeilingMesh.updateMatrix();
                                        appendWirePositionsTransformed(wirePositions, edgeGeo, interiorCeilingMesh.matrix);
                                        edgeGeo.dispose();
                                    }
                                }
                            }
                        }

                        // An opening that runs the FULL height of its layer continues
                        // into the storey above or below: the two glazed runs are one
                        // continuous screen, and the floor slab between them is not a
                        // ledge anyone should see through the glass. Collect those
                        // openings so the cap and its closure bands stop short of the
                        // opening mouth instead of shelving across it.
                        const collectFullHeightOpenings = (atTop) => {
                            const out = [];
                            const cuts = Array.isArray(facadeWallCutouts) ? facadeWallCutouts : [];
                            for (const cut of cuts) {
                                const faceId = cut?.faceId;
                                if (!isFaceId(faceId) || !frames?.[faceId]) continue;
                                const reveal = Math.max(0, Number(cut?.revealDepth) || 0);
                                if (!(reveal > EPS)) continue;
                                const halfH = Math.max(0, Number(cut?.height) || 0) * 0.5;
                                const cy = Number(cut?.y) || 0;
                                const reaches = atTop
                                    ? (cy + halfH >= totalWallHeight - REVEAL_OPEN_EDGE_TOL)
                                    : (cy - halfH <= REVEAL_OPEN_EDGE_TOL);
                                if (!reaches) continue;
                                const frame = frames[faceId];
                                const u = ((Number(cut.x) || 0) - (Number(frame.start?.x) || 0)) * (Number(frame.t?.x) || 0)
                                    + ((Number(cut.z) || 0) - (Number(frame.start?.z) || 0)) * (Number(frame.t?.z) || 0);
                                const halfW = Math.max(0, Number(cut?.width) || 0) * 0.5;
                                out.push({ faceId, u0: u - halfW, u1: u + halfW, revealDepth: reveal });
                            }
                            return out;
                        };
                        const capTopOpenings = collectFullHeightOpenings(true);
                        const capBottomOpenings = collectFullHeightOpenings(false);
                        const capPullbackByFace = {};
                        for (const o of capTopOpenings) {
                            capPullbackByFace[o.faceId] = Math.max(capPullbackByFace[o.faceId] ?? 0, o.revealDepth);
                        }
                        const capFaceOrder = frames ? facadeFaceIdsOf(frames) : null;
                        const joinMapAtDepths = (depthOf) => {
                            if (!frames || !capFaceOrder) return null;
                            const map = {};
                            for (let ci = 0; ci < capFaceOrder.length; ci++) {
                                const aId = capFaceOrder[ci];
                                const bId = capFaceOrder[(ci + 1) % capFaceOrder.length];
                                map[`${aId}${bId}`] = cornerJoinPairWithDepths(
                                    frames[aId], depthOf(aId), frames[bId], depthOf(bId),
                                    frames?.cornerFacets?.[`${aId}${bId}`] ?? null
                                );
                            }
                            return map;
                        };
                        const baseJoinByCornerId = (frames && depthMins)
                            ? joinMapAtDepths((id) => depthMins[id] ?? 0)
                            : null;

                        const basePointForFacade = (p) => {
                            if (!p || typeof p !== 'object') return { x: 0, y: 0, z: 0 };
                            const faceId = p.faceId;
                            if (isFaceId(faceId) && frames && depthMins) {
                                const frame = frames[faceId] ?? null;
                                const u = Number(p.u) || 0;
                                const d = Number(depthMins[faceId]) || 0;
                                return pointOnFacadeFrame({ frame, u, depth: d });
                            }
                            const cornerId = typeof p.cornerId === 'string' ? p.cornerId : '';
                            if (cornerId) {
                                const join = baseJoinByCornerId?.[cornerId]?.aEnd ?? null;
                                if (join) return join;
                            }
                            return { x: Number(p.x) || 0, y: 0, z: Number(p.z) || 0 };
                        };

                        // Same resolution at depth 0: the nominal footprint line the
                        // next layer stands on. Recessed bays sit inward of it, and the
                        // strip between them needs a soffit so the overhang is closed.
                        const zeroJoinByCornerId = (frames && depthMins)
                            ? joinMapAtDepths(() => 0)
                            : null;

                        const zeroPointForFacade = (p) => {
                            if (!p || typeof p !== 'object') return { x: 0, y: 0, z: 0 };
                            const faceId = p.faceId;
                            if (isFaceId(faceId) && frames) {
                                const frame = frames[faceId] ?? null;
                                const u = Number(p.u) || 0;
                                return pointOnFacadeFrame({ frame, u, depth: 0 });
                            }
                            const cornerId = typeof p.cornerId === 'string' ? p.cornerId : '';
                            if (cornerId) {
                                const join = zeroJoinByCornerId?.[cornerId]?.aEnd ?? null;
                                if (join) return join;
                            }
                            return { x: Number(p.x) || 0, y: 0, z: Number(p.z) || 0 };
                        };

                        const capY = layerStartY + totalWallHeight;
                        // A cap with another layer stacked above it is a floor slab
                        // (soffit from below, sill ledge from outside); only the
                        // topmost layer's cap belongs to the roof family.
                        const capHasLayerAbove = layerIndex < safeLayers.length - 1;
                        const capMatTemplate = capHasLayerAbove ? floorSlabMatTemplate : roofMatTemplate;
                        // The closure bands' visible faces belong to the wall,
                        // not the slab: the soffit over a recessed strip, the
                        // ledge inside a closure notch. Slab material there
                        // read as a pale floating panel beside the cornice, so
                        // the bands inherit the layer's wall material.
                        // Plan-projected UVs, no variation — the variation
                        // shader keys off a per-vertex corner attribute the
                        // band geometry does not carry.
                        const closureBandWallMat = (() => {
                            const m = makeWallMaterialFromSpec({
                                material: layer.material,
                                baseColorHex,
                                textureCache,
                                wallBase: layer?.wallBase ?? null
                            });
                            if (wallUvCfg.apply) {
                                applyUvTilingToMeshStandardMaterial(m, {
                                    scaleU: wallUvCfg.scaleU,
                                    scaleV: wallUvCfg.scaleV,
                                    offsetU: wallUvCfg.offsetU,
                                    offsetV: wallUvCfg.offsetV,
                                    rotationDegrees: wallUvCfg.rotationDegrees
                                });
                            }
                            m.side = THREE.DoubleSide;
                            return m;
                        })();
                        const outerDetail = Array.isArray(facadeLoopDetail) ? facadeLoopDetail : null;
                        // The plate stops BEHIND the glazing on faces whose openings
                        // run the full storey, so a continuous glazed run shows glass
                        // across the storey line instead of a lit slab edge.
                        const baseLoopCore = (frames && depthMins)
                            ? buildCornerJoinLoopWithDepths({
                                frames,
                                depthOf: (id) => (depthMins[id] ?? 0) - (capPullbackByFace[id] ?? 0)
                            })
                            : null;
                        const baseDetail = outerDetail ? outerDetail.map(basePointForFacade) : null;
                        const baseLoop = baseLoopCore
                            ? baseLoopCore
                            : (baseDetail ? simplifyLoopConsecutiveCollinearXZ(baseDetail, { tol: 1e-4, minEdge: 1e-3 }) : null);

                        if (baseLoop && baseLoop.length >= 3) {
                            const baseArea = signedArea(baseLoop);
                            const baseLoopCcw = baseArea < 0 ? baseLoop.slice().reverse() : baseLoop;
                            const baseShape = buildShapeFromLoops({ outerLoop: baseLoopCcw, holeLoops: [] });
                            const baseGeo = new THREE.ShapeGeometry(baseShape);
                            baseGeo.rotateX(-Math.PI / 2);
                            baseGeo.computeVertexNormals();

                            const baseMat = capMatTemplate.clone();
                            // Visible from below when a recessed layer sits under this cap.
                            baseMat.side = THREE.DoubleSide;
                            const baseMesh = new THREE.Mesh(baseGeo, baseMat);
                            // A mid-stack cap is an INTERIOR floor slab: the
                            // wall it meets, and the cornices that project past
                            // that wall, are what shape the sun there. Letting
                            // it cast only puts a shadow plane exactly on the
                            // storey line, where the reveal, the frame rails
                            // and the next storey's wall all meet — a hard edge
                            // sampled at ~4 cm shadow texels, which reads as a
                            // striped ledge across every reveal at grazing
                            // angles. The topmost cap IS the roof and still
                            // casts.
                            baseMesh.castShadow = !capHasLayerAbove;
                            baseMesh.receiveShadow = true;
                            baseMesh.position.y = capY;
                            baseMesh.userData = baseMesh.userData ?? {};
                            baseMesh.userData.buildingFab2Role = 'roof';
                            baseMesh.userData.buildingFab2RoofKind = 'core';
                            solidMeshes.push(baseMesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(baseGeo, 1);
                                appendWirePositions(wirePositions, edgeGeo, baseMesh.position.y);
                                edgeGeo.dispose();
                            }
                        }

                        if (outerDetail && outerDetail.length >= 3) {
                            const ringPositions = [];
                            const ringUvs = [];
                            const ringIndices = [];
                            let vCursor = 0;
                            const ringMinEdge = 1e-5;
                            const ringEps = 1e-5;

                            for (let i = 0; i < outerDetail.length; i++) {
                                const oa = outerDetail[i];
                                const ob = outerDetail[(i + 1) % outerDetail.length];
                                if (!oa || !ob) continue;
                                const ax = Number(oa.x) || 0;
                                const az = Number(oa.z) || 0;
                                const bx = Number(ob.x) || 0;
                                const bz = Number(ob.z) || 0;
                                const segLen = Math.hypot(bx - ax, bz - az);
                                if (!(segLen > ringMinEdge)) continue;

                                if (segmentOverOpeningRange(oa, ob, capTopOpenings)) continue;

                                const ba = basePointForFacade(oa);
                                const bb = basePointForFacade(ob);
                                const da = Math.hypot(ax - ba.x, az - ba.z);
                                const db = Math.hypot(bx - bb.x, bz - bb.z);
                                if (!(da > ringEps) && !(db > ringEps)) continue;

                                const addUv = (p) => {
                                    ringUvs.push(Number(p.x) || 0, Number(p.z) || 0);
                                };

                                if (!(da > ringEps)) {
                                    ringPositions.push(
                                        ba.x, 0, ba.z,
                                        bb.x, 0, bb.z,
                                        bx, 0, bz
                                    );
                                    addUv(ba);
                                    addUv(bb);
                                    addUv(ob);
                                    ringIndices.push(vCursor, vCursor + 1, vCursor + 2);
                                    vCursor += 3;
                                    continue;
                                }

                                if (!(db > ringEps)) {
                                    ringPositions.push(
                                        ba.x, 0, ba.z,
                                        bb.x, 0, bb.z,
                                        ax, 0, az
                                    );
                                    addUv(ba);
                                    addUv(bb);
                                    addUv(oa);
                                    ringIndices.push(vCursor, vCursor + 1, vCursor + 2);
                                    vCursor += 3;
                                    continue;
                                }

                                ringPositions.push(
                                    ba.x, 0, ba.z,
                                    bb.x, 0, bb.z,
                                    bx, 0, bz,
                                    ax, 0, az
                                );
                                addUv(ba);
                                addUv(bb);
                                addUv(ob);
                                addUv(oa);
                                ringIndices.push(
                                    vCursor, vCursor + 1, vCursor + 2,
                                    vCursor, vCursor + 2, vCursor + 3
                                );
                                vCursor += 4;
                            }

                            const validRingIndices = filterZeroAreaTriangleIndices(ringPositions, ringIndices);
                            if (ringPositions.length && validRingIndices.length) {
                                const ringGeo = new THREE.BufferGeometry();
                                ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringPositions), 3));
                                ringGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ringUvs), 2));
                                ringGeo.setIndex(validRingIndices);
                                ringGeo.computeVertexNormals();

                                // The ring doubles as the soffit over recessed
                                // bays below it; mid-stack it reads as wall,
                                // only the topmost ring belongs to the roof.
                                const ringMat = capHasLayerAbove ? closureBandWallMat : capMatTemplate.clone();
                                ringMat.side = THREE.DoubleSide;
                                const ringMesh = new THREE.Mesh(ringGeo, ringMat);
                                // Same rule as the cap it rings (see above).
                                ringMesh.castShadow = !capHasLayerAbove;
                                ringMesh.receiveShadow = true;
                                ringMesh.position.y = capY;
                                ringMesh.userData = ringMesh.userData ?? {};
                                ringMesh.userData.buildingFab2Role = 'roof';
                                ringMesh.userData.buildingFab2RoofKind = 'cap_band';
                                solidMeshes.push(ringMesh);

                                if (showWire) {
                                    const edgeGeo = new THREE.EdgesGeometry(ringGeo, 1);
                                    appendWirePositions(wirePositions, edgeGeo, ringMesh.position.y);
                                    edgeGeo.dispose();
                                }
                            }

                            // Signed distance of an outline point from the nominal
                            // zero-depth footprint line: negative = recessed inward,
                            // positive = bulging outward past the footprint.
                            const outwardSignForDetailPoint = (p, zeroPoint) => {
                                const faceId = p?.faceId;
                                if (!isFaceId(faceId) || !frames) return null;
                                const frame = frames[faceId] ?? null;
                                if (!frame) return null;
                                const u = Number(p.u) || 0;
                                const probe = pointOnFacadeFrame({ frame, u, depth: 1 });
                                const ox = probe.x - zeroPoint.x;
                                const oz = probe.z - zeroPoint.z;
                                const len = Math.hypot(ox, oz);
                                if (!(len > 1e-6)) return null;
                                const px = (Number(p.x) || 0) - zeroPoint.x;
                                const pz = (Number(p.z) || 0) - zeroPoint.z;
                                return (px * ox + pz * oz) / len;
                            };

                            // Bands that close each layer against the nominal footprint
                            // line the neighboring layers meet it at:
                            // - top band (at capY): covers strips where this layer's
                            //   outline recesses inward (the overhang above the recess).
                            // - bottom band (at layerStartY): covers the underside of
                            //   strips where this layer bulges outward past the layer
                            //   below. Skipped on the ground layer.
                            const buildFootprintClosureBand = ({ wantSign, y, kind, skipOverOpenings = null }) => {
                                const bandPositions = [];
                                const bandUvs = [];
                                const bandIndices = [];
                                let bandCursor = 0;
                                const bandMinEdge = 1e-5;
                                const bandEps = 1e-5;

                                for (let i = 0; i < outerDetail.length; i++) {
                                    const oa = outerDetail[i];
                                    const ob = outerDetail[(i + 1) % outerDetail.length];
                                    if (!oa || !ob) continue;
                                    const ax = Number(oa.x) || 0;
                                    const az = Number(oa.z) || 0;
                                    const bx = Number(ob.x) || 0;
                                    const bz = Number(ob.z) || 0;
                                    const segLen = Math.hypot(bx - ax, bz - az);
                                    if (!(segLen > bandMinEdge)) continue;

                                    if (skipOverOpenings && segmentOverOpeningRange(oa, ob, skipOverOpenings)) continue;

                                    const za = zeroPointForFacade(oa);
                                    const zb = zeroPointForFacade(ob);
                                    const da = Math.hypot(ax - za.x, az - za.z);
                                    const db = Math.hypot(bx - zb.x, bz - zb.z);
                                    if (!(da > bandEps) && !(db > bandEps)) continue;

                                    const sa = outwardSignForDetailPoint(oa, za);
                                    const sb = outwardSignForDetailPoint(ob, zb);
                                    const sign = sa ?? sb;
                                    if (sign === null) continue;
                                    if (wantSign < 0 ? !(sign < -bandEps) : !(sign > bandEps)) continue;

                                    const addUv = (p) => {
                                        bandUvs.push(Number(p.x) || 0, Number(p.z) || 0);
                                    };

                                    bandPositions.push(
                                        ax, 0, az,
                                        bx, 0, bz,
                                        zb.x, 0, zb.z,
                                        za.x, 0, za.z
                                    );
                                    addUv(oa);
                                    addUv(ob);
                                    addUv(zb);
                                    addUv(za);
                                    bandIndices.push(
                                        bandCursor, bandCursor + 1, bandCursor + 2,
                                        bandCursor, bandCursor + 2, bandCursor + 3
                                    );
                                    bandCursor += 4;
                                }

                                const validBandIndices = filterZeroAreaTriangleIndices(bandPositions, bandIndices);
                                if (!bandPositions.length || !validBandIndices.length) return;

                                const bandGeo = new THREE.BufferGeometry();
                                bandGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bandPositions), 3));
                                bandGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bandUvs), 2));
                                bandGeo.setIndex(validBandIndices);
                                bandGeo.computeVertexNormals();

                                const bandMesh = new THREE.Mesh(bandGeo, closureBandWallMat);
                                // Closure bands only exist mid-stack, on the
                                // storey line: same rule as the cap.
                                bandMesh.castShadow = false;
                                bandMesh.receiveShadow = true;
                                bandMesh.position.y = y;
                                bandMesh.userData = bandMesh.userData ?? {};
                                bandMesh.userData.buildingFab2Role = 'roof';
                                bandMesh.userData.buildingFab2RoofKind = kind;
                                solidMeshes.push(bandMesh);

                                if (showWire) {
                                    const edgeGeo = new THREE.EdgesGeometry(bandGeo, 1);
                                    appendWirePositions(wirePositions, edgeGeo, bandMesh.position.y);
                                    edgeGeo.dispose();
                                }
                            };

                            if (capHasLayerAbove) {
                                buildFootprintClosureBand({ wantSign: -1, y: capY, kind: 'soffit_band', skipOverOpenings: capTopOpenings });
                            }
                            if (layerIndex > 0) {
                                buildFootprintClosureBand({ wantSign: 1, y: layerStartY, kind: 'underside_band', skipOverOpenings: capBottomOpenings });
                            }
                        }
                    } else {
                        for (const loop of wallOuterFacade) {
                            if (!loop || loop.length < 3) continue;
                            const shape = buildShapeFromLoops({ outerLoop: loop, holeLoops: wallHoles });
                            let geo = new THREE.ExtrudeGeometry(shape, {
                                depth: totalWallHeight,
                                bevelEnabled: false,
                                steps: 1
                            });
                            geo.rotateX(-Math.PI / 2);
                            applyUvYContinuityOffsetToGeometry(geo, { yOffset: yOffset, materialIndex: 1 });
                            applyMatVarCornerDistanceToGeometry(geo, { loops: [loop, ...wallHoles] });
                            if (geo.index) geo = geo.toNonIndexed();
                            geo.computeVertexNormals();

                            // Mid-stack, the extrude's top cap is a visible
                            // ledge wherever the layer above recesses (an
                            // arcade bay's floor is this cap, seen from the
                            // street as a line over the cornice): it reads as
                            // wall, not roof. Only the topmost layer's caps
                            // belong to the roof family — same rule as the
                            // facade path's cap slabs.
                            const capMat = layerIndex < safeLayers.length - 1 ? wallMat : roofMatTemplate.clone();
                            const mesh = new THREE.Mesh(geo, [capMat, wallMat]);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.position.y = layerStartY;
                            mesh.userData = mesh.userData ?? {};
                            mesh.userData.buildingFab2Role = 'wall';
                            mesh.userData.buildingFab2WallKind = 'extrude';
                            mesh.userData.buildingFab2WallBaseMaterialIndex = 1;
                            solidMeshes.push(mesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                appendWirePositions(wirePositions, edgeGeo, layerStartY);
                                edgeGeo.dispose();
                            }
                        }
                    }

                    const usingFacadeStrips = wantsFacadeSilhouette && facadeFrames && Array.isArray(facadeStrips) && facadeStrips.length;
                    const faceMaterials = layer?.faceMaterials && typeof layer.faceMaterials === 'object' ? layer.faceMaterials : null;
                    if (faceMaterials && !usingFacadeStrips && !debugDisableSuspect4FaceOverrideOverlay) {
                        const mainLoop = wallOuterFacade[0] ?? null;
                        const frames = mainLoop ? computeFacadeFramesFromLoop(mainLoop, { warnings }) : null;
                        if (frames) {

                            const baseKey = JSON.stringify({
                                material: layer?.material ?? null,
                                wallBase: layer?.wallBase ?? null,
                                tiling: wallTiling ?? null,
                                materialVariation: wallMatVar ?? null
                            });

                            const links = layer?.faceLinking?.links && typeof layer.faceLinking.links === 'object' ? layer.faceLinking.links : null;
                            const resolveMasterFaceId = (faceId) => {
                                const seen = new Set();
                                let cur = faceId;
                                for (let i = 0; i < 8; i++) {
                                    if (seen.has(cur)) break;
                                    seen.add(cur);
                                    const next = links?.[cur] ?? null;
                                    if (next === null || next === undefined) return cur;
                                    if (next === cur) return cur;
                                    cur = next;
                                }
                                return faceId;
                            };

                            const cache = new Map();
                            const getFaceMaterial = (cfgKey, faceCfg) => {
                                const existing = cache.get(cfgKey) ?? null;
                                if (existing) return existing;

                                const mat = makeWallMaterialFromSpec({
                                    material: faceCfg?.material ?? null,
                                    baseColorHex,
                                    textureCache,
                                    wallBase: faceCfg?.wallBase ?? null
                                });

                                const styleId = faceCfg?.material?.kind === 'texture' ? faceCfg.material.id : null;
                                if (styleId) {
                                    const urls = resolveBuildingStyleWallMaterialUrls(styleId);
                                    const uvCfg = computeUvTilingParams({ tiling: faceCfg?.tiling ?? null, urls, styleId });
                                    if (uvCfg.apply) {
                                        applyUvTilingToMeshStandardMaterial(mat, {
                                            scaleU: uvCfg.scaleU,
                                            scaleV: uvCfg.scaleV,
                                            offsetU: uvCfg.offsetU,
                                            offsetV: uvCfg.offsetV,
                                            rotationDegrees: uvCfg.rotationDegrees
                                        });
                                    }
                                }

                                const faceMatVar = faceCfg?.materialVariation ?? null;
                                if (faceMatVar?.enabled) {
                                    applyMaterialVariationToMeshStandardMaterial(mat, {
                                        seed: matVarSeed,
                                        seedOffset: clampInt(faceMatVar?.seedOffset ?? 0, -9999, 9999),
                                        heightMin: baseY,
                                        heightMax: matVarHeightMax,
                                        config: faceMatVar,
                                        root: MATERIAL_VARIATION_ROOT.WALL,
                                        cornerDist: true
                                    });
                                }

                                cache.set(cfgKey, mat);
                                return mat;
                            };

                            const yCenter = layerStartY + totalWallHeight * 0.5;
                            const yOffset = layerStartY - baseY;
                            const lift = 0.0;
                            let didOffsetWallMatForFacePlanes = false;
                            const faceIds = facadeFaceIdsOf(frames);

                            for (const faceId of faceIds) {
                                const masterFaceId = resolveMasterFaceId(faceId);
                                const faceCfg = faceMaterials?.[masterFaceId] ?? null;
                                if (!faceCfg || typeof faceCfg !== 'object') continue;

                                const cfgKey = JSON.stringify({
                                    material: faceCfg?.material ?? null,
                                    wallBase: faceCfg?.wallBase ?? null,
                                    tiling: faceCfg?.tiling ?? null,
                                    materialVariation: faceCfg?.materialVariation ?? null
                                });
                                if (cfgKey === baseKey) continue;

                                const frame = frames?.[faceId] ?? null;
                                const w = Number(frame?.length) || 0;
                                if (!(w > EPS)) continue;

                                const cx = ((Number(frame?.start?.x) || 0) + (Number(frame?.end?.x) || 0)) * 0.5 + (Number(frame?.n?.x) || 0) * lift;
                                const cz = ((Number(frame?.start?.z) || 0) + (Number(frame?.end?.z) || 0)) * 0.5 + (Number(frame?.n?.z) || 0) * lift;
                                const yaw = Math.atan2(Number(frame?.n?.x) || 0, Number(frame?.n?.z) || 0);

                                const mat = getFaceMaterial(cfgKey, faceCfg);
                                if (!mat) continue;
                                if (!didOffsetWallMatForFacePlanes && wallMat) {
                                    didOffsetWallMatForFacePlanes = true;
                                    wallMat.polygonOffset = true;
                                    wallMat.polygonOffsetFactor = 1;
                                    wallMat.polygonOffsetUnits = 1;
                                    wallMat.needsUpdate = true;
                                }

                                const geo = new THREE.PlaneGeometry(w, totalWallHeight);
                                const uv = geo.getAttribute('uv');
                                if (uv?.getX && uv?.getY && uv?.setX && uv?.setY) {
                                    for (let i = 0; i < uv.count; i++) {
                                        uv.setX(i, uv.getX(i) * w);
                                        uv.setY(i, uv.getY(i) * totalWallHeight + yOffset);
                                    }
                                    uv.needsUpdate = true;
                                }
                                geo.computeVertexNormals();

                                const mesh = new THREE.Mesh(geo, mat);
                                mesh.position.set(cx, yCenter, cz);
                                mesh.rotation.set(0, yaw, 0);
                                mesh.castShadow = true;
                                mesh.receiveShadow = true;
                                mesh.userData = mesh.userData ?? {};
                                mesh.userData.buildingFaceId = faceId;
                                solidMeshes.push(mesh);

                                if (showWire) {
                                    mesh.updateMatrix();
                                    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                    appendWirePositionsTransformed(wirePositions, edgeGeo, mesh.matrix);
                                    edgeGeo.dispose();
                                }
                            }
                        }
                    }
                }
            }

            const floorSegmentStartYs = [];
            for (let floor = 0; floor < floors; floor++) {
                floorSegmentStartYs.push(yCursor);
                if (showFloors && (hadSolidMeshesBeforeLayer || floor > 0 || Math.abs(yCursor - baseY) > EPS)) {
                    appendLoopLinePositions(floorPositions, planLoops, yCursor);
                }

                const floorExtra = firstFloorPendingExtra;
                const segHeight = floorHeight + (floor === 0 ? floorExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;

                if (!continuousWalls) {
                    for (const outerLoop of wallOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: wallHoles });
                        let geo = new THREE.ExtrudeGeometry(shape, {
                            depth: segHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        applyUvYContinuityOffsetToGeometry(geo, { yOffset: yCursor - baseY, materialIndex: 1 });
                        applyMatVarCornerDistanceToGeometry(geo, { loops: [outerLoop, ...wallHoles] });
                        if (geo.index) geo = geo.toNonIndexed();
                        geo.computeVertexNormals();

                        const roofMat = roofMatTemplate.clone();
                        const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = yCursor;
                        solidMeshes.push(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, yCursor);
                            edgeGeo.dispose();
                        }
                    }
                }

                if (winEnabled && windowMat && windowRuns.length) {
                    const windowHeight = Math.min(winDesiredHeight, Math.max(0.3, segHeight * 0.95));
                    const windowYOffset = Math.min(winSill, Math.max(0, segHeight - windowHeight));
                    const y = yCursor + windowYOffset + windowHeight * 0.5;

                    for (const run of windowRuns) {
                        const runLength = Number(run?.length) || 0;
                        if (!(runLength > EPS)) continue;
                        const a = run.a;
                        const tx = run.tx;
                        const tz = run.tz;
                        const nx = run.nx;
                        const nz = run.nz;
                        const yaw = run.yaw;

                        for (const seg of run.segments ?? []) {
                            const segOffset = Number(seg?.offset) || 0;
                            const starts = seg?.layout?.starts ?? [];
                            for (const start of starts) {
                                const leftDist = segOffset + start;
                                const rightDist = leftDist + winWidth;
                                if (leftDist < cornerEps - 1e-6 || rightDist > runLength - cornerEps + 1e-6) continue;
                                const centerDist = segOffset + start + winWidth * 0.5;
                                const cx = a.x + tx * centerDist + nx * windowOffset;
                                const cz = a.z + tz * centerDist + nz * windowOffset;

                                const geo = getPlaneGeometry(winWidth, windowHeight);
                                addWindowInstance({ geometry: geo, material: windowMat, x: cx, y, z: cz, yaw, renderOrder: 0 });

                                if (windowGlassMat) {
                                    addWindowInstance({
                                        geometry: geo,
                                        material: windowGlassMat,
                                        x: cx + nx * glassLift,
                                        y,
                                        z: cz + nz * glassLift,
                                        yaw,
                                        renderOrder: 1
                                    });
                                }
                            }
                        }
                    }
                }

                if (bayWindowPlacements.length) {
                    const customBuckets = new Map();
                    // AI 488: storefront zone slabs / portal steps share materials
                    // within a floor segment (layer material is fixed here).
                    const storefrontZoneMaterialCache = new Map();
                    const addCustomInstance = ({ defId, assetType, settings, decoration, bend, x, y, z, yaw, instanceId, floorBaseY, floorTopY }) => {
                        const safeAssetType = normalizeWindowFabricationAssetType(assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW);
                        const safeSettings = sanitizeWindowMeshSettings(settings ?? null);
                        const safeDecoration = deepClone(decoration ?? null);
                        const safeBend = bend && typeof bend === 'object'
                            ? { centerZ: Number(bend.centerZ), segments: clampInt(bend.segments, 2, 32) }
                            : null;
                        const key = JSON.stringify({
                            defId: typeof defId === 'string' ? defId : '',
                            assetType: safeAssetType,
                            settings: safeSettings,
                            decoration: safeDecoration,
                            bend: safeBend
                        });
                        let bucket = customBuckets.get(key);
                        if (!bucket) {
                            bucket = {
                                defId: typeof defId === 'string' ? defId : '',
                                assetType: safeAssetType,
                                settings: safeSettings,
                                decoration: safeDecoration,
                                bend: safeBend,
                                instances: []
                            };
                            customBuckets.set(key, bucket);
                        }
                        bucket.instances.push({
                            id: instanceId,
                            position: { x, y, z },
                            yaw,
                            floorBaseY: Number.isFinite(Number(floorBaseY)) ? Number(floorBaseY) : null,
                            floorTopY: Number.isFinite(Number(floorTopY)) ? Number(floorTopY) : null
                        });
                    };
                    const addGarageFacadeGeometry = ({
                        point,
                        openingY,
                        openingHeight,
                        settings,
                        wall,
                        nx,
                        nz,
                        yaw,
                        garageFacade
                    }) => {
                        const pointObj = point && typeof point === 'object' ? point : null;
                        const safeSettings = settings && typeof settings === 'object' ? settings : null;
                        if (!pointObj || !safeSettings) return;

                        const resolvedWall = normalizeOpeningWallCutConfig(wall ?? null, null);
                        const metrics = resolveOpeningCutMetrics(safeSettings, {
                            cutX: resolvedWall.cutWidthLerp,
                            cutY: resolvedWall.cutHeightLerp
                        });
                        const openingWidth = Number(metrics?.cutWidth) || 0;
                        const openingCutHeight = Number(metrics?.cutHeight) || 0;
                        if (!(openingWidth > EPS) || !(openingCutHeight > EPS)) return;

                        const facade = normalizeGarageFacadeConfig(garageFacade, null);
                        const facadeState = normalizeGarageFacadeState(facade?.state, GARAGE_FACADE_STATE.CLOSED);
                        const facadeRotationDegrees = normalizeGarageFacadeRotationDegrees(
                            facade?.rotationDegrees,
                            GARAGE_FACADE_ROTATION_DEGREES.DEG_0
                        );
                        const centerY = openingY + (Number(metrics?.cutCenterYOffset) || 0);
                        const x = Number(pointObj?.x) || 0;
                        const z = Number(pointObj?.z) || 0;
                        const frameInset = Math.max(0, Number(safeSettings?.frame?.inset) || 0);

                        if (facadeState === GARAGE_FACADE_STATE.CLOSED) {
                            const panelGeo = new THREE.PlaneGeometry(openingWidth, openingCutHeight);
                            const closedMaterialId = String(facade?.closedMaterialId ?? '').trim() || GARAGE_INTERIOR_MATERIAL_ID;
                            const panelMat = makeBeltLikeMaterialFromSpec({
                                material: { kind: 'texture', id: closedMaterialId },
                                baseColorHex,
                                textureCache
                            });
                            panelMat.roughness = 0.48;
                            panelMat.metalness = 0.92;
                            if (panelMat.normalScale) panelMat.normalScale.set(1.0, 1.0);
                            applyUvTilingToMeshStandardMaterial(panelMat, {
                                scaleU: Math.max(1.0, openingWidth / 0.75),
                                scaleV: Math.max(1.0, openingCutHeight / 0.75),
                                rotationDegrees: facadeRotationDegrees
                            });

                            const panelInset = Math.max(0.01, frameInset + 0.01);
                            const panelMesh = new THREE.Mesh(panelGeo, panelMat);
                            panelMesh.position.set(
                                x + nx * (windowOffset - panelInset),
                                centerY,
                                z + nz * (windowOffset - panelInset)
                            );
                            panelMesh.rotation.set(0, yaw, 0);
                            panelMesh.castShadow = true;
                            panelMesh.receiveShadow = true;
                            panelMesh.userData = panelMesh.userData ?? {};
                            panelMesh.userData.buildingWindowSource = 'bf2_garage_facade';
                            panelMesh.userData.garageFacadeState = GARAGE_FACADE_STATE.CLOSED;
                            windowsGroup.add(panelMesh);
                            return;
                        }

                        const roomWidth = Math.max(openingWidth + 0.8, openingWidth * 1.28);
                        const roomHeight = Math.max(openingCutHeight + 0.7, openingCutHeight * 1.22);
                        const roomDepth = Math.max(0.1, Math.min(6.0, Math.max(0.1, Number(openingHeight) || openingCutHeight) * 0.5));
                        const roomGeo = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
                        const roomMat = makeBeltLikeMaterialFromSpec({
                            material: { kind: 'texture', id: GARAGE_INTERIOR_MATERIAL_ID },
                            baseColorHex,
                            textureCache
                        });
                        roomMat.roughness = 0.92;
                        roomMat.metalness = 0.0;
                        roomMat.side = THREE.BackSide;
                        applyUvTilingToMeshStandardMaterial(roomMat, {
                            scaleU: Math.max(1.0, roomWidth / 1.6),
                            scaleV: Math.max(1.0, roomHeight / 1.6)
                        });
                        const roomMesh = new THREE.Mesh(roomGeo, roomMat);
                        roomMesh.position.set(
                            x + nx * (windowOffset - frameInset - roomDepth * 0.5 - 0.02),
                            centerY,
                            z + nz * (windowOffset - frameInset - roomDepth * 0.5 - 0.02)
                        );
                        roomMesh.rotation.set(0, yaw, 0);
                        roomMesh.castShadow = true;
                        roomMesh.receiveShadow = true;
                        roomMesh.userData = roomMesh.userData ?? {};
                        roomMesh.userData.buildingWindowSource = 'bf2_garage_facade';
                        roomMesh.userData.garageFacadeState = GARAGE_FACADE_STATE.OPEN;
                        windowsGroup.add(roomMesh);
                    };

                    for (let i = 0; i < bayWindowPlacements.length; i++) {
                        const placement = bayWindowPlacements[i];
                        const placementAssetType = normalizeWindowFabricationAssetType(
                            placement?.assetType,
                            WINDOW_FABRICATION_ASSET_TYPE.WINDOW
                        );
                        const width = Math.max(0.1, Number(placement?.width) || 0.1);
                        const yaw = Number(placement?.yaw) || 0;
                        const nx = Number(placement?.nx) || 0;
                        const nz = Number(placement?.nz) || 0;
                        const defId = typeof placement?.defId === 'string' ? placement.defId : '';
                        const defSettings = placement?.settings && typeof placement.settings === 'object' ? placement.settings : null;
                        const points = Array.isArray(placement?.points) ? placement.points : [];
                        const placementFrame = facadeFrames?.[placement?.faceId] ?? null;
                        if (!points.length) continue;

                        const resolvedPlacement = resolveBayOpeningPlacementInSegment({
                            segmentHeight: segHeight,
                            requestedHeight: Number(placement?.height) || 0.1,
                            heightMode: placement?.heightMode,
                            verticalOffsetMeters: placement?.verticalOffsetMeters,
                            top: placement?.top
                        });
                        const bottomHeight = Math.max(0.1, Number(resolvedPlacement?.bottom?.height) || 0.1);
                        const bottomYBottom = clamp(Number(resolvedPlacement?.bottom?.yBottom) || 0, 0, Math.max(0, segHeight - bottomHeight));
                        const bottomY = yCursor + bottomYBottom + bottomHeight * 0.5;

                        const topCfg = placement?.top && typeof placement.top === 'object' ? placement.top : null;
                        const topHeight = Math.max(0, Number(resolvedPlacement?.top?.height) || 0);
                        const topYBottom = Math.max(0, Number(resolvedPlacement?.top?.yBottom) || 0);
                        const topY = yCursor + topYBottom + topHeight * 0.5;

                        const bottomMuntinsEnabled = placement?.muntins?.bottomEnabled !== false;
                        const topMuntinsEnabled = placement?.muntins?.topEnabled !== false;
                        const topFrameWidth = Number(topCfg?.frameWidthMeters);
                        const hasTopFrameWidthOverride = Number.isFinite(topFrameWidth);
                        const topDefId = typeof topCfg?.defId === 'string' ? topCfg.defId : defId;
                        const topAssetType = normalizeWindowFabricationAssetType(
                            topCfg?.assetType,
                            normalizeWindowFabricationAssetType(placement?.assetType, WINDOW_FABRICATION_ASSET_TYPE.WINDOW)
                        );

                        if (defSettings) {
                            const bottomSettings = sanitizeWindowMeshSettings(applyOpeningVisualOverridesToSettings({
                                ...defSettings,
                                ...(arcadeArchPatch({ segmentHeight: segHeight, placementIndex: i, target: 'bottom', source: defSettings }) ?? {}),
                                width,
                                height: bottomHeight,
                                muntins: {
                                    ...(defSettings?.muntins ?? {}),
                                    enabled: bottomMuntinsEnabled
                                }
                            }, placement?.visual));
                            const topSettingsSource = bottomSettings;
                            const topFrameSettings = hasTopFrameWidthOverride
                                ? {
                                    ...(topSettingsSource?.frame ?? {}),
                                    width: topFrameWidth,
                                    verticalWidth: topFrameWidth,
                                    horizontalWidth: topFrameWidth
                                }
                                : {
                                    ...(topSettingsSource?.frame ?? {})
                                };
                            if (placementAssetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR
                                || topAssetType === WINDOW_FABRICATION_ASSET_TYPE.DOOR) {
                                topFrameSettings.addHandles = false;
                                topFrameSettings.doorStyle = 'single';
                            }
                            const topSettings = (topHeight > EPS)
                                ? sanitizeWindowMeshSettings({
                                    ...topSettingsSource,
                                    ...(arcadeArchPatch({ segmentHeight: segHeight, placementIndex: i, target: 'top', source: topSettingsSource }) ?? {}),
                                    frame: topFrameSettings,
                                    width,
                                    height: topHeight,
                                    muntins: {
                                        ...(topSettingsSource?.muntins ?? {}),
                                        enabled: topMuntinsEnabled
                                    }
                                })
                                : null;
                            const bottomDecoration = placement?.decoration ?? null;
                            const topDecoration = topCfg?.decoration ?? bottomDecoration;

                            const bottomFrameDepth = Math.max(0, Number(bottomSettings?.frame?.depth) || 0);
                            const bottomFrameInset = Math.max(0, bottomFrameDepth - 0.001);
                            const topPlacementInset = bottomFrameInset;

                            const zoneMaterialFor = (materialSpec, fallbackMode) => {
                                const frameKey = `${bottomSettings?.frame?.colorHex ?? ''}:${bottomSettings?.frame?.material?.roughness ?? ''}`;
                                const key = `${JSON.stringify(materialSpec ?? null)}|${fallbackMode}|${frameKey}`;
                                let mat = storefrontZoneMaterialCache.get(key);
                                if (!mat) {
                                    mat = makeWindowDecorationPartMaterial({
                                        part: { material: materialSpec ?? null },
                                        fallbackMode,
                                        settings: bottomSettings,
                                        layerMaterial: layer?.material ?? null,
                                        layerWallBase: layer?.wallBase ?? null,
                                        baseColorHex,
                                        textureCache
                                    });
                                    storefrontZoneMaterialCache.set(key, mat);
                                }
                                return mat;
                            };

                            // AI 488: storefront placements decompose into stacked
                            // zones. Glazed zones ride the normal window-instance
                            // path (frame/mullions/glass/parallax + wall cuts);
                            // bulkhead, fascia and the backlit panel are solid
                            // meshes over/inside the wall.
                            if (placementAssetType === WINDOW_FABRICATION_ASSET_TYPE.STOREFRONT && placement?.storefront) {
                                const layout = resolveStorefrontZoneLayout({
                                    storefront: placement.storefront,
                                    totalHeightMeters: bottomHeight
                                });
                                const zoneSettings = makeStorefrontZoneSettings({
                                    baseSettings: bottomSettings,
                                    width,
                                    layout
                                });
                                const cfg = layout.config;
                                const openingBottomY = yCursor + bottomYBottom;
                                const glazingFrameDepth = Math.max(0, Number(zoneSettings.glazing?.frame?.depth) || 0);
                                const glazingInset = Math.max(0, glazingFrameDepth - 0.001);
                                const transomFrameDepth = Math.max(0, Number(zoneSettings.transom?.frame?.depth) || 0);
                                // An authored transom inset overrides the legacy
                                // frame-depth placement; negative stands the
                                // white band PROUD of the wall plane, ahead of
                                // the fascia (the reference's depth order).
                                const transomInsetAuthored = Number.isFinite(cfg.transom?.insetMeters);
                                const transomInset = transomInsetAuthored
                                    ? cfg.transom.insetMeters
                                    : Math.max(0, transomFrameDepth - 0.001);
                                const wallCutX = Number(placement?.wall?.cutWidthLerp) || 0;
                                const wallCutY = Number(placement?.wall?.cutHeightLerp) || 0;

                                for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
                                    const point = points[pointIndex] && typeof points[pointIndex] === 'object' ? points[pointIndex] : null;
                                    const px = Number(point?.x) || 0;
                                    const pz = Number(point?.z) || 0;
                                    const pointNx = Number(point?.nx ?? nx) || 0;
                                    const pointNz = Number(point?.nz ?? nz) || 0;
                                    const pointYaw = Number(point?.yaw ?? yaw) || 0;
                                    const baseInstanceId = points.length > 1
                                        ? `${layerId || 'layer'}:${floor}:${i}:${defId || 'opening'}:${pointIndex}`
                                        : `${layerId || 'layer'}:${floor}:${i}:${defId || 'opening'}`;

                                    const glazingY = openingBottomY + layout.glazing.yBottom + layout.glazing.height * 0.5;
                                    const glazingPoseOffset = windowOffset - glazingInset;
                                    addCustomInstance({
                                        defId,
                                        assetType: placementAssetType,
                                        settings: zoneSettings.glazing,
                                        decoration: placement?.decoration ?? null,
                                        bend: resolveCurvedWindowBend({
                                            frame: placementFrame,
                                            point,
                                            nx: pointNx,
                                            nz: pointNz,
                                            settings: zoneSettings.glazing,
                                            poseOffset: glazingPoseOffset
                                        }),
                                        x: px + pointNx * glazingPoseOffset,
                                        y: glazingY,
                                        z: pz + pointNz * glazingPoseOffset,
                                        yaw: pointYaw,
                                        instanceId: `${baseInstanceId}:glazing`,
                                        floorBaseY: yCursor,
                                        floorTopY: yCursor + segHeight
                                    });

                                    if (zoneSettings.transom) {
                                        const transomY = openingBottomY + layout.transom.yBottom + layout.transom.height * 0.5;
                                        const transomPoseOffset = windowOffset - transomInset;
                                        addCustomInstance({
                                            defId,
                                            assetType: placementAssetType,
                                            settings: zoneSettings.transom,
                                            decoration: null,
                                            bend: resolveCurvedWindowBend({
                                                frame: placementFrame,
                                                point,
                                                nx: pointNx,
                                                nz: pointNz,
                                                settings: zoneSettings.transom,
                                                poseOffset: transomPoseOffset
                                            }),
                                            x: px + pointNx * transomPoseOffset,
                                            y: transomY,
                                            z: pz + pointNz * transomPoseOffset,
                                            yaw: pointYaw,
                                            instanceId: `${baseInstanceId}:transom`,
                                            floorBaseY: yCursor,
                                            floorTopY: yCursor + segHeight
                                        });

                                        if (layout.transom.mode === STOREFRONT_TRANSOM_MODE.BACKLIT) {
                                            const transomMetrics = resolveOpeningCutMetrics(zoneSettings.transom, {
                                                cutX: wallCutX,
                                                cutY: wallCutY
                                            });
                                            const panelWidth = Math.max(0.05, Number(transomMetrics?.cutWidth) || 0.05);
                                            const panelHeight = Math.max(0.05, Number(transomMetrics?.cutHeight) || 0.05);
                                            // The backlit panel rides just behind its zone
                                            // frame; an authored (possibly proud) inset
                                            // carries it along instead of being floored.
                                            const panelInset = transomInsetAuthored
                                                ? transomInset + 0.01
                                                : Math.max(0.01, transomInset + 0.01);
                                            const emissiveColor = (Number(cfg.transom.emissiveColorHex) >>> 0) & 0xffffff;
                                            const panelMatKey = `backlit|${emissiveColor}|${cfg.transom.emissiveIntensity}`;
                                            let panelMat = storefrontZoneMaterialCache.get(panelMatKey);
                                            if (!panelMat) {
                                                panelMat = new THREE.MeshStandardMaterial({
                                                    color: emissiveColor,
                                                    roughness: 0.55,
                                                    metalness: 0.0,
                                                    emissive: new THREE.Color(emissiveColor),
                                                    emissiveIntensity: clamp(cfg.transom.emissiveIntensity, 0.0, 5.0)
                                                });
                                                disableIblOnMaterial(panelMat);
                                                storefrontZoneMaterialCache.set(panelMatKey, panelMat);
                                            }
                                            // A proud transom used to leave an open air gap
                                            // between its floating panel and the wall — the
                                            // panel is a closed light box now, its body
                                            // running from behind the glass back past the
                                            // wall plane so no gap shows from below/beside.
                                            const panelBackInset = Math.max(panelInset + 0.02, 0.06);
                                            const panelDepth = panelBackInset - panelInset;
                                            const panelCenterInset = (panelInset + panelBackInset) * 0.5;
                                            const panelMesh = new THREE.Mesh(
                                                new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
                                                panelMat
                                            );
                                            panelMesh.position.set(
                                                px + nx * (windowOffset - panelCenterInset),
                                                transomY + (Number(transomMetrics?.cutCenterYOffset) || 0),
                                                pz + nz * (windowOffset - panelCenterInset)
                                            );
                                            panelMesh.rotation.set(0, yaw, 0);
                                            panelMesh.castShadow = false;
                                            panelMesh.receiveShadow = false;
                                            panelMesh.userData = panelMesh.userData ?? {};
                                            panelMesh.userData.buildingWindowSource = 'bf2_storefront';
                                            panelMesh.userData.buildingFab2Role = 'storefront_backlit_panel';
                                            panelMesh.userData.windowDefinitionId = defId || null;
                                            windowsGroup.add(panelMesh);
                                        }
                                    }

                                    const emitZoneSlab = ({ zoneHeight, zoneYBottom, projection, materialSpec, role }) => {
                                        if (!(zoneHeight > 0.02)) return;
                                        // `projection` is signed: the slab FACE sits at
                                        // windowOffset + projection (negative = into the
                                        // wall), with its body extending inward. 0 means
                                        // FLUSH with the wall face — nudged a hair proud
                                        // so the two planes never z-fight.
                                        const projRaw = Number.isFinite(projection) ? projection : 0.02;
                                        const proj = Math.abs(projRaw) < 0.003 ? 0.003 : projRaw;
                                        const slabDepth = Math.max(0.02, Math.abs(proj)) + 0.08;
                                        const geo = new THREE.BoxGeometry(width, zoneHeight, slabDepth);
                                        const mesh = new THREE.Mesh(geo, zoneMaterialFor(materialSpec, WINDOW_DECORATION_MATERIAL_MODE.MATCH_FRAME));
                                        const outCenter = windowOffset + proj - slabDepth * 0.5;
                                        mesh.position.set(
                                            px + nx * outCenter,
                                            openingBottomY + zoneYBottom + zoneHeight * 0.5,
                                            pz + nz * outCenter
                                        );
                                        mesh.rotation.set(0, yaw, 0);
                                        mesh.castShadow = true;
                                        mesh.receiveShadow = true;
                                        mesh.userData = mesh.userData ?? {};
                                        mesh.userData.buildingWindowSource = 'bf2_storefront';
                                        mesh.userData.buildingFab2Role = role;
                                        mesh.userData.windowDefinitionId = defId || null;
                                        windowsGroup.add(mesh);
                                    };

                                    if (cfg.bulkhead.enabled) {
                                        emitZoneSlab({
                                            zoneHeight: layout.bulkhead.height,
                                            zoneYBottom: layout.bulkhead.yBottom,
                                            projection: cfg.bulkhead.projectionMeters,
                                            materialSpec: cfg.bulkhead.material,
                                            role: 'storefront_bulkhead'
                                        });
                                    }
                                    if (cfg.fascia.enabled) {
                                        emitZoneSlab({
                                            zoneHeight: layout.fascia.height,
                                            zoneYBottom: layout.fascia.yBottom,
                                            projection: cfg.fascia.projectionMeters,
                                            materialSpec: cfg.fascia.material,
                                            role: 'storefront_fascia'
                                        });
                                    }
                                    // Solid transom: an unlit panel covering the band,
                                    // built like a fascia slab. `insetMeters` keeps its
                                    // sign convention (positive = into the wall,
                                    // negative = proud, 0/unauthored = flush), mapped
                                    // onto the slab's signed projection.
                                    if (layout.transom.mode === STOREFRONT_TRANSOM_MODE.SOLID && layout.transom.height > 0.02) {
                                        emitZoneSlab({
                                            zoneHeight: layout.transom.height,
                                            zoneYBottom: layout.transom.yBottom,
                                            projection: transomInsetAuthored ? -transomInset : 0,
                                            materialSpec: cfg.transom.material,
                                            role: 'storefront_transom_solid'
                                        });
                                    }
                                }
                                continue;
                            }

                            for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
                                const point = points[pointIndex] && typeof points[pointIndex] === 'object' ? points[pointIndex] : null;
                                const x = Number(point?.x) || 0;
                                const z = Number(point?.z) || 0;
                                const pointNx = Number(point?.nx ?? nx) || 0;
                                const pointNz = Number(point?.nz ?? nz) || 0;
                                const pointYaw = Number(point?.yaw ?? yaw) || 0;
                                const baseInstanceId = points.length > 1
                                    ? `${layerId || 'layer'}:${floor}:${i}:${defId || 'opening'}:${pointIndex}`
                                    : `${layerId || 'layer'}:${floor}:${i}:${defId || 'opening'}`;
                                const bottomPoseOffset = windowOffset - bottomFrameInset;
                                addCustomInstance({
                                    defId,
                                    assetType: placementAssetType,
                                    settings: bottomSettings,
                                    decoration: bottomDecoration,
                                    bend: resolveCurvedWindowBend({
                                        frame: placementFrame,
                                        point,
                                        nx: pointNx,
                                        nz: pointNz,
                                        settings: bottomSettings,
                                        poseOffset: bottomPoseOffset
                                    }),
                                    x: x + pointNx * bottomPoseOffset,
                                    y: bottomY,
                                    z: z + pointNz * bottomPoseOffset,
                                    yaw: pointYaw,
                                    instanceId: (topSettings && topHeight > EPS)
                                        ? `${baseInstanceId}:bottom`
                                        : baseInstanceId,
                                    floorBaseY: yCursor,
                                    floorTopY: yCursor + segHeight
                                });
                                // AI 490: window AC unit scatter. Deterministic
                                // per building seed + instance key, so the same
                                // city always renders the same AC placement.
                                for (let acItemIndex = 0; acItemIndex < acAttachmentItems.length; acItemIndex++) {
                                    const acItem = acAttachmentItems[acItemIndex];
                                    if (!acItem.eligibility.assetTypes.includes(placementAssetType)) continue;
                                    if (acItem.eligibility.layerIds && !acItem.eligibility.layerIds.includes(layerId)) continue;
                                    if (floor + 1 < acItem.eligibility.minFloor) continue;
                                    if (!shouldPlaceAcUnit({
                                        seed: matVarSeed,
                                        instanceKey: `${acItem.id}|${baseInstanceId}`,
                                        probability: acItem.probability,
                                        seedOffset: acItem.seedOffset
                                    })) continue;
                                    const acMetrics = resolveOpeningCutMetrics(bottomSettings, {
                                        cutX: Number(placement?.wall?.cutWidthLerp) || 0,
                                        cutY: Number(placement?.wall?.cutHeightLerp) || 0
                                    });
                                    const acOpeningWidth = Math.max(0.3, Number(acMetrics?.cutWidth) || width);
                                    const acGeo = makeAcUnitGeometryTemplate({
                                        widthMeters: Math.min(acItem.unit.widthMeters, acOpeningWidth * 0.72),
                                        heightMeters: acItem.unit.heightMeters,
                                        depthMeters: acItem.unit.depthMeters
                                    });
                                    const acOut = windowOffset + acItem.unit.depthMeters * 0.5 - 0.2;
                                    const acMatrix = new THREE.Matrix4().compose(
                                        new THREE.Vector3(
                                            x + nx * acOut,
                                            yCursor + bottomYBottom + 0.03,
                                            z + nz * acOut
                                        ),
                                        new THREE.Quaternion().setFromEuler(
                                            new THREE.Euler(acItem.unit.tiltDegrees * (Math.PI / 180), yaw, 0, 'YXZ')
                                        ),
                                        new THREE.Vector3(1, 1, 1)
                                    );
                                    acGeo.applyMatrix4(acMatrix);
                                    let acList = acUnitGeosByItemIndex.get(acItemIndex);
                                    if (!acList) {
                                        acList = [];
                                        acUnitGeosByItemIndex.set(acItemIndex, acList);
                                    }
                                    acList.push(acGeo);
                                    break;
                                }
                                if (placementAssetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
                                    addGarageFacadeGeometry({
                                        point,
                                        openingY: bottomY,
                                        openingHeight: bottomHeight,
                                        settings: bottomSettings,
                                        wall: placement?.wall ?? null,
                                        nx,
                                        nz,
                                        yaw,
                                        garageFacade: placement?.garageFacade ?? null
                                    });
                                }
                                // AI 488: portal entry steps climb from grade to the
                                // raised door threshold, each lower tread reaching one
                                // treadDepth further out from the facade.
                                if (placement?.portal && placement.portal.steps.count > 0
                                    && floor === 0
                                    && safeLayers.findIndex((l) => l?.type === LAYER_TYPE.FLOOR) === layerIndex) {
                                    const portalCfg = placement.portal;
                                    const stepsCount = portalCfg.steps.count;
                                    const stepRise = portalCfg.steps.riseMeters;
                                    const stepTread = portalCfg.steps.treadDepthMeters;
                                    const thresholdY = yCursor + bottomYBottom;
                                    const stepsBaseY = thresholdY - stepsCount * stepRise;
                                    const doorMetrics = resolveOpeningCutMetrics(bottomSettings, {
                                        cutX: Number(placement?.wall?.cutWidthLerp) || 0,
                                        cutY: Number(placement?.wall?.cutHeightLerp) || 0
                                    });
                                    const stepWidth = Math.max(0.3, (Number(doorMetrics?.cutWidth) || width))
                                        + portalCfg.steps.widthPaddingMeters * 2;
                                    const stepMat = zoneMaterialFor(
                                        portalCfg.steps.material,
                                        WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
                                    );
                                    for (let s = 0; s < stepsCount; s++) {
                                        const outLen = stepTread * (stepsCount - s) + 0.02;
                                        const stepGeo = new THREE.BoxGeometry(stepWidth, stepRise, outLen);
                                        const stepMesh = new THREE.Mesh(stepGeo, stepMat);
                                        const outCenter = windowOffset + stepTread * (stepsCount - s) - outLen * 0.5;
                                        stepMesh.position.set(
                                            x + nx * outCenter,
                                            stepsBaseY + s * stepRise + stepRise * 0.5,
                                            z + nz * outCenter
                                        );
                                        stepMesh.rotation.set(0, yaw, 0);
                                        stepMesh.castShadow = true;
                                        stepMesh.receiveShadow = true;
                                        stepMesh.userData = stepMesh.userData ?? {};
                                        stepMesh.userData.buildingWindowSource = 'bf2_portal';
                                        stepMesh.userData.buildingFab2Role = 'portal_steps';
                                        stepMesh.userData.windowDefinitionId = defId || null;
                                        windowsGroup.add(stepMesh);
                                    }
                                }
                                // AI 509/510: portal surround — arch orders,
                                // impost blocks and custom ornament parts from
                                // the portal def, plus colonettes flanking the
                                // entry and a frieze panel band, all in the
                                // zone material dialect.
                                if (placement?.portal && (placement.portal.colonettes || placement.portal.frieze || placement.portalDef)
                                    && floor === 0
                                    && safeLayers.findIndex((l) => l?.type === LAYER_TYPE.FLOOR) === layerIndex) {
                                    const surroundPortal = placement.portal;
                                    const surroundMetrics = resolveOpeningCutMetrics(bottomSettings, {
                                        cutX: Number(placement?.wall?.cutWidthLerp) || 0,
                                        cutY: Number(placement?.wall?.cutHeightLerp) || 0
                                    });
                                    const surroundCutWidth = Math.max(0.3, Number(surroundMetrics?.cutWidth) || width);
                                    const surroundCutHeight = Math.max(0.3, Number(surroundMetrics?.cutHeight) || bottomHeight);
                                    const doorBottomY = yCursor + bottomYBottom;
                                    const doorTopY = doorBottomY + bottomHeight;
                                    const surroundCutBottomY = doorBottomY + bottomHeight * 0.5
                                        + (Number(surroundMetrics?.cutCenterYOffset) || 0) - surroundCutHeight * 0.5;
                                    const surroundOrderExtra = Math.max(0, Number(placement?.portalOrderExtraHalfWidth) || 0);
                                    const surroundArchRise = bottomSettings?.arch?.enabled
                                        ? Math.min(
                                            Math.max(0, (Number(bottomSettings?.arch?.heightRatio) || 0) * width),
                                            bottomHeight * 0.8
                                        )
                                        : 0;
                                    const springLineY = doorTopY - surroundArchRise;

                                    const portalPalette = placement.portalDef?.palette ?? {};
                                    // ---- AI 510 (rework): the portal is a BOX inserted
                                    // into the facade, with nested inset LEVELS telescoping
                                    // inward to the door hole. ----
                                    let levelGeoResolved = null;
                                    if (placement.portalDef) {
                                        const cutArchRise = bottomSettings?.arch?.enabled
                                            ? Math.min(
                                                Math.max(0, (Number(bottomSettings?.arch?.heightRatio) || 0) * surroundCutWidth),
                                                Math.max(0, surroundCutHeight - Math.max(0, Number(surroundMetrics?.frameHorizontalWidth) || 0))
                                            )
                                            : 0;
                                        levelGeoResolved = resolvePortalLevelGeometry({
                                            cutWidth: surroundCutWidth,
                                            cutHeight: surroundCutHeight,
                                            archRise: cutArchRise,
                                            def: placement.portalDef,
                                            maxHalfWidth: Number(placement?.portalBoxMaxHalfWidth) || Infinity
                                        });
                                    }

                                    // Colonette/pilaster layout, computed up front because the
                                    // 'capital' ornament anchor crowns these shafts: the shafts
                                    // shorten to leave room and the part sits on top of them.
                                    let colLayout = null;
                                    if (surroundPortal.colonettes) {
                                        const col = surroundPortal.colonettes;
                                        const pilaster = col.shape === 'pilaster';
                                        const pilasterW = clamp(col.widthMeters, 0.2, 1.2);
                                        const halfW = pilaster ? pilasterW * 0.5 : col.radiusMeters;
                                        const pitch = pilaster ? pilasterW + col.gapMeters : col.radiusMeters * 2 + col.gapMeters;
                                        const offsets = [];
                                        for (const sideSign of [-1, 1]) {
                                            for (let k = 0; k < col.countPerSide; k++) {
                                                // Orders widen the surround: shafts flank OUTSIDE
                                                // the outermost order (AI 510).
                                                offsets.push(sideSign * (surroundCutWidth * 0.5 + surroundOrderExtra + halfW + 0.03 + k * pitch));
                                            }
                                        }
                                        const capitalSpec = (placement.portalDef?.custom ?? []).find(
                                            (p) => p?.anchor === 'capital' && getPortalOrnamentTemplate(p.part)
                                        ) ?? null;
                                        const capitalH = capitalSpec ? clamp(capitalSpec.scaleMeters, 0.05, 2.0) : 0;
                                        // Crown line = the outermost level hole's apex.
                                        const outerApexWorldY = levelGeoResolved
                                            ? surroundCutBottomY + (levelGeoResolved.levels[0]?.holeApexY
                                                ?? (levelGeoResolved.hasArch
                                                    ? levelGeoResolved.circleCenterY + levelGeoResolved.circleRadius
                                                    : surroundCutHeight))
                                            : doorTopY;
                                        const topLineY = col.top === 'arch_crown' ? outerApexWorldY + 0.02 : springLineY;
                                        const assemblyH = Math.max(0.4, topLineY - doorBottomY);
                                        const plinthH = pilaster ? Math.min(0.22, assemblyH * 0.08) : Math.min(0.16, assemblyH * 0.12);
                                        const capH = capitalSpec ? 0 : (pilaster ? Math.min(0.1, assemblyH * 0.06) : Math.min(0.18, assemblyH * 0.14));
                                        const shaftH = Math.max(0.1, assemblyH - plinthH - capH - capitalH);
                                        const proj = clamp(col.projectionMeters, 0.05, 0.5);
                                        const shaftDepth = proj + 0.12;
                                        // Engaged stance: a pilaster face sits at windowOffset +
                                        // projection with its back embedded; round colonettes
                                        // keep ~80% of the shaft proud of the wall.
                                        const centerOut = pilaster
                                            ? windowOffset + proj - shaftDepth * 0.5
                                            : windowOffset + col.radiusMeters * 0.8;
                                        colLayout = {
                                            col,
                                            pilaster,
                                            pilasterW,
                                            offsets,
                                            plinthH,
                                            capH,
                                            shaftH,
                                            shaftDepth,
                                            centerOut,
                                            shaftTopY: doorBottomY + plinthH + shaftH + capH
                                        };
                                    }

                                    if (levelGeoResolved) {
                                        const geoP = levelGeoResolved;
                                        const hasArch = geoP.hasArch;
                                        const circleY = geoP.circleCenterY;
                                        // The inline config may author extra recess on top of
                                        // the level stack; the innermost level's return must
                                        // still reach the door plane.
                                        const extraRecess = Math.max(0, Number(surroundPortal?.recessMeters) || 0);

                                        // Contour sampler at a radial offset from the door
                                        // cut edge; `arched` picks this hole's topology
                                        // (concentric arc vs grown rectangle).
                                        const contourAt = (offset, arched) => {
                                            const hw = surroundCutWidth * 0.5 + offset;
                                            const radius = geoP.circleRadius + offset;
                                            const useArch = !!arched && hasArch;
                                            const jY = useArch
                                                ? circleY + Math.sqrt(Math.max(0, radius * radius - hw * hw))
                                                : surroundCutHeight + offset;
                                            const topY = useArch ? (circleY + radius) : (surroundCutHeight + offset);
                                            return { hw, radius, jY, topY, arched: useArch };
                                        };

                                        // One closed ring outline (legs + head) between two
                                        // boundaries, each with its own topology (arched or
                                        // rectangular); `bottomY` is the leg cut (0 for full
                                        // runs, the springing line for 'stop' rings). Extra
                                        // `holes` (panel insets) punch through the face.
                                        const buildRingShape = (innerC, outerC, bottomY, holes = null) => {
                                            const shape = new THREE.Shape();
                                            shape.moveTo(-outerC.hw, bottomY);
                                            if (outerC.arched) {
                                                const aOutL = Math.atan2(outerC.jY - circleY, -outerC.hw);
                                                const aOutR = Math.atan2(outerC.jY - circleY, outerC.hw);
                                                if (outerC.jY > bottomY + EPS) shape.lineTo(-outerC.hw, outerC.jY);
                                                shape.absarc(0, circleY, outerC.radius, aOutL, aOutR, true);
                                                if (outerC.jY > bottomY + EPS) shape.lineTo(outerC.hw, bottomY);
                                            } else {
                                                shape.lineTo(-outerC.hw, outerC.topY);
                                                shape.lineTo(outerC.hw, outerC.topY);
                                                shape.lineTo(outerC.hw, bottomY);
                                            }
                                            shape.lineTo(innerC.hw, bottomY);
                                            if (innerC.arched) {
                                                const aInL = Math.atan2(innerC.jY - circleY, -innerC.hw);
                                                const aInR = Math.atan2(innerC.jY - circleY, innerC.hw);
                                                if (innerC.jY > bottomY + EPS) shape.lineTo(innerC.hw, innerC.jY);
                                                shape.absarc(0, circleY, innerC.radius, aInR, aInL, false);
                                                if (innerC.jY > bottomY + EPS) shape.lineTo(-innerC.hw, bottomY);
                                            } else {
                                                shape.lineTo(innerC.hw, innerC.topY);
                                                shape.lineTo(-innerC.hw, innerC.topY);
                                                shape.lineTo(-innerC.hw, bottomY);
                                            }
                                            shape.closePath();
                                            if (Array.isArray(holes)) for (const hole of holes) shape.holes.push(hole);
                                            return shape;
                                        };

                                        // Prismatic profile approximation: radial sub-bands
                                        // with a relief factor (1 = the ring's full front).
                                        const PROFILE_BANDS = {
                                            band: [[0.0, 1.0, 1.0]],
                                            roll: [[0.0, 0.25, 0.45], [0.25, 0.75, 1.0], [0.75, 1.0, 0.45]],
                                            cavetto: [[0.0, 0.4, 0.35], [0.4, 0.75, 0.7], [0.75, 1.0, 1.0]]
                                        };
                                        // Band cross-sections borrowed from the facade
                                        // decorators (the cornice profile kit), plus the two
                                        // portal-specific sections from the reference: the
                                        // impost 'wedge' (projecting cap whose underside
                                        // slopes back into the wall) and the plinth 'skirt'
                                        // (tall face, sloped top returning to the wall).
                                        const portalBandFractions = (profile) => {
                                            if (profile === 'skirt') return [{ o: 1.0, y: 0.0 }, { o: 1.0, y: 0.75 }, { o: 0.1, y: 1.0 }];
                                            if (profile === 'wedge' || profile === 'molded') return resolveCorniceProfileFractions('crown_molding');
                                            if (profile === 'stepped') return resolveCorniceProfileFractions('stepped');
                                            return resolveCorniceProfileFractions('flat_band');
                                        };
                                        // Profile section in (out, height), swept `length`
                                        // meters; origin at (wall plane, band bottom, length
                                        // centered). `flipY` mirrors the section vertically
                                        // (a cornice section is widest at the top; a base
                                        // must be widest at the bottom).
                                        const buildBandSectionGeo = ({ profile, heightMeters, projectionMeters, lengthMeters, flipY = false }) => {
                                            const h = Math.max(0.03, heightMeters);
                                            const p = Math.max(0.02, projectionMeters);
                                            let pts = portalBandFractions(profile).map((f) => ({
                                                o: Math.max(0.015, f.o * p),
                                                y: (flipY ? 1 - f.y : f.y) * h
                                            }));
                                            if (flipY) pts = pts.slice().reverse();
                                            const shape = new THREE.Shape();
                                            shape.moveTo(-0.06, 0);
                                            for (const pt of pts) shape.lineTo(pt.o, pt.y);
                                            shape.lineTo(-0.06, h);
                                            shape.closePath();
                                            const geo = new THREE.ExtrudeGeometry(shape, {
                                                depth: Math.max(0.05, lengthMeters),
                                                bevelEnabled: false,
                                                steps: 1
                                            });
                                            geo.translate(0, 0, -Math.max(0.05, lengthMeters) * 0.5);
                                            return geo;
                                        };

                                        const addPortalPart = ({ geometry, materialCfg, role, out = windowOffset, localX = 0, y = surroundCutBottomY, extra = null }) => {
                                            geometry.computeVertexNormals();
                                            const mesh = new THREE.Mesh(geometry, zoneMaterialFor(
                                                materialCfg ?? null,
                                                WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
                                            ));
                                            mesh.position.set(x + nx * out + nz * localX, y, z + nz * out - nx * localX);
                                            mesh.rotation.set(0, yaw, 0);
                                            mesh.castShadow = true;
                                            mesh.receiveShadow = true;
                                            mesh.userData = mesh.userData ?? {};
                                            mesh.userData.buildingWindowSource = 'bf2_portal';
                                            mesh.userData.buildingFab2Role = role;
                                            mesh.userData.windowDefinitionId = defId || null;
                                            if (extra) Object.assign(mesh.userData, extra);
                                            windowsGroup.add(mesh);
                                            return mesh;
                                        };

                                        // ---- the BOX: one mass filling the facade opening,
                                        // its face proud of the wall, with the outermost hole
                                        // (and any blind panel insets) punched through it ----
                                        const panelPlates = [];
                                        const panelHoles = [];
                                        for (const panel of placement.portalDef.panels ?? []) {
                                            const sides = panel.xMeters > EPS ? [-1, 1] : [1];
                                            for (const sideSign of sides) {
                                                const cx = sideSign * panel.xMeters;
                                                const x0 = cx - panel.widthMeters * 0.5;
                                                const x1 = cx + panel.widthMeters * 0.5;
                                                const y0 = panel.yMeters;
                                                const y1 = panel.yMeters + panel.heightMeters;
                                                // stay strictly inside the box face
                                                if (x0 < -geoP.boxHalfWidth + 0.02 || x1 > geoP.boxHalfWidth - 0.02 || y1 > geoP.boxTopY - 0.02) continue;
                                                const hole = new THREE.Path();
                                                hole.moveTo(x0, y0);
                                                hole.lineTo(x1, y0);
                                                hole.lineTo(x1, y1);
                                                hole.lineTo(x0, y1);
                                                hole.closePath();
                                                panelHoles.push(hole);
                                                panelPlates.push({ cx, y0, w: panel.widthMeters, h: panel.heightMeters, depth: panel.depthMeters });
                                            }
                                        }
                                        // Flange: the box outer boundary overlaps the wall
                                        // cut by ~1cm so the cut's own reveal stays hidden
                                        // inside the box mass (no coplanar side faces).
                                        const boxOuter = {
                                            hw: geoP.boxHalfWidth + 0.012,
                                            topY: geoP.boxTopY + 0.012,
                                            jY: geoP.boxTopY + 0.012,
                                            arched: false
                                        };
                                        const boxInner = contourAt(geoP.totalFrameWidth, geoP.boxHoleArched);
                                        const boxFront = geoP.projection;
                                        const firstDepth = geoP.levels.length ? geoP.levels[0].depthMeters : 0.15;
                                        const boxBack = Math.min(boxFront - firstDepth, -0.08);
                                        const boxShape = buildRingShape(boxInner, boxOuter, 0, panelHoles);
                                        const boxGeo = new THREE.ExtrudeGeometry(boxShape, {
                                            depth: boxFront - boxBack,
                                            bevelEnabled: false,
                                            steps: 1,
                                            curveSegments: 28
                                        });
                                        boxGeo.translate(0, 0, boxBack);
                                        addPortalPart({ geometry: boxGeo, materialCfg: portalPalette.box, role: 'portal_box' });
                                        for (const plate of panelPlates) {
                                            addPortalPart({
                                                geometry: new THREE.BoxGeometry(plate.w + 0.06, plate.h + 0.06, 0.03),
                                                materialCfg: portalPalette.panel ?? portalPalette.box,
                                                role: 'portal_panel',
                                                out: windowOffset + boxFront - plate.depth - 0.015,
                                                localX: plate.cx,
                                                y: surroundCutBottomY + plate.y0 + plate.h * 0.5
                                            });
                                        }

                                        // ---- the LEVELS: telescoping face rings; each
                                        // ring's inner side wall is the return down to the
                                        // next face (the innermost reaches the door plane) ----
                                        const doorFrameZ = -Math.max(0, Number(bottomSettings?.frame?.inset) || 0);
                                        for (let levelIdx = 0; levelIdx < geoP.levels.length; levelIdx++) {
                                            const lvl = geoP.levels[levelIdx];
                                            const next = geoP.levels[levelIdx + 1] ?? null;
                                            const innerC = contourAt(lvl.innerOffset, lvl.innerArched);
                                            // overlap slightly beneath the previous ring's return
                                            const outerC = contourAt(lvl.outerOffset + 0.004, lvl.holeArched);
                                            const front = lvl.frontZ;
                                            const back = next
                                                ? next.frontZ
                                                : Math.min(geoP.doorPlaneZ - extraRecess, doorFrameZ) - 0.05;
                                            const thickness = front - back;
                                            if (!(thickness > EPS)) continue;
                                            const lvlShape = buildRingShape(innerC, outerC, 0);
                                            const lvlGeo = new THREE.ExtrudeGeometry(lvlShape, {
                                                depth: thickness,
                                                bevelEnabled: false,
                                                steps: 1,
                                                curveSegments: 28
                                            });
                                            lvlGeo.translate(0, 0, back);
                                            addPortalPart({
                                                geometry: lvlGeo,
                                                materialCfg: portalPalette.level ?? portalPalette.box,
                                                role: 'portal_level',
                                                extra: { portalLevelIndex: levelIdx }
                                            });
                                        }

                                        // ---- ring mouldings contouring a level's hole (the
                                        // archivolt: semicircular rings over an arch, a
                                        // rectangular frame otherwise), sitting on the face
                                        // OUTSIDE the hole; 'stop' rings land on impost
                                        // courses borrowed from the facade decorators ----
                                        for (let levelIdx = 0; levelIdx < geoP.levels.length; levelIdx++) {
                                            const lvl = geoP.levels[levelIdx];
                                            const ring = lvl.ring;
                                            if (!ring) continue;
                                            const facePlane = levelIdx === 0 ? geoP.projection : geoP.levels[levelIdx - 1].frontZ;
                                            const arched = lvl.holeArched;
                                            const stops = ring.jambs === 'stop' && arched;
                                            const legBottomY = stops ? contourAt(lvl.outerOffset, true).jY : 0.0;
                                            const ringWidth = clamp(ring.widthMeters, 0.03, 0.45);
                                            const ringProj = clamp(ring.projectionMeters, 0.02, 0.3);
                                            const amp = Math.min(0.045, ringWidth * 0.45);
                                            const bandGeos = [];
                                            for (const [f0, f1, factor] of PROFILE_BANDS[ring.profile] ?? PROFILE_BANDS.band) {
                                                const bandInner = contourAt(lvl.outerOffset - 0.01 + (ringWidth + 0.01) * f0, arched);
                                                const bandOuter = contourAt(lvl.outerOffset - 0.01 + (ringWidth + 0.01) * f1, arched);
                                                const front = facePlane + ringProj - amp * (1.0 - factor);
                                                const back = facePlane - 0.02;
                                                const thickness = front - back;
                                                if (!(thickness > EPS)) continue;
                                                const shape = buildRingShape(bandInner, bandOuter, legBottomY);
                                                const geo = new THREE.ExtrudeGeometry(shape, {
                                                    depth: thickness,
                                                    bevelEnabled: false,
                                                    steps: 1,
                                                    curveSegments: 28
                                                });
                                                geo.translate(0, 0, back);
                                                bandGeos.push(geo);
                                            }
                                            if (bandGeos.length) {
                                                const merged = bandGeos.length === 1 ? bandGeos[0] : mergeGeometries(bandGeos, false);
                                                if (bandGeos.length > 1) for (const g of bandGeos) g.dispose();
                                                addPortalPart({
                                                    geometry: merged,
                                                    materialCfg: ring.material ?? portalPalette.ring ?? portalPalette.order,
                                                    role: 'portal_order',
                                                    extra: { portalOrderIndex: levelIdx }
                                                });
                                            }

                                            if (stops && (placement.portalDef.impost?.walls ?? 'outer') !== 'inner') {
                                                const impostCfg = placement.portalDef.impost ?? {};
                                                const impostH = clamp(impostCfg.heightMeters, 0.05, 0.5);
                                                const impostProud = ringProj + clamp(impostCfg.projectionMeters, 0.0, 0.4);
                                                for (const sideSign of [-1, 1]) {
                                                    const impostGeo = buildBandSectionGeo({
                                                        profile: impostCfg.profile,
                                                        heightMeters: impostH,
                                                        projectionMeters: impostProud,
                                                        lengthMeters: ringWidth + 0.14
                                                    });
                                                    impostGeo.rotateY(-Math.PI / 2);
                                                    addPortalPart({
                                                        geometry: impostGeo,
                                                        materialCfg: impostCfg.material ?? portalPalette.impost ?? null,
                                                        role: 'portal_impost',
                                                        out: windowOffset + facePlane,
                                                        localX: sideSign * (surroundCutWidth * 0.5 + lvl.outerOffset + ringWidth * 0.5),
                                                        y: surroundCutBottomY + legBottomY - impostH
                                                    });
                                                }
                                            }
                                        }

                                        // ---- inner-wall decorations: the deep reveal's jamb
                                        // walls can carry their own impost band at the
                                        // springing and base courses at the threshold
                                        // (walls: 'inner' | 'both' — the reference bands
                                        // that live INSIDE the void) ----
                                        const innerJambOffset = geoP.levels.length
                                            ? geoP.levels[geoP.levels.length - 1].outerOffset
                                            : geoP.totalFrameWidth;
                                        const innerJambHW = surroundCutWidth * 0.5 + innerJambOffset;
                                        const innerZFront = geoP.levels.length > 1
                                            ? geoP.levels[geoP.levels.length - 2].frontZ
                                            : geoP.projection;
                                        const innerZBack = geoP.doorPlaneZ - extraRecess;
                                        const innerSpan = innerZFront - innerZBack;
                                        const emitInnerBand = ({ cfg, bottomY, flipY, role, fallbackKey }) => {
                                            if (!(innerSpan > 0.1)) return;
                                            const bandH = clamp(cfg.heightMeters, 0.05, 0.8);
                                            for (const sideSign of [-1, 1]) {
                                                const bandGeo = buildBandSectionGeo({
                                                    profile: cfg.profile,
                                                    heightMeters: bandH,
                                                    projectionMeters: clamp(cfg.projectionMeters, 0.0, 0.4) + 0.02,
                                                    lengthMeters: innerSpan - 0.02,
                                                    flipY
                                                });
                                                // section o points toward the portal center
                                                if (sideSign > 0) bandGeo.rotateY(Math.PI);
                                                addPortalPart({
                                                    geometry: bandGeo,
                                                    materialCfg: cfg.material ?? portalPalette[fallbackKey] ?? null,
                                                    role,
                                                    out: windowOffset + innerZBack + innerSpan * 0.5,
                                                    localX: sideSign * innerJambHW,
                                                    y: surroundCutBottomY + bottomY
                                                });
                                            }
                                        };
                                        const impostWalls = placement.portalDef.impost?.walls ?? 'outer';
                                        if (hasArch && (impostWalls === 'inner' || impostWalls === 'both')) {
                                            emitInnerBand({
                                                cfg: placement.portalDef.impost,
                                                bottomY: geoP.springY - clamp(placement.portalDef.impost.heightMeters, 0.05, 0.5),
                                                flipY: false,
                                                role: 'portal_impost',
                                                fallbackKey: 'impost'
                                            });
                                        }
                                        const baseWalls = placement.portalDef.base?.walls ?? 'outer';
                                        if (placement.portalDef.base && (baseWalls === 'inner' || baseWalls === 'both')) {
                                            emitInnerBand({
                                                cfg: placement.portalDef.base,
                                                bottomY: 0,
                                                flipY: placement.portalDef.base.profile !== 'skirt',
                                                role: 'portal_base',
                                                fallbackKey: 'base'
                                            });
                                        }

                                        // ---- base: the plinth foot wrapping the box piers
                                        // (the 'skirt' section from the reference: tall
                                        // face, sloped top returning to the wall) ----
                                        if (placement.portalDef.base && (placement.portalDef.base.walls ?? 'outer') !== 'inner') {
                                            const base = placement.portalDef.base;
                                            const pierInnerHW = surroundCutWidth * 0.5 + geoP.totalFrameWidth;
                                            const pierW = Math.max(0.05, geoP.boxHalfWidth - pierInnerHW);
                                            for (const sideSign of [-1, 1]) {
                                                const baseGeo = buildBandSectionGeo({
                                                    profile: base.profile,
                                                    heightMeters: base.heightMeters,
                                                    projectionMeters: base.projectionMeters,
                                                    lengthMeters: pierW + 0.04,
                                                    flipY: base.profile !== 'skirt'
                                                });
                                                baseGeo.rotateY(-Math.PI / 2);
                                                addPortalPart({
                                                    geometry: baseGeo,
                                                    materialCfg: base.material ?? portalPalette.base ?? portalPalette.box,
                                                    role: 'portal_base',
                                                    out: windowOffset + geoP.projection,
                                                    localX: sideSign * (pierInnerHW + pierW * 0.5),
                                                    y: surroundCutBottomY
                                                });
                                            }
                                        }
                                    }

                                    // ---- AI 510: registered custom mesh parts ----
                                    if (placement.portalDef?.custom?.length) {
                                        const totalOrderW = levelGeoResolved?.totalFrameWidth ?? 0;
                                        for (const partSpec of placement.portalDef.custom) {
                                            const partDef = getPortalOrnamentPartDef(partSpec.part);
                                            if (!partDef) {
                                                warnings.push(`Portal ${placement.portalDef.id}: unknown ornament part "${partSpec.part}".`);
                                                continue;
                                            }
                                            if (!getPortalOrnamentTemplate(partSpec.part)) {
                                                warnings.push(`Portal ${placement.portalDef.id}: ornament part "${partSpec.part}" is not preloaded (preloadPortalOrnamentParts); skipped.`);
                                                continue;
                                            }
                                            const partMaterialCfg = partSpec.material ?? portalPalette.custom ?? null;
                                            const partMaterial = partMaterialCfg
                                                ? zoneMaterialFor(partMaterialCfg, WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL)
                                                : null;
                                            const partScale = clamp(partSpec.scaleMeters, 0.05, 2.0) / Math.max(0.05, partDef.heightMeters);
                                            const outerHW = surroundCutWidth * 0.5 + totalOrderW;
                                            const anchors = [];
                                            if (partSpec.anchor === 'crown') {
                                                const apexY = levelGeoResolved?.levels?.length
                                                    ? levelGeoResolved.levels[0].holeApexY
                                                    : surroundCutHeight;
                                                anchors.push({ localX: partSpec.offsetMeters.x, baseY: apexY + 0.02 + partSpec.offsetMeters.y });
                                            } else if (partSpec.anchor === 'face') {
                                                // Anywhere on the box face: offsetMeters.x is
                                                // the distance from the portal center
                                                // (mirrored on both sides), offsetMeters.y
                                                // the part's base above the threshold.
                                                const faceOut = windowOffset
                                                    + (levelGeoResolved?.projection ?? 0)
                                                    + partSpec.offsetMeters.out;
                                                const sides = partSpec.offsetMeters.x > EPS ? [-1, 1] : [1];
                                                for (const sideSign of sides) {
                                                    anchors.push({
                                                        localX: sideSign * partSpec.offsetMeters.x,
                                                        baseY: partSpec.offsetMeters.y,
                                                        out: faceOut
                                                    });
                                                }
                                            } else if (partSpec.anchor === 'capital' && colLayout) {
                                                // Crown each shaft cluster: base at the shaft
                                                // top, centered on the cluster, riding at the
                                                // shaft's own out-of-wall stance.
                                                for (const sideSign of [-1, 1]) {
                                                    const sideOffsets = colLayout.offsets.filter((o) => (o < 0 ? -1 : 1) === sideSign);
                                                    if (!sideOffsets.length) continue;
                                                    const centerX = sideOffsets.reduce((a, b) => a + b, 0) / sideOffsets.length;
                                                    anchors.push({
                                                        localX: centerX + sideSign * partSpec.offsetMeters.x,
                                                        baseY: colLayout.shaftTopY - surroundCutBottomY + partSpec.offsetMeters.y,
                                                        out: colLayout.centerOut + partSpec.offsetMeters.out
                                                    });
                                                }
                                            } else {
                                                if (partSpec.anchor === 'capital') {
                                                    warnings.push(`Portal ${placement.portalDef.id}: the 'capital' anchor needs colonettes enabled; falling back to springing.`);
                                                }
                                                const scaledH = clamp(partSpec.scaleMeters, 0.05, 2.0);
                                                const springYLocal = levelGeoResolved?.springY ?? (springLineY - surroundCutBottomY);
                                                const baseY = partSpec.anchor === 'jamb_base'
                                                    ? partSpec.offsetMeters.y
                                                    : (springYLocal - scaledH + partSpec.offsetMeters.y);
                                                for (const sideSign of [-1, 1]) {
                                                    anchors.push({ localX: sideSign * (outerHW + 0.02 + partSpec.offsetMeters.x), baseY });
                                                }
                                            }
                                            for (const anchor of anchors) {
                                                const clone = instantiatePortalOrnamentPart(partSpec.part, { material: partMaterial });
                                                if (!clone) continue;
                                                clone.scale.setScalar(partScale);
                                                // 'relief' mounts the part like a 3D decal ON
                                                // the wall: its back half embeds in the face,
                                                // only the sculpted front projects.
                                                let mountEmbed = 0;
                                                if (partSpec.mount === 'relief') {
                                                    clone.updateMatrixWorld(true);
                                                    const reliefBox = new THREE.Box3().setFromObject(clone);
                                                    // decal stance: ~40% of the part's depth
                                                    // projects from the mount plane, the rest
                                                    // embeds in the wall
                                                    const reliefDepth = Math.max(0.01, reliefBox.max.z - reliefBox.min.z);
                                                    mountEmbed = reliefBox.max.z - reliefDepth * 0.4;
                                                }
                                                const outC = (anchor.out ?? (windowOffset + partSpec.offsetMeters.out)) - mountEmbed;
                                                clone.position.set(
                                                    x + nx * outC + nz * anchor.localX,
                                                    surroundCutBottomY + anchor.baseY,
                                                    z + nz * outC - nx * anchor.localX
                                                );
                                                clone.rotation.set(0, yaw, 0);
                                                clone.userData = clone.userData ?? {};
                                                clone.userData.buildingWindowSource = 'bf2_portal';
                                                clone.userData.buildingFab2Role = 'portal_ornament';
                                                clone.userData.portalOrnamentPart = partSpec.part;
                                                clone.userData.windowDefinitionId = defId || null;
                                                windowsGroup.add(clone);
                                            }
                                        }
                                    }

                                    if (colLayout) {
                                        const { col, pilaster, pilasterW, plinthH, capH, shaftH, shaftDepth } = colLayout;
                                        const r = col.radiusMeters;
                                        const colGeos = [];
                                        for (const off of colLayout.offsets) {
                                            if (pilaster) {
                                                const plinth = new THREE.BoxGeometry(pilasterW + 0.1, plinthH, shaftDepth + 0.06);
                                                plinth.translate(off, plinthH * 0.5, 0);
                                                const shaft = new THREE.BoxGeometry(pilasterW, shaftH, shaftDepth);
                                                shaft.translate(off, plinthH + shaftH * 0.5, 0);
                                                colGeos.push(plinth, shaft);
                                                if (capH > EPS) {
                                                    const cap = new THREE.BoxGeometry(pilasterW + 0.08, capH, shaftDepth + 0.05);
                                                    cap.translate(off, plinthH + shaftH + capH * 0.5, 0);
                                                    colGeos.push(cap);
                                                }
                                            } else {
                                                const plinth = new THREE.BoxGeometry(r * 2.4, plinthH, r * 2.4);
                                                plinth.translate(off, plinthH * 0.5, 0);
                                                const shaft = new THREE.CylinderGeometry(r, r * 1.06, shaftH, 14);
                                                shaft.translate(off, plinthH + shaftH * 0.5, 0);
                                                colGeos.push(plinth, shaft);
                                                if (capH > EPS) {
                                                    const cap = new THREE.BoxGeometry(r * 2.6, capH, r * 2.6);
                                                    cap.translate(off, plinthH + shaftH + capH * 0.5, 0);
                                                    colGeos.push(cap);
                                                }
                                            }
                                        }
                                        const colGeo = mergeGeometries(colGeos, false);
                                        for (const g of colGeos) g.dispose();
                                        colGeo.computeVertexNormals();
                                        const colMesh = new THREE.Mesh(colGeo, zoneMaterialFor(
                                            col.material,
                                            WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
                                        ));
                                        colMesh.position.set(x + nx * colLayout.centerOut, doorBottomY, z + nz * colLayout.centerOut);
                                        colMesh.rotation.set(0, yaw, 0);
                                        colMesh.castShadow = true;
                                        colMesh.receiveShadow = true;
                                        colMesh.userData = colMesh.userData ?? {};
                                        colMesh.userData.buildingWindowSource = 'bf2_portal';
                                        colMesh.userData.buildingFab2Role = 'portal_colonette';
                                        colMesh.userData.windowDefinitionId = defId || null;
                                        windowsGroup.add(colMesh);
                                    }

                                    if (surroundPortal.frieze) {
                                        const frieze = surroundPortal.frieze;
                                        const friezeWidth = surroundCutWidth + surroundOrderExtra * 2 + frieze.widthPaddingMeters * 2;
                                        const friezeGeo = new THREE.BoxGeometry(friezeWidth, frieze.heightMeters, frieze.depthMeters);
                                        const friezeMesh = new THREE.Mesh(friezeGeo, zoneMaterialFor(
                                            frieze.material,
                                            WINDOW_DECORATION_MATERIAL_MODE.MATCH_WALL
                                        ));
                                        const friezeOut = windowOffset + frieze.depthMeters * 0.5 - 0.02;
                                        friezeMesh.position.set(
                                            x + nx * friezeOut,
                                            doorTopY + frieze.yOffsetMeters + frieze.heightMeters * 0.5,
                                            z + nz * friezeOut
                                        );
                                        friezeMesh.rotation.set(0, yaw, 0);
                                        friezeMesh.castShadow = true;
                                        friezeMesh.receiveShadow = true;
                                        friezeMesh.userData = friezeMesh.userData ?? {};
                                        friezeMesh.userData.buildingWindowSource = 'bf2_portal';
                                        friezeMesh.userData.buildingFab2Role = 'portal_frieze';
                                        friezeMesh.userData.windowDefinitionId = defId || null;
                                        windowsGroup.add(friezeMesh);
                                    }
                                }
                                if (topSettings && topHeight > EPS) {
                                    const topPoseOffset = windowOffset - topPlacementInset;
                                    addCustomInstance({
                                        defId: topDefId,
                                        assetType: topAssetType,
                                        settings: topSettings,
                                        decoration: topDecoration,
                                        bend: resolveCurvedWindowBend({
                                            frame: placementFrame,
                                            point,
                                            nx: pointNx,
                                            nz: pointNz,
                                            settings: topSettings,
                                            poseOffset: topPoseOffset
                                        }),
                                        x: x + pointNx * topPoseOffset,
                                        y: topY,
                                        z: z + pointNz * topPoseOffset,
                                        yaw: pointYaw,
                                        instanceId: `${baseInstanceId}:top`,
                                        floorBaseY: yCursor,
                                        floorTopY: yCursor + segHeight
                                    });
                                }
                            }
                            continue;
                        }

                        if (!windowMat) continue;
                        const bottomGeo = getPlaneGeometry(width, bottomHeight);
                        const topGeo = topHeight > EPS ? getPlaneGeometry(width, topHeight) : null;
                        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
                            const point = points[pointIndex] && typeof points[pointIndex] === 'object' ? points[pointIndex] : null;
                            const x = Number(point?.x) || 0;
                            const z = Number(point?.z) || 0;
                            const px = x + nx * windowOffset;
                            const pz = z + nz * windowOffset;
                            addWindowInstance({ geometry: bottomGeo, material: windowMat, x: px, y: bottomY, z: pz, yaw, renderOrder: 0 });
                            if (windowGlassMat) {
                                addWindowInstance({
                                    geometry: bottomGeo,
                                    material: windowGlassMat,
                                    x: px + nx * glassLift,
                                    y: bottomY,
                                    z: pz + nz * glassLift,
                                    yaw,
                                    renderOrder: 1
                                });
                            }
                            if (topGeo && topHeight > EPS) {
                                addWindowInstance({ geometry: topGeo, material: windowMat, x: px, y: topY, z: pz, yaw, renderOrder: 0 });
                                if (windowGlassMat) {
                                    addWindowInstance({
                                        geometry: topGeo,
                                        material: windowGlassMat,
                                        x: px + nx * glassLift,
                                        y: topY,
                                        z: pz + nz * glassLift,
                                        yaw,
                                        renderOrder: 1
                                    });
                                }
                            }
                        }
                    }

                    for (const bucket of customBuckets.values()) {
                        if (!bucket?.instances?.length) continue;
                        const bucketAssetType = normalizeWindowFabricationAssetType(
                            bucket?.assetType,
                            WINDOW_FABRICATION_ASSET_TYPE.WINDOW
                        );
                        const group = windowMeshGenerator.createWindowGroup({
                            settings: bucket.settings,
                            seed: bucket.defId || 'bf2_window',
                            instances: bucket.instances,
                            bend: bucket.bend
                        });
                        group.name = `bf2_window_${bucket.defId || 'custom'}`;
                        group.userData = group.userData ?? {};
                        group.userData.buildingWindowSource = 'bf2_window_definition';
                        group.userData.windowDefinitionId = bucket.defId || null;
                        group.userData.windowAssetType = bucketAssetType;
                        if (bucketAssetType === WINDOW_FABRICATION_ASSET_TYPE.GARAGE) {
                            const layerRefs = group.userData?.layers ?? null;
                            if (layerRefs?.muntins) layerRefs.muntins.visible = false;
                            if (layerRefs?.glass) layerRefs.glass.visible = false;
                            if (layerRefs?.shade) layerRefs.shade.visible = false;
                            if (layerRefs?.interior) layerRefs.interior.visible = false;
                        }
                        windowsGroup.add(group);

                        const sillDecoration = createCustomOpeningSillDecorationMesh({
                            bucket,
                            layerMaterial: layer?.material ?? null,
                            layerWallBase: layer?.wallBase ?? null,
                            baseColorHex,
                            textureCache
                        });
                        if (sillDecoration) {
                            windowsGroup.add(sillDecoration);
                        }

                        const surroundDecorations = createCustomOpeningSurroundDecorationMeshes({
                            bucket,
                            layerMaterial: layer?.material ?? null,
                            layerWallBase: layer?.wallBase ?? null,
                            baseColorHex,
                            textureCache
                        });
                        for (const surroundMesh of surroundDecorations) {
                            windowsGroup.add(surroundMesh);
                        }
                    }
                }

                yCursor += segHeight;

                if (beltEnabled && beltHeight > EPS) {
                    for (const outerLoop of beltOuter) {
                        if (!outerLoop || outerLoop.length < 3) continue;
                        const shape = buildShapeFromLoops({ outerLoop, holeLoops: beltHoles });
                        const geo = new THREE.ExtrudeGeometry(shape, {
                            depth: beltHeight,
                            bevelEnabled: false,
                            steps: 1
                        });
                        geo.rotateX(-Math.PI / 2);
                        geo.computeVertexNormals();

                        const mesh = new THREE.Mesh(geo, beltMat);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.position.y = yCursor;
                        beltsGroup.add(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                            appendWirePositions(wirePositions, edgeGeo, yCursor);
                            edgeGeo.dispose();
                        }
                    }

                    yCursor += beltHeight;
                }
            }

            const layerEndY = yCursor;
            if (colsExtrude && colsExtrudeDistance > EPS && colsWidth > EPS && windowRuns.length && layerEndY - layerStartY > EPS) {
                const bandY = (layerStartY + layerEndY) * 0.5;
                const bandHeight = Math.max(0.1, layerEndY - layerStartY);
                const bandOffset = windowOffset + colsExtrudeDistance * 0.5;
                const bandHalfWidth = colsWidth * 0.5;

                for (const run of windowRuns) {
                    if (!Array.isArray(run.spacerCenters) || !run.spacerCenters.length) continue;
                    const runLength = Number(run?.length) || 0;
                    if (!(runLength > EPS)) continue;
                    const a = run.a;
                    const tx = run.tx;
                    const tz = run.tz;
                    const nx = run.nx;
                    const nz = run.nz;
                    const yaw = run.yaw;

                    for (const centerDist of run.spacerCenters) {
                        if (centerDist - bandHalfWidth < cornerEps - 1e-6 || centerDist + bandHalfWidth > runLength - cornerEps + 1e-6) continue;
                        const cx = a.x + tx * centerDist + nx * bandOffset;
                        const cz = a.z + tz * centerDist + nz * bandOffset;
                        const geo = new THREE.BoxGeometry(colsWidth, bandHeight, colsExtrudeDistance);
                        const mesh = new THREE.Mesh(geo, colsMat);
                        mesh.position.set(cx, bandY, cz);
                        mesh.rotation.set(0, yaw, 0);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        windowsGroup.add(mesh);
                    }
                }
            }

            const capitalStrips = (Array.isArray(facadeStrips) && facadeFrames)
                ? facadeStrips.filter((s) => s?.type === 'bay' && s?.capital && typeof s.capital === 'object')
                : [];
            if (capitalStrips.length && layerEndY - layerStartY > EPS) {
                let prevFloorLayer = null;
                for (let i = layerIndex - 1; i >= 0; i--) {
                    if (safeLayers[i]?.type === LAYER_TYPE.FLOOR) { prevFloorLayer = safeLayers[i]; break; }
                }
                let nextFloorLayer = null;
                for (let i = layerIndex + 1; i < safeLayers.length; i++) {
                    if (safeLayers[i]?.type === LAYER_TYPE.FLOOR) { nextFloorLayer = safeLayers[i]; break; }
                }
                const prevKeys = prevFloorLayer ? (capitalBayKeysByLayerId.get(prevFloorLayer.id) ?? new Set()) : new Set();
                const nextKeys = nextFloorLayer ? (capitalBayKeysByLayerId.get(nextFloorLayer.id) ?? new Set()) : new Set();
                const currentKeysByFaceBayRef = capitalBayKeyByLayerFaceBayRef.get(layer.id) ?? new Map();

                const capitalMatCache = new Map();
                const getCapitalMaterial = (spec) => {
                    const key = stableStringify(spec ?? null);
                    let mat = capitalMatCache.get(key);
                    if (!mat) {
                        mat = makeCorniceMaterialFromSpec({
                            material: (spec && typeof spec === 'object') ? spec : { kind: 'match_wall', id: 'match_wall' },
                            tiling: null,
                            layerMaterial: layer.material ?? null,
                            layerWallBase: layer.wallBase ?? null,
                            layerTiling: layer.tiling ?? null,
                            baseColorHex,
                            textureCache
                        });
                        capitalMatCache.set(key, mat);
                    }
                    return mat;
                };

                const emitCapitalStep = ({ frame, u0, u1, planeDepth, overhang, projection, y, height, material, role, end, bayId }) => {
                    if (!(u1 > u0 + EPS) || !(height > EPS)) return;
                    // Facade-frame depth is OUTWARD-positive (AI 503): the band
                    // projects proud of the bay plane and embeds 4cm back in.
                    const dOut = planeDepth + projection;
                    const dIn = planeDepth - 0.04;
                    const corners = [
                        pointOnFacadeFrame({ frame, u: u0 - overhang, depth: dOut }),
                        pointOnFacadeFrame({ frame, u: u1 + overhang, depth: dOut }),
                        pointOnFacadeFrame({ frame, u: u1 + overhang, depth: dIn }),
                        pointOnFacadeFrame({ frame, u: u0 - overhang, depth: dIn })
                    ].map((p) => ({ x: p.x, z: p.z }));
                    const planLoop = signedArea(corners) < 0 ? corners.slice().reverse() : corners;
                    const shape = buildShapeFromLoops({ outerLoop: planLoop, holeLoops: [] });
                    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
                    geo.rotateX(-Math.PI / 2);
                    geo.computeVertexNormals();
                    const mesh = new THREE.Mesh(geo, material);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.position.y = y;
                    mesh.userData = mesh.userData ?? {};
                    mesh.userData.buildingFab2Role = role;
                    mesh.userData.capitalEnd = end;
                    mesh.userData.capitalBayId = bayId;
                    beltsGroup.add(mesh);

                    if (showWire) {
                        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                        appendWirePositions(wirePositions, edgeGeo, y);
                        edgeGeo.dispose();
                    }
                };

                for (const strip of capitalStrips) {
                    const frame = facadeFrames?.[strip.faceId] ?? null;
                    if (!frame) continue;
                    const sourceBayId = typeof strip.sourceBayId === 'string' && strip.sourceBayId
                        ? strip.sourceBayId
                        : strip.id;
                    const runKey = currentKeysByFaceBayRef.get(`${strip.faceId}:${sourceBayId}`) ?? null;
                    const rawU0 = Number(strip.frontU0);
                    const rawU1 = Number(strip.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip.u1) || 0);
                    if (!(u1 > u0 + EPS)) continue;
                    const planeDepth = Number(strip.depth) || 0;
                    const bayId = typeof strip.id === 'string' ? strip.id : '';

                    const emitEnd = (spec, end) => {
                        if (!spec) return;
                        const h = clamp(spec.height, 0.06, 1.5);
                        const overhang = clamp(spec.overhang, 0.0, 0.5);
                        const projection = clamp(spec.projection, 0.01, 0.6);
                        const material = getCapitalMaterial(spec.material);
                        const baseY = end === 'top' ? layerEndY - h : layerStartY;
                        const role = 'bay_capital';

                        if (spec.profile === 'flat') {
                            emitCapitalStep({
                                frame, u0, u1, planeDepth, overhang, projection,
                                y: baseY, height: h, material, role, end, bayId
                            });
                            return;
                        }

                        // molded (AI 509): a stack of prismatic courses whose
                        // overhang/projection fractions trace a neck -> echinus
                        // flare -> abacus silhouette (mirrored for a base), the
                        // closest the extrusion kit gets to a foliate capital.
                        if (spec.profile === 'molded') {
                            const courses = [
                                { h: 0.3, f: 0.12 },
                                { h: 0.26, f: 0.5 },
                                { h: 0.22, f: 0.8 },
                                { h: 0.22, f: 1.0 }
                            ];
                            const ordered = end === 'top' ? courses : courses.slice().reverse();
                            let yCursorStep = baseY;
                            for (const course of ordered) {
                                emitCapitalStep({
                                    frame, u0, u1, planeDepth,
                                    overhang: overhang * course.f,
                                    projection: Math.max(0.01, projection * (0.3 + 0.7 * course.f)),
                                    y: yCursorStep, height: h * course.h, material, role, end, bayId
                                });
                                yCursorStep += h * course.h;
                            }
                            return;
                        }

                        // stepped: the capital widens toward the top, the base
                        // widens toward the bottom.
                        const bigFirst = end === 'bottom';
                        const smallH = h * 0.55;
                        const bigH = h - smallH;
                        const small = { overhang: overhang * 0.45, projection: projection * 0.6 };
                        const steps = bigFirst
                            ? [{ h: bigH, g: { overhang, projection } }, { h: smallH, g: small }]
                            : [{ h: smallH, g: small }, { h: bigH, g: { overhang, projection } }];
                        let yCursorStep = baseY;
                        for (const step of steps) {
                            emitCapitalStep({
                                frame, u0, u1, planeDepth,
                                overhang: step.g.overhang,
                                projection: step.g.projection,
                                y: yCursorStep, height: step.h, material, role, end, bayId
                            });
                            yCursorStep += step.h;
                        }
                    };

                    const cap = strip.capital;
                    if (cap.top && (!runKey || !nextKeys.has(runKey))) emitEnd(cap.top, 'top');
                    if (cap.bottom && (!runKey || !prevKeys.has(runKey))) emitEnd(cap.bottom, 'bottom');
                }
            }

            // AI 493: arcade imposts. The pier bays inside an arcade run carry
            // a band whose TOP edge sits on the run's springing line, so the
            // arches read as springing from a column instead of from flat wall.
            // AI 509 `impost.continuous`: opening bays in the run band their
            // jamb strips too, so the run reads as ONE band broken only by
            // the arched openings themselves.
            const hasImpost = (strip) => strip?.type === 'bay'
                && strip?.arcade && typeof strip.arcade === 'object'
                && strip.arcade.impost && typeof strip.arcade.impost === 'object'
                && strip.arcade.impost.enabled !== false;
            const stripHasWindow = (strip) => !!(strip?.window && strip.window.enabled !== false);
            const arcadeImpostStrips = (Array.isArray(facadeStrips) && facadeFrames)
                ? facadeStrips.filter((strip) => hasImpost(strip)
                    && (!stripHasWindow(strip) || strip.arcade.impost.continuous === true))
                : [];
            if (arcadeImpostStrips.length && floorSegmentStartYs.length) {
                const impostMatCache = new Map();
                const getImpostMaterial = (spec) => {
                    const key = stableStringify(spec ?? null);
                    let mat = impostMatCache.get(key);
                    if (!mat) {
                        mat = makeCorniceMaterialFromSpec({
                            material: (spec && typeof spec === 'object') ? spec : { kind: 'match_wall', id: 'match_wall' },
                            tiling: null,
                            layerMaterial: layer.material ?? null,
                            layerWallBase: layer.wallBase ?? null,
                            layerTiling: layer.tiling ?? null,
                            baseColorHex,
                            textureCache
                        });
                        impostMatCache.set(key, mat);
                    }
                    return mat;
                };

                const segCount = floorSegmentStartYs.length;
                for (let floorIdx = 0; floorIdx < segCount; floorIdx++) {
                    const segStart = floorSegmentStartYs[floorIdx];
                    const segEnd = floorIdx + 1 < segCount ? floorSegmentStartYs[floorIdx + 1] : layerEndY;
                    const segHeight = segEnd - segStart;
                    if (!(segHeight > EPS)) continue;
                    const { springingByRunKey } = resolveArcadeForSegment(segHeight);
                    if (!springingByRunKey.size) continue;

                    for (const strip of arcadeImpostStrips) {
                        const frame = facadeFrames?.[strip.faceId] ?? null;
                        if (!frame) continue;
                        const groupId = typeof strip.arcade.groupId === 'string' ? strip.arcade.groupId : '';
                        const springing = springingByRunKey.get(`${strip.faceId}:${groupId}`);
                        if (!Number.isFinite(springing)) continue;

                        const rawU0 = Number(strip.frontU0);
                        const rawU1 = Number(strip.frontU1);
                        const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip.u0) || 0);
                        const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip.u1) || 0);
                        if (!(u1 > u0 + EPS)) continue;

                        const impost = strip.arcade.impost;
                        const height = clamp(impost.heightMeters, 0.03, 0.8);
                        const projection = clamp(impost.projectionMeters, 0.01, 0.6);
                        const overhang = clamp(impost.overhangMeters, 0.0, 0.5);
                        const y = segStart + springing - height;
                        if (!(y > segStart - EPS) || !(y + height < segEnd + EPS)) continue;

                        // Continuous mode: subtract the opening spans, banding
                        // only the jamb strips between/beside the arches. The
                        // outer ends keep the overhang (joining the neighbour
                        // bays' bands); edges meeting an opening cut flush.
                        const spans = [];
                        if (stripHasWindow(strip)) {
                            const placement = bayWindowPlacements.find((p) => p?.faceId === strip.faceId && p?.bayId === strip.id) ?? null;
                            const openings = [];
                            if (placement) {
                                const halfW = Math.max(0.05, Number(placement.width) || 0.1) * 0.5;
                                for (const point of placement.points ?? []) {
                                    const u = Number(projectPointToFacadeFrame({ frame, x: point?.x, z: point?.z })?.u);
                                    if (Number.isFinite(u)) openings.push({ left: u - halfW, right: u + halfW });
                                }
                                openings.sort((a, b) => a.left - b.left);
                            }
                            let cursor = u0 - overhang;
                            for (const opening of openings) {
                                if (opening.left > cursor + EPS) spans.push({ uA: cursor, uB: opening.left });
                                cursor = Math.max(cursor, opening.right);
                            }
                            if (u1 + overhang > cursor + EPS) spans.push({ uA: cursor, uB: u1 + overhang });
                        } else {
                            spans.push({ uA: u0 - overhang, uB: u1 + overhang });
                        }

                        const planeDepth = Number(strip.depth) || 0;
                        // Outward-positive depth (AI 503): band proud of the
                        // pier plane, embedded 4cm into it.
                        const dOut = planeDepth + projection;
                        const dIn = planeDepth - 0.04;
                        for (const span of spans) {
                            if (!(span.uB > span.uA + 0.01)) continue;
                            const corners = [
                                pointOnFacadeFrame({ frame, u: span.uA, depth: dOut }),
                                pointOnFacadeFrame({ frame, u: span.uB, depth: dOut }),
                                pointOnFacadeFrame({ frame, u: span.uB, depth: dIn }),
                                pointOnFacadeFrame({ frame, u: span.uA, depth: dIn })
                            ].map((p) => ({ x: p.x, z: p.z }));
                            const planLoop = signedArea(corners) < 0 ? corners.slice().reverse() : corners;
                            const shape = buildShapeFromLoops({ outerLoop: planLoop, holeLoops: [] });
                            const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
                            geo.rotateX(-Math.PI / 2);
                            geo.computeVertexNormals();
                            const mesh = new THREE.Mesh(geo, getImpostMaterial(impost.material));
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.position.y = y;
                            mesh.userData = mesh.userData ?? {};
                            mesh.userData.buildingFab2Role = 'bay_arcade_impost';
                            mesh.userData.arcadeGroupId = groupId;
                            mesh.userData.arcadeBayId = typeof strip.id === 'string' ? strip.id : '';
                            beltsGroup.add(mesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                appendWirePositions(wirePositions, edgeGeo, y);
                                edgeGeo.dispose();
                            }
                        }
                    }
                }
            }

            // AI 489: balconies. ONE feature with modes — `projecting` hangs a
            // platform + railing kit off the facade plane, `recessed` furnishes
            // the bay's own notch (negative bay depth) with the notch floor
            // slab, a front railing near the nominal plane and the notch
            // soffit. Side covers are adjacency-driven: sides that abut wall
            // get no infill, air-facing sides get the configured infill.
            const balconyStrips = (Array.isArray(facadeStrips) && facadeFrames)
                ? facadeStrips.filter((s) => s?.type === 'bay' && s?.balcony && typeof s.balcony === 'object')
                : [];
            if (balconyStrips.length && layerEndY - layerStartY > EPS && floorSegmentStartYs.length) {
                const balconyStripsByFaceId = {};
                for (const fid of facadeFaceIdsOf(facadeFrames)) balconyStripsByFaceId[fid] = [];
                for (const s of facadeStrips) {
                    const fid = s?.faceId;
                    if (!balconyStripsByFaceId[fid]) continue;
                    balconyStripsByFaceId[fid].push({
                        u0: Number(s.u0) || 0,
                        u1: Number(s.u1) || 0,
                        depth: Number(s.depth) || 0
                    });
                }
                for (const fid of Object.keys(balconyStripsByFaceId)) balconyStripsByFaceId[fid].sort((a, b) => a.u0 - b.u0);

                const continuityStripsByFaceId = {};
                for (const fid of facadeFaceIdsOf(facadeFrames)) continuityStripsByFaceId[fid] = [];
                for (const strip of balconyStrips) {
                    if (continuityStripsByFaceId[strip.faceId]) continuityStripsByFaceId[strip.faceId].push(strip);
                }
                const balconyMatCache = new Map();
                const balconyWallMaterial = (spec) => {
                    const key = 'wall|' + stableStringify(spec ?? null);
                    let mat = balconyMatCache.get(key);
                    if (!mat) {
                        mat = makeCorniceMaterialFromSpec({
                            material: (spec && typeof spec === 'object') ? spec : { kind: 'match_wall', id: 'match_wall' },
                            tiling: null,
                            layerMaterial: layer.material ?? null,
                            layerWallBase: layer.wallBase ?? null,
                            layerTiling: layer.tiling ?? null,
                            baseColorHex,
                            textureCache
                        });
                        balconyMatCache.set(key, mat);
                    }
                    return mat;
                };
                const balconyMetalMaterial = ({ colorHex, roughness, metalness }) => {
                    const key = `metal|${colorHex}|${roughness}|${metalness}`;
                    let mat = balconyMatCache.get(key);
                    if (!mat) {
                        mat = new THREE.MeshStandardMaterial({
                            color: (Number(colorHex) >>> 0) & 0xffffff,
                            roughness: clamp(roughness, 0.0, 1.0),
                            metalness: clamp(metalness, 0.0, 1.0)
                        });
                        balconyMatCache.set(key, mat);
                    }
                    return mat;
                };
                // Same material family as window glass so the transparency
                // pass and the geometry merger treat balcony glass like glass.
                const balconyGlassMaterial = ({ tintHex, opacity }) => {
                    const key = `glass|${tintHex}|${opacity}`;
                    let mat = balconyMatCache.get(key);
                    if (!mat) {
                        mat = new THREE.MeshPhysicalMaterial({
                            color: (Number(tintHex) >>> 0) & 0xffffff,
                            metalness: 0.05,
                            roughness: 0.06,
                            transmission: 0.5,
                            ior: 1.5,
                            thickness: 0.01,
                            opacity: clamp(opacity, 0.05, 0.9),
                            transparent: true
                        });
                        mat.side = THREE.DoubleSide;
                        mat.depthWrite = false;
                        mat.polygonOffset = true;
                        mat.polygonOffsetFactor = -1;
                        mat.polygonOffsetUnits = -1;
                        mat.userData = mat.userData ?? {};
                        mat.userData.iblEnvMapIntensityScale = 1.0;
                        mat.userData.windowGlass = true;
                        balconyMatCache.set(key, mat);
                    }
                    return mat;
                };

                const emitBalconyMergedMesh = ({ geos, material, role, strip, cfg, floorNumber, baseX, baseY, baseZ, yaw, glass = false, continuity = null }) => {
                    let list = Array.isArray(geos) ? geos.filter((g) => !!g) : [];
                    if (!list.length) return null;
                    // Joined guards mix extruded polyline strips (non-indexed)
                    // with box posts (indexed). BufferGeometryUtils correctly
                    // refuses that mismatch, so normalize only the opt-in path;
                    // legacy balcony buffers remain untouched.
                    if (continuity && list.length > 1 && list.some((geometry) => !!geometry.index) && list.some((geometry) => !geometry.index)) {
                        const originals = list;
                        list = originals.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry);
                        for (let index = 0; index < originals.length; index += 1) if (originals[index] !== list[index]) originals[index].dispose();
                    }
                    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
                    if (!merged) return null;
                    if (list.length > 1) for (const g of list) g.dispose();
                    const mesh = new THREE.Mesh(merged, material);
                    mesh.position.set(baseX, baseY, baseZ);
                    mesh.rotation.set(0, yaw, 0);
                    mesh.castShadow = !glass;
                    mesh.receiveShadow = !glass;
                    if (glass) mesh.renderOrder = 2;
                    mesh.userData = mesh.userData ?? {};
                    mesh.userData.buildingFab2Role = role;
                    mesh.userData.balconyBayId = typeof strip.id === 'string' ? strip.id : '';
                    mesh.userData.balconyPlacement = cfg.placement;
                    mesh.userData.balconyFloor = floorNumber;
                    if (continuity) {
                        mesh.userData.balconyContinuity = true;
                        mesh.userData.balconyContinuityLinkIds = [...continuity.linkIds];
                        mesh.userData.balconyContinuityBayIds = [...continuity.bayIds];
                        mesh.userData.balconyContinuityFaceIds = [...continuity.faceIds];
                    }
                    (glass ? windowsGroup : beltsGroup).add(mesh);
                    if (showWire && !glass) {
                        mesh.updateMatrix();
                        const edgeGeo = new THREE.EdgesGeometry(merged, 1);
                        appendWirePositionsTransformed(wirePositions, edgeGeo, mesh.matrix);
                        edgeGeo.dispose();
                    }
                    return mesh;
                };

                // AI 537: continuity is opt-in at the floor-layer level. A
                // valid chain is claimed as one world-space platform/guard;
                // a malformed or unsupported chain claims nothing and drops
                // through to the byte-for-byte legacy per-bay loop below.
                const balconyContinuityClaimedFloors = new Set();
                const continuityResolution = resolveBalconyContinuityLinks({
                    continuity: layer?.balconyContinuity ?? null,
                    stripsByFaceId: continuityStripsByFaceId
                });
                for (const diagnostic of continuityResolution.diagnostics) {
                    warnings.push(`${diagnostic.message} Legacy separate balcony geometry was preserved.`);
                }

                if (continuityResolution.links.length) {
                    const candidateByStrip = new Map();
                    for (const strip of balconyStrips) {
                        const frame = facadeFrames?.[strip.faceId] ?? null;
                        const cfg = normalizeBalconyConfig(strip.balcony);
                        const sourceBayId = typeof strip.sourceBayId === 'string' && strip.sourceBayId
                            ? strip.sourceBayId
                            : (typeof strip.id === 'string' ? strip.id : '');
                        const rawU0 = Number(strip.frontU0);
                        const rawU1 = Number(strip.frontU1);
                        const rawStart = Number.isFinite(rawU0) ? rawU0 : (Number(strip.u0) || 0);
                        const rawEnd = Number.isFinite(rawU1) ? rawU1 : (Number(strip.u1) || 0);
                        const stripDepth = Number(strip.depth) || 0;
                        let unsupportedReason = null;
                        if (!frame || !cfg || !sourceBayId || !(rawEnd > rawStart + 0.3)) unsupportedReason = 'targets an unresolved balcony bay';
                        else if (cfg.placement !== BALCONY_PLACEMENT.PROJECTING) unsupportedReason = 'recessed balcony continuity is not supported yet';
                        else if (cfg.platform.widthMode !== BALCONY_PLATFORM_WIDTH_MODE.BAY) unsupportedReason = 'only bay-width balcony platforms can be linked';

                        const margin = cfg?.platform?.sideMarginMeters ?? 0;
                        const u0 = rawStart + margin;
                        const u1 = rawEnd - margin;
                        if (!unsupportedReason && !(u1 > u0 + 0.25)) unsupportedReason = 'platform side margins leave no joinable width';
                        const platDepth = Number.isFinite(cfg?.platform?.depthMeters) ? cfg.platform.depthMeters : 1.4;
                        const coverage = cfg ? resolveBalconySideCoverage({
                            faceId: strip.faceId,
                            u0: Number(strip.u0) || 0,
                            u1: Number(strip.u1) || 0,
                            platformFrontDepth: stripDepth + platDepth,
                            stripsByFaceId: balconyStripsByFaceId,
                            sides: cfg.sides
                        }) : { left: false, front: false, right: false };
                        if (!unsupportedReason && !coverage.front) unsupportedReason = 'linked guard continuity requires a front railing on every member';

                        const segCount = floorSegmentStartYs.length;
                        const floorsEnd = cfg?.floors?.end > 0 ? Math.min(cfg.floors.end, segCount) : segCount;
                        const selectedFloors = [];
                        if (cfg) {
                            for (let floor = cfg.floors.start; floor <= floorsEnd; floor += cfg.floors.every) selectedFloors.push(floor);
                        }
                        const candidate = {
                            key: balconyContinuityCandidateKey(strip.faceId, sourceBayId),
                            strip,
                            sourceBayId,
                            faceId: strip.faceId,
                            frame,
                            cfg,
                            u0,
                            u1,
                            stripDepth,
                            platDepth,
                            coverage,
                            selectedFloors,
                            unsupportedReason,
                            compatibilityKey: cfg ? stableStringify({
                                platform: {
                                    depthMeters: platDepth,
                                    thicknessMeters: cfg.platform.thicknessMeters,
                                    widthMode: cfg.platform.widthMode,
                                    sideMarginMeters: cfg.platform.sideMarginMeters,
                                    elevationMeters: cfg.platform.elevationMeters,
                                    material: cfg.platform.material
                                },
                                support: cfg.support,
                                railing: cfg.railing,
                                frontCoverage: coverage.front,
                                selectedFloors
                            }) : ''
                        };
                        candidateByStrip.set(strip, candidate);
                    }

                    const claimedEndpointKeys = new Set();
                    const validLinks = [];
                    const rejectLink = (link, reason) => {
                        warnings.push(`Balcony continuity "${link?.id ?? ''}": ${reason}; legacy separate balcony geometry was preserved.`);
                    };
                    for (const resolvedLink of continuityResolution.links) {
                        const endpoints = resolvedLink.endpoints.map((endpoint) => ({
                            ...endpoint,
                            endpointKey: balconyContinuityEndpointKey(endpoint),
                            candidate: candidateByStrip.get(endpoint.strip) ?? null
                        }));
                        const [aEndpoint, bEndpoint] = endpoints;
                        const aCandidate = aEndpoint?.candidate ?? null;
                        const bCandidate = bEndpoint?.candidate ?? null;
                        const duplicateEndpoint = endpoints.some((endpoint) => !endpoint.endpointKey || claimedEndpointKeys.has(endpoint.endpointKey));
                        if (duplicateEndpoint) {
                            rejectLink(resolvedLink, 'an endpoint is ambiguous or already owned by another valid link');
                            continue;
                        }
                        if (!aCandidate || !bCandidate || aCandidate.unsupportedReason || bCandidate.unsupportedReason) {
                            rejectLink(resolvedLink, aCandidate?.unsupportedReason ?? bCandidate?.unsupportedReason ?? 'could not resolve both balcony bays');
                            continue;
                        }
                        if (aCandidate.compatibilityKey !== bCandidate.compatibilityKey) {
                            rejectLink(resolvedLink, 'balcony floor, platform, support, material, or railing settings are incompatible');
                            continue;
                        }
                        const relation = resolveBalconyContinuityAdjacency({
                            aEndpoint,
                            aCandidate,
                            bEndpoint,
                            bCandidate,
                            frames: facadeFrames,
                            boundaryTransitions: facadeBoundaryTransitions
                        });
                        if (!relation.valid) {
                            rejectLink(resolvedLink, relation.reason);
                            continue;
                        }
                        const link = { id: resolvedLink.id, endpoints, relation };
                        validLinks.push(link);
                        for (const endpoint of endpoints) claimedEndpointKeys.add(endpoint.endpointKey);
                    }

                    const linksByCandidateKey = new Map();
                    for (const link of validLinks) {
                        for (const endpoint of link.endpoints) {
                            const key = endpoint.candidate.key;
                            if (!linksByCandidateKey.has(key)) linksByCandidateKey.set(key, []);
                            linksByCandidateKey.get(key).push(link);
                        }
                    }
                    const visitedCandidateKeys = new Set();
                    for (const rootKey of [...linksByCandidateKey.keys()].sort()) {
                        if (visitedCandidateKeys.has(rootKey)) continue;
                        const pending = [rootKey];
                        const componentKeys = new Set();
                        const componentLinks = new Set();
                        while (pending.length) {
                            const key = pending.pop();
                            if (!key || componentKeys.has(key)) continue;
                            componentKeys.add(key);
                            visitedCandidateKeys.add(key);
                            for (const link of linksByCandidateKey.get(key) ?? []) {
                                componentLinks.add(link);
                                for (const endpoint of link.endpoints) {
                                    if (!componentKeys.has(endpoint.candidate.key)) pending.push(endpoint.candidate.key);
                                }
                            }
                        }
                        const orderedComponent = orderBalconyContinuityComponent([...componentLinks]);
                        if (!orderedComponent.valid) {
                            const ids = [...componentLinks].map((link) => link.id).join(', ');
                            warnings.push(`Balcony continuity component ${ids}: ${orderedComponent.reason}; legacy separate balcony geometry was preserved.`);
                            continue;
                        }

                        const { ordered, links } = orderedComponent;
                        const firstCandidate = ordered[0].candidate;
                        const cfg = firstCandidate.cfg;
                        const thickness = cfg.platform.thicknessMeters;
                        const backPath = buildBalconyContinuityDepthPath({
                            ordered,
                            links,
                            depthOf: (candidate) => candidate.stripDepth - 0.04
                        });
                        const frontPath = buildBalconyContinuityDepthPath({
                            ordered,
                            links,
                            depthOf: (candidate) => candidate.stripDepth + candidate.platDepth
                        });
                        const railPath = buildBalconyContinuityDepthPath({
                            ordered,
                            links,
                            depthOf: (candidate) => candidate.stripDepth + Math.max(0.06, candidate.platDepth - candidate.cfg.railing.insetMeters)
                        });
                        if (!backPath || !frontPath || !railPath) {
                            warnings.push('Balcony continuity could not construct a stable joined outline; legacy separate balcony geometry was preserved.');
                            continue;
                        }
                        const platformLoop = [];
                        for (const point of [...backPath.points, ...frontPath.points.slice().reverse()]) appendPointIfChanged(platformLoop, point);
                        const platformProbe = isSimplePlanLoopXZ(platformLoop) ? makePlanExtrusionGeometryXZ(platformLoop, thickness, { downward: true }) : null;
                        if (!platformProbe) {
                            warnings.push('Balcony continuity produced a degenerate or self-intersecting joined platform; legacy separate balcony geometry was preserved.');
                            continue;
                        }
                        platformProbe.dispose();

                        const firstEdge = ordered[0].forward ? 'start' : 'end';
                        const lastEntry = ordered[ordered.length - 1];
                        const lastEdge = lastEntry.forward ? 'end' : 'start';
                        const hasFirstSide = firstEdge === 'start' ? firstCandidate.coverage.left : firstCandidate.coverage.right;
                        const lastCandidate = lastEntry.candidate;
                        const hasLastSide = lastEdge === 'start' ? lastCandidate.coverage.left : lastCandidate.coverage.right;
                        const guardPath = railPath.points.slice();
                        if (hasFirstSide) {
                            guardPath.unshift(balconyContinuityEdgePoint(firstCandidate, firstEdge, firstCandidate.stripDepth + 0.02));
                        }
                        if (hasLastSide) {
                            guardPath.push(balconyContinuityEdgePoint(lastCandidate, lastEdge, lastCandidate.stripDepth + 0.02));
                        }

                        const continuityMetadata = {
                            linkIds: links.map((link) => link.id),
                            bayIds: ordered.map((entry) => entry.candidate.sourceBayId),
                            faceIds: [...new Set(ordered.map((entry) => entry.candidate.faceId))]
                        };
                        const joinedStrip = { id: continuityMetadata.bayIds.join('+') };
                        const selectedFloors = new Set(firstCandidate.selectedFloors);
                        for (let floorIdx = 0; floorIdx < floorSegmentStartYs.length; floorIdx += 1) {
                            const floorNumber = floorIdx + 1;
                            if (!selectedFloors.has(floorNumber)) continue;
                            const segStart = floorSegmentStartYs[floorIdx];
                            const segEnd = floorIdx + 1 < floorSegmentStartYs.length ? floorSegmentStartYs[floorIdx + 1] : layerEndY;
                            if (!(segEnd - segStart > 0.5)) continue;
                            const platformTopY = segStart + cfg.platform.elevationMeters;
                            const platformGeometry = makePlanExtrusionGeometryXZ(platformLoop, thickness, { downward: true });
                            const platformMesh = emitBalconyMergedMesh({
                                geos: [platformGeometry],
                                material: balconyWallMaterial(cfg.platform.material),
                                role: 'balcony_platform',
                                strip: joinedStrip,
                                cfg,
                                floorNumber,
                                baseX: 0,
                                baseY: platformTopY,
                                baseZ: 0,
                                yaw: 0,
                                continuity: continuityMetadata
                            });
                            if (!platformMesh) continue;
                            for (const entry of ordered) {
                                balconyContinuityClaimedFloors.add(`${entry.candidate.key}|${floorNumber}`);
                            }

                            const metalGeos = [];
                            const glassGeos = [];
                            const solidGeos = [];
                            const supportGeos = [];
                            const railH = cfg.railing.heightMeters;
                            const topRail = cfg.railing.topRail;
                            const posts = cfg.railing.posts;
                            const postKeys = new Set();
                            let cornerPostCount = 0;
                            const addPost = (point) => {
                                if (!posts.enabled || !point) return;
                                const key = `${point.x.toFixed(3)}|${point.z.toFixed(3)}`;
                                if (postKeys.has(key)) return;
                                postKeys.add(key);
                                const geometry = new THREE.BoxGeometry(posts.widthMeters, railH, posts.widthMeters);
                                geometry.translate(point.x, railH * 0.5, point.z);
                                metalGeos.push(geometry);
                            };
                            addPost(railPath.points[0]);
                            addPost(railPath.points[railPath.points.length - 1]);
                            for (const join of railPath.joins) {
                                if (!join.nonCollinear) continue;
                                const before = postKeys.size;
                                addPost(join.point);
                                if (postKeys.size > before) cornerPostCount += 1;
                            }
                            if (posts.enabled) {
                                for (let index = 0; index < guardPath.length - 1; index += 1) {
                                    const a = guardPath[index];
                                    const b = guardPath[index + 1];
                                    const length = Math.hypot(b.x - a.x, b.z - a.z);
                                    const count = Math.max(0, Math.ceil(length / posts.maxSpacingMeters) - 1);
                                    for (let postIndex = 1; postIndex <= count; postIndex += 1) {
                                        const t = postIndex / (count + 1);
                                        addPost({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
                                    }
                                }
                            }

                            if (topRail.enabled) {
                                const loop = buildOpenPolylineStripLoopXZ(guardPath, topRail.widthMeters);
                                const geometry = makePlanExtrusionGeometryXZ(loop, topRail.heightMeters);
                                if (geometry) {
                                    geometry.translate(0, railH - topRail.heightMeters, 0);
                                    metalGeos.push(geometry);
                                }
                            }
                            const infillBottomY = 0.06;
                            const infillTopY = railH - (topRail.enabled ? topRail.heightMeters + 0.01 : 0);
                            const infillH = infillTopY - infillBottomY;
                            if (cfg.railing.infill === BALCONY_RAILING_INFILL.GLASS_PANEL && infillH > 0.05) {
                                const loop = buildOpenPolylineStripLoopXZ(guardPath, 0.012);
                                const geometry = makePlanExtrusionGeometryXZ(loop, infillH);
                                if (geometry) {
                                    geometry.translate(0, infillBottomY, 0);
                                    glassGeos.push(geometry);
                                }
                            } else if (cfg.railing.infill === BALCONY_RAILING_INFILL.SOLID_WALL) {
                                const solidH = railH - (topRail.enabled ? topRail.heightMeters : 0);
                                const loop = buildOpenPolylineStripLoopXZ(guardPath, cfg.railing.solid.thicknessMeters);
                                const geometry = makePlanExtrusionGeometryXZ(loop, solidH);
                                if (geometry) solidGeos.push(geometry);
                            } else if (cfg.railing.infill === BALCONY_RAILING_INFILL.GRID && infillH > 0.05) {
                                const grid = cfg.railing.grid;
                                if (grid.pattern === BALCONY_GRID_PATTERN.HORIZONTAL_BARS) {
                                    const count = Math.max(1, Math.floor(infillH / grid.spacingMeters));
                                    for (let bar = 0; bar < count; bar += 1) {
                                        const loop = buildOpenPolylineStripLoopXZ(guardPath, grid.barWidthMeters);
                                        const geometry = makePlanExtrusionGeometryXZ(loop, grid.barWidthMeters);
                                        if (geometry) {
                                            geometry.translate(0, infillBottomY + (infillH * (bar + 0.5)) / count, 0);
                                            metalGeos.push(geometry);
                                        }
                                    }
                                } else {
                                    const barKeys = new Set();
                                    for (let index = 0; index < guardPath.length - 1; index += 1) {
                                        const a = guardPath[index];
                                        const b = guardPath[index + 1];
                                        const length = Math.hypot(b.x - a.x, b.z - a.z);
                                        const count = Math.max(1, Math.floor(length / grid.spacingMeters));
                                        for (let bar = 1; bar <= count; bar += 1) {
                                            const t = bar / (count + 1);
                                            const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
                                            const key = `${point.x.toFixed(3)}|${point.z.toFixed(3)}`;
                                            if (barKeys.has(key)) continue;
                                            barKeys.add(key);
                                            const geometry = new THREE.BoxGeometry(grid.barWidthMeters, infillH, grid.barWidthMeters);
                                            geometry.translate(point.x, infillBottomY + infillH * 0.5, point.z);
                                            metalGeos.push(geometry);
                                        }
                                    }
                                    const bottomLoop = buildOpenPolylineStripLoopXZ(guardPath, 0.03);
                                    const bottomRailGeometry = makePlanExtrusionGeometryXZ(bottomLoop, 0.03);
                                    if (bottomRailGeometry) {
                                        bottomRailGeometry.translate(0, infillBottomY - 0.03, 0);
                                        metalGeos.push(bottomRailGeometry);
                                    }
                                }
                            }

                            for (const entry of ordered) {
                                const candidate = entry.candidate;
                                const width = candidate.u1 - candidate.u0;
                                const centerU = (candidate.u0 + candidate.u1) * 0.5;
                                const base = pointOnFacadeFrame({ frame: candidate.frame, u: centerU, depth: candidate.stripDepth });
                                const yaw = Math.atan2(Number(candidate.frame?.n?.x) || 0, Number(candidate.frame?.n?.z) || 0);
                                if (cfg.support.mode === BALCONY_SUPPORT_MODE.CORBEL_BRACKETS) {
                                    const count = Math.max(2, 1 + Math.floor((width - 0.3) / 2.5));
                                    for (let bracket = 0; bracket < count; bracket += 1) {
                                        const t = count === 1 ? 0 : -width * 0.5 + 0.15 + ((width - 0.3) * bracket) / (count - 1);
                                        const geometry = makeBalconyBracketGeometry({
                                            widthMeters: 0.08,
                                            depthMeters: candidate.platDepth * 0.82,
                                            heightMeters: cfg.support.bracketHeightMeters
                                        });
                                        geometry.translate(t, -thickness, 0);
                                        geometry.rotateY(yaw);
                                        geometry.translate(base.x, 0, base.z);
                                        supportGeos.push(geometry);
                                    }
                                } else if (cfg.support.mode === BALCONY_SUPPORT_MODE.POSTS_TO_BELOW) {
                                    let postLength = 0;
                                    if (floorIdx > 0 && selectedFloors.has(floorIdx)) {
                                        postLength = segStart - floorSegmentStartYs[floorIdx - 1] - thickness;
                                    } else if (floorIdx === 0 && Math.abs(segStart - layerStartY) < EPS) {
                                        postLength = Math.max(0, cfg.platform.elevationMeters - thickness);
                                    }
                                    if (postLength > 0.15) {
                                        const size = cfg.support.postSizeMeters;
                                        const railDepth = candidate.stripDepth + Math.max(0.06, candidate.platDepth - cfg.railing.insetMeters) - size * 0.5;
                                        for (const u of [candidate.u0 + cfg.railing.insetMeters + size * 0.5, candidate.u1 - cfg.railing.insetMeters - size * 0.5]) {
                                            const point = pointOnFacadeFrame({ frame: candidate.frame, u, depth: railDepth });
                                            const geometry = new THREE.BoxGeometry(size, postLength, size);
                                            geometry.translate(point.x, -thickness - postLength * 0.5, point.z);
                                            supportGeos.push(geometry);
                                        }
                                    }
                                }
                            }

                            const sharedArgs = {
                                strip: joinedStrip,
                                cfg,
                                floorNumber,
                                baseX: 0,
                                baseY: platformTopY,
                                baseZ: 0,
                                yaw: 0,
                                continuity: continuityMetadata
                            };
                            const railingMesh = emitBalconyMergedMesh({ ...sharedArgs, geos: metalGeos, material: balconyMetalMaterial(cfg.railing), role: 'balcony_railing' });
                            if (railingMesh) {
                                railingMesh.userData.balconyContinuityCornerPostCount = cornerPostCount;
                            }
                            emitBalconyMergedMesh({ ...sharedArgs, geos: solidGeos, material: balconyWallMaterial(cfg.railing.solid.material), role: 'balcony_infill_solid' });
                            emitBalconyMergedMesh({ ...sharedArgs, geos: supportGeos, material: balconyWallMaterial(cfg.support.material), role: 'balcony_support' });
                            emitBalconyMergedMesh({ ...sharedArgs, geos: glassGeos, material: balconyGlassMaterial(cfg.railing.glass), role: 'balcony_infill_glass', glass: true });
                        }
                    }
                }

                for (const strip of balconyStrips) {
                    const frame = facadeFrames?.[strip.faceId] ?? null;
                    if (!frame) continue;
                    const cfg = normalizeBalconyConfig(strip.balcony);
                    if (!cfg) continue;

                    const rawU0 = Number(strip.frontU0);
                    const rawU1 = Number(strip.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip.u1) || 0);
                    const bayWidth = u1 - u0;
                    if (!(bayWidth > 0.3)) continue;

                    const stripDepth = Number(strip.depth) || 0;
                    const notchDepth = Math.max(0, -stripDepth);
                    const isRecessed = cfg.placement === BALCONY_PLACEMENT.RECESSED;
                    if (isRecessed && notchDepth < 0.25) {
                        warnings.push(`Bay ${strip.id ?? ''} (${strip.faceId}): recessed balcony needs a recessed bay (depth <= -0.25m); skipping.`);
                        continue;
                    }
                    // Raw check: depthMeters null is the "auto" sentinel
                    // (Number(null) would read as a finite 0).
                    const platDepth = Number.isFinite(cfg.platform.depthMeters)
                        ? cfg.platform.depthMeters
                        : (isRecessed ? notchDepth : 1.4);
                    const coverage = resolveBalconySideCoverage({
                        faceId: strip.faceId,
                        u0: Number(strip.u0) || 0,
                        u1: Number(strip.u1) || 0,
                        platformFrontDepth: stripDepth + platDepth,
                        stripsByFaceId: balconyStripsByFaceId,
                        sides: cfg.sides
                    });

                    // Spans: the whole bay, or one per opening repeat slot
                    // (juliet balconets ride each window).
                    const spans = [];
                    const margin = cfg.platform.sideMarginMeters;
                    if (cfg.platform.widthMode === BALCONY_PLATFORM_WIDTH_MODE.OPENING && strip.window && strip.window.enabled !== false) {
                        const winCfg = strip.window;
                        const leftPad = clamp(winCfg?.padding?.leftMeters ?? 0, 0, 9999);
                        const rightPad = clamp(winCfg?.padding?.rightMeters ?? 0, 0, 9999);
                        const usable = bayWidth - leftPad - rightPad;
                        const repeatCount = Math.max(1, Math.round(Number(winCfg?.repeat?.count) || 1));
                        const slotWidth = usable / repeatCount;
                        const openingWidth = clamp(
                            winCfg?.size?.widthMeters ?? winCfg?.width?.minMeters ?? 1.2,
                            0.3,
                            Math.max(0.3, slotWidth)
                        );
                        const winHeight = clamp(winCfg?.size?.heightMeters ?? 1.6, 0.1, 9999);
                        const vOffRaw = Number(winCfg?.verticalOffsetMeters);
                        if (slotWidth > 0.3) {
                            for (let r = 0; r < repeatCount; r++) {
                                const centerU = u0 + leftPad + slotWidth * (r + 0.5);
                                const half = openingWidth * 0.5 + margin;
                                spans.push({
                                    uA: centerU - half,
                                    uB: centerU + half,
                                    sill: { height: winHeight, verticalOffset: Number.isFinite(vOffRaw) ? vOffRaw : null, heightMode: winCfg?.heightMode }
                                });
                            }
                        }
                    }
                    if (!spans.length) {
                        spans.push({ uA: u0 + margin, uB: u1 - margin, sill: null });
                    }

                    const segCount = floorSegmentStartYs.length;
                    const floorsEnd = cfg.floors.end > 0 ? Math.min(cfg.floors.end, segCount) : segCount;
                    const selectedFloors = new Set();
                    for (let f = cfg.floors.start; f <= floorsEnd; f += cfg.floors.every) selectedFloors.add(f);

                    const railH = cfg.railing.heightMeters;
                    const inset = cfg.railing.insetMeters;
                    const trCfg = cfg.railing.topRail;
                    const postsCfg = cfg.railing.posts;
                    const thickness = cfg.platform.thicknessMeters;
                    const metalMat = balconyMetalMaterial(cfg.railing);

                    for (let floorIdx = 0; floorIdx < segCount; floorIdx++) {
                        const floorNumber = floorIdx + 1;
                        if (!selectedFloors.has(floorNumber)) continue;
                        const sourceBayId = typeof strip.sourceBayId === 'string' && strip.sourceBayId
                            ? strip.sourceBayId
                            : (typeof strip.id === 'string' ? strip.id : '');
                        const continuityClaimKey = `${balconyContinuityCandidateKey(strip.faceId, sourceBayId)}|${floorNumber}`;
                        if (balconyContinuityClaimedFloors.has(continuityClaimKey)) continue;
                        const segStart = floorSegmentStartYs[floorIdx];
                        const segEnd = floorIdx + 1 < segCount ? floorSegmentStartYs[floorIdx + 1] : layerEndY;
                        const segH = segEnd - segStart;
                        if (!(segH > 0.5)) continue;

                        for (const span of spans) {
                            const w = span.uB - span.uA;
                            if (!(w > 0.25)) continue;
                            const uMid = (span.uA + span.uB) * 0.5;

                            let sillY = 0;
                            if (span.sill) {
                                const mode = typeof span.sill.heightMode === 'string' ? span.sill.heightMode : 'fixed';
                                sillY = Number.isFinite(Number(span.sill.verticalOffset))
                                    ? clamp(span.sill.verticalOffset, 0, segH)
                                    : (mode === 'full' ? 0 : Math.max(0, (segH - span.sill.height) * 0.5));
                            }
                            const platformTopY = segStart + sillY + cfg.platform.elevationMeters;

                            const base = pointOnFacadeFrame({ frame, u: uMid, depth: stripDepth });
                            const yaw = Math.atan2(Number(frame?.n?.x) || 0, Number(frame?.n?.z) || 0);

                            const platformGeos = [];
                            const metalGeos = [];
                            const glassGeos = [];
                            const solidGeos = [];
                            const supportGeos = [];

                            // Platform slab (embedded 0.04m into the wall so
                            // the seam never shows).
                            {
                                const slabD = platDepth + 0.04;
                                const g = new THREE.BoxGeometry(w, thickness, slabD);
                                g.translate(0, -thickness * 0.5, slabD * 0.5 - 0.04);
                                platformGeos.push(g);
                            }

                            // Railing footprint (local): front line along X at
                            // zRail, side lines along Z at +-xRail.
                            const zRail = Math.max(0.06, platDepth - inset);
                            const xRailL = -w * 0.5 + inset;
                            const xRailR = w * 0.5 - inset;
                            const zWallEnd = 0.02;
                            const postW = postsCfg.widthMeters;
                            const infillTopY = railH - (trCfg.enabled ? trCfg.heightMeters + 0.01 : 0.0);
                            const infillBottomY = 0.06;

                            const postKeys = new Set();
                            const addPost = (px, pz) => {
                                if (!postsCfg.enabled) return;
                                const key = `${px.toFixed(2)}|${pz.toFixed(2)}`;
                                if (postKeys.has(key)) return;
                                postKeys.add(key);
                                const g = new THREE.BoxGeometry(postW, railH, postW);
                                g.translate(px, railH * 0.5, pz);
                                metalGeos.push(g);
                            };

                            const emitSide = ({ axis, fixed, from, to, anchoredStart }) => {
                                const len = to - from;
                                if (!(len > 0.08)) return;
                                const mid = (from + to) * 0.5;

                                // Corner/end posts (skip wall-anchored ends).
                                if (!anchoredStart) addPost(axis === 'x' ? from : fixed, axis === 'x' ? fixed : from);
                                addPost(axis === 'x' ? to : fixed, axis === 'x' ? fixed : to);
                                // Intermediate posts.
                                if (postsCfg.enabled) {
                                    const nPosts = Math.max(0, Math.ceil(len / postsCfg.maxSpacingMeters) - 1);
                                    for (let p = 1; p <= nPosts; p++) {
                                        const t = from + (len * p) / (nPosts + 1);
                                        addPost(axis === 'x' ? t : fixed, axis === 'x' ? fixed : t);
                                    }
                                }

                                // Top rail cap.
                                if (trCfg.enabled) {
                                    const capLen = len + postW;
                                    const g = axis === 'x'
                                        ? new THREE.BoxGeometry(capLen, trCfg.heightMeters, trCfg.widthMeters)
                                        : new THREE.BoxGeometry(trCfg.widthMeters, trCfg.heightMeters, capLen);
                                    g.translate(
                                        axis === 'x' ? mid : fixed,
                                        railH - trCfg.heightMeters * 0.5,
                                        axis === 'x' ? fixed : mid
                                    );
                                    metalGeos.push(g);
                                }

                                const infillH = infillTopY - infillBottomY;
                                if (cfg.railing.infill === BALCONY_RAILING_INFILL.GLASS_PANEL && infillH > 0.05) {
                                    const panelLen = len - 2 * (postW + 0.01);
                                    if (panelLen > 0.05) {
                                        const g = axis === 'x'
                                            ? new THREE.BoxGeometry(panelLen, infillH, 0.012)
                                            : new THREE.BoxGeometry(0.012, infillH, panelLen);
                                        g.translate(
                                            axis === 'x' ? mid : fixed,
                                            infillBottomY + infillH * 0.5,
                                            axis === 'x' ? fixed : mid
                                        );
                                        glassGeos.push(g);
                                    }
                                } else if (cfg.railing.infill === BALCONY_RAILING_INFILL.SOLID_WALL) {
                                    const solidH = railH - (trCfg.enabled ? trCfg.heightMeters : 0.0);
                                    const th = cfg.railing.solid.thicknessMeters;
                                    const g = axis === 'x'
                                        ? new THREE.BoxGeometry(len, solidH, th)
                                        : new THREE.BoxGeometry(th, solidH, len);
                                    g.translate(axis === 'x' ? mid : fixed, solidH * 0.5, axis === 'x' ? fixed : mid);
                                    solidGeos.push(g);
                                } else if (cfg.railing.infill === BALCONY_RAILING_INFILL.GRID && infillH > 0.05) {
                                    const grid = cfg.railing.grid;
                                    const innerLen = len - 2 * postW;
                                    if (innerLen > grid.spacingMeters) {
                                        if (grid.pattern === BALCONY_GRID_PATTERN.HORIZONTAL_BARS) {
                                            const nBars = Math.max(1, Math.floor(infillH / grid.spacingMeters));
                                            for (let b = 0; b < nBars; b++) {
                                                const by = infillBottomY + (infillH * (b + 0.5)) / nBars;
                                                const g = axis === 'x'
                                                    ? new THREE.BoxGeometry(innerLen, grid.barWidthMeters, grid.barWidthMeters)
                                                    : new THREE.BoxGeometry(grid.barWidthMeters, grid.barWidthMeters, innerLen);
                                                g.translate(axis === 'x' ? mid : fixed, by, axis === 'x' ? fixed : mid);
                                                metalGeos.push(g);
                                            }
                                        } else {
                                            const nBars = Math.max(1, Math.floor(innerLen / grid.spacingMeters));
                                            const step = innerLen / (nBars + 1);
                                            for (let b = 1; b <= nBars; b++) {
                                                const t = from + postW + step * b;
                                                const g = new THREE.BoxGeometry(grid.barWidthMeters, infillH, grid.barWidthMeters);
                                                g.translate(axis === 'x' ? t : fixed, infillBottomY + infillH * 0.5, axis === 'x' ? fixed : t);
                                                metalGeos.push(g);
                                            }
                                            // Bottom rail ties the bars.
                                            const g = axis === 'x'
                                                ? new THREE.BoxGeometry(innerLen, 0.03, 0.03)
                                                : new THREE.BoxGeometry(0.03, 0.03, innerLen);
                                            g.translate(axis === 'x' ? mid : fixed, infillBottomY - 0.015, axis === 'x' ? fixed : mid);
                                            metalGeos.push(g);
                                        }
                                    }
                                }
                            };

                            if (coverage.front) {
                                emitSide({
                                    axis: 'x',
                                    fixed: zRail,
                                    from: xRailL,
                                    to: xRailR,
                                    anchoredStart: false
                                });
                            }
                            if (coverage.left) {
                                emitSide({ axis: 'z', fixed: xRailL, from: zWallEnd, to: zRail, anchoredStart: true });
                            }
                            if (coverage.right) {
                                emitSide({ axis: 'z', fixed: xRailR, from: zWallEnd, to: zRail, anchoredStart: true });
                            }

                            // Supports (projecting only).
                            if (!isRecessed && cfg.support.mode === BALCONY_SUPPORT_MODE.CORBEL_BRACKETS) {
                                const count = Math.max(2, 1 + Math.floor((w - 0.3) / 2.5));
                                for (let b = 0; b < count; b++) {
                                    const t = count === 1 ? 0 : -w * 0.5 + 0.15 + ((w - 0.3) * b) / (count - 1);
                                    const g = makeBalconyBracketGeometry({
                                        widthMeters: 0.08,
                                        depthMeters: platDepth * 0.82,
                                        heightMeters: cfg.support.bracketHeightMeters
                                    });
                                    g.translate(t, -thickness, 0.0);
                                    supportGeos.push(g);
                                }
                            } else if (!isRecessed && cfg.support.mode === BALCONY_SUPPORT_MODE.POSTS_TO_BELOW) {
                                let postLen = 0;
                                if (floorIdx > 0 && selectedFloors.has(floorIdx)) {
                                    postLen = segStart - floorSegmentStartYs[floorIdx - 1] - thickness;
                                } else if (floorIdx === 0 && Math.abs(segStart - layerStartY) < EPS) {
                                    postLen = Math.max(0, sillY + cfg.platform.elevationMeters - thickness);
                                }
                                if (postLen > 0.15) {
                                    const ps = cfg.support.postSizeMeters;
                                    for (const px of [xRailL + ps * 0.5, xRailR - ps * 0.5]) {
                                        const g = new THREE.BoxGeometry(ps, postLen, ps);
                                        g.translate(px, -thickness - postLen * 0.5, zRail - ps * 0.5);
                                        supportGeos.push(g);
                                    }
                                }
                            }

                            // Recessed notch soffit for floors whose ceiling
                            // is not the next balcony's platform (the layer
                            // top is closed by the roof/cap ring already).
                            if (isRecessed && floorIdx + 1 < segCount && !selectedFloors.has(floorNumber + 1)) {
                                const g = new THREE.BoxGeometry(w, 0.05, platDepth);
                                g.translate(0, segEnd - platformTopY - 0.025, platDepth * 0.5);
                                platformGeos.push(g);
                            }

                            const meshArgs = {
                                strip,
                                cfg,
                                floorNumber,
                                baseX: base.x,
                                baseY: platformTopY,
                                baseZ: base.z,
                                yaw
                            };
                            emitBalconyMergedMesh({ ...meshArgs, geos: platformGeos, material: balconyWallMaterial(cfg.platform.material), role: 'balcony_platform' });
                            emitBalconyMergedMesh({ ...meshArgs, geos: metalGeos, material: metalMat, role: 'balcony_railing' });
                            emitBalconyMergedMesh({ ...meshArgs, geos: solidGeos, material: balconyWallMaterial(cfg.railing.solid.material), role: 'balcony_infill_solid' });
                            emitBalconyMergedMesh({ ...meshArgs, geos: supportGeos, material: balconyWallMaterial(cfg.support.material), role: 'balcony_support' });
                            emitBalconyMergedMesh({ ...meshArgs, geos: glassGeos, material: balconyGlassMaterial(cfg.railing.glass), role: 'balcony_infill_glass', glass: true });
                        }
                    }
                }
            }

            // AI 490: fire escapes — per-facade vertical runs anchored to a
            // window column: railed landings per floor (balcony railing kit),
            // alternating angled stair flights, and a drop ladder at the
            // bottom. Everything is thin painted metal merged into one mesh.
            const fireEscapesForLayer = fireEscapeAttachmentItems.filter((it) => it.target.layerId === layerId);
            if (fireEscapesForLayer.length && facadeFrames && Array.isArray(facadeStrips) && floorSegmentStartYs.length) {
                for (const fe of fireEscapesForLayer) {
                    const strip = facadeStrips.find((sEntry) => sEntry?.type === 'bay'
                        && sEntry?.faceId === fe.target.faceId
                        && (sEntry?.sourceBayId === fe.target.bayId || sEntry?.id === fe.target.bayId));
                    if (!strip) {
                        warnings.push(`Fire escape ${fe.id}: bay "${fe.target.bayId}" not found on face ${fe.target.faceId}.`);
                        continue;
                    }
                    const frame = facadeFrames?.[fe.target.faceId] ?? null;
                    if (!frame) continue;

                    const rawU0 = Number(strip.frontU0);
                    const rawU1 = Number(strip.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip.u1) || 0);
                    const uCenter = (u0 + u1) * 0.5 + fe.sideOffsetMeters;
                    const stripDepth = Number(strip.depth) || 0;
                    const base = pointOnFacadeFrame({ frame, u: uCenter, depth: stripDepth });
                    const yaw = Math.atan2(Number(frame?.n?.x) || 0, Number(frame?.n?.z) || 0);

                    const segCount = floorSegmentStartYs.length;
                    const floorsEnd = fe.floors.end > 0 ? Math.min(fe.floors.end, segCount) : segCount;
                    const selectedFloors = [];
                    for (let f = fe.floors.start; f <= floorsEnd; f++) selectedFloors.push(f - 1);
                    if (!selectedFloors.length) {
                        warnings.push(`Fire escape ${fe.id}: floors range selects nothing.`);
                        continue;
                    }

                    const W = fe.platform.widthMeters;
                    const D = fe.platform.depthMeters;
                    const stairW = fe.stairWidthMeters;
                    const railH = fe.railingHeightMeters;
                    const winVRaw = Number(strip?.window?.verticalOffsetMeters);
                    const sillOffset = Number.isFinite(winVRaw) ? clamp(winVRaw, 0.2, 1.4) : 0.85;
                    const landingY = (floorIdx) => floorSegmentStartYs[floorIdx] + sillOffset;
                    const wellSignOf = (orderIndex) => ((orderIndex % 2) === 0 ? 1 : -1);

                    const geos = [];
                    const postKeys = new Set();

                    for (let si = 0; si < selectedFloors.length; si++) {
                        const y = landingY(selectedFloors[si]);
                        const wellSign = wellSignOf(si);

                        // Platform grate: full-width walkway strip against the
                        // wall + a half-width outer strip; the other outer
                        // half stays open as the stair well.
                        const walkDepth = D * 0.45 - 0.02;
                        const walk = new THREE.BoxGeometry(W, 0.06, walkDepth);
                        walk.translate(0, y - 0.03, 0.02 + walkDepth * 0.5);
                        geos.push(walk);
                        const outerDepth = D - 0.45 * D - 0.05;
                        const outer = new THREE.BoxGeometry(W * 0.5, 0.06, outerDepth);
                        outer.translate(-wellSign * W * 0.25, y - 0.03, D * 0.45 + outerDepth * 0.5);
                        geos.push(outer);

                        // Landing railings (balcony kit look).
                        appendMetalRailingRunGeometries({
                            geos,
                            axis: 'x',
                            fixed: D - 0.06,
                            from: -W * 0.5 + 0.03,
                            to: W * 0.5 - 0.03,
                            baseY: y,
                            railingHeightMeters: railH,
                            postKeys
                        });
                        for (const sideSign of [-1, 1]) {
                            appendMetalRailingRunGeometries({
                                geos,
                                axis: 'z',
                                fixed: sideSign * (W * 0.5 - 0.03),
                                from: 0.04,
                                to: D - 0.06,
                                baseY: y,
                                railingHeightMeters: railH,
                                anchoredStart: true,
                                postKeys
                            });
                        }

                        // Flight up to the next landing (alternating direction),
                        // descending through this well line.
                        if (si + 1 < selectedFloors.length) {
                            const yTop = landingY(selectedFloors[si + 1]);
                            const rise = yTop - y;
                            const flightSign = wellSignOf(si + 1);
                            const xTop = flightSign * (W * 0.5 - stairW * 0.5);
                            const xBottom = -flightSign * (W * 0.5 - stairW * 0.5);
                            const dx = xTop - xBottom;
                            const runLen = Math.abs(dx);
                            const flightLen = Math.hypot(rise, runLen);
                            const angle = Math.atan2(rise, runLen) * Math.sign(dx);
                            const zStair = D * 0.62;
                            const xMid = (xTop + xBottom) * 0.5;
                            const yMid = (y + yTop) * 0.5;

                            for (const edgeSign of [-1, 1]) {
                                const stringer = new THREE.BoxGeometry(flightLen, 0.15, 0.035);
                                stringer.rotateZ(angle);
                                stringer.translate(xMid, yMid, zStair + edgeSign * (stairW * 0.5 - 0.02));
                                geos.push(stringer);
                                const rail = new THREE.BoxGeometry(flightLen, 0.03, 0.03);
                                rail.rotateZ(angle);
                                rail.translate(xMid, yMid + railH * 0.82, zStair + edgeSign * (stairW * 0.5 - 0.02));
                                geos.push(rail);
                                for (const tPost of [0.22, 0.78]) {
                                    const post = new THREE.BoxGeometry(0.025, railH * 0.82, 0.025);
                                    post.translate(
                                        xBottom + dx * tPost,
                                        y + rise * tPost + railH * 0.41,
                                        zStair + edgeSign * (stairW * 0.5 - 0.02)
                                    );
                                    geos.push(post);
                                }
                            }
                            const stepCount = Math.max(3, Math.round(rise / 0.24));
                            for (let stepIdx = 1; stepIdx <= stepCount; stepIdx++) {
                                const t = stepIdx / (stepCount + 1);
                                const step = new THREE.BoxGeometry(0.26, 0.03, stairW - 0.08);
                                step.translate(xBottom + dx * t, y + rise * t, zStair);
                                geos.push(step);
                            }
                        }
                    }

                    // Drop ladder below the lowest landing.
                    let hasLadder = false;
                    if (fe.dropLadder.enabled) {
                        const topY = landingY(selectedFloors[0]) - 0.03;
                        const bottomY = baseY + fe.dropLadder.bottomClearanceMeters;
                        const ladderLen = topY - bottomY;
                        if (ladderLen > 0.6) {
                            hasLadder = true;
                            const xLadder = wellSignOf(0) * (W * 0.5 - stairW * 0.5);
                            const zLadder = D - 0.18;
                            for (const railSign of [-1, 1]) {
                                const rail = new THREE.BoxGeometry(0.035, ladderLen, 0.035);
                                rail.translate(xLadder + railSign * 0.22, bottomY + ladderLen * 0.5, zLadder);
                                geos.push(rail);
                            }
                            const rungCount = Math.max(2, Math.floor(ladderLen / 0.3));
                            for (let r = 0; r < rungCount; r++) {
                                const rung = new THREE.BoxGeometry(0.44, 0.025, 0.025);
                                rung.translate(xLadder, bottomY + 0.15 + r * 0.3, zLadder);
                                geos.push(rung);
                            }
                        }
                    }

                    if (!geos.length) continue;
                    const merged = mergeGeometries(geos, false);
                    for (const g of geos) g.dispose();
                    if (!merged) continue;
                    const mat = new THREE.MeshStandardMaterial({
                        color: fe.colorHex,
                        roughness: fe.roughness,
                        metalness: fe.metalness
                    });
                    const mesh = new THREE.Mesh(merged, mat);
                    mesh.position.set(base.x, 0, base.z);
                    mesh.rotation.set(0, yaw, 0);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.userData = mesh.userData ?? {};
                    mesh.userData.buildingFab2Role = 'attachment_fire_escape';
                    mesh.userData.fireEscapeId = fe.id;
                    mesh.userData.fireEscapeLandingCount = selectedFloors.length;
                    mesh.userData.fireEscapeFlightCount = Math.max(0, selectedFloors.length - 1);
                    mesh.userData.fireEscapeHasLadder = hasLadder;
                    beltsGroup.add(mesh);
                    if (showWire) {
                        mesh.updateMatrix();
                        const edgeGeo = new THREE.EdgesGeometry(merged, 1);
                        appendWirePositionsTransformed(wirePositions, edgeGeo, mesh.matrix);
                        edgeGeo.dispose();
                    }
                }
            }

            // AI 508: facade lettering — extruded block glyphs centered on a
            // target bay span, standing on the bay's front plane. One merged
            // mesh per sign, role tagged, in the building merge/shadow set.
            const letteringForLayer = facadeLetteringItems.filter((it) => it.layerId === layerId);
            if (letteringForLayer.length && facadeFrames && Array.isArray(facadeStrips)) {
                const wallSegments = floorSegmentsByLayerId.get(layerId) ?? [];
                const letteringMatCache = new Map();
                const getLetteringMaterial = (spec) => {
                    const key = stableStringify(spec ?? null);
                    let mat = letteringMatCache.get(key);
                    if (!mat) {
                        mat = makeCorniceMaterialFromSpec({
                            material: (spec && typeof spec === 'object') ? spec : { kind: 'match_wall', id: 'match_wall' },
                            tiling: null,
                            layerMaterial: layer.material ?? null,
                            layerWallBase: layer.wallBase ?? null,
                            layerTiling: layer.tiling ?? null,
                            baseColorHex,
                            textureCache
                        });
                        letteringMatCache.set(key, mat);
                    }
                    return mat;
                };

                for (const item of letteringForLayer) {
                    const label = `Lettering ${item.id}`;
                    const stripCandidates = facadeStrips.filter((sEntry) => sEntry?.type === 'bay'
                        && sEntry?.faceId === item.faceId
                        && (sEntry?.sourceBayId === item.bayId || sEntry?.id === item.bayId));
                    const frame = facadeFrames?.[item.faceId] ?? null;
                    if (!stripCandidates.length || !frame) {
                        warnings.push(`${label}: bay "${item.bayId}" not found on face ${item.faceId}.`);
                        continue;
                    }
                    // A rhythm-expanded bay solves into several strips sharing
                    // one source id; the sign goes on the instance nearest the
                    // face middle (deterministic).
                    const faceMidU = (Number(frame.length) || 0) * 0.5;
                    let strip = stripCandidates[0];
                    let bestDist = Infinity;
                    for (const cand of stripCandidates) {
                        const cu0 = Number.isFinite(Number(cand.frontU0)) ? Number(cand.frontU0) : (Number(cand.u0) || 0);
                        const cu1 = Number.isFinite(Number(cand.frontU1)) ? Number(cand.frontU1) : (Number(cand.u1) || 0);
                        const dist = Math.abs((cu0 + cu1) * 0.5 - faceMidU);
                        if (dist < bestDist) {
                            bestDist = dist;
                            strip = cand;
                        }
                    }

                    const rawU0 = Number(strip.frontU0);
                    const rawU1 = Number(strip.frontU1);
                    const u0 = Number.isFinite(rawU0) ? rawU0 : (Number(strip.u0) || 0);
                    const u1 = Number.isFinite(rawU1) ? rawU1 : (Number(strip.u1) || 0);
                    const bayWidth = u1 - u0;
                    if (!(bayWidth > 0.1)) {
                        warnings.push(`${label}: bay "${item.bayId}" span is too narrow for lettering.`);
                        continue;
                    }
                    const stripDepth0 = Number.isFinite(Number(strip.depth0)) ? Number(strip.depth0) : (Number(strip.depth) || 0);
                    const stripDepth1 = Number.isFinite(Number(strip.depth1)) ? Number(strip.depth1) : (Number(strip.depth) || 0);
                    if (Math.abs(stripDepth1 - stripDepth0) > 1e-4) {
                        warnings.push(`${label}: bay "${item.bayId}" has a slanted (wedge) front; lettering sits at its mid depth.`);
                    }

                    const wallSeg = wallSegments[item.floor - 1] ?? null;
                    if (!wallSeg) {
                        warnings.push(`${label}: floor ${item.floor} is outside layer "${layerId}" (${wallSegments.length} floor(s)).`);
                        continue;
                    }
                    let bandBottomY = wallSeg.startY;
                    const bandTopY = wallSeg.endY;

                    if (item.zone === 'opening_header') {
                        const placement = bayWindowPlacements.find((p) => p?.faceId === item.faceId && p?.bayId === strip.id) ?? null;
                        if (!placement) {
                            warnings.push(`${label}: zone "opening_header" needs an opening in bay "${item.bayId}"; skipped.`);
                            continue;
                        }
                        const resolvedPlacement = resolveBayOpeningPlacementInSegment({
                            segmentHeight: wallSeg.height,
                            requestedHeight: Number(placement?.height) || 0.1,
                            heightMode: placement?.heightMode,
                            verticalOffsetMeters: placement?.verticalOffsetMeters,
                            top: placement?.top
                        });
                        const headTop = resolvedPlacement?.top?.enabled
                            ? (Number(resolvedPlacement.top.yBottom) || 0) + (Number(resolvedPlacement.top.height) || 0)
                            : (Number(resolvedPlacement?.bottom?.yBottom) || 0) + (Number(resolvedPlacement?.bottom?.height) || 0);
                        bandBottomY = wallSeg.startY + Math.min(headTop, wallSeg.height);
                    }

                    // Clamp so the sign never overflows the band it sits on:
                    // scale down uniformly to the band's free width/height.
                    const H_MARGIN = 0.05;
                    const V_MARGIN = 0.03;
                    const maxWidth = bayWidth - H_MARGIN * 2;
                    const maxHeight = (bandTopY - bandBottomY) - V_MARGIN * 2;
                    if (!(maxWidth > 0.02) || !(maxHeight > 0.02)) {
                        warnings.push(`${label}: no room in the "${item.zone}" band (${(bandTopY - bandBottomY).toFixed(2)}m tall); skipped.`);
                        continue;
                    }

                    const layoutProbe = layoutFacadeLetteringText(item.text, { letterSpacingRatio: item.letterSpacingRatio });
                    if (layoutProbe.unsupported.length) {
                        warnings.push(`${label}: unsupported character(s) ${layoutProbe.unsupported.map((c) => `"${c}"`).join(', ')}; rendered as spaces.`);
                    }
                    if (!layoutProbe.ink) {
                        warnings.push(`${label}: text "${item.text}" has no drawable glyphs; skipped.`);
                        continue;
                    }
                    // Fit by INK bounds, not advance width: diagonal butt ends
                    // overshoot the em box slightly (type overshoot), and the
                    // clamp guarantee is about what actually renders.
                    const inkWidthUnits = layoutProbe.ink.maxX - layoutProbe.ink.minX;
                    const inkHeightUnits = layoutProbe.ink.maxY - layoutProbe.ink.minY;
                    const scale = Math.min(
                        1.0,
                        maxWidth / (inkWidthUnits * item.heightMeters),
                        maxHeight / (inkHeightUnits * item.heightMeters)
                    );
                    if (scale < 1.0 - 1e-6) {
                        warnings.push(`${label}: "${item.text}" does not fit its ${item.zone} band at ${item.heightMeters.toFixed(2)}m; clamped to ${(item.heightMeters * scale).toFixed(2)}m.`);
                    }
                    const capHeight = item.heightMeters * scale;
                    const built = buildFacadeLetteringGeometry({
                        text: item.text,
                        heightMeters: capHeight,
                        depthMeters: item.depthMeters,
                        letterSpacingRatio: item.letterSpacingRatio
                    });
                    if (!built.geometry || !built.inkMeters) continue;

                    // Centered on the target span; the y offset nudges within
                    // the band but never out of it.
                    const ink = built.inkMeters;
                    const bandCenterY = (bandBottomY + bandTopY) * 0.5;
                    const baselineY = clamp(
                        bandCenterY - (ink.minY + ink.maxY) * 0.5 + item.yOffsetMeters,
                        bandBottomY + V_MARGIN - ink.minY,
                        Math.max(bandBottomY + V_MARGIN - ink.minY, bandTopY - V_MARGIN - ink.maxY)
                    );
                    const yaw = Math.atan2(Number(frame?.n?.x) || 0, Number(frame?.n?.z) || 0);
                    const bayCenter = pointOnFacadeFrame({
                        frame,
                        u: (u0 + u1) * 0.5,
                        depth: (stripDepth0 + stripDepth1) * 0.5
                    });
                    // Glyph +X is derived from the outward normal, while a
                    // persisted run's +u can point either way. Offset from the
                    // world-space bay center in glyph space so both run
                    // orientations remain visually centered.
                    const inkCenterX = (ink.minX + ink.maxX) * 0.5;
                    const baseX = bayCenter.x - Math.cos(yaw) * inkCenterX;
                    const baseZ = bayCenter.z + Math.sin(yaw) * inkCenterX;

                    const mesh = new THREE.Mesh(built.geometry, getLetteringMaterial(item.material));
                    mesh.position.set(baseX, baselineY, baseZ);
                    mesh.rotation.set(0, yaw, 0);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.userData = mesh.userData ?? {};
                    mesh.userData.buildingFab2Role = 'facade_lettering';
                    mesh.userData.letteringId = item.id;
                    mesh.userData.letteringText = item.text;
                    beltsGroup.add(mesh);
                    if (showWire) {
                        mesh.updateMatrix();
                        const edgeGeo = new THREE.EdgesGeometry(built.geometry, 1);
                        appendWirePositionsTransformed(wirePositions, edgeGeo, mesh.matrix);
                        edgeGeo.dispose();
                    }
                }
            }

            const cornerTreatmentAppliesToLayer = cornerTreatmentCfg?.enabled
                && (cornerTreatmentCfg.layerIds === null || cornerTreatmentCfg.layerIds.includes(layer.id));
            if (cornerTreatmentAppliesToLayer && layerEndY - layerStartY > EPS) {
                const cornerFrames = resolveCornerTreatmentCornerFrames({
                    rectLoop: wallOuter[0] ?? null,
                    resolvedLoop: wallOuterFacade[0] ?? null,
                    corners: cornerTreatmentCfg.corners,
                    // AI 499: a beveled corner has no arris to wrap — the
                    // corner feature steps aside instead of quoining a facet.
                    skipCornerIds: edgeBevelCfg
                        ? EDGE_BEVEL_CORNER_IDS.filter((id) => resolveCornerBevelWidth(edgeBevelCfg, id) > 0)
                        : null,
                    warnings
                });
                const cornerCourses = resolveCornerTreatmentCourses({
                    cfg: cornerTreatmentCfg,
                    spanStartY: layerStartY,
                    spanEndY: layerEndY,
                    floorSegmentStartYs
                });
                const cornerGeo = buildCornerTreatmentGeometry({
                    cornerFrames,
                    courses: cornerCourses,
                    cfg: cornerTreatmentCfg
                });
                if (cornerGeo) {
                    // Per-block UVs already map roughly one texture tile per
                    // stone, so the wall's UV tiling scale must not stack on top.
                    const cornerMat = makeCorniceMaterialFromSpec({
                        material: cornerTreatmentCfg.material,
                        tiling: cornerTreatmentCfg.tiling ?? null,
                        layerMaterial: layer.material ?? null,
                        layerWallBase: layer.wallBase ?? null,
                        layerTiling: layer.tiling ?? null,
                        baseColorHex,
                        textureCache,
                        applyUvTiling: false
                    });
                    const mesh = new THREE.Mesh(cornerGeo, cornerMat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.userData = mesh.userData ?? {};
                    mesh.userData.buildingFab2Role = 'corner_treatment';
                    mesh.userData.cornerTreatmentMode = cornerTreatmentCfg.mode;
                    mesh.userData.cornerTreatmentCorners = cornerFrames.length;
                    mesh.userData.cornerTreatmentCourses = cornerCourses.length;
                    beltsGroup.add(mesh);

                    if (showWire) {
                        const edgeGeo = new THREE.EdgesGeometry(cornerGeo, 1);
                        appendWirePositions(wirePositions, edgeGeo, 0);
                        edgeGeo.dispose();
                    }
                }
            }

            const corniceCfg = layer.cornice ?? null;
            if (corniceCfg?.enabled) {
                const corniceHeights = resolveCorniceHeights(corniceCfg);
                const corniceProjection = clamp(corniceCfg.projection, 0.02, 1.5);
                const corniceMat = makeCorniceMaterialFromSpec({
                    material: corniceCfg.material,
                    tiling: corniceCfg.tiling ?? null,
                    layerMaterial: layer.material ?? null,
                    layerWallBase: layer.wallBase ?? null,
                    layerTiling: layer.tiling ?? null,
                    baseColorHex,
                    textureCache
                });
                const corniceOrnamentType = corniceCfg?.ornament?.type ?? 'none';
                const corniceOrnamentMat = (corniceOrnamentType !== 'none' && corniceHeights.ornament > EPS)
                    ? makeCorniceMaterialFromSpec({
                        material: corniceCfg.ornament?.material ?? corniceCfg.material,
                        tiling: corniceCfg.tiling ?? null,
                        layerMaterial: layer.material ?? null,
                        layerWallBase: layer.wallBase ?? null,
                        layerTiling: layer.tiling ?? null,
                        baseColorHex,
                        textureCache
                    })
                    : null;
                // The next floor stands ON this cornice: widen its top shelf
                // inward to reach under that layer's recessed strips.
                const nextLayer = safeLayers[layerIndex + 1] ?? null;
                const nextLayerFacades = (nextLayer && nextLayer.type === LAYER_TYPE.FLOOR)
                    ? (globalFacadeSpec
                        ?? ((facadesByLayerId?.[nextLayer.id] && typeof facadesByLayerId[nextLayer.id] === 'object') ? facadesByLayerId[nextLayer.id] : null))
                    : null;
                const nextLayerMinDepth = minFacadeBayDepthMeters(nextLayerFacades);
                const corniceCrossSection = resolveCorniceCrossSection({
                    profile: corniceCfg.profile,
                    heightMeters: corniceHeights.profile,
                    projectionMeters: corniceProjection,
                    baseOutset: 0.0,
                    // A layer cornice consumes its own elevation range — no
                    // wall stands behind it to bury into, and the buried
                    // underside was coplanar with the capY closure bands.
                    buryInner: false,
                    innerTopExtendMeters: nextLayerMinDepth < 0 ? -nextLayerMinDepth : 0
                });

                // The ring rides the layer's nominal zero-depth line (the
                // line the next layer stands on), not the per-strip resolved
                // outline: following recessed bays stepped the ring inward,
                // exposing the capY closure band beside it as a floating pale
                // panel and z-fighting it where the two overlapped. A string
                // course bridges recessed storefront bays level, as on the
                // reference.
                const corniceZeroLoopRaw = facadeFrames
                    ? buildCornerJoinLoopWithDepths({ frames: facadeFrames, depthOf: () => 0 })
                    : null;
                const corniceZeroLoop = (corniceZeroLoopRaw && corniceZeroLoopRaw.length >= 3)
                    ? simplifyLoopConsecutiveCollinearXZ(corniceZeroLoopRaw, { tol: 1e-4, minEdge: 1e-3 })
                    : null;
                const corniceLoops = wallOuterFacade.map((loop, loopIndex) => (
                    loopIndex === 0 && corniceZeroLoop && corniceZeroLoop.length >= 3 ? corniceZeroLoop : loop
                ));

                for (const rawLoop of corniceLoops) {
                    if (!rawLoop || rawLoop.length < 3) continue;
                    const outerLoop = signedArea(rawLoop) < 0 ? rawLoop.slice().reverse() : rawLoop;

                    const profileGeo = buildCorniceLoftGeometryFromLoop({
                        loop: outerLoop,
                        crossSection: corniceCrossSection,
                        yBase: yCursor + corniceHeights.ornament
                    });
                    if (profileGeo) {
                        const mesh = new THREE.Mesh(profileGeo, corniceMat);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.userData = mesh.userData ?? {};
                        mesh.userData.buildingFab2Role = 'cornice';
                        mesh.userData.corniceProfile = corniceCfg.profile;
                        beltsGroup.add(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(profileGeo, 1);
                            appendWirePositions(wirePositions, edgeGeo, 0);
                            edgeGeo.dispose();
                        }
                    }

                    if (corniceOrnamentMat) {
                        const ornamentGeo = buildCorniceOrnamentGeometryFromLoop({
                            loop: outerLoop,
                            ornament: { ...corniceCfg.ornament, height: corniceHeights.ornament },
                            baseOutset: 0.0,
                            yBase: yCursor
                        });
                        if (ornamentGeo) {
                            const mesh = new THREE.Mesh(ornamentGeo, corniceOrnamentMat);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.userData = mesh.userData ?? {};
                            mesh.userData.buildingFab2Role = 'cornice_ornament';
                            mesh.userData.corniceOrnament = corniceOrnamentType;
                            beltsGroup.add(mesh);
                        }
                    }
                }

                yCursor += corniceHeights.total;
            }

            currentLoops = planLoops.length ? planLoops : currentLoops;
            continue;
        }

        if (type === LAYER_TYPE.ROOF) {
            const roofCfg = layer.roof ?? {};
            const roofMat = makeRoofSurfaceMaterialFromSpec({
                material: roofCfg.material,
                baseColorHex,
                textureCache
            });
            const roofStyleId = roofCfg.material?.kind === 'texture' ? roofCfg.material.id : null;
            const roofUrls = roofStyleId ? resolveBuildingStyleWallMaterialUrls(roofStyleId) : null;
            const roofTiling = roofCfg?.tiling ?? null;
            const roofUvCfg = computeUvTilingParams({ tiling: roofTiling, urls: roofUrls, styleId: roofStyleId });
            if (roofUvCfg.apply) {
                applyUvTilingToMeshStandardMaterial(roofMat, {
                    scaleU: roofUvCfg.scaleU,
                    scaleV: roofUvCfg.scaleV,
                    offsetU: roofUvCfg.offsetU,
                    offsetV: roofUvCfg.offsetV,
                    rotationDegrees: roofUvCfg.rotationDegrees
                });
            }

            const roofMatVar = roofCfg?.materialVariation ?? null;
            if (roofMatVar?.enabled) {
                applyMaterialVariationToMeshStandardMaterial(roofMat, {
                    seed: matVarSeed,
                    seedOffset: clampInt(roofMatVar?.seedOffset ?? 0, -9999, 9999),
                    heightMin: baseY,
                    heightMax: matVarHeightMax,
                    config: roofMatVar,
                    root: MATERIAL_VARIATION_ROOT.SURFACE
                });
            }

            const { outer: roofWallOuterRaw, holes: roofWallHoles } = applyWallInset({ loops: currentLoops, inset: wallInset });
            const roofWallOuter = applyEdgeBevelToOuterLoops(roofWallOuterRaw);

            let roofOuter = roofWallOuter;
            let roofHoles = roofWallHoles;
            let roofSurfaceOuter = roofOuter;
            const roofSourceLayerId = typeof lastFloorLayer?.id === 'string' ? lastFloorLayer.id : '';
            const roofFacadeSpec = globalFacadeSpec
                ? globalFacadeSpec
                : ((roofSourceLayerId && facadesByLayerId?.[roofSourceLayerId] && typeof facadesByLayerId[roofSourceLayerId] === 'object')
                    ? facadesByLayerId[roofSourceLayerId]
                    : null);
            const wantsRoofFacadeSilhouette = !!roofFacadeSpec && facadeSpecFaceIds(roofFacadeSpec).length > 0;

            if (wantsRoofFacadeSilhouette && roofWallOuter.length) {
                const main = roofWallOuter[0] ?? null;
                const frames = main ? computeFacadeFramesFromLoop(main, { warnings }) : null;
                if (frames) {
                    const links = lastFloorLayer?.faceLinking?.links && typeof lastFloorLayer.faceLinking.links === 'object'
                        ? lastFloorLayer.faceLinking.links
                        : null;
                    const reverseByFace = lastFloorLayer?.faceLinking?.reverseByFace
                        && typeof lastFloorLayer.faceLinking.reverseByFace === 'object'
                        ? lastFloorLayer.faceLinking.reverseByFace
                        : null;
                    const resolveMasterFaceId = (faceId) => {
                        const seen = new Set();
                        let cur = faceId;
                        for (let i = 0; i < 8; i++) {
                            if (seen.has(cur)) break;
                            seen.add(cur);
                            const next = links?.[cur] ?? null;
                            if (next === null || next === undefined) return cur;
                            if (next === cur) return cur;
                            cur = next;
                        }
                        return faceId;
                    };

                    const next = {};
                    for (const faceId of facadeFaceIdsOf(frames)) {
                        const masterFaceId = resolveMasterFaceId(faceId);
                        const srcFacade = (roofFacadeSpec?.[masterFaceId] && typeof roofFacadeSpec[masterFaceId] === 'object')
                            ? roofFacadeSpec[masterFaceId]
                            : null;
                        if (!srcFacade) continue;

                        const srcLayout = srcFacade?.layout && typeof srcFacade.layout === 'object' ? srcFacade.layout : null;
                        const len = Number(frames?.[faceId]?.length) || 0;

                        const bays = Array.isArray(srcLayout?.bays?.items) ? srcLayout.bays.items : null;
                        const groups = Array.isArray(srcLayout?.groups?.items) ? srcLayout.groups.items : null;
                        const hasBays = !!bays && bays.length > 0;
                        const baysForSolve = hasBays
                            ? resolveLinkedFaceBaysForSolve({ bays, faceId, masterFaceId, reverseByFace })
                            : null;
                        const bayItems = hasBays
                            ? solveFacadeBaysLayout({
                                bays: baysForSolve,
                                groups,
                                faceLengthMeters: len,
                                topology: facadeBayTopologyByKey.get(facadeBayLockKey(lastFloorLayer, faceId, srcLayout, frames?.[faceId] ?? null) ?? '') ?? null,
                                warnings
                            })
                            : null;

                        let solvedPatternItems = null;
                        if (!hasBays) {
                            const pattern = srcLayout?.pattern ?? null;
                            if (pattern && typeof pattern === 'object') {
                                const topology = facadePatternTopologyByFaceId.get(masterFaceId) ?? null;
                                const solved = solveFacadeLayoutFillPattern({
                                    pattern,
                                    faceLengthMeters: len,
                                    topology: globalFacadeSpec ? topology : null,
                                    warnings
                                });
                                solvedPatternItems = Array.isArray(solved?.items) ? solved.items : null;
                            }
                        }

                        const base = { ...srcFacade };
                        const layout = (base.layout && typeof base.layout === 'object') ? { ...base.layout } : {};
                        if (Array.isArray(bayItems)) layout.items = bayItems;
                        else if (Array.isArray(solvedPatternItems)) layout.items = solvedPatternItems;
                        base.layout = layout;

                        next[faceId] = base;
                    }

                    const res = computeQuadFacadeSilhouette({
                        wallOuter: roofWallOuter,
                        facades: next,
                        layerMaterial: null,
                        bayBoundaryConnections: lastFloorLayer?.bayBoundaryConnections ?? null,
                        warnings,
                        cornerStrategy: resolvedCornerStrategy,
                        edgeBevel: edgeBevelCfg
                    });
                    if (res?.loop?.length) {
                        roofOuter = [res.loop];
                        const depthMins = res?.depthMinsByFaceId ?? null;
                        if (depthMins) {
                            const coreLoop = buildCornerJoinLoopWithDepths({
                                frames,
                                depthOf: (faceId) => depthMins[faceId] ?? 0
                            });
                            const area = signedArea(coreLoop);
                            roofSurfaceOuter = [area < 0 ? coreLoop.slice().reverse() : coreLoop];
                        }
                    } else {
                        warnings.push('Roof silhouette: falling back to inset wall loop.');
                    }
                }
            }

            for (const outerLoop of roofSurfaceOuter) {
                if (!outerLoop || outerLoop.length < 3) continue;
                const shape = buildShapeFromLoops({ outerLoop, holeLoops: roofHoles });
                const geo = new THREE.ShapeGeometry(shape);
                geo.rotateX(-Math.PI / 2);
                geo.computeVertexNormals();

                const mesh = new THREE.Mesh(geo, roofMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.position.y = yCursor + 0.002;
                mesh.userData = mesh.userData ?? {};
                mesh.userData.buildingFab2Role = 'roof';
                mesh.userData.buildingFab2RoofKind = 'surface';
                solidMeshes.push(mesh);

                if (showWire) {
                    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                    appendWirePositions(wirePositions, edgeGeo, mesh.position.y);
                    edgeGeo.dispose();
                }
            }

            const ring = layer.ring ?? {};
            const ringEnabled = !!ring.enabled;
            const outerRadius = clamp(ring.outerRadius, 0.0, 8.0);
            const innerRadius = clamp(ring.innerRadius, 0.0, 8.0);
            const ringHeight = ringEnabled ? clamp(ring.height, 0.02, 2.0) : 0.0;

            // AI 492: rooftop props stand on the slab the parapet encloses, and
            // a roof carrying more building above it is only a rooftop where the
            // setback exposes it — so the parapet's inner face bounds the region
            // and the mass above becomes a keep-out.
            const roofPropInset = ringEnabled ? innerRadius : 0.0;
            const insetForProps = (loops, sign) => (roofPropInset > EPS
                ? loops.map((loop) => offsetOrthogonalLoopXZ(loop, sign * roofPropInset)).filter((loop) => loop?.length >= 3)
                : loops);
            const layerAboveRoof = safeLayers[layerIndex + 1] ?? null;
            const roofPropKeepOutLoops = layerAboveRoof?.type === LAYER_TYPE.FLOOR
                ? splitLoops(layerPlanLoopsById.get(layerAboveRoof.id) ?? currentLoops).outer
                : [];

            for (const mesh of buildRooftopPropMeshes({
                props: layer.props ?? null,
                outerLoops: insetForProps(roofSurfaceOuter, 1),
                holeLoops: [...insetForProps(roofHoles, -1), ...roofPropKeepOutLoops],
                baseY: yCursor,
                seed: matVarSeed,
                layerMaterial: lastFloorLayer?.material ?? null,
                layerWallBase: lastFloorLayer?.wallBase ?? null,
                layerTiling: lastFloorLayer?.tiling ?? null,
                baseColorHex,
                textureCache,
                warnings
            })) solidMeshes.push(mesh);

            if (ringEnabled && ringHeight > EPS && (outerRadius > EPS || innerRadius > EPS)) {
                const ringMat = makeBeltLikeMaterialFromSpec({
                    material: ring?.material,
                    baseColorHex,
                    textureCache
                });
                const ringStyleId = ring?.material?.kind === 'texture' ? ring.material.id : null;
                const ringUrls = ringStyleId ? resolveBuildingStyleWallMaterialUrls(ringStyleId) : null;
                const ringTiling = ring?.tiling ?? null;
                if (ringStyleId) {
                    const ringUvCfg = computeUvTilingParams({ tiling: ringTiling, urls: ringUrls, styleId: ringStyleId });
                    if (ringUvCfg.apply) {
                        applyUvTilingToMeshStandardMaterial(ringMat, {
                            scaleU: ringUvCfg.scaleU,
                            scaleV: ringUvCfg.scaleV,
                            offsetU: ringUvCfg.offsetU,
                            offsetV: ringUvCfg.offsetV,
                            rotationDegrees: ringUvCfg.rotationDegrees
                        });
                    }
                }

                for (const outerLoop of roofOuter) {
                    if (!outerLoop || outerLoop.length < 3) continue;
                    const outerLoopExpanded = outerRadius > EPS ? offsetOrthogonalLoopXZ(outerLoop, -outerRadius) : outerLoop;
                    const innerLoopInset = innerRadius > EPS ? offsetOrthogonalLoopXZ(outerLoop, innerRadius) : outerLoop;

                    if (!outerLoopExpanded || !innerLoopInset || outerLoopExpanded.length < 3 || innerLoopInset.length < 3) continue;

                    const shape = buildShapeFromLoops({ outerLoop: outerLoopExpanded, holeLoops: [innerLoopInset] });
                    const geo = new THREE.ExtrudeGeometry(shape, {
                        depth: ringHeight,
                        bevelEnabled: false,
                        steps: 1
                    });
                    geo.rotateX(-Math.PI / 2);
                    geo.computeVertexNormals();

                    const mesh = new THREE.Mesh(geo, ringMat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.position.y = yCursor;
                    roofRingGroup.add(mesh);

                    if (showWire) {
                        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                        appendWirePositions(wirePositions, edgeGeo, yCursor);
                        edgeGeo.dispose();
                    }
                }
            }

            const corniceCfg = layer.cornice ?? null;
            if (corniceCfg?.enabled) {
                const corniceHeights = resolveCorniceHeights(corniceCfg);
                const corniceProjection = clamp(corniceCfg.projection, 0.02, 1.5);
                const hasParapetRing = ringEnabled && ringHeight > EPS;
                // The crown wraps the parapet body, so its profile projects from the
                // ring's outer face, not from the wall plane behind it.
                const corniceBaseOutset = hasParapetRing ? outerRadius : 0.0;
                const corniceLayerMaterial = lastFloorLayer?.material ?? null;
                const corniceLayerWallBase = lastFloorLayer?.wallBase ?? null;
                const corniceLayerTiling = lastFloorLayer?.tiling ?? null;
                const corniceMat = makeCorniceMaterialFromSpec({
                    material: corniceCfg.material,
                    tiling: corniceCfg.tiling ?? null,
                    layerMaterial: corniceLayerMaterial,
                    layerWallBase: corniceLayerWallBase,
                    layerTiling: corniceLayerTiling,
                    baseColorHex,
                    textureCache
                });
                const corniceOrnamentType = corniceCfg?.ornament?.type ?? 'none';
                const corniceOrnamentMat = (corniceOrnamentType !== 'none' && corniceHeights.ornament > EPS)
                    ? makeCorniceMaterialFromSpec({
                        material: corniceCfg.ornament?.material ?? corniceCfg.material,
                        tiling: corniceCfg.tiling ?? null,
                        layerMaterial: corniceLayerMaterial,
                        layerWallBase: corniceLayerWallBase,
                        layerTiling: corniceLayerTiling,
                        baseColorHex,
                        textureCache
                    })
                    : null;
                const corniceCrossSection = resolveCorniceCrossSection({
                    profile: corniceCfg.profile,
                    heightMeters: corniceHeights.profile,
                    projectionMeters: corniceProjection,
                    baseOutset: corniceBaseOutset
                });

                const copingCfg = corniceCfg?.parapet?.coping ?? null;
                const steppedCfg = corniceCfg?.parapet?.stepped ?? null;
                const copingEnabled = !!copingCfg?.enabled;
                const copingHeight = copingEnabled ? clamp(copingCfg.height, 0.02, 0.5) : 0.0;
                const copingOverhang = copingEnabled ? clamp(copingCfg.overhang, 0.0, 0.4) : 0.0;
                const copingMat = copingEnabled ? makeCorniceMaterialFromSpec({
                    material: copingCfg?.material ?? corniceCfg.material,
                    tiling: corniceCfg.tiling ?? null,
                    layerMaterial: corniceLayerMaterial,
                    layerWallBase: corniceLayerWallBase,
                    layerTiling: corniceLayerTiling,
                    baseColorHex,
                    textureCache
                }) : null;
                const steppedEnabled = !!steppedCfg?.enabled && hasParapetRing;
                const steppedRaise = steppedEnabled ? clamp(steppedCfg.raise, 0.05, 2.0) : 0.0;
                const steppedBlockWidth = steppedEnabled ? clamp(steppedCfg.blockWidth, 0.2, 4.0) : 0.0;
                const parapetBlockMat = steppedEnabled ? makeCorniceMaterialFromSpec({
                    material: ring?.material ?? null,
                    tiling: ring?.tiling ?? null,
                    layerMaterial: corniceLayerMaterial,
                    layerWallBase: corniceLayerWallBase,
                    layerTiling: corniceLayerTiling,
                    baseColorHex,
                    textureCache
                }) : null;

                for (const rawLoop of roofOuter) {
                    if (!rawLoop || rawLoop.length < 3) continue;
                    const outerLoop = signedArea(rawLoop) < 0 ? rawLoop.slice().reverse() : rawLoop;

                    const profileGeo = buildCorniceLoftGeometryFromLoop({
                        loop: outerLoop,
                        crossSection: corniceCrossSection,
                        yBase: yCursor + corniceHeights.ornament
                    });
                    if (profileGeo) {
                        const mesh = new THREE.Mesh(profileGeo, corniceMat);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        mesh.userData = mesh.userData ?? {};
                        mesh.userData.buildingFab2Role = 'cornice';
                        mesh.userData.corniceProfile = corniceCfg.profile;
                        roofRingGroup.add(mesh);

                        if (showWire) {
                            const edgeGeo = new THREE.EdgesGeometry(profileGeo, 1);
                            appendWirePositions(wirePositions, edgeGeo, 0);
                            edgeGeo.dispose();
                        }
                    }

                    if (corniceOrnamentMat) {
                        const ornamentGeo = buildCorniceOrnamentGeometryFromLoop({
                            loop: outerLoop,
                            ornament: { ...corniceCfg.ornament, height: corniceHeights.ornament },
                            baseOutset: corniceBaseOutset,
                            yBase: yCursor
                        });
                        if (ornamentGeo) {
                            const mesh = new THREE.Mesh(ornamentGeo, corniceOrnamentMat);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.userData = mesh.userData ?? {};
                            mesh.userData.buildingFab2Role = 'cornice_ornament';
                            mesh.userData.corniceOrnament = corniceOrnamentType;
                            roofRingGroup.add(mesh);
                        }
                    }

                    if (steppedEnabled) {
                        const parapetThickness = outerRadius + innerRadius;
                        const cornerSize = Math.max(steppedBlockWidth, parapetThickness + 0.12);
                        const centerDepth = parapetThickness + 0.12;
                        const blockHeight = ringHeight + steppedRaise;
                        const centerOffset = (outerRadius - innerRadius) * 0.5;
                        const centeredLoop = Math.abs(centerOffset) > EPS
                            ? offsetOrthogonalLoopXZ(outerLoop, -centerOffset)
                            : outerLoop;
                        const runs = buildExteriorRunsFromLoop(centeredLoop);

                        const pushParapetBlock = ({ cx, cz, tx, tz, alongMeters, acrossMeters }) => {
                            const nx = tz;
                            const nz = -tx;
                            const halfW = alongMeters * 0.5;
                            const halfD = acrossMeters * 0.5;
                            const corners = [
                                { x: cx + tx * halfW + nx * halfD, z: cz + tz * halfW + nz * halfD },
                                { x: cx - tx * halfW + nx * halfD, z: cz - tz * halfW + nz * halfD },
                                { x: cx - tx * halfW - nx * halfD, z: cz - tz * halfW - nz * halfD },
                                { x: cx + tx * halfW - nx * halfD, z: cz + tz * halfW - nz * halfD }
                            ];
                            const planLoop = signedArea(corners) < 0 ? corners.slice().reverse() : corners;

                            const emitBox = ({ loop, height, y, material, role }) => {
                                const shape = buildShapeFromLoops({ outerLoop: loop, holeLoops: [] });
                                const geo = new THREE.ExtrudeGeometry(shape, {
                                    depth: height,
                                    bevelEnabled: false,
                                    steps: 1
                                });
                                geo.rotateX(-Math.PI / 2);
                                geo.computeVertexNormals();
                                const mesh = new THREE.Mesh(geo, material);
                                mesh.castShadow = true;
                                mesh.receiveShadow = true;
                                mesh.position.y = y;
                                mesh.userData = mesh.userData ?? {};
                                mesh.userData.buildingFab2Role = role;
                                roofRingGroup.add(mesh);

                                if (showWire) {
                                    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                    appendWirePositions(wirePositions, edgeGeo, y);
                                    edgeGeo.dispose();
                                }
                            };

                            emitBox({
                                loop: planLoop,
                                height: blockHeight,
                                y: yCursor,
                                material: parapetBlockMat,
                                role: 'parapet_block'
                            });

                            if (copingEnabled && copingMat) {
                                const capCorners = [
                                    { x: cx + tx * (halfW + copingOverhang) + nx * (halfD + copingOverhang), z: cz + tz * (halfW + copingOverhang) + nz * (halfD + copingOverhang) },
                                    { x: cx - tx * (halfW + copingOverhang) + nx * (halfD + copingOverhang), z: cz - tz * (halfW + copingOverhang) + nz * (halfD + copingOverhang) },
                                    { x: cx - tx * (halfW + copingOverhang) - nx * (halfD + copingOverhang), z: cz - tz * (halfW + copingOverhang) - nz * (halfD + copingOverhang) },
                                    { x: cx + tx * (halfW + copingOverhang) - nx * (halfD + copingOverhang), z: cz + tz * (halfW + copingOverhang) - nz * (halfD + copingOverhang) }
                                ];
                                const capLoop = signedArea(capCorners) < 0 ? capCorners.slice().reverse() : capCorners;
                                emitBox({
                                    loop: capLoop,
                                    height: copingHeight,
                                    y: yCursor + blockHeight,
                                    material: copingMat,
                                    role: 'parapet_block_coping'
                                });
                            }
                        };

                        for (const run of runs) {
                            const runLength = Number(run?.length) || 0;
                            if (!(runLength > EPS)) continue;
                            pushParapetBlock({
                                cx: run.a.x,
                                cz: run.a.z,
                                tx: run.dir.x,
                                tz: run.dir.z,
                                alongMeters: cornerSize,
                                acrossMeters: cornerSize
                            });

                            if (steppedCfg?.mode === 'corners_and_centers' && runLength > steppedBlockWidth + cornerSize * 2) {
                                pushParapetBlock({
                                    cx: run.a.x + run.dir.x * runLength * 0.5,
                                    cz: run.a.z + run.dir.z * runLength * 0.5,
                                    tx: run.dir.x,
                                    tz: run.dir.z,
                                    alongMeters: steppedBlockWidth,
                                    acrossMeters: centerDepth
                                });
                            }
                        }
                    }

                    if (copingEnabled && copingMat) {
                        const copingTopBase = hasParapetRing ? ringHeight : corniceHeights.total;
                        const copingOuterOffset = hasParapetRing
                            ? outerRadius + copingOverhang
                            : corniceProjection + copingOverhang;
                        const copingInnerInset = hasParapetRing
                            ? innerRadius + copingOverhang
                            : CORNICE_BURIAL_METERS + copingOverhang;
                        const copingOuterLoop = offsetOrthogonalLoopXZ(outerLoop, -copingOuterOffset);
                        const copingInnerLoop = offsetOrthogonalLoopXZ(outerLoop, copingInnerInset);
                        if (copingOuterLoop?.length >= 3 && copingInnerLoop?.length >= 3) {
                            const shape = buildShapeFromLoops({ outerLoop: copingOuterLoop, holeLoops: [copingInnerLoop] });
                            const geo = new THREE.ExtrudeGeometry(shape, {
                                depth: copingHeight,
                                bevelEnabled: false,
                                steps: 1
                            });
                            geo.rotateX(-Math.PI / 2);
                            geo.computeVertexNormals();
                            const mesh = new THREE.Mesh(geo, copingMat);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            mesh.position.y = yCursor + copingTopBase;
                            mesh.userData = mesh.userData ?? {};
                            mesh.userData.buildingFab2Role = 'parapet_coping';
                            roofRingGroup.add(mesh);

                            if (showWire) {
                                const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                                appendWirePositions(wirePositions, edgeGeo, mesh.position.y);
                                edgeGeo.dispose();
                            }
                        }
                    }
                }
            }

            const nextLayer = safeLayers[layerIndex + 1] ?? null;
            const hasFloorsAboveRoof = nextLayer?.type === LAYER_TYPE.FLOOR;
            if (!hasFloorsAboveRoof) yCursor += resolveRoofLayerTopExtraHeight(layer);
        }
    }

    const lastLayer = safeLayers[safeLayers.length - 1] ?? null;
    if (lastLayer?.type !== LAYER_TYPE.ROOF) {
        const topFloorLayer = [...safeLayers].reverse().find((layer) => layer?.type === LAYER_TYPE.FLOOR) ?? null;
        const roofMaterial = topFloorLayer?.material ?? null;
        const roofMat = makeRoofSurfaceMaterialFromSpec({
            material: roofMaterial,
            baseColorHex,
            textureCache
        });

        const { outer: roofWallOuterRaw, holes: roofWallHoles } = applyWallInset({ loops: currentLoops, inset: wallInset });
        const roofWallOuter = applyEdgeBevelToOuterLoops(roofWallOuterRaw);

        let roofOuter = roofWallOuter;
        let roofHoles = roofWallHoles;
        let roofSurfaceOuter = roofOuter;
        const roofSourceLayerId = typeof topFloorLayer?.id === 'string' ? topFloorLayer.id : '';
        const roofFacadeSpec = globalFacadeSpec
            ? globalFacadeSpec
            : ((roofSourceLayerId && facadesByLayerId?.[roofSourceLayerId] && typeof facadesByLayerId[roofSourceLayerId] === 'object')
                ? facadesByLayerId[roofSourceLayerId]
                : null);
        const wantsRoofFacadeSilhouette = !!roofFacadeSpec && facadeSpecFaceIds(roofFacadeSpec).length > 0;

        if (wantsRoofFacadeSilhouette && roofWallOuter.length) {
            const main = roofWallOuter[0] ?? null;
            const frames = main ? computeFacadeFramesFromLoop(main, { warnings }) : null;
            if (frames) {
                const links = topFloorLayer?.faceLinking?.links && typeof topFloorLayer.faceLinking.links === 'object'
                    ? topFloorLayer.faceLinking.links
                    : null;
                const reverseByFace = topFloorLayer?.faceLinking?.reverseByFace
                    && typeof topFloorLayer.faceLinking.reverseByFace === 'object'
                    ? topFloorLayer.faceLinking.reverseByFace
                    : null;
                const resolveMasterFaceId = (faceId) => {
                    const seen = new Set();
                    let cur = faceId;
                    for (let i = 0; i < 8; i++) {
                        if (seen.has(cur)) break;
                        seen.add(cur);
                        const next = links?.[cur] ?? null;
                        if (next === null || next === undefined) return cur;
                        if (next === cur) return cur;
                        cur = next;
                    }
                    return faceId;
                };

                const next = {};
                for (const faceId of facadeFaceIdsOf(frames)) {
                    const masterFaceId = resolveMasterFaceId(faceId);
                    const srcFacade = (roofFacadeSpec?.[masterFaceId] && typeof roofFacadeSpec[masterFaceId] === 'object')
                        ? roofFacadeSpec[masterFaceId]
                        : null;
                    if (!srcFacade) continue;

                    const srcLayout = srcFacade?.layout && typeof srcFacade.layout === 'object' ? srcFacade.layout : null;
                    const len = Number(frames?.[faceId]?.length) || 0;

                    const bays = Array.isArray(srcLayout?.bays?.items) ? srcLayout.bays.items : null;
                    const groups = Array.isArray(srcLayout?.groups?.items) ? srcLayout.groups.items : null;
                    const hasBays = !!bays && bays.length > 0;
                    const baysForSolve = hasBays
                        ? resolveLinkedFaceBaysForSolve({ bays, faceId, masterFaceId, reverseByFace })
                        : null;
                    const bayItems = hasBays
                        ? solveFacadeBaysLayout({
                            bays: baysForSolve,
                            groups,
                            faceLengthMeters: len,
                            topology: facadeBayTopologyByKey.get(facadeBayLockKey(topFloorLayer, faceId, srcLayout, frames?.[faceId] ?? null) ?? '') ?? null,
                            warnings
                        })
                        : null;

                    let solvedPatternItems = null;
                    if (!hasBays) {
                        const pattern = srcLayout?.pattern ?? null;
                        if (pattern && typeof pattern === 'object') {
                            const topology = facadePatternTopologyByFaceId.get(masterFaceId) ?? null;
                            const solved = solveFacadeLayoutFillPattern({
                                pattern,
                                faceLengthMeters: len,
                                topology: globalFacadeSpec ? topology : null,
                                warnings
                            });
                            solvedPatternItems = Array.isArray(solved?.items) ? solved.items : null;
                        }
                    }

                    const base = { ...srcFacade };
                    const layout = (base.layout && typeof base.layout === 'object') ? { ...base.layout } : {};
                    if (Array.isArray(bayItems)) layout.items = bayItems;
                    else if (Array.isArray(solvedPatternItems)) layout.items = solvedPatternItems;
                    base.layout = layout;

                    next[faceId] = base;
                }

                const res = computeQuadFacadeSilhouette({
                    wallOuter: roofWallOuter,
                    facades: next,
                    layerMaterial: null,
                    bayBoundaryConnections: lastFloorLayer?.bayBoundaryConnections ?? null,
                    warnings,
                    cornerStrategy: resolvedCornerStrategy,
                    edgeBevel: edgeBevelCfg
                });
                if (res?.loop?.length) {
                    roofOuter = [res.loop];
                    const depthMins = res?.depthMinsByFaceId ?? null;
                    if (depthMins) {
                        const coreLoop = buildCornerJoinLoopWithDepths({
                            frames,
                            depthOf: (faceId) => depthMins[faceId] ?? 0
                        });
                        const area = signedArea(coreLoop);
                        roofSurfaceOuter = [area < 0 ? coreLoop.slice().reverse() : coreLoop];
                    }
                } else {
                    warnings.push('Roof silhouette: falling back to inset wall loop.');
                }
            }
        }

        for (const outerLoop of roofSurfaceOuter) {
            if (!outerLoop || outerLoop.length < 3) continue;
            const shape = buildShapeFromLoops({ outerLoop, holeLoops: roofHoles });
            const geo = new THREE.ShapeGeometry(shape);
            geo.rotateX(-Math.PI / 2);
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, roofMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = yCursor + 0.002;
            mesh.userData = mesh.userData ?? {};
            mesh.userData.buildingFab2Role = 'roof';
            mesh.userData.buildingFab2RoofKind = 'surface';
            solidMeshes.push(mesh);

            if (showWire) {
                const edgeGeo = new THREE.EdgesGeometry(geo, 1);
                appendWirePositions(wirePositions, edgeGeo, mesh.position.y);
                edgeGeo.dispose();
            }
        }
    }

    const wallDecorationMeshes = buildGameplayWallDecorationMeshes({
        wallDecorations: resolvedWallDecorations,
        bayHighlightDataByLayerId,
        facadeSurfaceRunsByLayerId,
        floorSegmentsByLayerId,
        floorLayerById,
        facadesByLayerId,
        globalFacadeSpec,
        baseColorHex,
        textureCache
    });
    for (const mesh of wallDecorationMeshes) solidMeshes.push(mesh);

    if (instancedBuckets.size) {
        const dummy = new THREE.Object3D();
        // Map insertion follows deterministic fabrication traversal. UUIDs are
        // process-random and cannot define stable source-object ordering.
        const orderedBuckets = Array.from(instancedBuckets.values());
        for (const bucket of orderedBuckets) {
            const transforms = bucket.transforms;
            const count = Math.floor(transforms.length / 4);
            if (!count) continue;

            const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.renderOrder = bucket.renderOrder;
            if (bucket.material?.userData?.buildingWindowGlass === true) {
                mesh.visible = bucket.material.userData.buildingWindowGlassEnabled !== false;
            }
            mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

            for (let i = 0; i < count; i++) {
                const idx = i * 4;
                dummy.position.set(transforms[idx], transforms[idx + 1], transforms[idx + 2]);
                dummy.rotation.set(0, transforms[idx + 3], 0);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            windowsGroup.add(mesh);
        }
    }

    let wire = null;
    if (showWire && wirePositions.length) {
        const wireGeo = new LineSegmentsGeometry();
        wireGeo.setPositions(wirePositions);
        const wireMat = createLineMaterial({
            renderer,
            color: lineColor,
            linewidth: 4,
            opacity: 0.98,
            renderOrder: 120
        });

        wire = new LineSegments2(wireGeo, wireMat);
        wire.renderOrder = 120;
        wire.frustumCulled = false;
    }

    let plan = null;
    if (showPlan) {
        const planPositions = [];
        appendLoopLinePositions(planPositions, overlayLoops, planY);
        if (planPositions.length) {
            const planGeo = new LineSegmentsGeometry();
            planGeo.setPositions(planPositions);
            const planMat = createLineMaterial({
                renderer,
                color: lineColor,
                linewidth: 4,
                opacity: 1.0,
                renderOrder: 140
            });

            plan = new LineSegments2(planGeo, planMat);
            plan.renderOrder = 140;
            plan.frustumCulled = false;
        }
    }

    let border = null;
    if (showBorder) {
        const borderPositions = [];
        appendLoopLinePositions(borderPositions, overlayLoops, planY + 0.02);
        if (borderPositions.length) {
            const borderGeo = new LineSegmentsGeometry();
            borderGeo.setPositions(borderPositions);
            const borderMat = createLineMaterial({
                renderer,
                color: borderColor,
                linewidth: 6,
                opacity: 0.98,
                renderOrder: 160
            });

            border = new LineSegments2(borderGeo, borderMat);
            border.renderOrder = 160;
            border.frustumCulled = false;
        }
    }

    let floorDivisions = null;
    if (showFloors && floorPositions.length) {
        const floorsGeo = new LineSegmentsGeometry();
        floorsGeo.setPositions(floorPositions);
        const floorsMat = createLineMaterial({
            renderer,
            color: lineColor,
            linewidth: 3,
            opacity: 0.72,
            renderOrder: 130
        });

        floorDivisions = new LineSegments2(floorsGeo, floorsMat);
        floorDivisions.renderOrder = 130;
        floorDivisions.frustumCulled = false;
    }

    // AI 490: merge the scattered AC units — one mesh per attachment item so
    // the geometry merger sees a single material bucket.
    for (const [acItemIndex, acGeos] of acUnitGeosByItemIndex) {
        if (!acGeos.length) continue;
        const acItem = acAttachmentItems[acItemIndex];
        const merged = acGeos.length === 1 ? acGeos[0] : mergeGeometries(acGeos, false);
        if (acGeos.length > 1) for (const g of acGeos) g.dispose();
        if (!merged || !acItem) continue;
        const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
            color: acItem.colorHex,
            roughness: acItem.roughness,
            metalness: acItem.metalness
        }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = mesh.userData ?? {};
        mesh.userData.buildingFab2Role = 'attachment_ac_unit';
        mesh.userData.acAttachmentId = acItem.id;
        mesh.userData.acUnitCount = acGeos.length;
        beltsGroup.add(mesh);
    }

    return {
        baseColorHex,
        solidMeshes,
        placedFootprintLoops: sourceFootprintLoops,
        warnings: warnings.length ? warnings.slice() : null,
        facadeSolverDebug: Object.keys(facadeSolverDebug).length ? facadeSolverDebug : null,
        facadeCornerDebug: facadeCornerDebugByLayerId && Object.keys(facadeCornerDebugByLayerId).length ? facadeCornerDebugByLayerId : null,
        // AI 499: main-corner bevel facets, so a later facade-angle model can
        // attach layout semantics to a wide corner facet without re-deriving
        // the geometry. Micro edge bevels emit no frames.
        edgeBevelCornerFacets: Object.keys(edgeBevelFacetsByCornerId).length ? { ...edgeBevelFacetsByCornerId } : null,
        bayHighlightDataByLayerId: Object.keys(bayHighlightDataByLayerId).length ? bayHighlightDataByLayerId : null,
        facadeFaceLinesByLayerId: Object.keys(facadeFaceLinesByLayerId).length ? facadeFaceLinesByLayerId : null,
        wire,
        plan,
        border,
        floorDivisions,
        windows: windowsGroup.children.length ? windowsGroup : null,
        beltCourse: beltsGroup.children.length ? beltsGroup : null,
        topBelt: roofRingGroup.children.length ? roofRingGroup : null
    };
}

export const __testOnly = Object.freeze({
    buildExteriorRunsFromLoop,
    computeQuadFacadeFramesFromLoop,
    computeFacadeFramesFromLoop,
    sampleFacadeFrameAtU,
    pointOnFacadeFrame,
    resolveFacadeStripOpeningPose,
    isSimplePlanLoopXZ,
    buildOpenPolylineStripLoopXZ,
    resolveBalconyContinuityAdjacency,
    orderBalconyContinuityComponent,
    cornerJoinPairWithDepths,
    buildCornerJoinLoopWithDepths,
    buildInteriorShellLoopDetailWithDepths,
    computeQuadFacadeSilhouette,
    buildWallSidesGeometryFromLoopDetailXZ,
    segmentOverOpeningRange,
    projectFacadeCutoutOntoShell,
    normalizeFacadeLetteringItems,
    resolvePortalLevelGeometry,
    resolveOpeningInsetContours,
    resolveOpeningCutMetrics,
    shouldReverseLinkedFaceBayOrder,
    resolveLinkedFaceBaysForSolve,
    resolveStorefrontZoneLayout,
    makeStorefrontZoneSettings,
    estimatePortalAndStorefrontOutwardReserveMeters,
    estimateBalconyOutwardReserveMeters,
    makeBalconyBracketGeometry
});
