// Verifies original-tree selection stays isolated from the stable legacy catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TREE_CONFIG } from '../../../src/graphics/assets3d/generators/TreeConfig.js';
import {
    getTreeMeshCollections,
    getTreeMeshEntryById,
    getTreeMeshOptionsForCollection,
    isTreeMeshId,
    TREE_MESH_COLLECTION,
    URBAN_VEGETATION_SPECIES
} from '../../../src/graphics/content3d/catalogs/TreeMeshCatalog.js';

test('Vegetation: original library preserves legacy collections, filenames, tiers, and selection order', () => {
    assert.deepEqual(getTreeMeshCollections().slice(0, 2), [
        { id: 'mesh_collection.trees_desktop', label: 'Trees (Desktop)' },
        { id: 'mesh_collection.trees_mobile', label: 'Trees (Mobile)' }
    ]);
    for (const quality of ['desktop', 'mobile']) {
        const options = getTreeMeshOptionsForCollection(TREE_MESH_COLLECTION[`TREES_${quality.toUpperCase()}`]);
        assert.equal(options.length, TREE_CONFIG[quality].length);
        for (let index = 0; index < options.length; index += 1) {
            const expectedFile = TREE_CONFIG[quality][index].name;
            const id = `tree.${quality}.${expectedFile.replace(/\.fbx$/i, '').toLowerCase()}`;
            assert.equal(options[index].id, id);
            assert.equal(getTreeMeshEntryById(id).fileName, expectedFile);
            assert.equal(getTreeMeshEntryById(id).quality, quality);
            assert.equal(Object.hasOwn(getTreeMeshEntryById(id), 'species'), false);
        }
    }
});

test('Vegetation: five species each expose exactly three mature models without quality tiers', () => {
    const ids = new Set();
    assert.deepEqual(URBAN_VEGETATION_SPECIES.map(species => species.id), ['london-plane', 'silver-linden', 'northern-red-oak', 'arrowwood-viburnum', 'american-elm']);
    assert.equal(getTreeMeshCollections().length, 7);
    for (const species of URBAN_VEGETATION_SPECIES) {
        const collectionId = species.collectionId;
        const options = getTreeMeshOptionsForCollection(collectionId);
        assert.equal(options.length, 3);
        options.forEach(({ id }, index) => {
            const entry = getTreeMeshEntryById(id);
            const variant = `mature_0${index + 1}`;
            assert.equal(id, `tree.${species.id}.${variant}`);
            assert.equal(isTreeMeshId(id), true);
            assert.equal(entry.family, 'urban-vegetation');
            assert.equal(entry.species, species.id);
            assert.equal(entry.fileName, `${variant}.glb`);
            assert.equal(entry.growthStage, 'mature');
            assert.equal(entry.vegetationKind, species.kind);
            assert.equal(Object.hasOwn(entry, 'quality'), false);
            assert.equal(/desktop|mobile/i.test(entry.label + entry.collectionLabel + entry.fileName), false);
            assert.equal(entry.index, index);
            assert.equal(entry.collectionId, collectionId);
            assert.equal(Object.isFrozen(entry), true);
            assert.equal(ids.has(id), false);
            ids.add(id);
        });
    }
    assert.equal(ids.size, 15);
    assert.equal(isTreeMeshId('tree.london-plane.desktop.mature'), false);
    assert.equal(isTreeMeshId('tree.london-plane.mobile.mature'), false);
    assert.equal(isTreeMeshId('tree.london-plane.young'), false);
});

test('Vegetation: every species uses closed modeled leaf shells', () => {
    assert.ok(URBAN_VEGETATION_SPECIES.every(species => species.foliageSidedness === 'closed-shell'));
    assert.equal(URBAN_VEGETATION_SPECIES.find(species => species.id === 'arrowwood-viburnum').kind, 'shrub');
});
