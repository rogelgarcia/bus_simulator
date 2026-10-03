// Keeps Landscape Fabrication reachable as a distinct standalone tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getFabricationQMenuScreens } from '../../../src/states/QMenuScreenRegistry.js';

test('Landscape Fabrication: has a unique shortcut and existing standalone screen', () => {
    const screens = getFabricationQMenuScreens();
    const entry = screens.find(item => item.id === 'landscape_fabrication');
    assert.equal(entry.key, '8');
    assert.equal(screens.filter(item => item.key === entry.key).length, 1);
    assert.equal(existsSync(new URL(`../../../${entry.href}`, import.meta.url)), true);
});
