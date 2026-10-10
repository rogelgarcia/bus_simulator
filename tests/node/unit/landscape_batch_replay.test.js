// AI 596 D4: explicit edits survive regeneration. The accepted batches of a previous landscape replay onto a regenerated one through the
// authoring store in acceptance order, bit for bit when the grid is unchanged; a batch the new terrain invalidates is reported, not dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectAcceptedLandscapeBatches, createReplayBatch, explainReplaySkip, replayAcceptedBatches, LANDSCAPE_REPLAY_SKIP_CODES } from '../../../tools/landscape_authoring/BatchReplay.mjs';
import { createLandscapeAuthoringStore } from '../../../tools/landscape_authoring/LandscapeAuthoringStore.mjs';
import { readLandscapeFileChunk, readLandscapeFileManifest } from '../../../tools/landscape_authoring/LandscapeFileIO.mjs';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { landscapeCacheSkip } from '../../shared/landscapeCacheTest.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURE_0977 = 'assets/public/landscape/ai596-d3-fixture-0977', FIXTURE_1953 = 'assets/public/landscape/ai596-d3-fixture-1953';
const work = path.join(root, 'tests/artifacts/screens/landscape/ai596/d4/replay');
const skip = landscapeCacheSkip(['manifest.json'], FIXTURE_0977) || landscapeCacheSkip(['manifest.json'], FIXTURE_1953);

/** A fresh saved copy of one published fixture landscape (manifest + payloads) under the replay evidence folder. */
async function copyFixture(source, name) {
    const directory = path.join(work, name);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await cp(path.join(root, source, 'manifest.json'), path.join(directory, 'manifest.json'));
    await cp(path.join(root, source, 'payloads'), path.join(directory, 'payloads'), { recursive: true });
    return directory;
}

/** Height channel hash per chunk id, the identity a bit-identical replay must reproduce (channel URLs are content addressed). */
async function heightHashes(directory) {
    const { manifest } = await readLandscapeFileManifest(directory);
    return { manifest, hashes: new Map(manifest.chunks.map(chunk => [chunk.id, chunk.channels.height.sha256])) };
}

const hexagon = (centre, radii) => radii.map((radius, index) => { const angle = (index * 60 + 11) * Math.PI / 180; return { x: centre.x + radius * Math.cos(angle), z: centre.z + radius * Math.sin(angle) }; });
const raiseCircle = { type: 'circle', center: { x: 800, z: 200 }, radius: 40 }, raiseFalloff = { type: 'linear', distance: 10 }, raiseDelta = 2.5;

/** The four batches an author applied on the previous landscape: a four-chunk grade/smooth/soil patch, a raise, a fine smooth and one that was reverted. */
function authoredBatches(manifest) {
    const bind = batch => ({ format: 'landscape-edit-batch', schemaVersion: 1, landscapeId: manifest.id, ...batch });
    return {
        patch: bind({ id: 'd4-replay-patch', regions: [{ id: 'd4-replay-hexagon', name: 'AI 596 D4 replay patch', region: { type: 'polygon', points: hexagon({ x: 500, z: 500 }, [31, 28.5, 30.2, 29.1, 32, 27.7]) } }],
            operations: [
                { id: 'd4-replay-patch/grade', type: 'grade', regionId: 'd4-replay-hexagon', falloff: { type: 'linear', distance: 6 }, start: { x: 474, z: 500, heightMeters: 16.5 }, end: { x: 526, z: 500, heightMeters: 14 }, note: 'graded towards the east' },
                { id: 'd4-replay-patch/smooth', type: 'smooth', regionId: 'd4-replay-hexagon', falloff: { type: 'none' }, radiusMeters: 7, strength: 0.5 },
                { id: 'd4-replay-patch/sand', type: 'assign-soil', regionId: 'd4-replay-hexagon', falloff: { type: 'none' }, soilId: 'sand' }
            ] }),
        raise: bind({ id: 'd4-replay-raise', operations: [{ id: 'd4-replay-raise/up', type: 'raise', region: raiseCircle, falloff: raiseFalloff, deltaMeters: raiseDelta }] }),
        fine: bind({ id: 'd4-replay-fine-smooth', operations: [{ id: 'd4-replay-fine-smooth/pass', type: 'smooth', region: { type: 'circle', center: { x: 250, z: 750 }, radius: 30 }, falloff: { type: 'none' }, radiusMeters: 1.2, strength: 1 }] }),
        reverted: bind({ id: 'd4-replay-reverted', operations: [{ id: 'd4-replay-reverted/down', type: 'raise', region: { type: 'circle', center: { x: 200, z: 200 }, radius: 20 }, falloff: { type: 'none' }, deltaMeters: -1 }] })
    };
}

test('Batch replay: accepted batches of a previous landscape replay bit for bit onto a regenerated copy, with provenance, in acceptance order', { skip, timeout: 180000 }, async () => {
    const previous = await copyFixture(FIXTURE_0977, 'previous-edited'), regenerated = await copyFixture(FIXTURE_0977, 'regenerated');
    const original = await heightHashes(previous);
    const batches = authoredBatches(original.manifest), store = createLandscapeAuthoringStore({ directory: previous });
    let revision = original.manifest.revision;
    for (const batch of [batches.patch, batches.raise, batches.fine, batches.reverted]) revision = (await store.apply({ ...batch, expectedRevision: revision })).revision;
    const reverted = await store.revert({ expectedRevision: revision, batchId: batches.reverted.id });
    const edited = await heightHashes(previous);
    assert.deepEqual(edited.manifest.editHistory.batchIds, [batches.patch.id, batches.raise.id, batches.fine.id, batches.reverted.id]);
    assert.equal(edited.manifest.operations.length, 5, 'the reverted batch left only its tombstone');

    const collected = collectAcceptedLandscapeBatches(edited.manifest);
    assert.deepEqual(collected.accepted.map(batch => batch.id), [batches.patch.id, batches.raise.id, batches.fine.id]);
    assert.deepEqual(collected.tombstones, [batches.reverted.id]);
    assert.deepEqual(collected.accepted[0].regions.map(region => region.id), ['d4-replay-hexagon'], 'the named region is attributed to the batch that introduced it');
    assert.deepEqual(collected.accepted.slice(1).map(batch => batch.regions.length), [0, 0]);

    const logs = [];
    const summary = await replayAcceptedBatches({ previousDirectory: previous, directory: regenerated, log: message => logs.push(message) });
    assert.equal(summary.format, 'landscape-edit-replay');
    assert.deepEqual(summary.replayed.map(batch => batch.batchId), [batches.patch.id, batches.raise.id, batches.fine.id]);
    assert.deepEqual(summary.skipped, []);
    assert.deepEqual(summary.previous.tombstones, [batches.reverted.id]);
    assert.equal(summary.previous.revision, reverted.revision);
    assert.equal(summary.revisions.length, 4);
    assert.equal(summary.revisions[0], original.manifest.revision);
    assert.equal(summary.target.revision, summary.revisions.at(-1));
    assert.equal(summary.replayed[0].changedNativeIds.length, 4, 'the patch straddles the four natives around (500, 500)');
    assert.ok(logs.some(line => /replayed d4-replay-patch/.test(line)));

    // every height channel (natives and rebuilt ancestors) of the regenerated copy is the previous edited channel, bit for bit
    const replayed = await heightHashes(regenerated);
    assert.notDeepEqual([...replayed.hashes.values()], [...original.hashes.values()], 'the replay changed the regenerated terrain');
    for (const [id, hash] of edited.hashes) assert.equal(replayed.hashes.get(id), hash, `height channel of ${id}`);
    for (const chunk of replayed.manifest.chunks) {
        const before = edited.manifest.chunks.find(entry => entry.id === chunk.id);
        assert.deepEqual([chunk.minHeight, chunk.maxHeight, chunk.geometricError], [before.minHeight, before.maxHeight, before.geometricError], `envelope and error of ${chunk.id}`);
    }
    // the raise's designed heights, recomputed independently from the unedited fixture: float32(original + delta * clamp(inside / distance, 0, 1))
    const unedited = (await readLandscapeFileManifest(path.join(root, FIXTURE_0977))).manifest, grid = unedited.grid;
    const owner = replayed.manifest.chunks.find(chunk => chunk.level === grid.maxLevel && chunk.bounds.minX <= 760 && chunk.bounds.maxX >= 840 && chunk.bounds.minZ <= 160 && chunk.bounds.maxZ >= 240);
    const base = await readLandscapeFileChunk(path.join(root, FIXTURE_0977), unedited, owner.id), after = await readLandscapeFileChunk(regenerated, replayed.manifest, owner.id);
    let insideSamples = 0, mismatches = 0;
    for (let row = 0; row < owner.rows; row++) for (let column = 0; column < owner.columns; column++) {
        const x = owner.bounds.minX + column * grid.spacingX, z = owner.bounds.maxZ - row * grid.spacingZ, distance = Math.hypot(x - raiseCircle.center.x, z - raiseCircle.center.z);
        const index = row * owner.columns + column, weight = distance > raiseCircle.radius ? 0 : Math.max(0, Math.min(1, (raiseCircle.radius - distance) / raiseFalloff.distance));
        const designed = weight === 0 ? base.heights[index] : Math.fround(base.heights[index] + raiseDelta * weight);
        if (weight > 0) insideSamples++;
        if (!Object.is(after.heights[index], designed)) mismatches++;
    }
    assert.ok(insideSamples > 1000, `the circle covers native samples (${insideSamples})`);
    assert.equal(mismatches, 0, 'every native sample of the owning chunk equals the designed raise');

    // the regenerated history lists the batches as replayed: same ids, notes, regions and overrides, each operation with its provenance chain
    const history = replayed.manifest;
    assert.deepEqual(history.editHistory.batchIds, [batches.patch.id, batches.raise.id, batches.fine.id]);
    assert.deepEqual(history.regions, edited.manifest.regions);
    assert.deepEqual(history.soil.overrides, edited.manifest.soil.overrides);
    assert.equal(history.operations.length, 5);
    for (const [index, record] of history.operations.entries()) {
        const source = edited.manifest.operations[index];
        const { replayedFrom, ...operation } = record;
        assert.deepEqual(operation, source, `operation ${record.id} is replayed verbatim`);
        assert.deepEqual(replayedFrom, { landscapeId: unedited.id, revision: reverted.revision, manifestSha256: summary.previous.manifestSha256, batchId: source.batchId, sequence: source.sequence });
    }
    assert.equal(history.operations[0].note, 'graded towards the east');

    // replaying again is idempotent: every batch is already recorded
    const again = await replayAcceptedBatches({ previousDirectory: previous, directory: regenerated });
    assert.deepEqual(again.replayed, []);
    assert.deepEqual(again.skipped.map(batch => batch.code), [LANDSCAPE_REPLAY_SKIP_CODES.alreadyRecorded, LANDSCAPE_REPLAY_SKIP_CODES.alreadyRecorded, LANDSCAPE_REPLAY_SKIP_CODES.alreadyRecorded]);
    assert.equal(again.target.revision, summary.target.revision);

    // a second regeneration replays the chain through the CLI: the provenance nests the first replay's record
    const twice = await copyFixture(FIXTURE_0977, 'regenerated-twice');
    const cli = spawnSync(process.execPath, [path.join(root, 'tools/landscape_authoring/run.mjs'), 'replay', '--previous', regenerated, '--directory', twice], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    const chain = JSON.parse(cli.stdout);
    assert.equal(chain.format, 'landscape-edit-replay');
    assert.deepEqual(chain.replayed.map(batch => batch.batchId), [batches.patch.id, batches.raise.id, batches.fine.id]);
    assert.match(cli.stderr, /\[LandscapeReplay\] replayed d4-replay-patch/);
    const nested = (await readLandscapeFileManifest(twice)).manifest.operations[0].replayedFrom;
    assert.equal(nested.landscapeId, unedited.id);
    assert.equal(nested.revision, summary.target.revision);
    assert.deepEqual(nested.replayedFrom, history.operations[0].replayedFrom);
    assert.equal((await heightHashes(twice)).hashes.get('l0/c0/r0'), edited.hashes.get('l0/c0/r0'));
    assert.match(spawnSync(process.execPath, [path.join(root, 'tools/landscape_authoring/run.mjs'), 'replay', '--directory', twice], { cwd: root, encoding: 'utf8' }).stderr, /requires --previous/);
});

test('Batch replay: a batch the regenerated terrain invalidates is skipped with its reason, the rest still replay', { skip, timeout: 180000 }, async () => {
    const previous = await copyFixture(FIXTURE_0977, 'previous-for-skips');
    const { manifest } = await readLandscapeFileManifest(previous), batches = authoredBatches(manifest), store = createLandscapeAuthoringStore({ directory: previous });
    let revision = manifest.revision;
    for (const batch of [batches.patch, batches.raise, batches.fine]) revision = (await store.apply({ ...batch, expectedRevision: revision })).revision;

    // a coarser regenerated grid (1.953125 m): the 1.2 m smooth spans zero native samples there, the 7 m smooth still spans three
    const coarser = await copyFixture(FIXTURE_1953, 'regenerated-1953');
    const summary = await replayAcceptedBatches({ previousDirectory: previous, directory: coarser });
    assert.deepEqual(summary.replayed.map(batch => batch.batchId), [batches.patch.id, batches.raise.id]);
    assert.deepEqual(summary.skipped.map(batch => [batch.batchId, batch.code]), [[batches.fine.id, LANDSCAPE_REPLAY_SKIP_CODES.smoothRadiusInvalid]]);
    assert.match(summary.skipped[0].reason, /smooth radius 1\.2 m spans 0 native samples at 1\.953125 m spacing; 1\.\.8 are valid/);
    const target = (await readLandscapeFileManifest(coarser)).manifest;
    assert.deepEqual(target.editHistory.batchIds, [batches.patch.id, batches.raise.id], 'a skipped batch is not recorded, so a later run can replay it');
    assert.equal(target.id, 'ai596-d3-fixture-1953');
    assert.equal(target.operations[0].replayedFrom.landscapeId, 'ai596-d3-fixture-0977');

    // a regenerated landscape with other bounds: every batch lies outside and is reported, nothing is published
    const small = path.join(work, 'regenerated-small-bounds'), fixture = createLandscapeModelFixture();
    await rm(small, { recursive: true, force: true });
    for (const [relative, bytes] of fixture.resources) { await mkdir(path.dirname(path.join(small, relative)), { recursive: true }); await writeFile(path.join(small, relative), bytes); }
    const outside = await replayAcceptedBatches({ previousDirectory: previous, directory: small });
    assert.deepEqual(outside.replayed, []);
    assert.deepEqual(outside.skipped.map(batch => batch.code), [LANDSCAPE_REPLAY_SKIP_CODES.regionOutsideBounds, LANDSCAPE_REPLAY_SKIP_CODES.regionOutsideBounds, LANDSCAPE_REPLAY_SKIP_CODES.regionOutsideBounds]);
    assert.match(outside.skipped[0].reason, /named region d4-replay-hexagon \[.*\] lies outside the target bounds \[-8\.\.8\] × \[10\.\.26\]/);
    assert.match(outside.skipped[1].reason, /operation d4-replay-raise\/up region \[760\.\.840\] × \[160\.\.240\] lies outside the target bounds/);
    assert.deepEqual(outside.revisions, [fixture.manifest.revision]);
    assert.equal((await readLandscapeFileManifest(small)).manifest.revision, fixture.manifest.revision, 'the target is untouched');
    await assert.rejects(replayAcceptedBatches({ previousDirectory: previous, directory: previous }), /different directories/);
});

test('Batch replay: skip reasons name the invalidating terrain change, and a lost named region is traced to its skipped batch', () => {
    const fixture = createLandscapeModelFixture(), manifest = fixture.manifest, codes = LANDSCAPE_REPLAY_SKIP_CODES;
    const { minX, maxX, minZ, maxZ } = manifest.bounds, circle = { type: 'circle', center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, radius: 4 };
    const previous = { landscapeId: 'former', revision: 'former-r9', manifestSha256: 'f'.repeat(64) };
    const target = { landscapeId: manifest.id, revision: manifest.revision };
    const batch = operations => createReplayBatch({ id: 'replayed', operations, regions: [] }, previous, target);
    const raise = batch([{ id: 'a/raise', type: 'raise', region: circle, falloff: { type: 'none' }, deltaMeters: 1, batchId: 'a', sequence: 0 }]);
    assert.equal(explainReplaySkip(manifest, raise), null);
    assert.deepEqual(raise.operations[0].replayedFrom, { ...previous, batchId: 'a', sequence: 0 });
    assert.equal(raise.landscapeId, manifest.id);
    assert.equal(explainReplaySkip({ ...manifest, editHistory: { batchIds: ['replayed'], lastBatchId: null, previousManifestUrl: null } }, raise).code, codes.alreadyRecorded);
    const far = batch([{ id: 'b/raise', type: 'raise', region: { type: 'circle', center: { x: maxX + 50, z: minZ }, radius: 4 }, falloff: { type: 'none' }, deltaMeters: 1, batchId: 'b', sequence: 0 }]);
    assert.equal(explainReplaySkip(manifest, far).code, codes.regionOutsideBounds);
    const grade = batch([{ id: 'c/grade', type: 'grade', region: circle, falloff: { type: 'none' }, start: { x: minX, z: minZ, heightMeters: 0 }, end: { x: maxX + 1, z: maxZ, heightMeters: 2 }, batchId: 'c', sequence: 0 }]);
    assert.equal(explainReplaySkip(manifest, grade).code, codes.gradeEndpointOutsideBounds);
    const smooth = batch([{ id: 'd/smooth', type: 'smooth', region: circle, falloff: { type: 'none' }, radiusMeters: 1, strength: 1, batchId: 'd', sequence: 0 }]);
    assert.match(explainReplaySkip(manifest, smooth).reason, /spans 0 native samples at 2 m spacing/);
    const soil = batch([{ id: 'e/soil', type: 'assign-soil', region: circle, falloff: { type: 'none' }, soilId: 'lava', batchId: 'e', sequence: 0 }]);
    assert.equal(explainReplaySkip(manifest, soil).code, codes.unknownSoil);
    const named = batch([{ id: 'f/raise', type: 'raise', regionId: 'lost-region', region: circle, falloff: { type: 'none' }, deltaMeters: 1, batchId: 'f', sequence: 0 }]);
    const lost = explainReplaySkip(manifest, named, new Map([['lost-region', 'earlier-batch']]));
    assert.equal(lost.code, codes.regionUnavailable);
    assert.match(lost.reason, /skipped batch earlier-batch would have introduced/);
    // a named reference replays as the reference when the region is known with the same geometry; other geometry keeps the inline copy so validation reports the conflict
    const region = { id: 'patch', name: 'patch', region: circle }, record = { id: 'h/raise', type: 'raise', regionId: 'patch', region: circle, falloff: { type: 'none' }, deltaMeters: 1, batchId: 'h', sequence: 0 };
    assert.equal(createReplayBatch({ id: 'h', operations: [record], regions: [region] }, previous, target).operations[0].region, undefined);
    assert.equal(createReplayBatch({ id: 'h', operations: [record], regions: [] }, previous, { ...target, regions: [region] }).operations[0].region, undefined);
    const other = { ...target, regions: [{ ...region, region: { ...circle, radius: 5 } }] }, conflicting = createReplayBatch({ id: 'h', operations: [record], regions: [] }, previous, other);
    assert.deepEqual(conflicting.operations[0].region, circle);
    assert.match(explainReplaySkip({ ...manifest, regions: other.regions }, conflicting).reason, /region differs from named region patch/);
    const stale = batch([{ id: 'g/raise', type: 'raise', region: circle, falloff: { type: 'none' }, deltaMeters: 1, batchId: 'g', sequence: 0 }]);
    assert.equal(explainReplaySkip(manifest, { ...stale, expectedRevision: 'other' }).code, codes.invalid);
    assert.throws(() => collectAcceptedLandscapeBatches({ ...manifest, editHistory: { batchIds: [] }, operations: [{ id: 'x', batchId: 'ghost', sequence: 0 }] }), /history does not record/);
});
