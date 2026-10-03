// Persists bounded camera bookmarks as local viewer state independently of terrain revisions.
// @ts-check
export const LANDSCAPE_BOOKMARK_LIMIT = 24;
const MAX_BYTES = 32 * 1024;

export function validateLandscapeBookmarkCamera(input) {
    const camera = structuredClone(input);
    for (const name of ['position', 'target']) if (!Array.isArray(camera?.[name]) || camera[name].length !== 3
        || camera[name].some(value => !Number.isFinite(value) || Math.abs(value) > 1e7)) throw new Error('Bookmark camera position/target is invalid');
    if (!['perspective', 'orthographic'].includes(camera.projection) || !Number.isFinite(camera.fov) || camera.fov < 5 || camera.fov > 110
        || !Number.isFinite(camera.orthoHeight) || camera.orthoHeight < 20 || camera.orthoHeight > 20000
        || !Number.isFinite(camera.zoom) || camera.zoom < .1 || camera.zoom > 100
        || Math.hypot(...camera.position.map((value, i) => value - camera.target[i])) < .001) throw new Error('Bookmark camera projection is invalid');
    return { position: camera.position, target: camera.target, projection: camera.projection, fov: camera.fov, orthoHeight: camera.orthoHeight, zoom: camera.zoom };
}

export class LandscapeBookmarks {
    constructor({ landscapeId, source, storage = globalThis.localStorage }) {
        this.landscapeId = landscapeId; this.source = new URL(source).href; this.storage = storage;
        this.key = `landscape-view-bookmarks/v1/${encodeURIComponent(landscapeId)}/${encodeURIComponent(this.source)}`;
        this.records = []; this.error = null;
        try {
            const text = storage.getItem(this.key);
            if (!text) return;
            if (text.length > MAX_BYTES) throw new Error('Saved bookmarks exceed their local metadata budget');
            const saved = JSON.parse(text), ids = new Set();
            if (saved.format !== 'landscape-view-bookmarks' || saved.schemaVersion !== 1 || saved.landscapeId !== landscapeId || saved.source !== this.source
                || !Array.isArray(saved.bookmarks) || saved.bookmarks.length > LANDSCAPE_BOOKMARK_LIMIT) throw new Error('Saved bookmark document is incompatible');
            const records = saved.bookmarks.map(record => {
                if (typeof record.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(record.id) || ids.has(record.id)) throw new Error('Saved bookmark ID is invalid');
                ids.add(record.id);
                return { id: record.id, name: this.name(record.name), camera: validateLandscapeBookmarkCamera(record.camera) };
            });
            this.records = records;
        } catch (error) { this.error = error.message; }
    }

    name(value) {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) throw new Error('Bookmark name must contain 1–60 characters');
        return value.trim();
    }

    persist(records) {
        const text = JSON.stringify({ format: 'landscape-view-bookmarks', schemaVersion: 1, landscapeId: this.landscapeId, source: this.source, bookmarks: records });
        if (text.length > MAX_BYTES) throw new Error('Bookmarks exceed their local metadata budget');
        try { this.storage.setItem(this.key, text); }
        catch { throw new Error('Local bookmark storage is unavailable; camera and terrain are unchanged'); }
        this.records = records; this.error = null;
    }

    save(name, camera) {
        name = this.name(name);
        const records = this.snapshot(), existing = records.find(record => record.name === name);
        if (!existing && records.length >= LANDSCAPE_BOOKMARK_LIMIT) throw new Error(`At most ${LANDSCAPE_BOOKMARK_LIMIT} camera bookmarks can be saved`);
        const record = { id: existing?.id ?? crypto.randomUUID(), name, camera: validateLandscapeBookmarkCamera(camera) };
        if (existing) records[records.indexOf(existing)] = record; else records.push(record);
        this.persist(records); return structuredClone(record);
    }

    get(id) {
        const record = this.records.find(value => value.id === id);
        if (!record) throw new Error(`Unknown camera bookmark ${id}`);
        return structuredClone(record);
    }

    remove(id) { this.get(id); this.persist(this.records.filter(record => record.id !== id)); }
    snapshot() { return structuredClone(this.records); }
}
