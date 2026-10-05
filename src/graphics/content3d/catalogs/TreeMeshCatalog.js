// src/graphics/content3d/catalogs/TreeMeshCatalog.js
// Defines stable ids/options for legacy trees and original urban tree models.
import { TREE_CONFIG } from '../../assets3d/generators/TreeConfig.js';

export const TREE_MESH_COLLECTION = Object.freeze({
    TREES_DESKTOP: 'mesh_collection.trees_desktop',
    TREES_MOBILE: 'mesh_collection.trees_mobile',
    LONDON_PLANE: 'mesh_collection.london_plane',
    SILVER_LINDEN: 'mesh_collection.silver_linden',
    NORTHERN_RED_OAK: 'mesh_collection.northern_red_oak',
    ARROWWOOD_VIBURNUM: 'mesh_collection.arrowwood_viburnum',
    AMERICAN_ELM: 'mesh_collection.american_elm'
});

export const URBAN_VEGETATION_VARIANTS = Object.freeze([
    Object.freeze({ id: 'mature_01', label: 'Mature 01' }),
    Object.freeze({ id: 'mature_02', label: 'Mature 02' }),
    Object.freeze({ id: 'mature_03', label: 'Mature 03' })
]);

export const URBAN_VEGETATION_SPECIES = Object.freeze([
    Object.freeze({ id: 'london-plane', label: 'London plane', folder: 'london_plane', kind: 'tree', foliageSidedness: 'closed-shell', collectionId: TREE_MESH_COLLECTION.LONDON_PLANE, assetRevision: 'london-plane-v6' }),
    Object.freeze({ id: 'silver-linden', label: 'Silver linden', folder: 'silver_linden', kind: 'tree', foliageSidedness: 'closed-shell', collectionId: TREE_MESH_COLLECTION.SILVER_LINDEN, assetRevision: 'silver-linden-v5' }),
    Object.freeze({ id: 'northern-red-oak', label: 'Northern red oak', folder: 'northern_red_oak', kind: 'tree', foliageSidedness: 'closed-shell', collectionId: TREE_MESH_COLLECTION.NORTHERN_RED_OAK, assetRevision: 'northern-red-oak-v5' }),
    Object.freeze({ id: 'arrowwood-viburnum', label: 'Arrowwood viburnum', folder: 'arrowwood_viburnum', kind: 'shrub', foliageSidedness: 'closed-shell', collectionId: TREE_MESH_COLLECTION.ARROWWOOD_VIBURNUM, assetRevision: 'arrowwood-viburnum-v6' }),
    Object.freeze({ id: 'american-elm', label: 'American elm', folder: 'american_elm', kind: 'tree', foliageSidedness: 'closed-shell', collectionId: TREE_MESH_COLLECTION.AMERICAN_ELM, assetRevision: 'american-elm-v1' })
]);

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

function buildUrbanVegetationCollection(species) {
    return Object.freeze({
        id: species.collectionId,
        label: species.label,
        entries: Object.freeze(URBAN_VEGETATION_VARIANTS.map((variant, index) => Object.freeze({
            id: `tree.${species.id}.${variant.id}`,
            label: `${species.label}: ${variant.label}`,
            collectionId: species.collectionId,
            collectionLabel: species.label,
            fileName: `${variant.id}.glb`,
            species: species.id,
            family: 'urban-vegetation',
            vegetationKind: species.kind,
            growthStage: 'mature',
            assetRevision: species.assetRevision,
            variant: variant.id,
            index,
            rot: Object.freeze([0, 0, 0]),
            baseY: 0,
            height: null
        })))
    });
}

const COLLECTIONS = Object.freeze([
    buildCollection({ quality: 'desktop', id: TREE_MESH_COLLECTION.TREES_DESKTOP, label: 'Trees (Desktop)' }),
    buildCollection({ quality: 'mobile', id: TREE_MESH_COLLECTION.TREES_MOBILE, label: 'Trees (Mobile)' }),
    ...URBAN_VEGETATION_SPECIES.map(buildUrbanVegetationCollection)
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
