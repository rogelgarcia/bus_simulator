// Node unit tests: Lab Scene debug-tool registration guardrails.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEBUG_TOOL_REGISTRY } from '../../../src/states/DebugToolRegistry.js';

test('DebugToolRegistry: lab scene is registered and points to standalone html', () => {
    const entry = DEBUG_TOOL_REGISTRY.find((tool) => tool?.id === 'lab_scene') ?? null;
    assert.ok(entry, 'Expected DebugToolRegistry entry for lab_scene');
    assert.equal(entry.key, 'L');
    assert.equal(entry.href, 'debug_tools/lab_scene.html');

    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const htmlPath = path.join(repoRoot, 'debug_tools', 'lab_scene.html');
    assert.equal(existsSync(htmlPath), true);
});

test('DebugToolRegistry: lab scene key does not collide with another debug tool', () => {
    const entries = DEBUG_TOOL_REGISTRY.filter((tool) => String(tool?.key ?? '').toUpperCase() === 'L');
    assert.equal(entries.length, 1, 'Expected shortcut key L to be unique among debug tools');
    assert.equal(entries[0]?.id, 'lab_scene');
});
