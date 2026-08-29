// Owns persisted static-visibility settings and emergency category opt-outs.
// @ts-check

import { STATIC_VISIBILITY_CATEGORIES } from './StaticVisibilityProfile.js';

const STORAGE_KEY = 'bus_sim.staticVisibility.v1';

const DEFAULT_CATEGORIES = Object.freeze(Object.fromEntries(STATIC_VISIBILITY_CATEGORIES.map((id) => [id, true])));

export const STATIC_VISIBILITY_DEFAULTS = Object.freeze({
    enabled: true,
    categories: DEFAULT_CATEGORIES,
    diagnostics: false
});

export function sanitizeStaticVisibilitySettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const rawCategories = src.categories && typeof src.categories === 'object' ? src.categories : {};
    const categories = {};
    for (const category of STATIC_VISIBILITY_CATEGORIES) categories[category] = rawCategories[category] !== false;
    return {
        enabled: src.enabled !== false,
        categories,
        diagnostics: src.diagnostics === true
    };
}

export function loadSavedStaticVisibilitySettings() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage?.getItem(STORAGE_KEY);
        if (!raw) return null;
        return sanitizeStaticVisibilitySettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveStaticVisibilitySettings(settings) {
    if (typeof window === 'undefined') return false;
    try {
        const storage = window.localStorage;
        if (!storage) return false;
        storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStaticVisibilitySettings(settings)));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedStaticVisibilitySettings() {
    if (typeof window === 'undefined') return false;
    try {
        const storage = window.localStorage;
        if (!storage) return false;
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function getResolvedStaticVisibilitySettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedStaticVisibilitySettings();
    const resolved = sanitizeStaticVisibilitySettings({
        ...STATIC_VISIBILITY_DEFAULTS,
        ...(saved ?? {}),
        categories: { ...DEFAULT_CATEGORIES, ...(saved?.categories ?? {}) }
    });
    if (!includeUrlOverrides || typeof window === 'undefined') return resolved;

    const params = new URLSearchParams(window.location.search);
    if (params.has('visibilityMap')) {
        const value = String(params.get('visibilityMap') ?? '').trim().toLowerCase();
        resolved.enabled = !['0', 'false', 'no', 'off', 'disabled'].includes(value);
    }
    if (params.has('visibilityMapDebug')) {
        const value = String(params.get('visibilityMapDebug') ?? '').trim().toLowerCase();
        resolved.diagnostics = !['0', 'false', 'no', 'off'].includes(value);
    }
    for (const category of STATIC_VISIBILITY_CATEGORIES) {
        const key = `visibilityMap.${category}`;
        if (!params.has(key)) continue;
        const value = String(params.get(key) ?? '').trim().toLowerCase();
        resolved.categories[category] = !['0', 'false', 'no', 'off'].includes(value);
    }
    return resolved;
}

export function getDefaultResolvedStaticVisibilitySettings() {
    return sanitizeStaticVisibilitySettings(STATIC_VISIBILITY_DEFAULTS);
}
