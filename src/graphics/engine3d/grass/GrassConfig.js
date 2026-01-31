// src/graphics/engine3d/grass/GrassConfig.js
// Sanitizers and defaults for the grass engine.
// @ts-check

import { GRASS_LOD_TIERS } from './GrassLodEvaluator.js';

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeHexColor(value) {
    const raw = String(value ?? '').trim();
    const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    return `#${m[1].toUpperCase()}`;
}

function sanitizeLodMask(mask, { enableMaster = true } = {}) {
    const src = mask && typeof mask === 'object' ? mask : {};
    /** @type {Record<string, boolean>} */
    const out = { master: !!src.master, near: !!src.near, mid: !!src.mid, far: !!src.far };
    if (!enableMaster) out.master = false;
    if (!(out.master || out.near || out.mid || out.far)) out.near = true;
    return out;
}

function sanitizeForce(value) {
    const v = String(value ?? 'auto');
    if (v === 'master' || v === 'near' || v === 'mid' || v === 'far' || v === 'none') return v;
    return 'auto';
}

function sanitizeRenderMode(value, fallback) {
    const v = String(value ?? '');
    if (v === 'tuft' || v === 'star' || v === 'cross' || v === 'cross_sparse' || v === 'none') return v;
    return String(fallback ?? 'cross');
}

function makeDefaultField() {
    return {
        enabled: true,
        density: 0.18,
        color: {
            base: '#2E8F3D',
            variation: {
                hueShiftDeg: { min: -6.0, max: 6.0 },
                saturationMul: { min: 0.85, max: 1.15 },
                brightnessMul: { min: 0.8, max: 1.15 }
            }
        },
        height: { min: 0.03, max: 0.05 },
        lod: { allow: { master: true, near: true, mid: true, far: true }, force: 'auto' }
    };
}

export function createDefaultGrassEngineConfig() {
    return {
        enabled: false,
        seed: 'grass-debugger',
        patch: {
            sizeMeters: 72,
            yOffset: 0.02
        },
        geometry: {
            tuft: {
                bladesPerTuft: 9,
                radius: 1.6
            },
            blade: {
                width: 0.01,
                height: 1.0
            }
        },
        material: {
            roughness: 1.0,
            metalness: 0.0
        },
        density: {
            globalMultiplier: 1.0,
            masterMul: 2.8,
            nearMul: 1.0,
            midMul: 0.42,
            farMul: 0.16
        },
        lod: {
            enableMaster: true,
            force: 'auto',
            renderMode: {
                master: 'tuft',
                near: 'star',
                mid: 'cross',
                far: 'cross_sparse'
            },
            distances: {
                master: 7,
                near: 32,
                mid: 120,
                far: 260,
                cutoff: 340
            },
            transitionWidthMeters: 12,
            angle: {
                grazingDeg: 12,
                topDownDeg: 70,
                grazingDistanceScale: 0.78,
                topDownDistanceScale: 1.22,
                masterMaxDeg: 18
            }
        },
        debug: {
            showLodRings: true,
            showLodAngleScaledRings: false
        },
        field: makeDefaultField(),
        exclusion: {
            enabled: true,
            marginMeters: 0.6
        }
    };
}

export function sanitizeGrassEngineConfig(input) {
    const src = input && typeof input === 'object' ? input : {};
    const enabled = !!src.enabled;
    const seed = String(src.seed ?? 'grass');

    const patchSrc = src.patch && typeof src.patch === 'object' ? src.patch : {};
    const legacyChunkSrc = src.chunk && typeof src.chunk === 'object' ? src.chunk : {};
    const patch = {
        sizeMeters: Math.max(4, Math.round(clamp(patchSrc.sizeMeters ?? legacyChunkSrc.sizeMeters, 4, 2000, 72))),
        yOffset: clamp(patchSrc.yOffset ?? legacyChunkSrc.yOffset, -1.0, 1.0, 0.02)
    };

    const geoSrc = src.geometry && typeof src.geometry === 'object' ? src.geometry : {};
    const tuftSrc = geoSrc.tuft && typeof geoSrc.tuft === 'object' ? geoSrc.tuft : {};
    const bladeSrc = geoSrc.blade && typeof geoSrc.blade === 'object' ? geoSrc.blade : {};
    const geometry = {
        tuft: {
            bladesPerTuft: Math.max(1, Math.round(clamp(tuftSrc.bladesPerTuft, 1, 32, 9))),
            radius: clamp(tuftSrc.radius, 0.0, 6.0, 1.6)
        },
        blade: {
            width: clamp(bladeSrc.width, 0.001, 0.25, 0.01),
            height: clamp(bladeSrc.height, 0.05, 5.0, 1.0)
        }
    };

    const materialSrc = src.material && typeof src.material === 'object' ? src.material : {};
    const material = {
        roughness: clamp(materialSrc.roughness, 0.0, 1.0, 1.0),
        metalness: clamp(materialSrc.metalness, 0.0, 1.0, 0.0)
    };

    const densitySrc = src.density && typeof src.density === 'object' ? src.density : {};
    const density = {
        globalMultiplier: clamp(densitySrc.globalMultiplier, 0.0, 10.0, 1.0),
        masterMul: clamp(densitySrc.masterMul, 0.0, 20.0, 2.8),
        nearMul: clamp(densitySrc.nearMul, 0.0, 20.0, 1.0),
        midMul: clamp(densitySrc.midMul, 0.0, 20.0, 0.42),
        farMul: clamp(densitySrc.farMul, 0.0, 20.0, 0.16)
    };

    const lodSrc = src.lod && typeof src.lod === 'object' ? src.lod : {};
    const angleSrc = lodSrc.angle && typeof lodSrc.angle === 'object' ? lodSrc.angle : {};
    const enableMaster = lodSrc.enableMaster !== false;

    const renderSrc = lodSrc.renderMode && typeof lodSrc.renderMode === 'object' ? lodSrc.renderMode : {};
    const renderMode = {
        master: sanitizeRenderMode(renderSrc.master, 'tuft'),
        near: sanitizeRenderMode(renderSrc.near, 'star'),
        mid: sanitizeRenderMode(renderSrc.mid, 'cross'),
        far: sanitizeRenderMode(renderSrc.far, 'cross_sparse')
    };

    const distancesSrc = lodSrc.distances && typeof lodSrc.distances === 'object' ? lodSrc.distances : {};
    const masterDist = Math.max(0, Number(distancesSrc.master) || 0);
    const nearDist = Math.max(masterDist, Number(distancesSrc.near) || masterDist);
    const midDist = Math.max(nearDist, Number(distancesSrc.mid) || nearDist);
    const farDist = Math.max(midDist, Number(distancesSrc.far) || midDist);
    const cutoffDist = Math.max(farDist, Number(distancesSrc.cutoff) || farDist);

    const lod = {
        enableMaster,
        force: sanitizeForce(lodSrc.force),
        renderMode,
        distances: {
            master: clamp(masterDist, 0, 200, 7),
            near: clamp(nearDist, 0, 20000, 32),
            mid: clamp(midDist, 0, 50000, 120),
            far: clamp(farDist, 0, 50000, 260),
            cutoff: clamp(cutoffDist, 0, 50000, 340)
        },
        transitionWidthMeters: clamp(lodSrc.transitionWidthMeters, 0.01, 250.0, 12.0),
        angle: {
            grazingDeg: clamp(angleSrc.grazingDeg, 0.0, 80.0, 12.0),
            topDownDeg: clamp(angleSrc.topDownDeg, 0.0, 90.0, 70.0),
            grazingDistanceScale: clamp(angleSrc.grazingDistanceScale, 0.1, 10.0, 0.78),
            topDownDistanceScale: clamp(angleSrc.topDownDistanceScale, 0.1, 10.0, 1.22),
            masterMaxDeg: clamp(angleSrc.masterMaxDeg, 0.0, 89.0, 18.0)
        }
    };

    const debugSrc = src.debug && typeof src.debug === 'object' ? src.debug : {};
    const debug = {
        showLodRings: debugSrc.showLodRings !== false,
        showLodAngleScaledRings: debugSrc.showLodAngleScaledRings === true
    };

    const resolveLegacyField = () => {
        const list = Array.isArray(src.areas) ? src.areas : [];
        const firstArea = list.find((a) => a?.enabled !== false && (Number(a?.density) || 0) > 0) ?? list[0] ?? null;
        if (!firstArea || typeof firstArea !== 'object') return null;
        return { ...firstArea, enabled: firstArea.enabled !== false };
    };

    const fieldSrc = src.field && typeof src.field === 'object' ? src.field : resolveLegacyField() ?? makeDefaultField();
    const fieldEnabled = fieldSrc.enabled !== false;
    const fieldDensity = clamp(fieldSrc.density, 0.0, 200.0, 0.18);
    const fieldColSrc = fieldSrc.color && typeof fieldSrc.color === 'object' ? fieldSrc.color : {};
    const fieldBaseHex = normalizeHexColor(fieldColSrc.base) ?? '#2E8F3D';
    const fieldVarSrc = fieldColSrc.variation && typeof fieldColSrc.variation === 'object' ? fieldColSrc.variation : {};
    const fieldHueSrc = fieldVarSrc.hueShiftDeg && typeof fieldVarSrc.hueShiftDeg === 'object' ? fieldVarSrc.hueShiftDeg : {};
    const fieldSatSrc = fieldVarSrc.saturationMul && typeof fieldVarSrc.saturationMul === 'object' ? fieldVarSrc.saturationMul : {};
    const fieldBriSrc = fieldVarSrc.brightnessMul && typeof fieldVarSrc.brightnessMul === 'object' ? fieldVarSrc.brightnessMul : {};
    const fieldHeightSrc = fieldSrc.height && typeof fieldSrc.height === 'object' ? fieldSrc.height : {};

    const fieldAllowSrc = fieldSrc?.lod?.allow ?? fieldSrc?.lodMask ?? null;
    const fieldForceSrc = fieldSrc?.lod?.force ?? fieldSrc?.forceLod ?? null;
    const fieldAllow = sanitizeLodMask(fieldAllowSrc, { enableMaster });
    const fieldForce = sanitizeForce(fieldForceSrc);

    const heightMin = clamp(fieldHeightSrc.min, 0.01, 5.0, 0.03);
    const heightMax = Math.max(heightMin, clamp(fieldHeightSrc.max, 0.01, 5.0, 0.05));

    const field = {
        enabled: fieldEnabled,
        density: fieldDensity,
        color: {
            base: fieldBaseHex,
            variation: {
                hueShiftDeg: {
                    min: clamp(fieldHueSrc.min, -180.0, 180.0, -6.0),
                    max: clamp(fieldHueSrc.max, -180.0, 180.0, 6.0)
                },
                saturationMul: {
                    min: clamp(fieldSatSrc.min, 0.0, 5.0, 0.85),
                    max: clamp(fieldSatSrc.max, 0.0, 5.0, 1.15)
                },
                brightnessMul: {
                    min: clamp(fieldBriSrc.min, 0.0, 5.0, 0.8),
                    max: clamp(fieldBriSrc.max, 0.0, 5.0, 1.15)
                }
            }
        },
        height: { min: heightMin, max: heightMax },
        lod: { allow: fieldAllow, force: fieldForce }
    };

    const exclusionSrc = src.exclusion && typeof src.exclusion === 'object' ? src.exclusion : {};
    const exclusion = {
        enabled: exclusionSrc.enabled !== false,
        marginMeters: clamp(exclusionSrc.marginMeters, 0.0, 50.0, 0.6)
    };

    return { enabled, seed, patch, geometry, material, density, lod, debug, field, exclusion };
}

export function getGrassEngineInstanceKey(config) {
    const cfg = config && typeof config === 'object' ? config : null;
    if (!cfg) return '';

    const parts = [
        String(cfg.seed ?? ''),
        `${cfg.patch?.sizeMeters ?? ''}|${Number(cfg.patch?.yOffset ?? 0).toFixed(4)}`,
        `${Number(cfg.geometry?.blade?.width ?? 0).toFixed(4)}|${Number(cfg.geometry?.blade?.height ?? 0).toFixed(4)}`,
        `${Number(cfg.density?.globalMultiplier ?? 1).toFixed(3)}|${Number(cfg.density?.masterMul ?? 0).toFixed(3)}|${Number(cfg.density?.nearMul ?? 0).toFixed(3)}|${Number(cfg.density?.midMul ?? 0).toFixed(3)}|${Number(cfg.density?.farMul ?? 0).toFixed(3)}`,
        `${String(cfg?.lod?.renderMode?.master ?? '')}|${String(cfg?.lod?.renderMode?.near ?? '')}|${String(cfg?.lod?.renderMode?.mid ?? '')}|${String(cfg?.lod?.renderMode?.far ?? '')}`,
        `${cfg.exclusion?.enabled !== false ? '1' : '0'}|${Number(cfg.exclusion?.marginMeters ?? 0).toFixed(3)}`
    ];

    const field = cfg.field && typeof cfg.field === 'object' ? cfg.field : null;
    if (field) {
        parts.push([
            field.enabled !== false ? '1' : '0',
            Number(field.density ?? 0).toFixed(3),
            String(field?.color?.base ?? ''),
            `${Number(field?.color?.variation?.hueShiftDeg?.min ?? 0).toFixed(3)}|${Number(field?.color?.variation?.hueShiftDeg?.max ?? 0).toFixed(3)}`,
            `${Number(field?.color?.variation?.saturationMul?.min ?? 1).toFixed(3)}|${Number(field?.color?.variation?.saturationMul?.max ?? 1).toFixed(3)}`,
            `${Number(field?.color?.variation?.brightnessMul?.min ?? 1).toFixed(3)}|${Number(field?.color?.variation?.brightnessMul?.max ?? 1).toFixed(3)}`,
            `${Number(field?.height?.min ?? 0).toFixed(3)}|${Number(field?.height?.max ?? 0).toFixed(3)}`,
            String(field?.lod?.force ?? ''),
            `${field?.lod?.allow?.master ? '1' : '0'}${field?.lod?.allow?.near ? '1' : '0'}${field?.lod?.allow?.mid ? '1' : '0'}${field?.lod?.allow?.far ? '1' : '0'}`
        ].join('|'));
    }

    return parts.join('::');
}

export function getGrassLodDensityMultiplier(config, tier) {
    const t = String(tier ?? '');
    const d = config?.density ?? null;
    const base = t === 'master'
        ? Number(d?.masterMul)
        : t === 'near'
            ? Number(d?.nearMul)
            : t === 'mid'
                ? Number(d?.midMul)
                : Number(d?.farMul);

    return Math.max(0, Number.isFinite(base) ? base : 0);
}

export function getGrassTierList() {
    return GRASS_LOD_TIERS.slice();
}
