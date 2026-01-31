// Node unit tests: Markings AA debugger settings + registry guardrails.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sanitizeMarkingsAADebuggerSettings, MARKINGS_AA_DEBUGGER_DEFAULTS } from '../../../src/graphics/gui/markings_aa_debugger/MarkingsAADebuggerSettings.js';
import { DEBUG_TOOL_REGISTRY } from '../../../src/states/DebugToolRegistry.js';

test('MarkingsAADebuggerSettings: defaults are sane', () => {
    const s = sanitizeMarkingsAADebuggerSettings(MARKINGS_AA_DEBUGGER_DEFAULTS);
    assert.ok(['normal', 'depth', 'markings', 'composite'].includes(s.viewMode));
    assert.equal(typeof s.markingsBufferScale, 'number');
    assert.ok(s.markingsBufferScale >= 1 && s.markingsBufferScale <= 4);
    assert.ok([0, 2, 4, 8].includes(s.markingsBufferSamples));
    assert.match(String(s.markingsVizBackgroundColor), /^#[0-9A-F]{6}$/);
    assert.equal(typeof s.depthVizRangeMeters, 'number');
    assert.ok(s.depthVizRangeMeters >= 5);
    assert.equal(typeof s.depthVizPower, 'number');
    assert.ok(s.depthVizPower >= 0.25);
    assert.equal(typeof s.markingsOcclusionBiasMeters, 'number');
    assert.ok(s.markingsOcclusionBiasMeters >= 0);
    assert.equal(typeof s.seed, 'string');
    assert.equal(typeof s.occluderCount, 'number');
});

test('MarkingsAADebuggerSettings: sanitize clamps + normalizes', () => {
    const s = sanitizeMarkingsAADebuggerSettings({
        viewMode: ' SCENE ',
        markingsBufferScale: 999,
        markingsBufferSamples: 5,
        markingsVizBackgroundColor: '#abc',
        depthVizRangeMeters: -1,
        depthVizPower: 999,
        markingsOcclusionBiasMeters: -1,
        seed: '   ',
        occluderCount: -123
    });

    assert.equal(s.viewMode, 'normal');
    assert.equal(s.markingsBufferScale, 4);
    assert.equal(s.markingsBufferSamples, 8);
    assert.equal(s.markingsVizBackgroundColor, '#AABBCC');
    assert.equal(s.depthVizRangeMeters, 5);
    assert.equal(s.depthVizPower, 8);
    assert.equal(s.markingsOcclusionBiasMeters, 0);
    assert.equal(s.seed, 'markings-aa-debug');
    assert.equal(s.occluderCount, 0);
});

test('DebugToolRegistry: markings AA debugger is registered and loadable', () => {
    const entry = DEBUG_TOOL_REGISTRY.find((tool) => tool?.id === 'markings_aa_debug') ?? null;
    assert.ok(entry, 'Expected DebugToolRegistry entry for markings_aa_debug');
    assert.equal(entry.key, '4');
    assert.equal(entry.href, 'debug_tools/markings_aa_debug.html');

    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const htmlPath = path.join(repoRoot, 'debug_tools', 'markings_aa_debug.html');
    assert.equal(existsSync(htmlPath), true);
});
