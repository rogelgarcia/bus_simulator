// Node unit tests: wall decoration debugger registry wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEBUG_TOOL_REGISTRY } from '../../../src/states/DebugToolRegistry.js';

test('DebugToolRegistry: wall decoration debugger is registered and points to standalone html', () => {
    const entry = DEBUG_TOOL_REGISTRY.find((tool) => tool?.id === 'wall_decoration_mesh_debug') ?? null;
    assert.ok(entry, 'Expected DebugToolRegistry entry for wall_decoration_mesh_debug.');
    assert.equal(entry.key, 'Y');
    assert.equal(entry.href, 'debug_tools/wall_decoration_mesh_debug.html');

    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const htmlPath = path.join(repoRoot, 'debug_tools', 'wall_decoration_mesh_debug.html');
    assert.equal(existsSync(htmlPath), true);
});

