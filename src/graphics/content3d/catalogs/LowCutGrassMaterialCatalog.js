// Versioned natural-grass material families authored and reviewed in the Grass Lab.

export const LOW_CUT_GRASS_V1_MATERIAL_ID = 'pbr.grass_low_cut_maintained_v1';
export const LOW_CUT_GRASS_MATERIAL_ID = 'pbr.grass_low_cut_maintained_v2';
export const LOW_CUT_GRASS_SOURCE_MATERIAL_ID = 'pbr.grass_004';
export const LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID = 'pbr.forrest_ground_01';

export const LOW_CUT_GRASS_ATLAS_ROLE = Object.freeze({
    MID_CLUSTER: 'midCluster',
    ACCENT_CLUMP: 'accentClump'
});

export const LOW_CUT_GRASS_NORMAL_POLICY = Object.freeze({
    MESH: 'mesh',
    WORLD_UP_BLEND: 'world_up_blend'
});

export const LOW_CUT_GRASS_LOCAL_OVERRIDES = Object.freeze({
    tileMeters: 1.4,
    normalStrength: 0.72,
    roughness: 0.94,
    metalness: 0.0,
    aoIntensity: 0.82
});

export const LOW_CUT_GRASS_SHADER_DEFAULTS = Object.freeze({
    enabled: true,
    macroScaleMeters: 18.0,
    macroVariationStrength: 0.07,
    secondaryScale: 1.071,
    secondaryBlend: 0.22,
    seedOffset: Object.freeze({ x: 13.73, y: 41.19 })
});

const MID_CLUSTER_ATLAS = Object.freeze({
    role: LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER,
    columns: 4,
    rows: 2,
    variants: 8,
    resolution: Object.freeze({ width: 1024, height: 512 }),
    gutterPixels: 16,
    materialPaths: 1,
    alphaCutoff: 0.35,
    alphaToCoverage: true,
    alphaLayout: Object.freeze({ policy: 'separate_alpha_map', channel: 'green' }),
    rgbConditioning: Object.freeze({
        policy: 'cell_complete_nearest_opaque',
        sourceAlphaCutoff: 0.35,
        transparentBlackPixels: 0
    }),
    minFilter: 'linear_mipmap_linear',
    lighting: Object.freeze({
        normalPolicy: LOW_CUT_GRASS_NORMAL_POLICY.WORLD_UP_BLEND,
        worldUpBlend: 1.0
    }),
    bakePhysicalDimensionsMeters: Object.freeze({ x: 1.15, y: 0.055 }),
    runtimePhysicalDimensionsMeters: Object.freeze({ x: 1.15, y: 0.055 }),
    alphaCoverage: Object.freeze({
        policy: 'coverage_preserving_box_mips',
        lastRequiredMip: 7,
        minimumUsefulVariants: 8,
        report: 'asset.manifest.json generation.atlasFamilies.midCluster.alphaPolicy.coverageByMip'
    }),
    channels: Object.freeze({
        color: 'midClusterColor',
        coverage: 'midClusterCoverage',
        normal: 'midClusterNormal',
        roughness: 'midClusterRoughness',
        ao: 'midClusterAo'
    })
});

const ACCENT_CLUMP_ATLAS = Object.freeze({
    role: LOW_CUT_GRASS_ATLAS_ROLE.ACCENT_CLUMP,
    columns: 4,
    rows: 2,
    variants: 8,
    resolution: Object.freeze({ width: 1024, height: 512 }),
    gutterPixels: 16,
    materialPaths: 1,
    alphaCutoff: 0.35,
    alphaToCoverage: true,
    alphaLayout: Object.freeze({ policy: 'separate_alpha_map', channel: 'green' }),
    rgbConditioning: Object.freeze({
        policy: 'cell_complete_nearest_opaque',
        sourceAlphaCutoff: 0.35,
        transparentBlackPixels: 0
    }),
    minFilter: 'linear_mipmap_linear',
    lighting: Object.freeze({
        normalPolicy: LOW_CUT_GRASS_NORMAL_POLICY.WORLD_UP_BLEND,
        worldUpBlend: 1.0
    }),
    bakePhysicalDimensionsMeters: Object.freeze({ x: 0.24, y: 0.075 }),
    runtimePhysicalDimensionsMeters: Object.freeze({ x: 0.24, y: 0.075 }),
    alphaCoverage: Object.freeze({
        policy: 'coverage_preserving_box_mips',
        lastRequiredMip: 7,
        minimumUsefulVariants: 8,
        report: 'asset.manifest.json generation.atlasFamilies.accentClump.alphaPolicy.coverageByMip'
    }),
    channels: Object.freeze({
        color: 'accentClumpColor',
        coverage: 'accentClumpCoverage',
        normal: 'accentClumpNormal',
        roughness: 'accentClumpRoughness',
        ao: 'accentClumpAo'
    })
});

export const LOW_CUT_GRASS_V1_ASSET_FAMILY = Object.freeze({
    assetId: 'grass.lowcut.maintained.material.v1',
    materialId: LOW_CUT_GRASS_V1_MATERIAL_ID,
    sourceMaterialId: LOW_CUT_GRASS_SOURCE_MATERIAL_ID,
    substrateMaterialId: LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID,
    schema: 'bus-simulator.low-cut-grass-asset-family',
    version: 1,
    physicalDimensionsMeters: Object.freeze({ x: 1.4, z: 1.4 }),
    materialResponse: Object.freeze({
        emissive: '#285F28',
        emissiveIntensity: 0.75,
        roughness: 0.9,
        metalness: 0,
        aoIntensity: 0.55
    }),
    nearBladeAppearance: Object.freeze({
        baseColor: '#285F2E',
        bodyColor: '#3D7938',
        tipColor: '#568C44',
        dryColor: '#6A7540',
        roughness: 0.9,
        paletteSource: 'historical authored V1 profile'
    }),
    atlas: Object.freeze({
        role: 'historicalCluster',
        columns: 4,
        rows: 2,
        variants: 8,
        resolution: Object.freeze({ width: 1024, height: 512 }),
        gutterPixels: 0,
        materialPaths: 1,
        alphaCutoff: 0.35,
        alphaToCoverage: true,
        minFilter: 'linear_mipmap_linear',
        lighting: Object.freeze({
            normalPolicy: LOW_CUT_GRASS_NORMAL_POLICY.MESH,
            worldUpBlend: 0
        })
    }),
    generation: Object.freeze({
        recipe: 'tools/grass_material_baker/blender_bake.py',
        seed: 'grass-material-bake-v1',
        lightingInBaseColor: false
    }),
    source: Object.freeze({
        asset: 'ambientCG Grass 004',
        url: 'https://ambientcg.com/view?id=Grass004',
        license: 'CC0 1.0',
        physicalDimensionsMeters: Object.freeze({ x: 1.4, z: 1.4 })
    })
});

export const LOW_CUT_GRASS_ASSET_FAMILY = Object.freeze({
    assetId: 'grass.natural.maintained.material.v2',
    materialId: LOW_CUT_GRASS_MATERIAL_ID,
    sourceMaterialId: LOW_CUT_GRASS_SOURCE_MATERIAL_ID,
    substrateMaterialId: LOW_CUT_GRASS_SUBSTRATE_MATERIAL_ID,
    schema: 'bus-simulator.low-cut-grass-asset-family',
    version: 2,
    physicalDimensionsMeters: Object.freeze({ x: 1.4, z: 1.4 }),
    bakeProfile: Object.freeze({
        profileId: 'grass.natural.maintained.v2',
        version: 2,
        seed: 'natural-maintained-turf-v2',
        heightMeters: Object.freeze({ min: 0.025, max: 0.075 }),
        widthMeters: Object.freeze({ min: 0.0022, max: 0.0058 }),
        style: 'cohesive-natural-variable'
    }),
    materialResponse: Object.freeze({
        emissive: '#000000',
        emissiveIntensity: 0,
        roughness: 0.94,
        metalness: 0,
        aoIntensity: 0.82
    }),
    nearBladeAppearance: Object.freeze({
        baseColor: '#494E30',
        bodyColor: '#565B3A',
        tipColor: '#616743',
        dryColor: '#65613E',
        roughness: 0.94,
        paletteSource: 'corrected far_basecolor.png linear-color percentiles'
    }),
    generation: Object.freeze({
        recipe: 'tools/grass_material_baker/blender_bake.py',
        tool: 'Blender 5.2.0 LTS',
        seed: 'grass-material-bake-v2',
        lightingInBaseColor: false
    }),
    source: Object.freeze({
        asset: 'ambientCG Grass 004 plus deterministic authored grass blades',
        url: 'https://ambientcg.com/view?id=Grass004',
        license: 'CC0 1.0',
        sourcePhysicalDimensionsMeters: null,
        sourcePhysicalDimensionsStatus: 'not published in the checked-in source package',
        calibratedFarTileMeters: Object.freeze({ x: 1.4, z: 1.4 })
    }),
    atlases: Object.freeze({
        [LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER]: MID_CLUSTER_ATLAS,
        [LOW_CUT_GRASS_ATLAS_ROLE.ACCENT_CLUMP]: ACCENT_CLUMP_ATLAS
    }),
    atlas: MID_CLUSTER_ATLAS
});

export const LOW_CUT_GRASS_V1_PBR_ENTRY = Object.freeze({
    materialId: LOW_CUT_GRASS_V1_MATERIAL_ID,
    label: 'Low-cut maintained grass v1 (historical)',
    classId: 'grass',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 1.4,
    mapFiles: Object.freeze({
        baseColor: 'far_basecolor.png',
        normal: 'far_normal_gl.png',
        ao: 'far_ao.png',
        roughness: 'far_roughness.png',
        displacement: 'far_height.png'
    }),
    auxiliaryMapFiles: Object.freeze({
        coverage: 'far_coverage.png',
        height: 'far_height.png',
        clusterColor: 'cluster_atlas.png',
        clusterNormal: 'cluster_normal_gl.png',
        clusterRoughness: 'cluster_roughness.png',
        clusterAo: 'cluster_ao.png'
    }),
    normalization: Object.freeze({
        notes: 'Historical V1 material retained for deterministic before comparisons only.',
        albedoNotes: 'Superseded by the unified natural-grass V2 response.',
        roughnessIntent: 'Historical response; do not use for V2 consumers.'
    }),
    provenance: LOW_CUT_GRASS_V1_ASSET_FAMILY
});

export const LOW_CUT_GRASS_PBR_ENTRY = Object.freeze({
    materialId: LOW_CUT_GRASS_MATERIAL_ID,
    label: 'Natural cohesive grass v2',
    classId: 'grass',
    root: 'surface',
    buildingEligible: false,
    groundEligible: true,
    tileMeters: 1.4,
    mapFiles: Object.freeze({
        baseColor: 'far_basecolor.png',
        normal: 'far_normal_gl.png',
        ao: 'far_ao.png',
        roughness: 'far_roughness.png',
        displacement: 'far_height.png'
    }),
    auxiliaryMapFiles: Object.freeze({
        coverage: 'far_coverage.png',
        height: 'far_height.png',
        midClusterColor: 'mid_cluster_basecolor.png',
        midClusterCoverage: 'mid_cluster_coverage.png',
        midClusterNormal: 'mid_cluster_normal_gl.png',
        midClusterRoughness: 'mid_cluster_roughness.png',
        midClusterAo: 'mid_cluster_ao.png',
        accentClumpColor: 'accent_clump_basecolor.png',
        accentClumpCoverage: 'accent_clump_coverage.png',
        accentClumpNormal: 'accent_clump_normal_gl.png',
        accentClumpRoughness: 'accent_clump_roughness.png',
        accentClumpAo: 'accent_clump_ao.png'
    }),
    normalization: Object.freeze({
        notes: 'One far surface response supplies every V2 grass representation; runtime emissive is prohibited.',
        albedoNotes: 'Restrained natural green, controlled dryness, and small fiber variation remain consistent across distance tiers.',
        roughnessIntent: 'High varied roughness keeps blades and cards from reading as smooth plastic.'
    }),
    provenance: LOW_CUT_GRASS_ASSET_FAMILY
});

export const LOW_CUT_GRASS_PBR_ENTRIES = Object.freeze([
    LOW_CUT_GRASS_V1_PBR_ENTRY,
    LOW_CUT_GRASS_PBR_ENTRY
]);
