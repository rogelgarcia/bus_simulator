// Guards the authored experiment inputs and capture acceptance boundary without WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { REPO_ROOT, CONFIG_PATH, loadBakeConfiguration } from '../../../tools/baking/Configuration.mjs';
import { bakeJobs } from '../../../tools/baking/registry.mjs';
import { planBakes } from '../../../tools/baking/Graph.mjs';
import { EXPERIMENT, TOOL, readJson, resolvePoses, assertAppliedBaseline, assertPoseMatches,
    snapshotFiles, verifyFiles } from '../../../tools/bake_lighting/experiments/lighting_configurations/Inputs.mjs';

const authored = await readJson(path.join(REPO_ROOT, TOOL, 'config/poses.json'));
const original = await readJson(path.join(REPO_ROOT, TOOL, 'config/source_poses.json'));
const baseline = await readJson(path.join(REPO_ROOT, TOOL, 'config/baseline.json'));
const resolved = resolvePoses(authored);
const temporary = async () => {
    const root = path.join(REPO_ROOT, 'tests/artifacts/node/lighting_experiment_baseline');
    await mkdir(root, { recursive: true });
    return mkdtemp(path.join(root, 'fixture-'));
};

test('Five original cameras retain exact authored values and views 01/02 share one bus', () => {
    assert.equal(resolved.length, 5);
    assert.equal(new Set(resolved.map(item => item.busId)).size, 4);
    assert.deepEqual(resolved[0].pose.bus, resolved[1].pose.bus);
    for (let i = 0; i < 5; i++) {
        assert.deepEqual(authored.cameras[i].camera, original.poses[i].pose.camera);
        assertPoseMatches(resolved[i].pose, structuredClone(resolved[i].pose));
        if (i >= 2) assert.deepEqual(authored.buses[resolved[i].busId], original.poses[i].pose.bus);
    }
    assert.equal(resolved[0].pose.bus.transform.position.x, original.poses[0].pose.bus.transform.position.x + 1);
    const changed = structuredClone(authored);
    changed.cameras[1].busId = 'missing';
    assert.throws(() => resolvePoses(changed), /Unknown bus/);
    changed.cameras[1].busId = changed.cameras[0].busId;
    changed.cameras[1].id = changed.cameras[0].id;
    assert.throws(() => resolvePoses(changed), /camera ID/);
});

test('Captures reject fallback, transitions, missing activation data and pose drift', () => {
    const valid = { baked: { status: {effectiveMode:'baked',phase:'committed'},
        receiverLightmaps: {effective:{indirect:true},activationBlend:1},busLighting:{} },
        shadow:{effectiveMode:'baked',state:'active',profileId:baseline.expectedSunProfile} };
    assertAppliedBaseline(valid, baseline.expectedSunProfile);
    for (const mutate of [r => r.baked.status.effectiveMode = 'current',
        r => r.baked.receiverLightmaps.effective.indirect = false,
        r => delete r.baked.receiverLightmaps.activationBlend,
        r => r.baked.busLighting.transitionState = 'preparing',
        r => r.shadow.profileId = 'different']) {
        const changed = structuredClone(valid); mutate(changed);
        assert.throws(() => assertAppliedBaseline(changed, baseline.expectedSunProfile), /requires applied/);
    }
    for (const mutate of [p => p.camera.position.x += .01, p => delete p.camera.quaternion.w,
        p => p.bus.transform.position.y = NaN, p => p.camera.fovDeg = 60, p => p.city = 'bigcity']) {
        const changed = structuredClone(resolved[0].pose); mutate(changed);
        assert.throws(() => assertPoseMatches(resolved[0].pose, changed));
    }
});

test('Asset identity checking detects changed and missing baseline inputs', async () => {
    const root = await temporary(), file = path.join(root, 'bake.fixture');
    await writeFile(file, 'installed bake');
    const snapshot = await snapshotFiles(root, [file]);
    await verifyFiles(root, snapshot);
    await writeFile(file, 'modified bake');
    await assert.rejects(verifyFiles(root, snapshot), /Input changed/);
    await assert.rejects(snapshotFiles(root, [path.join(root, 'missing')]), /ENOENT/);
});

test('Baseline is explicit, never runs in production and requires only the shared browser path', async () => {
    const baselinePlan=planBakes(bakeJobs, `${EXPERIMENT}/capture-baselines`);
    assert.deepEqual(baselinePlan.map(job => job.id),
        [`${EXPERIMENT}/prepare`, `${EXPERIMENT}/capture-baselines`]);
    assert.ok(!planBakes(bakeJobs, 'all').some(job => job.id.startsWith(EXPERIMENT)));
    assert.ok(baselinePlan.every(job => !job.blender));
    const root = await temporary(), file = path.join(root, CONFIG_PATH);
    const options = {requiredPaths:['browserExecutable'],checkedPaths:['browserExecutable']};
    await assert.rejects(loadBakeConfiguration(root, options), /Created.*browserExecutable/);
    await assert.rejects(loadBakeConfiguration(root, options), /configure browserExecutable/);
    await writeFile(file, JSON.stringify({browserExecutable:process.execPath,executable:'missing-blender'}));
    assert.equal((await loadBakeConfiguration(root, options)).browserExecutable, process.execPath);
    await assert.rejects(loadBakeConfiguration(root), /executable does not name an existing file/);
});
