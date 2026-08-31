// AI 537: stable balcony continuity identity, normalization, and validation.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    balconyContinuityEndpointKey,
    normalizeBalconyContinuityConfig,
    resolveBalconyContinuityLinks,
    validateBalconyContinuityConfig
} from '../../../src/app/buildings/BalconyContinuityModel.js';

const CONTINUITY = {
    links: [
        {
            id: ' front_to_side ',
            cornerPost: true,
            endpoints: [
                { faceId: 'a', bayId: ' front_outer ', edge: 'END', label: 'Front' },
                { faceId: 'b', bayId: 'side_outer', edge: 'start' }
            ]
        }
    ]
};

test('BalconyContinuityModel: absent and empty configs remain default-off', () => {
    assert.equal(normalizeBalconyContinuityConfig(null), null);
    assert.equal(normalizeBalconyContinuityConfig({}), null);
    assert.equal(normalizeBalconyContinuityConfig({ links: [] }), null);
});

test('BalconyContinuityModel: normalization emits only the canonical schema and is idempotent', () => {
    const normalized = normalizeBalconyContinuityConfig(CONTINUITY);
    assert.deepEqual(normalized, {
        links: [
            {
                id: 'front_to_side',
                endpoints: [
                    { faceId: 'A', bayId: 'front_outer', edge: 'end' },
                    { faceId: 'B', bayId: 'side_outer', edge: 'start' }
                ]
            }
        ]
    });
    assert.deepEqual(normalizeBalconyContinuityConfig(normalized), normalized);
    normalized.links[0].endpoints[0].bayId = 'changed_in_normalized_copy';
    assert.equal(CONTINUITY.links[0].endpoints[0].bayId, ' front_outer ');
});

test('BalconyContinuityModel: endpoint keys are stable and collision-safe', () => {
    assert.equal(
        balconyContinuityEndpointKey({ faceId: 'a', bayId: ' bay:with:colons ', edge: 'START' }),
        '["A","bay:with:colons","start"]'
    );
    assert.notEqual(
        balconyContinuityEndpointKey({ faceId: 'A', bayId: 'bay:with:colons', edge: 'start' }),
        balconyContinuityEndpointKey({ faceId: 'A', bayId: 'bay:with', edge: 'end' })
    );
    assert.equal(balconyContinuityEndpointKey({ faceId: 'AA', bayId: 'bay', edge: 'start' }), null);
});

test('BalconyContinuityModel: structural validation rejects duplicate ids and endpoint ownership', () => {
    const result = validateBalconyContinuityConfig({
        links: [
            {
                // Duplicate ids use different endpoints so identity and
                // endpoint-ownership diagnostics are independently covered.
                id: 'wrap',
                endpoints: [
                    { faceId: 'A', bayId: 'outer', edge: 'end' },
                    { faceId: 'B', bayId: 'outer', edge: 'start' }
                ]
            },
            {
                id: 'wrap',
                endpoints: [
                    { faceId: 'C', bayId: 'other', edge: 'end' },
                    { faceId: 'D', bayId: 'other', edge: 'start' }
                ]
            },
            {
                id: 'owner_one',
                endpoints: [
                    { faceId: 'E', bayId: 'shared', edge: 'end' },
                    { faceId: 'F', bayId: 'one', edge: 'start' }
                ]
            },
            {
                id: 'owner_two',
                endpoints: [
                    { faceId: 'E', bayId: 'shared', edge: 'end' },
                    { faceId: 'G', bayId: 'two', edge: 'start' }
                ]
            },
            {
                id: 'malformed',
                endpoints: [
                    { faceId: 'C', bayId: '', edge: 'middle' }
                ]
            }
        ]
    });

    assert.equal(result.valid, false);
    const codes = new Set(result.diagnostics.map((entry) => entry.code));
    assert.ok(codes.has('balcony_continuity_link_id_duplicate'));
    assert.ok(codes.has('balcony_continuity_endpoint_already_linked'));
    assert.ok(codes.has('balcony_continuity_bay_id_missing'));
    assert.ok(codes.has('balcony_continuity_edge_invalid'));
});

test('BalconyContinuityModel: malformed and conflicting records resolve independently of link order', () => {
    const strip = (faceId, sourceBayId) => ({
        faceId,
        sourceBayId,
        balcony: { enabled: true }
    });
    const stripsByFaceId = {
        A: [strip('A', 'a')],
        B: [strip('B', 'b')],
        C: [strip('C', 'c')],
        D: [strip('D', 'd')]
    };
    const malformed = {
        id: 'malformed',
        endpoints: [
            { faceId: 'A', bayId: 'a', edge: 'start' },
            { faceId: 'C', bayId: 'c', edge: 'end' },
            { faceId: 'D', bayId: 'd', edge: 'start' }
        ]
    };
    const good = {
        id: 'good',
        endpoints: [
            { faceId: 'A', bayId: 'a', edge: 'start' },
            { faceId: 'B', bayId: 'b', edge: 'end' }
        ]
    };
    for (const links of [[malformed, good], [good, malformed]]) {
        const result = resolveBalconyContinuityLinks({ continuity: { links }, stripsByFaceId });
        assert.deepEqual(result.links.map((link) => link.id), ['good']);
    }

    const ownerOne = {
        id: 'owner_one',
        endpoints: [
            { faceId: 'A', bayId: 'a', edge: 'start' },
            { faceId: 'B', bayId: 'b', edge: 'end' }
        ]
    };
    const ownerTwo = {
        id: 'owner_two',
        endpoints: [
            { faceId: 'A', bayId: 'a', edge: 'start' },
            { faceId: 'C', bayId: 'c', edge: 'end' }
        ]
    };
    for (const links of [[ownerOne, ownerTwo], [ownerTwo, ownerOne]]) {
        const result = resolveBalconyContinuityLinks({ continuity: { links }, stripsByFaceId });
        assert.deepEqual(result.links, []);
        assert.equal(
            result.diagnostics.filter((entry) => entry.code === 'balcony_continuity_endpoint_already_linked').length,
            2
        );
    }

    const duplicateOne = { ...ownerOne, id: 'duplicate' };
    const duplicateTwo = {
        ...ownerTwo,
        id: 'duplicate',
        endpoints: [
            { faceId: 'C', bayId: 'c', edge: 'start' },
            { faceId: 'D', bayId: 'd', edge: 'end' }
        ]
    };
    for (const links of [[duplicateOne, duplicateTwo], [duplicateTwo, duplicateOne]]) {
        const result = resolveBalconyContinuityLinks({ continuity: { links }, stripsByFaceId });
        assert.deepEqual(result.links, []);
        assert.equal(
            result.diagnostics.filter((entry) => entry.code === 'balcony_continuity_link_id_duplicate').length,
            2
        );
    }
});

test('BalconyContinuityModel: resolution uses physical face plus sourceBayId and isolates invalid links', () => {
    const result = resolveBalconyContinuityLinks({
        continuity: {
            links: [
                {
                    id: 'valid_wrap',
                    endpoints: [
                        { faceId: 'A', bayId: 'front', edge: 'end' },
                        { faceId: 'B', bayId: 'side', edge: 'start' }
                    ]
                },
                {
                    id: 'missing',
                    endpoints: [
                        { faceId: 'A', bayId: 'front', edge: 'start' },
                        { faceId: 'C', bayId: 'not_there', edge: 'end' }
                    ]
                },
                {
                    id: 'ambiguous',
                    endpoints: [
                        { faceId: 'D', bayId: 'repeated', edge: 'start' },
                        { faceId: 'E', bayId: 'plain_wall', edge: 'end' }
                    ]
                }
            ]
        },
        stripsByFaceId: {
            A: [{ faceId: 'A', sourceBayId: 'front', id: 'generated_4', balcony: { enabled: true } }],
            B: [{ faceId: 'B', sourceBayId: 'side', id: 'generated_1', balcony: { enabled: true } }],
            D: [
                { faceId: 'D', sourceBayId: 'repeated', id: 'repeat_1', balcony: { enabled: true } },
                { faceId: 'D', sourceBayId: 'repeated', id: 'repeat_2', balcony: { enabled: true } }
            ],
            E: [{ faceId: 'E', sourceBayId: 'plain_wall', id: 'wall', balcony: { enabled: false } }]
        }
    });

    assert.equal(result.valid, false);
    assert.deepEqual(result.links.map((link) => link.id), ['valid_wrap']);
    assert.equal(result.links[0].endpoints[0].strip.id, 'generated_4');
    assert.ok(result.diagnostics.some((entry) => entry.code === 'balcony_continuity_endpoint_missing'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'balcony_continuity_endpoint_ambiguous'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'balcony_continuity_endpoint_has_no_balcony'));
});
