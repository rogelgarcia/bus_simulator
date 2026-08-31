// Defines the immutable AI 527/AI 531 illumination validation case inventory.
// @ts-check

/** @typedef {'AI_527'|'AI_531'} IlluminationValidationAiOwner */
/** @typedef {'lab'|'gameplay_named_pose'|'profiler_pose'|'low_sun_pose'} IlluminationValidationCaseKind */

export const AI527_REGIONAL_CAMERA_PROFILE = freezeDeep({
    fovDeg: 55,
    heightMeters: 3.6831812722,
    id: 'ai527.regional_camera.v1',
    pitchDeg: -9.673
});

export const AI527_CARDINAL_VIEW_VECTORS = freezeDeep([
    { id: 'N', x: 0, z: -1 },
    { id: 'E', x: 1, z: 0 },
    { id: 'S', x: 0, z: 1 },
    { id: 'W', x: -1, z: 0 }
]);

export const AI527_BIGCITY2_MAP_PROFILE = freezeDeep({
    heightTiles: 25,
    id: 'bigcity2.ai527.v1',
    originMeters: { x: -288, z: -288 },
    sourceHashSlot: 'resolvedSourceSha256',
    tileSizeMeters: 24,
    widthTiles: 25
});

const LAB_SOURCE_HASH_SLOT = 'labSceneRevisionSha256';
const BIGCITY2_SOURCE_HASH_SLOT = AI527_BIGCITY2_MAP_PROFILE.sourceHashSlot;
const DEFAULT_SUN = sunProfile(45, 35);
const LOW_SUN = sunProfile(135, 8);

const PROFILER_REGIONS = freezeDeep([
    ['R1C1', 1, 1, 4, 3],
    ['R1C2', 1, 2, 7, 3],
    ['R1C3', 1, 3, 12, 3],
    ['R1C4', 1, 4, 17, 1],
    ['R1C5', 1, 5, 22, 1],
    ['R2C1', 2, 1, 3, 8],
    ['R2C2', 2, 2, 7, 6],
    ['R2C3', 2, 3, 12, 6],
    ['R2C4', 2, 4, 17, 6],
    ['R2C5', 2, 5, 23, 7],
    ['R3C1', 3, 1, 2, 12],
    ['R3C2', 3, 2, 7, 12],
    ['R3C3', 3, 3, 12, 14],
    ['R3C4', 3, 4, 15, 12],
    ['R3C5', 3, 5, 23, 12],
    ['R4C1', 4, 1, 2, 17],
    ['R4C2', 4, 2, 7, 17],
    ['R4C3', 4, 3, 12, 17],
    ['R4C4', 4, 4, 17, 17],
    ['R4C5', 4, 5, 21, 17],
    ['R5C1', 5, 1, 2, 21],
    ['R5C2', 5, 2, 7, 21],
    ['R5C3', 5, 3, 12, 21],
    ['R5C4', 5, 4, 17, 24],
    ['R5C5', 5, 5, 21, 22]
].map(([id, row, column, x, y]) => createRegion(String(id), Number(row), Number(column), Number(x), Number(y))));

const REGIONAL_CASES = freezeDeep([
    {
        baseCaseId: 'illum.game.regional_open',
        coverageTags: ['open_roof_horizon', 'road', 'static_shadow_workload'],
        key: 'open',
        regionId: 'R1C3'
    },
    {
        baseCaseId: 'illum.game.regional_center',
        coverageTags: ['intersection', 'mixed_roads_trees_walls', 'static_shadow_workload'],
        key: 'center',
        regionId: 'R3C3'
    },
    {
        baseCaseId: 'illum.game.regional_dense',
        coverageTags: ['dense_southern_geometry', 'high_shadow_workload', 'road'],
        key: 'dense',
        regionId: 'R5C2'
    }
]);

export const ILLUMINATION_LAB_VALIDATION_CASES = canonicalCases([
    labCase({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.lab.overview_default',
        cameraPresetId: 'overview',
        coverageTags: ['global_balance', 'roofs', 'streets', 'vertical_facades'],
        id: 'illum.lab.overview_default',
        sun: DEFAULT_SUN
    }),
    labCase({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.lab.road_wall_default',
        cameraPresetId: 'near_road',
        coverageTags: ['asphalt', 'contact_contrast', 'curb', 'wall_base'],
        id: 'illum.lab.road_wall_default',
        sun: DEFAULT_SUN
    }),
    labCase({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.lab.bus_grounding_default',
        cameraPresetId: 'bus_follow',
        coverageTags: ['bus_ground_contact', 'bus_self_shadow'],
        id: 'illum.lab.bus_grounding_default',
        sun: DEFAULT_SUN
    }),
    labCase({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.lab.corner_low_sun',
        cameraPresetId: 'corner_detail',
        coverageTags: ['curb', 'long_shadow', 'road', 'vertical_receiver'],
        id: 'illum.lab.corner_low_sun',
        sun: LOW_SUN
    }),
    labCase({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.lab.foliage_alpha_backlight',
        cameraPresetId: 'crossing_bus_right_wide',
        coverageTags: ['alpha_cutout_silhouette', 'foliage', 'transmitted_gaps'],
        fixtureId: 'lab_scene_standard_trees_v1',
        id: 'illum.lab.foliage_alpha_backlight',
        sun: sunProfile(225, 12)
    }),
    labCase({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.lab.glass_reflection_control',
        cameraPresetId: 'building_glass',
        coverageTags: ['direct_visibility_control', 'emissive_control', 'ibl_control', 'reflection_control'],
        id: 'illum.lab.glass_reflection_control',
        sun: DEFAULT_SUN
    }),
    labCase({
        aiOwner: 'AI_531',
        baseCaseId: 'illum.lab.overhang_receiver_fixture',
        cameraPresetId: 'overhang_receiver_fixture',
        coverageTags: ['road', 'roof', 'underside_overhang', 'wall'],
        fixtureId: 'illumination_overhang_receiver_v1',
        id: 'illum.lab.overhang_receiver_fixture.az045_el35',
        sun: DEFAULT_SUN
    }),
    labCase({
        aiOwner: 'AI_531',
        baseCaseId: 'illum.lab.overhang_receiver_fixture',
        cameraPresetId: 'overhang_receiver_fixture',
        coverageTags: ['long_shadow', 'road', 'roof', 'underside_overhang', 'wall'],
        fixtureId: 'illumination_overhang_receiver_v1',
        id: 'illum.lab.overhang_receiver_fixture.az135_el08',
        sun: LOW_SUN
    })
]);

export const ILLUMINATION_PROFILER_VALIDATION_CASES = canonicalCases(
    PROFILER_REGIONS.flatMap((region) => {
        const regional = REGIONAL_CASES.find((entry) => entry.regionId === region.id);
        return AI527_CARDINAL_VIEW_VECTORS.map((direction) => caseRecord({
            aiOwner: 'AI_527',
            baseCaseId: regional?.baseCaseId ?? 'illum.profiler.regional_grid',
            camera: regionalCamera(direction),
            cityId: 'bigcity2',
            coverageTags: profilerCoverageTags(region),
            id: `illum.profiler.${region.id.toLowerCase()}.${direction.id.toLowerCase()}`,
            kind: 'profiler_pose',
            labScenarioId: null,
            mapCell: region.mapCell,
            namedPoseId: null,
            profilerRegion: region,
            sourceHashSlot: BIGCITY2_SOURCE_HASH_SLOT,
            sunProfile: DEFAULT_SUN,
            worldCoordinatesMeters: region.worldCoordinatesMeters
        }));
    })
);

export const ILLUMINATION_CIVIC_VALIDATION_CASES = canonicalCases([
    caseRecord({
        aiOwner: 'AI_527',
        baseCaseId: 'illum.game.civic_curve_front',
        camera: freezeDeep({
            fovDeg: 55,
            kind: 'gameplay_named_pose',
            namedPoseId: 'civic_center_curve_front',
            profileId: 'gameplay_named_pose_v1'
        }),
        cityId: 'bigcity2',
        coverageTags: ['bus_front_material', 'facade', 'intersection', 'road_shadow'],
        id: 'illum.game.civic_curve_front',
        kind: 'gameplay_named_pose',
        labScenarioId: null,
        mapCell: null,
        namedPoseId: 'civic_center_curve_front',
        profilerRegion: null,
        sourceHashSlot: BIGCITY2_SOURCE_HASH_SLOT,
        sunProfile: DEFAULT_SUN,
        worldCoordinatesMeters: null
    })
]);

export const ILLUMINATION_LOW_SUN_VALIDATION_CASES = canonicalCases(
    REGIONAL_CASES.flatMap((regional) => {
        const region = requireRegion(regional.regionId);
        return AI527_CARDINAL_VIEW_VECTORS.flatMap((direction) => (
            [45, 135, 225, 315].flatMap((azimuthDeg) => [8, 35].map((elevationDeg) => caseRecord({
                aiOwner: 'AI_531',
                baseCaseId: 'illum.game.low_sun_matrix',
                camera: regionalCamera(direction),
                cityId: 'bigcity2',
                coverageTags: [
                    ...regional.coverageTags,
                    elevationDeg === 8 ? 'low_sun' : 'high_sun_control',
                    'low_sun_matrix',
                    ...(elevationDeg === 8 ? ['long_shadow'] : [])
                ],
                id: `illum.game.low_sun_matrix.regional_${regional.key}.${direction.id.toLowerCase()}.az${pad3(azimuthDeg)}.el${pad2(elevationDeg)}`,
                kind: 'low_sun_pose',
                labScenarioId: null,
                mapCell: region.mapCell,
                namedPoseId: null,
                profilerRegion: region,
                sourceHashSlot: BIGCITY2_SOURCE_HASH_SLOT,
                sunProfile: sunProfile(azimuthDeg, elevationDeg),
                worldCoordinatesMeters: region.worldCoordinatesMeters
            })))
        ));
    })
);

export const ILLUMINATION_VALIDATION_CASES = canonicalCases([
    ...ILLUMINATION_LAB_VALIDATION_CASES,
    ...ILLUMINATION_PROFILER_VALIDATION_CASES,
    ...ILLUMINATION_CIVIC_VALIDATION_CASES,
    ...ILLUMINATION_LOW_SUN_VALIDATION_CASES
]);

export const ILLUMINATION_VALIDATION_CASE_BY_ID = Object.freeze(Object.fromEntries(
    ILLUMINATION_VALIDATION_CASES.map((entry) => [entry.id, entry])
));

/**
 * Returns an immutable validation case by exact canonical ID.
 * @param {string} id
 * @returns {Readonly<Record<string, any>>|null}
 */
export function getIlluminationValidationCase(id) {
    if (typeof id !== 'string' || id.trim() !== id || !id) return null;
    return ILLUMINATION_VALIDATION_CASE_BY_ID[id] ?? null;
}

/** @param {{aiOwner: IlluminationValidationAiOwner, baseCaseId: string, cameraPresetId: string, coverageTags: string[], fixtureId?: string, id: string, sun: any}} options */
function labCase(options) {
    const fixtureId = options.fixtureId ?? 'lab_scene_standard_v1';
    return caseRecord({
        aiOwner: options.aiOwner,
        baseCaseId: options.baseCaseId,
        camera: freezeDeep({
            fixtureId,
            kind: 'lab_preset',
            presetId: options.cameraPresetId,
            profileId: 'lab_scene_camera_preset_v1'
        }),
        cityId: 'lab_scene',
        coverageTags: options.coverageTags,
        id: options.id,
        kind: 'lab',
        labScenarioId: fixtureId,
        mapCell: null,
        namedPoseId: null,
        profilerRegion: null,
        sourceHashSlot: LAB_SOURCE_HASH_SLOT,
        sunProfile: options.sun,
        worldCoordinatesMeters: null
    });
}

/** @param {Readonly<Record<string, any>>} direction */
function regionalCamera(direction) {
    return freezeDeep({
        kind: 'regional_cardinal',
        profile: AI527_REGIONAL_CAMERA_PROFILE,
        viewVector: direction
    });
}

/** @param {Readonly<Record<string, any>>} region */
function profilerCoverageTags(region) {
    const tags = ['profiler_baseline', 'road', 'static_shadow_workload'];
    if (region.row === 1 || region.row === 5 || region.column === 1 || region.column === 5) tags.push('city_edge');
    const regional = REGIONAL_CASES.find((entry) => entry.regionId === region.id);
    if (regional) tags.push(...regional.coverageTags, `regional_${regional.key}`);
    return tags;
}

/** @param {string} id @param {number} row @param {number} column @param {number} x @param {number} y */
function createRegion(id, row, column, x, y) {
    const minX = (column - 1) * 5;
    const minY = (row - 1) * 5;
    return freezeDeep({
        bounds: { maxX: minX + 4, maxY: minY + 4, minX, minY },
        column,
        id,
        mapCell: { authority: 'authoritative', x, y },
        row,
        worldCoordinatesMeters: {
            authority: 'derived_from_bigcity2_origin_and_tile_size_v1',
            x: AI527_BIGCITY2_MAP_PROFILE.originMeters.x + x * AI527_BIGCITY2_MAP_PROFILE.tileSizeMeters,
            z: AI527_BIGCITY2_MAP_PROFILE.originMeters.z + y * AI527_BIGCITY2_MAP_PROFILE.tileSizeMeters
        }
    });
}

/** @param {string} id */
function requireRegion(id) {
    const region = PROFILER_REGIONS.find((entry) => entry.id === id);
    if (!region) throw new Error(`Unknown fixed illumination profiler region '${id}'`);
    return region;
}

/** @param {number} azimuthDeg @param {number} elevationDeg */
function sunProfile(azimuthDeg, elevationDeg) {
    return freezeDeep({
        azimuthDeg,
        elevationDeg,
        id: `ai527.sun.az${pad3(azimuthDeg)}.el${pad2(elevationDeg)}`
    });
}

/** @param {Record<string, any>} value */
function caseRecord(value) {
    return freezeDeep({
        ...value,
        coverageTags: [...new Set(value.coverageTags)].sort(compareStrings)
    });
}

/** @param {Record<string, any>[]} values */
function canonicalCases(values) {
    const sorted = [...values].sort((left, right) => compareStrings(left.id, right.id));
    const ids = new Set();
    for (const entry of sorted) {
        if (ids.has(entry.id)) throw new Error(`Duplicate illumination validation case ID '${entry.id}'`);
        ids.add(entry.id);
    }
    return Object.freeze(sorted);
}

/** @param {number} value */
function pad2(value) {
    return String(value).padStart(2, '0');
}

/** @param {number} value */
function pad3(value) {
    return String(value).padStart(3, '0');
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
    return left === right ? 0 : (left < right ? -1 : 1);
}

/** @template T @param {T} value @returns {Readonly<T>} */
function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return /** @type {Readonly<T>} */ (value);
    for (const entry of Object.values(value)) freezeDeep(entry);
    return /** @type {Readonly<T>} */ (Object.freeze(value));
}
