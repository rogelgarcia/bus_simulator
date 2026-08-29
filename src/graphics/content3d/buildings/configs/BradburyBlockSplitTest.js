// Bradbury comparison fixture: first-class collinear faces without replacing the production config.
// The clone keeps the current model as the visual baseline while making repeated street-wall segments linked authoring units.

import { BRADBURY_BLOCK_BUILDING_CONFIG } from './BradburyBlock.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

function bayWidth(bay) {
    const width = Number(bay?.size?.widthMeters);
    if (!Number.isFinite(width) || !(width > 0)) {
        throw new RangeError('BradburyBlockSplitTest: every comparison bay must have a fixed source width.');
    }
    return width;
}

function sliceFace(sourceFace, start, end) {
    const face = clone(sourceFace);
    const items = face?.layout?.bays?.items;
    if (!Array.isArray(items)) throw new TypeError('BradburyBlockSplitTest: source face is missing bay items.');
    face.layout.bays.items = items.slice(start, end);
    const selected = new Set(face.layout.bays.items.map((bay) => bay.id));
    const groups = Array.isArray(face?.layout?.groups?.items) ? face.layout.groups.items : [];
    face.layout.groups.items = groups
        .map((group) => ({ ...group, bayIds: (group.bayIds ?? []).filter((id) => selected.has(id)) }))
        .filter((group) => group.bayIds.length > 0);
    return face;
}

function makeFlexible(face, bayId, minMeters, maxMeters) {
    const bay = face?.layout?.bays?.items?.find((entry) => entry?.id === bayId) ?? null;
    if (!bay) throw new RangeError(`BradburyBlockSplitTest: missing flexible bay "${bayId}".`);
    bay.size = { mode: 'range', minMeters, maxMeters };
    bay.expandPreference = 'prefer_expand';
}

function splitFaceStarts(start, end, groups, faceIds) {
    if (groups.length !== faceIds.length) throw new RangeError('BradburyBlockSplitTest: face split metadata is inconsistent.');
    const lengths = groups.map((items) => items.reduce((sum, bay) => sum + bayWidth(bay), 0));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const runLength = Math.hypot(end.x - start.x, end.z - start.z);
    if (Math.abs(total - runLength) > 1e-4) {
        throw new RangeError(`BradburyBlockSplitTest: split lengths ${total.toFixed(3)}m do not match run ${runLength.toFixed(3)}m.`);
    }
    let traversed = 0;
    return lengths.map((length, index) => {
        const t = traversed / total;
        traversed += length;
        return {
            x: start.x + (end.x - start.x) * t,
            z: start.z + (end.z - start.z) * t,
            runId: faceIds[index],
            runForward: true,
            ...(index > 0 ? { split: true } : {})
        };
    });
}

function reauthorLayer(source, { linkField }) {
    const side = source.A;
    const entry = source.C;
    const next = {
        A: sliceFace(side, 0, 3),
        F: sliceFace(side, 3, 14),
        G: sliceFace(side, 14, 17),
        H: sliceFace(side, 17, 24),
        I: sliceFace(side, 24, 27),
        B: clone(source.B),
        J: sliceFace(entry, 0, 3),
        C: sliceFace(entry, 3, 14),
        K: sliceFace(entry, 14, 17),
        D: clone(source.D),
        E: clone(source.E)
    };
    makeFlexible(next.A, 'bp_a', 0.5, 0.9);
    if (linkField) makeFlexible(next.F, 'f3_w2', 3.1, 5.6);
    delete next.G;
    delete next.J;
    delete next.K;
    if (linkField) delete next.C;
    return next;
}

const config = clone(BRADBURY_BLOCK_BUILDING_CONFIG);
const groundSideItems = config.facades.floor_bb1.A.layout.bays.items;
const groundEntryItems = config.facades.floor_bb1.C.layout.bays.items;
const sourceLoop = config.footprintLoops[0];
const sideGroups = [
    groundSideItems.slice(0, 3),
    groundSideItems.slice(3, 14),
    groundSideItems.slice(14, 17),
    groundSideItems.slice(17, 24),
    groundSideItems.slice(24, 27)
];
const entryGroups = [
    groundEntryItems.slice(0, 3),
    groundEntryItems.slice(3, 14),
    groundEntryItems.slice(14, 17)
];

config.id = 'bradbury_block_split_test';
config.name = 'Bradbury Block · Split Test';
config.footprintLoops = [[
    ...splitFaceStarts(sourceLoop[0], sourceLoop[1], sideGroups, ['A', 'F', 'G', 'H', 'I']),
    { ...sourceLoop[1], runId: 'B', runForward: true },
    ...splitFaceStarts(sourceLoop[2], sourceLoop[3], entryGroups, ['J', 'C', 'K']),
    { ...sourceLoop[3], runId: 'D', runForward: true },
    { ...sourceLoop[4], runId: 'E', runForward: true }
]];

config.facades.floor_bb1 = reauthorLayer(config.facades.floor_bb1, { linkField: false });
config.facades.floor_bb2 = reauthorLayer(config.facades.floor_bb2, { linkField: true });
config.facades.floor_bb3 = reauthorLayer(config.facades.floor_bb3, { linkField: true });

for (const layer of config.layers) {
    if (!config.facades[layer.id]) continue;
    const links = { G: 'A', J: 'I', K: 'A', ...(layer.id === 'floor_bb1' ? {} : { C: 'F' }) };
    layer.faceLinking = { links, reverseByFace: { J: true, K: true } };
}

for (const attachment of config.attachments.items) {
    if (attachment.target.faceId !== 'A') continue;
    attachment.target.faceId = String(attachment.target.bayId).startsWith('f2_') ? 'H' : 'F';
}

export const BRADBURY_BLOCK_SPLIT_TEST_BUILDING_CONFIG = deepFreeze(config);

export default BRADBURY_BLOCK_SPLIT_TEST_BUILDING_CONFIG;
