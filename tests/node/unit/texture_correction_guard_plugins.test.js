// Node unit tests for deterministic guard plugins and baseline profile coverage.
import test from 'node:test';
import assert from 'node:assert/strict';

import DEFAULT_TEXTURE_CORRECTION_PROFILE from '../../../tools/texture_correction_pipeline/src/default_profile.mjs';
import { roughnessInversionGuardPlugin } from '../../../tools/texture_correction_pipeline/src/plugins/roughness_inversion_guard_plugin.mjs';
import { scalarMapClippingGuardPlugin } from '../../../tools/texture_correction_pipeline/src/plugins/scalar_map_clipping_guard_plugin.mjs';
import { metalnessPolicyPlugin } from '../../../tools/texture_correction_pipeline/src/plugins/metalness_policy_plugin.mjs';

test('Texture correction guards: roughness inversion guard enables inversion on strong evidence', () => {
    const result = roughnessInversionGuardPlugin.run({
        classId: 'grass',
        pluginOptions: {
            enabled: true,
            minEvidenceCount: 2
        },
        analysis: {
            mapMetrics: {
                roughness: {
                    available: true,
                    p10: 0.04,
                    p50: 0.21,
                    p90: 0.48,
                    usableRangeWidth: 0.44,
                    clippingLowPct: 0.61
                }
            }
        }
    });

    assert.equal(result.applied, true);
    assert.equal(result.adjustments.roughness.invertInput, true);
    assert.ok(Array.isArray(result.warnings));
    assert.ok(result.warnings.some((warning) => warning.includes('roughness_inversion_guard')));
});

test('Texture correction guards: scalar clipping guard reports clipping warnings deterministically', () => {
    const result = scalarMapClippingGuardPlugin.run({
        classId: 'grass',
        pluginOptions: {
            enabled: true,
            albedoClipThreshold: 0.02
        },
        analysis: {
            mapMetrics: {
                albedo: { clippingWhitePct: 0.05, clippingBlackPct: 0.0 },
                roughness: { clippingLowPct: 0.72, clippingHighPct: 0.01 },
                ao: { available: true, binaryMass: 0.95 },
                metalness: { available: true, mean: 0.22 }
            }
        }
    });

    assert.equal(result.applied, true);
    assert.ok(Array.isArray(result.warnings));
    assert.ok(result.warnings.some((warning) => warning.includes('scalar_map_clipping_guard:albedo_white_clipping_high')));
    assert.ok(result.warnings.some((warning) => warning.includes('scalar_map_clipping_guard:roughness_low_clipping_high')));
});

test('Texture correction guards: metalness policy emits constant non-metal adjustment', () => {
    const result = metalnessPolicyPlugin.run({
        classId: 'grass',
        pluginOptions: {
            enabled: true,
            value: 0.0
        }
    });

    assert.equal(result.applied, true);
    assert.equal(result.adjustments.metalness.value, 0);
});

test('Texture correction profile: aces class defaults cover all catalog classes with plausible grass target', async () => {
    const profilePreset = DEFAULT_TEXTURE_CORRECTION_PROFILE.presets.aces;
    const classProfiles = profilePreset.classProfiles;
    const catalog = await import('../../../assets/public/pbr/_catalog_index.js');
    const catalogClassIds = [...new Set((catalog.PBR_MATERIAL_CATALOG ?? []).map((entry) => String(entry.classId ?? '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    for (const classId of catalogClassIds) {
        assert.ok(classProfiles[classId], `Missing class profile for ${classId}`);
    }

    const grassRoughness = classProfiles.grass?.pluginOptions?.roughness_interval_remap ?? null;
    assert.ok(Number.isFinite(grassRoughness?.min));
    assert.ok(Number.isFinite(grassRoughness?.max));
    assert.ok(grassRoughness.min >= 0.6 && grassRoughness.min <= 0.7);
    assert.ok(grassRoughness.max >= 0.9 && grassRoughness.max <= 1.0);
});
