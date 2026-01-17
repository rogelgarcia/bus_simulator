// src/graphics/content3d/catalogs/TreeMeshCatalog.js
// Defines stable ids/options for tree FBX models.
import { TREE_CONFIG } from '../../assets3d/generators/TreeConfig.js';

export const TREE_MESH_COLLECTION = Object.freeze({
    TREES_DESKTOP: 'mesh_collection.trees_desktop',
    TREES_MOBILE: 'mesh_collection.trees_mobile'
});

function normalizeQuality(value) {
    const v = String(value ?? '').toLowerCase();
    return v === 'desktop' ? 'desktop' : 'mobile';
}

function basenameWithoutExt(name) {
    const raw = String(name ?? '');
    const parts = raw.split(/[\\/]/);
    const file = parts[parts.length - 1] ?? raw;
    const dot = file.lastIndexOf('.');
    return dot > 0 ? file.slice(0, dot) : file;
}

function makeTreeMeshId(quality, fileName) {
    const q = normalizeQuality(quality);
    const base = basenameWithoutExt(fileName).toLowerCase();
    return `tree.${q}.${base}`;
}

function buildCollection({ quality, id, label }) {
    const q = normalizeQuality(quality);
    const entries = Array.isArray(TREE_CONFIG?.[q]) ? TREE_CONFIG[q] : [];
    return {
        id,
        label,
        entries: Object.freeze(entries.map((entry, index) => {
            const fileName = entry?.name ?? '';
            const base = basenameWithoutExt(fileName);
            return Object.freeze({
                id: makeTreeMeshId(q, fileName),
                label: `${label}: ${base || `Tree ${index + 1}`}`,
                collectionId: id,
                collectionLabel: label,
                fileName,
                quality: q,
                index,
                rot: Array.isArray(entry?.rot) ? entry.rot : [0, 0, 0],
                baseY: entry?.baseY ?? null,
                height: entry?.height ?? null
            });
        }))
    };
}

const COLLECTIONS = Object.freeze([
    buildCollection({ quality: 'desktop', id: TREE_MESH_COLLECTION.TREES_DESKTOP, label: 'Trees (Desktop)' }),
    buildCollection({ quality: 'mobile', id: TREE_MESH_COLLECTION.TREES_MOBILE, label: 'Trees (Mobile)' })
]);

const COLLECTION_OPTIONS = Object.freeze(COLLECTIONS.map((c) => ({ id: c.id, label: c.label })));

const ENTRY_BY_ID = new Map(COLLECTIONS.flatMap((c) => c.entries.map((e) => [e.id, e])));

export function isTreeMeshId(meshId) {
    const id = typeof meshId === 'string' ? meshId : '';
    return ENTRY_BY_ID.has(id);
}

export function getTreeMeshCollections() {
    return Array.from(COLLECTION_OPTIONS);
}

export function getTreeMeshCollectionById(collectionId) {
    const id = typeof collectionId === 'string' ? collectionId : '';
    return COLLECTIONS.find((c) => c.id === id) ?? COLLECTIONS[0] ?? null;
}

export function getTreeMeshOptionsForCollection(collectionId) {
    const collection = getTreeMeshCollectionById(collectionId);
    if (!collection) return [];
    return collection.entries.map((entry) => ({ id: entry.id, label: entry.label }));
}

export function getTreeMeshEntryById(meshId) {
    const id = typeof meshId === 'string' ? meshId : '';
    return ENTRY_BY_ID.get(id) ?? null;
}
