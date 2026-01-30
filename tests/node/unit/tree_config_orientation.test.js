// Node unit tests: Tree config sanity checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TREE_CONFIG } from '../../../src/graphics/assets3d/generators/TreeConfig.js';

test('TreeConfig: desktop tree 4 uses -90deg X rotation', () => {
    const desktop = TREE_CONFIG?.desktop;
    assert.ok(Array.isArray(desktop));

    const entry = desktop.find((e) => e?.name === 'SM_H_Tree_4.FBX');
    assert.ok(entry, 'Expected SM_H_Tree_4.FBX entry');

    const rot = entry.rot;
    assert.ok(Array.isArray(rot) && rot.length >= 1, 'Expected rot array');

    const expected = -Math.PI / 2;
    assert.ok(Math.abs(Number(rot[0]) - expected) < 1e-4);
});

