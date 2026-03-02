// Node unit tests: coloring debugger registry wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEBUG_TOOL_REGISTRY } from '../../../src/states/DebugToolRegistry.js';

test('DebugToolRegistry: coloring debugger is registered and points to standalone html', () => {
    const entry = DEBUG_TOOL_REGISTRY.find((tool) => tool?.id === 'coloring_debug') ?? null;
    assert.ok(entry, 'Expected DebugToolRegistry entry for coloring_debug.');
    assert.equal(entry.key, 'C');
    assert.equal(entry.href, 'debug_tools/coloring_debugger.html');

    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const htmlPath = path.join(repoRoot, 'debug_tools', 'coloring_debugger.html');
    assert.equal(existsSync(htmlPath), true);
});

test('DebugToolRegistry: coloring debugger key does not collide with another debug tool', () => {
    const entries = DEBUG_TOOL_REGISTRY.filter((tool) => String(tool?.key ?? '').toUpperCase() === 'C');
    assert.equal(entries.length, 1, 'Expected shortcut key C to be unique among debug tools.');
    assert.equal(entries[0]?.id, 'coloring_debug');
});
