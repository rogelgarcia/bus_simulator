// src/app/buildings/BuildingMaterialSlots.js
// Building-level named material slots + config-level material resolution (AI 491).
//
// A building config may declare named slots (`wallPrimary`, `wallAccent`,
// `trim`, `base`, plus any custom name). Every feature that picks a material
// (layer walls, face overrides, bay overrides, belts, cornices, corner
// treatment, wall decorations, window surround decorations, facade banding)
// can reference a slot with `{ kind: 'slot', id: '<name>' }` (or the string
// shorthand `slot:<name>`), so one slot change recolors all of them together.
//
// Resolution order per feature: explicit material > slot reference > legacy
// `match_*` modes. This module implements the resolution as a config
// pre-pass (`resolveBuildingConfigMaterials`) that rewrites slot and brick
// preset references into explicit specs before the generator normalizes the
// config, so the runtime material paths stay unchanged.
// @ts-check
import { isBrickPresetId, resolveBrickPresetBundle } from './BrickPresetCatalog.js';

export const BUILDING_MATERIAL_SLOT_IDS = Object.freeze(['wallPrimary', 'wallAccent', 'trim', 'base']);

const SLOT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
}

export function isValidMaterialSlotName(name) {
    return typeof name === 'string' && SLOT_NAME_RE.test(name) && name.length <= 40;
}

/**
 * Parses the string shorthands `slot:<name>` and `preset:<id>` into
 * `{ kind, id }` specs. Returns null for anything else.
 */
export function parseMaterialSpecShorthand(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (raw.startsWith('slot:')) {
        const id = raw.slice(5).trim();
        return isValidMaterialSlotName(id) ? { kind: 'slot', id } : null;
    }
    if (raw.startsWith('preset:')) {
        const id = raw.slice(7).trim();
        return id ? { kind: 'preset', id } : null;
    }
    return null;
}

export function isSlotMaterialSpec(value) {
    if (typeof value === 'string') return parseMaterialSpecShorthand(value)?.kind === 'slot';
    return !!value && typeof value === 'object' && value.kind === 'slot' && isValidMaterialSlotName(value.id);
}

export function isPresetMaterialSpec(value) {
    if (typeof value === 'string') return parseMaterialSpecShorthand(value)?.kind === 'preset';
    return !!value && typeof value === 'object' && value.kind === 'preset' && typeof value.id === 'string' && !!value.id;
}

function isExplicitMaterialSpec(value) {
    return !!value && typeof value === 'object'
        && (value.kind === 'texture' || value.kind === 'color')
        && typeof value.id === 'string' && !!value.id;
}

function normalizeSlotEntryMaterial(value) {
    const shorthand = typeof value === 'string' ? parseMaterialSpecShorthand(value) : null;
    if (shorthand) return shorthand;
    if (typeof value === 'string' && value.trim()) return { kind: 'texture', id: value.trim() };
    if (isExplicitMaterialSpec(value)) return { kind: value.kind, id: value.id };
    if (isPresetMaterialSpec(value)) {
        const out = { kind: 'preset', id: value.id };
        if (value.jitter !== undefined && value.jitter !== null && value.jitter !== false) out.jitter = deepClone(value.jitter);
        return out;
    }
    return null;
}

/**
 * Normalizes a building-level material slots config.
 *
 * Accepted forms:
 *   { slots: { trim: 'pbr.x' | { kind, id } | { material, wallBase?, tiling? } } }
 *   { trim: ... }  (flat map)
 *
 * A slot value is a bundle `{ material, wallBase|null, tiling|null }` whose
 * material may be an explicit texture/color spec or a brick preset reference
 * (slot-in-slot references are dropped).
 */
export function normalizeBuildingMaterialSlotsConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    const rawSlots = src?.slots && typeof src.slots === 'object' ? src.slots : src;
    const slots = {};

    if (rawSlots && typeof rawSlots === 'object') {
        for (const [name, entry] of Object.entries(rawSlots)) {
            if (name === 'slots' && rawSlots === src) continue;
            if (!isValidMaterialSlotName(name)) continue;
            if (entry === null || entry === undefined) continue;

            const isBundle = entry && typeof entry === 'object' && !entry.kind && (entry.material !== undefined);
            const material = normalizeSlotEntryMaterial(isBundle ? entry.material : entry);
            if (!material || material.kind === 'slot') continue;

            const wallBase = isBundle && entry.wallBase && typeof entry.wallBase === 'object' ? deepClone(entry.wallBase) : null;
            const tiling = isBundle && entry.tiling && typeof entry.tiling === 'object' ? deepClone(entry.tiling) : null;
            slots[name] = { material, wallBase, tiling };
        }
    }

    return { slots };
}

export function getMaterialSlotNames(materialSlots) {
    const cfg = materialSlots && typeof materialSlots === 'object' ? materialSlots : null;
    const slots = cfg?.slots && typeof cfg.slots === 'object' ? cfg.slots : null;
    return slots ? Object.keys(slots) : [];
}

/**
 * Resolves one material spec (which may be a slot/preset reference or the
 * string shorthand) into a bundle `{ material, wallBase|null, tiling|null,
 * brick|null }`. Explicit texture/color specs and legacy `match_*` specs
 * return null — the caller leaves them untouched.
 */
export function resolveMaterialSpecBundle(spec, { materialSlots = null, seed = 0, warnings = null, context = '' } = {}) {
    const normalized = typeof spec === 'string' ? parseMaterialSpecShorthand(spec) : spec;
    if (!normalized || typeof normalized !== 'object') return null;

    if (normalized.kind === 'preset') {
        const presetId = typeof normalized.id === 'string' ? normalized.id : '';
        const bundle = resolveBrickPresetBundle({ presetId, jitter: normalized.jitter ?? false, seed });
        if (!bundle) {
            if (warnings && !isBrickPresetId(presetId)) warnings.push(`${context || 'Material'}: unknown brick preset "${presetId}".`);
            return null;
        }
        return bundle;
    }

    if (normalized.kind !== 'slot') return null;
    const name = typeof normalized.id === 'string' ? normalized.id : '';
    const slot = materialSlots?.slots?.[name] ?? null;
    if (!slot) {
        if (warnings) warnings.push(`${context || 'Material'}: unresolved material slot "${name}".`);
        return null;
    }

    if (slot.material?.kind === 'preset') {
        const presetBundle = resolveBrickPresetBundle({
            presetId: slot.material.id,
            jitter: slot.material.jitter ?? false,
            seed
        });
        if (!presetBundle) {
            if (warnings) warnings.push(`${context || 'Material'}: slot "${name}" references unknown brick preset "${slot.material.id}".`);
            return null;
        }
        return {
            ...presetBundle,
            wallBase: slot.wallBase ? deepClone(slot.wallBase) : presetBundle.wallBase,
            tiling: slot.tiling ? deepClone(slot.tiling) : presetBundle.tiling,
            slotName: name
        };
    }

    return {
        slotName: name,
        material: { ...slot.material },
        wallBase: slot.wallBase ? deepClone(slot.wallBase) : null,
        tiling: slot.tiling ? deepClone(slot.tiling) : null,
        brick: null
    };
}

// Applies a resolved bundle to a feature site. Which bundle parts apply is
// site-dependent; material always applies.
function applyBundleToSite(target, bundle, { materialKey = 'material', wallBaseKey = null, tilingKey = null } = {}) {
    if (!target || typeof target !== 'object' || !bundle) return;
    target[materialKey] = { ...bundle.material };
    if (wallBaseKey && bundle.wallBase) target[wallBaseKey] = deepClone(bundle.wallBase);
    if (tilingKey && bundle.tiling) target[tilingKey] = deepClone(bundle.tiling);
}

// Merges a preset's brick block into a layer-like materialVariation config.
// The preset drives the brick look; the layer keeps its other weathering
// fields. Variation is enabled unless the author explicitly disabled it.
function applyBrickToMaterialVariation(holder, key, brick) {
    if (!holder || typeof holder !== 'object' || !brick) return;
    const existing = holder[key] && typeof holder[key] === 'object' ? holder[key] : null;
    const enabled = existing?.enabled !== undefined ? !!existing.enabled : true;
    holder[key] = {
        ...(existing ? deepClone(existing) : {}),
        enabled,
        brick: deepClone(brick)
    };
}

function resolveSpecInPlace(target, key, ctx, { wallBaseKey = null, tilingKey = null, matVarHolder = null, matVarKey = null, context = '' } = {}) {
    if (!target || typeof target !== 'object') return false;
    const bundle = resolveMaterialSpecBundle(target[key], { ...ctx, context });
    if (!bundle) {
        // Keep shorthand strings parseable downstream even when unresolved.
        const shorthand = typeof target[key] === 'string' ? parseMaterialSpecShorthand(target[key]) : null;
        if (shorthand) target[key] = shorthand;
        return false;
    }
    applyBundleToSite(target, bundle, { materialKey: key, wallBaseKey, tilingKey });
    if (matVarHolder && matVarKey && bundle.brick) applyBrickToMaterialVariation(matVarHolder, matVarKey, bundle.brick);
    return true;
}

function resolveCorniceMaterials(cornice, ctx, contextLabel) {
    if (!cornice || typeof cornice !== 'object') return;
    resolveSpecInPlace(cornice, 'material', ctx, { tilingKey: 'tiling', context: `${contextLabel} cornice` });
    if (cornice.ornament && typeof cornice.ornament === 'object') {
        resolveSpecInPlace(cornice.ornament, 'material', ctx, { context: `${contextLabel} cornice ornament` });
    }
    const coping = cornice.parapet?.coping;
    if (coping && typeof coping === 'object') {
        resolveSpecInPlace(coping, 'material', ctx, { context: `${contextLabel} parapet coping` });
    }
}

function resolveFacadeFaceMaterials(facade, ctx, contextLabel) {
    if (!facade || typeof facade !== 'object') return;
    if (facade.wallMaterial !== undefined) {
        resolveSpecInPlace(facade, 'wallMaterial', ctx, { context: `${contextLabel} wall material` });
    }
    const bays = facade.layout?.bays?.items;
    if (Array.isArray(bays)) {
        for (const bay of bays) {
            if (!bay || typeof bay !== 'object') continue;
            if (bay.wallMaterialOverride !== null && bay.wallMaterialOverride !== undefined) {
                resolveSpecInPlace(bay, 'wallMaterialOverride', ctx, {
                    wallBaseKey: 'wallBase',
                    tilingKey: 'tiling',
                    context: `${contextLabel} bay ${bay?.id ?? ''}`
                });
            }
            const capital = bay.capital;
            if (capital && typeof capital === 'object') {
                for (const end of ['top', 'bottom']) {
                    const spec = capital[end];
                    if (!spec || typeof spec !== 'object' || spec.material === null || spec.material === undefined) continue;
                    resolveSpecInPlace(spec, 'material', ctx, {
                        context: `${contextLabel} bay ${bay?.id ?? ''} capital ${end}`
                    });
                }
            }
            // AI 489: balcony materials use the same wall-material spec
            // dialect as capitals (platform slab, solid infill, supports).
            const balcony = bay.balcony;
            if (balcony && typeof balcony === 'object') {
                const balconyLabel = `${contextLabel} bay ${bay?.id ?? ''} balcony`;
                if (balcony.platform && typeof balcony.platform === 'object' && balcony.platform.material) {
                    resolveSpecInPlace(balcony.platform, 'material', ctx, { context: `${balconyLabel} platform` });
                }
                if (balcony.support && typeof balcony.support === 'object' && balcony.support.material) {
                    resolveSpecInPlace(balcony.support, 'material', ctx, { context: `${balconyLabel} support` });
                }
                const solid = balcony.railing?.solid;
                if (solid && typeof solid === 'object' && solid.material) {
                    resolveSpecInPlace(solid, 'material', ctx, { context: `${balconyLabel} solid infill` });
                }
            }
        }
    }

    // AI 493: the arcade impost band is a group-level feature and uses the same
    // wall-material spec dialect as capitals.
    const groups = facade.layout?.groups?.items;
    if (Array.isArray(groups)) {
        for (const group of groups) {
            if (!group || typeof group !== 'object') continue;
            const impost = group.arcade?.impost;
            if (!impost || typeof impost !== 'object' || !impost.material) continue;
            resolveSpecInPlace(impost, 'material', ctx, {
                context: `${contextLabel} group ${group?.id ?? ''} arcade impost`
            });
        }
    }
}

function resolveWindowDecorationMaterials(node, ctx, contextLabel) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const entry of node) resolveWindowDecorationMaterials(entry, ctx, contextLabel);
        return;
    }
    // `material` on decoration parts / storefront zones / portal parts;
    // `recessMaterial` is the portal reveal hook (AI 509) — same dialect.
    for (const key of ['material', 'recessMaterial']) {
        const material = node[key];
        if (!material || typeof material !== 'object' || material.mode !== 'slot') continue;
        const slotId = typeof material.slotId === 'string' ? material.slotId : '';
        const bundle = resolveMaterialSpecBundle({ kind: 'slot', id: slotId }, { ...ctx, context: contextLabel });
        if (bundle?.material?.kind === 'texture') {
            node[key] = { ...material, mode: 'pbr', materialId: bundle.material.id };
            delete node[key].slotId;
        } else {
            if (bundle && ctx.warnings) ctx.warnings.push(`${contextLabel}: slot "${slotId}" is not a texture; using match_wall.`);
            node[key] = { ...material, mode: 'match_wall' };
            delete node[key].slotId;
        }
    }
    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') resolveWindowDecorationMaterials(value, ctx, contextLabel);
    }
}

/**
 * Config pre-pass: resolves slot / brick preset references across a building
 * config into explicit material specs. Returns deep-resolved copies of the
 * inputs (originals are never mutated). Unresolvable references fall through
 * to the legacy defaults with a warning.
 */
export function resolveBuildingConfigMaterials({
    layers = null,
    facades = null,
    wallDecorations = null,
    cornerTreatment = null,
    windowDefinitions = null,
    materialSlots = null,
    seed = 0,
    warnings = null
} = {}) {
    const slotsCfg = normalizeBuildingMaterialSlotsConfig(materialSlots);
    const ctx = { materialSlots: slotsCfg, seed: Number(seed) >>> 0, warnings };

    const outLayers = layers ? deepClone(layers) : layers;
    if (Array.isArray(outLayers)) {
        for (const layer of outLayers) {
            if (!layer || typeof layer !== 'object') continue;
            const label = `Layer ${layer?.id ?? ''}`.trim();

            if (layer.type === 'roof') {
                if (layer.ring && typeof layer.ring === 'object') {
                    resolveSpecInPlace(layer.ring, 'material', ctx, { tilingKey: 'tiling', context: `${label} ring` });
                }
                if (layer.roof && typeof layer.roof === 'object') {
                    resolveSpecInPlace(layer.roof, 'material', ctx, { tilingKey: 'tiling', context: `${label} roof` });
                }
                resolveCorniceMaterials(layer.cornice, ctx, label);
                // AI 492: rooftop props share one material palette across the
                // whole prop set, so a slot swap recolors every prop at once.
                const propMaterials = layer.props?.materials;
                if (propMaterials && typeof propMaterials === 'object') {
                    for (const role of Object.keys(propMaterials)) {
                        if (propMaterials[role] === null || propMaterials[role] === undefined) continue;
                        resolveSpecInPlace(propMaterials, role, ctx, { context: `${label} rooftop prop ${role}` });
                    }
                }
                continue;
            }

            resolveSpecInPlace(layer, 'material', ctx, {
                wallBaseKey: 'wallBase',
                tilingKey: 'tiling',
                matVarHolder: layer,
                matVarKey: 'materialVariation',
                context: `${label} wall`
            });

            if (layer.faceMaterials && typeof layer.faceMaterials === 'object') {
                for (const [faceId, faceCfg] of Object.entries(layer.faceMaterials)) {
                    if (!faceCfg || typeof faceCfg !== 'object') continue;
                    resolveSpecInPlace(faceCfg, 'material', ctx, {
                        wallBaseKey: 'wallBase',
                        tilingKey: 'tiling',
                        matVarHolder: faceCfg,
                        matVarKey: 'materialVariation',
                        context: `${label} face ${faceId}`
                    });
                }
            }

            if (layer.belt && typeof layer.belt === 'object') {
                resolveSpecInPlace(layer.belt, 'material', ctx, { tilingKey: 'tiling', context: `${label} belt` });
            }
            resolveCorniceMaterials(layer.cornice, ctx, label);

            if (layer.banding && typeof layer.banding === 'object') {
                resolveSpecInPlace(layer.banding, 'material', ctx, {
                    wallBaseKey: 'wallBase',
                    tilingKey: 'tiling',
                    context: `${label} banding`
                });
            }
        }
    }

    const outFacades = facades ? deepClone(facades) : facades;
    if (outFacades && typeof outFacades === 'object') {
        const faceIds = new Set(['A', 'B', 'C', 'D']);
        const isGlobal = Object.keys(outFacades).some((key) => faceIds.has(key));
        if (isGlobal) {
            for (const [faceId, facade] of Object.entries(outFacades)) {
                if (faceIds.has(faceId)) resolveFacadeFaceMaterials(facade, ctx, `Facade ${faceId}`);
            }
        } else {
            for (const [layerId, byFace] of Object.entries(outFacades)) {
                if (!byFace || typeof byFace !== 'object') continue;
                for (const [faceId, facade] of Object.entries(byFace)) {
                    if (faceIds.has(faceId)) resolveFacadeFaceMaterials(facade, ctx, `Facade ${layerId}/${faceId}`);
                }
            }
        }
    }

    const outWallDecorations = wallDecorations ? deepClone(wallDecorations) : wallDecorations;
    if (outWallDecorations && typeof outWallDecorations === 'object' && Array.isArray(outWallDecorations.sets)) {
        for (const set of outWallDecorations.sets) {
            if (!set || typeof set !== 'object' || !Array.isArray(set.decorations)) continue;
            for (const decoration of set.decorations) {
                const state = decoration?.state;
                if (!state || typeof state !== 'object') continue;
                resolveSpecInPlace(state, 'materialSelection', ctx, {
                    wallBaseKey: 'wallBase',
                    tilingKey: 'tiling',
                    context: `Wall decoration ${decoration?.id ?? ''}`
                });
            }
        }
    }
    // AI 508: facade lettering signs use the capital wall-material dialect.
    if (outWallDecorations && typeof outWallDecorations === 'object' && Array.isArray(outWallDecorations.lettering)) {
        for (const item of outWallDecorations.lettering) {
            if (!item || typeof item !== 'object' || item.material === null || item.material === undefined) continue;
            resolveSpecInPlace(item, 'material', ctx, { context: `Lettering ${item?.id ?? ''}` });
        }
    }

    let outCornerTreatment = cornerTreatment ? deepClone(cornerTreatment) : cornerTreatment;
    if (outCornerTreatment && typeof outCornerTreatment === 'object') {
        resolveSpecInPlace(outCornerTreatment, 'material', ctx, { tilingKey: 'tiling', context: 'Corner treatment' });
    }

    const outWindowDefinitions = windowDefinitions ? deepClone(windowDefinitions) : windowDefinitions;
    if (outWindowDefinitions && typeof outWindowDefinitions === 'object' && Array.isArray(outWindowDefinitions.items)) {
        for (const item of outWindowDefinitions.items) {
            if (!item || typeof item !== 'object') continue;
            if (item.decoration && typeof item.decoration === 'object') {
                resolveWindowDecorationMaterials(item.decoration, ctx, `Window definition ${item?.id ?? ''}`);
            }
            // AI 488: storefront zone materials and portal step materials use
            // the same decoration material shape, so the same slot walk applies.
            if (item.storefront && typeof item.storefront === 'object') {
                resolveWindowDecorationMaterials(item.storefront, ctx, `Storefront definition ${item?.id ?? ''}`);
            }
            if (item.portal && typeof item.portal === 'object') {
                resolveWindowDecorationMaterials(item.portal, ctx, `Portal definition ${item?.id ?? ''}`);
            }
        }
    }

    return {
        layers: outLayers,
        facades: outFacades,
        wallDecorations: outWallDecorations,
        cornerTreatment: outCornerTreatment,
        windowDefinitions: outWindowDefinitions,
        materialSlots: slotsCfg
    };
}
