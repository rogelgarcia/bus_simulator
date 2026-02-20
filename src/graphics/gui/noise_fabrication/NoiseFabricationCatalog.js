// src/graphics/gui/noise_fabrication/NoiseFabricationCatalog.js
// Catalog-backed noise picker content for the Noise fabrication tool.
// @ts-check

function freezeEntry(entry) {
    return Object.freeze({
        id: String(entry.id),
        generatorId: String(entry.generatorId),
        displayName: String(entry.displayName),
        shortDescription: String(entry.shortDescription),
        usageExample: String(entry.usageExample),
        hoverDetails: String(entry.hoverDetails),
        mixGuidance: String(entry.mixGuidance),
        mapTargetHints: Object.freeze({
            normal: String(entry.mapTargetHints?.normal ?? ''),
            albedo: String(entry.mapTargetHints?.albedo ?? ''),
            orm: String(entry.mapTargetHints?.orm ?? '')
        }),
        defaultPresetId: String(entry.defaultPresetId),
        defaultLayerTarget: String(entry.defaultLayerTarget)
    });
}

const CATALOG_ENTRIES = Object.freeze([
    freezeEntry({
        id: 'value_fbm',
        generatorId: 'value_fbm',
        displayName: 'Value fBm',
        shortDescription: 'Classic cloud-like layered noise for broad breakup.',
        usageExample: 'Sidewalk base variation before adding grooves or seam detail.',
        hoverDetails: 'Good first layer to avoid flat repetition and to support subtle material modulation.',
        mixGuidance: 'Mix with Line Bands or Tile/Grid Subdivision to add directional joints on top of organic breakup.',
        mapTargetHints: {
            normal: 'Use low strength for broad undulation without puffy normals.',
            albedo: 'Prefer brightness variation over hue swings; keep saturation shifts subtle.',
            orm: 'Useful for roughness modulation and soft AO variation, not hard metalness edges.'
        },
        defaultPresetId: 'clouds',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'ridged_fbm',
        generatorId: 'ridged_fbm',
        displayName: 'Ridged fBm',
        shortDescription: 'Ridge-heavy noise for sharper creases and rock-like structure.',
        usageExample: 'Stone wall breakup between tile seams to avoid smooth plate faces.',
        hoverDetails: 'Produces stronger directionless structure than cloud noise and works for crack-like detail bases.',
        mixGuidance: 'Blend softly with Low-frequency Blotch to keep large wall sections varied without harsh repetition.',
        mapTargetHints: {
            normal: 'Great for chipped relief when layered under crackle masks.',
            albedo: 'Apply mostly value changes; avoid strong hue offsets on large surfaces.',
            orm: 'Useful in roughness and AO channels where ridges should catch dirt/cavity contrast.'
        },
        defaultPresetId: 'cracked',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'directional_fbm',
        generatorId: 'directional_fbm',
        displayName: 'Directional fBm',
        shortDescription: 'Organic noise stretched per axis for directional wear.',
        usageExample: 'Sidewalk runoff streaks aligned with traffic flow or slope direction.',
        hoverDetails: 'Adds anisotropic breakup while keeping natural fBm character for worn surfaces.',
        mixGuidance: 'Use with Micro Grain for close-up detail and Edge Wear Mask for border emphasis.',
        mapTargetHints: {
            normal: 'Effective for brushed or dragged normal variation on concrete.',
            albedo: 'Keep hue shifts minimal; rely on brightness and mild saturation drift.',
            orm: 'Strong for roughness streaking and AO drift; metalness should remain conservative.'
        },
        defaultPresetId: 'sidewalk_streaks',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'line_bands',
        generatorId: 'line_bands',
        displayName: 'Line Bands',
        shortDescription: 'Procedural horizontal/vertical seams with soft control.',
        usageExample: 'Single vertical seam to fake wall plate separation between stone slabs.',
        hoverDetails: 'Supports seam-like strips from one dominant line up to repeated band sets.',
        mixGuidance: 'Stack over Directional fBm to keep seams clean while the base remains naturally varied.',
        mapTargetHints: {
            normal: 'Primary tool for groove-like joints and panel seams.',
            albedo: 'Use tiny value dips only; avoid dark cartoon lines.',
            orm: 'Useful for AO seams and roughness edge breaks; keep metalness channel restrained.'
        },
        defaultPresetId: 'vertical_seam_single',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'tile_grid_subdivision',
        generatorId: 'tile_grid_subdivision',
        displayName: 'Tile/Grid Subdivision',
        shortDescription: 'Independent vertical/horizontal joints for plate layouts.',
        usageExample: 'Stone plates grid on walls with groove joints between tile blocks.',
        hoverDetails: 'Best for deterministic fake tile splits and block subdivision without manual masks.',
        mixGuidance: 'Combine with Low-frequency Blotch to vary each plate while preserving clean joints.',
        mapTargetHints: {
            normal: 'Defaults to groove seams for sidewalk and wall joint normals.',
            albedo: 'Use faint value variation on joints; avoid over-dark mortar lines.',
            orm: 'Excellent for AO groove definition and roughness separation between plates.'
        },
        defaultPresetId: 'stone_plates_grid',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'cellular_worley',
        generatorId: 'cellular_worley',
        displayName: 'Cellular/Worley',
        shortDescription: 'Cell-like structure for chipped stone and clustered breakup.',
        usageExample: 'Stone tile face variation that avoids repetitive cloud-only patches.',
        hoverDetails: 'Distance-cell patterns create natural compartment-like regions for weathered materials.',
        mixGuidance: 'Layer under Crackle/Fracture so cells provide body while fractures define sharp lines.',
        mapTargetHints: {
            normal: 'Useful for pitted stone normals and eroded plaster detail.',
            albedo: 'Apply mostly brightness modulation; keep hue offsets subtle and plausible.',
            orm: 'Strong for roughness islands and AO pocketing, weak influence on metalness.'
        },
        defaultPresetId: 'stone_cells',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'edge_wear_mask',
        generatorId: 'edge_wear_mask',
        displayName: 'Edge Wear Mask',
        shortDescription: 'Border-focused wear mask with breakup noise.',
        usageExample: 'Sidewalk tile edges where dirt and wear accumulate near joints.',
        hoverDetails: 'Targets perimeter regions and keeps center areas calmer for believable wear gradients.',
        mixGuidance: 'Blend with Tile/Grid Subdivision to emphasize joints and with Micro Grain for close-up realism.',
        mapTargetHints: {
            normal: 'Good for shallow chamfer wear and edge erosion.',
            albedo: 'Use controlled value fade instead of high-saturation rim coloration.',
            orm: 'Excellent for AO edge darkening and roughness edge polishing/roughing.'
        },
        defaultPresetId: 'edge_dust',
        defaultLayerTarget: 'orm_ao'
    }),
    freezeEntry({
        id: 'micro_grain',
        generatorId: 'micro_grain',
        displayName: 'Micro Grain',
        shortDescription: 'High-frequency grain for close-range material fidelity.',
        usageExample: 'Fine grain on stone plates so wall surfaces do not look plastic up close.',
        hoverDetails: 'Micro detail layer intended for subtle addition over broader shapes and seams.',
        mixGuidance: 'Keep strength low and pair with Directional Streak/Flow for believable anisotropic microstructure.',
        mapTargetHints: {
            normal: 'Use low intensity for subtle tactile detail, not macro displacement.',
            albedo: 'Prefer tiny brightness jitter and near-zero hue movement.',
            orm: 'Great for roughness micro-breakup; AO/metalness should be very mild.'
        },
        defaultPresetId: 'fine_concrete',
        defaultLayerTarget: 'orm_roughness'
    }),
    freezeEntry({
        id: 'directional_streak_flow',
        generatorId: 'directional_streak_flow',
        displayName: 'Directional Streak/Flow',
        shortDescription: 'Flow-oriented streaking with directional control.',
        usageExample: 'Rain streak flow on wall tiles running down from seam joints.',
        hoverDetails: 'Designed for runoff, brushed wear, and elongated dirt streak behavior.',
        mixGuidance: 'Use above Low-frequency Blotch to keep broad stain groups while preserving directional run marks.',
        mapTargetHints: {
            normal: 'Useful for brushed normals and directional grime embossing.',
            albedo: 'Constrain hue drift; mostly value/saturation modulation for realism.',
            orm: 'Ideal for roughness streaking and AO drip traces with minimal metalness shifts.'
        },
        defaultPresetId: 'runoff_flow',
        defaultLayerTarget: 'albedo'
    }),
    freezeEntry({
        id: 'crackle_fracture',
        generatorId: 'crackle_fracture',
        displayName: 'Crackle/Fracture',
        shortDescription: 'Sharp fracture lines and crack networks.',
        usageExample: 'Fracture seams across stone wall plates between major tile joints.',
        hoverDetails: 'Creates narrow crack lines suitable for weathered masonry and brittle surfaces.',
        mixGuidance: 'Use over Cellular/Worley so cracks cut across broader stone body variation.',
        mapTargetHints: {
            normal: 'Excellent for crack grooves and brittle fracture normals.',
            albedo: 'Keep crack darkening subtle; avoid pure black lines unless stylized.',
            orm: 'Best for AO cavity channels and roughness crack contrast; metalness usually untouched.'
        },
        defaultPresetId: 'fractured_wall',
        defaultLayerTarget: 'normal'
    }),
    freezeEntry({
        id: 'low_frequency_blotch',
        generatorId: 'low_frequency_blotch',
        displayName: 'Low-frequency Blotch',
        shortDescription: 'Large-scale blotches for broad staining and tone drift.',
        usageExample: 'Large dirty patches on sidewalks between expansion grooves.',
        hoverDetails: 'Use for macro variation so repeated tiling is less visible at world scale.',
        mixGuidance: 'Layer below high-frequency generators like Micro Grain and Line Bands for hierarchical detail.',
        mapTargetHints: {
            normal: 'Use sparingly for broad swell variation; avoid bulky normal artifacts.',
            albedo: 'Primary target: brightness-led weathering with cautious hue/saturation shifts.',
            orm: 'Strong for roughness macro patches and soft AO modulation across large areas.'
        },
        defaultPresetId: 'large_stains',
        defaultLayerTarget: 'albedo'
    })
]);

const CATALOG_BY_ID = new Map(CATALOG_ENTRIES.map((entry) => [entry.id, entry]));

function normalizeId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function listNoiseCatalogEntries() {
    return CATALOG_ENTRIES;
}

export function getNoiseCatalogEntryById(id) {
    const key = normalizeId(id);
    return CATALOG_BY_ID.get(key) ?? null;
}

export function findNoiseCatalogEntryByGeneratorId(generatorId) {
    const key = normalizeId(generatorId);
    if (!key) return null;
    return CATALOG_ENTRIES.find((entry) => entry.generatorId === key) ?? null;
}

export function validateNoiseCatalogEntries(entries = CATALOG_ENTRIES, { validGeneratorIds = null } = {}) {
    const errors = [];
    const src = Array.isArray(entries) ? entries : [];
    const idSet = new Set();
    const generatorSet = Array.isArray(validGeneratorIds) ? new Set(validGeneratorIds.map((id) => normalizeId(id)).filter(Boolean)) : null;

    for (const [idx, entry] of src.entries()) {
        const id = normalizeId(entry?.id);
        const generatorId = normalizeId(entry?.generatorId);
        if (!id) errors.push(`Entry #${idx} is missing id.`);
        if (!generatorId) errors.push(`Entry #${idx} is missing generatorId.`);
        if (idSet.has(id)) errors.push(`Duplicate catalog id "${id}".`);
        idSet.add(id);

        if (!String(entry?.displayName ?? '').trim()) errors.push(`Catalog "${id || idx}" is missing displayName.`);
        if (!String(entry?.shortDescription ?? '').trim()) errors.push(`Catalog "${id || idx}" is missing shortDescription.`);
        if (!String(entry?.usageExample ?? '').trim()) errors.push(`Catalog "${id || idx}" is missing usageExample.`);
        if (!String(entry?.hoverDetails ?? '').trim()) errors.push(`Catalog "${id || idx}" is missing hoverDetails.`);
        if (!String(entry?.mixGuidance ?? '').trim()) errors.push(`Catalog "${id || idx}" is missing mixGuidance.`);
        if (!String(entry?.defaultPresetId ?? '').trim()) errors.push(`Catalog "${id || idx}" is missing defaultPresetId.`);

        const target = normalizeId(entry?.defaultLayerTarget);
        if (!target) errors.push(`Catalog "${id || idx}" is missing defaultLayerTarget.`);

        const hints = entry?.mapTargetHints ?? null;
        const normalHint = String(hints?.normal ?? '').trim();
        const albedoHint = String(hints?.albedo ?? '').trim();
        const ormHint = String(hints?.orm ?? '').trim();
        if (!normalHint) errors.push(`Catalog "${id || idx}" is missing mapTargetHints.normal.`);
        if (!albedoHint) errors.push(`Catalog "${id || idx}" is missing mapTargetHints.albedo.`);
        if (!ormHint) errors.push(`Catalog "${id || idx}" is missing mapTargetHints.orm.`);

        if (generatorSet && generatorId && !generatorSet.has(generatorId)) {
            errors.push(`Catalog "${id || idx}" references unknown generator "${generatorId}".`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
