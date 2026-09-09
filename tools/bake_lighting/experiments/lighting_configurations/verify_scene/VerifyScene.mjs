// Reopen the saved project and evaluate the actual camera/bus transforms in every view layer.
import path from 'node:path';
import { authenticated, cache, receipt, codeIdentity, resultFiles } from '../StageInputs.mjs';
import { readJson, TOOL } from '../Inputs.mjs';
import { digest } from '../../../../baking/Files.mjs';
import { runHeadlessBake } from '../../../../baking/Blender.mjs';

export async function verifyScene(ctx,run) {
    const scenePath=(await readJson(path.join(run.runRoot,'scene.json'))).manifest;
    const scene=await authenticated(scenePath);
    if(scene.source!==run.source.sha256)throw new Error('Scene verification source mismatch');
    const key=digest({scene:scene.key,code:await codeIdentity(ctx.root,['verify_scene/VerifyScene.mjs','verify_scene/verify_scene.py'])});
    const file=path.join(run.runRoot,'scene_verification.json');
    const saved=await cache(file,key);
    if(saved)return resultFiles(saved,file);
    const output=path.join(run.runRoot,'pose_validation.json');
    await runHeadlessBake(ctx,`${TOOL}/verify_scene/verify_scene.py`,[scenePath,output]);
    const evidence=await readJson(output);
    return resultFiles(await receipt(file,key,{...evidence,source:run.source.sha256},[output]),file);
}
