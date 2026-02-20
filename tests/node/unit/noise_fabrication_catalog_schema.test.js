// Node unit tests: Noise fabrication catalog schema and generator alignment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listNoiseCatalogEntries, validateNoiseCatalogEntries } from '../../../src/graphics/gui/noise_fabrication/NoiseFabricationCatalog.js';
import { listNoiseTextureGenerators } from '../../../src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js';

test('Noise catalog: schema is valid and references known generators', () => {
    const entries = listNoiseCatalogEntries();
    const generatorIds = listNoiseTextureGenerators().map((generator) => generator.id);
    const validation = validateNoiseCatalogEntries(entries, { validGeneratorIds: generatorIds });

    assert.equal(validation.valid, true, validation.errors.join('\n'));
    assert.ok(entries.length >= 10, 'Expected baseline catalog families plus legacy cloud/ridged entries.');
});

test('Noise catalog: each entry carries practical usage context and map-target hints', () => {
    const entries = listNoiseCatalogEntries();

    for (const entry of entries) {
        assert.match(entry.usageExample, /(sidewalk|wall|stone|tile)/i, `Missing concrete usage context in ${entry.id}`);
        assert.ok(entry.mapTargetHints.normal.length > 0, `${entry.id} missing Normal hint`);
        assert.ok(entry.mapTargetHints.albedo.length > 0, `${entry.id} missing Albedo hint`);
        assert.ok(entry.mapTargetHints.orm.length > 0, `${entry.id} missing ORM hint`);
    }
});
