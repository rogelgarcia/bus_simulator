// src/graphics/content3d/materials/PbrAssetsRuntime.js
// Detects whether local-only PBR assets are available and enables safe URL resolution.

const STORAGE_KEY = 'bus_sim.pbr_assets.enabled.v1';

let _available = false;
let _probed = false;
let _probePromise = null;

function readStorageEnabled() {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true' || raw === 'yes';
}

function writeStorageEnabled(enabled) {
    if (typeof window === 'undefined') return;
    const storage = window.localStorage;
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
        // ignore
    }
}

export function getPbrAssetsAvailable() {
    return _available;
}

export function getPbrAssetsEnabled() {
    return _available && readStorageEnabled();
}

export function setPbrAssetsEnabled(enabled, { persist = true } = {}) {
    const next = !!enabled;
    if (persist) writeStorageEnabled(next);
    return getPbrAssetsEnabled();
}

async function probeUrl(url) {
    try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        return !!res && res.ok;
    } catch {
        return false;
    }
}

export function primePbrAssetsAvailability() {
    if (_probed) return Promise.resolve(_available);
    if (_probePromise) return _probePromise;

    const manifestUrl = new URL('../../../../assets/public/pbr/_manifest.json', import.meta.url).toString();
    const fallbackUrl = new URL('../../../../assets/public/pbr/red_brick/basecolor.jpg', import.meta.url).toString();

    _probePromise = Promise.resolve()
        .then(async () => {
            const manifestOk = await probeUrl(manifestUrl);
            if (manifestOk) return true;
            return probeUrl(fallbackUrl);
        })
        .then((ok) => {
            _available = !!ok;
            _probed = true;
            _probePromise = null;
            return _available;
        })
        .catch(() => {
            _available = false;
            _probed = true;
            _probePromise = null;
            return _available;
        });

    return _probePromise;
}

primePbrAssetsAvailability().catch(() => {});
