// Validates authored poses and immutable baseline inputs without starting a renderer.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { sanitizeGameplayPose } from '../../../../src/app/gameplay/GameplayPose.js';
import { digest, hashFile, listFiles } from '../../../baking/Files.mjs';

export const EXPERIMENT = 'lighting/experiments/configurations';
export const TOOL = 'tools/bake_lighting/experiments/lighting_configurations';
export const ARTIFACTS = 'tests/artifacts/screens/illumination_560';
export const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

export function resolvePoses(input) {
    if (input.schemaVersion !== 1 || input.city !== 'bigcity2' || !Array.isArray(input.cameras)) throw new Error('Expected version 1 BigCity2 camera configuration');
    const ids = new Set();
    const poses = input.cameras.map(({id, busId, camera}, index) => {
        if (id !== `pose_0${index + 1}` || ids.has(id)) throw new Error('Invalid or duplicate camera ID');
        ids.add(id);
        if (!Object.hasOwn(input.buses, busId)) throw new Error(`Unknown bus placement ${busId}`);
        const pose = sanitizeGameplayPose({version:1,city:input.city,bus:input.buses[busId],camera,
            simulation:{paused:true},hud:{visible:false}});
        if (!pose?.bus?.transform || pose.bus.modelId !== 'city' || !pose.camera?.position
            || !pose.camera.quaternion || !pose.camera.locked || !pose.camera.fovDeg) throw new Error(`Incomplete exact pose ${id}`);
        return {id,busId,pose};
    });
    if (poses.length !== 5 || new Set(poses.map(p=>p.busId)).size !== 4
        || poses[0].busId !== poses[1].busId) throw new Error('Expected five views and four bus placements, with views 01/02 sharing one bus');
    return poses;
}

export function assertAppliedBaseline(record, expectedSunProfile) {
    if (record.baked.status.effectiveMode !== 'baked' || record.baked.status.phase !== 'committed'
        || record.baked.receiverLightmaps.effective.indirect !== true || record.baked.receiverLightmaps.activationBlend !== 1
        || record.shadow.effectiveMode !== 'baked' || record.shadow.state !== 'active'
        || record.shadow.profileId !== expectedSunProfile || record.baked.busLighting.transitionState) {
        throw new Error(`G00 requires applied shadows and indirect: ${JSON.stringify({world:record.baked.status,shadow:record.shadow,indirect:record.baked.receiverLightmaps.state})}`);
    }
}

export function assertPoseMatches(expected, actual) {
    if (actual?.city !== expected.city || actual?.bus?.modelId !== expected.bus.modelId
        || actual.camera?.locked !== true || actual.simulation?.paused !== true) throw new Error('Pose city, bus, camera lock or pause state changed');
    const compare = (a,b,label) => {
        for (const key of Object.keys(a)) if (!Number.isFinite(b?.[key]) || Math.abs(a[key]-b[key]) > 1e-7) throw new Error(`Pose drift: ${label}.${key}`);
    };
    compare(expected.bus.transform.position,actual.bus.transform?.position,'bus.position');
    compare(expected.bus.transform.quaternion,actual.bus.transform?.quaternion,'bus.quaternion');
    compare(expected.camera.position,actual.camera.position,'camera.position');
    compare(expected.camera.quaternion,actual.camera.quaternion,'camera.quaternion');
    if (expected.camera.fovDeg !== actual.camera.fovDeg) throw new Error('Camera vertical FOV changed');
}

export async function snapshotFiles(root, files) {
    const results=[];
    for (const file of [...new Set(files)].sort()) results.push({file:path.relative(root,file).replaceAll('\\','/'),...await hashFile(file)});
    return results;
}

export async function verifyFiles(root, entries) {
    for (const entry of entries) {
        const current=await hashFile(path.resolve(root,entry.file));
        if (current.sha256 !== entry.sha256 || current.bytes !== entry.bytes) throw new Error(`Input changed: ${entry.file}`);
    }
}

export async function baselineInputs(root, config) {
    const shadowIndex='assets/baked_lighting/shadows/package_index.json';
    const receiverIndex='assets/baked_lighting/receivers/enhanced/package_index.json';
    const shadow=await readJson(path.join(root,shadowIndex));
    const receivers=await readJson(path.join(root,receiverIndex));
    const selected=shadow.profiles[config.expectedSunProfile];
    if (!selected?.packagePath || !receivers.channels?.indirect_irradiance?.url) throw new Error('Installed baseline packages are unavailable');
    const packagePaths=[shadowIndex,receiverIndex,selected.packagePath,
        path.posix.join(path.posix.dirname(receiverIndex),receivers.channels.indirect_irradiance.url),
        'src/app/city/visibility/bakes/bigcity2.v1.json'];
    for (const file of packagePaths) if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error(`Invalid installed package path ${file}`);
    const files=await snapshotFiles(root,packagePaths.map(file=>path.join(root,file)));
    return {files,identity:digest(files),shadow:selected.liveIdentity,
        indirect:{sourceHash:receivers.sourceHash,profileId:receivers.profileId,channel:receivers.channels.indirect_irradiance}};
}

export async function sourceFiles(root) {
    return [path.join(root,'index.html'),...await listFiles(path.join(root,'src'))]
        .filter(file=>/\.(html|js|json|glsl)$/.test(file));
}
