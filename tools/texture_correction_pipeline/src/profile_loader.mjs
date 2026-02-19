// Resolves baseline or custom profile modules for texture correction runs.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import DEFAULT_TEXTURE_CORRECTION_PROFILE from './default_profile.mjs';
import { CORRECTION_PRESET_BASELINE } from './constants.mjs';

function asObject(value) {
    return value && typeof value === 'object' ? value : null;
}

function normalizeProfile(profile) {
    const src = asObject(profile);
    if (!src) throw new Error('Profile must export an object.');
    const profileId = typeof src.profileId === 'string' && src.profileId.trim() ? src.profileId.trim() : 'unnamed_profile';
    const presets = asObject(src.presets);
    if (!presets) throw new Error(`Profile ${profileId} is missing presets.`);
    return Object.freeze({
        ...src,
        profileId,
        presets
    });
}

export async function loadTextureCorrectionProfile({ repoRoot, profilePath } = {}) {
    if (!profilePath) return normalizeProfile(DEFAULT_TEXTURE_CORRECTION_PROFILE);
    const absPath = path.resolve(repoRoot, profilePath);
    const profileUrl = pathToFileURL(absPath).href;
    const mod = await import(profileUrl);
    const profile = mod?.default ?? mod?.TEXTURE_CORRECTION_PROFILE ?? null;
    return normalizeProfile(profile);
}

export function resolvePresetProfile({ profile, presetId }) {
    const effectivePresetId = typeof presetId === 'string' && presetId.trim() ? presetId.trim() : CORRECTION_PRESET_BASELINE;
    const presets = asObject(profile?.presets);
    if (!presets) throw new Error(`Profile ${profile?.profileId ?? 'unknown'} does not define presets.`);
    const preset = asObject(presets[effectivePresetId]);
    if (!preset) {
        const known = Object.keys(presets).sort((a, b) => a.localeCompare(b));
        throw new Error(`Preset "${effectivePresetId}" is not defined in profile ${profile?.profileId ?? 'unknown'}. Known presets: ${known.join(', ') || '(none)'}`);
    }
    return Object.freeze({
        presetId: effectivePresetId,
        preset
    });
}

